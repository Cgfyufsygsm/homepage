import { useEffect, useMemo, useRef, useState } from 'react';
import { toPublicUrl } from '../utils/siteContent';
import '../gallery-admin.css';

const emptyForm = () => ({
  id: '',
  alt: '',
  description: '',
  takenAt: '',
  location: '',
  latitude: '',
  longitude: '',
  collections: '',
  featured: false,
  status: 'published',
  camera: '',
  lens: '',
  focalLength: '',
  aperture: '',
  shutter: '',
  iso: '',
});

const rawExtensions = new Set([
  '3fr', 'arw', 'cr2', 'cr3', 'dng', 'erf', 'fff', 'iiq', 'kdc', 'mef', 'mos',
  'mrw', 'nef', 'nrw', 'orf', 'pef', 'raf', 'raw', 'rw2', 'rwl', 'sr2', 'srf',
  'srw', 'x3f',
]);

const metadataExtensions = new Set([
  ...rawExtensions,
  'avif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp',
]);

const getExtension = (fileName) => String(fileName || '').split('.').pop()?.toLowerCase() || '';

const isMetadataSource = (file) => (
  Boolean(file)
  && (file.type.startsWith('image/') || metadataExtensions.has(getExtension(file.name)))
);

const readPhotoMetadata = async (sourceFile) => {
  const response = await fetch('/api/gallery-admin/exif', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Gallery-Filename': encodeURIComponent(sourceFile.name),
    },
    body: sourceFile,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '无法读取 EXIF。');
  return json.metadata || {};
};

const slugify = (value) => String(value || '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 56);

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const canvasToWebp = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('This browser could not generate a WebP image.'));
  }, 'image/webp', quality);
});

const renderSize = async (bitmap, maxSide, quality) => {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, width, height);
  const blob = await canvasToWebp(canvas, quality);
  return { dataUrl: await blobToDataUrl(blob), width, height };
};

const prepareImages = async (file) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const [full, thumb] = await Promise.all([
      renderSize(bitmap, 2800, 0.9),
      renderSize(bitmap, 1000, 0.82),
    ]);
    return { full: full.dataUrl, thumb: thumb.dataUrl, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
};

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || '操作失败');
  return json;
};

function GalleryAdminPage({ data }) {
  const [manifest, setManifest] = useState({ collections: [], photos: [] });
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [exifSourceFile, setExifSourceFile] = useState(null);
  const [gpsSourceFile, setGpsSourceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const metadataRequestRef = useRef(0);

  const photos = useMemo(
    () => [...(manifest.photos || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [manifest.photos]
  );

  const getPhotoLabel = (photo) => photo.location || photo.takenAt || photo.id;

  useEffect(() => {
    document.body.classList.add('gallery-admin-mode');
    document.title = 'Local Gallery Manager';
    request('/api/gallery-admin/manifest')
      .then(setManifest)
      .catch((err) => setError(err.message));
    return () => document.body.classList.remove('gallery-admin-mode');
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const applyMetadataFromFile = async (sourceFile, sourceLabel, allowedKeys = null) => {
    if (!isMetadataSource(sourceFile)) {
      setError('请选择照片原片；EXIF 来源支持常见 RAW、JPEG、HEIC 和 TIFF。');
      return;
    }

    const requestId = metadataRequestRef.current + 1;
    metadataRequestRef.current = requestId;
    setError('');
    setMessage(`正在从${sourceLabel}读取 EXIF…`);

    try {
      const metadata = await readPhotoMetadata(sourceFile);
      if (requestId !== metadataRequestRef.current) return;
      const entries = Object.entries(metadata).filter(([key, value]) => (
        value !== '' && (!allowedKeys || allowedKeys.includes(key))
      ));
      if (!entries.length) {
        setMessage(allowedKeys
          ? `没有从${sourceLabel}读到 GPS 坐标；文件可能没有定位信息。`
          : `没有从${sourceLabel}读到日期、GPS 或拍摄参数；文件可能没有这些元数据。`);
        return;
      }
      setForm((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
      const labels = {
        takenAt: '日期',
        latitude: 'GPS',
        longitude: 'GPS',
        camera: '相机',
        lens: '镜头',
        focalLength: '焦距',
        aperture: '光圈',
        shutter: '快门',
        iso: 'ISO',
      };
      const found = [...new Set(entries.map(([key]) => labels[key]))].join('、');
      setMessage(`已从${sourceLabel}读取：${found}。这些字段仍可手动修改。`);
    } catch (readError) {
      if (requestId !== metadataRequestRef.current) return;
      const extension = getExtension(sourceFile.name).toUpperCase() || '该';
      setMessage(`未能解析这个 ${extension} 文件的 EXIF：${readError.message}`);
    }
  };

  const chooseExifSource = (nextFile) => {
    if (!isMetadataSource(nextFile)) {
      setError('请选择照片原片；EXIF 来源支持常见 RAW、JPEG、HEIC 和 TIFF。');
      return;
    }
    setExifSourceFile(nextFile);
    applyMetadataFromFile(nextFile, ` EXIF 原片 ${nextFile.name}`);
  };

  const chooseGpsSource = (nextFile) => {
    if (!isMetadataSource(nextFile)) {
      setError('请选择包含 GPS 的照片原片；支持常见 RAW、JPEG、HEIC 和 TIFF。');
      return;
    }
    setGpsSourceFile(nextFile);
    applyMetadataFromFile(nextFile, ` GPS 来源图 ${nextFile.name}`, ['latitude', 'longitude']);
  };

  const chooseFile = async (nextFile) => {
    if (!nextFile || !nextFile.type.startsWith('image/')) {
      setError('请选择 JPEG、PNG 或 WebP 图片。');
      return;
    }
    setError('');
    setFile(nextFile);
    const baseName = nextFile.name.replace(/\.[^.]+$/, '');
    setForm((current) => {
      const datePrefix = current.takenAt ? current.takenAt.slice(0, 4) : new Date().getFullYear();
      const suffix = slugify(baseName) || `photo-${Date.now().toString(36)}`;
      return {
        ...current,
        id: current.id || `${datePrefix}-${suffix}`,
      };
    });

    applyMetadataFromFile(nextFile, '展示图');
  };

  const resetEditor = () => {
    setForm(emptyForm());
    setFile(null);
    setExifSourceFile(null);
    setGpsSourceFile(null);
    metadataRequestRef.current += 1;
    setEditingId('');
    setError('');
  };

  const serializePhoto = () => ({
    id: form.id.trim().toLowerCase(),
    alt: form.alt.trim(),
    description: form.description.trim(),
    takenAt: form.takenAt,
    location: form.location.trim(),
    collections: form.collections.split(',').map((value) => slugify(value)).filter(Boolean),
    featured: form.featured,
    status: form.status,
    coordinates: form.latitude !== '' && form.longitude !== ''
      ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
      : null,
    exif: {
      camera: form.camera.trim(),
      lens: form.lens.trim(),
      focalLength: form.focalLength.trim(),
      aperture: form.aperture.trim(),
      shutter: form.shutter.trim(),
      iso: form.iso === '' ? null : Number(form.iso),
    },
  });

  const translateCopy = async () => {
    setAiBusy(true);
    setError('');
    setMessage('正在请 MiMo 将中文文案翻译成英文…');

    try {
      const source = {
        alt: form.alt.trim(),
        description: form.description.trim(),
      };
      if (!source.alt && !source.description) throw new Error('请先填写中文 Alt text 或作品说明。');
      const result = await request('/api/gallery-admin/translate-copy', {
        method: 'POST',
        body: JSON.stringify(source),
      });
      setForm((current) => ({
        ...current,
        alt: result.copy.alt || current.alt,
        description: source.description ? result.copy.description : current.description,
      }));
      setMessage('英文翻译已覆盖回表单，请检查后再保存。');
    } catch (generationError) {
      setError(generationError.message);
      setMessage('');
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage(editingId ? '正在保存修改…' : '正在生成缩略图和展示大图…');

    try {
      if (editingId) {
        const result = await request(`/api/gallery-admin/photos/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ photo: serializePhoto() }),
        });
        setManifest(result.manifest);
        setMessage('作品信息已更新。');
      } else {
        if (!file) throw new Error('请先选择一张照片。');
        const images = await prepareImages(file);
        setMessage('正在写入作品目录…');
        const result = await request('/api/gallery-admin/photos', {
          method: 'POST',
          body: JSON.stringify({ photo: serializePhoto(), images }),
        });
        setManifest(result.manifest);
        setMessage('照片已加入 Gallery。');
      }
      resetEditor();
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (photo) => {
    setEditingId(photo.id);
    setFile(null);
    setExifSourceFile(null);
    setGpsSourceFile(null);
    setForm({
      id: photo.id,
      alt: photo.alt || '',
      description: photo.description || '',
      takenAt: photo.takenAt || '',
      location: photo.location || '',
      latitude: photo.coordinates?.latitude ?? '',
      longitude: photo.coordinates?.longitude ?? '',
      collections: (photo.collections || []).join(', '),
      featured: Boolean(photo.featured),
      status: photo.status || 'published',
      camera: photo.exif?.camera || '',
      lens: photo.exif?.lens || '',
      focalLength: photo.exif?.focalLength || '',
      aperture: photo.exif?.aperture || '',
      shutter: photo.exif?.shutter || '',
      iso: photo.exif?.iso ?? '',
    });
    setMessage(`正在编辑：${getPhotoLabel(photo)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removePhoto = async (photo) => {
    if (!window.confirm(`从 Gallery 移除“${getPhotoLabel(photo)}”？图片会移动到本地 .trash，可恢复。`)) return;
    setBusy(true);
    setError('');
    try {
      const result = await request(`/api/gallery-admin/photos/${photo.id}`, { method: 'DELETE' });
      setManifest(result.manifest);
      setMessage('作品已移除，图片已放入本地 .trash。');
      if (editingId === photo.id) resetEditor();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const movePhoto = async (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setBusy(true);
    try {
      const result = await request('/api/gallery-admin/order', {
        method: 'POST',
        body: JSON.stringify({ ids: reordered.map((photo) => photo.id) }),
      });
      setManifest(result.manifest);
      setMessage('展示顺序已更新。');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gallery-admin-shell">
      <header className="gallery-admin-header">
        <div>
          <span>LOCAL ONLY</span>
          <h1>Gallery Manager</h1>
          <p>添加、整理和发布摄影作品。保存后会直接写入项目目录。</p>
        </div>
        <div className="gallery-admin-header-actions">
          <a href="/gallery" target="_blank" rel="noopener">预览 Gallery ↗</a>
          <a href="/">返回主页</a>
        </div>
      </header>

      {(message || error) ? (
        <div className={`gallery-admin-notice ${error ? 'error' : ''}`} role="status">
          {error || message}
        </div>
      ) : null}

      <div className="gallery-admin-layout">
        <section className="gallery-admin-editor">
          <div className="gallery-admin-section-title">
            <div>
              <span>01</span>
              <h2>{editingId ? '编辑作品' : '添加新照片'}</h2>
            </div>
            {editingId ? <button type="button" onClick={resetEditor}>取消编辑</button> : null}
          </div>

          <form onSubmit={submit}>
            {!editingId ? (
              <label
                className={`gallery-upload-zone ${previewUrl ? 'has-image' : ''}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseFile(event.dataTransfer.files?.[0]);
                }}
              >
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
                {previewUrl ? <img src={previewUrl} alt="待添加照片预览" /> : null}
                <span className="gallery-upload-copy">
                  <strong>{file ? file.name : '拖入照片，或点击选择'}</strong>
                  <small>会自动生成 1000px 缩略图和 2800px 展示图</small>
                </span>
              </label>
            ) : null}

            <div className={`gallery-exif-source ${exifSourceFile ? 'has-file' : ''}`}>
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseExifSource(event.dataTransfer.files?.[0]);
                }}
              >
                <input
                  type="file"
                  accept="image/*,.3fr,.arw,.cr2,.cr3,.dng,.erf,.fff,.iiq,.kdc,.mef,.mos,.mrw,.nef,.nrw,.orf,.pef,.raf,.raw,.rw2,.rwl,.sr2,.srf,.srw,.x3f"
                  onChange={(event) => chooseExifSource(event.target.files?.[0])}
                />
                <span className="gallery-exif-source-icon">EXIF</span>
                <span className="gallery-exif-source-copy">
                  <strong>{exifSourceFile ? exifSourceFile.name : '可选：拖入另一张原片读取 EXIF'}</strong>
                  <small>支持常见 RAW / JPEG / HEIC / TIFF；只读取元数据，不保存或发布原片</small>
                </span>
              </label>
              {exifSourceFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setExifSourceFile(null);
                    metadataRequestRef.current += 1;
                    setMessage('已移除 EXIF 来源文件；已经填入的字段会保留。');
                  }}
                >
                  移除来源
                </button>
              ) : null}
            </div>

            <div className={`gallery-exif-source gps-only ${gpsSourceFile ? 'has-file' : ''}`}>
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseGpsSource(event.dataTransfer.files?.[0]);
                }}
              >
                <input
                  type="file"
                  accept="image/*,.3fr,.arw,.cr2,.cr3,.dng,.erf,.fff,.iiq,.kdc,.mef,.mos,.mrw,.nef,.nrw,.orf,.pef,.raf,.raw,.rw2,.rwl,.sr2,.srf,.srw,.x3f"
                  onChange={(event) => chooseGpsSource(event.target.files?.[0])}
                />
                <span className="gallery-exif-source-icon">GPS</span>
                <span className="gallery-exif-source-copy">
                  <strong>{gpsSourceFile ? gpsSourceFile.name : '可选：拖入另一张图仅读取 GPS'}</strong>
                  <small>只覆盖纬度和经度，不修改日期、相机、镜头或曝光参数</small>
                </span>
              </label>
              {gpsSourceFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setGpsSourceFile(null);
                    metadataRequestRef.current += 1;
                    setMessage('已移除 GPS 来源文件；已经填入的坐标会保留。');
                  }}
                >
                  移除来源
                </button>
              ) : null}
            </div>

            <label>
              <span>拍摄日期 *</span>
              <input type="date" value={form.takenAt} onChange={(event) => update('takenAt', event.target.value)} required />
            </label>

            <label>
              <span>画面内容 / Alt text *</span>
              <input value={form.alt} onChange={(event) => update('alt', event.target.value)} required placeholder="先用中文客观描述照片中看到的内容" />
              <small>可以先写中文，再使用下方 MiMo 按钮翻译成英文。</small>
            </label>

            <label>
              <span>作品说明（可选）</span>
              <textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="3" placeholder="先用中文写拍摄背景、感受或故事" />
              <small>留空也可以；翻译不会添加原文中没有的信息。</small>
            </label>

            <div className="gallery-ai-assist">
              <span className="gallery-ai-assist-icon">译</span>
              <span className="gallery-ai-assist-copy">
                <strong>MiMo 中译英</strong>
                <small>只翻译上面的中文文案，不读取照片、不生成或补写内容；英文会覆盖回表单</small>
              </span>
              <button
                type="button"
                disabled={aiBusy || busy || (!form.alt.trim() && !form.description.trim())}
                onClick={translateCopy}
              >
                {aiBusy ? '翻译中…' : '翻译成英文'}
              </button>
            </div>

            <div className="gallery-admin-fields two-columns">
              <label>
                <span>地点</span>
                <input value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="Deqin, Yunnan" />
              </label>
              <label>
                <span>分类</span>
                <input value={form.collections} onChange={(event) => update('collections', event.target.value)} placeholder="mountains, travel" />
                <small>
                  已有：{(manifest.collections || []).map((collection) => collection.id).join(', ') || '暂无'}；输入新名称会自动创建分类。
                </small>
              </label>
            </div>

            <fieldset className="gallery-admin-gps">
              <legend>照片定位</legend>
              <div className="gallery-admin-fields two-columns">
                <label>
                  <span>纬度 Latitude</span>
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    value={form.latitude}
                    onChange={(event) => update('latitude', event.target.value)}
                    placeholder="27.823456"
                  />
                </label>
                <label>
                  <span>经度 Longitude</span>
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    value={form.longitude}
                    onChange={(event) => update('longitude', event.target.value)}
                    placeholder="98.767890"
                  />
                </label>
              </div>
              <div className="gallery-admin-gps-note">
                <span>GPS 来源图只会更新这里的坐标；坐标将公开写入 gallery.json。</span>
                {(form.latitude !== '' || form.longitude !== '') ? (
                  <button type="button" onClick={() => setForm((current) => ({ ...current, latitude: '', longitude: '' }))}>
                    清除定位
                  </button>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="gallery-admin-exif">
              <legend>EXIF 信息</legend>
              <div className="gallery-admin-fields two-columns">
                <label>
                  <span>相机</span>
                  <input value={form.camera} onChange={(event) => update('camera', event.target.value)} placeholder="Sony A7 IV" />
                </label>
                <label>
                  <span>镜头</span>
                  <input value={form.lens} onChange={(event) => update('lens', event.target.value)} placeholder="FE 24-70mm F2.8" />
                </label>
                <label>
                  <span>焦距</span>
                  <input value={form.focalLength} onChange={(event) => update('focalLength', event.target.value)} placeholder="35mm" />
                </label>
                <label>
                  <span>光圈</span>
                  <input value={form.aperture} onChange={(event) => update('aperture', event.target.value)} placeholder="f/2.8" />
                </label>
                <label>
                  <span>快门</span>
                  <input value={form.shutter} onChange={(event) => update('shutter', event.target.value)} placeholder="1/250s" />
                </label>
                <label>
                  <span>ISO</span>
                  <input type="number" min="0" step="1" value={form.iso} onChange={(event) => update('iso', event.target.value)} placeholder="100" />
                </label>
              </div>
            </fieldset>

            <label>
              <span>作品 ID *</span>
              <input value={form.id} onChange={(event) => update('id', slugify(event.target.value))} required disabled={Boolean(editingId)} placeholder="2025-mianzimu-before-sunrise" />
              <small>只使用小写英文、数字和连字符；发布后不再修改。</small>
            </label>

            <div className="gallery-admin-publish-row">
              <label className="gallery-admin-checkbox">
                <input type="checkbox" checked={form.featured} onChange={(event) => update('featured', event.target.checked)} />
                <span>精选作品</span>
              </label>
              <label>
                <span>状态</span>
                <select value={form.status} onChange={(event) => update('status', event.target.value)}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </label>
            </div>

            <button className="gallery-admin-primary" type="submit" disabled={busy || aiBusy}>
              {busy ? '处理中…' : editingId ? '保存修改' : '处理并添加照片'}
            </button>
          </form>
        </section>

        <section className="gallery-admin-library">
          <div className="gallery-admin-section-title">
            <div>
              <span>02</span>
              <h2>作品库</h2>
            </div>
            <strong>{photos.length} 张</strong>
          </div>

          <div className="gallery-admin-list">
            {photos.map((photo, index) => (
              <article key={photo.id} className={editingId === photo.id ? 'editing' : ''}>
                <img src={toPublicUrl(photo.thumb || photo.src)} alt={photo.alt || 'Photography work'} />
                <div className="gallery-admin-card-main">
                  <div>
                    <strong>{getPhotoLabel(photo)}</strong>
                    <span>{photo.takenAt || 'No date'} · {photo.status || 'published'}</span>
                  </div>
                  <div className="gallery-admin-tags">
                    {(photo.collections || []).map((collection) => <span key={collection}>{collection}</span>)}
                  </div>
                  <div className="gallery-admin-card-actions">
                    <button type="button" onClick={() => movePhoto(index, -1)} disabled={busy || index === 0} aria-label={`上移 ${getPhotoLabel(photo)}`}>↑</button>
                    <button type="button" onClick={() => movePhoto(index, 1)} disabled={busy || index === photos.length - 1} aria-label={`下移 ${getPhotoLabel(photo)}`}>↓</button>
                    <button type="button" onClick={() => startEdit(photo)} disabled={busy}>编辑</button>
                    <button type="button" className="danger" onClick={() => removePhoto(photo)} disabled={busy}>移除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default GalleryAdminPage;
