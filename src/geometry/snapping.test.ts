import { describe, expect, it } from 'vitest';
import { gatherSnapPoints, getLinePassThroughSnap, getSnapPoint } from './snapping';
import type { Primitive } from '../types/model';

describe('snapping', () => {
  it('returns seed points and intersections', () => {
    const primitives: Primitive[] = [
      {
        id: 'l1',
        kind: 'line',
        a: { x: -20, y: 0 },
        b: { x: 20, y: 0 },
        color: '#111'
      },
      {
        id: 'l2',
        kind: 'line',
        a: { x: 0, y: -20 },
        b: { x: 0, y: 20 },
        color: '#111'
      }
    ];

    const points = gatherSnapPoints(primitives, { shape: 'square', size: 50 });
    expect(points.length).toBeGreaterThan(5);
  });

  it('includes line midpoints as snap targets', () => {
    const primitives: Primitive[] = [
      {
        id: 'l1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      }
    ];

    const points = gatherSnapPoints(primitives, { shape: 'square', size: 50 });
    expect(points).toContainEqual({ x: 5, y: 0 });
  });

  it('snaps to nearest point within tolerance', () => {
    const snap = getSnapPoint(
      { x: 9.8, y: 10.2 },
      {
        points: [
          { x: 10, y: 10 },
          { x: 100, y: 100 }
        ],
        tolerance: 1
      }
    );

    expect(snap).toEqual({ x: 10, y: 10 });
  });

  it('does not snap when no point is close', () => {
    const snap = getSnapPoint(
      { x: 0, y: 0 },
      {
        points: [{ x: 10, y: 10 }],
        tolerance: 2
      }
    );
    expect(snap).toBeNull();
  });

  it('snaps line direction so segment passes through nearby snap point', () => {
    const snapped = getLinePassThroughSnap(
      { x: 0, y: 0 },
      { x: 10, y: 2 },
      [{ x: 5, y: 0 }],
      1.1
    );

    expect(snapped).not.toBeNull();
    expect(snapped?.y).toBeCloseTo(0, 6);
    expect(snapped?.x).toBeGreaterThan(10);
  });

  it('does not line-snap when no snap point is near drawn segment', () => {
    const snapped = getLinePassThroughSnap(
      { x: 0, y: 0 },
      { x: 10, y: 2 },
      [{ x: 5, y: 5 }],
      0.5
    );

    expect(snapped).toBeNull();
  });
});
