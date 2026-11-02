import * as THREE from 'three'
import type { PlinthParams } from './geometryBuilder.ts'
import { ngonDepthRatio, ngonVertices, pointInConvexPolygon } from './ngon.ts'

export type GamingBaseOutline = 'ellipse' | 'rectangle' | 'hexagon'

export interface GamingBase {
  id: string
  name: string
  outline: GamingBaseOutline
  width: number
  length: number
}

function round(diameter: number): GamingBase {
  return { id: `round-${diameter}`, name: `${diameter}mm Round`, outline: 'ellipse', width: diameter, length: diameter }
}

function oval(width: number, length: number): GamingBase {
  return { id: `oval-${width}x${length}`, name: `${width} × ${length}mm Oval`, outline: 'ellipse', width, length }
}

function square(size: number): GamingBase {
  return { id: `square-${size}`, name: `${size}mm Square`, outline: 'rectangle', width: size, length: size }
}

function rectangle(width: number, length: number): GamingBase {
  return { id: `rectangle-${width}x${length}`, name: `${width} × ${length}mm Rectangle`, outline: 'rectangle', width, length }
}

function hex(inches: number, acrossFlats: number): GamingBase {
  return { id: `hex-${acrossFlats}`, name: `${inches}" Hex (${acrossFlats}mm)`, outline: 'hexagon', width: acrossFlats, length: acrossFlats }
}

export const GAMING_BASES: GamingBase[] = [
  round(25), round(28), round(28.5), round(32), round(40), round(50), round(60), round(80), round(90), round(100), round(130),
  oval(60, 35), oval(75, 42), oval(90, 52), oval(105, 70), oval(120, 92),
  square(20), square(25), square(40), square(50),
  rectangle(25, 50), rectangle(50, 25), rectangle(50, 100), rectangle(100, 50),
  hex(1, 25.4), hex(1.25, 31.75),
]

export function getGamingBase(id: string): GamingBase {
  return GAMING_BASES.find((base) => base.id === id) ?? GAMING_BASES[0]
}

export function isGamingBaseId(id: unknown): boolean {
  return GAMING_BASES.some((base) => base.id === id)
}

export const HEXAGON_SIDES = 6

export function hasSingleSize(base: GamingBase): boolean {
  return base.outline === 'hexagon' || (base.outline === 'ellipse' && base.width === base.length)
}

export function hexagonAcrossCorners(acrossFlats: number): number {
  return acrossFlats / ngonDepthRatio(HEXAGON_SIDES)
}

const FIT_CHECK_SEGMENTS = 64
const FIT_MARGIN_MM = 0.5

export function baseInsertOutline(outline: GamingBaseOutline, width: number, length: number, segments: number): THREE.Vector2[] {
  const halfWidth = width / 2
  const halfLength = length / 2
  if (outline === 'hexagon') return ngonVertices(HEXAGON_SIDES, hexagonAcrossCorners(length), length)
  if (outline === 'rectangle') {
    return [
      new THREE.Vector2(-halfWidth, -halfLength),
      new THREE.Vector2(halfWidth, -halfLength),
      new THREE.Vector2(halfWidth, halfLength),
      new THREE.Vector2(-halfWidth, halfLength),
    ]
  }
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2
    return new THREE.Vector2(halfWidth * Math.cos(angle), halfLength * Math.sin(angle))
  })
}

export function baseInsertFits(p: PlinthParams): boolean {
  const angleRad = p.angleTop ? (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180 : 0
  const cosAngle = Math.cos(angleRad)
  const halfWidth = p.width / 2 - FIT_MARGIN_MM
  const halfDepth = p.depth / 2 - FIT_MARGIN_MM
  const plinthVertices = p.shape === 'ngon' ? ngonVertices(p.ngonSides, p.width, p.depth) : null
  const tolerance = Math.max(0, p.baseInsertTolerance)
  const outline = baseInsertOutline(p.baseInsertOutline, p.baseInsertWidth + tolerance, p.baseInsertLength + tolerance, FIT_CHECK_SEGMENTS)
  return outline.every((point) => {
    const x = point.x
    const z = point.y * cosAngle
    if (plinthVertices) return pointInConvexPolygon(plinthVertices, x, z, FIT_MARGIN_MM)
    if (p.shape === 'ellipse') return (x / halfWidth) ** 2 + (z / halfDepth) ** 2 <= 1
    return Math.abs(x) <= halfWidth && Math.abs(z) <= halfDepth
  })
}
