import { describe, expect, it } from 'vitest';
import { buildSingleTileSvg, buildTiledSvg } from './exportSvg';
import { initialProjectState } from '../../state/projectState';

function countOccurrences(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function countLinearPathElements(svg: string): number {
  return countOccurrences(svg, /<path d="[^"]* L [^"]*"[^>]*\/>/g);
}

describe('buildTiledSvg', () => {
  it('creates tiled svg document without clip paths', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'line-1',
          kind: 'line' as const,
          a: { x: -20, y: 0 },
          b: { x: 20, y: 0 },
          color: '#111'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 2, rows: 2 } });

    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<clipPath');
    expect(svg).not.toContain('clip-path=');
    expect(svg).not.toContain('<defs>');
    expect(svg).not.toContain('<line ');
    expect(svg).toContain('<path');
  });

  it('joins connected line fragments into a single stroke path', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'line-1',
          kind: 'line' as const,
          a: { x: -80, y: 0 },
          b: { x: 0, y: 0 },
          color: '#111'
        },
        {
          id: 'line-2',
          kind: 'line' as const,
          a: { x: 0, y: 0 },
          b: { x: 80, y: 0 },
          color: '#111'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 1, rows: 1 } });

    expect(countOccurrences(svg, /<line /g)).toBe(0);
    expect(countLinearPathElements(svg)).toBe(1);
    expect(svg).not.toContain('<clipPath');
  });

  it('creates minimal trail count for branching line graph', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'line-right',
          kind: 'line' as const,
          a: { x: 0, y: 0 },
          b: { x: 40, y: 0 },
          color: '#111'
        },
        {
          id: 'line-left',
          kind: 'line' as const,
          a: { x: 0, y: 0 },
          b: { x: -40, y: 0 },
          color: '#111'
        },
        {
          id: 'line-up',
          kind: 'line' as const,
          a: { x: 0, y: 0 },
          b: { x: 0, y: -40 },
          color: '#111'
        },
        {
          id: 'line-down',
          kind: 'line' as const,
          a: { x: 0, y: 0 },
          b: { x: 0, y: 40 },
          color: '#111'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 1, rows: 1 } });

    expect(countLinearPathElements(svg)).toBe(2);
  });

  it('keeps line joining isolated by stroke style', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'line-dark',
          kind: 'line' as const,
          a: { x: -40, y: 0 },
          b: { x: 0, y: 0 },
          color: '#111'
        },
        {
          id: 'line-blue',
          kind: 'line' as const,
          a: { x: 0, y: 0 },
          b: { x: 40, y: 0 },
          color: '#1d4ed8'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 1, rows: 1 } });

    expect(countLinearPathElements(svg)).toBe(2);
    expect(countOccurrences(svg, /stroke="#111"/g)).toBe(1);
    expect(countOccurrences(svg, /stroke="#1d4ed8"/g)).toBe(1);
  });

  it('deduplicates shared boundary segments across cells', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'line-boundary',
          kind: 'line' as const,
          a: { x: 120, y: -40 },
          b: { x: 120, y: 40 },
          color: '#111'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 2, rows: 1 } });

    expect(countLinearPathElements(svg)).toBe(3);
  });

  it('exports circles directly when fully visible in a tile', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'circle-inside',
          kind: 'circle' as const,
          center: { x: 0, y: 0 },
          radius: 20,
          color: '#111'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 1, rows: 1 } });

    expect(countOccurrences(svg, /<circle /g)).toBe(1);
  });

  it('clips border-crossing circles into arc paths', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'circle-border',
          kind: 'circle' as const,
          center: { x: 110, y: 0 },
          radius: 30,
          color: '#111'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 1, rows: 1 } });

    expect(countOccurrences(svg, /<circle /g)).toBe(0);
    expect(countOccurrences(svg, /<path /g)).toBeGreaterThan(0);
  });

  it('exports arc primitives as path elements in tiled export', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'arc-1',
          kind: 'arc' as const,
          center: { x: 0, y: 0 },
          start: { x: 8, y: 0 },
          end: { x: 0, y: 8 },
          clockwise: true,
          largeArc: false,
          color: '#111'
        }
      ]
    };

    const svg = buildTiledSvg(project, { pattern: { columns: 1, rows: 1 } });
    expect(svg).toContain('<path');
    expect(svg).toContain(' A ');
  });

  it('creates a single-tile svg document with clipping', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'circle-1',
          kind: 'circle' as const,
          center: { x: 0, y: 0 },
          radius: 8,
          color: '#111'
        }
      ]
    };

    const svg = buildSingleTileSvg(project, { background: '#ffffff' });

    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('<circle');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('exports arcs as path elements for single-tile export', () => {
    const project = {
      ...initialProjectState,
      primitives: [
        {
          id: 'arc-1',
          kind: 'arc' as const,
          center: { x: 0, y: 0 },
          start: { x: 8, y: 0 },
          end: { x: 0, y: 8 },
          clockwise: true,
          largeArc: false,
          color: '#111'
        }
      ]
    };

    const svg = buildSingleTileSvg(project);
    expect(svg).toContain('<path');
    expect(svg).toContain(' A ');
  });
});
