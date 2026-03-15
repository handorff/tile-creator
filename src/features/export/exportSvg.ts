import {
  arcPathD,
  getTilePolygon,
  PATTERN_BOUNDS_STROKE,
  periodicNeighborOffsets,
  translatePoints
} from '../../geometry';
import { translatePrimitive } from '../../geometry/transforms';
import { buildPatternRenderResult, type OutputRenderFragment } from '../tiling/patternRender';
import { getPrimitiveStrokeWidth } from '../../state/projectState';
import type { ExportOptions, Point, Primitive, ProjectState, TileConfig } from '../../types/model';

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

function linePathD(points: Point[]): string {
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')}`;
}

function arcFragmentPathD(fragment: Extract<OutputRenderFragment, { kind: 'arc' }>): string {
  const largeArc = fragment.largeArc ? 1 : 0;
  const sweep = fragment.clockwise ? 1 : 0;
  return `M ${fragment.start.x} ${fragment.start.y} A ${fragment.radius} ${fragment.radius} 0 ${largeArc} ${sweep} ${fragment.end.x} ${fragment.end.y}`;
}

function fragmentSvg(fragment: OutputRenderFragment): string {
  if (fragment.kind === 'line-path') {
    return `<path d="${linePathD(fragment.points)}" stroke="${fragment.color}" stroke-width="${fragment.strokeWidth}" fill="none" />`;
  }

  if (fragment.kind === 'circle') {
    return `<circle cx="${fragment.center.x}" cy="${fragment.center.y}" r="${fragment.radius}" stroke="${fragment.color}" stroke-width="${fragment.strokeWidth}" fill="none" />`;
  }

  return `<path d="${arcFragmentPathD(fragment)}" stroke="${fragment.color}" stroke-width="${fragment.strokeWidth}" fill="none" />`;
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
  const rendered = buildPatternRenderResult(projectState.tile, projectState.primitives, options.pattern);
  const clipId = 'pattern-export-clip';
  const background = options.background
    ? `<rect x="${rendered.bounds.minX}" y="${rendered.bounds.minY}" width="${rendered.bounds.width}" height="${rendered.bounds.height}" fill="${options.background}" />`
    : '';
  const patternBoundsRect = options.showPatternBounds
    ? `<rect class="pattern-bounds" x="${rendered.bounds.minX}" y="${rendered.bounds.minY}" width="${rendered.bounds.width}" height="${rendered.bounds.height}" fill="none" stroke="${PATTERN_BOUNDS_STROKE}" stroke-width="2" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rendered.bounds.minX} ${rendered.bounds.minY} ${rendered.bounds.width} ${rendered.bounds.height}">
<defs><clipPath id="${clipId}"><rect x="${rendered.bounds.minX}" y="${rendered.bounds.minY}" width="${rendered.bounds.width}" height="${rendered.bounds.height}" /></clipPath></defs>
${background}
<g clip-path="url(#${clipId})">${rendered.fragments.map((fragment) => fragmentSvg(fragment)).join('')}</g>
${patternBoundsRect}
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
