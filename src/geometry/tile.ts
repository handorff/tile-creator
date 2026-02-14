import type { Point, TileConfig } from '../types/model';

export function getTilePolygon(config: TileConfig): Point[] {
  if (config.shape === 'square') {
    const s = config.size;
    return [
      { x: -s, y: -s },
      { x: s, y: -s },
      { x: s, y: s },
      { x: -s, y: s }
    ];
  }

  const points: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = ((-90 + i * 60) * Math.PI) / 180;
    points.push({
      x: config.size * Math.cos(angle),
      y: config.size * Math.sin(angle)
    });
  }

  return points;
}

export function getSeedSnapPoints(config: TileConfig): Point[] {
  const polygon = getTilePolygon(config);
  const midpoints: Point[] = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    midpoints.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    });
  }

  return [...polygon, ...midpoints, { x: 0, y: 0 }];
}

export function tileBasisVectors(config: TileConfig): { u: Point; v: Point } {
  if (config.shape === 'square') {
    const d = config.size * 2;
    return {
      u: { x: d, y: 0 },
      v: { x: 0, y: d }
    };
  }

  const r = config.size;
  const sqrt3 = Math.sqrt(3);
  return {
    u: { x: sqrt3 * r, y: 0 },
    v: { x: (sqrt3 * r) / 2, y: (3 * r) / 2 }
  };
}

export function periodicNeighborOffsets(config: TileConfig): Point[] {
  const { u, v } = tileBasisVectors(config);
  const offsets: Point[] = [];
  for (let i = -1; i <= 1; i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      offsets.push({
        x: i * u.x + j * v.x,
        y: i * u.y + j * v.y
      });
    }
  }
  return offsets;
}

export function translatePoints(points: Point[], offset: Point): Point[] {
  return points.map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y
  }));
}

export function polygonBounds(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}
