import * as THREE from 'three'
import {
  FIGURE_SOURCE_PATH, FIGURE_FEED_PATH, FIGURE_FEED_MAX_AGE_MS, FIGURE_PIXELS_PER_MM,
  FIGURE_ALPHA_THRESHOLD, FIGURE_MONOCHROME, FIGURE_SHADE_BAND, FIGURE_SHADOW_COLOR, FIGURE_SHADOW_TINT, MAX_FIGURE_RESULTS, DEFAULT_FIGURE_FEED_PATH,
} from '../defaults.ts'
import { GUIDE_COLOR } from './guideShapes.ts'

export interface FigureEntry {
  id: string
  name: string
  group: string
  faction: string
  unit: string
  category: string
  imagePath: string
}

export interface FigureFilters {
  group: string | null
  faction: string | null
  unit: string | null
}

export interface FigureCatalog {
  groups: { id: string; name: string }[]
  figures: FigureEntry[]
}

export interface FigureSilhouette {
  texture: THREE.Texture
  widthMM: number
  heightMM: number
}

const SOURCE_ORIGIN = 'https://minicompare.info/'
const CACHE_NAME = 'minicompare-feed-v2'
const CACHED_AT_HEADER = 'x-cached-at'

type FeedNode = { [key: string]: FeedNode | string | unknown[] }

const sourceUrl = (relativePath: string) => `${import.meta.env.BASE_URL}${FIGURE_SOURCE_PATH}${relativePath}`

export function prettifyKey(key: string): string {
  return key
    .replace(/^_+/, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function figureFromFeed(keys: string[], key: string, url: string): FigureEntry {
  const [group, faction = '', unit = ''] = keys
  return {
    id: url,
    name: prettifyKey(key),
    group,
    faction: prettifyKey(faction),
    unit: prettifyKey(unit),
    category: keys.map(prettifyKey).join(' › '),
    imagePath: url.slice(SOURCE_ORIGIN.length),
  }
}

export const DEFAULT_PREVIEW_FIGURE = (() => {
  const keys = DEFAULT_FIGURE_FEED_PATH.slice(0, -1)
  const key = DEFAULT_FIGURE_FEED_PATH[DEFAULT_FIGURE_FEED_PATH.length - 1]
  return figureFromFeed(keys, key, `${SOURCE_ORIGIN}assets/collection/${DEFAULT_FIGURE_FEED_PATH.join('/')}.webp`)
})()

function flattenFeed(feed: FeedNode): FigureCatalog {
  const groups = Object.keys(feed).map((id) => ({ id, name: prettifyKey(id) }))
  const figures: FigureEntry[] = []
  const walk = (node: FeedNode, keys: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (!value.startsWith(SOURCE_ORIGIN)) continue
        figures.push(figureFromFeed(keys, key, value))
      } else if (value && !Array.isArray(value) && typeof value === 'object') {
        walk(value as FeedNode, [...keys, key])
      }
    }
  }
  walk(feed, [])
  return { groups, figures }
}

async function openFeedCache(): Promise<Cache | null> {
  try {
    return 'caches' in globalThis ? await caches.open(CACHE_NAME) : null
  } catch {
    return null
  }
}

async function readCachedCatalog(cache: Cache | null): Promise<FigureCatalog | null> {
  if (!cache) return null
  try {
    const cached = await cache.match(FIGURE_FEED_PATH)
    const cachedAt = Number(cached?.headers.get(CACHED_AT_HEADER))
    if (!cached || !(Date.now() - cachedAt < FIGURE_FEED_MAX_AGE_MS)) return null
    return (await cached.json()) as FigureCatalog
  } catch {
    return null
  }
}

async function writeCachedCatalog(cache: Cache | null, catalog: FigureCatalog) {
  if (!cache) return
  try {
    await cache.put(FIGURE_FEED_PATH, new Response(JSON.stringify(catalog), {
      headers: { 'content-type': 'application/json', [CACHED_AT_HEADER]: String(Date.now()) },
    }))
  } catch (error) {
    console.warn('figure catalog cache write failed:', error)
  }
}

async function fetchCatalog(): Promise<FigureCatalog> {
  const cache = await openFeedCache()
  const cached = await readCachedCatalog(cache)
  if (cached) return cached
  const response = await fetch(sourceUrl(FIGURE_FEED_PATH))
  if (!response.ok) throw new Error(`figure catalog request failed: ${response.status}`)
  const catalog = flattenFeed((await response.json()) as FeedNode)
  await writeCachedCatalog(cache, catalog)
  return catalog
}

let catalogRequest: Promise<FigureCatalog> | null = null

export function loadFigureCatalog(): Promise<FigureCatalog> {
  catalogRequest ??= fetchCatalog().catch((error: unknown) => {
    catalogRequest = null
    throw error
  })
  return catalogRequest
}

export function matchesFilters(figure: FigureEntry, filters: FigureFilters): boolean {
  return (!filters.group || figure.group === filters.group)
    && (!filters.faction || figure.faction === filters.faction)
    && (!filters.unit || figure.unit === filters.unit)
}

export function uniqueValues(figures: FigureEntry[], field: 'faction' | 'unit'): string[] {
  return [...new Set(figures.map((figure) => figure[field]).filter(Boolean))].sort((first, second) => first.localeCompare(second))
}

export function searchFigures(catalog: FigureCatalog, query: string, filters: FigureFilters): { matches: FigureEntry[]; total: number } {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches: FigureEntry[] = []
  let total = 0
  for (const figure of catalog.figures) {
    if (!matchesFilters(figure, filters)) continue
    const haystack = `${figure.name} ${figure.category}`.toLowerCase()
    if (!terms.every((term) => haystack.includes(term))) continue
    total++
    if (matches.length < MAX_FIGURE_RESULTS) matches.push(figure)
  }
  return { matches, total }
}

export async function loadFigureSilhouette(imagePath: string): Promise<FigureSilhouette> {
  const image = new Image()
  image.decoding = 'async'
  image.src = sourceUrl(imagePath)
  await image.decode()

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('2D canvas unavailable')
  context.drawImage(image, 0, 0)

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const red = (GUIDE_COLOR >> 16) & 0xff
  const green = (GUIDE_COLOR >> 8) & 0xff
  const blue = GUIDE_COLOR & 0xff
  const shadowRed = (FIGURE_SHADOW_COLOR >> 16) & 0xff
  const shadowGreen = (FIGURE_SHADOW_COLOR >> 8) & 0xff
  const shadowBlue = FIGURE_SHADOW_COLOR & 0xff
  const data = pixels.data
  const luminanceAt = (i: number) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
  let luminanceTotal = 0
  let opaqueCount = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < FIGURE_ALPHA_THRESHOLD) continue
    luminanceTotal += luminanceAt(i)
    opaqueCount++
  }
  const averageLuminance = opaqueCount > 0 ? luminanceTotal / opaqueCount : 0.5
  for (let i = 0; i < data.length; i += 4) {
    const opaque = data[i + 3] >= FIGURE_ALPHA_THRESHOLD
    const shade = FIGURE_MONOCHROME ? Math.max(-1, Math.min(1, (luminanceAt(i) - averageLuminance) * 2 * FIGURE_SHADE_BAND)) : 0
    const shadowTint = shade < 0 ? FIGURE_SHADOW_TINT * Math.min(1, -shade / FIGURE_SHADE_BAND) : 0
    const applyShade = (channel: number, shadowChannel: number) => {
      if (shade >= 0) return Math.round(channel + (255 - channel) * shade)
      const tinted = channel + (shadowChannel - channel) * shadowTint
      return Math.round(tinted * (1 + shade))
    }
    data[i] = applyShade(red, shadowRed)
    data[i + 1] = applyShade(green, shadowGreen)
    data[i + 2] = applyShade(blue, shadowBlue)
    data[i + 3] = opaque ? 255 : 0
  }
  context.putImageData(pixels, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  return {
    texture,
    widthMM: canvas.width / FIGURE_PIXELS_PER_MM,
    heightMM: canvas.height / FIGURE_PIXELS_PER_MM,
  }
}
