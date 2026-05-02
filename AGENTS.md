# Repository Guidelines

## Project Structure & Module Organization

This is a React 19 + TypeScript + Vite PWA for men’s artistic gymnastics judging notes. Source code lives in `src/`:

- `src/main.tsx` registers the app and service worker.
- `src/App.tsx` defines HashRouter routes for GitHub Pages.
- `src/pages/` contains entry, trial, competition, and individual screens.
- `src/components/JudgeSheet.tsx` is the core handwriting canvas and judging sheet UI.
- `src/db/database.ts` defines Dexie/IndexedDB schemas.
- `src/constants/` stores apparatus and deduction definitions.
- `src/utils/` contains shared sheet rendering and PNG export logic.
- `public/` stores PWA assets; `scripts/` generates icons; `docs/` contains diagrams.

There is no dedicated `tests/` directory yet.

## Build, Test, and Development Commands

- `npm install` installs dependencies.
- `npm run dev` starts Vite, usually at `http://localhost:5173`.
- `npm run build` runs TypeScript project build and production Vite build.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint.
- `npx tsc --noEmit` type-checks without output.
- `node scripts/generate-icons.mjs` regenerates PWA icons from the source asset.

## Coding Style & Naming Conventions

Use TypeScript strict mode and React function components with hooks. Follow existing style: two-space indentation, single quotes, semicolons in most source files, and Tailwind utilities for styling.

Use PascalCase for components (`JudgeSheet.tsx`), camelCase for variables/functions, and uppercase apparatus codes (`FX`, `PH`, `SR`, `VT`, `PB`, `HB`). Keep Japanese UI labels consistent.

Shared drawing behavior should stay aligned between `JudgeSheet.tsx` and `src/utils/renderSheet.ts`.

## Testing Guidelines

No automated test framework is configured. Before submitting changes, run:

```bash
npm run build
npm run lint
```

For canvas, IndexedDB, PWA, or iPad/Apple Pencil changes, also test manually. Verify session creation, drawing, undo/redo, erase, autosave after navigation, and PNG export/share.

## Commit & Pull Request Guidelines

Commit history follows Conventional Commits, for example:

- `feat: 横線の個別削除と Apple Pencil 復旧強化`
- `fix: iPad PWA で Apple Pencil の入力が無反応になる問題を修正`
- `chore: bump version to 1.13.2`

Use `feat:`, `fix:`, `refactor:`, `style:`, `docs:`, or `chore:`. Update `package.json` version for merged changes: minor for features, patch for fixes.

Pull requests should include a summary, testing results, linked issues when applicable, and screenshots or recordings for UI changes. Mention IndexedDB schema, PWA caching, or GitHub Pages deployment impact.

## Security & Configuration Tips

The app is serverless and stores judging data in IndexedDB. Avoid external network dependencies unless necessary. Keep `vite.config.ts` `base: '/MAG-judge-memo/'` and PWA asset paths compatible with GitHub Pages.
