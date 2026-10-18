/**
 * Browser-side image resize before upload: phone photos are 3–12 MB, the
 * server stores ≤ 3 MB. Decodes with EXIF orientation applied, scales so the
 * long edge is at most `maxEdge`, and re-encodes as JPEG.
 */
export interface Resized {
  blob: Blob;
  width: number;
  height: number;
}

export const PHOTO_EDGE = 1600;
export const THUMB_EDGE = 480;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall through to <img> (e.g. older Safari) */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(source: CanvasImageSource, w: number, h: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  // JPEG has no alpha: paint white under transparent PNGs.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/jpeg', quality));
}

/** The full photo and its thumbnail from one decode. */
export async function resizeForUpload(file: Blob): Promise<{ photo: Resized; thumb: Resized }> {
  const image = await decode(file);
  const w0 = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const h0 = 'naturalHeight' in image ? image.naturalHeight : image.height;
  if (!w0 || !h0) throw new Error('Could not read the image');

  const fit = (edge: number) => {
    const scale = Math.min(1, edge / Math.max(w0, h0));
    return { width: Math.round(w0 * scale), height: Math.round(h0 * scale) };
  };
  const p = fit(PHOTO_EDGE);
  const t = fit(THUMB_EDGE);
  const [photo, thumb] = await Promise.all([
    encode(image, p.width, p.height, 0.85),
    encode(image, t.width, t.height, 0.8),
  ]);
  if ('close' in image) image.close();
  return { photo: { blob: photo, ...p }, thumb: { blob: thumb, ...t } };
}
