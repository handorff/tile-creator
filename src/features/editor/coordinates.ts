import type { Point } from '../../types/model';
import { clamp } from '../../utils/math';

export interface ViewBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function renderedViewBoxLayout(
  rect: { width: number; height: number },
  viewBox: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  if (rect.width <= 0 || rect.height <= 0 || viewBox.width <= 0 || viewBox.height <= 0) {
    return { x: 0, y: 0, width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) };
  }

  const rectAspect = rect.width / rect.height;
  const viewAspect = viewBox.width / viewBox.height;

  if (rectAspect > viewAspect) {
    const height = rect.height;
    const width = height * viewAspect;
    return {
      x: (rect.width - width) / 2,
      y: 0,
      width,
      height
    };
  }

  const width = rect.width;
  const height = width / viewAspect;
  return {
    x: 0,
    y: (rect.height - height) / 2,
    width,
    height
  };
}

export function mapClientPointToWorld(
  client: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  viewBox: ViewBoxRect
): Point {
  const rendered = renderedViewBoxLayout(rect, viewBox);
  const localX = clamp(client.x - rect.left - rendered.x, 0, rendered.width);
  const localY = clamp(client.y - rect.top - rendered.y, 0, rendered.height);
  return {
    x: (localX / rendered.width) * viewBox.width + viewBox.x,
    y: (localY / rendered.height) * viewBox.height + viewBox.y
  };
}
