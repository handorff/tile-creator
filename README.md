# Tile Creator

Tile Creator is an SVG-first editor for building a single canonical tile (square or pointy-top hexagon), then repeating it into a seamless geometric tiling.

## Features

- Tile shape: square or pointy-top hexagon
- Draw line and circle primitives on one tile
- Snap to seed points and existing geometry intersections
- Object erase and multi-step undo
- Repeat pattern by tile counts (`columns x rows`)
- Export final pattern as SVG
- Export tile edit replay as animated GIF
- Export/import editable project JSON
- Autosave/restore with localStorage

## Getting started

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev
npm run lint
npm run test -- --run
npm run build
npm run preview
```

## Deployment

The project includes GitHub Actions workflows:

- `CI`: lint, test, and build on pushes/PRs
- `Deploy`: publish `dist/` to GitHub Pages on `main`

For GitHub Pages, set repository Pages source to **GitHub Actions**.
