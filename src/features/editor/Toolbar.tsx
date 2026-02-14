import type { TileShape, Tool } from '../../types/model';

interface ToolbarProps {
  shape: TileShape;
  activeTool: Tool;
  activeColor: string;
  colors: string[];
  canUndo: boolean;
  onShapeChange: (shape: TileShape) => void;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
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
        <h2>History</h2>
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
          Undo
        </button>
      </section>
    </aside>
  );
}
