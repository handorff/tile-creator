import type { ArcPrimitive, Point } from '../types/model';
import { EPSILON, distance } from '../utils/math';

const TAU = Math.PI * 2;

function normalizeAngle(value: number): number {
  const normalized = value % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function angleFromCenter(center: Point, point: Point): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function sweepDelta(startAngle: number, endAngle: number, clockwise: boolean): number {
  return clockwise
    ? normalizeAngle(endAngle - startAngle)
    : normalizeAngle(startAngle - endAngle);
}

export function arcRadius(arc: Pick<ArcPrimitive, 'center' | 'start'>): number {
  return distance(arc.center, arc.start);
}

export function projectPointToCircle(center: Point, radius: number, point: Point): Point {
  if (radius < EPSILON) {
    return { ...center };
  }

  const offsetX = point.x - center.x;
  const offsetY = point.y - center.y;
  const magnitude = Math.hypot(offsetX, offsetY);
  if (magnitude < EPSILON) {
    return { x: center.x + radius, y: center.y };
  }

  const scale = radius / magnitude;
  return {
    x: center.x + offsetX * scale,
    y: center.y + offsetY * scale
  };
}

export function isClockwiseMinorArc(center: Point, start: Point, end: Point): boolean {
  const startAngle = angleFromCenter(center, start);
  const endAngle = angleFromCenter(center, end);
  const clockwiseDelta = sweepDelta(startAngle, endAngle, true);
  const counterclockwiseDelta = sweepDelta(startAngle, endAngle, false);
  return clockwiseDelta <= counterclockwiseDelta;
}

function resolveArcSweep(arc: Pick<ArcPrimitive, 'center' | 'start' | 'end' | 'largeArc'>): {
  startAngle: number;
  clockwise: boolean;
  delta: number;
} {
  const startAngle = angleFromCenter(arc.center, arc.start);
  const endAngle = angleFromCenter(arc.center, arc.end);
  const clockwiseMinor = isClockwiseMinorArc(arc.center, arc.start, arc.end);
  const minorDelta = sweepDelta(startAngle, endAngle, clockwiseMinor);
  const clockwise = arc.largeArc ? !clockwiseMinor : clockwiseMinor;
  const delta = arc.largeArc ? TAU - minorDelta : minorDelta;

  return {
    startAngle,
    clockwise,
    delta
  };
}

export function normalizeArc(arc: ArcPrimitive): ArcPrimitive {
  const startRadius = distance(arc.center, arc.start);
  const endRadius = distance(arc.center, arc.end);
  const radius = Math.max(EPSILON, startRadius > EPSILON ? startRadius : endRadius);
  const start = projectPointToCircle(arc.center, radius, arc.start);
  const end = projectPointToCircle(arc.center, radius, arc.end);

  return {
    ...arc,
    start,
    end,
    clockwise: isClockwiseMinorArc(arc.center, start, end)
  };
}

export function arcPathD(arc: ArcPrimitive): string {
  const normalized = normalizeArc(arc);
  const radius = arcRadius(normalized);
  const sweep = resolveArcSweep(normalized).clockwise ? 1 : 0;
  const largeArc = normalized.largeArc ? 1 : 0;

  return `M ${normalized.start.x} ${normalized.start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${normalized.end.x} ${normalized.end.y}`;
}

export function isPointOnArcSweep(point: Point, arc: ArcPrimitive, epsilon = EPSILON): boolean {
  const normalized = normalizeArc(arc);
  const sweep = resolveArcSweep(normalized);
  const pointAngle = angleFromCenter(normalized.center, point);
  const traveled = sweepDelta(sweep.startAngle, pointAngle, sweep.clockwise);
  return traveled >= -epsilon && traveled <= sweep.delta + epsilon;
}

export function arcMidpoint(arc: ArcPrimitive): Point {
  const normalized = normalizeArc(arc);
  const radius = arcRadius(normalized);
  const sweep = resolveArcSweep(normalized);
  const midpointAngle = sweep.clockwise
    ? sweep.startAngle + sweep.delta / 2
    : sweep.startAngle - sweep.delta / 2;

  return {
    x: normalized.center.x + radius * Math.cos(midpointAngle),
    y: normalized.center.y + radius * Math.sin(midpointAngle)
  };
}

export function isPointNearArc(point: Point, arc: ArcPrimitive, tolerance: number): boolean {
  const normalized = normalizeArc(arc);
  const radius = arcRadius(normalized);
  const radialError = Math.abs(distance(point, normalized.center) - radius);

  if (radialError <= tolerance && isPointOnArcSweep(point, normalized)) {
    return true;
  }

  return (
    distance(point, normalized.start) <= tolerance || distance(point, normalized.end) <= tolerance
  );
}
