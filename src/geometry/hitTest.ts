import type { Point, Primitive } from '../types/model';
import { clamp, distance, dot, subtract } from '../utils/math';
import { arcRadius, isPointOnArcSweep, normalizeArc } from './arc';

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const ab = subtract(b, a);
  const ap = subtract(point, a);
  const denom = dot(ab, ab);
  if (denom === 0) {
    return distance(point, a);
  }

  const t = clamp(dot(ap, ab) / denom, 0, 1);
  const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return distance(point, proj);
}

function distanceToCircle(point: Point, center: Point, radius: number): number {
  return Math.abs(distance(point, center) - radius);
}

function distanceToArc(point: Point, primitive: Extract<Primitive, { kind: 'arc' }>): number {
  const normalized = normalizeArc(primitive);
  if (isPointOnArcSweep(point, normalized)) {
    return Math.abs(distance(point, normalized.center) - arcRadius(normalized));
  }

  return Math.min(distance(point, normalized.start), distance(point, normalized.end));
}

export function hitTestPrimitive(
  point: Point,
  primitives: Primitive[],
  tolerance: number
): Primitive | null {
  let best: Primitive | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const primitive of primitives) {
    const d =
      primitive.kind === 'line'
        ? distanceToSegment(point, primitive.a, primitive.b)
        : primitive.kind === 'circle'
          ? distanceToCircle(point, primitive.center, primitive.radius)
          : distanceToArc(point, primitive);

    if (d <= tolerance && d < bestDistance) {
      best = primitive;
      bestDistance = d;
    }
  }

  return best;
}
