let counter = 0;

export function createId(prefix = 'p'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}
