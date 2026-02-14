import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('calls color callback when swatch is clicked', () => {
    const onColorChange = vi.fn();

    render(
      <Toolbar
        shape="square"
        activeTool="line"
        activeColor="#111"
        colors={['#111', '#222']}
        canUndo={false}
        onShapeChange={vi.fn()}
        onToolChange={vi.fn()}
        onColorChange={onColorChange}
        onUndo={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('color-#222'));
    expect(onColorChange).toHaveBeenCalledWith('#222');
  });
});
