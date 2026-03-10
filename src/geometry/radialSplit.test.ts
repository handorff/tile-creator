import { describe, expect, it } from 'vitest';
import { buildRadialSpokes } from './radialSplit';

const CIRCLE = {
  id: 'circle-1',
  kind: 'circle' as const,
  center: { x: 10, y: -5 },
  radius: 20,
  color: '#111111',
  strokeWidth: 2
};

function normalizeAngle(angle: number): number {
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

describe('buildRadialSpokes', () => {
  it('builds two opposite spokes', () => {
    const spokes = buildRadialSpokes(CIRCLE, 2);

    expect(spokes).toHaveLength(2);
    expect(spokes[0]).toMatchObject({
      kind: 'line',
      a: { x: 10, y: -5 },
      b: { x: 30, y: -5 }
    });
    expect(spokes[1].a).toEqual(CIRCLE.center);
    expect(spokes[1].b.x).toBeCloseTo(-10);
    expect(spokes[1].b.y).toBeCloseTo(-5);
  });

  it('builds eight evenly spaced spokes on the circle', () => {
    const spokes = buildRadialSpokes(CIRCLE, 8);

    expect(spokes).toHaveLength(8);
    expect(spokes[0].b.x).toBeCloseTo(30);
    expect(spokes[0].b.y).toBeCloseTo(-5);

    const angles = spokes
      .map((spoke) => normalizeAngle(Math.atan2(spoke.b.y - CIRCLE.center.y, spoke.b.x - CIRCLE.center.x)))
      .sort((a, b) => a - b);

    for (let index = 0; index < angles.length; index += 1) {
      const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
      const delta = next - angles[index];
      expect(delta).toBeCloseTo((Math.PI * 2) / 8);
    }

    for (const spoke of spokes) {
      const radius = Math.hypot(spoke.b.x - CIRCLE.center.x, spoke.b.y - CIRCLE.center.y);
      expect(radius).toBeCloseTo(CIRCLE.radius);
      expect(spoke.a).toEqual(CIRCLE.center);
    }
  });

  it('builds sixteen spokes and reuses prefix ids when provided', () => {
    const spokes = buildRadialSpokes(CIRCLE, 16, {
      reuseIds: ['line-1', 'line-2', 'line-3']
    });

    expect(spokes).toHaveLength(16);
    expect(spokes.slice(0, 3).map((spoke) => spoke.id)).toEqual(['line-1', 'line-2', 'line-3']);

    const uniqueEndpoints = new Set(
      spokes.map((spoke) => `${spoke.b.x.toFixed(4)}:${spoke.b.y.toFixed(4)}`)
    );
    expect(uniqueEndpoints.size).toBe(16);
  });
});
