import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { exiftool } from 'exiftool-vendored';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(projectRoot, 'public', 'gallery.json');
const galleryAssetsRoot = join(projectRoot, 'public', 'assets', 'gallery');
const trashRoot = join(galleryAssetsRoot, '.trash');
const idPattern = /^[a-z0-9][a-z0-9-]{2,79}$/;

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req, limit = 60 * 1024 * 1024) => new Promise((resolveBody, reject) => {
  const chunks = [];
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) {
      reject(new Error('Upload is too large.'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
    } catch {
      reject(new Error('Invalid JSON request.'));
    }
  });
  req.on('error', reject);
});

const readBinaryBody = (req, limit = 512 * 1024 * 1024) => new Promise((resolveBody, reject) => {
  const chunks = [];
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) {
      reject(new Error('RAW file is too large (maximum 512 MB).'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => resolveBody(Buffer.concat(chunks)));
  req.on('error', reject);
});

const formatExifDate = (value) => {
  const year = Number(value?.year);
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!year || !month || !day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const cleanExifText = (value) => String(value ?? '').trim();

const combineCamera = (make, model) => {
  const cleanMake = cleanExifText(make);
  const cleanModel = cleanExifText(model);
  if (!cleanMake) return cleanModel;
  if (!cleanModel) return cleanMake;
  return cleanModel.toLowerCase().includes(cleanMake.toLowerCase())
    ? cleanModel
    : `${cleanMake} ${cleanModel}`;
};

const normalizeExifTags = (tags) => {
  const latitude = Number(tags.GPSLatitude);
  const longitude = Number(tags.GPSLongitude);
  const focalLength = cleanExifText(tags.FocalLength);
  const exposureTime = cleanExifText(tags.ExposureTime);
  const fNumber = Number(tags.FNumber);
  const iso = Number(tags.ISO);

  return {
    takenAt: formatExifDate(tags.DateTimeOriginal || tags.CreateDate),
    latitude: Number.isFinite(latitude) ? latitude.toFixed(6) : '',
    longitude: Number.isFinite(longitude) ? longitude.toFixed(6) : '',
    camera: combineCamera(tags.Make, tags.Model),
    lens: cleanExifText(tags.LensModel || tags.LensID || tags.LensType),
    focalLength: focalLength && /mm$/i.test(focalLength) ? focalLength : (focalLength ? `${focalLength}mm` : ''),
    aperture: Number.isFinite(fNumber) ? `f/${Number(fNumber.toFixed(2))}` : '',
    shutter: exposureTime && /s$/i.test(exposureTime) ? exposureTime : (exposureTime ? `${exposureTime}s` : ''),
    iso: Number.isFinite(iso) ? String(Math.round(iso)) : '',
  };
};

const decodeJsonObject = (value) => {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const candidates = [
    ...Array.from(text.matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi), (match) => match[1]),
    ...Array.from(text.matchAll(/\{[^{}]*"alt"[^{}]*"description"[^{}]*\}/gi), (match) => match[0]),
  ];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates.reverse()) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next JSON-shaped section in the response.
    }
  }

  const alt = text.match(/(?:^|\n)\s*(?:alt(?:\s+text)?)[：:]\s*(.+)/i)?.[1]?.trim();
  const description = text.match(/(?:^|\n)\s*(?:description|caption)[：:]\s*([\s\S]+)/i)?.[1]?.trim();
  if (alt && description) return { alt, description };
  throw new Error('MiMo did not return usable copy. Please try again.');
};

const cleanTranslatedCopy = (payload) => {
  const alt = String(payload.alt || '').trim().slice(0, 300);
  const description = String(payload.description || '').trim().slice(0, 1000);
  if (!alt && !description) throw new Error('MiMo did not return a translation. Please try again.');
  return { alt, description };
};

const getMessageText = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part === 'string' ? part : part?.text || ''))
    .filter(Boolean)
    .join('\n');
};

const translateGalleryCopy = async (config, input) => {
  if (!config.apiKey) {
    const error = new Error('尚未配置 MIMO_API_KEY。请写入本地 .env.local 后重启开发服务。');
    error.statusCode = 503;
    throw error;
  }

  const source = {
    alt: String(input.alt || '').trim().slice(0, 300),
    description: String(input.description || '').trim().slice(0, 1000),
  };
  if (!source.alt && !source.description) throw new Error('请先填写中文 Alt text 或作品说明。');

  const prompt = [
    'Translate the supplied Chinese photography-portfolio copy into natural English.',
    'Return strict JSON only, with no Markdown, code fence, or extra explanation: {"alt":"...","description":"..."}',
    'Translate faithfully. Preserve the meaning, specificity, tone, names, and place names in the source. Do not add, remove, explain, embellish, or infer any information.',
    'For alt, use concise and accessible English and do not begin with “Image of” or “Photo of”.',
    'For description, use restrained, natural English suitable for a photography portfolio.',
    'If a source field is empty, return that field as an empty string.',
    `Chinese source: ${JSON.stringify(source)}`,
  ].join('\n');

  const baseUrl = String(config.baseUrl || 'https://api.xiaomimimo.com/v1').replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'mimo-v2.5',
      messages: [{
        role: 'user',
        content: prompt,
      }],
      max_tokens: 1200,
      temperature: 0.1,
      thinking: { type: 'disabled' },
      stream: false,
    }),
  });

  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    const error = new Error(`MiMo 请求失败：${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const message = payload?.choices?.[0]?.message;
  const content = getMessageText(message?.content) || getMessageText(message?.reasoning_content);
  return cleanTranslatedCopy(decodeJsonObject(content));
};

const readManifest = async () => JSON.parse(await readFile(manifestPath, 'utf8'));

const writeManifest = async (manifest) => {
  const tempPath = `${manifestPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(tempPath, manifestPath);
};

const decodeWebp = (value) => {
  const match = String(value || '').match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Only generated WebP images are accepted.');
  return Buffer.from(match[1], 'base64');
};

const cleanStrings = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(value))
));

const syncCollections = (manifest, ids) => {
  manifest.collections ||= [];
  const known = new Set((manifest.collections || []).map((collection) => collection.id));
  const nextOrder = () => (
    manifest.collections.length
      ? Math.max(...manifest.collections.map((collection) => Number(collection.order) || 0)) + 10
      : 10
  );
  ids.forEach((id) => {
    if (known.has(id)) return;
    manifest.collections.push({
      id,
      label: id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
      order: nextOrder(),
    });
    known.add(id);
  });
};

const cleanPhotoMetadata = (input) => ({
  alt: String(input.alt || '').trim().slice(0, 300),
  description: String(input.description || '').trim().slice(0, 1000),
  takenAt: /^\d{4}-\d{2}-\d{2}$/.test(input.takenAt || '') ? input.takenAt : '',
  location: String(input.location || '').trim().slice(0, 160),
  collections: cleanStrings(input.collections),
  featured: Boolean(input.featured),
  status: input.status === 'draft' ? 'draft' : 'published',
  coordinates: (() => {
    const latitude = Number(input.coordinates?.latitude);
    const longitude = Number(input.coordinates?.longitude);
    if (
      !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) return null;
    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    };
  })(),
  exif: {
    camera: String(input.exif?.camera || '').trim().slice(0, 100),
    lens: String(input.exif?.lens || '').trim().slice(0, 120),
    focalLength: String(input.exif?.focalLength || '').trim().slice(0, 40),
    aperture: String(input.exif?.aperture || '').trim().slice(0, 40),
    shutter: String(input.exif?.shutter || '').trim().slice(0, 40),
    iso: input.exif?.iso !== null
      && input.exif?.iso !== ''
      && Number.isFinite(Number(input.exif?.iso))
      ? Number(input.exif.iso)
      : null,
  },
});

const isLoopback = (address = '') => (
  address === '127.0.0.1'
  || address === '::1'
  || address === '::ffff:127.0.0.1'
);

function localGalleryAdmin(mimoConfig) {
  return {
    name: 'local-gallery-admin',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (!pathname.startsWith('/api/gallery-admin/')) return next();

        if (!isLoopback(req.socket.remoteAddress)) {
          sendJson(res, 403, { error: 'Gallery management is available only on this computer.' });
          return;
        }

        try {
          if (req.method === 'GET' && pathname === '/api/gallery-admin/manifest') {
            sendJson(res, 200, await readManifest());
            return;
          }

          if (req.method === 'POST' && pathname === '/api/gallery-admin/exif') {
            const encodedName = String(req.headers['x-gallery-filename'] || 'source.raw');
            let fileName = 'source.raw';
            try {
              fileName = decodeURIComponent(encodedName);
            } catch {
              fileName = encodedName;
            }
            const extension = /^\.[a-z0-9]{1,10}$/i.test(extname(fileName))
              ? extname(fileName).toLowerCase()
              : '.raw';
            const contents = await readBinaryBody(req);
            if (!contents.length) throw new Error('The EXIF source file is empty.');

            const tempDir = await mkdtemp(join(tmpdir(), 'homepage-gallery-exif-'));
            const sourcePath = join(tempDir, `source${extension}`);
            try {
              await writeFile(sourcePath, contents);
              const tags = await exiftool.read(sourcePath);
              sendJson(res, 200, {
                metadata: normalizeExifTags(tags),
                warnings: Array.isArray(tags.errors) ? tags.errors.map(String).slice(0, 5) : [],
              });
            } finally {
              await rm(tempDir, { recursive: true, force: true });
            }
            return;
          }

          if (req.method === 'POST' && pathname === '/api/gallery-admin/translate-copy') {
            const body = await readJsonBody(req, 64 * 1024);
            const copy = await translateGalleryCopy(mimoConfig, body);
            sendJson(res, 200, { copy, model: mimoConfig.model });
            return;
          }

          if (req.method === 'POST' && pathname === '/api/gallery-admin/photos') {
            const body = await readJsonBody(req);
            const id = String(body.photo?.id || '').trim().toLowerCase();
            if (!idPattern.test(id)) throw new Error('Identifier must use lowercase letters, numbers, and hyphens.');

            const manifest = await readManifest();
            if (manifest.photos.some((photo) => photo.id === id)) throw new Error('This identifier already exists.');

            const metadata = cleanPhotoMetadata(body.photo || {});
            if (!metadata.alt || !metadata.takenAt) {
              throw new Error('Alt text and date are required.');
            }

            const year = metadata.takenAt.slice(0, 4);
            const relativeDir = `assets/gallery/${year}/${id}`;
            const outputDir = join(projectRoot, 'public', relativeDir);
            await mkdir(outputDir, { recursive: true });
            await Promise.all([
              writeFile(join(outputDir, 'thumb.webp'), decodeWebp(body.images?.thumb)),
              writeFile(join(outputDir, 'full.webp'), decodeWebp(body.images?.full)),
            ]);

            const now = new Date().toISOString();
            const photo = {
              id,
              ...metadata,
              thumb: `${relativeDir}/thumb.webp`,
              src: `${relativeDir}/full.webp`,
              width: Number(body.images?.width) || 1,
              height: Number(body.images?.height) || 1,
              order: manifest.photos.length
                ? Math.max(...manifest.photos.map((item) => Number(item.order) || 0)) + 10
                : 10,
              createdAt: now,
              updatedAt: now,
            };

            syncCollections(manifest, photo.collections);
            manifest.photos.push(photo);
            await writeManifest(manifest);
            sendJson(res, 201, { photo, manifest });
            return;
          }

          if (req.method === 'POST' && pathname === '/api/gallery-admin/order') {
            const body = await readJsonBody(req, 1024 * 1024);
            const ids = Array.isArray(body.ids) ? body.ids : [];
            const manifest = await readManifest();
            if (ids.length !== manifest.photos.length || new Set(ids).size !== ids.length) {
              throw new Error('The new order does not match the gallery.');
            }
            const byId = new Map(manifest.photos.map((photo) => [photo.id, photo]));
            if (ids.some((id) => !byId.has(id))) throw new Error('The new order contains an unknown photo.');
            manifest.photos = ids.map((id, index) => ({
              ...byId.get(id),
              order: (index + 1) * 10,
              updatedAt: new Date().toISOString(),
            }));
            await writeManifest(manifest);
            sendJson(res, 200, { manifest });
            return;
          }

          const photoMatch = pathname.match(/^\/api\/gallery-admin\/photos\/([a-z0-9-]+)$/);
          if (photoMatch && req.method === 'PATCH') {
            const body = await readJsonBody(req, 1024 * 1024);
            const manifest = await readManifest();
            const index = manifest.photos.findIndex((photo) => photo.id === photoMatch[1]);
            if (index < 0) throw new Error('Photo not found.');
            const metadata = cleanPhotoMetadata(body.photo || {});
            if (!metadata.alt || !metadata.takenAt) {
              throw new Error('Alt text and date are required.');
            }
            const { title: _legacyTitle, ...existingPhoto } = manifest.photos[index];
            manifest.photos[index] = {
              ...existingPhoto,
              ...metadata,
              updatedAt: new Date().toISOString(),
            };
            syncCollections(manifest, manifest.photos[index].collections);
            await writeManifest(manifest);
            sendJson(res, 200, { photo: manifest.photos[index], manifest });
            return;
          }

          if (photoMatch && req.method === 'DELETE') {
            const manifest = await readManifest();
            const index = manifest.photos.findIndex((photo) => photo.id === photoMatch[1]);
            if (index < 0) throw new Error('Photo not found.');
            const [removed] = manifest.photos.splice(index, 1);

            if (String(removed.src || '').startsWith('assets/gallery/')) {
              const sourceDir = resolve(projectRoot, 'public', dirname(removed.src));
              if (sourceDir.startsWith(resolve(galleryAssetsRoot))) {
                await mkdir(trashRoot, { recursive: true });
                await rename(sourceDir, join(trashRoot, `${removed.id}-${Date.now()}`));
              }
            }

            manifest.photos = manifest.photos.map((photo, orderIndex) => ({
              ...photo,
              order: (orderIndex + 1) * 10,
            }));
            await writeManifest(manifest);
            sendJson(res, 200, { manifest, recoverable: true });
            return;
          }

          sendJson(res, 404, { error: 'Unknown gallery admin endpoint.' });
        } catch (error) {
          sendJson(res, error.statusCode || 400, { error: error.message || 'Gallery operation failed.' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  return {
    base: '/',
    plugins: [react(), localGalleryAdmin({
      apiKey: env.MIMO_API_KEY,
      baseUrl: env.MIMO_API_BASE_URL || 'https://api.xiaomimimo.com/v1',
      model: env.MIMO_MODEL || 'mimo-v2.5',
    })],
  };
});
