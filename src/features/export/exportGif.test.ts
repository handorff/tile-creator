import { describe, expect, it, vi } from 'vitest';
import type { Primitive, ProjectState } from '../../types/model';
import { initialProjectState } from '../../state/projectState';
import { buildAnimatedGif, buildGifFramePlan, buildHistoryReplayFrames } from './exportGif';

function makeLine(id: string): Primitive {
  return {
    id,
    kind: 'line',
    a: { x: 0, y: 0 },
    b: { x: 10, y: 0 },
    color: '#111'
  };
}

function makeProject(overrides: Partial<ProjectState>): ProjectState {
  return {
    ...initialProjectState,
    ...overrides,
    history: {
      ...initialProjectState.history,
      ...overrides.history
    }
  };
}

describe('buildHistoryReplayFrames', () => {
  it('replays frames as past -> current -> future in redo order', () => {
    const line1 = makeLine('line-1');
    const line2 = makeLine('line-2');
    const line3 = makeLine('line-3');
    const line4 = makeLine('line-4');

    const project = makeProject({
      primitives: [line1, line2],
      history: {
        past: [
          { primitives: [], description: 'Initial' },
          { primitives: [line1], description: 'Add line' }
        ],
        future: [
          { primitives: [line1, line2, line3], description: 'Add line 3' },
          { primitives: [line1, line2, line3, line4], description: 'Add line 4' }
        ]
      }
    });

    const frames = buildHistoryReplayFrames(project);

    expect(frames.map((frame) => frame.map((primitive) => primitive.id))).toEqual([
      [],
      ['line-1'],
      ['line-1', 'line-2'],
      ['line-1', 'line-2', 'line-3', 'line-4'],
      ['line-1', 'line-2', 'line-3']
    ]);
  });

  it('prepends an empty frame when history is empty and current state has primitives', () => {
    const project = makeProject({
      primitives: [makeLine('line-1')],
      history: {
        past: [],
        future: []
      }
    });

    const frames = buildHistoryReplayFrames(project);
    expect(frames.map((frame) => frame.map((primitive) => primitive.id))).toEqual([
      [],
      ['line-1']
    ]);
  });

  it('returns a single empty frame when project is cleared', () => {
    const project = makeProject({
      primitives: [],
      history: {
        past: [],
        future: []
      }
    });

    const frames = buildHistoryReplayFrames(project);
    expect(frames).toEqual([[]]);
  });
});

describe('buildGifFramePlan', () => {
  it('applies step delay and longer final hold delay', () => {
    const line1 = makeLine('line-1');
    const project = makeProject({
      primitives: [line1],
      history: {
        past: [{ primitives: [], description: 'Initial' }],
        future: []
      }
    });

    const plan = buildGifFramePlan(project, {
      stepDelayMs: 150,
      finalHoldMs: 900
    });

    expect(plan.map((frame) => frame.delayMs)).toEqual([150, 900]);
  });
});

describe('buildAnimatedGif', () => {
  it('creates an animated gif blob from replay frames', async () => {
    const line1 = makeLine('line-1');
    const project = makeProject({
      primitives: [line1],
      history: {
        past: [{ primitives: [], description: 'Initial' }],
        future: []
      }
    });

    const rasterizeFrame = vi.fn(async (_svg: string, width: number, height: number) => {
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < rgba.length; index += 4) {
        rgba[index] = 255;
        rgba[index + 1] = 255;
        rgba[index + 2] = 255;
        rgba[index + 3] = 255;
      }
      return rgba;
    });

    const gif = await buildAnimatedGif(project, {
      width: 2,
      height: 2,
      rasterizeFrame,
      stepDelayMs: 150,
      finalHoldMs: 900
    });

    expect(rasterizeFrame).toHaveBeenCalledTimes(2);
    expect(gif.type).toBe('image/gif');
    expect(gif.size).toBeGreaterThan(0);
  });
});
