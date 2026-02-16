import { useMemo } from 'react';
import { getTilePolygon, polygonBounds } from '../../geometry';
import type { Primitive, TileConfig } from '../../types/model';
import { PrimitiveSvg } from '../editor/PrimitiveSvg';

interface PresetTilePreviewProps {
  id: string;
  tile: TileConfig;
  primitives: Primitive[];
}

function polygonPoints(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function toSafeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function PresetTilePreview({ id, tile, primitives }: PresetTilePreviewProps): JSX.Element {
  const tilePolygon = useMemo(() => getTilePolygon(tile), [tile]);
  const points = useMemo(() => polygonPoints(tilePolygon), [tilePolygon]);
  const viewBox = useMemo(() => {
    const bounds = polygonBounds(tilePolygon);
    const margin = tile.size * 0.25;
    return {
      x: bounds.minX - margin,
      y: bounds.minY - margin,
      width: bounds.maxX - bounds.minX + margin * 2,
      height: bounds.maxY - bounds.minY + margin * 2
    };
  }, [tile.size, tilePolygon]);
  const clipId = useMemo(() => `preset-clip-${toSafeSvgId(id)}`, [id]);

  return (
    <svg
      className="preset-thumbnail"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      aria-label="Tile preview"
      role="img"
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={points} />
        </clipPath>
      </defs>

      <rect
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.width}
        height={viewBox.height}
        fill="#ffffff"
      />

      <g clipPath={`url(#${clipId})`}>
        {primitives.map((primitive) => (
          <PrimitiveSvg key={primitive.id} primitive={primitive} />
        ))}
      </g>

      <polygon className="tile-outline preview-outline" points={points} />
    </svg>
  );
}
