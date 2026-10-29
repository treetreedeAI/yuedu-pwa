import { describe, expect, it } from 'vitest';
import { isPdfFile, textItemsToParagraphs, type TextItemLike } from './pdf';

function item(
  str: string,
  x: number,
  y: number,
  options: Partial<Pick<TextItemLike, 'width' | 'height' | 'hasEOL'>> = {}
): TextItemLike {
  return {
    str,
    transform: [1, 0, 0, 12, x, y],
    width: options.width ?? str.length * 12,
    height: options.height ?? 12,
    hasEOL: options.hasEOL ?? false
  };
}

describe('PDF text reflow', () => {
  it('keeps Chinese characters and punctuation without invented spaces', () => {
    const paragraphs = textItemsToParagraphs([
      item('香', 72, 700, { width: 12 }),
      item('港。', 84, 700, { hasEOL: true, width: 24 })
    ]);

    expect(paragraphs).toEqual(['香港。']);
  });

  it('joins wrapped Chinese lines into one reflowable paragraph', () => {
    const paragraphs = textItemsToParagraphs([
      item('香港', 72, 700, { hasEOL: true }),
      item('人', 72, 680, { hasEOL: true })
    ]);

    expect(paragraphs).toEqual(['香港人']);
  });

  it('adds a natural space when Latin text continues on the next line', () => {
    const paragraphs = textItemsToParagraphs([
      item('Hello', 72, 700, { hasEOL: true }),
      item('Hong Kong', 72, 680, { hasEOL: true })
    ]);

    expect(paragraphs).toEqual(['Hello Hong Kong']);
  });

  it('uses first-line indentation as a paragraph boundary', () => {
    const paragraphs = textItemsToParagraphs([
      item('第一段。', 72, 700, { hasEOL: true }),
      item('第二段', 92, 680, { hasEOL: true }),
      item('繼續。', 72, 660, { hasEOL: true })
    ]);

    expect(paragraphs).toEqual(['第一段。', '第二段繼續。']);
  });
});

describe('PDF file detection', () => {
  it('accepts the MIME type or a PDF extension', () => {
    expect(isPdfFile({ name: 'article.bin', type: 'application/pdf' })).toBe(true);
    expect(isPdfFile({ name: 'article.PDF', type: '' })).toBe(true);
    expect(isPdfFile({ name: 'article.txt', type: 'text/plain' })).toBe(false);
  });
});
