const MAX_EDGE = 1800;
const MAX_SOURCE_BYTES = 28 * 1024 * 1024;

/** Normalize camera orientation and fit the four-view request budget. */
export async function prepareEquipmentPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.type) || file.size > MAX_SOURCE_BYTES) {
    throw new Error('Choose a JPG, PNG, WebP, GIF, or AVIF image under 28 MB.');
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The browser could not prepare this photo.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    bitmap.close();
  }
}
