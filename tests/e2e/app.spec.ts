import { expect, test } from '@playwright/test';

function makeUnicodePdf(text: string): Buffer {
  const characters = [...new Set(Array.from(text))];
  if (characters.length > 220) {
    throw new Error('PDF fixture supports at most 220 unique characters.');
  }

  const codeByCharacter = new Map(
    characters.map((character, index) => [character, 0x21 + index])
  );
  const utf16BeHex = (character: string) => Array.from(
    { length: character.length },
    (_, index) => character.charCodeAt(index).toString(16).padStart(4, '0')
  ).join('').toUpperCase();
  const encodedLines: string[] = [];
  const textCharacters = Array.from(text);
  for (let index = 0; index < textCharacters.length; index += 55) {
    encodedLines.push(
      textCharacters.slice(index, index + 55)
        .map((character) => codeByCharacter.get(character)!.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }
  const mappings = characters.map((character) => {
    const source = codeByCharacter.get(character)!.toString(16).padStart(2, '0').toUpperCase();
    return `<${source}> <${utf16BeHex(character)}>`;
  }).join('\n');
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /FixtureToUnicode def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
${characters.length} beginbfchar
${mappings}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  const pageContents = `BT
/F1 18 Tf
22 TL
48 748 Td
${encodedLines.map((line, index) => `<${line}> Tj${index < encodedLines.length - 1 ? '\nT*' : ''}`).join('\n')}
ET`;
  const stream = (contents: string) => `<< /Length ${Buffer.byteLength(contents, 'ascii')} >>
stream
${contents}
endstream`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Resources << /Font << /F1 5 0 R >> >>
/Contents 4 0 R
>>`,
    stream(pageContents),
    `<< /Type /Font
/Subtype /Type1
/BaseFont /Helvetica
/Encoding /WinAnsiEncoding
/ToUnicode 6 0 R
>>`,
    stream(cmap)
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `).join('\n')}
trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;

  return Buffer.from(pdf, 'ascii');
}

test('imports a Chinese PDF, renders ruby, looks up selections, and persists locally', async ({ page, context }) => {
  await page.goto('/#/');

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toHaveAttribute('accept', 'application/pdf,.pdf');
  await fileInput.setInputFiles({
    name: '香港粵讀.pdf',
    mimeType: 'application/pdf',
    buffer: makeUnicodePdf('香港粵讀。'.repeat(320))
  });

  await expect(page.getByRole('heading', { name: '香港粵讀', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('ruby').first()).toContainText('香');
  await expect(page.locator('ruby rt').first()).toHaveText('hoeng1');

  const layout = await page.locator('.reader-body').evaluate((body) => {
    const rubies = Array.from(body.querySelectorAll('ruby')).slice(0, 12);
    const aligned = rubies.every((ruby) => {
      const base = ruby.querySelector('span')?.getBoundingClientRect();
      const rt = ruby.querySelector('rt')?.getBoundingClientRect();
      return Boolean(base && rt && Math.abs((base.left + base.width / 2) - (rt.left + rt.width / 2)) < 3);
    });
    const readings = rubies.map((ruby) => ruby.querySelector('rt')!.getBoundingClientRect());
    const noReadingOverlap = readings.slice(1).every((reading, index) => {
      const previous = readings[index]!;
      return Math.abs(previous.top - reading.top) > 2 || previous.right < reading.left;
    });
    return {
      aligned,
      noReadingOverlap,
      fitsWidth: body.scrollWidth <= body.clientWidth + 1
    };
  });
  expect(layout).toEqual({ aligned: true, noReadingOverlap: true, fitsWidth: true });

  await page.locator('[data-reader-char="香"]').first().click();
  const singleCharacterLookup = page.getByRole('link', { name: /查粵典/ });
  await expect(singleCharacterLookup).toHaveAttribute(
    'href',
    'https://words.hk/zidin/%E9%A6%99'
  );
  await context.route('https://words.hk/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<title>粵典測試</title>'
  }));
  const popupPromise = page.waitForEvent('popup');
  await singleCharacterLookup.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://words.hk/zidin/%E9%A6%99');
  await popup.close();

  await page.evaluate(() => {
    const tokens = document.querySelectorAll<HTMLElement>('[data-reader-char]');
    const range = document.createRange();
    range.setStartBefore(tokens[0]!);
    range.setEndAfter(tokens[1]!);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(page.getByRole('link', { name: /查粵典/ })).toHaveAttribute(
    'href',
    'https://words.hk/zidin/%E9%A6%99%E6%B8%AF'
  );

  await page.evaluate(() => {
    document.getSelection()?.removeAllRanges();
  });
  const scrollMetrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.getBoundingClientRect().height,
    articleHeight: document.querySelector('.reader-article')?.getBoundingClientRect().height,
    paragraphHeight: document.querySelector('.reader-body p')?.getBoundingClientRect().height,
    paragraphWidth: document.querySelector('.reader-body p')?.getBoundingClientRect().width,
    firstRuby: document.querySelector('ruby')?.getBoundingClientRect().toJSON(),
    lastRuby: Array.from(document.querySelectorAll('ruby')).at(-1)?.getBoundingClientRect().toJSON()
  }));
  expect(
    scrollMetrics.documentHeight - scrollMetrics.innerHeight,
    JSON.stringify(scrollMetrics)
  ).toBeGreaterThan(700);
  // Let the reader's two-frame position restoration finish before simulating a user scroll.
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await page.waitForTimeout(500);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '香港粵讀', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(450);
  await context.setOffline(false);

  await page.getByRole('button', { name: '書架' }).click();
  await expect(page.getByRole('button', { name: /香港粵讀/ }).first()).toBeVisible();
  await page.reload();
  const storedArticle = page.getByRole('button', { name: /香港粵讀/ }).first();
  await expect(storedArticle).toBeVisible();
  await storedArticle.click();
  await expect(page.getByRole('heading', { name: '香港粵讀', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(450);
  await page.getByRole('button', { name: '書架' }).click();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '刪除《香港粵讀》' }).click();
  await expect(page.getByRole('heading', { name: '書架仍是空的' })).toBeVisible();
});
