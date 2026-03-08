import { describe, expect, it } from 'vitest';
import type { LinePrimitive, Point, Primitive, TileConfig } from '../types/model';
import { buildSymmetricOffsets } from './offset';
import { periodicNeighborOffsets } from './tile';

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function alignPeriodically(point: Point, target: Point, tile: TileConfig): Point {
  const offsets = [{ x: 0, y: 0 }, ...periodicNeighborOffsets(tile)];
  let best = point;
  let bestDistance = pointDistance(point, target);

  for (const offset of offsets) {
    const candidate = {
      x: point.x + offset.x,
      y: point.y + offset.y
    };
    const candidateDistance = pointDistance(candidate, target);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }

  return best;
}

function seamEndpointsForSource(
  offsets: Primitive[],
  source: LinePrimitive
): { cw: Point; ccw: Point } {
  const matches = offsets.filter((primitive): primitive is LinePrimitive => {
    if (primitive.kind !== 'line') {
      return false;
    }

    return pointDistance(primitive.a, source.b) <= 2 || pointDistance(primitive.b, source.b) <= 2;
  });

  expect(matches).toHaveLength(2);

  const direction = {
    x: source.b.x - source.a.x,
    y: source.b.y - source.a.y
  };
  let cw: Point | null = null;
  let ccw: Point | null = null;

  for (const match of matches) {
    const seamPoint = pointDistance(match.a, source.b) <= pointDistance(match.b, source.b) ? match.b : match.a;
    const offset = {
      x: seamPoint.x - source.a.x,
      y: seamPoint.y - source.a.y
    };
    const side = direction.x * offset.y - direction.y * offset.x;
    if (side >= 0) {
      ccw = seamPoint;
    } else {
      cw = seamPoint;
    }
  }

  expect(cw).not.toBeNull();
  expect(ccw).not.toBeNull();

  return {
    cw: cw as Point,
    ccw: ccw as Point
  };
}

describe('buildSymmetricOffsets', () => {
  it('connects offsets across a shared line endpoint with miter joins', () => {
    const primitives: Primitive[] = [
      {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      },
      {
        id: 'line-2',
        kind: 'line',
        a: { x: 10, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 2);
    expect(offsets).toHaveLength(4);

    const topHorizontal = offsets.find(
      (primitive) =>
        primitive.kind === 'line' &&
        primitive.a.y === 2 &&
        primitive.b.y === 2
    );
    const leftVertical = offsets.find(
      (primitive) =>
        primitive.kind === 'line' &&
        primitive.a.x === 8 &&
        primitive.b.x === 8
    );
    const bottomHorizontal = offsets.find(
      (primitive) =>
        primitive.kind === 'line' &&
        primitive.a.y === -2 &&
        primitive.b.y === -2
    );
    const rightVertical = offsets.find(
      (primitive) =>
        primitive.kind === 'line' &&
        primitive.a.x === 12 &&
        primitive.b.x === 12
    );

    expect(topHorizontal).toMatchObject({
      kind: 'line',
      b: { x: 8, y: 2 }
    });
    expect(leftVertical).toMatchObject({
      kind: 'line',
      a: { x: 8, y: 2 }
    });
    expect(bottomHorizontal).toMatchObject({
      kind: 'line',
      b: { x: 12, y: -2 }
    });
    expect(rightVertical).toMatchObject({
      kind: 'line',
      a: { x: 12, y: -2 }
    });
  });

  it('splits branched selections into separate simple paths', () => {
    const primitives: Primitive[] = [
      {
        id: 'line-left',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      },
      {
        id: 'line-right',
        kind: 'line',
        a: { x: 10, y: 0 },
        b: { x: 20, y: 0 },
        color: '#111'
      },
      {
        id: 'line-top',
        kind: 'line',
        a: { x: 10, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 1);
    expect(offsets).toHaveLength(6);
    expect(offsets.every((primitive) => primitive.kind === 'line')).toBe(true);
  });

  it('treats nearly coincident endpoints as one connected junction', () => {
    const primitives: Primitive[] = [
      {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      },
      {
        id: 'line-2',
        kind: 'line',
        a: { x: 10.4, y: 10.3 },
        b: { x: 0, y: 20 },
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 1);
    expect(offsets).toHaveLength(4);

    const joinedEndpoints = offsets
      .filter((primitive): primitive is Extract<Primitive, { kind: 'line' }> => primitive.kind === 'line')
      .map((primitive) => [primitive.a, primitive.b])
      .flat();

    const closePairs = joinedEndpoints.filter(
      (point, index) =>
        joinedEndpoints.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex !== index &&
            Math.hypot(candidate.x - point.x, candidate.y - point.y) < 1e-6
        ) >= 0
    );

    expect(closePairs.length).toBeGreaterThan(0);
  });

  it('splits crossing lines and creates one offset corner in each quadrant', () => {
    const primitives: Primitive[] = [
      {
        id: 'horizontal',
        kind: 'line',
        a: { x: -10, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      },
      {
        id: 'vertical',
        kind: 'line',
        a: { x: 0, y: -10 },
        b: { x: 0, y: 10 },
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 1);
    expect(offsets).toHaveLength(8);

    const endpoints = offsets
      .filter((primitive): primitive is Extract<Primitive, { kind: 'line' }> => primitive.kind === 'line')
      .flatMap((primitive) => [primitive.a, primitive.b]);

    for (const corner of [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 }
    ]) {
      const matches = endpoints.filter((point) => pointDistance(point, corner) < 1e-6);
      expect(matches).toHaveLength(2);
    }
  });

  it('offsets closed loops on both sides', () => {
    const primitives: Primitive[] = [
      {
        id: 'top',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      },
      {
        id: 'right',
        kind: 'line',
        a: { x: 10, y: 0 },
        b: { x: 10, y: 10 },
        color: '#111'
      },
      {
        id: 'bottom',
        kind: 'line',
        a: { x: 10, y: 10 },
        b: { x: 0, y: 10 },
        color: '#111'
      },
      {
        id: 'left',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: 0, y: 0 },
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 1);
    expect(offsets).toHaveLength(8);

    const xs = offsets
      .filter((primitive): primitive is Extract<Primitive, { kind: 'line' }> => primitive.kind === 'line')
      .flatMap((primitive) => [primitive.a.x, primitive.b.x]);
    const ys = offsets
      .filter((primitive): primitive is Extract<Primitive, { kind: 'line' }> => primitive.kind === 'line')
      .flatMap((primitive) => [primitive.a.y, primitive.b.y]);

    expect(Math.min(...xs)).toBeCloseTo(-1, 6);
    expect(Math.max(...xs)).toBeCloseTo(11, 6);
    expect(Math.min(...ys)).toBeCloseTo(-1, 6);
    expect(Math.max(...ys)).toBeCloseTo(11, 6);
  });

  it('creates concentric circles for standalone circles', () => {
    const primitives: Primitive[] = [
      {
        id: 'circle-1',
        kind: 'circle',
        center: { x: 5, y: 5 },
        radius: 6,
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 2);
    expect(offsets).toEqual([
      expect.objectContaining({ kind: 'circle', radius: 8 }),
      expect.objectContaining({ kind: 'circle', radius: 4 })
    ]);
  });

  it('keeps mixed line and arc offsets connected at the shared endpoint', () => {
    const primitives: Primitive[] = [
      {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        color: '#111'
      },
      {
        id: 'arc-1',
        kind: 'arc',
        center: { x: 10, y: 5 },
        start: { x: 10, y: 0 },
        end: { x: 5, y: 5 },
        clockwise: false,
        largeArc: false,
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 1);
    expect(offsets).toHaveLength(4);

    const leftLine = offsets.find(
      (primitive) => primitive.kind === 'line' && primitive.a.y === 1 && primitive.b.y === 1
    );
    const leftArc = offsets.find(
      (primitive) => primitive.kind === 'arc' && primitive.start.y === 1
    );
    const rightLine = offsets.find(
      (primitive) => primitive.kind === 'line' && primitive.a.y === -1 && primitive.b.y === -1
    );
    const rightArc = offsets.find(
      (primitive) => primitive.kind === 'arc' && primitive.start.y === -1
    );

    expect(leftLine).toMatchObject({ kind: 'line', b: { x: 10, y: 1 } });
    expect(leftArc).toMatchObject({ kind: 'arc', start: { x: 10, y: 1 } });
    expect(rightLine).toMatchObject({ kind: 'line', b: { x: 10, y: -1 } });
    expect(rightArc).toMatchObject({ kind: 'arc', start: { x: 10, y: -1 } });
  });

  it('trims open offset ends to the tile boundary when the source endpoints lie on it', () => {
    const primitives: Primitive[] = [
      {
        id: 'line-1',
        kind: 'line',
        a: { x: 0, y: -10 },
        b: { x: 4, y: 0 },
        color: '#111'
      },
      {
        id: 'line-2',
        kind: 'line',
        a: { x: 4, y: 0 },
        b: { x: 0, y: 10 },
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 1, {
      tile: { shape: 'square', size: 10 }
    });
    expect(offsets).toHaveLength(4);

    const topBoundaryTouches = offsets
      .filter((primitive): primitive is Extract<Primitive, { kind: 'line' }> => primitive.kind === 'line')
      .flatMap((primitive) => [primitive.a, primitive.b])
      .filter((point) => Math.abs(point.y + 10) < 1e-6);
    const bottomBoundaryTouches = offsets
      .filter((primitive): primitive is Extract<Primitive, { kind: 'line' }> => primitive.kind === 'line')
      .flatMap((primitive) => [primitive.a, primitive.b])
      .filter((point) => Math.abs(point.y - 10) < 1e-6);

    expect(topBoundaryTouches).toHaveLength(2);
    expect(bottomBoundaryTouches).toHaveLength(2);
  });

  it('preserves cyclic wrapped-junction pairings across the seam', () => {
    const tile: TileConfig = { shape: 'square', size: 10 };
    const primitives: LinePrimitive[] = [
      {
        id: 'top-left',
        kind: 'line',
        a: { x: 0, y: -10 },
        b: { x: -3, y: -3 },
        color: '#111'
      },
      {
        id: 'top-right',
        kind: 'line',
        a: { x: 0, y: -10 },
        b: { x: 3, y: -3 },
        color: '#111'
      },
      {
        id: 'bottom-left',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: -3, y: 3 },
        color: '#111'
      },
      {
        id: 'bottom-right',
        kind: 'line',
        a: { x: 0, y: 10 },
        b: { x: 3, y: 3 },
        color: '#111'
      }
    ];

    const offsets = buildSymmetricOffsets(primitives, 1, { tile });
    expect(offsets).toHaveLength(8);

    const anchor = primitives[0].a;
    const topLeft = seamEndpointsForSource(offsets, primitives[0]);
    const topRight = seamEndpointsForSource(offsets, primitives[1]);
    const bottomLeft = seamEndpointsForSource(offsets, primitives[2]);
    const bottomRight = seamEndpointsForSource(offsets, primitives[3]);

    const pairings: Array<[Point, Point]> = [
      [topLeft.ccw, bottomLeft.cw],
      [bottomLeft.ccw, bottomRight.cw],
      [bottomRight.ccw, topRight.cw],
      [topRight.ccw, topLeft.cw]
    ];

    for (const [a, b] of pairings) {
      const alignedA = alignPeriodically(a, anchor, tile);
      const alignedB = alignPeriodically(b, anchor, tile);
      expect(alignedA.x).toBeCloseTo(alignedB.x, 6);
      expect(alignedA.y).toBeCloseTo(alignedB.y, 6);
    }
  });
});
