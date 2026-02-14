import type { Point, Primitive, TileConfig } from '../types/model';
import { getSeedSnapPoints, getTilePolygon } from './tile';
import { intersections } from './intersections';
import { clamp, cross, distance, dot, pointKey, subtract } from '../utils/math';

export interface SnapContext {
  points: Point[];
  tolerance: number;
}

export interface SnapSegment {
  a: Point;
  b: Point;
}

export function gatherSnapPoints(primitives: Primitive[], tile: TileConfig): Point[] {
  const points: Point[] = [];

  for (const primitive of primitives) {
    if (primitive.kind === 'line') {
      points.push(primitive.a, primitive.b);
      points.push({
        x: (primitive.a.x + primitive.b.x) / 2,
        y: (primitive.a.y + primitive.b.y) / 2
      });
    } else {
      points.push(primitive.center);
    }
  }

  points.push(...intersections(primitives));
  points.push(...getSeedSnapPoints(tile));

  const dedup = new Map<string, Point>();
  for (const point of points) {
    dedup.set(pointKey(point), point);
  }

  return [...dedup.values()];
}

function segmentKey(segment: SnapSegment): string {
  const aKey = pointKey(segment.a);
  const bKey = pointKey(segment.b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

export function gatherSnapSegments(primitives: Primitive[], tile: TileConfig): SnapSegment[] {
  const segments: SnapSegment[] = [];

  for (const primitive of primitives) {
    if (primitive.kind === 'line') {
      segments.push({
        a: primitive.a,
        b: primitive.b
      });
    }
  }

  const polygon = getTilePolygon(tile);
  for (let i = 0; i < polygon.length; i += 1) {
    segments.push({
      a: polygon[i],
      b: polygon[(i + 1) % polygon.length]
    });
  }

  const dedup = new Map<string, SnapSegment>();
  for (const segment of segments) {
    dedup.set(segmentKey(segment), segment);
  }

  return [...dedup.values()];
}

export function getSnapPoint(rawPoint: Point, context: SnapContext): Point | null {
  let best: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of context.points) {
    const d = distance(rawPoint, point);
    if (d < context.tolerance && d < bestDistance) {
      best = point;
      bestDistance = d;
    }
  }

  return best;
}

function closestPointOnSegment(point: Point, segment: SnapSegment): Point | null {
  const ab = subtract(segment.b, segment.a);
  const ap = subtract(point, segment.a);
  const denom = dot(ab, ab);
  if (denom < 1e-6) {
    return null;
  }

  const t = clamp(dot(ap, ab) / denom, 0, 1);
  return {
    x: segment.a.x + ab.x * t,
    y: segment.a.y + ab.y * t
  };
}

export function getSnapPointOnSegments(
  rawPoint: Point,
  segments: SnapSegment[],
  tolerance: number
): Point | null {
  let bestPoint: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const projected = closestPointOnSegment(rawPoint, segment);
    if (!projected) {
      continue;
    }

    const d = distance(rawPoint, projected);
    if (d < tolerance && d < bestDistance) {
      bestDistance = d;
      bestPoint = projected;
    }
  }

  return bestPoint;
}

export function getLinePassThroughSnap(
  start: Point,
  rawEnd: Point,
  snapPoints: Point[],
  tolerance: number
): Point | null {
  const direction = subtract(rawEnd, start);
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1e-6) {
    return null;
  }

  const lengthSq = length * length;
  let bestPoint: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of snapPoints) {
    const fromStart = subtract(point, start);
    const along = dot(fromStart, direction) / lengthSq;

    // We only consider points that would lie within the drawn segment body.
    if (along <= 0.05 || along >= 0.98) {
      continue;
    }

    const perpDistance = Math.abs(cross(direction, fromStart)) / length;
    const pointDistance = Math.hypot(fromStart.x, fromStart.y);

    if (perpDistance <= tolerance && pointDistance <= length + tolerance) {
      if (perpDistance < bestDistance) {
        bestDistance = perpDistance;
        bestPoint = point;
      }
    }
  }

  if (!bestPoint) {
    return null;
  }

  const axis = subtract(bestPoint, start);
  const axisLength = Math.hypot(axis.x, axis.y);
  if (axisLength < 1e-6) {
    return null;
  }

  const scale = length / axisLength;
  return {
    x: start.x + axis.x * scale,
    y: start.y + axis.y * scale
  };
}

export function getDirectionalSnapOnSegments(
  start: Point,
  directionEnd: Point,
  rawEnd: Point,
  segments: SnapSegment[],
  tolerance: number
): Point | null {
  const r = subtract(directionEnd, start);
  const rLength = Math.hypot(r.x, r.y);
  if (rLength < 1e-6) {
    return null;
  }

  let best: Point | null = null;
  let bestRawDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const q = segment.a;
    const s = subtract(segment.b, segment.a);
    const denom = cross(r, s);
    if (Math.abs(denom) < 1e-6) {
      continue;
    }

    const qp = subtract(q, start);
    const t = cross(qp, s) / denom;
    const u = cross(qp, r) / denom;

    if (t < 0 || u < 0 || u > 1) {
      continue;
    }

    const candidate = {
      x: start.x + r.x * t,
      y: start.y + r.y * t
    };

    const dRaw = distance(candidate, rawEnd);
    if (dRaw <= tolerance && dRaw < bestRawDistance) {
      bestRawDistance = dRaw;
      best = candidate;
    }
  }

  return best;
}
