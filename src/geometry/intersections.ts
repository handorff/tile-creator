import type { ArcPrimitive, CirclePrimitive, LinePrimitive, Point, Primitive } from '../types/model';
import { EPSILON, add, cross, distance, dot, pointKey, scale, subtract } from '../utils/math';
import { arcRadius, isPointOnArcSweep, normalizeArc } from './arc';

function lineLineIntersectionSegment(a: LinePrimitive, b: LinePrimitive): Point[] {
  const p = a.a;
  const r = subtract(a.b, a.a);
  const q = b.a;
  const s = subtract(b.b, b.a);
  const rxs = cross(r, s);
  const qmp = subtract(q, p);

  if (Math.abs(rxs) < EPSILON) {
    return [];
  }

  const t = cross(qmp, s) / rxs;
  const u = cross(qmp, r) / rxs;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return [];
  }

  return [add(p, scale(r, t))];
}

function lineCircleIntersections(line: LinePrimitive, circle: CirclePrimitive): Point[] {
  const d = subtract(line.b, line.a);
  const f = subtract(line.a, circle.center);

  const a = dot(d, d);
  const b = 2 * dot(f, d);
  const c = dot(f, f) - circle.radius * circle.radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) {
    return [];
  }

  if (Math.abs(discriminant) < EPSILON) {
    const t = -b / (2 * a);
    if (t >= -EPSILON && t <= 1 + EPSILON) {
      return [add(line.a, scale(d, t))];
    }
    return [];
  }

  const sqrt = Math.sqrt(Math.max(0, discriminant));
  const t1 = (-b + sqrt) / (2 * a);
  const t2 = (-b - sqrt) / (2 * a);
  const out: Point[] = [];

  if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
    out.push(add(line.a, scale(d, t1)));
  }
  if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
    out.push(add(line.a, scale(d, t2)));
  }

  return out;
}

function circleCircleIntersections(a: CirclePrimitive, b: CirclePrimitive): Point[] {
  const d = distance(a.center, b.center);

  if (d < EPSILON) {
    return [];
  }
  if (d > a.radius + b.radius + EPSILON) {
    return [];
  }
  if (d < Math.abs(a.radius - b.radius) - EPSILON) {
    return [];
  }

  const p2 =
    (a.radius * a.radius - b.radius * b.radius + d * d) /
    (2 * d);
  const h2 = a.radius * a.radius - p2 * p2;
  if (h2 < -EPSILON) {
    return [];
  }

  const h = Math.sqrt(Math.max(0, h2));
  const v = {
    x: (b.center.x - a.center.x) / d,
    y: (b.center.y - a.center.y) / d
  };

  const base = {
    x: a.center.x + p2 * v.x,
    y: a.center.y + p2 * v.y
  };

  if (h < EPSILON) {
    return [base];
  }

  return [
    { x: base.x + -v.y * h, y: base.y + v.x * h },
    { x: base.x - -v.y * h, y: base.y - v.x * h }
  ];
}

function circleFromArc(arc: ArcPrimitive): CirclePrimitive {
  const normalized = normalizeArc(arc);
  return {
    id: normalized.id,
    kind: 'circle',
    center: normalized.center,
    radius: arcRadius(normalized),
    color: normalized.color,
    strokeWidth: normalized.strokeWidth
  };
}

function filterPointsOnArc(points: Point[], arc: ArcPrimitive): Point[] {
  const normalized = normalizeArc(arc);
  return points.filter((point) => isPointOnArcSweep(point, normalized, 1e-4));
}

export function intersections(primitives: Primitive[]): Point[] {
  const results: Point[] = [];

  for (let i = 0; i < primitives.length; i += 1) {
    for (let j = i + 1; j < primitives.length; j += 1) {
      const a = primitives[i];
      const b = primitives[j];

      if (a.kind === 'line' && b.kind === 'line') {
        results.push(...lineLineIntersectionSegment(a, b));
      } else if (a.kind === 'line' && b.kind === 'circle') {
        results.push(...lineCircleIntersections(a, b));
      } else if (a.kind === 'circle' && b.kind === 'line') {
        results.push(...lineCircleIntersections(b, a));
      } else if (a.kind === 'line' && b.kind === 'arc') {
        results.push(...filterPointsOnArc(lineCircleIntersections(a, circleFromArc(b)), b));
      } else if (a.kind === 'arc' && b.kind === 'line') {
        results.push(...filterPointsOnArc(lineCircleIntersections(b, circleFromArc(a)), a));
      } else if (a.kind === 'circle' && b.kind === 'circle') {
        results.push(...circleCircleIntersections(a, b));
      } else if (a.kind === 'circle' && b.kind === 'arc') {
        results.push(...filterPointsOnArc(circleCircleIntersections(a, circleFromArc(b)), b));
      } else if (a.kind === 'arc' && b.kind === 'circle') {
        results.push(...filterPointsOnArc(circleCircleIntersections(circleFromArc(a), b), a));
      } else if (a.kind === 'arc' && b.kind === 'arc') {
        const candidates = circleCircleIntersections(circleFromArc(a), circleFromArc(b));
        results.push(
          ...candidates.filter(
            (point) => isPointOnArcSweep(point, normalizeArc(a), 1e-4) && isPointOnArcSweep(point, normalizeArc(b), 1e-4)
          )
        );
      }
    }
  }

  const dedup = new Map<string, Point>();
  for (const point of results) {
    dedup.set(pointKey(point), point);
  }

  return [...dedup.values()];
}
