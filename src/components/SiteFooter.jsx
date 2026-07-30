function SiteFooter({ footer, backgroundCredit }) {
  return (
    <footer className="footer">
      <div className="container">
        <p>{footer || '© 2026 Taoyu Yang.'}</p>
        {backgroundCredit ? <p className="footer-credit">{backgroundCredit}</p> : null}
      </div>
    </footer>
  );
}

export default SiteFooter;
