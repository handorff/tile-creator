import type { Point, Primitive, TileConfig } from '../types/model';
import { getSeedSnapPoints } from './tile';
import { intersections } from './intersections';
import { cross, distance, dot, pointKey, subtract } from '../utils/math';

export interface SnapContext {
  points: Point[];
  tolerance: number;
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
