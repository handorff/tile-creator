import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  gatherSnapSegments,
  gatherSnapPoints,
  getDirectionalSnapOnSegments,
  getLinePassThroughSnap,
  getSnapPoint,
  getSnapPointOnSegments,
  getTilePolygon,
  hitTestPrimitive,
  periodicNeighborOffsets,
  polygonBounds,
  translatePrimitive
} from '../../geometry';
import { FIXED_STROKE_WIDTH } from '../../state/projectState';
import type { Point, Primitive, TileConfig, Tool } from '../../types/model';
import { createId } from '../../utils/ids';
import { clamp, distance, dot, subtract } from '../../utils/math';
import { PrimitiveSvg } from './PrimitiveSvg';

interface EditorCanvasProps {
  tile: TileConfig;
  primitives: Primitive[];
  activeTool: Tool;
  activeColor: string;
  zoom: number;
  onAddPrimitive: (primitive: Primitive) => void;
  onUpdatePrimitive: (primitive: Primitive) => void;
  onSplitLine: (id: string, point: Point) => void;
  onErasePrimitive: (id: string) => void;
}

type DraftState =
  | { kind: 'line'; start: Point; end: Point }
  | { kind: 'circle'; center: Point; radius: number }
  | null;

type EditHandle = 'line-a' | 'line-b' | 'circle-center' | 'circle-radius';

interface EditDragState {
  primitiveId: string;
  handle: EditHandle;
  preview: Primitive;
}

interface PanDragState {
  clientX: number;
  clientY: number;
  startOffset: Point;
}

const DRAW_MIN_DISTANCE = 1;

function viewBoxForTile(tile: TileConfig): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const polygon = getTilePolygon(tile);
  const neighbors = periodicNeighborOffsets(tile);

  const points: Point[] = [...polygon];
  for (const offset of neighbors) {
    for (const point of polygon) {
      points.push({
        x: point.x + offset.x,
        y: point.y + offset.y
      });
    }
  }

  const bounds = polygonBounds(points);
  const margin = tile.size * 0.5;

  return {
    x: bounds.minX - margin,
    y: bounds.minY - margin,
    width: bounds.maxX - bounds.minX + margin * 2,
    height: bounds.maxY - bounds.minY + margin * 2
  };
}

function zoomViewBox(
  viewBox: { x: number; y: number; width: number; height: number },
  zoom: number
): { x: number; y: number; width: number; height: number } {
  const clampedZoom = Math.min(10, Math.max(0.5, zoom));
  const width = viewBox.width / clampedZoom;
  const height = viewBox.height / clampedZoom;
  return {
    x: viewBox.x + (viewBox.width - width) / 2,
    y: viewBox.y + (viewBox.height - height) / 2,
    width,
    height
  };
}

function toWorldPoint(
  event: ReactPointerEvent<SVGSVGElement>,
  viewBox: { x: number; y: number; width: number; height: number }
): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
  const y = ((event.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y;
  return { x, y };
}

function polygonPath(points: Point[]): string {
  if (points.length === 0) {
    return '';
  }

  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')} Z`;
}

function circleRadiusHandle(circle: Extract<Primitive, { kind: 'circle' }>): Point {
  return {
    x: circle.center.x + circle.radius,
    y: circle.center.y
  };
}

function editHandleAtPoint(point: Point, primitive: Primitive, tolerance: number): EditHandle | null {
  if (primitive.kind === 'line') {
    if (distance(point, primitive.a) <= tolerance) {
      return 'line-a';
    }
    if (distance(point, primitive.b) <= tolerance) {
      return 'line-b';
    }
    return null;
  }

  if (distance(point, primitive.center) <= tolerance) {
    return 'circle-center';
  }

  if (distance(point, circleRadiusHandle(primitive)) <= tolerance) {
    return 'circle-radius';
  }

  return null;
}

function applyEditHandle(preview: Primitive, handle: EditHandle, point: Point): Primitive {
  if (preview.kind === 'line' && handle === 'line-a') {
    return { ...preview, a: point };
  }

  if (preview.kind === 'line' && handle === 'line-b') {
    return { ...preview, b: point };
  }

  if (preview.kind === 'circle' && handle === 'circle-center') {
    return { ...preview, center: point };
  }

  if (preview.kind === 'circle' && handle === 'circle-radius') {
    return {
      ...preview,
      radius: Math.max(DRAW_MIN_DISTANCE, distance(preview.center, point))
    };
  }

  return preview;
}

function projectPointToSegment(point: Point, a: Point, b: Point): Point {
  const ab = subtract(b, a);
  const ap = subtract(point, a);
  const denom = dot(ab, ab);
  if (denom <= 0) {
    return a;
  }

  const t = clamp(dot(ap, ab) / denom, 0, 1);
  return {
    x: a.x + ab.x * t,
    y: a.y + ab.y * t
  };
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  return distance(point, projectPointToSegment(point, a, b));
}

function findNearestLine(point: Point, primitives: Primitive[], tolerance: number): Primitive | null {
  let best: Primitive | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const primitive of primitives) {
    if (primitive.kind !== 'line') {
      continue;
    }

    const d = distanceToSegment(point, primitive.a, primitive.b);
    if (d <= tolerance && d < bestDistance) {
      best = primitive;
      bestDistance = d;
    }
  }

  return best;
}

export function EditorCanvas(props: EditorCanvasProps): JSX.Element {
  const [draft, setDraft] = useState<DraftState>(null);
  const [drawing, setDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDrag, setEditDrag] = useState<EditDragState | null>(null);
  const [splitTargetLineId, setSplitTargetLineId] = useState<string | null>(null);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
  const baseViewBox = useMemo(() => viewBoxForTile(props.tile), [props.tile]);
  const zoomedViewBox = useMemo(() => zoomViewBox(baseViewBox, props.zoom), [baseViewBox, props.zoom]);
  const viewBox = useMemo(
    () => ({
      x: zoomedViewBox.x + panOffset.x,
      y: zoomedViewBox.y + panOffset.y,
      width: zoomedViewBox.width,
      height: zoomedViewBox.height
    }),
    [zoomedViewBox, panOffset]
  );
  const tilePolygon = useMemo(() => getTilePolygon(props.tile), [props.tile]);
  const tilePath = useMemo(() => polygonPath(tilePolygon), [tilePolygon]);
  const periodicOffsets = useMemo(() => periodicNeighborOffsets(props.tile), [props.tile]);

  useEffect(() => {
    if (selectedId && !props.primitives.some((primitive) => primitive.id === selectedId)) {
      setSelectedId(null);
      setEditDrag(null);
    }
  }, [props.primitives, selectedId]);

  useEffect(() => {
    if (
      splitTargetLineId &&
      !props.primitives.some(
        (primitive) => primitive.id === splitTargetLineId && primitive.kind === 'line'
      )
    ) {
      setSplitTargetLineId(null);
    }
  }, [props.primitives, splitTargetLineId]);

  useEffect(() => {
    if (props.activeTool !== 'select') {
      setSelectedId(null);
      setEditDrag(null);
    }
  }, [props.activeTool]);

  useEffect(() => {
    if (props.activeTool !== 'pan') {
      setPanDrag(null);
    }
  }, [props.activeTool]);

  useEffect(() => {
    if (props.activeTool !== 'split') {
      setSplitTargetLineId(null);
    }
  }, [props.activeTool]);

  const renderedPrimitives = useMemo(() => {
    if (!editDrag) {
      return props.primitives;
    }

    return props.primitives.map((primitive) =>
      primitive.id === editDrag.primitiveId ? editDrag.preview : primitive
    );
  }, [editDrag, props.primitives]);

  const selectedPrimitive = useMemo(
    () => renderedPrimitives.find((primitive) => primitive.id === selectedId) ?? null,
    [renderedPrimitives, selectedId]
  );
  const splitTargetLine = useMemo(
    () =>
      renderedPrimitives.find(
        (primitive) => primitive.id === splitTargetLineId && primitive.kind === 'line'
      ) ?? null,
    [renderedPrimitives, splitTargetLineId]
  );

  const snapPoints = useMemo(
    () => gatherSnapPoints(renderedPrimitives, props.tile),
    [renderedPrimitives, props.tile]
  );
  const snapSegments = useMemo(
    () => gatherSnapSegments(renderedPrimitives, props.tile),
    [renderedPrimitives, props.tile]
  );

  const snapTolerance = props.tile.size * 0.08;
  const linePassTolerance = props.tile.size * 0.05;
  const editHandleTolerance = props.tile.size * 0.09;

  const resolvePointWith = (raw: Point, points: Point[], segments: Array<{ a: Point; b: Point }>): Point =>
    getSnapPoint(raw, { points, tolerance: snapTolerance }) ??
    getSnapPointOnSegments(raw, segments, snapTolerance) ??
    raw;

  const resolvePoint = (raw: Point): Point => resolvePointWith(raw, snapPoints, snapSegments);

  const resolveLineEndWithPoints = (
    start: Point,
    raw: Point,
    points: Point[],
    segments: Array<{ a: Point; b: Point }>
  ): Point => {
    const endpointSnap = getSnapPoint(raw, { points, tolerance: snapTolerance });
    if (endpointSnap) {
      return endpointSnap;
    }

    const throughSnap = getLinePassThroughSnap(start, raw, points, linePassTolerance);
    if (throughSnap) {
      const directionalSegmentSnap = getDirectionalSnapOnSegments(
        start,
        throughSnap,
        raw,
        segments,
        snapTolerance
      );
      if (directionalSegmentSnap) {
        return directionalSegmentSnap;
      }

      return throughSnap;
    }

    const segmentSnap = getSnapPointOnSegments(raw, segments, snapTolerance);
    if (segmentSnap) {
      return segmentSnap;
    }

    return raw;
  };

  const resolveLineEnd = (start: Point, raw: Point): Point =>
    resolveLineEndWithPoints(start, raw, snapPoints, snapSegments);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const raw = toWorldPoint(event, viewBox);

    if (props.activeTool === 'erase') {
      const hit = hitTestPrimitive(raw, renderedPrimitives, props.tile.size * 0.1);
      if (hit) {
        props.onErasePrimitive(hit.id);
      }
      setSelectedId(null);
      return;
    }

    if (props.activeTool === 'pan') {
      setPanDrag({
        clientX: event.clientX,
        clientY: event.clientY,
        startOffset: panOffset
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (props.activeTool === 'split') {
      const hitLine = findNearestLine(raw, renderedPrimitives, props.tile.size * 0.1);
      if (!splitTargetLine || splitTargetLine.kind !== 'line') {
        if (hitLine) {
          setSplitTargetLineId(hitLine.id);
        }
        return;
      }

      const distanceToTarget = distanceToSegment(raw, splitTargetLine.a, splitTargetLine.b);
      if (
        hitLine &&
        hitLine.id !== splitTargetLine.id &&
        distanceToTarget > props.tile.size * 0.12
      ) {
        setSplitTargetLineId(hitLine.id);
        return;
      }

      const snappedPoint = resolvePoint(raw);
      const splitPoint = projectPointToSegment(snappedPoint, splitTargetLine.a, splitTargetLine.b);
      props.onSplitLine(splitTargetLine.id, splitPoint);
      return;
    }

    if (props.activeTool === 'select') {
      if (selectedPrimitive) {
        const handle = editHandleAtPoint(raw, selectedPrimitive, editHandleTolerance);
        if (handle) {
          setEditDrag({
            primitiveId: selectedPrimitive.id,
            handle,
            preview: selectedPrimitive
          });
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }

      const hit = hitTestPrimitive(raw, renderedPrimitives, props.tile.size * 0.1);
      if (hit) {
        setSelectedId(hit.id);
      } else {
        setSelectedId(null);
      }
      return;
    }

    setSelectedId(null);

    const point = resolvePoint(raw);
    if (props.activeTool === 'line') {
      setDraft({ kind: 'line', start: point, end: point });
    } else if (props.activeTool === 'circle') {
      setDraft({ kind: 'circle', center: point, radius: 0 });
    } else {
      return;
    }

    setDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (panDrag) {
      const rect = event.currentTarget.getBoundingClientRect();
      const deltaX = event.clientX - panDrag.clientX;
      const deltaY = event.clientY - panDrag.clientY;
      const worldDeltaX = (deltaX / rect.width) * viewBox.width;
      const worldDeltaY = (deltaY / rect.height) * viewBox.height;

      setPanOffset({
        x: panDrag.startOffset.x - worldDeltaX,
        y: panDrag.startOffset.y - worldDeltaY
      });
      return;
    }

    if (editDrag) {
      const raw = toWorldPoint(event, viewBox);
      setEditDrag((current) => {
        if (!current) {
          return current;
        }

        if (
          current.preview.kind === 'line' &&
          (current.handle === 'line-a' || current.handle === 'line-b')
        ) {
          const anchor = current.handle === 'line-a' ? current.preview.b : current.preview.a;
          const snapPointsForLineEdit = gatherSnapPoints(
            props.primitives.filter((primitive) => primitive.id !== current.primitiveId),
            props.tile
          );
          const snapSegmentsForLineEdit = gatherSnapSegments(
            props.primitives.filter((primitive) => primitive.id !== current.primitiveId),
            props.tile
          );
          const snappedPoint = resolveLineEndWithPoints(
            anchor,
            raw,
            snapPointsForLineEdit,
            snapSegmentsForLineEdit
          );
          return {
            ...current,
            preview: applyEditHandle(current.preview, current.handle, snappedPoint)
          };
        }

        const point = resolvePoint(raw);
        return {
          ...current,
          preview: applyEditHandle(current.preview, current.handle, point)
        };
      });
      return;
    }

    if (!drawing || !draft) {
      return;
    }

    const raw = toWorldPoint(event, viewBox);
    if (draft.kind === 'line') {
      setDraft({ ...draft, end: resolveLineEnd(draft.start, raw) });
      return;
    }

    const point = resolvePoint(raw);
    setDraft({
      ...draft,
      radius: distance(draft.center, point)
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (panDrag) {
      setPanDrag(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (editDrag) {
      props.onUpdatePrimitive(editDrag.preview);
      setEditDrag(null);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (drawing && draft) {
      if (draft.kind === 'line') {
        const lineLength = distance(draft.start, draft.end);
        if (lineLength > DRAW_MIN_DISTANCE) {
          props.onAddPrimitive({
            id: createId('line'),
            kind: 'line',
            a: draft.start,
            b: draft.end,
            color: props.activeColor
          });
        }
      } else if (draft.radius > DRAW_MIN_DISTANCE) {
        props.onAddPrimitive({
          id: createId('circle'),
          kind: 'circle',
          center: draft.center,
          radius: draft.radius,
          color: props.activeColor
        });
      }
    }

    setDrawing(false);
    setDraft(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const circleHandle =
    selectedPrimitive && selectedPrimitive.kind === 'circle'
      ? circleRadiusHandle(selectedPrimitive)
      : null;

  return (
    <section className="panel">
      <h2>Tile Editor</h2>
      <svg
        className="editor-canvas"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <clipPath id="tile-clip-editor">
            <path d={tilePath} />
          </clipPath>
        </defs>

        <g clipPath="url(#tile-clip-editor)">
          {periodicOffsets.flatMap((offset, idx) =>
            renderedPrimitives.map((primitive) => {
              const moved = translatePrimitive(primitive, offset);
              return (
                <PrimitiveSvg
                  key={`${primitive.id}-${idx}`}
                  primitive={moved}
                  strokeWidth={FIXED_STROKE_WIDTH}
                />
              );
            })
          )}
        </g>

        {snapPoints.map((point, idx) => (
          <circle
            key={`snap-${idx}`}
            className="snap-point"
            cx={point.x}
            cy={point.y}
            r={props.tile.size * 0.015}
          />
        ))}

        {props.activeTool === 'select' && selectedPrimitive ? (
          <PrimitiveSvg
            primitive={selectedPrimitive}
            strokeWidth={FIXED_STROKE_WIDTH * 2}
            className="selected-primitive"
          />
        ) : null}

        {props.activeTool === 'split' && splitTargetLine ? (
          <PrimitiveSvg
            primitive={splitTargetLine}
            strokeWidth={FIXED_STROKE_WIDTH * 2}
            className="split-target-primitive"
          />
        ) : null}

        {props.activeTool === 'select' && selectedPrimitive && selectedPrimitive.kind === 'line' ? (
          <>
            <circle
              className="edit-handle"
              cx={selectedPrimitive.a.x}
              cy={selectedPrimitive.a.y}
              r={props.tile.size * 0.03}
            />
            <circle
              className="edit-handle"
              cx={selectedPrimitive.b.x}
              cy={selectedPrimitive.b.y}
              r={props.tile.size * 0.03}
            />
          </>
        ) : null}

        {props.activeTool === 'select' &&
        selectedPrimitive &&
        selectedPrimitive.kind === 'circle' &&
        circleHandle ? (
          <>
            <line
              className="edit-guide"
              x1={selectedPrimitive.center.x}
              y1={selectedPrimitive.center.y}
              x2={circleHandle.x}
              y2={circleHandle.y}
            />
            <circle
              className="edit-handle"
              cx={selectedPrimitive.center.x}
              cy={selectedPrimitive.center.y}
              r={props.tile.size * 0.03}
            />
            <circle
              className="edit-handle"
              cx={circleHandle.x}
              cy={circleHandle.y}
              r={props.tile.size * 0.03}
            />
          </>
        ) : null}

        {draft && draft.kind === 'line' ? (
          <line
            className="draft"
            x1={draft.start.x}
            y1={draft.start.y}
            x2={draft.end.x}
            y2={draft.end.y}
            stroke={props.activeColor}
            strokeWidth={FIXED_STROKE_WIDTH}
          />
        ) : null}

        {draft && draft.kind === 'circle' ? (
          <circle
            className="draft"
            cx={draft.center.x}
            cy={draft.center.y}
            r={draft.radius}
            stroke={props.activeColor}
            strokeWidth={FIXED_STROKE_WIDTH}
            fill="none"
          />
        ) : null}

        <path d={tilePath} className="tile-outline" />
      </svg>
      <p className="hint">
        Split tool: first click selects which line to split, second click picks the snapped split point.
      </p>
    </section>
  );
}
