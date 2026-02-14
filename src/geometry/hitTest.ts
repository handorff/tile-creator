import type { Point, Primitive } from '../types/model';
import { clamp, distance, dot, subtract } from '../utils/math';

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
        : distanceToCircle(point, primitive.center, primitive.radius);

    if (d <= tolerance && d < bestDistance) {
      best = primitive;
      bestDistance = d;
    }
  }

  return best;
}
