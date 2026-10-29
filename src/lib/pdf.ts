import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfImportResult {
  pageCount: number;
  paragraphs: string[];
  characterCount: number;
}

export interface ExtractProgress {
  current: number;
  total: number;
}

export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

interface TextLine {
  text: string;
  x: number;
  y: number;
  height: number;
}

export class PdfImportError extends Error {
  constructor(
    public readonly code: 'not-pdf' | 'scanned' | 'password' | 'invalid' | 'unknown',
    message: string
  ) {
    super(message);
    this.name = 'PdfImportError';
  }
}

function isCjk(character: string) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character);
}

function needsSpaceBetween(left: string, right: string, gap: number, textHeight: number) {
  if (!left || !right || /\s$/u.test(left) || /^\s/u.test(right)) {
    return false;
  }

  const leftCharacter = Array.from(left).at(-1) ?? '';
  const rightCharacter = Array.from(right)[0] ?? '';

  if (isCjk(leftCharacter) || isCjk(rightCharacter)) {
    return false;
  }

  return gap > Math.max(1.5, textHeight * 0.18);
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function buildLines(items: TextItemLike[]): TextLine[] {
  const lines: TextLine[] = [];
  let current: TextLine | undefined;
  let previousRight = 0;

  const flush = () => {
    if (current?.text.trim()) {
      lines.push({ ...current, text: current.text.trim() });
    }
    current = undefined;
    previousRight = 0;
  };

  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL) {
        flush();
      }
      continue;
    }

    const x = Number(item.transform[4] ?? 0);
    const y = Number(item.transform[5] ?? 0);
    const height = Math.max(Number(item.height) || 0, Math.abs(Number(item.transform[3] ?? 0)), 1);
    const sameLine = current && Math.abs(current.y - y) <= Math.max(2, Math.min(current.height, height) * 0.42);

    if (!sameLine) {
      flush();
      current = { text: item.str, x, y, height };
    } else if (current) {
      const gap = x - previousRight;
      current.text += `${needsSpaceBetween(current.text, item.str, gap, height) ? ' ' : ''}${item.str}`;
      current.height = Math.max(current.height, height);
    }

    previousRight = x + (Number(item.width) || 0);

    if (item.hasEOL) {
      flush();
    }
  }

  flush();
  return lines;
}

function joinWrappedLines(left: string, right: string) {
  if (!left || !right || /\s$/u.test(left) || /^\s/u.test(right)) {
    return left + right;
  }

  const leftCharacter = Array.from(left).at(-1) ?? '';
  const rightCharacter = Array.from(right)[0] ?? '';
  const latinOrNumber = /[\p{Letter}\p{Number}]/u;

  if (!isCjk(leftCharacter) && !isCjk(rightCharacter) && latinOrNumber.test(leftCharacter) && latinOrNumber.test(rightCharacter)) {
    return `${left} ${right}`;
  }

  return left + right;
}

function linesToParagraphs(lines: TextLine[]): string[] {
  if (lines.length === 0) {
    return [];
  }

  const gaps = lines.slice(1).map((line, index) => Math.abs((lines[index]?.y ?? line.y) - line.y)).filter(Boolean);
  const typicalGap = median(gaps.filter((gap) => gap < median(gaps) * 2.25 || gaps.length < 3));
  const baseLeft = Math.min(...lines.map((line) => line.x));
  const paragraphs: string[] = [];
  let paragraph = lines[0]?.text ?? '';

  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (!previous || !current) {
      continue;
    }

    const verticalGap = Math.abs(previous.y - current.y);
    const largeGap = typicalGap > 0 && verticalGap > typicalGap * 1.55;
    const indented = current.x - baseLeft > Math.max(8, current.height * 0.72);
    const previousIndented = previous.x - baseLeft > Math.max(8, previous.height * 0.72);

    if (largeGap || (indented && !previousIndented)) {
      if (paragraph.trim()) {
        paragraphs.push(paragraph.trim());
      }
      paragraph = current.text;
    } else {
      paragraph = joinWrappedLines(paragraph, current.text);
    }
  }

  if (paragraph.trim()) {
    paragraphs.push(paragraph.trim());
  }

  return paragraphs;
}

export function textItemsToParagraphs(items: TextItemLike[]): string[] {
  return linesToParagraphs(buildLines(items));
}

export function isPdfFile(file: Pick<File, 'name' | 'type'>) {
  return file.type === 'application/pdf' || file.name.toLocaleLowerCase().endsWith('.pdf');
}

export async function extractPdfText(
  file: File,
  onProgress?: (progress: ExtractProgress) => void
): Promise<PdfImportResult> {
  if (!isPdfFile(file)) {
    throw new PdfImportError('not-pdf', '請選擇 PDF 檔案。');
  }

  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    loadingTask = pdfjs.getDocument({ data });
    const document = await loadingTask.promise;
    const paragraphs: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & TextItemLike => 'str' in item);
      paragraphs.push(...textItemsToParagraphs(items));
      page.cleanup();
      onProgress?.({ current: pageNumber, total: document.numPages });
    }

    const characterCount = paragraphs.join('').replace(/\s/gu, '').length;
    if (characterCount === 0) {
      throw new PdfImportError(
        'scanned',
        '未能從這份 PDF 提取文字。它可能是掃描版；粵讀第一版暫不支援 OCR。'
      );
    }

    return {
      pageCount: document.numPages,
      paragraphs,
      characterCount
    };
  } catch (error) {
    if (error instanceof PdfImportError) {
      throw error;
    }

    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      throw new PdfImportError('password', '這份 PDF 受密碼保護，暫時未能匯入。');
    }
    if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
      throw new PdfImportError('invalid', '這個檔案不是有效的 PDF。');
    }

    throw new PdfImportError('unknown', '匯入 PDF 時發生問題，請再試一次。');
  } finally {
    await loadingTask?.destroy();
  }
}
