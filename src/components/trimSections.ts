import type { TrimHandle, TrimProfilePoint } from './trimProfiles.ts'

export type TrimSectionType = 'band' | 'chamfer' | 'curve' | 'ogee'

export interface TrimSection {
  type: TrimSectionType
  height: number
  depth: number
  flipped: boolean
}

export type TrimDimension = 'height' | 'depth'

export interface CustomTrimProfile {
  id: string
  name: string
  sections: TrimSection[]
}

export type TrimSource = { kind: 'preset'; id: string } | { kind: 'custom'; id: string }

export const TRIM_SECTION_TYPES: TrimSectionType[] = ['band', 'chamfer', 'curve', 'ogee']

export const TRIM_SECTION_TYPE_NAMES: Record<TrimSectionType, string> = {
  band: 'Band',
  chamfer: 'Chamfer',
  curve: 'Curve',
  ogee: 'Ogee',
}

export const TRIM_SECTION_DIRECTIONS: Partial<Record<TrimSectionType, [string, string]>> = {
  band: ['Rise, then step', 'Step, then rise'],
  curve: ['Round', 'Cove'],
  ogee: ['Round below', 'Cove below'],
}

export function canFlipSection(type: TrimSectionType): boolean {
  return TRIM_SECTION_DIRECTIONS[type] !== undefined
}

export function describeSection(section: TrimSection): string {
  if (section.type === 'band') return section.flipped ? 'Band, step first' : 'Band'
  if (section.type === 'curve') return section.flipped ? 'Cove' : 'Round'
  if (section.type === 'ogee') return section.flipped ? 'Reverse ogee' : 'Ogee'
  return TRIM_SECTION_TYPE_NAMES[section.type]
}

function section(type: TrimSectionType, height: number, depth: number, flipped = false): TrimSection {
  return { type, height, depth, flipped }
}

export const TRIM_PRESET_SECTIONS: Record<string, TrimSection[]> = {
  chamfer: [section('band', 0.2, 0), section('chamfer', 0.8, 0.8), section('band', 0, 0.2)],
  quarterCircle: [section('curve', 1, 1)],
  stepped: [section('band', 0.5, 0.5), section('band', 0.5, 0.5)],
  bead: [section('band', 0.2, 0.2), section('curve', 0.6, 0.6), section('band', 0.2, 0.2)],
  cove: [section('band', 0.2, 0), section('curve', 0.8, 0.8, true), section('band', 0, 0.2)],
  ogee: [section('band', 0.1, 0.1), section('ogee', 0.8, 0.8), section('band', 0.1, 0.1)],
  romanOgee: [section('band', 0.15, 0), section('ogee', 0.7, 0.85, true), section('band', 0.15, 0.15)],
}

export function getPresetSections(id: string): TrimSection[] {
  return cloneSections(TRIM_PRESET_SECTIONS[id] ?? TRIM_PRESET_SECTIONS.bead)
}

export function cloneSections(sections: TrimSection[]): TrimSection[] {
  return sections.map((item) => ({ ...item }))
}

export function sectionsEqual(first: TrimSection[], second: TrimSection[]): boolean {
  if (first.length !== second.length) return false
  return first.every((item, index) => {
    const other = second[index]
    return item.type === other.type
      && item.flipped === other.flipped
      && Math.abs(item.height - other.height) < 1e-4
      && Math.abs(item.depth - other.depth) < 1e-4
  })
}

function normalizeDimension(sections: TrimSection[], dimension: TrimDimension): TrimSection[] {
  const total = sections.reduce((sum, item) => sum + item[dimension], 0)
  if (total <= 1e-9) return sections.map((item) => ({ ...item, [dimension]: 1 / sections.length }))
  return sections.map((item) => ({ ...item, [dimension]: item[dimension] / total }))
}

export function normalizeSections(sections: TrimSection[]): TrimSection[] {
  if (sections.length === 0) return sections
  return normalizeDimension(normalizeDimension(sections, 'height'), 'depth')
}

export function addSectionAtBottom(sections: TrimSection[]): TrimSection[] {
  const keep = sections.length / (sections.length + 1)
  const share = 1 / (sections.length + 1)
  return [section('band', share, share)]
    .concat(sections.map((item) => ({ ...item, height: item.height * keep, depth: item.depth * keep })))
}

export function duplicateSection(sections: TrimSection[], index: number): TrimSection[] {
  const next = sections.slice()
  next.splice(index + 1, 0, { ...sections[index] })
  return normalizeSections(next)
}

export function removeSection(sections: TrimSection[], index: number): TrimSection[] {
  if (sections.length <= 1) return sections
  return normalizeSections(sections.filter((_, position) => position !== index))
}

export function swapSections(sections: TrimSection[], index: number, otherIndex: number): TrimSection[] {
  if (otherIndex < 0 || otherIndex >= sections.length) return sections
  const next = sections.slice()
  next[index] = sections[otherIndex]
  next[otherIndex] = sections[index]
  return next
}

export function sharesDiffer(sections: TrimSection[]): boolean {
  return sections.some((item) => Math.abs(item.height - item.depth) > 0.005)
}

const KAPPA = 0.5523

interface ProfileDraftPoint {
  y: number
  offset: number
  section: number
  sharp: boolean
  inHandle: TrimHandle
  outHandle: TrimHandle
}

function zeroHandle(): TrimHandle {
  return { dy: 0, dOffset: 0 }
}

export function compileTrimSections(sections: TrimSection[]): TrimProfilePoint[] {
  const normalized = normalizeSections(sections)
  const points: ProfileDraftPoint[] = [{ y: 0, offset: 1, section: 0, sharp: true, inHandle: zeroHandle(), outHandle: zeroHandle() }]
  const lastPoint = () => points[points.length - 1]
  let section = 0

  const lineTo = (y: number, offset: number) => {
    const previous = lastPoint()
    if (Math.abs(previous.y - y) < 1e-9 && Math.abs(previous.offset - offset) < 1e-9) return
    points.push({ y, offset, section, sharp: true, inHandle: zeroHandle(), outHandle: zeroHandle() })
  }

  const curveTo = (y: number, offset: number, convex: boolean) => {
    const previous = lastPoint()
    const rise = y - previous.y
    const inset = previous.offset - offset
    if (rise < 1e-9 || inset < 1e-9) {
      lineTo(y, offset)
      return
    }
    const startHandle = convex ? { dy: KAPPA * rise, dOffset: 0 } : { dy: 0, dOffset: -KAPPA * inset }
    const endHandle = convex ? { dy: 0, dOffset: KAPPA * inset } : { dy: -KAPPA * rise, dOffset: 0 }
    if (previous.sharp && points.length === 1) {
      previous.sharp = false
      previous.outHandle = startHandle
    } else if (previous.sharp) {
      points.push({ y: previous.y, offset: previous.offset, section, sharp: false, inHandle: zeroHandle(), outHandle: startHandle })
    } else {
      previous.outHandle = startHandle
    }
    points.push({ y, offset, section, sharp: false, inHandle: endHandle, outHandle: zeroHandle() })
  }

  const closeCurve = () => {
    const previous = lastPoint()
    if (!previous.sharp) points.push({ y: previous.y, offset: previous.offset, section, sharp: true, inHandle: zeroHandle(), outHandle: zeroHandle() })
  }

  let y = 0
  let offset = 1
  for (const [index, item] of normalized.entries()) {
    section = index
    const top = y + item.height
    const inner = offset - item.depth
    if (item.type === 'band') {
      closeCurve()
      if (item.flipped) lineTo(y, inner)
      else lineTo(top, offset)
      lineTo(top, inner)
    } else if (item.type === 'chamfer') {
      closeCurve()
      lineTo(top, inner)
    } else if (item.type === 'curve') {
      curveTo(top, inner, !item.flipped)
      closeCurve()
    } else {
      const middleY = y + item.height / 2
      const middleOffset = offset - item.depth / 2
      curveTo(middleY, middleOffset, !item.flipped)
      curveTo(top, inner, item.flipped)
      closeCurve()
    }
    y = top
    offset = inner
  }
  closeCurve()
  lineTo(1, 0)

  return points.map((point) => ({
    y: point.y,
    offset: point.offset,
    section: point.section,
    sharp: point.sharp,
    inHandle: point.inHandle,
    outHandle: point.outHandle,
  }))
}

export interface TracedPoint {
  y: number
  offset: number
  section: number
}

function sectionShape(item: TrimSection): [number, number][] {
  const quarter = (fn: (angle: number) => [number, number]) => {
    const list: [number, number][] = []
    for (let step = 1; step <= 12; step++) list.push(fn((step / 12) * (Math.PI / 2)))
    return list
  }
  const round = (angle: number): [number, number] => [1 - Math.cos(angle), Math.sin(angle)]
  const cove = (angle: number): [number, number] => [Math.sin(angle), 1 - Math.cos(angle)]
  let shape: [number, number][]
  if (item.type === 'band') shape = [[0, 1], [1, 1]]
  else if (item.type === 'chamfer') shape = [[1, 1]]
  else if (item.type === 'curve') shape = quarter(round)
  else {
    shape = quarter((angle) => round(angle).map((value) => value / 2) as [number, number])
      .concat(quarter((angle) => cove(angle).map((value) => 0.5 + value / 2) as [number, number]))
  }
  if (!item.flipped || !canFlipSection(item.type)) return shape
  return shape.map(([inward, up]) => [up, inward])
}

export function traceSections(sections: TrimSection[]): TracedPoint[] {
  const normalized = normalizeSections(sections)
  const traced: TracedPoint[] = [{ y: 0, offset: 1, section: -1 }]
  let y = 0
  let offset = 1
  normalized.forEach((item, index) => {
    for (const [inward, up] of sectionShape(item)) {
      traced.push({ y: y + up * item.height, offset: offset - inward * item.depth, section: index })
    }
    y += item.height
    offset -= item.depth
  })
  return traced
}

export function sectionIconPath(type: TrimSectionType, flipped: boolean): string {
  const shape = sectionShape({ type, height: 1, depth: 1, flipped })
  return ['M17 17', ...shape.map(([inward, up]) => `L${(17 - inward * 14).toFixed(1)} ${(17 - up * 14).toFixed(1)}`)].join(' ')
}

const STORAGE_KEY = 'plinthgenerator.customTrimProfiles'

function isSection(value: unknown): value is TrimSection {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return TRIM_SECTION_TYPES.includes(candidate.type as TrimSectionType)
    && typeof candidate.height === 'number'
    && typeof candidate.depth === 'number'
    && typeof candidate.flipped === 'boolean'
}

function isCustomProfile(value: unknown): value is CustomTrimProfile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.sections)
    && candidate.sections.length > 0
    && candidate.sections.every(isSection)
}

export function loadCustomTrimProfiles(): CustomTrimProfile[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isCustomProfile) : []
  } catch {
    return []
  }
}

export function saveCustomTrimProfiles(profiles: CustomTrimProfile[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    return
  }
}
