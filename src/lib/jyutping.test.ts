import { describe, expect, it } from 'vitest';
import { annotateParagraph } from './jyutping';

describe('Jyutping annotation', () => {
  it('uses Hong Kong Jyutping and keeps the original text unchanged', () => {
    const tokens = annotateParagraph('香港粵讀。');

    expect(tokens.map(([text]) => text).join('')).toBe('香港粵讀。');
    expect(tokens.slice(0, 2)).toEqual([
      ['香', 'hoeng1'],
      ['港', 'gong2']
    ]);
    expect(tokens.at(-1)).toEqual(['。', null]);
  });
});
