import { getJyutpingList } from 'to-jyutping';
import type { RubyToken } from '../types';

function expandPair(text: string, reading: string | null): RubyToken[] {
  const characters = Array.from(text);

  if (characters.length <= 1) {
    return [[text, reading || null]];
  }

  const readings = reading?.trim().split(/\s+/) ?? [];
  return characters.map((character, index) => [character, readings[index] || null]);
}

export function annotateParagraph(text: string): RubyToken[] {
  return getJyutpingList(text).flatMap(([surface, reading]) => expandPair(surface, reading));
}

export async function annotateParagraphs(
  paragraphs: string[],
  onProgress?: (current: number, total: number) => void
): Promise<RubyToken[][]> {
  const annotated: RubyToken[][] = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    annotated.push(annotateParagraph(paragraphs[index] ?? ''));
    onProgress?.(index + 1, paragraphs.length);

    // Large books should not freeze the import screen for the whole conversion.
    if ((index + 1) % 12 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return annotated;
}
