import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import LiquidGlass from 'liquid-glass-react';
import { toPublicUrl } from '../utils/siteContent';

function GalleryPage({ data, theme, onToggleTheme }) {
  const gallery = data.gallery || {};
  const photos = gallery.photos || [];
  const [activeCollection, setActiveCollection] = useState('all');
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [navigationDirection, setNavigationDirection] = useState(1);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [previousPhoto, setPreviousPhoto] = useState(null);
  const [transitionPhotoKey, setTransitionPhotoKey] = useState(null);
  const [isDetailImageReady, setIsDetailImageReady] = useState(false);
  const [isOpenTransitionComplete, setIsOpenTransitionComplete] = useState(false);
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false);
  const headerMouseRef = useRef(null);
  const imagePreloadCache = useRef(new Map());
  const browseRequestRef = useRef(0);

  const collections = useMemo(() => [
    { id: 'all', label: 'All' },
    ...[...(gallery.collections || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
  ], [gallery.collections]);

  const randomizedPhotos = useMemo(() => {
    const shuffled = [...photos];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  }, [photos]);

  const visiblePhotos = useMemo(
    () => randomizedPhotos
      .filter((photo) => photo.status !== 'draft')
      .filter((photo) => activeCollection === 'all' || photo.collections?.includes(activeCollection)),
    [activeCollection, randomizedPhotos]
  );

  const masonryColumns = useMemo(() => {
    const columns = Array.from({ length: 3 }, () => []);
    const columnHeights = Array.from({ length: 3 }, () => 0);

    visiblePhotos.forEach((photo, photoIndex) => {
      const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
      const isPortrait = (photo.height || 0) > (photo.width || 0);
      const aspectHeight = isPortrait ? 1 : (photo.height || 3) / (photo.width || 4);
      columns[shortestColumn].push({ photo, photoIndex });
      columnHeights[shortestColumn] += aspectHeight + 0.22;
    });

    return columns;
  }, [visiblePhotos]);

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const getCollectionLabel = (photo) => (
    collections.find((collection) => photo.collections?.includes(collection.id))?.label
    || 'Photography'
  );

  const withViewTransition = (photoKey, update, onFinished) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduceMotion) {
      update();
      onFinished?.();
      return;
    }

    flushSync(() => setTransitionPhotoKey(photoKey));
    const transition = document.startViewTransition(() => {
      flushSync(update);
    });
    transition.finished.finally(() => {
      setTransitionPhotoKey(null);
      if (onFinished) requestAnimationFrame(onFinished);
    });
  };

  const preloadPhoto = (photo) => {
    if (!photo?.src) return Promise.resolve(false);
    const src = toPublicUrl(photo.src);
    if (imagePreloadCache.current.has(src)) return imagePreloadCache.current.get(src);

    const promise = new Promise((resolve) => {
      const image = new Image();
      const finish = () => {
        if (typeof image.decode === 'function') {
          image.decode().catch(() => {}).finally(() => resolve(true));
        } else {
          resolve(true);
        }
      };
      image.onload = finish;
      image.onerror = () => resolve(false);
      image.src = src;
      if (image.complete && image.naturalWidth > 0) finish();
    });

    imagePreloadCache.current.set(src, promise);
    return promise;
  };

  const openPhoto = (index) => {
    setNavigationDirection(1);
    setIsBrowsing(false);
    setPreviousPhoto(null);
    setIsDetailImageReady(false);
    setIsOpenTransitionComplete(false);
    setIsInfoCollapsed(false);
    withViewTransition(
      String(index),
      () => setSelectedIndex(index),
      () => setIsOpenTransitionComplete(true)
    );
  };

  const closePhoto = () => {
    withViewTransition(String(selectedIndex), () => setSelectedIndex(null));
  };

  const browsePhoto = async (direction) => {
    const nextIndex = (selectedIndex + direction + visiblePhotos.length) % visiblePhotos.length;
    const requestId = browseRequestRef.current + 1;
    browseRequestRef.current = requestId;
    await preloadPhoto(visiblePhotos[nextIndex]);
    if (browseRequestRef.current !== requestId) return;

    setNavigationDirection(direction);
    setIsBrowsing(true);
    setPreviousPhoto(selectedPhoto);
    setSelectedIndex(nextIndex);
  };

  const selectedPhoto = selectedIndex === null ? null : visiblePhotos[selectedIndex];
  const selectedExposure = selectedPhoto ? [
    selectedPhoto.exif?.focalLength,
    selectedPhoto.exif?.aperture,
    selectedPhoto.exif?.shutter,
    selectedPhoto.exif?.iso != null ? `ISO ${selectedPhoto.exif.iso}` : '',
  ].filter(Boolean).join(' · ') : '';
  const revealDetailImage = isDetailImageReady && isOpenTransitionComplete;

  useEffect(() => {
    const previousTitle = document.title;
    document.body.classList.add('gallery-mode');
    document.title = `${data.profile?.name?.split(' (')[0] || 'Taoyu Yang'} — Photography`;

    return () => {
      document.body.classList.remove('gallery-mode');
      document.title = previousTitle;
    };
  }, [data.profile?.name]);

  useEffect(() => {
    if (!selectedPhoto) return undefined;

    document.body.classList.add('gallery-lightbox-open');
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closePhoto();
      if (event.key === 'ArrowRight') browsePhoto(1);
      if (event.key === 'ArrowLeft') browsePhoto(-1);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('gallery-lightbox-open');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPhoto, visiblePhotos.length]);

  useEffect(() => {
    if (!selectedPhoto) {
      setIsDetailImageReady(false);
      return undefined;
    }

    let active = true;
    setIsDetailImageReady(false);
    preloadPhoto(selectedPhoto).then((loaded) => {
      if (active && loaded) setIsDetailImageReady(true);
    });

    return () => {
      active = false;
    };
  }, [selectedPhoto?.src]);

  return (
    <div className="gallery-page">
      <header className="gallery-header liquid-scope">
        <LiquidGlass
          className="gallery-header-core"
          displacementScale={20}
          blurAmount={0.18}
          saturation={160}
          aberrationIntensity={5}
          elasticity={0.01}
          cornerRadius={14}
          mode="prominent"
          overLight={false}
          mouseContainer={headerMouseRef}
          padding="0"
          style={{ position: 'fixed', top: '34px', left: '50%', zIndex: 1200 }}
        >
          <div className="gallery-header-inner" ref={headerMouseRef}>
            <a className="gallery-wordmark" href="/">
              <strong>{data.profile?.name?.split(' (')[0] || 'Taoyu Yang'}</strong>
              <span>Gallery</span>
            </a>
            <nav className="gallery-site-nav" aria-label="Gallery navigation">
              {import.meta.env.DEV ? <a href="/gallery-admin">Manage</a> : null}
              <a href="/">Home</a>
              <a href={data.blog?.url || '#'} target="_blank" rel="noopener">Blog</a>
              <button
                type="button"
                className="gallery-theme-toggle"
                aria-label="Toggle dark mode"
                aria-pressed={theme === 'dark'}
                onClick={onToggleTheme}
              >
                <i className={theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'} aria-hidden="true" />
              </button>
            </nav>
          </div>
        </LiquidGlass>
      </header>

      <main className="gallery-shell">
        <section className="gallery-toolbar" aria-label="Gallery controls">
          <div className="gallery-controls">
            <div className="gallery-filters" aria-label="Filter photographs">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className={activeCollection === collection.id ? 'active' : ''}
                  aria-pressed={activeCollection === collection.id}
                  onClick={() => {
                    setActiveCollection(collection.id);
                    setSelectedIndex(null);
                  }}
                >
                  {collection.label}
                </button>
              ))}
            </div>
            <span>{String(visiblePhotos.length).padStart(2, '0')} works</span>
          </div>
        </section>

        <section className="masonry-gallery" aria-label="Photography works">
          {masonryColumns.map((column, columnIndex) => (
            <div className="masonry-column" key={`column-${columnIndex}`}>
              {column.map(({ photo, photoIndex }) => {
                const itemKey = String(photoIndex);
                const isPortrait = (photo.height || 0) > (photo.width || 0);

                return (
                  <article
                    className={`masonry-item${isPortrait ? ' is-portrait' : ''}`}
                    key={photo.id || `${photo.src}-${photoIndex}`}
                  >
                    <button
                      type="button"
                      onClick={() => openPhoto(photoIndex)}
                      onPointerEnter={() => preloadPhoto(photo)}
                      onPointerDown={() => preloadPhoto(photo)}
                      onFocus={() => preloadPhoto(photo)}
                      aria-label={`View photograph ${photoIndex + 1}`}
                    >
                      <span
                        className="masonry-image-wrap"
                        style={{ aspectRatio: isPortrait ? '1 / 1' : `${photo.width || 4} / ${photo.height || 3}` }}
                      >
                        <img
                          src={toPublicUrl(photo.thumb || photo.src)}
                          alt={photo.alt || 'Photography work'}
                          loading={photoIndex < 4 ? 'eager' : 'lazy'}
                          style={{
                            viewTransitionName: transitionPhotoKey === itemKey && selectedIndex === null
                              ? 'gallery-active-photo'
                              : 'none',
                          }}
                        />
                        <span className="masonry-overlay">
                          <span>{String(photoIndex + 1).padStart(2, '0')}</span>
                          <span>View ↗</span>
                        </span>
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>
          ))}
        </section>

        <footer className="gallery-footer">
          <p>{gallery.footer || 'Photographs and words by Taoyu Yang.'}</p>
          <a href="mailto:i@imyangty.com">Prints & enquiries ↗</a>
        </footer>
      </main>

      {selectedPhoto ? (
        <div
          className={`photo-detail ${isInfoCollapsed ? 'info-collapsed' : 'info-expanded'}`}
          role="dialog"
          aria-modal="true"
          aria-label={`Photograph ${selectedIndex + 1}`}
        >
          <div className="photo-detail-background" aria-hidden="true">
            {isBrowsing && previousPhoto ? (
              <div
                className="photo-detail-background-exit"
                style={{ backgroundImage: `url("${toPublicUrl(previousPhoto.thumb || previousPhoto.src)}")` }}
              />
            ) : null}
            <div
              key={selectedPhoto.id || selectedPhoto.src}
              className={isBrowsing ? 'photo-detail-background-enter' : 'photo-detail-background-current'}
              style={{ backgroundImage: `url("${toPublicUrl(selectedPhoto.thumb || selectedPhoto.src)}")` }}
            />
          </div>

          <div className="photo-detail-shade" aria-hidden="true" />
          <button className="photo-detail-backdrop" type="button" onClick={closePhoto} aria-label="Close photograph" />

          <div className="photo-detail-topline" aria-hidden="true">
            <span>{getCollectionLabel(selectedPhoto)}</span>
            <span>{String(selectedIndex + 1).padStart(2, '0')} / {String(visiblePhotos.length).padStart(2, '0')}</span>
          </div>

          <button className="photo-detail-close" type="button" onClick={closePhoto} aria-label="Close photograph">×</button>

          <div className="photo-detail-stage">
            <div className="photo-detail-media">
              {isBrowsing && previousPhoto ? (
                <img
                  className={navigationDirection < 0 ? 'photo-exit-right' : 'photo-exit-left'}
                  src={toPublicUrl(previousPhoto.src)}
                  alt=""
                  aria-hidden="true"
                />
              ) : null}
              {isBrowsing ? (
                <img
                  key={selectedPhoto.id || selectedPhoto.src}
                  className={navigationDirection < 0 ? 'photo-enter-left' : 'photo-enter-right'}
                  src={toPublicUrl(selectedPhoto.src)}
                  alt={selectedPhoto.alt || 'Photography work'}
                  onAnimationEnd={() => setPreviousPhoto(null)}
                  style={{
                    viewTransitionName: transitionPhotoKey !== null
                      ? 'gallery-active-photo'
                      : 'none',
                  }}
                />
              ) : (
                <>
                  <img
                    key={`preview-${selectedPhoto.id || selectedPhoto.src}`}
                    className={`photo-detail-photo-preview${revealDetailImage ? ' is-replaced' : ''}`}
                    src={toPublicUrl(selectedPhoto.thumb || selectedPhoto.src)}
                    alt={selectedPhoto.alt || 'Photography work'}
                    style={{
                      viewTransitionName: transitionPhotoKey !== null && !revealDetailImage
                        ? 'gallery-active-photo'
                        : 'none',
                    }}
                  />
                  <img
                    key={`full-${selectedPhoto.id || selectedPhoto.src}`}
                    className={`photo-detail-photo-full${revealDetailImage ? ' is-ready' : ''}`}
                    src={toPublicUrl(selectedPhoto.src)}
                    alt=""
                    aria-hidden="true"
                    style={{
                      viewTransitionName: transitionPhotoKey !== null && revealDetailImage
                        ? 'gallery-active-photo'
                        : 'none',
                    }}
                  />
                </>
              )}
            </div>
            {visiblePhotos.length > 1 ? (
              <div className="photo-detail-navigation">
                <button
                  type="button"
                  onClick={() => browsePhoto(-1)}
                  onPointerUp={(event) => event.currentTarget.blur()}
                  aria-label="Previous photograph"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => browsePhoto(1)}
                  onPointerUp={(event) => event.currentTarget.blur()}
                  aria-label="Next photograph"
                >
                  →
                </button>
              </div>
            ) : null}
          </div>

          <aside
            className={`photo-detail-panel ${isInfoCollapsed ? 'is-collapsed' : ''}`}
            aria-label="Photograph information"
          >
            <button
              className="photo-detail-collapse"
              type="button"
              onClick={() => setIsInfoCollapsed((value) => !value)}
              onPointerUp={(event) => event.currentTarget.blur()}
              aria-expanded={!isInfoCollapsed}
              aria-label={isInfoCollapsed ? 'Show photograph information' : 'Hide photograph information'}
            >
              <i
                className={`fa-solid ${isInfoCollapsed ? 'fa-chevron-left' : 'fa-chevron-right'}`}
                aria-hidden="true"
              />
            </button>
            <div className="photo-detail-panel-content" aria-hidden={isInfoCollapsed}>
              <div className="photo-detail-card-heading">
                <span>{getCollectionLabel(selectedPhoto)}</span>
                <span>{String(selectedIndex + 1).padStart(2, '0')}</span>
              </div>
              {selectedPhoto.description ? <p className="photo-detail-description">{selectedPhoto.description}</p> : null}
              <dl>
                <div>
                  <dt>Location</dt>
                  <dd>{selectedPhoto.location || '—'}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{formatDate(selectedPhoto.takenAt) || '—'}</dd>
                </div>
                {(selectedPhoto.exif?.camera || selectedPhoto.exif?.lens) ? (
                  <div className="photo-detail-wide">
                    <dt>Camera</dt>
                    <dd>{[selectedPhoto.exif.camera, selectedPhoto.exif.lens].filter(Boolean).join(' · ')}</dd>
                  </div>
                ) : null}
                {selectedExposure ? (
                  <div className="photo-detail-wide">
                    <dt>Settings</dt>
                    <dd>{selectedExposure}</dd>
                  </div>
                ) : null}
              </dl>
              {selectedPhoto.coordinates ? (
                <a
                  className="photo-detail-map"
                  href={`https://www.openstreetmap.org/?mlat=${selectedPhoto.coordinates.latitude}&mlon=${selectedPhoto.coordinates.longitude}#map=13/${selectedPhoto.coordinates.latitude}/${selectedPhoto.coordinates.longitude}`}
                  target="_blank"
                  rel="noopener"
                >
                  View location ↗
                </a>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default GalleryPage;
