import { describe, expect, it } from 'vitest';
import {
  gatherSnapPoints,
  gatherSnapSegments,
  getDirectionalSnapOnSegments,
  getLinePassThroughSnap,
  getSnapPoint,
  getSnapPointOnSegments
} from './snapping';
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

  it('includes tile edges in snap segments', () => {
    const segments = gatherSnapSegments([], { shape: 'square', size: 10 });
    expect(segments).toHaveLength(4);
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

  it('snaps to closest point on a line segment', () => {
    const snapped = getSnapPointOnSegments(
      { x: 4.9, y: 0.3 },
      [
        {
          a: { x: 0, y: 0 },
          b: { x: 10, y: 0 }
        }
      ],
      1
    );
    expect(snapped).toEqual({ x: 4.9, y: 0 });
  });

  it('snaps to tile edge segment', () => {
    const segments = gatherSnapSegments([], { shape: 'square', size: 10 });
    const snapped = getSnapPointOnSegments({ x: 1.2, y: -10.4 }, segments, 1);
    expect(snapped?.x).toBeCloseTo(1.2, 6);
    expect(snapped?.y).toBeCloseTo(-10, 6);
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

  it('snaps directional line endpoint to segment while preserving direction', () => {
    const snapped = getDirectionalSnapOnSegments(
      { x: 0, y: 0 },
      { x: 8, y: 4 },
      { x: 9.6, y: 5.2 },
      [
        {
          a: { x: 10, y: -10 },
          b: { x: 10, y: 10 }
        }
      ],
      1
    );

    expect(snapped?.x).toBeCloseTo(10, 6);
    expect(snapped?.y).toBeCloseTo(5, 6);
  });

  it('supports combined pass-through and edge-end snapping', () => {
    const start = { x: 0, y: 0 };
    const rawEnd = { x: 9.8, y: 4.4 };
    const through = getLinePassThroughSnap(start, rawEnd, [{ x: 5, y: 2.5 }], 1);
    expect(through).not.toBeNull();

    const snappedEnd = getDirectionalSnapOnSegments(
      start,
      through!,
      rawEnd,
      [
        {
          a: { x: 10, y: -10 },
          b: { x: 10, y: 10 }
        }
      ],
      1
    );

    expect(snappedEnd?.x).toBeCloseTo(10, 6);
    expect(snappedEnd?.y).toBeCloseTo(5, 6);
  });

  it('includes arc handles and midpoint in snap targets', () => {
    const points = gatherSnapPoints(
      [
        {
          id: 'arc-1',
          kind: 'arc',
          center: { x: 0, y: 0 },
          start: { x: 10, y: 0 },
          end: { x: 0, y: 10 },
          clockwise: true,
          largeArc: false,
          color: '#111'
        }
      ],
      { shape: 'square', size: 50 }
    );

    expect(points).toContainEqual({ x: 0, y: 0 });
    expect(points).toContainEqual({ x: 10, y: 0 });
    expect(points).toContainEqual({ x: 0, y: 10 });
    expect(points.some((point) => Math.abs(point.x - 7.071) < 0.01 && Math.abs(point.y - 7.071) < 0.01)).toBe(
      true
    );
  });
});
