import type { Primitive } from '../../types/model';

interface PrimitiveSvgProps {
  primitive: Primitive;
  strokeWidth: number;
  className?: string;
}

export function PrimitiveSvg({ primitive, strokeWidth, className }: PrimitiveSvgProps): JSX.Element {
  if (primitive.kind === 'line') {
    return (
      <line
        className={className}
        x1={primitive.a.x}
        y1={primitive.a.y}
        x2={primitive.b.x}
        y2={primitive.b.y}
        stroke={primitive.color}
        strokeWidth={strokeWidth}
        fill="none"
      />
    );
  }

  return (
    <circle
      className={className}
      cx={primitive.center.x}
      cy={primitive.center.y}
      r={primitive.radius}
      stroke={primitive.color}
      strokeWidth={strokeWidth}
      fill="none"
    />
  );
}
