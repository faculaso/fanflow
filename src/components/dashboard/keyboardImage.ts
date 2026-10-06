import type { KeyboardModelId } from './types';

/** Turns an image or animated GIF/WebP into frames for the keyboard's screen. */

export interface ScreenModel {
  id: KeyboardModelId;
  width: number;
  height: number;
  label: string;
  keyboards: string;
}

/** Same boards (USB 0C45:8009), different panels. Mirrors KeyboardScreen.Models in the helper. */
export const SCREEN_MODELS: Record<KeyboardModelId, ScreenModel> = {
  ajazz128: {
    id: 'ajazz128',
    width: 128,
    height: 128,
    label: '128 × 128',
    keyboards: 'Ajazz AK820 Pro, AKS075 y variantes Epomaker',
  },
  monka160x80: {
    id: 'monka160x80',
    width: 160,
    height: 80,
    label: '160 × 80',
    keyboards: 'Monka (Marvo) Storm KG991W',
  },
};
/** The upload header stores the frame count in one byte. */
export const MAX_FRAMES = 255;
/** Guard against decoding absurdly long animations just to drop most of their frames. */
const MAX_SOURCE_FRAMES = 2000;
const DEFAULT_DELAY_MS = 100;
/** The header stores each delay in 2 ms units, one byte: 2-510 ms. */
const MIN_DELAY_MS = 20;
const MAX_DELAY_MS = 510;

export type FitMode = 'cover' | 'contain';

export interface PreparedImage {
  name: string;
  model: KeyboardModelId;
  frames: ImageData[];
  delays: number[];
  /** Frame count of the source when it had to be thinned out to MAX_FRAMES. */
  sourceFrames: number;
}

interface DecodedFrame {
  source: CanvasImageSource;
  width: number;
  height: number;
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: DecodedFrame, fit: FitMode): ImageData {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const scale =
    fit === 'cover'
      ? Math.max(width / frame.width, height / frame.height)
      : Math.min(width / frame.width, height / frame.height);
  const w = frame.width * scale;
  const h = frame.height * scale;
  ctx.drawImage(frame.source, (width - w) / 2, (height - h) / 2, w, h);
  return ctx.getImageData(0, 0, width, height);
}

/** Picks at most MAX_FRAMES evenly spaced frames, folding the skipped frames' time into
 *  the kept ones so the animation keeps its overall speed. */
function sampleFrames(delays: number[]): { index: number; delay: number }[] {
  const step = Math.max(1, delays.length / MAX_FRAMES);
  const picked: { index: number; delay: number }[] = [];
  for (let k = 0; Math.floor(k * step) < delays.length; k++) {
    const start = Math.floor(k * step);
    const end = Math.min(delays.length, Math.floor((k + 1) * step));
    let delay = 0;
    for (let i = start; i < end; i++) delay += delays[i];
    picked.push({ index: start, delay });
  }
  return picked;
}

function clampDelay(ms: number): number {
  return Math.round(Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, ms || DEFAULT_DELAY_MS)));
}

async function decodeAnimated(file: File, ctx: CanvasRenderingContext2D, fit: FitMode) {
  const decoder = new ImageDecoder({ data: file.stream(), type: file.type });
  try {
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    const count = Math.min(track?.frameCount ?? 1, MAX_SOURCE_FRAMES);

    // Durations first (cheap metadata), then decode only the frames we keep.
    const delays: number[] = [];
    const decodedAll = count <= MAX_FRAMES;
    const frames: ImageData[] = [];
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      delays.push(image.duration ? image.duration / 1000 : DEFAULT_DELAY_MS);
      if (decodedAll) {
        frames.push(
          drawFrame(ctx, { source: image, width: image.displayWidth, height: image.displayHeight }, fit),
        );
      }
      image.close();
    }
    if (decodedAll) return { frames, delays: delays.map(clampDelay), sourceFrames: count };

    const picked = sampleFrames(delays);
    for (const { index } of picked) {
      const { image } = await decoder.decode({ frameIndex: index });
      frames.push(
        drawFrame(ctx, { source: image, width: image.displayWidth, height: image.displayHeight }, fit),
      );
      image.close();
    }
    return { frames, delays: picked.map((p) => clampDelay(p.delay)), sourceFrames: count };
  } finally {
    decoder.close();
  }
}

export async function prepareImage(file: File, fit: FitMode, model: KeyboardModelId): Promise<PreparedImage> {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_MODELS[model].width;
  canvas.height = SCREEN_MODELS[model].height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingQuality = 'high';

  const animated =
    (file.type === 'image/gif' || file.type === 'image/webp' || file.type === 'image/apng') &&
    typeof ImageDecoder !== 'undefined' &&
    (await ImageDecoder.isTypeSupported(file.type));

  if (animated) {
    return { name: file.name, model, ...(await decodeAnimated(file, ctx, fit)) };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const frame = drawFrame(ctx, { source: bitmap, width: bitmap.width, height: bitmap.height }, fit);
    return { name: file.name, model, frames: [frame], delays: [DEFAULT_DELAY_MS], sourceFrames: 1 };
  } finally {
    bitmap.close();
  }
}

/** All frames back to back as RGB565, little-endian, row-major: what the screen stores. */
export function toRgb565(frames: ImageData[]): Uint8Array {
  const out = new Uint8Array(frames.reduce((sum, f) => sum + f.width * f.height * 2, 0));
  let o = 0;
  for (const frame of frames) {
    const px = frame.data;
    for (let i = 0; i < px.length; i += 4) {
      const value = ((px[i] & 0xf8) << 8) | ((px[i + 1] & 0xfc) << 3) | (px[i + 2] >> 3);
      out[o++] = value & 0xff;
      out[o++] = value >> 8;
    }
  }
  return out;
}
