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

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

// Safe recursive walker for repository bundles (strictly excludes secrets, .env, and node_modules)
export async function analyzeEquipment(body, res) {
  try {
    const payload = typeof body === 'string' ? JSON.parse(body || '{}') : body;
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
}

