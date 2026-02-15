import { describe, expect, it } from 'vitest';
import { mapClientPointToWorld, renderedViewBoxLayout } from './coordinates';

describe('EditorCanvas coordinate mapping', () => {
  it('accounts for vertical letterboxing when mapping to world coordinates', () => {
    const rect = { left: 0, top: 0, width: 800, height: 1000 };
    const viewBox = { x: -100, y: -100, width: 200, height: 200 };

    const layout = renderedViewBoxLayout(rect, viewBox);
    expect(layout).toEqual({ x: 0, y: 100, width: 800, height: 800 });

    expect(mapClientPointToWorld({ x: 400, y: 100 }, rect, viewBox)).toEqual({
      x: 0,
      y: -100
    });
    expect(mapClientPointToWorld({ x: 400, y: 900 }, rect, viewBox)).toEqual({
      x: 0,
      y: 100
    });
  });

  it('accounts for horizontal letterboxing when mapping to world coordinates', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 800 };
    const viewBox = { x: -100, y: -100, width: 200, height: 200 };

    const layout = renderedViewBoxLayout(rect, viewBox);
    expect(layout).toEqual({ x: 100, y: 0, width: 800, height: 800 });

    expect(mapClientPointToWorld({ x: 100, y: 400 }, rect, viewBox)).toEqual({
      x: -100,
      y: 0
    });
    expect(mapClientPointToWorld({ x: 900, y: 400 }, rect, viewBox)).toEqual({
      x: 100,
      y: 0
    });
  });
});
