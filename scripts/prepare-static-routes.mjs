import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const galleryRoot = resolve(distRoot, 'gallery');

await mkdir(galleryRoot, { recursive: true });
await copyFile(resolve(distRoot, 'index.html'), resolve(galleryRoot, 'index.html'));
