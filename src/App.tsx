import { useCallback, useEffect, useState } from 'react';
import ImportOverlay from './components/ImportOverlay';
import LibraryPage from './components/LibraryPage';
import ReaderPage from './components/ReaderPage';
import {
  deleteArticle,
  listArticles,
  requestPersistentStorage,
  saveArticle
} from './lib/db';
import type { Article, ArticleMeta, ImportProgress } from './types';

type Route = { screen: 'library' } | { screen: 'reader'; articleId: string };

function parseRoute(): Route {
  const match = window.location.hash.match(/^#\/read\/(.+)$/);
  if (match?.[1]) {
    try {
      return { screen: 'reader', articleId: decodeURIComponent(match[1]) };
    } catch {
      return { screen: 'library' };
    }
  }
  return { screen: 'library' };
}

function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function titleFromFile(fileName: string) {
  return fileName.replace(/\.pdf$/iu, '').trim() || '未命名文章';
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  const refreshArticles = useCallback(async () => {
    setArticles(await listArticles());
  }, []);

  useEffect(() => {
    if (!window.location.hash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    }

    const handleHashChange = () => {
      setRoute(parseRoute());
    };

    window.addEventListener('hashchange', handleHashChange);
    void refreshArticles().catch(() => setError('未能讀取這部裝置上的書架。'));
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [refreshArticles]);

  const openArticle = (articleId: string) => {
    window.location.hash = `#/read/${encodeURIComponent(articleId)}`;
  };

  const openLibrary = () => {
    window.location.hash = '#/';
  };

  const importPdf = async (file: File) => {
    setError(null);
    setImportProgress({ phase: 'reading', current: 0, total: 0 });

    try {
      const [{ extractPdfText }, { annotateParagraphs }] = await Promise.all([
        import('./lib/pdf'),
        import('./lib/jyutping')
      ]);
      const extracted = await extractPdfText(file, ({ current, total }) => {
        setImportProgress({ phase: 'extracting', current, total });
      });

      setImportProgress({ phase: 'annotating', current: 0, total: extracted.paragraphs.length });
      const paragraphs = await annotateParagraphs(extracted.paragraphs, (current, total) => {
        setImportProgress({ phase: 'annotating', current, total });
      });

      setImportProgress({ phase: 'saving', current: 1, total: 1 });
      const now = Date.now();
      const article: Article = {
        id: createId(),
        title: titleFromFile(file.name),
        fileName: file.name,
        importedAt: now,
        lastOpenedAt: now,
        scrollY: 0,
        pageCount: extracted.pageCount,
        characterCount: extracted.characterCount,
        paragraphs
      };

      await saveArticle(article);
      void requestPersistentStorage();
      await refreshArticles();
      openArticle(article.id);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.name === 'PdfImportError'
          ? caught.message
          : '匯入 PDF 時發生問題，請再試一次。'
      );
    } finally {
      setImportProgress(null);
    }
  };

  const removeArticle = async (article: ArticleMeta) => {
    if (!window.confirm(`要從這部裝置刪除《${article.title}》嗎？`)) {
      return;
    }

    try {
      await deleteArticle(article.id);
      await refreshArticles();
    } catch {
      setError('未能刪除這篇文章，請再試一次。');
    }
  };

  return (
    <>
      <div inert={importProgress ? true : undefined} aria-hidden={importProgress ? true : undefined}>
        {route.screen === 'reader' ? (
          <ReaderPage
            key={route.articleId}
            articleId={route.articleId}
            onBack={openLibrary}
            onOpened={refreshArticles}
          />
        ) : (
          <LibraryPage
            articles={articles}
            error={error}
            onDismissError={() => setError(null)}
            onImport={importPdf}
            onOpen={openArticle}
            onDelete={removeArticle}
          />
        )}
      </div>

      {importProgress ? <ImportOverlay progress={importProgress} /> : null}
    </>
  );
}
