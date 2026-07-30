import { useEffect, useMemo, useRef, useState } from 'react';
import MainContent from './components/MainContent';
import Sidebar from './components/Sidebar';
import SiteFooter from './components/SiteFooter';
import Topbar from './components/Topbar';
import { sectionOrder } from './constants/sections';
import { getTopbarHeight } from './utils/siteContent';

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [activeId, setActiveId] = useState('about');
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);

  const topbarMouseRef = useRef(null);
  const sidebarMotionRef = useRef(null);

  const visibleSections = useMemo(() => {
    if (!data) return [];
    return sectionOrder.filter((key) => data.sections?.[key] !== false);
  }, [data]);

  const navSections = visibleSections;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}content.json`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to load content.json');
        }

        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(String(err?.message || err));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!isPhotoViewerOpen) {
      document.body.classList.remove('photo-viewer-open');
      return undefined;
    }

    document.body.classList.add('photo-viewer-open');
    const scrollingElement = document.scrollingElement;
    const lockedScrollTop = scrollingElement?.scrollTop ?? window.scrollY;
    const lockedScrollLeft = scrollingElement?.scrollLeft ?? window.scrollX;
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    const scrollKeys = new Set([
      'ArrowDown',
      'ArrowUp',
      'End',
      'Home',
      'PageDown',
      'PageUp',
      ' ',
    ]);

    document.documentElement.style.scrollBehavior = 'auto';

    const preventScroll = (event) => {
      event.preventDefault();
    };

    const holdScrollPosition = () => {
      if (!scrollingElement) return;
      if (
        scrollingElement.scrollTop !== lockedScrollTop
        || scrollingElement.scrollLeft !== lockedScrollLeft
      ) {
        scrollingElement.scrollTop = lockedScrollTop;
        scrollingElement.scrollLeft = lockedScrollLeft;
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsPhotoViewerOpen(false);
        return;
      }

      if (
        scrollKeys.has(event.key)
        && !(event.target instanceof Element && event.target.closest('.photo-viewer-close'))
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', holdScrollPosition, { passive: true });

    return () => {
      document.body.classList.remove('photo-viewer-open');
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', holdScrollPosition);
    };
  }, [isPhotoViewerOpen]);

  useEffect(() => {
    if (!data) return;

    const nodes = Array.from(document.querySelectorAll('.reveal'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (!data || !navSections.length) return;

    const syncActive = () => {
      let currentId = navSections[0];
      let bestTop = -Infinity;
      const markerY = window.scrollY + getTopbarHeight() + 20;

      navSections.forEach((id) => {
        const section = document.getElementById(id);
        if (!section) return;

        const top = section.offsetTop;
        if (top <= markerY && top > bestTop) {
          bestTop = top;
          currentId = id;
        }
      });

      setActiveId((prev) => (prev === currentId ? prev : currentId));
    };

    syncActive();
    window.addEventListener('scroll', syncActive, { passive: true });
    return () => window.removeEventListener('scroll', syncActive);
  }, [data, navSections]);

  const handleSectionClick = (event, id) => {
    event.preventDefault();

    const target = document.getElementById(id);
    if (!target) return;

    const top = target.getBoundingClientRect().top + window.scrollY - getTopbarHeight() - 6;
    window.scrollTo({ top, behavior: 'smooth' });
    setActiveId(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  const handleSidebarMouseMove = (event) => {
    const node = sidebarMotionRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const nx = (event.clientX - cx) / (rect.width / 2);
    const ny = (event.clientY - cy) / (rect.height / 2);
    const dist = Math.min(1, Math.hypot(nx, ny));
    const scale = 1 + dist * 0.01;

    node.style.setProperty('--avatar-shift-x', '0px');
    node.style.setProperty('--avatar-shift-y', '0px');
    node.style.setProperty('--avatar-scale', `${scale.toFixed(3)}`);
  };

  const handleSidebarMouseLeave = () => {
    const node = sidebarMotionRef.current;
    if (!node) return;

    node.style.setProperty('--avatar-shift-x', '0px');
    node.style.setProperty('--avatar-shift-y', '0px');
    node.style.setProperty('--avatar-scale', '1');
  };

  const togglePhotoViewer = () => {
    setIsPhotoViewerOpen((value) => !value);
  };

  if (error) {
    return <main className="container"><p>Failed to load content: {error}</p></main>;
  }

  if (!data) {
    return <main className="container"><p>Loading...</p></main>;
  }

  return (
    <>
      <Topbar
        navSections={navSections}
        labels={data.labels || {}}
        activeId={activeId}
        onSectionClick={handleSectionClick}
        blog={data.blog}
        theme={theme}
        onToggleTheme={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
        topbarMouseRef={topbarMouseRef}
      />

      <main className="container page-layout">
        <Sidebar
          profile={data.profile}
          contact={data.contact}
          sidebarMotionRef={sidebarMotionRef}
          onMouseMove={handleSidebarMouseMove}
          onMouseLeave={handleSidebarMouseLeave}
        />

        <MainContent data={data} />
      </main>

      <SiteFooter
        footer={data.footer}
        backgroundCredit={data.backgroundCredit}
        onBackgroundClick={togglePhotoViewer}
      />

      <div
        className={`background-photo-viewer ${isPhotoViewerOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Full-screen background photo"
        aria-hidden={!isPhotoViewerOpen}
      >
        <button
          type="button"
          className="photo-viewer-close"
          onClick={togglePhotoViewer}
          tabIndex={isPhotoViewerOpen ? 0 : -1}
          aria-label="Return to homepage"
        >
          <span>{data.backgroundCredit || 'Background photo'}</span>
          <span className="photo-viewer-close-hint">Click to return · Esc</span>
        </button>
      </div>
    </>
  );
}

export default App;
