import {
  arcPathD,
  getTilePolygon,
  periodicNeighborOffsets,
  tileBasisVectors,
  translatePoints
} from '../../geometry';
import type { ExportOptions, Primitive, ProjectState, TileConfig } from '../../types/model';
import { translatePrimitive } from '../../geometry/transforms';
import { getPrimitiveStrokeWidth } from '../../state/projectState';

function polygonPoints(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function primitiveSvg(primitive: Primitive): string {
  const strokeWidth = getPrimitiveStrokeWidth(primitive);
  if (primitive.kind === 'line') {
    return `<line x1="${primitive.a.x}" y1="${primitive.a.y}" x2="${primitive.b.x}" y2="${primitive.b.y}" stroke="${primitive.color}" stroke-width="${strokeWidth}" fill="none" />`;
  }

  if (primitive.kind === 'arc') {
    return `<path d="${arcPathD(primitive)}" stroke="${primitive.color}" stroke-width="${strokeWidth}" fill="none" />`;
  }

  return `<circle cx="${primitive.center.x}" cy="${primitive.center.y}" r="${primitive.radius}" stroke="${primitive.color}" stroke-width="${strokeWidth}" fill="none" />`;
}

function getCellOffset(tile: TileConfig, col: number, row: number): { x: number; y: number } {
  const { u, v } = tileBasisVectors(tile);
  return {
    x: col * u.x + row * v.x,
    y: col * u.y + row * v.y
  };
}

function boundsForPoints(
  points: { x: number; y: number }[],
  margin: number
): { minX: number; minY: number; width: number; height: number } {
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

  return {
    minX: minX - margin,
    minY: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2
  };
}

function boundsForPattern(
  tile: TileConfig,
  options: ExportOptions
): { minX: number; minY: number; width: number; height: number } {
  const base = getTilePolygon(tile);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < options.pattern.rows; row += 1) {
    for (let col = 0; col < options.pattern.columns; col += 1) {
      const offset = getCellOffset(tile, col, row);
      const moved = translatePoints(base, offset);
      for (const point of moved) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  const margin = tile.size * 0.2;
  return boundsForPoints(
    [
      { x: minX, y: minY },
      { x: maxX, y: maxY }
    ],
    margin
  );
}

function boundsForSingleTile(tile: TileConfig): { minX: number; minY: number; width: number; height: number } {
  const margin = tile.size * 0.2;
  return boundsForPoints(getTilePolygon(tile), margin);
}

function renderClippedTile(
  tilePolygon: { x: number; y: number }[],
  primitives: Primitive[],
  neighborOffsets: { x: number; y: number }[],
  offset: { x: number; y: number },
  clipId: string
): { def: string; group: string } {
  const movedPolygon = translatePoints(tilePolygon, offset);
  const def = `<clipPath id="${clipId}"><polygon points="${polygonPoints(movedPolygon)}" /></clipPath>`;
  const renderedPrimitives = primitives.flatMap((primitive) =>
    neighborOffsets.map((neighbor) =>
      primitiveSvg(
        translatePrimitive(primitive, {
          x: offset.x + neighbor.x,
          y: offset.y + neighbor.y
        })
      )
    )
  );

  return {
    def,
    group: `<g clip-path="url(#${clipId})">${renderedPrimitives.join('')}</g>`
  };
}

interface SingleTileExportOptions {
  background?: string;
}

export function buildTiledSvg(projectState: ProjectState, options: ExportOptions): string {
  const tilePolygon = getTilePolygon(projectState.tile);
  const neighborOffsets = periodicNeighborOffsets(projectState.tile);
  const bounds = boundsForPattern(projectState.tile, options);

  const defs: string[] = [];
  const groups: string[] = [];

  for (let row = 0; row < options.pattern.rows; row += 1) {
    for (let col = 0; col < options.pattern.columns; col += 1) {
      const offset = getCellOffset(projectState.tile, col, row);
      const clipId = `clip-${col}-${row}`;
      const rendered = renderClippedTile(
        tilePolygon,
        projectState.primitives,
        neighborOffsets,
        offset,
        clipId
      );

      defs.push(rendered.def);
      groups.push(rendered.group);
    }
  }

  const background = options.background
    ? `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${options.background}" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">
<defs>${defs.join('')}</defs>
${background}
${groups.join('')}
</svg>`;
}

export function buildSingleTileSvg(
  projectState: ProjectState,
  options: SingleTileExportOptions = {}
): string {
  const tilePolygon = getTilePolygon(projectState.tile);
  const neighborOffsets = periodicNeighborOffsets(projectState.tile);
  const bounds = boundsForSingleTile(projectState.tile);
  const rendered = renderClippedTile(
    tilePolygon,
    projectState.primitives,
    neighborOffsets,
    { x: 0, y: 0 },
    'clip-tile'
  );

  const background = options.background
    ? `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${options.background}" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">
<defs>${rendered.def}</defs>
${background}
${rendered.group}
</svg>`;
}
