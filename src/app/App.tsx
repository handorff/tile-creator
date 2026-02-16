import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { EditorCanvas } from '../features/editor/EditorCanvas';
import { buildHistoryTimeline } from '../features/editor/historyTimeline';
import { SELECTION_SHORTCUTS, TOOL_SHORTCUT_BY_KEY } from '../features/editor/shortcuts';
import { Toolbar } from '../features/editor/Toolbar';
import { buildAnimatedGif } from '../features/export/exportGif';
import { buildTiledSvg } from '../features/export/exportSvg';
import { PRESET_GALLERY, type PresetDefinition } from '../features/presets/presetGallery';
import { PresetTilePreview } from '../features/presets/PresetTilePreview';
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
  getPrimitiveStrokeWidth,
  initialProjectState,
  projectReducer
} from '../state/projectState';
import type { PatternSize, Point, Primitive, ProjectState, TileShape, Tool } from '../types/model';
import { downloadBlob, downloadText } from '../utils/download';
import { createId } from '../utils/ids';

interface InitialState {
  project: ProjectState;
  pattern: PatternSize;
}

interface LoadedPreset {
  project: ProjectState;
  pattern: PatternSize;
}

const MIN_EDITOR_ZOOM = 0.5;
const MAX_EDITOR_ZOOM = 10;
const MIN_EDITOR_PANE = 0.3;
const MAX_EDITOR_PANE = 0.7;

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

function clampEditorPane(value: number): number {
  if (Number.isNaN(value)) {
    return 0.55;
  }
  return Math.min(MAX_EDITOR_PANE, Math.max(MIN_EDITOR_PANE, value));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function rotatePointAroundOrigin(point: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

function rotatePrimitiveAroundOrigin(primitive: Primitive, radians: number): Primitive {
  if (primitive.kind === 'line') {
    return {
      ...primitive,
      a: rotatePointAroundOrigin(primitive.a, radians),
      b: rotatePointAroundOrigin(primitive.b, radians)
    };
  }

  return {
    ...primitive,
    center: rotatePointAroundOrigin(primitive.center, radians)
  };
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
  const [hiddenColors, setHiddenColors] = useState<string[]>([]);
  const [editorZoom, setEditorZoom] = useState<number>(1);
  const [selectedPrimitiveIds, setSelectedPrimitiveIds] = useState<string[]>([]);
  const [splitSelectionLineId, setSplitSelectionLineId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const [isExportingGif, setIsExportingGif] = useState<boolean>(false);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [isPresetGalleryOpen, setIsPresetGalleryOpen] = useState<boolean>(false);
  const [loadingPresetPreviewIds, setLoadingPresetPreviewIds] = useState<string[]>([]);
  const [presetPreviewErrors, setPresetPreviewErrors] = useState<Record<string, string>>({});
  const [presetProjects, setPresetProjects] = useState<Record<string, LoadedPreset>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const centerSplitRef = useRef<HTMLDivElement | null>(null);
  const [editorPane, setEditorPane] = useState<number>(0.55);
  const [resizingPane, setResizingPane] = useState<boolean>(false);
  const [showPatternPreview, setShowPatternPreview] = useState<boolean>(true);
  const availableColors = useMemo(
    () => Array.from(new Set([...DEFAULT_COLORS, ...project.primitives.map((primitive) => primitive.color)])),
    [project.primitives]
  );
  const hiddenColorSet = useMemo(() => new Set(hiddenColors), [hiddenColors]);
  const fetchPresetProject = useCallback(async (preset: PresetDefinition): Promise<LoadedPreset> => {
    const url = `${import.meta.env.BASE_URL}${preset.filePath}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load ${preset.name}.`);
    }

    const text = await response.text();
    return deserializeProject(text);
  }, []);

  useEffect(() => {
    saveAutosave(project, pattern);
  }, [project, pattern]);

  useEffect(() => {
    if (!showPatternPreview) {
      setResizingPane(false);
    }
  }, [showPatternPreview]);

  useEffect(() => {
    if (!isPresetGalleryOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsPresetGalleryOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPresetGalleryOpen]);

  useEffect(() => {
    if (!isPresetGalleryOpen) {
      return;
    }

    for (const preset of PRESET_GALLERY) {
      if (
        presetProjects[preset.id] ||
        loadingPresetPreviewIds.includes(preset.id) ||
        presetPreviewErrors[preset.id]
      ) {
        continue;
      }

      setLoadingPresetPreviewIds((current) =>
        current.includes(preset.id) ? current : [...current, preset.id]
      );

      void fetchPresetProject(preset)
        .then((loaded) => {
          setPresetProjects((current) => ({ ...current, [preset.id]: loaded }));
        })
        .catch((error) => {
          setPresetPreviewErrors((current) => ({
            ...current,
            [preset.id]: error instanceof Error ? error.message : `Could not load ${preset.name}.`
          }));
        })
        .finally(() => {
          setLoadingPresetPreviewIds((current) => current.filter((id) => id !== preset.id));
        });
    }
  }, [
    fetchPresetProject,
    isPresetGalleryOpen,
    loadingPresetPreviewIds,
    presetPreviewErrors,
    presetProjects
  ]);

  useEffect(() => {
    setSelectedPrimitiveIds((current) =>
      current.filter((id) =>
        project.primitives.some(
          (primitive) => primitive.id === id && !hiddenColorSet.has(primitive.color)
        )
      )
    );
  }, [hiddenColorSet, project.primitives]);

  useEffect(() => {
    setHiddenColors((current) => current.filter((color) => availableColors.includes(color)));
  }, [availableColors]);

  const selectedLinePrimitive = useMemo(() => {
    if (selectedPrimitiveIds.length !== 1) {
      return null;
    }

    const selected = project.primitives.find((primitive) => primitive.id === selectedPrimitiveIds[0]);
    if (!selected || selected.kind !== 'line') {
      return null;
    }

    return selected;
  }, [project.primitives, selectedPrimitiveIds]);
  const selectedPrimitives = useMemo(() => {
    if (selectedPrimitiveIds.length === 0) {
      return [];
    }

    const selectedSet = new Set(selectedPrimitiveIds);
    return project.primitives.filter((primitive) => selectedSet.has(primitive.id));
  }, [project.primitives, selectedPrimitiveIds]);
  const highlightedStyle = useMemo(() => {
    if (selectedPrimitives.length === 0) {
      return {
        color: project.activeColor,
        strokeWidth: project.activeStrokeWidth
      };
    }

    const first = selectedPrimitives[0];
    const firstColor = first.color;
    const firstStrokeWidth = getPrimitiveStrokeWidth(first);
    const commonColor = selectedPrimitives.every((primitive) => primitive.color === firstColor)
      ? firstColor
      : null;
    const commonStrokeWidth = selectedPrimitives.every(
      (primitive) => getPrimitiveStrokeWidth(primitive) === firstStrokeWidth
    )
      ? firstStrokeWidth
      : null;

    return {
      color: commonColor,
      strokeWidth: commonStrokeWidth
    };
  }, [project.activeColor, project.activeStrokeWidth, selectedPrimitives]);
  const canSplitSelection = project.activeTool === 'select' && selectedLinePrimitive !== null;
  const splitSelectionArmed =
    canSplitSelection && !!selectedLinePrimitive && splitSelectionLineId === selectedLinePrimitive.id;
  const visiblePrimitives = useMemo(
    () => project.primitives.filter((primitive) => !hiddenColorSet.has(primitive.color)),
    [hiddenColorSet, project.primitives]
  );
  const historyTimeline = useMemo(() => buildHistoryTimeline(project.history), [project.history]);

  useEffect(() => {
    setSplitSelectionLineId((current) => {
      if (!current) {
        return null;
      }

      if (project.activeTool !== 'select' || !selectedLinePrimitive) {
        return null;
      }

      return current === selectedLinePrimitive.id ? current : null;
    });
  }, [project.activeTool, selectedLinePrimitive]);

  const addPrimitive = (primitive: Primitive): void => {
    dispatch({ type: 'add-primitive', primitive });
  };

  const updatePrimitive = (primitive: Primitive): void => {
    dispatch({ type: 'update-primitive', primitive });
  };

  const setTool = useCallback((tool: Tool): void => {
    dispatch({ type: 'set-tool', tool });
  }, []);

  const setColor = (color: string): void => {
    dispatch({ type: 'set-color', color });

    if (selectedPrimitiveIds.length === 0) {
      return;
    }

    dispatch({
      type: 'recolor-primitives',
      ids: selectedPrimitiveIds,
      color
    });
  };

  const setStrokeWidth = (strokeWidth: number): void => {
    dispatch({ type: 'set-stroke-width', strokeWidth });

    if (selectedPrimitiveIds.length === 0) {
      return;
    }

    dispatch({
      type: 'restroke-primitives',
      ids: selectedPrimitiveIds,
      strokeWidth
    });
  };

  const setColorVisibility = useCallback((color: string, visible: boolean): void => {
    setHiddenColors((current) => {
      const isHidden = current.includes(color);
      if (visible && !isHidden) {
        return current;
      }
      if (!visible && isHidden) {
        return current;
      }
      return visible ? current.filter((currentColor) => currentColor !== color) : [...current, color];
    });
  }, []);

  const setAllColorsVisibility = useCallback(
    (visible: boolean): void => {
      setHiddenColors(visible ? [] : [...availableColors]);
    },
    [availableColors]
  );

  const setOnlyVisibleColor = useCallback(
    (color: string): void => {
      setHiddenColors(availableColors.filter((availableColor) => availableColor !== color));
    },
    [availableColors]
  );

  const setShape = (shape: TileShape): void => {
    dispatch({ type: 'set-tile-shape', shape });
  };

  const erasePrimitive = (id: string): void => {
    dispatch({ type: 'erase-primitive', id });
    setSelectedPrimitiveIds((current) => current.filter((selectedId) => selectedId !== id));
  };

  const erasePrimitives = (ids: string[]): void => {
    if (ids.length === 0) {
      return;
    }

    dispatch({ type: 'erase-primitives', ids });
    setSelectedPrimitiveIds((current) => current.filter((selectedId) => !ids.includes(selectedId)));
  };

  const splitLine = (id: string, point: { x: number; y: number }): void => {
    dispatch({
      type: 'split-line',
      id,
      point,
      firstId: createId('line'),
      secondId: createId('line')
    });
    setSplitSelectionLineId(null);
  };

  const toggleSplitSelection = useCallback((): void => {
    if (!selectedLinePrimitive || project.activeTool !== 'select') {
      return;
    }

    setSplitSelectionLineId((current) =>
      current === selectedLinePrimitive.id ? null : selectedLinePrimitive.id
    );
  }, [project.activeTool, selectedLinePrimitive]);

  const duplicateSelected = useCallback((): void => {
    if (selectedPrimitiveIds.length === 0) {
      return;
    }

    const selected = new Set(selectedPrimitiveIds);
    const duplicates = project.primitives
      .filter((primitive) => selected.has(primitive.id))
      .map((primitive) => ({
        ...primitive,
        id: createId(primitive.kind)
      }));

    if (duplicates.length === 0) {
      return;
    }

    const shapeLabel = duplicates.length === 1 ? 'shape' : 'shapes';
    dispatch({
      type: 'add-primitives',
      primitives: duplicates,
      historyDescription: `Duplicate ${duplicates.length} ${shapeLabel}`
    });
    setSelectedPrimitiveIds(duplicates.map((primitive) => primitive.id));
  }, [project.primitives, selectedPrimitiveIds]);

  const rotateSelected = useCallback(
    (clockwise: boolean): void => {
      if (selectedPrimitiveIds.length === 0) {
        return;
      }

      const stepDegrees = project.tile.shape === 'square' ? 90 : 60;
      const radians = ((clockwise ? stepDegrees : -stepDegrees) * Math.PI) / 180;
      const selected = new Set(selectedPrimitiveIds);
      const rotated = project.primitives
        .filter((primitive) => selected.has(primitive.id))
        .map((primitive) => rotatePrimitiveAroundOrigin(primitive, radians));

      if (rotated.length === 0) {
        return;
      }

      const directionLabel = clockwise ? 'clockwise' : 'counterclockwise';
      const shapeLabel = rotated.length === 1 ? 'shape' : 'shapes';
      dispatch({
        type: 'update-primitives',
        primitives: rotated,
        historyDescription: `Rotate ${rotated.length} ${shapeLabel} ${directionLabel}`
      });
    },
    [project.primitives, project.tile.shape, selectedPrimitiveIds]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      const undoCombo = hasPrimaryModifier && !event.shiftKey && key === 'z';
      const redoCombo =
        (hasPrimaryModifier && event.shiftKey && key === 'z') || (event.ctrlKey && key === 'y');

      if (redoCombo) {
        event.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }

      if (undoCombo) {
        event.preventDefault();
        dispatch({ type: 'undo' });
        return;
      }

      if (
        event.repeat ||
        hasPrimaryModifier ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      const tool = TOOL_SHORTCUT_BY_KEY[key];
      if (tool) {
        event.preventDefault();
        setTool(tool);
        return;
      }

      if (key === SELECTION_SHORTCUTS.duplicate) {
        event.preventDefault();
        duplicateSelected();
        return;
      }

      if (key === SELECTION_SHORTCUTS.split) {
        event.preventDefault();
        toggleSplitSelection();
        return;
      }

      if (key === SELECTION_SHORTCUTS.rotateCcw) {
        event.preventDefault();
        rotateSelected(false);
        return;
      }

      if (key === SELECTION_SHORTCUTS.rotateCw) {
        event.preventDefault();
        rotateSelected(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duplicateSelected, rotateSelected, setTool, toggleSplitSelection]);

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
    setSelectedPrimitiveIds([]);
    setSplitSelectionLineId(null);
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

  const exportAnimatedGif = async (): Promise<void> => {
    if (isExportingGif) {
      return;
    }

    setIsExportingGif(true);
    setMessage('Exporting animated GIF...');

    try {
      const gif = await buildAnimatedGif(project);
      downloadBlob('tile-history.gif', gif);
      setMessage('Exported animated GIF.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not export animated GIF.');
    } finally {
      setIsExportingGif(false);
    }
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
      setSplitSelectionLineId(null);
      setMessage('Imported project JSON.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import project file.');
    } finally {
      event.target.value = '';
    }
  };

  const loadPreset = async (preset: PresetDefinition): Promise<void> => {
    if (loadingPresetId) {
      return;
    }

    setLoadingPresetId(preset.id);
    setMessage(`Loading ${preset.name}...`);

    try {
      const loaded = presetProjects[preset.id] ?? (await fetchPresetProject(preset));
      dispatch({ type: 'hydrate', state: loaded.project });
      setPattern(loaded.pattern);
      setPresetProjects((current) => ({ ...current, [preset.id]: loaded }));
      setHiddenColors([]);
      setSelectedPrimitiveIds([]);
      setSplitSelectionLineId(null);
      setIsPresetGalleryOpen(false);
      setMessage(`Loaded ${preset.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not load ${preset.name}.`);
    } finally {
      setLoadingPresetId(null);
    }
  };

  const updateEditorPane = (clientX: number): void => {
    if (!showPatternPreview) {
      return;
    }

    const splitElement = centerSplitRef.current;
    if (!splitElement) {
      return;
    }

    const bounds = splitElement.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }

    setEditorPane(clampEditorPane((clientX - bounds.left) / bounds.width));
  };

  const onSplitPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingPane(true);
    updateEditorPane(event.clientX);
  };

  const onSplitPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!resizingPane) {
      return;
    }
    updateEditorPane(event.clientX);
  };

  const onSplitPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizingPane(false);
  };

  return (
    <main className="app-shell">
      <header className="title-bar">
        <h1>Tile Creator</h1>
        <p>Create one tile, then repeat it into seamless geometric patterns.</p>
      </header>

      <section className="workspace-layout">
        <Toolbar
          shape={project.tile.shape}
          activeTool={project.activeTool}
          activeColor={highlightedStyle.color}
          activeStrokeWidth={highlightedStyle.strokeWidth}
          visibleColors={availableColors.filter((color) => !hiddenColorSet.has(color))}
          colors={availableColors}
          canUndo={project.history.past.length > 0}
          canRedo={project.history.future.length > 0}
          historyTimeline={historyTimeline}
          selectedCount={selectedPrimitiveIds.length}
          canSplitSelection={canSplitSelection}
          splitSelectionArmed={splitSelectionArmed}
          onShapeChange={setShape}
          onToolChange={setTool}
          onColorChange={setColor}
          onStrokeWidthChange={setStrokeWidth}
          onColorVisibilityChange={setColorVisibility}
          onAllColorsVisibilityChange={setAllColorsVisibility}
          onOnlyVisibleColor={setOnlyVisibleColor}
          onDuplicateSelection={duplicateSelected}
          onSplitSelection={toggleSplitSelection}
          onRotateSelectionCcw={() => rotateSelected(false)}
          onRotateSelectionCw={() => rotateSelected(true)}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onHistoryJump={(pastLength) => dispatch({ type: 'jump-history', pastLength })}
        />

        <section className="center-panel">
          <div
            ref={centerSplitRef}
            className={`center-split${showPatternPreview ? '' : ' preview-hidden'}`}
            style={
              showPatternPreview
                ? {
                    gridTemplateColumns: `${(editorPane * 100).toFixed(2)}% 0.65rem ${(
                      100 -
                      editorPane * 100
                    ).toFixed(2)}%`
                  }
                : undefined
            }
          >
            <div className="center-pane">
              <EditorCanvas
                tile={project.tile}
                primitives={visiblePrimitives}
                activeTool={project.activeTool}
                activeColor={project.activeColor}
                activeStrokeWidth={project.activeStrokeWidth}
                zoom={editorZoom}
                onZoomChange={(nextZoom) => setEditorZoom(clampEditorZoom(nextZoom))}
                onAddPrimitive={addPrimitive}
                onUpdatePrimitive={updatePrimitive}
                splitSelectionLineId={splitSelectionLineId}
                onSplitLine={splitLine}
                onErasePrimitive={erasePrimitive}
                onErasePrimitives={erasePrimitives}
                onSelectionChange={setSelectedPrimitiveIds}
              />
            </div>

            {showPatternPreview ? (
              <>
                <div
                  className={`center-divider ${resizingPane ? 'dragging' : ''}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize editor and preview panes"
                  onPointerDown={onSplitPointerDown}
                  onPointerMove={onSplitPointerMove}
                  onPointerUp={onSplitPointerUp}
                  onPointerCancel={onSplitPointerUp}
                />

                <div className="center-pane">
                  <TilingPreview tile={project.tile} primitives={visiblePrimitives} pattern={pattern} />
                </div>
              </>
            ) : null}
          </div>
        </section>

        <aside className="right-panel">
          <section className="right-section">
            <h2>Example Presets</h2>
            <button type="button" onClick={() => setIsPresetGalleryOpen(true)}>
              Open Gallery
            </button>
          </section>

          <section className="right-section pattern-controls">
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
              <button type="button" onClick={() => setShowPatternPreview((current) => !current)}>
                {showPatternPreview ? 'Hide Pattern Preview' : 'Show Pattern Preview'}
              </button>
            </div>
          </section>

          <section className="right-section">
            <h2>Import / Export</h2>
            <div className="right-actions">
              <button type="button" onClick={exportSvg}>
                Export SVG
              </button>
              <button type="button" onClick={exportProjectJson}>
                Export Project
              </button>
              <button type="button" onClick={() => void exportAnimatedGif()} disabled={isExportingGif}>
                Export Animated GIF
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                Import Project
              </button>
              <button type="button" onClick={clearTile} disabled={project.primitives.length === 0}>
                Clear Tile
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="application/json"
              onChange={importProjectJson}
            />
          </section>

          {message ? <p className="status-message">{message}</p> : null}
        </aside>
      </section>

      {isPresetGalleryOpen ? (
        <div
          className="gallery-modal-backdrop"
          role="presentation"
          onClick={() => setIsPresetGalleryOpen(false)}
        >
          <section
            className="gallery-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Preset Gallery"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="gallery-modal-header">
              <h2>Preset Gallery</h2>
              <button type="button" onClick={() => setIsPresetGalleryOpen(false)}>
                Close
              </button>
            </header>

            <div className="gallery-modal-content">
              <div className="preset-list">
                {PRESET_GALLERY.map((preset) => {
                  const previewError = presetPreviewErrors[preset.id];
                  const preview = presetProjects[preset.id];

                  return (
                    <article key={preset.id} className="preset-card">
                      <h3>{preset.name}</h3>
                      <p>{preset.description}</p>
                      {preview ? (
                        <PresetTilePreview
                          id={preset.id}
                          tile={preview.project.tile}
                          primitives={preview.project.primitives}
                        />
                      ) : (
                        <div className="preset-thumbnail-placeholder">
                          {previewError ? 'Preview unavailable.' : 'Loading preview...'}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void loadPreset(preset)}
                        disabled={loadingPresetId !== null}
                      >
                        {loadingPresetId === preset.id ? 'Loading...' : 'Open Preset'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
