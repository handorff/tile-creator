import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('calls color callback when swatch is clicked', () => {
    const onColorChange = vi.fn();
    const onDuplicateSelection = vi.fn();

    render(
      <Toolbar
        shape="square"
        activeTool="line"
        activeColor="#111"
        colors={['#111', '#222']}
        canUndo={false}
        selectedCount={1}
        onShapeChange={vi.fn()}
        onToolChange={vi.fn()}
        onColorChange={onColorChange}
        onDuplicateSelection={onDuplicateSelection}
        onRotateSelectionCcw={vi.fn()}
        onRotateSelectionCw={vi.fn()}
        onUndo={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('color-#222'));
    expect(onColorChange).toHaveBeenCalledWith('#222');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(onDuplicateSelection).toHaveBeenCalledTimes(1);
  });
});
