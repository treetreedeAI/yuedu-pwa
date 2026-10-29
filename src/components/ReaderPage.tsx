import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { getArticle, markArticleOpened, updateReadingPosition } from '../lib/db';
import type { Article, RubyToken } from '../types';

interface ReaderPageProps {
  articleId: string;
  onBack: () => void;
  onOpened: () => void;
}

interface LookupState {
  term: string;
  left: number;
  top: number;
  above: boolean;
  source: 'selection' | 'tap';
}

const HAN_CHARACTER = /\p{Script=Han}/u;

function lookupPosition(rect: DOMRect): Pick<LookupState, 'left' | 'top' | 'above'> {
  const visualViewport = window.visualViewport;
  const viewportLeft = visualViewport?.offsetLeft ?? 0;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const viewportWidth = visualViewport?.width ?? window.innerWidth;
  const viewportHeight = visualViewport?.height ?? window.innerHeight;
  const viewportBottom = viewportTop + viewportHeight;
  const halfWidth = 88;
  const toolbarBottom = Math.max(
    viewportTop + 12,
    document.querySelector('.reader-toolbar')?.getBoundingClientRect().bottom ?? viewportTop + 66
  );
  const popoverHeight = 52;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2, viewportLeft + halfWidth + 8),
    viewportLeft + viewportWidth - halfWidth - 8
  );
  const roomAbove = rect.top - toolbarBottom;
  const roomBelow = viewportBottom - rect.bottom - 14;
  const above = roomAbove >= popoverHeight || roomAbove > roomBelow;
  const top = above
    ? Math.max(rect.top - 10, toolbarBottom + popoverHeight)
    : Math.min(Math.max(rect.bottom + 10, toolbarBottom), viewportBottom - popoverHeight - 12);

  return {
    left,
    top,
    above
  };
}

function tokenAtBoundary(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest<HTMLElement>('[data-reader-token]') ?? null;
}

function selectedReaderText(range: Range) {
  const fragment = range.cloneContents();
  const selected = Array.from(fragment.querySelectorAll<HTMLElement>('[data-reader-token]'))
    .map((token) => token.dataset.readerToken ?? '');

  if (selected.length > 0) {
    return selected.join('').trim();
  }

  const startToken = tokenAtBoundary(range.startContainer);
  const endToken = tokenAtBoundary(range.endContainer);
  return startToken && startToken === endToken ? (startToken.dataset.readerToken ?? '').trim() : '';
}

function ReaderToken({ token, index }: { token: RubyToken; index: number }) {
  const [text, jyutping] = token;
  const isHan = HAN_CHARACTER.test(text);
  const commonProps = {
    'data-reader-token': text,
    'data-reader-char': isHan ? text : undefined,
    key: index
  };

  if (isHan && jyutping) {
    return (
      <ruby className="ruby-token" {...commonProps}>
        <span>{text}</span>
        <rt aria-hidden="true">{jyutping}</rt>
      </ruby>
    );
  }

  return (
    <span className={isHan ? 'reader-token tappable-character' : 'reader-token'} {...commonProps}>
      {text}
    </span>
  );
}

export default function ReaderPage({ articleId, onBack, onOpened }: ReaderPageProps) {
  const [article, setArticle] = useState<Article>();
  const [loadError, setLoadError] = useState(false);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollYRef = useRef(0);
  const leavingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setArticle(undefined);
    setLoadError(false);

    void getArticle(articleId).then((storedArticle) => {
      if (!active) {
        return;
      }
      if (!storedArticle) {
        setLoadError(true);
        return;
      }

      setArticle(storedArticle);
      void markArticleOpened(articleId).then(onOpened);
    }).catch(() => {
      if (active) {
        setLoadError(true);
      }
    });

    return () => {
      active = false;
    };
  }, [articleId, onOpened]);

  const persistPosition = useCallback(() => {
    void updateReadingPosition(articleId, scrollYRef.current);
  }, [articleId]);

  const captureAndPersistPosition = useCallback(() => {
    scrollYRef.current = window.scrollY;
    persistPosition();
  }, [persistPosition]);

  useLayoutEffect(() => {
    if (!article) {
      return;
    }

    leavingRef.current = false;
    return () => {
      leavingRef.current = true;
      scrollYRef.current = window.scrollY;
      persistPosition();
    };
  }, [article, persistPosition]);

  useEffect(() => {
    if (!article) {
      return;
    }

    document.title = `${article.title} · 粵讀`;
    scrollYRef.current = article.scrollY;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      secondFrame = requestAnimationFrame(() => window.scrollTo({ top: article.scrollY, behavior: 'instant' }));
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      document.title = '粵讀';
    };
  }, [article]);

  useEffect(() => {
    if (!article) {
      return;
    }

    let saveTimer: number | undefined;
    const handleScroll = () => {
      if (leavingRef.current) {
        return;
      }
      scrollYRef.current = window.scrollY;
      setLookup(null);
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(persistPosition, 300);
    };
    const handlePageHide = () => captureAndPersistPosition();
    const dismissLookup = () => setLookup(null);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        captureAndPersistPosition();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', handlePageHide);
    window.visualViewport?.addEventListener('resize', dismissLookup);
    window.visualViewport?.addEventListener('scroll', dismissLookup);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(saveTimer);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', handlePageHide);
      window.visualViewport?.removeEventListener('resize', dismissLookup);
      window.visualViewport?.removeEventListener('scroll', dismissLookup);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [article, captureAndPersistPosition, persistPosition]);

  useEffect(() => {
    let frame = 0;

    const handleSelectionChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const container = articleRef.current;
        const selection = document.getSelection();

        if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
          setLookup((current) => current?.source === 'selection' ? null : current);
          return;
        }

        const range = selection.getRangeAt(0);
        if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) {
          return;
        }

        const term = selectedReaderText(range);
        const rect = range.getBoundingClientRect();
        if (!term || (!rect.width && !rect.height)) {
          return;
        }

        setLookup({ term, source: 'selection', ...lookupPosition(rect) });
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const handleArticleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) {
      return;
    }

    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-reader-char]') : null;
    if (!element || !articleRef.current?.contains(element)) {
      setLookup(null);
      return;
    }

    const term = element.dataset.readerChar;
    if (term) {
      setLookup({ term, source: 'tap', ...lookupPosition(element.getBoundingClientRect()) });
    }
  };

  const lookupUrl = useMemo(
    () => lookup ? `https://words.hk/zidin/${encodeURIComponent(lookup.term)}` : '',
    [lookup]
  );

  const handleBack = () => {
    leavingRef.current = true;
    captureAndPersistPosition();
    onBack();
  };

  if (loadError) {
    return (
      <div className="reader-page">
        <ReaderToolbar title="找不到文章" onBack={handleBack} />
        <main className="reader-status" role="alert">
          <p>這篇文章可能已被刪除。</p>
          <button type="button" onClick={handleBack}>返回書架</button>
        </main>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="reader-page">
        <ReaderToolbar title="" onBack={handleBack} />
        <main className="reader-status" aria-live="polite">正在打開文章…</main>
      </div>
    );
  }

  return (
    <div className="reader-page">
      <ReaderToolbar title={article.title} onBack={handleBack} />
      <article ref={articleRef} className="reader-article" onClick={handleArticleClick}>
        <h1 ref={headingRef} tabIndex={-1}>{article.title}</h1>
        <div className="reader-body">
          {article.paragraphs.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>
              {paragraph.map((token, tokenIndex) => (
                <ReaderToken key={tokenIndex} token={token} index={tokenIndex} />
              ))}
            </p>
          ))}
        </div>
      </article>

      {lookup ? (
        <div
          className={`lookup-popover${lookup.above ? ' is-above' : ''}`}
          style={{ left: lookup.left, top: lookup.top }}
          onPointerDown={(event) => event.preventDefault()}
        >
          <a
            href={lookupUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`查粵典：${lookup.term}`}
            onClick={captureAndPersistPosition}
          >
            <span className="lookup-term" aria-hidden="true">{lookup.term}</span>
            <span>查粵典</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}

function ReaderToolbar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="reader-toolbar">
      <div className="reader-toolbar-inner">
        <button className="back-button" type="button" onClick={onBack}>
          <svg aria-hidden="true" viewBox="0 0 12 20">
            <path d="M10.5 1.5 2 10l8.5 8.5" />
          </svg>
          <span>書架</span>
        </button>
        <p>{title}</p>
        <span aria-hidden="true" />
      </div>
    </header>
  );
}
