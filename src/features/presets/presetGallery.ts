export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  filePath: string;
}

export const PRESET_GALLERY: PresetDefinition[] = [
  {
    id: 'cordoba',
    name: 'Cordoba',
    description: 'Imported from Cordoba.json.',
    filePath: 'presets/preset-1.json'
  },
  {
    id: 'ibn-tulun',
    name: 'Ibn Tulun',
    description: 'Imported from Ibn Tulun.json.',
    filePath: 'presets/preset-2.json'
  },
  {
    id: 'kairouan',
    name: 'Kairouan',
    description: 'Imported from Kairouan.json.',
    filePath: 'presets/preset-3.json'
  }
];
