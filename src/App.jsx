import { useEffect, useMemo, useRef, useState } from 'react';
import LiquidGlass from 'liquid-glass-react';

const sectionOrder = ['about', 'news', 'publications', 'internship', 'education', 'service', 'projects', 'awards', 'cv', 'contact'];

const timedSections = new Set(['education', 'internship', 'service']);
const cardSections = new Set(['publications', 'projects']);

const getContactType = (item) => {
  const label = String(item?.label || '').toLowerCase();
  const value = String(item?.value || '').toLowerCase();
  const url = String(item?.url || '').toLowerCase();
  const all = `${label} ${value} ${url}`;
  if (all.includes('mailto:') || all.includes('email')) return 'email';
  if (all.includes('github')) return 'github';
  if (all.includes('scholar')) return 'scholar';
  if (all.includes('linkedin')) return 'linkedin';
  if (all.includes('orcid')) return 'orcid';
  return 'link';
};

const getContactIconClass = (type) => {
  const icons = {
    email: 'fa-solid fa-envelope',
    github: 'fa-brands fa-github',
    scholar: 'fa-solid fa-graduation-cap',
    linkedin: 'fa-brands fa-linkedin',
    orcid: 'fa-brands fa-orcid',
    link: 'fa-solid fa-link',
  };
  return icons[type] || icons.link;
};

const splitParagraphs = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  return String(raw || '')
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
};

const parseYear = (value) => {
  const m = String(value || '').match(/\d{4}/);
  return m ? Number(m[0]) : 0;
};

const toPublicUrl = (value) => {
  if (!value) return '';
  if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(value)) return value;
  const clean = String(value).replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${clean}`;
};

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [activeId, setActiveId] = useState('about');

  const topbarMouseRef = useRef(null);
  const sidebarMotionRef = useRef(null);

  const visibleSections = useMemo(() => {
    if (!data) return [];
    return sectionOrder.filter((key) => {
      if (key === 'cv') return true;
      return data.sections?.[key] !== false;
    });
  }, [data]);

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
    if (!data || !visibleSections.length) return;

    const topbarHeight = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height'), 10) || 64;

    const syncActive = () => {
      let currentId = visibleSections[0];
      let bestTop = -Infinity;
      const markerY = window.scrollY + topbarHeight + 20;

      visibleSections.forEach((id) => {
        if (id === 'cv' || id === 'contact') return;
        const section = document.getElementById(id);
        if (!section) return;
        const top = section.offsetTop;
        if (top <= markerY && top > bestTop) {
          bestTop = top;
          currentId = id;
        }
      });

      setActiveId(currentId);
    };

    syncActive();
    window.addEventListener('scroll', syncActive, { passive: true });
    return () => window.removeEventListener('scroll', syncActive);
  }, [data, visibleSections]);

  const handleSectionClick = (event, id) => {
    event.preventDefault();

    if (id === 'cv') {
      const cvUrl = data?.cv?.url || '#';
      if (cvUrl === '#') return;
      window.open(cvUrl, '_blank', 'noopener');
      return;
    }

    const target = document.getElementById(id);
    if (!target) return;

    const topbarHeight = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height'), 10) || 64;
    const top = target.getBoundingClientRect().top + window.scrollY - topbarHeight - 6;
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
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const shiftX = 0;
    const shiftY = 0;
    const dist = Math.min(1, Math.hypot(nx, ny));
    const scale = 1 + dist * 0.01;
    node.style.setProperty('--avatar-shift-x', `${shiftX.toFixed(2)}px`);
    node.style.setProperty('--avatar-shift-y', `${shiftY.toFixed(2)}px`);
    node.style.setProperty('--avatar-scale', `${scale.toFixed(3)}`);
  };

  const handleSidebarMouseLeave = () => {
    const node = sidebarMotionRef.current;
    if (!node) return;
    node.style.setProperty('--avatar-shift-x', '0px');
    node.style.setProperty('--avatar-shift-y', '0px');
    node.style.setProperty('--avatar-scale', '1');
  };

  if (error) {
    return <main className="container"><p>Failed to load content: {error}</p></main>;
  }

  if (!data) {
    return <main className="container"><p>Loading...</p></main>;
  }

  const labels = data.labels || {};
  const aboutParagraphs = splitParagraphs(data.about?.bio || 'Please fill your bio in content.json.');
  const awards = [...(data.awards || [])].sort((a, b) => parseYear(b.date) - parseYear(a.date));

  const navSections = visibleSections.filter((id) => id !== 'contact' && id !== 'cv');

  return (
    <>
      <div className="topbar-liquid-wrap">
        <LiquidGlass
          className="topbar-liquid-core"
          displacementScale={20}
          blurAmount={0.18}
          saturation={160}
          aberrationIntensity={5}
          elasticity={0.01}
          cornerRadius={14}
          mode="prominent"
          overLight={false}
          mouseContainer={topbarMouseRef}
          padding="0"
          style={{ position: 'fixed', top: '34px', left: '50%', zIndex: 1200 }}
        >
          <div className="topbar-inner topbar-liquid-shell" ref={topbarMouseRef}>
            <nav className="main-nav">
              <ul id="nav-list">
                {navSections.map((id) => {
                  const label = labels[id] || id;
                  const isActive = activeId === id;
                  const href = id === 'cv' ? (data.cv?.url || '#') : `#${id}`;

                  return (
                    <li key={id}>
                      <a
                        href={href}
                        className={isActive ? 'active' : ''}
                        onClick={(event) => handleSectionClick(event, id)}
                      >
                        {label}
                      </a>
                    </li>
                  );
                })}

                <li>
                  <a href={data.blog?.url || '#'} target="_blank" rel="noopener">{data.blog?.label || 'Blog'}</a>
                </li>
              </ul>
            </nav>

            <div className="topbar-actions">
              <button
                id="theme-toggle"
                className="ghost-btn"
                aria-label="Toggle dark mode"
                onClick={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
              >
                <i className={theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'} aria-hidden="true" />
              </button>
            </div>
          </div>
        </LiquidGlass>
      </div>

      <main className="container page-layout">
        <aside
          className="sidebar reveal"
          ref={sidebarMotionRef}
          onMouseMove={handleSidebarMouseMove}
          onMouseLeave={handleSidebarMouseLeave}
        >
          <img
            id="avatar-image"
            className="avatar-image"
            src={toPublicUrl(data.profile?.avatarImage || 'assets/avatar-placeholder.svg')}
            alt="Avatar"
            onError={(event) => {
              event.currentTarget.src = toPublicUrl('assets/avatar-placeholder.svg');
            }}
          />
          <h1 id="sidebar-name">{data.profile?.name || 'Your Name'}</h1>
          <p id="sidebar-title" className="meta">{data.profile?.title || 'Title Placeholder'}</p>
          <p id="sidebar-affiliation" className="meta">{data.profile?.affiliation || 'Affiliation Placeholder'}</p>

          <div id="sidebar-contact" className="sidebar-links">
            {(data.contact || []).map((item, idx) => {
              const type = getContactType(item);
              const label = item.label || '';
              return (
                <div className="contact-item" key={`${label}-${idx}`}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener" aria-label={label} title={label}>
                      <span className="contact-icon"><i className={getContactIconClass(type)} aria-hidden="true" /></span>
                    </a>
                  ) : (
                    <span aria-label={label} title={label}>
                      <span className="contact-icon"><i className={getContactIconClass(type)} aria-hidden="true" /></span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <div className="main-content">
          {data.sections?.about !== false && (
            <section id="about" className="section reveal">
              <h2>{labels.aboutTitle || labels.about || 'About'}</h2>
              <div id="about-content">
                {aboutParagraphs.map((line, idx) => <p key={idx} className="desc">{line}</p>)}
              </div>
            </section>
          )}

          {data.sections?.news !== false && (
            <section id="news" className="section reveal">
              <h2>{labels.newsTitle || labels.news || 'News'}</h2>
              <div id="news-list" className="list-grid">
                {(data.news || []).length === 0 ? (
                  <p className="meta">No news yet.</p>
                ) : (
                  <ul className="news-items">
                    {(data.news || []).map((item, idx) => (
                      <li key={`${item.date || 'news'}-${idx}`}>
                        <span className="news-date">{item.date || ''}</span>
                        <span className="news-title">{item.title || ''}</span>
                        {item.desc ? <span className="news-desc"> - {item.desc}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {data.sections?.publications !== false && (
            <section id="publications" className="section reveal">
              <h2>{labels.publicationsTitle || labels.publications || 'Publications'}</h2>
              <div id="pub-list" className="card-grid">
                {(data.publications || []).length === 0 ? (
                  <article><p className="meta">No publications yet.</p></article>
                ) : (
                  (data.publications || []).map((item, idx) => (
                    <article key={`${item.title || 'publication'}-${idx}`}>
                      <h3>{item.title || ''}</h3>
                      <p className="meta">{item.meta || ''}</p>
                      <p className="desc">{item.desc || ''}</p>
                      {(item.tags || []).length > 0 && <div className="tags">{item.tags.map((tag) => <span key={`${item.title}-${tag}`}>{tag}</span>)}</div>}
                      {(item.links || []).length > 0 && (
                        <div className="link-row">
                          {(item.links || []).map((link, linkIdx) => (
                            <a key={`${link.label || 'link'}-${linkIdx}`} href={link.url || '#'} target="_blank" rel="noopener">{link.label || 'Link'}</a>
                          ))}
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          )}

          {timedSections.has('internship') && data.sections?.internship !== false && (
            <section id="internship" className="section reveal">
              <h2>{labels.internshipTitle || labels.internship || 'Internship'}</h2>
              <div id="internship-list" className="list-grid">
                {(data.internship || []).length === 0 ? (
                  <p className="meta">No internship entries yet.</p>
                ) : (
                  (data.internship || []).map((item, idx) => (
                    <article key={`${item.title || 'internship'}-${idx}`}>
                      <div className="timed-row">
                        <div className="timed-main">
                          <h3>{item.title || ''}</h3>
                          <p className="meta">{item.meta || ''}</p>
                          {item.desc ? <p className="desc">{item.desc}</p> : null}
                        </div>
                        <span className="timed-date">{item.date || ''}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}

          {timedSections.has('education') && data.sections?.education !== false && (
            <section id="education" className="section reveal">
              <h2>{labels.educationTitle || labels.education || 'Education'}</h2>
              <div id="education-list" className="list-grid">
                {(data.education || []).length === 0 ? (
                  <p className="meta">No education entries yet.</p>
                ) : (
                  (data.education || []).map((item, idx) => (
                    <article key={`${item.title || 'education'}-${idx}`}>
                      <div className="timed-row">
                        <div className="timed-main">
                          <h3>{item.title || ''}</h3>
                          <p className="meta">{item.meta || ''}</p>
                          {item.desc ? <p className="desc">{item.desc}</p> : null}
                        </div>
                        <span className="timed-date">{item.date || ''}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}

          {timedSections.has('service') && data.sections?.service !== false && (
            <section id="service" className="section reveal">
              <h2>{labels.serviceTitle || labels.service || 'Service'}</h2>
              <div id="service-list" className="list-grid">
                {(data.service || []).length === 0 ? (
                  <p className="meta">No service entries yet.</p>
                ) : (
                  (data.service || []).map((item, idx) => (
                    <article key={`${item.title || 'service'}-${idx}`}>
                      <div className="timed-row">
                        <div className="timed-main">
                          <h3>{item.title || ''}</h3>
                          <p className="meta">{item.meta || ''}</p>
                          {item.desc ? <p className="desc">{item.desc}</p> : null}
                        </div>
                        <span className="timed-date">{item.date || ''}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}

          {cardSections.has('projects') && data.sections?.projects !== false && (
            <section id="projects" className="section reveal">
              <h2>{labels.projectsTitle || labels.projects || 'Projects'}</h2>
              <div id="project-list" className="card-grid">
                {(data.projects || []).length === 0 ? (
                  <article><p className="meta">No projects yet.</p></article>
                ) : (
                  (data.projects || []).map((item, idx) => (
                    <article key={`${item.title || 'project'}-${idx}`}>
                      <h3>{item.title || ''}</h3>
                      <p className="meta">{item.meta || ''}</p>
                      <p className="desc">{item.desc || ''}</p>
                      {(item.tags || []).length > 0 && <div className="tags">{item.tags.map((tag) => <span key={`${item.title}-${tag}`}>{tag}</span>)}</div>}
                      {(item.links || []).length > 0 && (
                        <div className="link-row">
                          {(item.links || []).map((link, linkIdx) => (
                            <a key={`${link.label || 'link'}-${linkIdx}`} href={link.url || '#'} target="_blank" rel="noopener">{link.label || 'Link'}</a>
                          ))}
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          )}

          {data.sections?.awards !== false && (
            <section id="awards" className="section reveal">
              <h2>{labels.awardsTitle || labels.awards || 'Awards'}</h2>
              <div id="award-list" className="list-grid">
                {awards.length === 0 ? (
                  <p className="meta">No awards yet.</p>
                ) : (
                  <ul className="award-items">
                    {awards.map((item, idx) => (
                      <li key={`${item.date || 'award'}-${idx}`}>
                        <span className="award-date">{item.date || ''}</span>{' '}
                        <span className="award-title">{item.title || ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {data.sections?.cv !== false && (
            <section id="cv" className="section reveal">
              <h2>{labels.cvTitle || labels.cv || 'CV'}</h2>
              <p id="cv-note">{data.cv?.note || ''}</p>
              <p>
                <a
                  id="cv-link"
                  className="cta"
                  href={data.cv?.url || '#'}
                  target={data.cv?.url && data.cv.url !== '#' ? '_blank' : undefined}
                  rel={data.cv?.url && data.cv.url !== '#' ? 'noopener' : undefined}
                >
                  {data.cv?.label || 'Download CV'}
                </a>
              </p>
            </section>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <p>{data.footer || '© 2026 Taoyu Yang.'}</p>
          {data.backgroundCredit ? <p className="footer-credit">{data.backgroundCredit}</p> : null}
        </div>
      </footer>
    </>
  );
}

export default App;
