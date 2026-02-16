export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  filePath: string;
}

export const PRESET_GALLERY: PresetDefinition[] = [
  {
    id: 'preset-1',
    name: 'Preset 1',
    description: 'Placeholder example loaded from your first project export.',
    filePath: 'presets/preset-1.json'
  },
  {
    id: 'preset-2',
    name: 'Preset 2',
    description: 'Placeholder example loaded from your second project export.',
    filePath: 'presets/preset-2.json'
  },
  {
    id: 'preset-3',
    name: 'Preset 3',
    description: 'Placeholder example loaded from your third project export.',
    filePath: 'presets/preset-3.json'
  }
];
