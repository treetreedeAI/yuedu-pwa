export type RubyToken = readonly [text: string, jyutping: string | null];

export interface ArticleMeta {
  id: string;
  title: string;
  fileName: string;
  importedAt: number;
  lastOpenedAt: number;
  scrollY: number;
  pageCount: number;
  characterCount: number;
}

export interface ArticleContent {
  id: string;
  paragraphs: RubyToken[][];
}

export interface Article extends ArticleMeta, ArticleContent {}

export type ImportPhase = 'reading' | 'extracting' | 'annotating' | 'saving';

export interface ImportProgress {
  phase: ImportPhase;
  current: number;
  total: number;
}
