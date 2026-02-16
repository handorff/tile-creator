import { describe, expect, it } from 'vitest';
import { buildSingleTileSvg, buildTiledSvg } from './exportSvg';
import { initialProjectState } from '../../state/projectState';

describe('buildTiledSvg', () => {
  it('creates svg document with clip paths and primitives', () => {
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
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('<line');
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
});
