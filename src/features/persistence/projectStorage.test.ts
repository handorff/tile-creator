import { describe, expect, it } from 'vitest';
import type { ProjectState } from '../../types/model';
import { deserializeProject, serializeProject } from './projectStorage';

describe('project storage', () => {
  it('loads legacy history and normalizes entries', () => {
    const line = {
      id: 'line-1',
      kind: 'line' as const,
      a: { x: 0, y: 0 },
      b: { x: 10, y: 10 },
      color: '#111'
    };
    const circle = {
      id: 'circle-1',
      kind: 'circle' as const,
      center: { x: 4, y: 4 },
      radius: 2,
      color: '#222'
    };
    const payload = JSON.stringify({
      version: 1,
      project: {
        tile: { shape: 'square', size: 120 },
        primitives: [line, circle],
        activeTool: 'line',
        activeColor: '#111',
        history: {
          past: [[line], [line, circle]]
        }
      },
      pattern: {
        columns: 4,
        rows: 3
      }
    });

    const loaded = deserializeProject(payload);

    expect(loaded.project.history.past).toHaveLength(2);
    expect(loaded.project.history.future).toEqual([]);
    expect(loaded.project.history.past[0].description).toBe('Imported history step');
    expect(loaded.project.history.past[1].primitives.map((primitive) => primitive.id)).toEqual([
      'line-1',
      'circle-1'
    ]);
    expect(loaded.project.activeStrokeWidth).toBe(2);
    expect(loaded.project.primitives.map((primitive) => primitive.strokeWidth)).toEqual([2, 2]);
  });

  it('round-trips projects using new history format', () => {
    const project: ProjectState = {
      tile: { shape: 'square', size: 120 },
      primitives: [],
      activeTool: 'line',
      activeColor: '#111',
      activeStrokeWidth: 2,
      history: {
        past: [
          {
            primitives: [],
            description: 'Add line'
          }
        ],
        future: [
          {
            primitives: [],
            description: 'Add line'
          }
        ]
      }
    };
    const pattern = { columns: 2, rows: 3 };

    const serialized = serializeProject(project, pattern);
    const loaded = deserializeProject(serialized);

    expect(loaded.project).toEqual(project);
    expect(loaded.pattern).toEqual(pattern);
  });

  it('normalizes legacy split tool to select', () => {
    const payload = JSON.stringify({
      version: 1,
      project: {
        tile: { shape: 'square', size: 120 },
        primitives: [],
        activeTool: 'split',
        activeColor: '#111',
        history: {
          past: []
        }
      },
      pattern: {
        columns: 4,
        rows: 3
      }
    });

    const loaded = deserializeProject(payload);
    expect(loaded.project.activeTool).toBe('select');
  });

  it('round-trips arc primitives and arc active tool', () => {
    const project: ProjectState = {
      tile: { shape: 'square', size: 120 },
      primitives: [
        {
          id: 'arc-1',
          kind: 'arc',
          center: { x: 0, y: 0 },
          start: { x: 10, y: 0 },
          end: { x: 0, y: 10 },
          clockwise: true,
          largeArc: false,
          color: '#111',
          strokeWidth: 2
        }
      ],
      activeTool: 'arc',
      activeColor: '#111',
      activeStrokeWidth: 2,
      history: {
        past: [],
        future: []
      }
    };

    const loaded = deserializeProject(serializeProject(project, { columns: 2, rows: 2 }));
    expect(loaded.project).toEqual(project);
  });

  it('rejects malformed arc payloads', () => {
    const payload = JSON.stringify({
      version: 1,
      project: {
        tile: { shape: 'square', size: 120 },
        primitives: [
          {
            id: 'arc-1',
            kind: 'arc',
            center: { x: 0, y: 0 },
            start: { x: 10, y: 0 },
            end: { x: 0, y: 10 },
            clockwise: true,
            color: '#111'
          }
        ],
        activeTool: 'line',
        activeColor: '#111',
        history: {
          past: []
        }
      },
      pattern: {
        columns: 4,
        rows: 3
      }
    });

    expect(() => deserializeProject(payload)).toThrow('Project state is invalid.');
  });
});
