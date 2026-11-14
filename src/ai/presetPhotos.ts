import { BOREAL_ID, GSC_PROLCH_ID, PASCO_MINI_ID, VERNIER_VPL_ID } from '../equipment/schema.ts';

export const PRESET_PHOTO_REFERENCES = [
  [GSC_PROLCH_ID, 'europa-gsc-prolch.jpg'],
  [GSC_PROLCH_ID, 'europa-gsc-retailer.jpg'],
  [BOREAL_ID, 'europa-boreal-reference.jpg'],
  [PASCO_MINI_ID, 'europa-pasco-mini-reference.png'],
  ['pasco-me6800-style', 'europa-pasco-reference.png'],
  ['arbor-mini-94-1970', 'europa-arbor-reference.jpg'],
  ['arbor-mini-94-1970', 'europa-arbor-reference-alt.jpg'],
  ['eisco-ph0343', 'europa-eisco-reference.jpg'],
  [VERNIER_VPL_ID, 'europa-vernier-reference.jpg'],
] as const;

const isWhite = (data: Uint8ClampedArray, i: number) =>
  Math.min(data[i], data[i + 1], data[i + 2]) > 234;

async function photoSignature(src: string) {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    const size = 96;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let left = size, top = size, right = -1, bottom = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isWhite(data, (y * size + x) * 4)) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right - left < 12 || bottom - top < 12) return undefined;
    const output = 28;
    ctx.fillRect(0, 0, output, output);
    ctx.drawImage(image, left * image.naturalWidth / size, top * image.naturalHeight / size,
      (right - left + 1) * image.naturalWidth / size, (bottom - top + 1) * image.naturalHeight / size,
      0, 0, output, output);
    return ctx.getImageData(0, 0, output, output).data;
  } catch {
    return undefined;
  }
}

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let difference = 0;
  let pixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (isWhite(a, i) && isWhite(b, i)) continue;
    difference += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    pixels++;
  }
  return pixels ? difference / (pixels * 3 * 255) : 1;
}

let catalog: Promise<{ id: string; signature: Uint8ClampedArray | undefined }[]> | undefined;
export async function matchPresetPhoto(photos: readonly (string | undefined)[]) {
  if (typeof Image !== 'function' || typeof document === 'undefined') return undefined;
  catalog ??= Promise.all(PRESET_PHOTO_REFERENCES.map(async ([id, file]) => ({
    id, signature: await photoSignature(new URL('../../assets/preset-references/' + file, import.meta.url).href),
  })));
  const known = await catalog;
  let match: { id: string; photo: string } | undefined;
  for (const photo of photos) {
    if (!photo) continue;
    const signature = await photoSignature(photo);
    if (!signature) continue;
    const candidates = known.flatMap(({ id, signature: reference }) =>
      reference ? [{ id, distance: difference(signature, reference) }] : []);
    candidates.sort((a, b) => a.distance - b.distance);
    const best = candidates[0];
    if (!best || best.distance > .065) continue;
    const next = candidates.find(candidate => candidate.id !== best.id);
    if (next && next.distance - best.distance < .03) continue;
    if (match && match.id !== best.id) return undefined;
    match ??= { id: best.id, photo };
  }
  return match;
}
