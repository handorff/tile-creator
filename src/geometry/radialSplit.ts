import type { CirclePrimitive, LinePrimitive } from '../types/model';

interface BuildRadialSpokesOptions {
  makeId?: (kind: 'line') => string;
  reuseIds?: string[];
}

function spokeIdAt(
  index: number,
  options: BuildRadialSpokesOptions
): string {
  const reusedId = options.reuseIds?.[index];
  if (reusedId) {
    return reusedId;
  }

  if (options.makeId) {
    return options.makeId('line');
  }

  return `radial-spoke-${index}`;
}

export function buildRadialSpokes(
  circle: CirclePrimitive,
  count: number,
  options: BuildRadialSpokesOptions = {}
): LinePrimitive[] {
  if (!Number.isFinite(count) || count < 2) {
    return [];
  }

  const normalizedCount = Math.max(2, Math.floor(count));
  const step = (Math.PI * 2) / normalizedCount;

  return Array.from({ length: normalizedCount }, (_, index) => {
    const angle = step * index;
    return {
      id: spokeIdAt(index, options),
      kind: 'line',
      a: circle.center,
      b: {
        x: circle.center.x + circle.radius * Math.cos(angle),
        y: circle.center.y + circle.radius * Math.sin(angle)
      },
      color: circle.color,
      strokeWidth: circle.strokeWidth
    };
  });
}
