import { parseYear, splitParagraphs } from '../utils/siteContent';

const renderInlineLinks = (text, keyPrefix) => {
  const value = String(text || '');
  const regex = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let matchIndex = 0;

  while ((match = regex.exec(value)) !== null) {
    const [fullMatch, label, url] = match;
    const start = match.index;

    if (start > lastIndex) {
      parts.push(value.slice(lastIndex, start));
    }

    const isExternal = /^https?:\/\//.test(url);
    parts.push(
      <a
        key={`${keyPrefix}-link-${matchIndex}`}
        href={url}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener' : undefined}
      >
        {label}
      </a>
    );

    lastIndex = start + fullMatch.length;
    matchIndex += 1;
  }

  if (lastIndex === 0) return value;
  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  return parts;
};

const renderEntryLinks = (links, keyPrefix) => {
  if (!links || links.length === 0) return null;

  return (
    <div className="link-row">
      {links.map((link, idx) => (
        <a key={`${keyPrefix}-${link.label || 'link'}-${idx}`} href={link.url || '#'} target="_blank" rel="noopener">
          {link.label || 'Link'}
        </a>
      ))}
    </div>
  );
};

const normalizeAuthor = (author) => {
  if (typeof author === 'string') {
    return { name: author, url: '', highlight: false };
  }

  return {
    name: String(author?.name || '').trim(),
    url: String(author?.url || '').trim(),
    highlight: Boolean(author?.highlight),
  };
};

const renderPublicationMeta = (item, keyPrefix) => {
  const authors = Array.isArray(item.authors)
    ? item.authors.map(normalizeAuthor).filter((author) => author.name)
    : [];

  if (authors.length === 0) {
    return (
      <>
        {item.meta ? <p className="meta publication-meta">{item.meta}</p> : null}
        {item.venue ? <p className="meta publication-venue">{item.venue}</p> : null}
      </>
    );
  }

  return (
    <>
      <p className="meta publication-meta">
        {authors.map((author, idx) => {
          const content = author.highlight ? <strong>{author.name}</strong> : author.name;
          const key = `${keyPrefix}-author-${idx}`;

          return (
            <span key={key}>
              {idx > 0 ? ', ' : ''}
              {author.url ? (
                <a className="publication-author-link" href={author.url} target="_blank" rel="noopener">
                  {content}
                </a>
              ) : (
                content
              )}
            </span>
          );
        })}
      </p>
      {item.venue ? <p className="meta publication-venue">{item.venue}</p> : null}
    </>
  );
};

function TimedSection({ id, title, items, emptyText }) {
  return (
    <section id={id} className="section reveal">
      <h2>{title}</h2>
      <div className="list-grid">
        {items.length === 0 ? (
          <p className="meta">{emptyText}</p>
        ) : (
          items.map((item, idx) => (
            <article key={`${item.title || id}-${idx}`}>
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
  );
}

function CardSection({ id, title, items, emptyText }) {
  return (
    <section id={id} className="section reveal">
      <h2>{title}</h2>
      <div className="card-grid">
        {items.length === 0 ? (
          <article><p className="meta">{emptyText}</p></article>
        ) : (
          items.map((item, idx) => (
            <article key={`${item.title || id}-${idx}`}>
              <h3>{item.title || ''}</h3>
              {id === 'publications' ? (
                renderPublicationMeta(item, `${id}-${idx}`)
              ) : (
                <p className="meta">{item.meta || ''}</p>
              )}
              {id !== 'publications' && item.desc ? <p className="desc">{item.desc}</p> : null}
              {id !== 'publications' && (item.tags || []).length > 0 && (
                <div className="tags">
                  {item.tags.map((tag) => <span key={`${item.title || id}-${tag}`}>{tag}</span>)}
                </div>
              )}
              {renderEntryLinks(item.links || [], `${id}-${idx}`)}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function MainContent({ data }) {
  const labels = data.labels || {};
  const aboutParagraphs = splitParagraphs(data.about?.bio || 'Please fill your bio in content.json.');
  const awards = [...(data.awards || [])].sort((a, b) => parseYear(b.date) - parseYear(a.date));

  return (
    <div className="main-content">
      {data.sections?.about !== false && (
        <section id="about" className="section reveal">
          <h2>{labels.aboutTitle || labels.about || 'About'}</h2>
          <div id="about-content">
            {aboutParagraphs.map((line, idx) => (
              <p key={idx} className="desc">
                {renderInlineLinks(line, `about-${idx}`)}
              </p>
            ))}
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
                    <span className="news-content">{item.content || ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {data.sections?.publications !== false && (
        <CardSection
          id="publications"
          title={labels.publicationsTitle || labels.publications || 'Publications'}
          items={data.publications || []}
          emptyText="No publications yet."
        />
      )}

      {data.sections?.internship !== false && (
        <TimedSection
          id="internship"
          title={labels.internshipTitle || labels.internship || 'Internship'}
          items={data.internship || []}
          emptyText="No internship entries yet."
        />
      )}

      {data.sections?.education !== false && (
        <TimedSection
          id="education"
          title={labels.educationTitle || labels.education || 'Education'}
          items={data.education || []}
          emptyText="No education entries yet."
        />
      )}

      {data.sections?.service !== false && (
        <TimedSection
          id="service"
          title={labels.serviceTitle || labels.service || 'Service'}
          items={data.service || []}
          emptyText="No service entries yet."
        />
      )}

      {data.sections?.projects !== false && (
        <CardSection
          id="projects"
          title={labels.projectsTitle || labels.projects || 'Projects'}
          items={data.projects || []}
          emptyText="No projects yet."
        />
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
  );
}

export default MainContent;
