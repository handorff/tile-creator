import type { Point } from '../types/model';

export const EPSILON = 1e-6;

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(p: Point, value: number): Point {
  return { x: p.x * value, y: p.y * value };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function almostEqual(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function pointKey(point: Point, precision = 4): string {
  return `${point.x.toFixed(precision)}:${point.y.toFixed(precision)}`;
}
