import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { Primitive, ProjectState } from '../../types/model';
import { buildSingleTileSvg } from './exportSvg';

const DEFAULT_GIF_WIDTH = 512;
const DEFAULT_GIF_HEIGHT = 512;
const DEFAULT_STEP_DELAY_MS = 150;
const DEFAULT_FINAL_HOLD_MS = 900;
const DEFAULT_BACKGROUND = '#ffffff';
const MAX_GIF_COLORS = 256;

interface HistoryReplayOptions {
  includeFuture?: boolean;
}

export interface GifFramePlan {
  primitives: Primitive[];
  delayMs: number;
}

type RasterizeFrame = (
  svg: string,
  width: number,
  height: number
) => Promise<Uint8ClampedArray>;

export interface AnimatedGifOptions {
  width?: number;
  height?: number;
  stepDelayMs?: number;
  finalHoldMs?: number;
  background?: string;
  loop?: boolean;
  includeFuture?: boolean;
  rasterizeFrame?: RasterizeFrame;
}

async function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode SVG frame.'));
    image.src = url;
  });
}

async function rasterizeSvgFrame(
  svg: string,
  width: number,
  height: number
): Promise<Uint8ClampedArray> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadSvgImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is not available for GIF export.');
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function buildHistoryReplayFrames(
  project: ProjectState,
  options: HistoryReplayOptions = {}
): Primitive[][] {
  const includeFuture = options.includeFuture ?? true;
  const frames: Primitive[][] = [
    ...project.history.past.map((entry) => [...entry.primitives]),
    [...project.primitives]
  ];

  if (includeFuture) {
    frames.push(...[...project.history.future].reverse().map((entry) => [...entry.primitives]));
  }

  if (project.history.past.length === 0 && project.primitives.length > 0) {
    frames.unshift([]);
  }

  if (frames.length === 0) {
    frames.push([]);
  }

  return frames;
}

export function buildGifFramePlan(
  project: ProjectState,
  options: Pick<AnimatedGifOptions, 'stepDelayMs' | 'finalHoldMs' | 'includeFuture'> = {}
): GifFramePlan[] {
  const stepDelayMs = options.stepDelayMs ?? DEFAULT_STEP_DELAY_MS;
  const finalHoldMs = options.finalHoldMs ?? DEFAULT_FINAL_HOLD_MS;
  const replayFrames = buildHistoryReplayFrames(project, {
    includeFuture: options.includeFuture
  });

  return replayFrames.map((primitives, index) => ({
    primitives,
    delayMs: index === replayFrames.length - 1 ? finalHoldMs : stepDelayMs
  }));
}

export async function buildAnimatedGif(
  project: ProjectState,
  options: AnimatedGifOptions = {}
): Promise<Blob> {
  const width = options.width ?? DEFAULT_GIF_WIDTH;
  const height = options.height ?? DEFAULT_GIF_HEIGHT;
  const background = options.background ?? DEFAULT_BACKGROUND;
  const loop = options.loop ?? true;
  const rasterizeFrame = options.rasterizeFrame ?? rasterizeSvgFrame;
  const framePlan = buildGifFramePlan(project, {
    includeFuture: options.includeFuture,
    stepDelayMs: options.stepDelayMs,
    finalHoldMs: options.finalHoldMs
  });

  const gif = GIFEncoder();

  for (let index = 0; index < framePlan.length; index += 1) {
    const frame = framePlan[index];
    const frameState: ProjectState = {
      ...project,
      primitives: frame.primitives
    };

    const svg = buildSingleTileSvg(frameState, { background });

    let rgba: Uint8ClampedArray;
    try {
      rgba = await rasterizeFrame(svg, width, height);
    } catch {
      throw new Error(`Could not rasterize GIF frame ${index + 1}.`);
    }

    if (rgba.length !== width * height * 4) {
      throw new Error(`GIF frame ${index + 1} rasterized to an unexpected size.`);
    }

    const palette = quantize(rgba, MAX_GIF_COLORS);
    const indexed = applyPalette(rgba, palette);

    gif.writeFrame(indexed, width, height, {
      palette,
      delay: frame.delayMs,
      repeat: loop ? 0 : -1
    });
  }

  gif.finish();

  const bytes = gif.bytes();
  const output = new Uint8Array(bytes.length);
  output.set(bytes);
  return new Blob([output.buffer], { type: 'image/gif' });
}
