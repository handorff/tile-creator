import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { EditorCanvas } from '../features/editor/EditorCanvas';
import { Toolbar } from '../features/editor/Toolbar';
import { buildTiledSvg } from '../features/export/exportSvg';
import {
  deserializeProject,
  loadAutosave,
  saveAutosave,
  serializeProject
} from '../features/persistence/projectStorage';
import { TilingPreview } from '../features/tiling/TilingPreview';
import {
  DEFAULT_COLORS,
  DEFAULT_PATTERN,
  initialProjectState,
  projectReducer
} from '../state/projectState';
import type { PatternSize, Primitive, ProjectState, TileShape, Tool } from '../types/model';
import { downloadText } from '../utils/download';
import { createId } from '../utils/ids';

interface InitialState {
  project: ProjectState;
  pattern: PatternSize;
}

const MIN_EDITOR_ZOOM = 0.5;
const MAX_EDITOR_ZOOM = 10;

function clampPattern(value: number): number {
  if (Number.isNaN(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

function clampEditorZoom(value: number): number {
  if (Number.isNaN(value)) {
    return 1;
  }
  return Math.min(MAX_EDITOR_ZOOM, Math.max(MIN_EDITOR_ZOOM, value));
}

function loadInitialState(): InitialState {
  const autosaved = loadAutosave();
  if (autosaved) {
    return autosaved;
  }

  return {
    project: initialProjectState,
    pattern: DEFAULT_PATTERN
  };
}

export function App(): JSX.Element {
  const initial = useMemo(loadInitialState, []);
  const [project, dispatch] = useReducer(projectReducer, initial.project);
  const [pattern, setPattern] = useState<PatternSize>(initial.pattern);
  const [editorZoom, setEditorZoom] = useState<number>(1);
  const [message, setMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveAutosave(project, pattern);
  }, [project, pattern]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const undoCombo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z';
      if (undoCombo) {
        event.preventDefault();
        dispatch({ type: 'undo' });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const addPrimitive = (primitive: Primitive): void => {
    dispatch({ type: 'add-primitive', primitive });
  };

  const updatePrimitive = (primitive: Primitive): void => {
    dispatch({ type: 'update-primitive', primitive });
  };

  const setTool = (tool: Tool): void => {
    dispatch({ type: 'set-tool', tool });
  };

  const setColor = (color: string): void => {
    dispatch({ type: 'set-color', color });
  };

  const setShape = (shape: TileShape): void => {
    dispatch({ type: 'set-tile-shape', shape });
  };

  const erasePrimitive = (id: string): void => {
    dispatch({ type: 'erase-primitive', id });
  };

  const splitLine = (id: string, point: { x: number; y: number }): void => {
    dispatch({
      type: 'split-line',
      id,
      point,
      firstId: createId('line'),
      secondId: createId('line')
    });
  };

  const clearTile = (): void => {
    if (project.primitives.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      'Clear the current tile and remove all lines/circles? This can be undone with Undo.'
    );
    if (!confirmed) {
      return;
    }

    dispatch({ type: 'clear' });
    setMessage('Cleared tile.');
  };

  const exportSvg = (): void => {
    const svg = buildTiledSvg(project, { pattern });
    downloadText('tiling-pattern.svg', svg, 'image/svg+xml');
    setMessage('Exported tiled SVG.');
  };

  const exportProjectJson = (): void => {
    const json = serializeProject(project, pattern);
    downloadText('tile-project.json', json, 'application/json');
    setMessage('Exported project JSON.');
  };

  const importProjectJson = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const [file] = Array.from(event.target.files ?? []);
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const loaded = deserializeProject(text);
      dispatch({ type: 'hydrate', state: loaded.project });
      setPattern(loaded.pattern);
      setMessage('Imported project JSON.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import project file.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Tile Creator</h1>
          <p>Create one tile, then repeat it into seamless geometric patterns.</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={exportSvg}>
            Export SVG
          </button>
          <button type="button" onClick={clearTile} disabled={project.primitives.length === 0}>
            Clear Tile
          </button>
          <button type="button" onClick={exportProjectJson}>
            Export Project
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import Project
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="application/json"
            onChange={importProjectJson}
          />
        </div>
      </header>

      <section className="pattern-controls panel">
        <h2>Pattern Size</h2>
        <div className="pattern-grid">
          <label className="field">
            Columns
            <input
              data-testid="pattern-columns"
              type="number"
              min={1}
              value={pattern.columns}
              onChange={(event) =>
                setPattern((current) => ({
                  ...current,
                  columns: clampPattern(Number(event.target.value))
                }))
              }
            />
          </label>
          <label className="field">
            Rows
            <input
              data-testid="pattern-rows"
              type="number"
              min={1}
              value={pattern.rows}
              onChange={(event) =>
                setPattern((current) => ({
                  ...current,
                  rows: clampPattern(Number(event.target.value))
                }))
              }
            />
          </label>
          <label className="field zoom-field">
            Editor Zoom ({editorZoom.toFixed(1)}x)
            <input
              data-testid="editor-zoom"
              type="range"
              min={MIN_EDITOR_ZOOM}
              max={MAX_EDITOR_ZOOM}
              step={0.1}
              value={editorZoom}
              onChange={(event) => setEditorZoom(clampEditorZoom(Number(event.target.value)))}
            />
          </label>
        </div>
      </section>

      <section className="workspace-grid">
        <Toolbar
          shape={project.tile.shape}
          activeTool={project.activeTool}
          activeColor={project.activeColor}
          colors={DEFAULT_COLORS}
          canUndo={project.history.past.length > 0}
          onShapeChange={setShape}
          onToolChange={setTool}
          onColorChange={setColor}
          onUndo={() => dispatch({ type: 'undo' })}
        />

        <EditorCanvas
          tile={project.tile}
          primitives={project.primitives}
          activeTool={project.activeTool}
          activeColor={project.activeColor}
          zoom={editorZoom}
          onZoomChange={(nextZoom) => setEditorZoom(clampEditorZoom(nextZoom))}
          onAddPrimitive={addPrimitive}
          onUpdatePrimitive={updatePrimitive}
          onSplitLine={splitLine}
          onErasePrimitive={erasePrimitive}
        />

        <TilingPreview tile={project.tile} primitives={project.primitives} pattern={pattern} />
      </section>

      {message ? <p className="status-message">{message}</p> : null}
    </main>
  );
}
