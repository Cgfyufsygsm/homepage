import { useEffect, useState } from 'react';
import { getContactIconClass, getContactType, toPublicUrl } from '../utils/siteContent';

function Sidebar({ profile, contact, sidebarMotionRef, onMouseMove, onMouseLeave }) {
  const [openWechatIndex, setOpenWechatIndex] = useState(null);

  useEffect(() => {
    if (openWechatIndex === null) return undefined;

    const handlePointerDown = (event) => {
      if (
        event.target instanceof Element
        && (event.target.closest('.contact-item.wechat') || event.target.closest('.wechat-popover-layer'))
      ) {
        return;
      }
      setOpenWechatIndex(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenWechatIndex(null);
      }
    };

    const handleViewportChange = () => {
      setOpenWechatIndex(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [openWechatIndex]);

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
          const wechatId = item.wechatId || item.value || 'your_weixin_id';
          const wechatNote = item.note || 'Please include your identity and purpose.';
          const isWechat = type === 'wechat';
          const isOpen = openWechatIndex === idx;
          const tooltipId = `wechat-tooltip-${idx}`;
          const handleWechatToggle = () => {
            if (isOpen) {
              setOpenWechatIndex(null);
              return;
            }
            setOpenWechatIndex(idx);
          };

          return (
            <div className={`contact-item ${isWechat ? 'wechat' : ''}`} key={`${label}-${idx}`}>
              {isWechat ? (
                <>
                  <button
                    type="button"
                    className="wechat-trigger"
                    aria-label={label || 'WeChat'}
                    title={label || 'WeChat'}
                    aria-expanded={isOpen}
                    aria-controls={tooltipId}
                    onClick={handleWechatToggle}
                  >
                    <span className="contact-icon"><i className={getContactIconClass(type)} aria-hidden="true" /></span>
                  </button>
                  <div
                    id={tooltipId}
                    className={`wechat-popover-layer ${isOpen ? 'open' : ''}`}
                    role="tooltip"
                    aria-hidden={!isOpen}
                  >
                    <div className="contact-tooltip-content">
                      <span className="tooltip-line"><strong>WeChat ID:</strong> <code className="wechat-id">{wechatId}</code></span>
                      <span className="tooltip-line">{wechatNote}</span>
                    </div>
                  </div>
                </>
              ) : item.url ? (
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
