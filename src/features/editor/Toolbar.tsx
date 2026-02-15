import type { TileShape, Tool } from '../../types/model';

interface ToolbarProps {
  shape: TileShape;
  activeTool: Tool;
  activeColor: string;
  colors: string[];
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  onShapeChange: (shape: TileShape) => void;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onDuplicateSelection: () => void;
  onRotateSelectionCcw: () => void;
  onRotateSelectionCw: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const tools: Array<{ id: Tool; label: string }> = [
  { id: 'select', label: 'Select' },
  { id: 'line', label: 'Line' },
  { id: 'circle', label: 'Circle' },
  { id: 'split', label: 'Split' },
  { id: 'pan', label: 'Pan' },
  { id: 'erase', label: 'Erase' }
];

export function Toolbar(props: ToolbarProps): JSX.Element {
  const hasSelection = props.selectedCount > 0;
  const rotationStepLabel = props.shape === 'square' ? '90' : '60';

  return (
    <aside className="toolbar">
      <section>
        <h2>Tile</h2>
        <label className="field">
          Shape
          <select
            value={props.shape}
            onChange={(event) => props.onShapeChange(event.target.value as TileShape)}
          >
            <option value="square">Square</option>
            <option value="hex-pointy">Hex (pointy)</option>
          </select>
        </label>
      </section>

      <section>
        <h2>Tools</h2>
        <div className="button-row">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={props.activeTool === tool.id ? 'active' : ''}
              onClick={() => props.onToolChange(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Color</h2>
        <div className="color-grid">
          {props.colors.map((color) => (
            <button
              key={color}
              type="button"
              data-testid={`color-${color}`}
              aria-label={`Select color ${color}`}
              className={props.activeColor === color ? 'color active-color' : 'color'}
              style={{ backgroundColor: color }}
              onClick={() => props.onColorChange(color)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>Selection</h2>
        <div className="button-row">
          <button type="button" onClick={props.onDuplicateSelection} disabled={!hasSelection}>
            Duplicate
          </button>
          <button type="button" onClick={props.onRotateSelectionCcw} disabled={!hasSelection}>
            Rotate CCW ({rotationStepLabel} deg)
          </button>
          <button type="button" onClick={props.onRotateSelectionCw} disabled={!hasSelection}>
            Rotate CW ({rotationStepLabel} deg)
          </button>
        </div>
      </section>

      <section>
        <h2>History</h2>
        <div className="history-controls">
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
            Undo
          </button>
          <button type="button" onClick={props.onRedo} disabled={!props.canRedo}>
            Redo
          </button>
        </div>
      </section>
    </aside>
  );
}
