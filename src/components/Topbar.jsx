import LiquidGlass from 'liquid-glass-react';

function Topbar({
  navSections,
  labels,
  activeId,
  onSectionClick,
  blog,
  gallery,
  theme,
  onToggleTheme,
  topbarMouseRef,
}) {
  return (
    <div className="topbar-liquid-wrap liquid-scope">
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
                return (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className={isActive ? 'active' : ''}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={(event) => onSectionClick(event, id)}
                    >
                      {label}
                    </a>
                  </li>
                );
              })}

              <li>
                <a href="/gallery">{gallery?.label || 'Gallery'}</a>
              </li>

              <li>
                <a href={blog?.url || '#'} target="_blank" rel="noopener">{blog?.label || 'Blog'}</a>
              </li>
            </ul>
          </nav>

          <div className="topbar-actions">
            <button
              id="theme-toggle"
              className="ghost-btn"
              aria-label="Toggle dark mode"
              aria-pressed={theme === 'dark'}
              onClick={onToggleTheme}
            >
              <i className={theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'} aria-hidden="true" />
            </button>
          </div>
        </div>
      </LiquidGlass>
    </div>
  );
}

export default Topbar;
