import { useLayoutEffect, useRef, type ChangeEvent } from 'react';
import type { ArticleMeta } from '../types';

interface LibraryPageProps {
  articles: ArticleMeta[];
  error: string | null;
  onDismissError: () => void;
  onImport: (file: File) => void;
  onOpen: (id: string) => void;
  onDelete: (article: ArticleMeta) => void;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'short',
    day: 'numeric',
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  }).format(timestamp);
}

export default function LibraryPage({
  articles,
  error,
  onDismissError,
  onImport,
  onOpen,
  onDelete
}: LibraryPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) {
      onImport(file);
    }
  };

  return (
    <main className="library-page">
      <div className="library-shell">
        <header className="library-header">
          <h1>粵讀</h1>
          <input
            ref={inputRef}
            className="visually-hidden-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            aria-label="選擇 PDF 檔案"
          />
          <button className="import-button" type="button" onClick={() => inputRef.current?.click()}>
            <span aria-hidden="true">＋</span>
            匯入 PDF
          </button>
        </header>

        {error ? (
          <div className="error-message" role="alert">
            <p>{error}</p>
            <button type="button" onClick={onDismissError} aria-label="關閉提示">
              關閉
            </button>
          </div>
        ) : null}

        {articles.length === 0 ? (
          <section className="empty-library" aria-labelledby="empty-title">
            <div className="empty-book-mark" aria-hidden="true">粵</div>
            <h2 id="empty-title">書架仍是空的</h2>
            <p>匯入文字型 PDF，文章和閱讀位置只會儲存在這部裝置。</p>
          </section>
        ) : (
          <section aria-label="PDF 文章">
            <ul className="article-list">
              {articles.map((article) => (
                <li className="article-row" key={article.id}>
                  <button className="article-open" type="button" onClick={() => onOpen(article.id)}>
                    <span className="article-title">{article.title}</span>
                    <span className="article-meta">
                      {article.pageCount} 頁
                      <span aria-hidden="true"> · </span>
                      {formatDate(article.lastOpenedAt || article.importedAt)}
                    </span>
                  </button>
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => onDelete(article)}
                    aria-label={`刪除《${article.title}》`}
                  >
                    刪除
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
