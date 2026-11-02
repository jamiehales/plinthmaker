import type { RoundLocation, RoundStyle, Shape } from './geometryBuilder.ts'
import { getGamingBase, isGamingBaseId } from './gamingBases.ts'
import { getPresetSections, isSection, type TrimSection, type TrimSource } from './trimSections.ts'
import {
  DEFAULT_SHAPE, DEFAULT_NGON_SIDES, DEFAULT_WIDTH, DEFAULT_DEPTH, DEFAULT_HEIGHT, DEFAULT_LOCKED_ASPECT,
  DEFAULT_TOP_ANGLE, DEFAULT_ROUND_STYLE, DEFAULT_ROUND_LOCATION, DEFAULT_ROUND_SIZE,
  DEFAULT_TRIM_ENABLED, DEFAULT_TRIM_PROFILE_ID, DEFAULT_TRIM_HEIGHT, DEFAULT_TRIM_SIZE, DEFAULT_TRIM_LINKED,
  DEFAULT_ADD_HOLE, DEFAULT_HOLE_DIAMETER, DEFAULT_HOLE_DEPTH,
  DEFAULT_HOLLOW_ENABLED, DEFAULT_HOLLOW_TOP_THICKNESS, DEFAULT_HOLLOW_WALL_THICKNESS,
  DEFAULT_SUCTION_HOLE_ENABLED, DEFAULT_SUCTION_HOLE_DIAMETER,
  DEFAULT_BASE_INSERT_ENABLED, DEFAULT_BASE_INSERT_ID, DEFAULT_BASE_INSERT_DEPTH, DEFAULT_BASE_INSERT_TOLERANCE,
  DEFAULT_ADD_DRILL_JIG, DEFAULT_JIG_WALL_SIZE, DEFAULT_JIG_HEIGHT, DEFAULT_JIG_OVERLAP, DEFAULT_JIG_TOLERANCE,
  DEFAULT_JIG_LIFT, DEFAULT_JIG_FLATTEN_TOP,
  DEFAULT_ADD_SUPPORTS, DEFAULT_PLINTH_ANGLE, DEFAULT_RAISE_BY, DEFAULT_SUPPORT_SIZE, DEFAULT_SUPPORT_TIP_SIZE,
  DEFAULT_SUPPORT_SPACING, DEFAULT_SCAFFOLDING_ENABLED, DEFAULT_SCAFFOLDING_ANGLE, DEFAULT_RAFT_HEIGHT,
} from '../defaults.ts'

export interface PlinthConfig {
  shape: Shape
  ngonSides: number
  width: number
  depth: number
  height: number
  lockedAspect: boolean
  topAngle: number
  topAnglePreset: number | 'custom'
  roundStyle: RoundStyle
  roundLocation: RoundLocation
  roundSize: number
  trimEnabled: boolean
  trimSource: TrimSource
  trimSections: TrimSection[]
  trimHeight: number
  trimSize: number
  trimLinked: boolean
  addHole: boolean
  holeDiameter: number
  holeDepth: number
  hollowEnabled: boolean
  topThickness: number
  hollowWallThickness: number
  suctionHoleEnabled: boolean
  suctionHoleDiameter: number
  baseInsertEnabled: boolean
  baseInsertId: string
  baseInsertWidth: number
  baseInsertLength: number
  baseInsertDepth: number
  baseInsertTolerance: number
  addDrillJig: boolean
  jigWallSize: number
  jigHeight: number
  jigOverlap: number
  jigTolerance: number
  jigLift: boolean
  jigFlattenTop: boolean
  jigDiffHole: boolean
  jigHoleDiameter: number
  addSupports: boolean
  plinthAngle: number
  raiseBy: number
  supportSize: number
  supportTipSize: number
  supportSpacing: number
  scaffoldingEnabled: boolean
  scaffoldingAngle: number
  raftHeight: number
}

export interface SavedConfig {
  id: string
  name: string
  savedAt: number
  config: PlinthConfig
}

export const DEFAULT_PLINTH_CONFIG: PlinthConfig = {
  shape: DEFAULT_SHAPE,
  ngonSides: DEFAULT_NGON_SIDES,
  width: DEFAULT_WIDTH,
  depth: DEFAULT_DEPTH,
  height: DEFAULT_HEIGHT,
  lockedAspect: DEFAULT_LOCKED_ASPECT,
  topAngle: DEFAULT_TOP_ANGLE,
  topAnglePreset: DEFAULT_TOP_ANGLE,
  roundStyle: DEFAULT_ROUND_STYLE,
  roundLocation: DEFAULT_ROUND_LOCATION,
  roundSize: DEFAULT_ROUND_SIZE,
  trimEnabled: DEFAULT_TRIM_ENABLED,
  trimSource: { kind: 'preset', id: DEFAULT_TRIM_PROFILE_ID },
  trimSections: getPresetSections(DEFAULT_TRIM_PROFILE_ID),
  trimHeight: DEFAULT_TRIM_HEIGHT,
  trimSize: DEFAULT_TRIM_SIZE,
  trimLinked: DEFAULT_TRIM_LINKED,
  addHole: DEFAULT_ADD_HOLE,
  holeDiameter: DEFAULT_HOLE_DIAMETER,
  holeDepth: DEFAULT_HOLE_DEPTH,
  hollowEnabled: DEFAULT_HOLLOW_ENABLED,
  topThickness: DEFAULT_HOLLOW_TOP_THICKNESS,
  hollowWallThickness: DEFAULT_HOLLOW_WALL_THICKNESS,
  suctionHoleEnabled: DEFAULT_SUCTION_HOLE_ENABLED,
  suctionHoleDiameter: DEFAULT_SUCTION_HOLE_DIAMETER,
  baseInsertEnabled: DEFAULT_BASE_INSERT_ENABLED,
  baseInsertId: DEFAULT_BASE_INSERT_ID,
  baseInsertWidth: getGamingBase(DEFAULT_BASE_INSERT_ID).width,
  baseInsertLength: getGamingBase(DEFAULT_BASE_INSERT_ID).length,
  baseInsertDepth: DEFAULT_BASE_INSERT_DEPTH,
  baseInsertTolerance: DEFAULT_BASE_INSERT_TOLERANCE,
  addDrillJig: DEFAULT_ADD_DRILL_JIG,
  jigWallSize: DEFAULT_JIG_WALL_SIZE,
  jigHeight: DEFAULT_JIG_HEIGHT,
  jigOverlap: DEFAULT_JIG_OVERLAP,
  jigTolerance: DEFAULT_JIG_TOLERANCE,
  jigLift: DEFAULT_JIG_LIFT,
  jigFlattenTop: DEFAULT_JIG_FLATTEN_TOP,
  jigDiffHole: false,
  jigHoleDiameter: DEFAULT_HOLE_DIAMETER,
  addSupports: DEFAULT_ADD_SUPPORTS,
  plinthAngle: DEFAULT_PLINTH_ANGLE,
  raiseBy: DEFAULT_RAISE_BY,
  supportSize: DEFAULT_SUPPORT_SIZE,
  supportTipSize: DEFAULT_SUPPORT_TIP_SIZE,
  supportSpacing: DEFAULT_SUPPORT_SPACING,
  scaffoldingEnabled: DEFAULT_SCAFFOLDING_ENABLED,
  scaffoldingAngle: DEFAULT_SCAFFOLDING_ANGLE,
  raftHeight: DEFAULT_RAFT_HEIGHT,
}

const STORAGE_KEY = 'plinthgenerator.savedConfigs'

export const CONFIG_STORE_FORMAT = 'plinthgenerator-configs'
export const CONFIG_STORE_VERSION = 1

export interface ConfigStore {
  format: typeof CONFIG_STORE_FORMAT
  version: number
  configs: SavedConfig[]
}

type StoreData = Record<string, unknown>

const STORE_MIGRATIONS: Record<number, (store: StoreData) => StoreData> = {
  0: (store) => ({ ...store, version: 1 }),
}

const SHAPES: Shape[] = ['rectangle', 'ellipse', 'ngon']
const ROUND_STYLES: RoundStyle[] = ['none', 'chamfer', 'fillet']
const ROUND_LOCATIONS: RoundLocation[] = ['top', 'edges', 'both']

function isTrimSource(value: unknown): value is TrimSource {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (candidate.kind === 'preset' || candidate.kind === 'custom') && typeof candidate.id === 'string'
}

function isValidField(key: keyof PlinthConfig, value: unknown): boolean {
  switch (key) {
    case 'shape': return SHAPES.includes(value as Shape)
    case 'roundStyle': return ROUND_STYLES.includes(value as RoundStyle)
    case 'roundLocation': return ROUND_LOCATIONS.includes(value as RoundLocation)
    case 'topAnglePreset': return value === 'custom' || (typeof value === 'number' && Number.isFinite(value))
    case 'trimSource': return isTrimSource(value)
    case 'baseInsertId': return isGamingBaseId(value)
    case 'trimSections': return Array.isArray(value) && value.length > 0 && value.every(isSection)
    default: {
      const expected = typeof DEFAULT_PLINTH_CONFIG[key]
      return typeof value === expected && (expected !== 'number' || Number.isFinite(value))
    }
  }
}

export function parsePlinthConfig(value: unknown): PlinthConfig {
  const stored = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const config: Record<string, unknown> = { ...DEFAULT_PLINTH_CONFIG }
  for (const key of Object.keys(DEFAULT_PLINTH_CONFIG) as Array<keyof PlinthConfig>) {
    if (isValidField(key, stored[key])) config[key] = stored[key]
  }
  return config as unknown as PlinthConfig
}

export function plinthConfigsEqual(configA: PlinthConfig, configB: PlinthConfig): boolean {
  return (Object.keys(DEFAULT_PLINTH_CONFIG) as Array<keyof PlinthConfig>)
    .every((key) => JSON.stringify(configA[key]) === JSON.stringify(configB[key]))
}

function isSavedConfig(value: unknown): value is { id: string; name: string; savedAt: number; config: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.savedAt === 'number'
}

export function readConfigStore(data: unknown): { configs: SavedConfig[]; migrated: boolean } {
  let store: StoreData
  if (Array.isArray(data)) {
    store = { format: CONFIG_STORE_FORMAT, version: 0, configs: data }
  } else if (typeof data === 'object' && data !== null && (data as StoreData).format === CONFIG_STORE_FORMAT) {
    store = data as StoreData
  } else {
    throw new Error('This file is not a plinth config.')
  }
  if (typeof store.version !== 'number' || !Number.isInteger(store.version) || store.version < 0) {
    throw new Error('This plinth config has an unknown version.')
  }
  if (store.version > CONFIG_STORE_VERSION) {
    throw new Error('This plinth config was made by a newer version of the app. Reload the page and try again.')
  }
  const originalVersion = store.version
  while ((store.version as number) < CONFIG_STORE_VERSION) store = STORE_MIGRATIONS[store.version as number](store)
  const configs = Array.isArray(store.configs) ? store.configs.filter(isSavedConfig) : []
  return {
    configs: configs.map((saved) => ({ id: saved.id, name: saved.name, savedAt: saved.savedAt, config: parsePlinthConfig(saved.config) })),
    migrated: originalVersion !== CONFIG_STORE_VERSION,
  }
}

export function parseConfigStore(text: string): SavedConfig[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  const { configs } = readConfigStore(parsed)
  if (configs.length === 0) throw new Error('This file does not contain any plinth configs.')
  return configs
}

export function serializeConfigStore(configs: SavedConfig[]): string {
  const store: ConfigStore = { format: CONFIG_STORE_FORMAT, version: CONFIG_STORE_VERSION, configs }
  return JSON.stringify(store, null, 2)
}

export function loadSavedConfigs(): SavedConfig[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const { configs, migrated } = readConfigStore(JSON.parse(stored))
    if (migrated) storeSavedConfigs(configs)
    return configs
  } catch {
    return []
  }
}

export function storeSavedConfigs(configs: SavedConfig[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeConfigStore(configs))
  } catch {
    return
  }
}

export function configFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'plinth-config'}.plinth.json`
}
