/** Limite do backend (Zod) — margem para base64. */
export const ONBOARDING_AVATAR_MAX_DATA_URL_CHARS = 500_000;

const MAX_EDGE_PX = 512;
/** Tamanho alvo do blob antes do base64 (~4/3 no data URL). */
const TARGET_BLOB_BYTES = 280_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('read_failed'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}

async function encodeCanvasUnderTarget(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const qualities = [0.82, 0.72, 0.62, 0.52, 0.42];
  let best: Blob | null = null;
  for (const q of qualities) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', q),
    );
    if (blob && (!best || blob.size < best.size)) best = blob;
    if (best && best.size <= TARGET_BLOB_BYTES) return best;
  }
  return best;
}

async function bitmapFromSource(source: File | string): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup?: () => void }> {
  if (source instanceof File) {
    try {
      const bitmap = await createImageBitmap(source);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => {
          ctx.drawImage(bitmap, 0, 0, w, h);
        },
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      const dataUrl = await readFileAsDataUrl(source);
      const img = await loadImage(dataUrl);
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      };
    }
  }

  const img = await loadImage(source);
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
  };
}

async function rasterizeToDataUrl(source: File | string): Promise<string | null> {
  const { width, height, draw, cleanup } = await bitmapFromSource(source);
  try {
    let maxEdge = MAX_EDGE_PX;
    for (let pass = 0; pass < 6; pass++) {
      const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      draw(ctx, w, h);
      const blob = await encodeCanvasUnderTarget(canvas);
      if (!blob) {
        maxEdge = Math.max(256, Math.floor(maxEdge * 0.75));
        continue;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('encode_failed'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('encode_failed'));
        reader.readAsDataURL(blob);
      });

      if (dataUrl.length <= ONBOARDING_AVATAR_MAX_DATA_URL_CHARS) return dataUrl;
      maxEdge = Math.max(256, Math.floor(maxEdge * 0.75));
    }
    return null;
  } finally {
    cleanup?.();
  }
}

/** Reduz imagem para caber no POST /activate/trial (avatar_data_url). */
export async function prepareOnboardingAvatarDataUrl(
  source: File | string | null | undefined,
): Promise<string | undefined> {
  if (!source) return undefined;
  const trimmed = typeof source === 'string' ? source.trim() : source;
  if (!trimmed) return undefined;

  if (typeof trimmed === 'string') {
    if (!trimmed.startsWith('data:image/')) return undefined;
    if (trimmed.length <= ONBOARDING_AVATAR_MAX_DATA_URL_CHARS) return trimmed;
    try {
      return (await rasterizeToDataUrl(trimmed)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  if (!trimmed.type.startsWith('image/')) return undefined;
  try {
    return (await rasterizeToDataUrl(trimmed)) ?? undefined;
  } catch {
    return undefined;
  }
}
