import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PATTERN_BOUNDS_STROKE } from '../../geometry';
import type { PatternSize, Point, Primitive, TileConfig } from '../../types/model';
import { renderedViewBoxLayout } from '../editor/coordinates';
import {
  buildPatternRenderResult,
  type OutputRenderFragment,
  type PatternRenderBounds
} from './patternRender';

interface TilingPreviewProps {
  tile: TileConfig;
  primitives: Primitive[];
  pattern: PatternSize;
  zoom: number;
  showPatternBounds: boolean;
}

interface PanDragState {
  clientX: number;
  clientY: number;
  startOffset: Point;
}

function polygonPoints(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
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

function fragmentElement(fragment: OutputRenderFragment, key: string): JSX.Element {
  if (fragment.kind === 'line-path') {
    return (
      <path
        key={key}
        d={linePathD(fragment.points)}
        stroke={fragment.color}
        strokeWidth={fragment.strokeWidth}
        fill="none"
      />
    );
  }

  if (fragment.kind === 'circle') {
    return (
      <circle
        key={key}
        cx={fragment.center.x}
        cy={fragment.center.y}
        r={fragment.radius}
        stroke={fragment.color}
        strokeWidth={fragment.strokeWidth}
        fill="none"
      />
    );
  }

  return (
    <path
      key={key}
      d={arcFragmentPathD(fragment)}
      stroke={fragment.color}
      strokeWidth={fragment.strokeWidth}
      fill="none"
    />
  );
}

function computeViewBox(bounds: PatternRenderBounds, zoom: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;
  const scaledWidth = bounds.width / zoom;
  const scaledHeight = bounds.height / zoom;

  return {
    x: centerX - scaledWidth / 2,
    y: centerY - scaledHeight / 2,
    width: scaledWidth,
    height: scaledHeight
  };
}

function capturePointer(target: SVGSVGElement, pointerId: number): void {
  if (typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(pointerId);
  }
}

function releasePointer(target: SVGSVGElement, pointerId: number): void {
  if (
    typeof target.hasPointerCapture === 'function' &&
    typeof target.releasePointerCapture === 'function' &&
    target.hasPointerCapture(pointerId)
  ) {
    target.releasePointerCapture(pointerId);
  }
}

export function TilingPreview(props: TilingPreviewProps): JSX.Element {
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
  const rendered = useMemo(
    () => buildPatternRenderResult(props.tile, props.primitives, props.pattern),
    [props.pattern, props.primitives, props.tile]
  );
  const zoomedViewBox = useMemo(
    () => computeViewBox(rendered.bounds, props.zoom),
    [props.zoom, rendered.bounds]
  );
  const viewBox = useMemo(
    () => ({
      x: zoomedViewBox.x + panOffset.x,
      y: zoomedViewBox.y + panOffset.y,
      width: zoomedViewBox.width,
      height: zoomedViewBox.height
    }),
    [panOffset, zoomedViewBox]
  );
  const clipId = 'preview-pattern-clip';

  useEffect(() => {
    setPanDrag(null);
  }, [props.pattern, props.tile, props.zoom]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    setPanDrag({
      clientX: event.clientX,
      clientY: event.clientY,
      startOffset: panOffset
    });
    capturePointer(event.currentTarget, event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!panDrag) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const renderedLayout = renderedViewBoxLayout(rect, viewBox);
    const deltaX = event.clientX - panDrag.clientX;
    const deltaY = event.clientY - panDrag.clientY;
    const worldDeltaX = (deltaX / renderedLayout.width) * viewBox.width;
    const worldDeltaY = (deltaY / renderedLayout.height) * viewBox.height;

    setPanOffset({
      x: panDrag.startOffset.x - worldDeltaX,
      y: panDrag.startOffset.y - worldDeltaY
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!panDrag) {
      releasePointer(event.currentTarget, event.pointerId);
      return;
    }

    setPanDrag(null);
    releasePointer(event.currentTarget, event.pointerId);
  };

  return (
    <section className="canvas-panel">
      <h2>Pattern Preview</h2>
      <svg
        data-testid="tiling-preview"
        className={`preview-canvas${panDrag ? ' panning' : ''}`}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={rendered.bounds.minX}
              y={rendered.bounds.minY}
              width={rendered.bounds.width}
              height={rendered.bounds.height}
            />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {rendered.fragments.map((fragment, index) => fragmentElement(fragment, `fragment-${index}`))}
          {rendered.outlinePolygons.map((points, index) => (
            <polygon
              key={`outline-${index}`}
              className="tile-outline preview-outline"
              points={polygonPoints(points)}
            />
          ))}
        </g>

        {props.showPatternBounds ? (
          <rect
            className="pattern-bounds"
            x={rendered.bounds.minX}
            y={rendered.bounds.minY}
            width={rendered.bounds.width}
            height={rendered.bounds.height}
            fill="none"
            stroke={PATTERN_BOUNDS_STROKE}
            strokeWidth={2}
          />
        ) : null}
      </svg>
    </section>
  );
}
