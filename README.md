# Plinth Generator

A browser-based tool for generating parametric STL plinth models. Runs entirely client-side — no API calls, works offline once loaded.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **MUI** (Material UI v9) for the interface
- **three.js** via `@react-three/fiber` + `@react-three/drei` for the 3D viewport
- **pnpm** for package management
- Deployed to **Vercel** (static SPA)

## Prerequisites

- Node.js >= 24
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)

## Development

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

## Production build

```sh
pnpm run build    # type-check + bundle to dist/
pnpm run preview  # serve the built bundle locally
```

## Local Docker

Build and run the containerised app (serves the production build via nginx on port 5173):

```sh
docker build -t plinthmaker .
docker run -p 5173:5173 plinthmaker
```

Then open http://localhost:5173.

## Lint

```sh
pnpm run lint     # oxlint
```

## Deploy

Push to `main` — Vercel auto-deploys via the settings in `vercel.json` (Vite framework, `dist` output, SPA rewrite to `index.html`).