import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Article, ArticleContent, ArticleMeta } from '../types';

interface YueduDatabase extends DBSchema {
  articles: {
    key: string;
    value: ArticleMeta;
    indexes: {
      'by-last-opened': number;
    };
  };
  contents: {
    key: string;
    value: ArticleContent;
  };
}

const DATABASE_NAME = 'yuedu-reader';
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBPDatabase<YueduDatabase>> | undefined;

function getDatabase() {
  databasePromise ??= openDB<YueduDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      const articles = database.createObjectStore('articles', { keyPath: 'id' });
      articles.createIndex('by-last-opened', 'lastOpenedAt');
      database.createObjectStore('contents', { keyPath: 'id' });
    }
  });

  return databasePromise;
}

export async function listArticles(): Promise<ArticleMeta[]> {
  const database = await getDatabase();
  const articles = await database.getAll('articles');

  return articles.sort((left, right) => {
    const leftDate = left.lastOpenedAt || left.importedAt;
    const rightDate = right.lastOpenedAt || right.importedAt;
    return rightDate - leftDate;
  });
}

export async function getArticle(id: string): Promise<Article | undefined> {
  const database = await getDatabase();
  const transaction = database.transaction(['articles', 'contents'], 'readonly');
  const [meta, content] = await Promise.all([
    transaction.objectStore('articles').get(id),
    transaction.objectStore('contents').get(id)
  ]);
  await transaction.done;

  if (!meta || !content) {
    return undefined;
  }

  return { ...meta, ...content };
}

export async function saveArticle(article: Article): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(['articles', 'contents'], 'readwrite');
  const {
    id,
    title,
    fileName,
    importedAt,
    lastOpenedAt,
    scrollY,
    pageCount,
    characterCount,
    paragraphs
  } = article;

  await Promise.all([
    transaction.objectStore('articles').put({
      id,
      title,
      fileName,
      importedAt,
      lastOpenedAt,
      scrollY,
      pageCount,
      characterCount
    }),
    transaction.objectStore('contents').put({ id, paragraphs })
  ]);
  await transaction.done;
}

export async function updateReadingPosition(id: string, scrollY: number): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction('articles', 'readwrite');
  const article = await transaction.store.get(id);

  if (article) {
    article.scrollY = Math.max(0, Math.round(scrollY));
    await transaction.store.put(article);
  }

  await transaction.done;
}

export async function markArticleOpened(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction('articles', 'readwrite');
  const article = await transaction.store.get(id);

  if (article) {
    article.lastOpenedAt = Date.now();
    await transaction.store.put(article);
  }

  await transaction.done;
}

export async function deleteArticle(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(['articles', 'contents'], 'readwrite');
  await Promise.all([
    transaction.objectStore('articles').delete(id),
    transaction.objectStore('contents').delete(id)
  ]);
  await transaction.done;
}

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  try {
    return await navigator.storage?.persist?.();
  } catch {
    return undefined;
  }
}
