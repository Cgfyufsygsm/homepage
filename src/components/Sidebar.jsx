import { getContactIconClass, getContactType, toPublicUrl } from '../utils/siteContent';

function Sidebar({ profile, contact, sidebarMotionRef, onMouseMove, onMouseLeave }) {
  return (
    <aside
      className="sidebar reveal"
      ref={sidebarMotionRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <img
        id="avatar-image"
        className="avatar-image"
        src={toPublicUrl(profile?.avatarImage || 'assets/avatar-placeholder.svg')}
        alt="Avatar"
        onError={(event) => {
          event.currentTarget.src = toPublicUrl('assets/avatar-placeholder.svg');
        }}
      />
      <h1 id="sidebar-name">{profile?.name || 'Your Name'}</h1>
      <p id="sidebar-title" className="meta">{profile?.title || 'Title Placeholder'}</p>
      <p id="sidebar-affiliation" className="meta">{profile?.affiliation || 'Affiliation Placeholder'}</p>

      <div id="sidebar-contact" className="sidebar-links">
        {(contact || []).map((item, idx) => {
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
  );
}

export default Sidebar;
