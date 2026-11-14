/**
 * Lab4All — Local Development & API Server
 *
 * Serves the compiled `dist/` directory over HTTP and provides the
 * `POST /api/equipment` endpoint backed by Google Gemini Multimodal Vision API
 * (using the secure local `GEMINI_API_KEY` in `.env`) with seamless fallback
 * to deterministic specification parsing (`src/ai/extractor.ts`).
 */

import http from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_GEMINI_MODEL,
  buildPresetExtraction,
  parseEquipmentSpecificationText,
  KNOWN_PRODUCT_URL_CATALOG,
  resolveExactEquipmentPreset,
} from '../src/ai/extractor.ts';
import { geminiQuotaRetryAt, isReferencePhoto, reconstructApparatusWithGemini, resolveGeminiModel } from '../src/ai/geminiReconstruction.ts';
import { collectProductReference } from './productReference.mjs';
import { PRESET_PHOTO_REFERENCES } from '../src/ai/presetPhotos.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
let port = Number(process.env.PORT || 4173);

let presetPhotoHashes;
function matchLinkedPresetPhoto(photos, category, url) {
  if (!photos.length || category !== 'projectile_motion_apparatus') return undefined;
  if (!presetPhotoHashes) {
    presetPhotoHashes = new Map();
    for (const [id, filename] of PRESET_PHOTO_REFERENCES) {
      const file = path.join(rootDir, 'src/assets/preset-references', filename);
      if (!fs.existsSync(file)) continue;
      const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (presetPhotoHashes.has(hash) && presetPhotoHashes.get(hash) !== id) presetPhotoHashes.set(hash, null);
      else presetPhotoHashes.set(hash, id);
    }
  }
  let match;
  for (const photo of photos) {
    const data = Buffer.from(photo.slice(photo.indexOf(',') + 1), 'base64');
    const id = presetPhotoHashes.get(createHash('sha256').update(data).digest('hex'));
    if (!id) continue;
    if (match && match.id !== id) return undefined;
    match ??= { id, photo };
  }
  if (!match) return undefined;
  const preset = buildPresetExtraction(match.id, category, url);
  return preset && { ...preset, fetched_image: match.photo, photo_preset_match: true };
}

// Secure local .env loader (never bundles keys to client or git)
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim();
            if (!process.env[k]) {
              process.env[k] = v;
            }
          }
        }
      }
    } catch {}
  }
}
loadEnv();

const publicReconstructionCache = new Map();
const pendingPublicReconstructions = new Map();
const publicReconstructionLimit = 24;
const publicReconstructionLifetime = 30 * 60 * 1000;

function publicReferenceKey(url, text, photos, model) {
  const hash = createHash('sha256').update(JSON.stringify([url, text, resolveGeminiModel(model)]));
  for (const photo of photos) hash.update('\0').update(photo);
  return hash.digest('hex');
}

function readPublicReconstruction(key) {
  const cached = publicReconstructionCache.get(key);
  if (!cached) return undefined;
  if (cached.expires <= Date.now()) {
    publicReconstructionCache.delete(key);
    return undefined;
  }
  return { ...cached.result };
}

function storePublicReconstruction(key, result) {
  if (result?.equipment_type !== 'projectile_motion_apparatus') return;
  publicReconstructionCache.set(key, { result: { ...result }, expires: Date.now() + publicReconstructionLifetime });
  if (publicReconstructionCache.size > publicReconstructionLimit) {
    publicReconstructionCache.delete(publicReconstructionCache.keys().next().value);
  }
}

async function reconstructPublicReference(key, reconstruct) {
  if (!key) return reconstruct();
  const cached = readPublicReconstruction(key);
  if (cached) return cached;
  let pending = pendingPublicReconstructions.get(key);
  if (!pending) {
    pending = reconstruct();
    pendingPublicReconstructions.set(key, pending);
  }
  try {
    const result = await pending;
    if (pendingPublicReconstructions.get(key) === pending) storePublicReconstruction(key, result);
    return result && { ...result };
  } finally {
    if (pendingPublicReconstructions.get(key) === pending) pendingPublicReconstructions.delete(key);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  // API Endpoint: GET /api/status (reports AI engine status without leaking keys)
  if (req.method === 'GET' && urlObj.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'online',
        ai_vision_engine: Boolean(process.env.GEMINI_API_KEY),
        model: DEFAULT_GEMINI_MODEL,
      })
    );
    return;
  }

  // API Endpoint: POST /api/equipment
  if (req.method === 'POST' && urlObj.pathname === '/api/equipment') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        let notesText = String(payload.notes || '');
        let referenceText = notesText;
        const targetUrl = String(payload.url || '').trim();
        let fetchedTitle = '';
        const exactPreset = resolveExactEquipmentPreset(
          notesText, payload.category || 'projectile_motion_apparatus', targetUrl,
          Boolean(payload.image || payload.images?.length)
        );
        if (exactPreset) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(exactPreset));
          return;
        }

        // 1. Check built-in catalog for known physics vendor product URLs
        for (const item of KNOWN_PRODUCT_URL_CATALOG) {
          if (item.pattern.test(targetUrl) || item.pattern.test(notesText)) {
            fetchedTitle = item.title;
            if (!notesText.includes(item.specs)) {
              notesText = `${item.specs}\n${notesText}`.trim();
            }
            break;
          }
        }

        // Collect the product's own photos and specifications before reconstructing.
        const uploads = [...new Set([payload.image, ...(Array.isArray(payload.images) ? payload.images.slice(0, 3) : [])]
          .filter(isReferencePhoto))];
        let referencePhotos = [];
        let productLink = targetUrl;
        let linkUnreadable = false;
        if (targetUrl) {
          try {
            const reference = await collectProductReference(targetUrl, Math.max(0, 4 - uploads.length));
            productLink = reference.url;
            const linkedPreset = resolveExactEquipmentPreset('', payload.category || 'projectile_motion_apparatus', productLink, uploads.length > 0);
            const category = payload.category || 'projectile_motion_apparatus';
            const identity = [reference.brand, reference.title].filter(Boolean).join(' ');
            const brandPatterns = [
              [/\bpasco\b/i, /^ME-68(?:00|25B?)$/i],
              [/\bvernier\b/i, /^VPL$/i],
              [/\beisco\b/i, /^PH0343$/i],
              [/\barbor\b/i, /^94-1970$/i],
              [/\b(?:boreal|vwr|avantor)\b/i, /^8884857$/],
              [/\b(?:gsc|go science crazy)\b/i, /^(?:PROLCH|S38982)$/i],
            ];
            const catalogCode = reference.identifiers.find(code => brandPatterns.some(([brand, pattern]) =>
              brand.test(identity) && pattern.test(code)));
            const structuredPreset = catalogCode && resolveExactEquipmentPreset(catalogCode, category, '');
            referencePhotos = reference.photos.filter(isReferencePhoto);
            const match = linkedPreset || structuredPreset || matchLinkedPresetPhoto(referencePhotos, category, productLink);
            if (match) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ...match, fetched_url: productLink }));
              return;
            }
            referencePhotos = reference.photos.filter(isReferencePhoto);
            fetchedTitle = reference.title || fetchedTitle;
            notesText = [notesText, reference.text].filter(Boolean).join('\n');
            referenceText = [referenceText, reference.text].filter(Boolean).join('\n');
          } catch {
            linkUnreadable = true;
          }
        }
        const [primaryPhoto, ...extraPhotos] = [...new Set([...uploads, ...referencePhotos])].slice(0, 4);
        const uploadedPhotos = new Set(uploads);
        const productPhotos = [primaryPhoto, ...extraPhotos].filter(photo => photo && !uploadedPhotos.has(photo));
        const otherProductPhotos = selected => {
          const alternatives = productPhotos.filter(photo => photo !== selected);
          return alternatives.length ? alternatives : undefined;
        };

        // Only stock product references are shared across requests. Uploads, notes and custom keys bypass this cache.
        const customKey = payload.apiKey?.trim();
        const cacheKey = targetUrl && primaryPhoto && !uploads.length && !customKey && !String(payload.notes || '').trim()
          ? publicReferenceKey(productLink, referenceText, [primaryPhoto, ...extraPhotos], payload.model) : undefined;
        const effectiveApiKey = customKey || process.env.GEMINI_API_KEY;
        const geminiResult = await reconstructPublicReference(cacheKey, () => reconstructApparatusWithGemini({
          text: referenceText,
          url: productLink,
          image: primaryPhoto,
          images: extraPhotos,
          apiKey: effectiveApiKey,
          model: payload.model,
        }));

        if (geminiResult) {
          if (fetchedTitle && !geminiResult.fetched_title) {
            geminiResult.fetched_title = fetchedTitle;
          }
          const photoIndex = geminiResult.fetched_image_index ?? 1;
          const selectedPhoto = [primaryPhoto, ...extraPhotos][photoIndex - 1];
          if (primaryPhoto && !geminiResult.fetched_image) {
            geminiResult.fetched_image = selectedPhoto ?? primaryPhoto;
            geminiResult.fetched_image_index = selectedPhoto ? photoIndex : 1;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ...geminiResult, alternate_product_photos: otherProductPhotos(geminiResult.fetched_image) }));
          return;
        }

        // 4. Fallback to deterministic parser if AI is unavailable or offline
        const extracted = parseEquipmentSpecificationText(
          notesText,
          payload.category || 'projectile_motion_apparatus',
          targetUrl
        );
        extracted.vision_retry_at = geminiQuotaRetryAt(effectiveApiKey);
        if (fetchedTitle) {
          extracted.fetched_title = fetchedTitle;
          extracted.fetched_url = targetUrl || undefined;
          const confirmedCount = Object.values(extracted.dimension_candidates).filter(
            (c) =>
              c &&
              c.source !== 'visual_estimate' &&
              c.source !== 'unstated_default' &&
              !/\b(approx|approximate|estimated|estimate|proportion|proportional|calculated|inferred|assumed|~)\b/i.test(c.quote)
          ).length;
          const estimatedCount = Object.keys(extracted.dimension_candidates).length - confirmedCount;
          extracted.description = `Fetched & analyzed "${fetchedTitle}" (${confirmedCount} dimensions confirmed from traceable source, ${estimatedCount} estimated).`;
        }
        if (primaryPhoto && !extracted.fetched_image) extracted.fetched_image = primaryPhoto;
        extracted.alternate_product_photos = otherProductPhotos(extracted.fetched_image);
        if (linkUnreadable && !primaryPhoto && !notesText.trim()) {
          extracted.equipment_type = 'uncertain';
          extracted.description = 'Could not read this product link. Try uploading a product photo or pasting its specifications.';
        } else if (referencePhotos.length && !geminiResult) {
          extracted.uncertainty.unshift('AI vision was unavailable. This draft uses the written product information.');
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(extracted));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Invalid equipment request payload.',
          })
        );
      }
    });
    return;
  }

  // Static file serving from dist/
  let safePath = path.normalize(decodeURIComponent(urlObj.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(distDir, safePath);
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    port++;
    console.log(`Port busy, retrying on http://127.0.0.1:${port}...`);
    setTimeout(() => {
      server.listen(port, '127.0.0.1');
    }, 200);
  } else {
    throw err;
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Lab4All server listening on http://127.0.0.1:${port}`);
  if (process.env.GEMINI_API_KEY) {
    console.log(`✓ Gemini vision configured (${DEFAULT_GEMINI_MODEL})`);
  }
});
