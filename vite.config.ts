import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VS Code's port-forwarding proxy strips its own path prefix (e.g.
// /proxy/5173/) before forwarding the request to Vite. But Vite's `base`
// option controls BOTH how assets are referenced AND where they're served.
// With `base: '/proxy/5173/'`, Vite serves at /proxy/5173/... but the proxy
// forwards stripped paths (/...), causing 404s. This middleware re-adds the
// prefix to incoming requests so Vite can serve them at the expected base.
function proxyPrefixMiddleware(prefix: string) {
  return {
    name: 'proxy-prefix-middleware',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url || ''
        if (!url.startsWith(prefix)) {
          const [path, query] = url.split('?')
          req.url = prefix + path.replace(/^\//, '') + (query ? '?' + query : '')
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), proxyPrefixMiddleware('/proxy/5173/')],
  base: command === 'serve' ? '/proxy/5173/' : '/',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['code.jamiehales.com'],
  },
  build: {
    target: 'es2023',
    outDir: 'dist',
  },
}))