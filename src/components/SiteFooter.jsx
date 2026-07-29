function SiteFooter({ footer, backgroundCredit, onBackgroundClick }) {
  return (
    <footer className="footer">
      <div className="container">
        <p>{footer || '© 2026 Taoyu Yang.'}</p>
        {backgroundCredit ? (
          <p className="footer-credit">
            <button
              type="button"
              className="footer-photo-toggle"
              onClick={onBackgroundClick}
              aria-label={`${backgroundCredit} View full-screen background photo`}
            >
              {backgroundCredit}
            </button>
          </p>
        ) : null}
      </div>
    </footer>
  );
}

export default SiteFooter;
