# Project Instructions

## Behavior

* Do not modify the visuals shown to the user in preview mode (ie. hiding parts of the mesh) unless you confirm the behavior change with the user first

## Overview

**plinthgenerator** is a browser-based, fully client-side SPA that generates parametric STL plinth models from user-controlled parameters. No backend, no API calls — everything runs in the browser and works offline once loaded. Deployed to Vercel as a static site.

- **Stack:** Vite + React 19 + TypeScript, the mostlymaking controls from the `vendor/ui-kit` submodule (`@jamiehales/ui-kit/mostlymaking`, Radix-based; read its `DESIGN.md` and `CHANGELOG.md`; run `git submodule update --init` after cloning), three.js via `@react-three/fiber` + `@react-three/drei`
- **Package manager:** pnpm (lockfile committed; always use `pnpm install --frozen-lockfile`)
- **Repository:** https://github.com/jamiehale/plinthmaker.git
- **Branch:** `main` (default)

## Commands

```sh
pnpm install            # install deps
pnpm dev                # dev server on http://localhost:5173
pnpm run build          # tsc -b && vite build  →  dist/
pnpm run preview        # serve the built bundle locally
pnpm run lint           # oxlint (config in .oxlintrc.json)
```

Before considering any task complete, run **both** `pnpm run build` and `pnpm run lint` and ensure they pass clean.

To work on the kit in `vendor/ui-kit` (e.g. run its `pnpm typecheck` / `pnpm test`), install it from inside that directory with `pnpm install --frozen-lockfile --ignore-workspace`. This project's `pnpm-workspace.yaml` (which holds `patchedDependencies`) makes pnpm treat this repo as the workspace root, so a plain `pnpm install` in the kit installs this app instead and leaves the kit's `node_modules` empty.

## Repo structure

```
plinthgenerator/
├── AGENTS.md              # this file — agent guidance
├── README.md              # user-facing readme
├── index.html             # Vite entry HTML (mounts #root, loads /src/main.tsx)
├── vite.config.ts         # Vite config (React plugin, es2023 build target, dist/ output)
├── vercel.json            # Vercel: framework=vite, output=dist, SPA rewrite to /index.html
├── package.json           # scripts + deps (no build-side env vars)
├── pnpm-lock.yaml         # committed — use frozen install
├── tsconfig.json          # references tsconfig.app.json + tsconfig.node.json
├── tsconfig.app.json      # app source (src/) — bundler mode, jsx=react-jsx, strict lint rules
├── tsconfig.node.json     # vite.config.ts only
├── .oxlintrc.json         # oxlint config (react, typescript, oxc plugins)
├── Dockerfile             # multi-stage: node:24-alpine builds, nginx:alpine serves dist/
├── nginx.conf             # nginx config for the Docker image (port 5173, SPA fallback)
├── .dockerignore
├── public/
│   └── favicon.svg        # plinth icon
└── src/
    ├── main.tsx           # entry — loads fonts + mostlymaking.css, renders <App/>
    ├── App.tsx            # top-level layout: top bar, left sidebar (params panel), 3D viewport
    ├── index.css          # global reset plus the app layout and small component styles
    └── components/
        └── Viewport.tsx   # the 3D canvas (r3f <Canvas>): camera, lights, shadows, Grid floor,
                           #   OrbitControls, GizmoHelper. Placeholder plinth mesh lives here.
```

## Architecture notes

### Layout (`src/App.tsx`)

- A 48px top bar with the app title.
- A sidebar on the left (`DRAWER_WIDTH` wide), below the top bar — **this is where all parameter sliders/text fields go**. Keep controls inside the sidebar only — do not scatter them elsewhere.
- The remaining area (right of the sidebar, below the top bar) is filled by the 3D `Viewport`.

### 3D viewport (`src/components/Viewport.tsx`)

- Uses `@react-three/fiber`'s `<Canvas>` with a perspective camera positioned for a top-down-angled view.
- Lighting: one `directionalLight` (casts shadows) + `ambientLight`.
- Floor: drei `<Grid>` (infinite, faded). `OrbitControls` has `maxPolarAngle` clamped just under the horizon so the camera can't look up from under the floor.
- A `<GizmoHelper>` with `<GizmoViewport>` shows the axis orientation gizmo in the bottom-right.
- There's a placeholder `<Box>` mesh standing in for the plinth — replace it with the parametric geometry once parameters are wired in.
- `gl={{ preserveDrawingBuffer: true }}` is set so STL export (when added) can read the scene without flushing — keep this when adding an exporter.

### Parameters (not yet implemented)

- Parameters have not been added yet. When adding them: put the controls (`LabeledSlider`, `CheckField`, `SegmentedControl`, etc.) inside the left sidebar in `App.tsx`, hold the state in `App` (or a small store/context), and pass values down to the `Viewport`/geometry as props. The eventual output is an STL file generated client-side (e.g. via three's `STLExporter`).

### Styling

- The UI library is the mostlymaking controls in the `vendor/ui-kit` submodule (dark theme, tokens in `mostlymaking.css`). Prefer its components and CSS variables (`var(--primary)`, `.mm-type-*`) over new hand-written styles. Update the pinned kit commit and read its `CHANGELOG.md` to pick up changes.
- `src/index.css` holds the page layout and the few app-specific styles; use the kit's components for anything it already provides.

## Deployment

- **Vercel** auto-deploys on push to `main`. `vercel.json` sets `framework: vite`, `outputDirectory: dist`, and a catch-all rewrite `/(.*)` → `/index.html` so client-side routing works on refresh.
- No API routes, no serverless functions, no env vars. The app is a pure static bundle.
- For local production preview without Vercel: `pnpm run build && pnpm run preview`, or use Docker (`docker build -t plinthmaker . && docker run -p 5173:5173 plinthmaker`).

## Git

- Do not commit, push, or otherwise mutate git history without first asking the user for approval. Stage files (`git add`), inspect status/diff/logs freely — but never create or rewrite commits without an explicit "yes".
- Never revert, restore, discard, or `git checkout` files without explicit permission.

## Conventions

- **No comments** in source files unless explicitly requested.
- Follow existing patterns: functional components, named exports, TypeScript strict mode, `import X from './Y.tsx'` (with extension, matching the Vite scaffold style).
- Keep dependencies minimal and check `package.json` before adding a new library — prefer what's already installed (the mostlymaking controls, three, drei) over pulling in alternatives.
- **Variable naming:** use human-readable, descriptive names. Avoid terse abbreviations like `hw`, `hd`, `r2`, `nx`, `nz`, `p`, `c`, `a`, `b`. Prefer `halfWidth`, `halfDepth`, `radiusSquared`, `unitX`, `unitZ`, `point`, `cavity`, `pointA`, `pointB`. Short loop indices (`i`, `j`, `k`) and well-understood math symbols (`t` for interpolation parameter, `dx`/`dz` for delta components) are acceptable. The goal is that a reader can understand a variable's role without scrolling to its definition.