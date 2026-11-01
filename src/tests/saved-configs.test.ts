import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIG_STORE_FORMAT,
  CONFIG_STORE_VERSION,
  DEFAULT_PLINTH_CONFIG,
  configFilename,
  loadSavedConfigs,
  parseConfigStore,
  parsePlinthConfig,
  plinthConfigsEqual,
  serializeConfigStore,
  storeSavedConfigs,
  type PlinthConfig,
} from '../components/savedConfigs.ts'

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    },
  })
  return store
}

describe('saved configs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fills missing fields with defaults', () => {
    const config = parsePlinthConfig({ shape: 'ngon', ngonSides: 8, width: 55 })
    expect(config.shape).toBe('ngon')
    expect(config.ngonSides).toBe(8)
    expect(config.width).toBe(55)
    expect(config.height).toBe(DEFAULT_PLINTH_CONFIG.height)
    expect(config.trimSections).toEqual(DEFAULT_PLINTH_CONFIG.trimSections)
  })

  it('replaces invalid fields with defaults', () => {
    const config = parsePlinthConfig({
      shape: 'triangle',
      width: 'wide',
      height: Number.NaN,
      roundStyle: 'bevel',
      topAnglePreset: 'custom',
      trimSource: { kind: 'other', id: 'x' },
      trimSections: [{ type: 'band', height: 1 }],
      addHole: 'yes',
    })
    expect(config.shape).toBe(DEFAULT_PLINTH_CONFIG.shape)
    expect(config.width).toBe(DEFAULT_PLINTH_CONFIG.width)
    expect(config.height).toBe(DEFAULT_PLINTH_CONFIG.height)
    expect(config.roundStyle).toBe(DEFAULT_PLINTH_CONFIG.roundStyle)
    expect(config.topAnglePreset).toBe('custom')
    expect(config.trimSource).toEqual(DEFAULT_PLINTH_CONFIG.trimSource)
    expect(config.trimSections).toEqual(DEFAULT_PLINTH_CONFIG.trimSections)
    expect(config.addHole).toBe(DEFAULT_PLINTH_CONFIG.addHole)
  })

  it('treats configs with the same values in a different key order as equal', () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_PLINTH_CONFIG).reverse()) as unknown as PlinthConfig
    expect(plinthConfigsEqual(reordered, DEFAULT_PLINTH_CONFIG)).toBe(true)
    expect(plinthConfigsEqual({ ...DEFAULT_PLINTH_CONFIG, width: 41 }, DEFAULT_PLINTH_CONFIG)).toBe(false)
  })

  it('round-trips configs through storage', () => {
    stubStorage()
    const config: PlinthConfig = { ...DEFAULT_PLINTH_CONFIG, shape: 'ngon', ngonSides: 5, hollowEnabled: true, trimSource: { kind: 'custom', id: 'custom-1' } }
    storeSavedConfigs([{ id: 'config-1', name: 'Pentagon', savedAt: 1, config }])
    const loaded = loadSavedConfigs()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Pentagon')
    expect(plinthConfigsEqual(loaded[0].config, config)).toBe(true)
  })

  it('ignores corrupt storage', () => {
    stubStorage({ 'plinthgenerator.savedConfigs': '{not json' })
    expect(loadSavedConfigs()).toEqual([])
    stubStorage({ 'plinthgenerator.savedConfigs': JSON.stringify([{ id: 1 }, { id: 'a', name: 'Ok', savedAt: 2, config: { width: 60 } }]) })
    const loaded = loadSavedConfigs()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].config.width).toBe(60)
  })
})

describe('config files', () => {
  afterEach(() => vi.unstubAllGlobals())

  const saved = (name: string, config: PlinthConfig) => ({ id: `id-${name}`, name, savedAt: 5, config })

  it('exports in the same versioned format as storage', () => {
    const store = stubStorage()
    const configs = [saved('Heptagon', { ...DEFAULT_PLINTH_CONFIG, shape: 'ngon', ngonSides: 7, width: 62 })]
    storeSavedConfigs(configs)
    const text = serializeConfigStore(configs)
    expect(store.get('plinthgenerator.savedConfigs')).toBe(text)
    const file = JSON.parse(text)
    expect(file.format).toBe(CONFIG_STORE_FORMAT)
    expect(file.version).toBe(CONFIG_STORE_VERSION)
    const imported = parseConfigStore(text)
    expect(imported[0].name).toBe('Heptagon')
    expect(plinthConfigsEqual(imported[0].config, configs[0].config)).toBe(true)
  })

  it('migrates unversioned storage and rewrites it in the current format', () => {
    const store = stubStorage({ 'plinthgenerator.savedConfigs': JSON.stringify([saved('Old', { ...DEFAULT_PLINTH_CONFIG, height: 33 })]) })
    const loaded = loadSavedConfigs()
    expect(loaded[0].config.height).toBe(33)
    const rewritten = JSON.parse(store.get('plinthgenerator.savedConfigs') ?? '')
    expect(rewritten.format).toBe(CONFIG_STORE_FORMAT)
    expect(rewritten.version).toBe(CONFIG_STORE_VERSION)
    expect(rewritten.configs[0].name).toBe('Old')
  })

  it('imports older unversioned files', () => {
    const imported = parseConfigStore(JSON.stringify([saved('Legacy', DEFAULT_PLINTH_CONFIG)]))
    expect(imported[0].name).toBe('Legacy')
  })

  it('rejects files that are not plinth configs', () => {
    expect(() => parseConfigStore('{oops')).toThrow('not valid JSON')
    expect(() => parseConfigStore(JSON.stringify({ format: 'other', version: 1 }))).toThrow('not a plinth config')
    expect(() => parseConfigStore(JSON.stringify({ format: CONFIG_STORE_FORMAT, version: 'one' }))).toThrow('unknown version')
    expect(() => parseConfigStore(JSON.stringify({ format: CONFIG_STORE_FORMAT, version: CONFIG_STORE_VERSION + 1, configs: [] }))).toThrow('newer version')
    expect(() => parseConfigStore(JSON.stringify({ format: CONFIG_STORE_FORMAT, version: CONFIG_STORE_VERSION, configs: [] }))).toThrow('any plinth configs')
  })

  it('fills defaults for missing fields', () => {
    const imported = parseConfigStore(JSON.stringify({ format: CONFIG_STORE_FORMAT, version: CONFIG_STORE_VERSION, configs: [{ id: 'a', name: 'Short', savedAt: 1, config: { height: 25 } }] }))
    expect(imported[0].config.height).toBe(25)
    expect(imported[0].config.width).toBe(DEFAULT_PLINTH_CONFIG.width)
  })

  it('builds safe filenames', () => {
    expect(configFilename('My Hex / Base #2')).toBe('my-hex-base-2.plinth.json')
    expect(configFilename('!!!')).toBe('plinth-config.plinth.json')
  })
})
