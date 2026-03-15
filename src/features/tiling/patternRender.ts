import {
  getPatternBounds,
  getTilePolygon,
  isClockwiseMinorArc,
  normalizeArc,
  periodicNeighborOffsets,
  pointInPolygon,
  polygonBounds,
  tileBasisVectors,
  translatePoints
} from '../../geometry';
import { translatePrimitive } from '../../geometry/transforms';
import { getPrimitiveStrokeWidth } from '../../state/projectState';
import type {
  ArcPrimitive,
  CirclePrimitive,
  PatternSize,
  Point,
  Primitive,
  TileConfig
} from '../../types/model';
import { cross, dot, EPSILON, subtract } from '../../utils/math';

const TAU = Math.PI * 2;
const CLIP_EPSILON = 1e-6;
const KEY_PRECISION = 4;

interface BaseRenderFragment {
  color: string;
  strokeWidth: number;
}

interface LineRenderFragment extends BaseRenderFragment {
  kind: 'line';
  a: Point;
  b: Point;
}

interface CircleRenderFragment extends BaseRenderFragment {
  kind: 'circle';
  center: Point;
  radius: number;
}

interface ArcRenderFragment extends BaseRenderFragment {
  kind: 'arc';
  center: Point;
  radius: number;
  start: Point;
  end: Point;
  clockwise: boolean;
  largeArc: boolean;
}

type RenderFragment = LineRenderFragment | CircleRenderFragment | ArcRenderFragment;

interface LinePathRenderFragment extends BaseRenderFragment {
  kind: 'line-path';
  points: Point[];
}

export type OutputRenderFragment = CircleRenderFragment | ArcRenderFragment | LinePathRenderFragment;

interface PolygonEdge {
  a: Point;
  b: Point;
  inwardNormal: Point;
}

interface ArcSweep {
  center: Point;
  radius: number;
  startAngle: number;
  clockwise: boolean;
  delta: number;
}

interface LineGraphNode {
  key: string;
  point: Point;
  edgeIds: number[];
}

interface LineGraphEdge {
  a: string;
  b: string;
  used: boolean;
}

interface TileCandidate {
  offset: Point;
  polygon: Point[];
}

interface LatticeCoordinate {
  col: number;
  row: number;
}

export interface PatternRenderBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PatternRenderResult {
  bounds: PatternRenderBounds;
  fragments: OutputRenderFragment[];
  outlinePolygons: Point[][];
}

function normalizeAngle(value: number): number {
  const normalized = value % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function angleFromCenter(center: Point, point: Point): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function angularTravel(startAngle: number, endAngle: number, clockwise: boolean): number {
  return clockwise
    ? normalizeAngle(endAngle - startAngle)
    : normalizeAngle(startAngle - endAngle);
}

function pointOnCircle(center: Point, radius: number, angle: number): Point {
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle)
  };
}

function pointOnSweep(sweep: ArcSweep, travel: number): Point {
  const angle = sweep.clockwise
    ? sweep.startAngle + travel
    : sweep.startAngle - travel;
  return pointOnCircle(sweep.center, sweep.radius, normalizeAngle(angle));
}

function polygonSignedArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - current.y * next.x;
  }
  return area / 2;
}

function convexPolygonEdges(polygon: Point[]): PolygonEdge[] {
  const orientation = polygonSignedArea(polygon) >= 0 ? 1 : -1;
  const edges: PolygonEdge[] = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edge = subtract(b, a);
    const inwardNormal =
      orientation > 0
        ? { x: -edge.y, y: edge.x }
        : { x: edge.y, y: -edge.x };

    edges.push({ a, b, inwardNormal });
  }

  return edges;
}

function pointInConvexPolygon(point: Point, edges: PolygonEdge[]): boolean {
  for (const edge of edges) {
    const signedDistance = dot(edge.inwardNormal, subtract(point, edge.a));
    if (signedDistance < -CLIP_EPSILON) {
      return false;
    }
  }

  return true;
}

function dedupeSorted(values: number[], epsilon: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const sorted = [...values].sort((a, b) => a - b);
  const deduped = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    if (Math.abs(sorted[i] - deduped[deduped.length - 1]) > epsilon) {
      deduped.push(sorted[i]);
    }
  }

  return deduped;
}

function dedupeAngles(values: number[]): number[] {
  const deduped = dedupeSorted(
    values.map((value) => normalizeAngle(value)),
    CLIP_EPSILON
  );

  if (deduped.length > 1 && deduped[0] + TAU - deduped[deduped.length - 1] <= CLIP_EPSILON) {
    deduped.pop();
  }

  return deduped;
}

function intersectCircleSegment(center: Point, radius: number, a: Point, b: Point): Point[] {
  const direction = subtract(b, a);
  const fromCenter = subtract(a, center);
  const aa = dot(direction, direction);
  if (aa <= EPSILON) {
    return [];
  }

  const bb = 2 * dot(fromCenter, direction);
  const cc = dot(fromCenter, fromCenter) - radius * radius;
  const discriminant = bb * bb - 4 * aa * cc;

  if (discriminant < -CLIP_EPSILON) {
    return [];
  }

  const ts: number[] = [];
  if (Math.abs(discriminant) <= CLIP_EPSILON) {
    ts.push(-bb / (2 * aa));
  } else {
    const sqrtDisc = Math.sqrt(Math.max(0, discriminant));
    ts.push((-bb - sqrtDisc) / (2 * aa), (-bb + sqrtDisc) / (2 * aa));
  }

  const intersections: Point[] = [];
  for (const t of ts) {
    if (t < -CLIP_EPSILON || t > 1 + CLIP_EPSILON) {
      continue;
    }

    const clampedT = Math.max(0, Math.min(1, t));
    intersections.push({
      x: a.x + direction.x * clampedT,
      y: a.y + direction.y * clampedT
    });
  }

  return intersections;
}

function clipLineToConvexPolygon(
  primitive: Extract<Primitive, { kind: 'line' }>,
  edges: PolygonEdge[],
  strokeWidth: number
): LineRenderFragment[] {
  const direction = subtract(primitive.b, primitive.a);
  let tEnter = 0;
  let tExit = 1;

  for (const edge of edges) {
    const offset = dot(edge.inwardNormal, subtract(primitive.a, edge.a));
    const denominator = dot(edge.inwardNormal, direction);

    if (Math.abs(denominator) <= CLIP_EPSILON) {
      if (offset < -CLIP_EPSILON) {
        return [];
      }
      continue;
    }

    const t = -offset / denominator;

    if (denominator > 0) {
      tEnter = Math.max(tEnter, t);
    } else {
      tExit = Math.min(tExit, t);
    }

    if (tEnter - tExit > CLIP_EPSILON) {
      return [];
    }
  }

  const startT = Math.max(0, Math.min(1, tEnter));
  const endT = Math.max(0, Math.min(1, tExit));
  if (endT - startT <= CLIP_EPSILON) {
    return [];
  }

  return [
    {
      kind: 'line',
      color: primitive.color,
      strokeWidth,
      a: {
        x: primitive.a.x + direction.x * startT,
        y: primitive.a.y + direction.y * startT
      },
      b: {
        x: primitive.a.x + direction.x * endT,
        y: primitive.a.y + direction.y * endT
      }
    }
  ];
}

function resolveArcSweep(arc: ArcPrimitive): ArcSweep {
  const normalized = normalizeArc(arc);
  const startAngle = angleFromCenter(normalized.center, normalized.start);
  const endAngle = angleFromCenter(normalized.center, normalized.end);
  const clockwiseMinor = isClockwiseMinorArc(normalized.center, normalized.start, normalized.end);
  const minorDelta = angularTravel(startAngle, endAngle, clockwiseMinor);
  const clockwise = normalized.largeArc ? !clockwiseMinor : clockwiseMinor;

  return {
    center: normalized.center,
    radius: Math.max(EPSILON, Math.hypot(
      normalized.start.x - normalized.center.x,
      normalized.start.y - normalized.center.y
    )),
    startAngle: normalizeAngle(startAngle),
    clockwise,
    delta: normalized.largeArc ? TAU - minorDelta : minorDelta
  };
}

function createArcFragment(
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  color: string,
  strokeWidth: number
): ArcRenderFragment | null {
  const delta = angularTravel(startAngle, endAngle, clockwise);
  if (delta <= CLIP_EPSILON) {
    return null;
  }

  return {
    kind: 'arc',
    color,
    strokeWidth,
    center,
    radius,
    start: pointOnCircle(center, radius, startAngle),
    end: pointOnCircle(center, radius, endAngle),
    clockwise,
    largeArc: delta > Math.PI + CLIP_EPSILON
  };
}

function clipCircleToConvexPolygon(
  primitive: CirclePrimitive,
  edges: PolygonEdge[],
  strokeWidth: number
): RenderFragment[] {
  const radius = Math.max(EPSILON, primitive.radius);
  const intersections = edges.flatMap((edge) =>
    intersectCircleSegment(primitive.center, radius, edge.a, edge.b)
  );
  const angles = dedupeAngles(intersections.map((point) => angleFromCenter(primitive.center, point)));

  if (angles.length === 0) {
    if (!pointInConvexPolygon(pointOnCircle(primitive.center, radius, 0), edges)) {
      return [];
    }

    return [
      {
        kind: 'circle',
        color: primitive.color,
        strokeWidth,
        center: primitive.center,
        radius
      }
    ];
  }

  const fragments: RenderFragment[] = [];
  for (let i = 0; i < angles.length; i += 1) {
    const start = angles[i];
    const end = i === angles.length - 1 ? angles[0] + TAU : angles[i + 1];
    const delta = end - start;
    if (delta <= CLIP_EPSILON) {
      continue;
    }

    const sample = pointOnCircle(primitive.center, radius, normalizeAngle(start + delta / 2));
    if (!pointInConvexPolygon(sample, edges)) {
      continue;
    }

    if (delta >= TAU - CLIP_EPSILON) {
      fragments.push({
        kind: 'circle',
        color: primitive.color,
        strokeWidth,
        center: primitive.center,
        radius
      });
      continue;
    }

    const arc = createArcFragment(
      primitive.center,
      radius,
      normalizeAngle(start),
      normalizeAngle(end),
      true,
      primitive.color,
      strokeWidth
    );
    if (arc) {
      fragments.push(arc);
    }
  }

  return fragments;
}

function clipArcToConvexPolygon(
  primitive: ArcPrimitive,
  edges: PolygonEdge[],
  strokeWidth: number
): ArcRenderFragment[] {
  const sweep = resolveArcSweep(primitive);
  if (sweep.delta <= CLIP_EPSILON) {
    return [];
  }

  const splitTravels: number[] = [0, sweep.delta];
  for (const edge of edges) {
    const intersections = intersectCircleSegment(sweep.center, sweep.radius, edge.a, edge.b);
    for (const point of intersections) {
      const angle = angleFromCenter(sweep.center, point);
      const travel = angularTravel(sweep.startAngle, angle, sweep.clockwise);
      if (travel > CLIP_EPSILON && travel < sweep.delta - CLIP_EPSILON) {
        splitTravels.push(travel);
      }
    }
  }

  const travels = dedupeSorted(splitTravels, CLIP_EPSILON);
  const fragments: ArcRenderFragment[] = [];

  for (let i = 0; i < travels.length - 1; i += 1) {
    const startTravel = travels[i];
    const endTravel = travels[i + 1];
    if (endTravel - startTravel <= CLIP_EPSILON) {
      continue;
    }

    const sample = pointOnSweep(sweep, (startTravel + endTravel) / 2);
    if (!pointInConvexPolygon(sample, edges)) {
      continue;
    }

    const startPoint = pointOnSweep(sweep, startTravel);
    const endPoint = pointOnSweep(sweep, endTravel);
    const fragment = createArcFragment(
      sweep.center,
      sweep.radius,
      angleFromCenter(sweep.center, startPoint),
      angleFromCenter(sweep.center, endPoint),
      sweep.clockwise,
      primitive.color,
      strokeWidth
    );
    if (fragment) {
      fragments.push(fragment);
    }
  }

  return fragments;
}

function clipPrimitiveToConvexPolygon(primitive: Primitive, edges: PolygonEdge[]): RenderFragment[] {
  const strokeWidth = getPrimitiveStrokeWidth(primitive);

  if (primitive.kind === 'line') {
    return clipLineToConvexPolygon(primitive, edges, strokeWidth);
  }

  if (primitive.kind === 'circle') {
    return clipCircleToConvexPolygon(primitive, edges, strokeWidth);
  }

  return clipArcToConvexPolygon(primitive, edges, strokeWidth);
}

function renderFragmentToPrimitive(fragment: RenderFragment): Primitive {
  if (fragment.kind === 'line') {
    return {
      id: 'fragment-line',
      kind: 'line',
      a: fragment.a,
      b: fragment.b,
      color: fragment.color,
      strokeWidth: fragment.strokeWidth
    };
  }

  if (fragment.kind === 'circle') {
    return {
      id: 'fragment-circle',
      kind: 'circle',
      center: fragment.center,
      radius: fragment.radius,
      color: fragment.color,
      strokeWidth: fragment.strokeWidth
    };
  }

  return {
    id: 'fragment-arc',
    kind: 'arc',
    center: fragment.center,
    start: fragment.start,
    end: fragment.end,
    clockwise: fragment.clockwise,
    largeArc: fragment.largeArc,
    color: fragment.color,
    strokeWidth: fragment.strokeWidth
  };
}

function clipRenderFragmentToConvexPolygon(
  fragment: RenderFragment,
  edges: PolygonEdge[]
): RenderFragment[] {
  return clipPrimitiveToConvexPolygon(renderFragmentToPrimitive(fragment), edges);
}

function precisionFactor(precision = KEY_PRECISION): number {
  return 10 ** precision;
}

function quantize(value: number, precision = KEY_PRECISION): string {
  const factor = precisionFactor(precision);
  const rounded = Math.round(value * factor) / factor;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return normalized.toFixed(precision);
}

function quantizedPoint(point: Point): string {
  return `${quantize(point.x)},${quantize(point.y)}`;
}

function pointFromQuantizedKey(key: string): Point {
  const [x, y] = key.split(',');
  return {
    x: Number(x),
    y: Number(y)
  };
}

function styleBucketKey(color: string, strokeWidth: number): string {
  return `${color}|${quantize(strokeWidth)}`;
}

function dedupeKey(fragment: RenderFragment): string {
  const styleKey = `${fragment.color}|${quantize(fragment.strokeWidth)}`;

  if (fragment.kind === 'line') {
    const start = quantizedPoint(fragment.a);
    const end = quantizedPoint(fragment.b);
    const [first, second] = start <= end ? [start, end] : [end, start];
    return `line|${first}|${second}|${styleKey}`;
  }

  if (fragment.kind === 'circle') {
    return `circle|${quantizedPoint(fragment.center)}|${quantize(fragment.radius)}|${styleKey}`;
  }

  const center = quantizedPoint(fragment.center);
  const radius = quantize(fragment.radius);
  const start = quantizedPoint(fragment.start);
  const end = quantizedPoint(fragment.end);
  const clockwise = fragment.clockwise ? '1' : '0';
  const largeArc = fragment.largeArc ? '1' : '0';

  const forward = `arc|${center}|${radius}|${start}|${end}|${clockwise}|${largeArc}|${styleKey}`;
  const reverse = `arc|${center}|${radius}|${end}|${start}|${clockwise === '1' ? '0' : '1'}|${largeArc}|${styleKey}`;
  return forward <= reverse ? forward : reverse;
}

function dedupeFragments(fragments: RenderFragment[]): RenderFragment[] {
  const unique = new Map<string, RenderFragment>();

  for (const fragment of fragments) {
    const key = dedupeKey(fragment);
    if (!unique.has(key)) {
      unique.set(key, fragment);
    }
  }

  return [...unique.values()];
}

function hasUnusedEdge(node: LineGraphNode, edges: LineGraphEdge[]): boolean {
  return node.edgeIds.some((edgeId) => !edges[edgeId].used);
}

function unusedDegree(node: LineGraphNode, edges: LineGraphEdge[]): number {
  return node.edgeIds.reduce((count, edgeId) => (edges[edgeId].used ? count : count + 1), 0);
}

function compressRepeatedPoints(points: Point[]): Point[] {
  if (points.length <= 1) {
    return points;
  }

  const compressed = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const previous = compressed[compressed.length - 1];
    const next = points[i];
    if (Math.hypot(next.x - previous.x, next.y - previous.y) > CLIP_EPSILON) {
      compressed.push(next);
    }
  }

  return compressed;
}

function consumeTrail(
  startNodeKey: string,
  nodes: Map<string, LineGraphNode>,
  edges: LineGraphEdge[]
): string[] {
  const trail = [startNodeKey];
  let currentNodeKey = startNodeKey;

  while (true) {
    const currentNode = nodes.get(currentNodeKey);
    if (!currentNode) {
      break;
    }

    const nextEdgeId = currentNode.edgeIds.find((edgeId) => !edges[edgeId].used);
    if (typeof nextEdgeId !== 'number') {
      break;
    }

    const edge = edges[nextEdgeId];
    edge.used = true;
    currentNodeKey = edge.a === currentNodeKey ? edge.b : edge.a;
    trail.push(currentNodeKey);
  }

  return trail;
}

function buildJoinedLinePaths(lineFragments: LineRenderFragment[]): LinePathRenderFragment[] {
  if (lineFragments.length === 0) {
    return [];
  }

  const color = lineFragments[0].color;
  const strokeWidth = lineFragments[0].strokeWidth;
  const nodes = new Map<string, LineGraphNode>();
  const edges: LineGraphEdge[] = [];

  const ensureNode = (key: string): LineGraphNode => {
    const existing = nodes.get(key);
    if (existing) {
      return existing;
    }

    const created: LineGraphNode = {
      key,
      point: pointFromQuantizedKey(key),
      edgeIds: []
    };
    nodes.set(key, created);
    return created;
  };

  for (const line of lineFragments) {
    if (Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) <= CLIP_EPSILON) {
      continue;
    }

    const aKey = quantizedPoint(line.a);
    const bKey = quantizedPoint(line.b);
    if (aKey === bKey) {
      continue;
    }

    const edgeId = edges.length;
    edges.push({
      a: aKey,
      b: bKey,
      used: false
    });
    ensureNode(aKey).edgeIds.push(edgeId);
    ensureNode(bKey).edgeIds.push(edgeId);
  }

  if (edges.length === 0) {
    return [];
  }

  const joinedPaths: LinePathRenderFragment[] = [];

  while (true) {
    const nodeList = [...nodes.values()];
    const oddStart = nodeList.find(
      (node) => hasUnusedEdge(node, edges) && unusedDegree(node, edges) % 2 === 1
    );
    const fallbackStart = nodeList.find((node) => hasUnusedEdge(node, edges));
    const start = oddStart ?? fallbackStart;
    if (!start) {
      break;
    }

    const walk = consumeTrail(start.key, nodes, edges);
    if (walk.length < 2) {
      continue;
    }

    const points = compressRepeatedPoints(
      walk
        .map((nodeKey) => nodes.get(nodeKey)?.point)
        .filter((point): point is Point => point !== undefined)
    );
    if (points.length < 2) {
      continue;
    }

    joinedPaths.push({
      kind: 'line-path',
      color,
      strokeWidth,
      points
    });
  }

  return joinedPaths;
}

function joinLineFragmentsForPlotter(fragments: RenderFragment[]): OutputRenderFragment[] {
  const passthrough: OutputRenderFragment[] = [];
  const lineBuckets = new Map<string, LineRenderFragment[]>();

  for (const fragment of fragments) {
    if (fragment.kind !== 'line') {
      passthrough.push(fragment);
      continue;
    }

    const key = styleBucketKey(fragment.color, fragment.strokeWidth);
    const bucket = lineBuckets.get(key);
    if (bucket) {
      bucket.push(fragment);
    } else {
      lineBuckets.set(key, [fragment]);
    }
  }

  const joined: LinePathRenderFragment[] = [];
  for (const bucket of lineBuckets.values()) {
    joined.push(...buildJoinedLinePaths(bucket));
  }

  return [...joined, ...passthrough];
}

function getCellOffset(tile: TileConfig, col: number, row: number): Point {
  const { u, v } = tileBasisVectors(tile);
  return {
    x: col * u.x + row * v.x,
    y: col * u.y + row * v.y
  };
}

function segmentContainsPoint(a: Point, b: Point, point: Point): boolean {
  const ap = subtract(point, a);
  const ab = subtract(b, a);
  if (Math.abs(cross(ab, ap)) > CLIP_EPSILON) {
    return false;
  }

  const dotProduct = dot(ap, ab);
  if (dotProduct < -CLIP_EPSILON) {
    return false;
  }

  return dotProduct <= dot(ab, ab) + CLIP_EPSILON;
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const directionA = subtract(a2, a1);
  const directionB = subtract(b2, b1);
  const denominator = cross(directionA, directionB);
  const offset = subtract(b1, a1);

  if (Math.abs(denominator) <= CLIP_EPSILON) {
    if (Math.abs(cross(offset, directionA)) > CLIP_EPSILON) {
      return false;
    }

    return (
      segmentContainsPoint(a1, a2, b1) ||
      segmentContainsPoint(a1, a2, b2) ||
      segmentContainsPoint(b1, b2, a1) ||
      segmentContainsPoint(b1, b2, a2)
    );
  }

  const t = cross(offset, directionB) / denominator;
  const u = cross(offset, directionA) / denominator;
  return (
    t >= -CLIP_EPSILON &&
    t <= 1 + CLIP_EPSILON &&
    u >= -CLIP_EPSILON &&
    u <= 1 + CLIP_EPSILON
  );
}

function regionCorners(bounds: PatternRenderBounds): Point[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];
}

function polygonIntersectsBounds(polygon: Point[], bounds: PatternRenderBounds): boolean {
  const polyBounds = polygonBounds(polygon);
  if (
    polyBounds.maxX < bounds.minX - CLIP_EPSILON ||
    polyBounds.minX > bounds.maxX + CLIP_EPSILON ||
    polyBounds.maxY < bounds.minY - CLIP_EPSILON ||
    polyBounds.minY > bounds.maxY + CLIP_EPSILON
  ) {
    return false;
  }

  if (
    polygon.some(
      (point) =>
        point.x >= bounds.minX - CLIP_EPSILON &&
        point.x <= bounds.maxX + CLIP_EPSILON &&
        point.y >= bounds.minY - CLIP_EPSILON &&
        point.y <= bounds.maxY + CLIP_EPSILON
    )
  ) {
    return true;
  }

  const corners = regionCorners(bounds);
  if (corners.some((corner) => pointInPolygon(corner, polygon))) {
    return true;
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];

    for (let j = 0; j < corners.length; j += 1) {
      const c = corners[j];
      const d = corners[(j + 1) % corners.length];
      if (segmentsIntersect(a, b, c, d)) {
        return true;
      }
    }
  }

  return false;
}

function candidateTiles(
  tile: TileConfig,
  bounds: PatternRenderBounds
): TileCandidate[] {
  const tilePolygon = getTilePolygon(tile);
  const tileBounds = polygonBounds(tilePolygon);
  const { u, v } = tileBasisVectors(tile);
  const determinant = u.x * v.y - u.y * v.x;
  const centerBounds = {
    minX: bounds.minX - tileBounds.maxX,
    minY: bounds.minY - tileBounds.maxY,
    maxX: bounds.maxX - tileBounds.minX,
    maxY: bounds.maxY - tileBounds.minY
  };
  const transformedCorners: LatticeCoordinate[] = [
    { x: centerBounds.minX, y: centerBounds.minY },
    { x: centerBounds.maxX, y: centerBounds.minY },
    { x: centerBounds.maxX, y: centerBounds.maxY },
    { x: centerBounds.minX, y: centerBounds.maxY }
  ].map((point) => ({
    col: (point.x * v.y - point.y * v.x) / determinant,
    row: (u.x * point.y - u.y * point.x) / determinant
  }));
  const minCol = Math.floor(Math.min(...transformedCorners.map((point) => point.col))) - 1;
  const maxCol = Math.ceil(Math.max(...transformedCorners.map((point) => point.col))) + 1;
  const minRow = Math.floor(Math.min(...transformedCorners.map((point) => point.row))) - 1;
  const maxRow = Math.ceil(Math.max(...transformedCorners.map((point) => point.row))) + 1;
  const candidates: TileCandidate[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const offset = getCellOffset(tile, col, row);
      const polygon = translatePoints(tilePolygon, offset);
      if (!polygonIntersectsBounds(polygon, bounds)) {
        continue;
      }

      candidates.push({ offset, polygon });
    }
  }

  return candidates;
}

function rectPolygon(bounds: PatternRenderBounds): Point[] {
  return regionCorners(bounds);
}

export function buildPatternRenderResult(
  tile: TileConfig,
  primitives: Primitive[],
  pattern: PatternSize
): PatternRenderResult {
  const baseBounds = getPatternBounds(tile, pattern);
  const bounds: PatternRenderBounds = {
    ...baseBounds,
    width: baseBounds.maxX - baseBounds.minX,
    height: baseBounds.maxY - baseBounds.minY
  };
  const rectEdges = convexPolygonEdges(rectPolygon(bounds));
  const neighbors = periodicNeighborOffsets(tile);
  const candidates = candidateTiles(tile, bounds);
  const renderedFragments: RenderFragment[] = [];

  for (const candidate of candidates) {
    const cellEdges = convexPolygonEdges(candidate.polygon);

    for (const primitive of primitives) {
      for (const neighbor of neighbors) {
        const translated = translatePrimitive(primitive, {
          x: candidate.offset.x + neighbor.x,
          y: candidate.offset.y + neighbor.y
        });
        const cellClipped = clipPrimitiveToConvexPolygon(translated, cellEdges);

        for (const fragment of cellClipped) {
          renderedFragments.push(...clipRenderFragmentToConvexPolygon(fragment, rectEdges));
        }
      }
    }
  }

  const dedupedFragments = dedupeFragments(renderedFragments);
  const optimizedFragments = joinLineFragmentsForPlotter(dedupedFragments);

  return {
    bounds,
    fragments: optimizedFragments,
    outlinePolygons: candidates.map((candidate) => candidate.polygon)
  };
}
