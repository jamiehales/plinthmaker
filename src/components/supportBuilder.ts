import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Brush, Evaluator, ADDITION } from 'three-bvh-csg'
import { type Shape, type PlinthParams, type SupportParams, RENDER_BASE_SEGMENT_MM, suctionHoleZ, topDrop } from './geometryBuilder.ts'
import { sampleTrimOffset, getTrimProfile } from './trimProfiles.ts'
import {
  DEFAULT_CONE_START_GAP, DEFAULT_RAFT_HEIGHT, DEFAULT_RAFT_BOTTOM_INSET,
  DEFAULT_CONE_TIP_PENETRATION, DEFAULT_SUPPORT_OFFSET_EDGE, DEFAULT_SUPPORT_OFFSET_CAVITY, DEFAULT_SUPPORT_CAPS,
  DEFAULT_SCAFFOLDING_SCALE, DEFAULT_SCAFFOLDING_GAP_TOLERANCE,
} from '../defaults.ts'

const CONE_START_GAP = DEFAULT_CONE_START_GAP
const RAFT_HEIGHT = DEFAULT_RAFT_HEIGHT
const RAFT_BOTTOM_INSET = DEFAULT_RAFT_BOTTOM_INSET
const CONE_TIP_PENETRATION = DEFAULT_CONE_TIP_PENETRATION
const SUPPORT_OFFSET_EDGE = DEFAULT_SUPPORT_OFFSET_EDGE
const SUPPORT_OFFSET_CAVITY = DEFAULT_SUPPORT_OFFSET_CAVITY
const SUPPORT_CAPS = DEFAULT_SUPPORT_CAPS
const SCAFFOLDING_SCALE = DEFAULT_SCAFFOLDING_SCALE
const SCAFFOLDING_GAP_TOLERANCE = DEFAULT_SCAFFOLDING_GAP_TOLERANCE

export function trimFootprintOffset(p: PlinthParams): number {
  if (!p.trimEnabled || p.trimSize <= 0 || p.trimHeight <= 0) return 0
  const profile = p.trimProfileId === 'custom' && p.customTrimPoints
    ? { id: 'custom', name: 'Custom', interpolate: 'bezier' as const, points: p.customTrimPoints }
    : getTrimProfile(p.trimProfileId)
  return p.trimSize * sampleTrimOffset(profile, 0)
}

function isSupportOverCavity(
  p: THREE.Vector3,
  supportRadius: number,
  tipRadius: number,
  plinthParams: PlinthParams,
  cosT: number,
): boolean {
  if (!plinthParams.hollowEnabled) return false
  const wall = Math.max(0.5, plinthParams.hollowWallThickness)
  const hw = Math.max(0.01, (plinthParams.width - 2 * wall) / 2)
  const hd = Math.max(0.01, (plinthParams.depth - 2 * wall) / 2)
  const zLocal = p.z / Math.max(0.01, cosT)
  const maxRadius = Math.max(supportRadius, tipRadius)

  if (plinthParams.shape === 'ellipse') {
    const ex = hw - maxRadius
    const ez = hd - maxRadius
    if (ex <= 0 || ez <= 0) return false
    return (p.x * p.x) / (ex * ex) + (zLocal * zLocal) / (ez * ez) <= 1
  }

  return Math.abs(p.x) + maxRadius <= hw && Math.abs(zLocal) + maxRadius <= hd
}

interface CavityParams {
  shape: Shape
  hw: number
  hd: number
  hollowHeight: number
  plinthDepth: number
  topTanA: number
  raise: number
  sinT: number
  cosT: number
  tanT: number
}

function cavityCeilingHeight(xW: number, zW: number, c: CavityParams): number {
  void xW
  const denom = c.cosT - c.sinT * c.topTanA
  const safeDenom = Math.max(0.01, Math.abs(denom)) * Math.sign(denom || 1)
  return c.raise + (c.hollowHeight - (c.plinthDepth / 2) * c.topTanA - zW * (c.sinT + c.cosT * c.topTanA)) / safeDenom
}

function cavityWallHeight(xW: number, zW: number, c: CavityParams): number {
  if (Math.abs(c.sinT) < 1e-6) return Infinity
  const safeCosT = Math.max(0.01, c.cosT)
  const ceilingAtZL = (zL: number) => c.hollowHeight - (zL + c.plinthDepth / 2) * c.topTanA

  if (c.shape === 'ellipse') {
    const xTerm = (xW * xW) / (c.hw * c.hw)
    if (xTerm >= 1) return Infinity
    const dz = c.hd * Math.sqrt(1 - xTerm)
    const hits: Array<{ yL: number; zL: number }> = [
      { yL: (zW + dz * c.cosT) / c.sinT, zL: -dz },
      { yL: (zW - dz * c.cosT) / c.sinT, zL: dz },
    ]
    let yWall = Infinity
    for (const { yL, zL } of hits) {
      if (yL >= 0 && yL <= ceilingAtZL(zL)) {
        const yW = c.raise + yL / safeCosT - zW * c.tanT
        if (yW < yWall) yWall = yW
      }
    }
    return yWall
  }

  const hits: Array<{ yL: number; zL: number }> = [
    { yL: (zW + c.hd * c.cosT) / c.sinT, zL: -c.hd },
    { yL: (zW - c.hd * c.cosT) / c.sinT, zL: c.hd },
  ]
  let yWall = Infinity
  for (const { yL, zL } of hits) {
    if (yL >= 0 && yL <= ceilingAtZL(zL)) {
      const yW = c.raise + yL / safeCosT - zW * c.tanT
      if (yW < yWall) yWall = yW
    }
  }
  return yWall
}

function cavityIntersectionHeight(xW: number, zW: number, c: CavityParams): number {
  return Math.min(cavityCeilingHeight(xW, zW, c), cavityWallHeight(xW, zW, c))
}

function cavityCeilingNormalZ(c: CavityParams): number {
  const ny = c.cosT - c.sinT * c.topTanA
  const nz = c.sinT + c.cosT * c.topTanA
  const len = Math.hypot(ny, nz)
  if (len < 1e-6) return 0
  return -nz / len
}

function cavityCeilingNormal(c: CavityParams): THREE.Vector3 {
  const ny = c.cosT - c.sinT * c.topTanA
  const nz = c.sinT + c.cosT * c.topTanA
  const len = Math.hypot(ny, nz)
  if (len < 1e-6) return new THREE.Vector3(0, -1, 0)
  return new THREE.Vector3(0, -ny / len, -nz / len)
}

function cavityWallNormalZ(xW: number, zW: number, c: CavityParams): number | null {
  if (Math.abs(c.sinT) < 1e-6) return null
  const safeCosT = Math.max(0.01, c.cosT)
  const ceilingAtZL = (zL: number) => c.hollowHeight - (zL + c.plinthDepth / 2) * c.topTanA

  if (c.shape === 'ellipse') {
    const xTerm = (xW * xW) / (c.hw * c.hw)
    if (xTerm >= 1) return null
    const dz = c.hd * Math.sqrt(1 - xTerm)
    const hits: Array<{ yL: number; zL: number; xL: number }> = [
      { yL: (zW + dz * c.cosT) / c.sinT, zL: -dz, xL: xW },
      { yL: (zW - dz * c.cosT) / c.sinT, zL: dz, xL: xW },
    ]
    let best: { yW: number; zL: number; xL: number } | null = null
    for (const { yL, zL, xL } of hits) {
      if (yL >= 0 && yL <= ceilingAtZL(zL)) {
        const yW = c.raise + yL / safeCosT - zW * c.tanT
        if (!best || yW < best.yW) best = { yW, zL, xL }
      }
    }
    if (!best) return null
    const localN = new THREE.Vector3(best.xL / (c.hw * c.hw), 0, best.zL / (c.hd * c.hd))
    const len = localN.length()
    if (len < 1e-9) return null
    return (localN.z / len) * c.cosT
  }

  const hits: Array<{ yL: number; zL: number; side: number }> = [
    { yL: (zW + c.hd * c.cosT) / c.sinT, zL: -c.hd, side: -1 },
    { yL: (zW - c.hd * c.cosT) / c.sinT, zL: c.hd, side: 1 },
  ]
  let best: { yW: number; side: number } | null = null
  for (const { yL, zL, side } of hits) {
    if (yL >= 0 && yL <= ceilingAtZL(zL)) {
      const yW = c.raise + yL / safeCosT - zW * c.tanT
      if (!best || yW < best.yW) best = { yW, side }
    }
  }
  if (!best) return null
  return best.side * c.cosT
}

function cavityWallNormal(xW: number, zW: number, c: CavityParams): THREE.Vector3 | null {
  if (Math.abs(c.sinT) < 1e-6) return null
  const safeCosT = Math.max(0.01, c.cosT)
  const ceilingAtZL = (zL: number) => c.hollowHeight - (zL + c.plinthDepth / 2) * c.topTanA

  if (c.shape === 'ellipse') {
    const xTerm = (xW * xW) / (c.hw * c.hw)
    if (xTerm >= 1) return null
    const dz = c.hd * Math.sqrt(1 - xTerm)
    const hits: Array<{ yL: number; zL: number; xL: number }> = [
      { yL: (zW + dz * c.cosT) / c.sinT, zL: -dz, xL: xW },
      { yL: (zW - dz * c.cosT) / c.sinT, zL: dz, xL: xW },
    ]
    let best: { yW: number; zL: number; xL: number } | null = null
    for (const { yL, zL, xL } of hits) {
      if (yL >= 0 && yL <= ceilingAtZL(zL)) {
        const yW = c.raise + yL / safeCosT - zW * c.tanT
        if (!best || yW < best.yW) best = { yW, zL, xL }
      }
    }
    if (!best) return null
    const localN = new THREE.Vector3(best.xL / (c.hw * c.hw), 0, best.zL / (c.hd * c.hd)).normalize()
    return new THREE.Vector3(localN.x, -localN.z * c.sinT, localN.z * c.cosT)
  }

  const hits: Array<{ yL: number; zL: number; side: number }> = [
    { yL: (zW + c.hd * c.cosT) / c.sinT, zL: -c.hd, side: -1 },
    { yL: (zW - c.hd * c.cosT) / c.sinT, zL: c.hd, side: 1 },
  ]
  let best: { yW: number; side: number } | null = null
  for (const { yL, zL, side } of hits) {
    if (yL >= 0 && yL <= ceilingAtZL(zL)) {
      const yW = c.raise + yL / safeCosT - zW * c.tanT
      if (!best || yW < best.yW) best = { yW, side }
    }
  }
  if (!best) return null
  return new THREE.Vector3(0, -best.side * c.sinT, best.side * c.cosT)
}

function supportSurfaceNormal(pt: THREE.Vector3, overCavityFlag: boolean, c: CavityParams | null, sinT: number, cosT: number): THREE.Vector3 {
  if (overCavityFlag && c) {
    const wallN = cavityWallNormal(pt.x, pt.z, c)
    if (wallN) {
      const yCeil = cavityCeilingHeight(pt.x, pt.z, c)
      const yWall = cavityWallHeight(pt.x, pt.z, c)
      if (yWall <= yCeil + 1e-6) return wallN
    }
    return cavityCeilingNormal(c)
  }
  if (c) return new THREE.Vector3(0, -c.cosT, -c.sinT)
  return new THREE.Vector3(0, -cosT, -sinT)
}

function supportNormalZ(p: THREE.Vector3, overCavityFlag: boolean, c: CavityParams | null, sinT: number): number {
  if (overCavityFlag && c) {
    const wallNz = cavityWallNormalZ(p.x, p.z, c)
    if (wallNz !== null) {
      const yCeil = cavityCeilingHeight(p.x, p.z, c)
      const yWall = cavityWallHeight(p.x, p.z, c)
      if (yWall <= yCeil + 1e-6) return wallNz
    }
    return cavityCeilingNormalZ(c)
  }
  return -sinT
}

function applySupportOffset(
  positions: THREE.Vector3[],
  overCavity: boolean[] | null,
  cavityParams: CavityParams | null,
  sinT: number,
  tanT: number,
  raise: number,
  offsetCavity: number,
): { basePositions: THREE.Vector3[]; tipPositions: THREE.Vector3[]; contactHeights: number[] } {
  const basePositions = positions.map((p, i) => {
    const overCavityFlag = overCavity ? overCavity[i] : false
    const nz = supportNormalZ(p, overCavityFlag, cavityParams, sinT)
    const amount = overCavityFlag ? offsetCavity : SUPPORT_OFFSET_EDGE
    const dz = amount * nz
    return new THREE.Vector3(p.x, p.y, p.z + dz)
  })
  const tipPositions = positions
  const contactHeights = tipPositions.map((p) => raise - p.z * tanT)
  return { basePositions, tipPositions, contactHeights }
}

export function makeBaseOutlinePoints(shape: Shape, w: number, d: number, segMM: number, trimOffset = 0): THREE.Vector3[] {
  const ew = w + 2 * trimOffset
  const ed = d + 2 * trimOffset
  if (shape === 'ellipse') {
    const hw = Math.max(0.01, ew / 2)
    const hd = Math.max(0.01, ed / 2)
    const perim = Math.PI * (3 * (hw + hd) - Math.sqrt((3 * hw + hd) * (hw + 3 * hd)))
    const n = Math.max(16, Math.ceil(perim / segMM))
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(new THREE.Vector3(hw * Math.cos(a), 0, hd * Math.sin(a)))
    }
    return pts
  }
  const hw = Math.max(0.01, ew / 2)
  const hd = Math.max(0.01, ed / 2)
  return [
    new THREE.Vector3(-hw, 0, -hd),
    new THREE.Vector3(hw, 0, -hd),
    new THREE.Vector3(hw, 0, hd),
    new THREE.Vector3(-hw, 0, hd),
  ]
}

function makeEllipseOutline(w: number, d: number, n: number, cosT: number): THREE.Vector3[] {
  const hw = Math.max(0.01, w / 2)
  const hd = Math.max(0.01, d / 2) * cosT
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push(new THREE.Vector3(hw * Math.cos(a), 0, hd * Math.sin(a)))
  }
  return pts
}

export function makeInsetOutlinePoints(shape: Shape, w: number, d: number, inset: number, segMM: number, trimOffset = 0): THREE.Vector3[] {
  const iw = Math.max(0.01, w + 2 * trimOffset - 2 * inset)
  const id = Math.max(0.01, d + 2 * trimOffset - 2 * inset)
  return makeBaseOutlinePoints(shape, iw, id, segMM)
}

export function projectToGround(points: THREE.Vector3[], cosT: number): THREE.Vector3[] {
  return points.map((p) => new THREE.Vector3(p.x, 0, p.z * cosT))
}

export function perimeterLength(points: THREE.Vector3[]): number {
  let len = 0
  for (let i = 0; i < points.length; i++) {
    len += points[i].distanceTo(points[(i + 1) % points.length])
  }
  return len
}

export function equidistantPoints(points: THREE.Vector3[], n: number): THREE.Vector3[] {
  const m = points.length
  const cum: number[] = [0]
  for (let i = 0; i < m; i++) {
    cum.push(cum[i] + points[i].distanceTo(points[(i + 1) % m]))
  }
  const total = cum[m]
  if (total < 1e-6) return []
  const step = total / n
  const out: THREE.Vector3[] = []
  let seg = 0
  for (let i = 0; i < n; i++) {
    const target = i * step
    while (seg < m && cum[seg + 1] < target) seg++
    const segStart = cum[seg]
    const segEnd = cum[seg + 1]
    const t = segEnd - segStart < 1e-6 ? 0 : (target - segStart) / (segEnd - segStart)
    const a = points[seg]
    const b = points[(seg + 1) % m]
    out.push(new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t))
  }
  return out
}

function cumulativeArcLength(points: THREE.Vector3[]): number[] {
  const m = points.length
  const cum: number[] = [0]
  for (let i = 0; i < m; i++) {
    cum.push(cum[i] + points[i].distanceTo(points[(i + 1) % m]))
  }
  return cum
}

function pointAtArcLength(points: THREE.Vector3[], cum: number[], arc: number): THREE.Vector3 {
  const m = points.length
  const total = cum[m]
  let a = arc
  while (a < 0) a += total
  while (a >= total) a -= total
  let seg = 0
  while (seg < m && cum[seg + 1] < a) seg++
  const segStart = cum[seg]
  const segEnd = cum[seg + 1]
  const t = segEnd - segStart < 1e-6 ? 0 : (a - segStart) / (segEnd - segStart)
  const pa = points[seg]
  const pb = points[(seg + 1) % m]
  return new THREE.Vector3(pa.x + (pb.x - pa.x) * t, 0, pa.z + (pb.z - pa.z) * t)
}

function nearestArcLength(points: THREE.Vector3[], cum: number[], target: THREE.Vector3): number {
  const m = points.length
  let bestDist = Infinity
  let bestArc = 0
  for (let i = 0; i < m; i++) {
    const a = points[i]
    const b = points[(i + 1) % m]
    const segLen = cum[i + 1] - cum[i]
    if (segLen < 1e-9) continue
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * (b.x - a.x) + (target.z - a.z) * (b.z - a.z)) / (segLen * segLen)))
    const px = a.x + (b.x - a.x) * t
    const pz = a.z + (b.z - a.z) * t
    const dist = (px - target.x) * (px - target.x) + (pz - target.z) * (pz - target.z)
    if (dist < bestDist) {
      bestDist = dist
      bestArc = cum[i] + t * segLen
    }
  }
  return bestArc
}

function computeOuterRingAnchors(shape: Shape, w: number, d: number, inset: number, cosT: number, trimOffset = 0): THREE.Vector3[] {
  const iw = Math.max(0.01, w + 2 * trimOffset - 2 * inset)
  const id = Math.max(0.01, d + 2 * trimOffset - 2 * inset)
  const hw = iw / 2
  const hd = (id / 2) * cosT
  if (shape === 'ellipse') {
    return [
      new THREE.Vector3(hw, 0, 0),
      new THREE.Vector3(0, 0, hd),
      new THREE.Vector3(-hw, 0, 0),
      new THREE.Vector3(0, 0, -hd),
    ]
  }
  return [
    new THREE.Vector3(-hw, 0, -hd),
    new THREE.Vector3(hw, 0, -hd),
    new THREE.Vector3(hw, 0, hd),
    new THREE.Vector3(-hw, 0, hd),
  ]
}

export function equidistantPointsWithAnchors(points: THREE.Vector3[], anchors: THREE.Vector3[], spacing: number): THREE.Vector3[] {
  const m = points.length
  const cum = cumulativeArcLength(points)
  const total = cum[m]
  if (total < 1e-6) return []
  if (anchors.length === 0) return equidistantPoints(points, Math.max(4, Math.round(total / spacing)))

  const anchorArcs = anchors.map((a) => nearestArcLength(points, cum, a)).sort((x, y) => x - y)
  const k = anchorArcs.length
  const positions: THREE.Vector3[] = []
  for (let i = 0; i < k; i++) {
    const startArc = anchorArcs[i]
    const endArc = i + 1 < k ? anchorArcs[i + 1] : anchorArcs[0] + total
    const segLen = endArc - startArc
    if (segLen <= 1e-6) continue
    const count = Math.max(1, Math.ceil(segLen / spacing))
    const step = segLen / count
    for (let j = 0; j < count; j++) {
      positions.push(pointAtArcLength(points, cum, startArc + j * step))
    }
  }
  return positions
}

export function buildSupportCircles(positions: THREE.Vector3[], radius: number, segs: number): THREE.BufferGeometry {
  const vertCount = positions.length * segs * 2
  const arr = new Float32Array(vertCount * 3)
  let o = 0
  for (const p of positions) {
    for (let j = 0; j < segs; j++) {
      const a1 = (j / segs) * Math.PI * 2
      const a2 = ((j + 1) / segs) * Math.PI * 2
      arr[o++] = p.x + Math.cos(a1) * radius
      arr[o++] = 0
      arr[o++] = p.z + Math.sin(a1) * radius
      arr[o++] = p.x + Math.cos(a2) * radius
      arr[o++] = 0
      arr[o++] = p.z + Math.sin(a2) * radius
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  return geo
}

function buildSupportMesh(basePositions: THREE.Vector3[], tipPositions: THREE.Vector3[], supportRadius: number, tipRadius: number, contactHeights: number[], overCavity: boolean[] | null, cavityParams: CavityParams | null, sinT: number, cosT: number, segs: number, caps: boolean): THREE.BufferGeometry {
  if (basePositions.length === 0) return new THREE.BufferGeometry()
  const verts: number[] = []
  const indices: number[] = []

  for (let i = 0; i < basePositions.length; i++) {
    const pb = basePositions[i]
    const pt = tipPositions[i]
    const supportOverCavity = overCavity ? overCavity[i] : false
    const yContactCenter = supportOverCavity && cavityParams
      ? cavityIntersectionHeight(pt.x, pt.z, cavityParams)
      : contactHeights[i]
    const yConeStart = yContactCenter - CONE_START_GAP
    if (yConeStart <= RAFT_HEIGHT) continue

    const baseVtx = verts.length / 3

    verts.push(pb.x, RAFT_HEIGHT, pb.z)
    const centerVtx = baseVtx
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      verts.push(pb.x + cx * supportRadius, RAFT_HEIGHT, pb.z + cz * supportRadius)
    }
    const ring0Vtx = baseVtx + 1
    if (caps) {
      for (let j = 0; j < segs; j++) {
        const jn = (j + 1) % segs
        indices.push(centerVtx, ring0Vtx + jn, ring0Vtx + j)
      }
    }
    const ring1Vtx = ring0Vtx + segs
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      verts.push(pb.x + cx * supportRadius, yConeStart, pb.z + cz * supportRadius)
    }
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs
      indices.push(ring0Vtx + j, ring1Vtx + j, ring1Vtx + jn)
      indices.push(ring0Vtx + j, ring1Vtx + jn, ring0Vtx + jn)
    }
    const ring2Vtx = ring1Vtx + segs
    const surfaceNormal = supportSurfaceNormal(pt, supportOverCavity, cavityParams, sinT, cosT).normalize()
    const contactPoint = new THREE.Vector3(pt.x, yContactCenter, pt.z)
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const groundDir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
      const planeDir = groundDir.clone().addScaledVector(surfaceNormal, -groundDir.dot(surfaceNormal))
      if (planeDir.lengthSq() < 1e-12) planeDir.set(1, 0, 0)
      planeDir.normalize()
      const tipX = contactPoint.x + planeDir.x * tipRadius
      const tipY = contactPoint.y + planeDir.y * tipRadius
      const tipZ = contactPoint.z + planeDir.z * tipRadius
      verts.push(tipX, tipY, tipZ)
    }
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs
      indices.push(ring1Vtx + j, ring2Vtx + j, ring2Vtx + jn)
      indices.push(ring1Vtx + j, ring2Vtx + jn, ring1Vtx + jn)
    }
    if (caps) {
      const tipCenterVtx = verts.length / 3
      verts.push(pt.x, yContactCenter, pt.z)
      for (let j = 0; j < segs; j++) {
        const jn = (j + 1) % segs
        indices.push(tipCenterVtx, ring2Vtx + jn, ring2Vtx + j)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildRaftMesh(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segMM: number): THREE.BufferGeometry {
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const cosT = Math.cos(tilt)
  const expand = supportParams.supportSize + 5
  const trimOff = trimFootprintOffset(plinthParams)

  const topW = plinthParams.width + 2 * trimOff + expand
  const topD = plinthParams.depth + 2 * trimOff + expand
  const botW = topW - 2 * RAFT_BOTTOM_INSET
  const botD = topD - 2 * RAFT_BOTTOM_INSET

  const topPts = projectToGround(makeBaseOutlinePoints(shape, topW, topD, segMM), cosT)
  const n = topPts.length
  const botPtsRaw = shape === 'ellipse'
    ? makeEllipseOutline(botW, botD, n, cosT)
    : makeBaseOutlinePoints(shape, botW, botD, segMM)
  const botPts = shape === 'ellipse' ? botPtsRaw : projectToGround(makeBaseOutlinePoints(shape, botW, botD, segMM), cosT)
  if (n < 3 || botPts.length !== n) return new THREE.BufferGeometry()

  const verts: number[] = []
  const indices: number[] = []

  for (const p of botPts) verts.push(p.x, 0, p.z)
  for (const p of topPts) verts.push(p.x, RAFT_HEIGHT, p.z)
  const botBase = 0
  const topBase = n

  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n
    indices.push(botBase + i, topBase + i, topBase + ni)
    indices.push(botBase + i, topBase + ni, botBase + ni)
  }

  const centerTopVtx = verts.length / 3
  verts.push(0, RAFT_HEIGHT, 0)
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n
    indices.push(centerTopVtx, topBase + ni, topBase + i)
  }

  const centerBotVtx = verts.length / 3
  verts.push(0, 0, 0)
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n
    indices.push(centerBotVtx, botBase + i, botBase + ni)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(parts: Array<number | string | boolean>): number {
  let h = 2166136261
  for (const part of parts) {
    const v = typeof part === 'number' ? Math.round(part * 1000) : part
    const s = String(v)
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

function pointInFootprint(shape: Shape, x: number, z: number, hw: number, hd: number): boolean {
  if (hw <= 0 || hd <= 0) return false
  if (shape === 'ellipse') {
    const nx = x / hw
    const nz = z / hd
    return nx * nx + nz * nz <= 1
  }
  return Math.abs(x) <= hw && Math.abs(z) <= hd
}

function inAnyExclusion(x: number, z: number, exclusions: Array<{ cx: number, cz: number, rx: number, rz: number }>): boolean {
  for (const e of exclusions) {
    const dx = x - e.cx
    const dz = z - e.cz
    if ((dx * dx) / (e.rx * e.rx) + (dz * dz) / (e.rz * e.rz) <= 1) return true
  }
  return false
}

function sampleInteriorPoisson(
  shape: Shape,
  hw: number,
  hd: number,
  minDist: number,
  ringPoints: THREE.Vector3[],
  exclusions: Array<{ cx: number, cz: number, rx: number, rz: number }>,
  seed: number,
): THREE.Vector3[] {
  if (hw <= 0 || hd <= 0 || minDist <= 0) return []
  const rng = mulberry32(seed)
  const cell = minDist / Math.SQRT2
  const cols = Math.max(1, Math.ceil((2 * hw) / cell))
  const rows = Math.max(1, Math.ceil((2 * hd) / cell))
  const grid: (THREE.Vector3 | null)[] = new Array(cols * rows).fill(null)
  const x0 = -hw
  const z0 = -hd
  const toIdx = (x: number, z: number): number => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / cell)))
    const cz = Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / cell)))
    return cz * cols + cx
  }
  const points: THREE.Vector3[] = []
  const active: THREE.Vector3[] = []

  const maxDim = Math.max(hw, hd)
  const exclusionMargin = minDist
  for (const e of exclusions) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * Math.max(e.rx, e.rz)) / minDist))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = 1 + exclusionMargin / Math.max(e.rx, e.rz)
      const x = e.cx + Math.cos(a) * e.rx * r
      const z = e.cz + Math.sin(a) * e.rz * r
      if (!pointInFootprint(shape, x, z, hw, hd)) continue
      if (inAnyExclusion(x, z, exclusions)) continue
      const p = new THREE.Vector3(x, 0, z)
      points.push(p)
      active.push(p)
      grid[toIdx(x, z)] = p
    }
  }

  const ringMinDist2 = minDist * minDist
  for (let i = 0; i < ringPoints.length; i++) {
    const rp = ringPoints[i]
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((rp.x - x0) / cell)))
    const cz = Math.min(rows - 1, Math.max(0, Math.floor((rp.z - z0) / cell)))
    for (let gz = Math.max(0, cz - 2); gz <= Math.min(rows - 1, cz + 2); gz++) {
      for (let gx = Math.max(0, cx - 2); gx <= Math.min(cols - 1, cx + 2); gx++) {
        const g = grid[gz * cols + gx]
        if (g && g.distanceToSquared(rp) < ringMinDist2) {
          grid[gz * cols + gx] = null
          const idx = points.indexOf(g)
          if (idx >= 0) points.splice(idx, 1)
          const aidx = active.indexOf(g)
          if (aidx >= 0) active.splice(aidx, 1)
        }
      }
    }
  }

  if (active.length === 0 && points.length === 0) {
    let placed = false
    for (let tries = 0; tries < 30 && !placed; tries++) {
      const x = (rng() * 2 - 1) * hw
      const z = (rng() * 2 - 1) * hd
      if (!pointInFootprint(shape, x, z, hw, hd)) continue
      if (inAnyExclusion(x, z, exclusions)) continue
      let tooClose = false
      for (const rp of ringPoints) {
        const dx = x - rp.x
        const dz = z - rp.z
        if (dx * dx + dz * dz < ringMinDist2) { tooClose = true; break }
      }
      if (tooClose) continue
      const p = new THREE.Vector3(x, 0, z)
      points.push(p)
      active.push(p)
      grid[toIdx(x, z)] = p
      placed = true
    }
    if (!placed) return points
  }

  const k = 30
  const r2 = minDist * minDist
  let iterations = 0
  const maxIterations = 20000
  while (active.length > 0 && iterations < maxIterations) {
    iterations++
    const idx = Math.floor(rng() * active.length)
    const base = active[idx]
    let found = false
    for (let j = 0; j < k; j++) {
      const a = rng() * Math.PI * 2
      const rad = minDist + rng() * minDist
      const x = base.x + Math.cos(a) * rad
      const z = base.z + Math.sin(a) * rad
      if (!pointInFootprint(shape, x, z, hw, hd)) continue
      if (inAnyExclusion(x, z, exclusions)) continue
      let tooClose = false
      for (const rp of ringPoints) {
        const dx = x - rp.x
        const dz = z - rp.z
        if (dx * dx + dz * dz < ringMinDist2) { tooClose = true; break }
      }
      if (tooClose) continue
      const cx = Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / cell)))
      const cz = Math.min(rows - 1, Math.max(0, Math.floor((z - z0) / cell)))
      let neighborTooClose = false
      for (let gz = Math.max(0, cz - 2); gz <= Math.min(rows - 1, cz + 2); gz++) {
        for (let gx = Math.max(0, cx - 2); gx <= Math.min(cols - 1, cx + 2); gx++) {
          const g = grid[gz * cols + gx]
          if (g && g !== base) {
            const dx = x - g.x
            const dz = z - g.z
            if (dx * dx + dz * dz < r2) { neighborTooClose = true; break }
          }
        }
        if (neighborTooClose) break
      }
      if (neighborTooClose) continue
      const p = new THREE.Vector3(x, 0, z)
      points.push(p)
      active.push(p)
      grid[cz * cols + cx] = p
      found = true
      break
    }
    if (!found) {
      active.splice(idx, 1)
    }
  }

  void maxDim
  return points
}

function computeRingPositionsAroundOutline(shape: Shape, ringW: number, ringD: number, spacing: number, cosT: number, segMM: number, centerZ: number, ensurePlusZ: boolean): THREE.Vector3[] {
  const ringLocal = makeBaseOutlinePoints(shape, ringW, ringD, segMM)
  const ringProjected = projectToGround(ringLocal, cosT)
  const perim = perimeterLength(ringProjected)
  if (perim < 1e-6) return []

  const anchors = computeOuterRingAnchors(shape, ringW, ringD, 0, cosT)
  const ringPositions = equidistantPointsWithAnchors(ringProjected, anchors, spacing)

  if (ensurePlusZ) {
    const plusZMin = new THREE.Vector3(0, 0, (ringD / 2) * cosT)
    if (!ringPositions.some((p) => p.distanceTo(plusZMin) < spacing * 0.25)) {
      ringPositions.push(plusZMin)
    }
  }

  return ringPositions.map((p) => new THREE.Vector3(p.x, 0, p.z + centerZ))
}

function computeCavityEdgeRingPositions(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, cosT: number, segMM: number): THREE.Vector3[] {
  if (!plinthParams.hollowEnabled) return []
  const tipRadius = supportParams.supportTipSize / 2
  const wall = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityW = Math.max(0.1, plinthParams.width - 2 * wall)
  const cavityD = Math.max(0.1, plinthParams.depth - 2 * wall)
  const expand = tipRadius + CONE_TIP_PENETRATION
  const ringW = cavityW + 2 * expand
  const ringD = cavityD + 2 * expand
  if (ringW > plinthParams.width || ringD > plinthParams.depth) return []

  return computeRingPositionsAroundOutline(shape, ringW, ringD, supportParams.supportSpacing, cosT, segMM, 0, false)
}

function computeHoleEdgeRingPositions(plinthParams: PlinthParams, supportParams: SupportParams, cosT: number, sinT: number, segMM: number): THREE.Vector3[] {
  if (!plinthParams.addHole || !plinthParams.hollowEnabled) return []
  const topThickness = plinthParams.height - plinthParams.hollowHeight
  if (plinthParams.holeDepth < topThickness) return []
  const supportRadius = supportParams.supportSize / 2
  const holeRadius = Math.max(0.05, plinthParams.holeDiameter / 2)
  const ringRadius = holeRadius + supportRadius + CONE_TIP_PENETRATION
  const ringW = ringRadius * 2
  const ringD = ringRadius * 2
  if (ringW > plinthParams.width || ringD > plinthParams.depth) return []

  const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
  const drop = topDrop(plinthParams)
  const ceilingLocalY = hollowHeight - drop / 2
  const holeZWorld = ceilingLocalY * sinT
  return computeRingPositionsAroundOutline('ellipse', ringW, ringD, supportParams.supportSpacing, cosT, segMM, holeZWorld, true)
}

function computeSuctionHoleEdgeRingPositions(plinthParams: PlinthParams, supportParams: SupportParams, cosT: number, sinT: number, segMM: number): THREE.Vector3[] {
  if (!plinthParams.hollowEnabled || !plinthParams.suctionHoleEnabled) return []
  const supportRadius = supportParams.supportSize / 2
  const suctionRadius = Math.max(0.05, plinthParams.suctionHoleDiameter / 2)
  const ringRadius = suctionRadius + supportRadius + CONE_TIP_PENETRATION
  const ringW = ringRadius * 2
  const ringD = ringRadius * 2
  if (ringW > plinthParams.width || ringD > plinthParams.depth) return []

  const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
  const suctionZ = suctionHoleZ(plinthParams)
  const angleRad = plinthParams.angleTop
    ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
    : 0
  const tanA = Math.tan(angleRad)
  const d = Math.max(0.1, plinthParams.depth)
  const ceilingLocalY = hollowHeight - (suctionZ + d / 2) * tanA
  const holeZWorld = ceilingLocalY * sinT + suctionZ * cosT
  return computeRingPositionsAroundOutline('ellipse', ringW, ringD, supportParams.supportSpacing, cosT, segMM, holeZWorld, true)
}

export function computeSupportPositions(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segMM: number): THREE.Vector3[] {
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  if (radius <= 0) return []
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const cosT = Math.cos(tilt)

  const trimOff = trimFootprintOffset(plinthParams)
  const insetLocal = makeInsetOutlinePoints(shape, plinthParams.width, plinthParams.depth, tipRadius + CONE_TIP_PENETRATION, segMM, trimOff)
  const insetProjected = projectToGround(insetLocal, cosT)
  const perim = perimeterLength(insetProjected)
  if (perim < 1e-6) return []

  const anchors = computeOuterRingAnchors(shape, plinthParams.width, plinthParams.depth, tipRadius + CONE_TIP_PENETRATION, cosT, trimOff)
  const ringPositions = equidistantPointsWithAnchors(insetProjected, anchors, supportParams.supportSpacing)

  const cavityRingPositions = computeCavityEdgeRingPositions(shape, plinthParams, supportParams, cosT, segMM)
  const sinT = Math.sin(tilt)
  const holeRingPositions = computeHoleEdgeRingPositions(plinthParams, supportParams, cosT, sinT, segMM)
  const suctionRingPositions = computeSuctionHoleEdgeRingPositions(plinthParams, supportParams, cosT, sinT, segMM)

  const ringPositionsAll = ringPositions.concat(cavityRingPositions, holeRingPositions, suctionRingPositions)

  const exclusions: Array<{ cx: number, cz: number, rx: number, rz: number }> = []
  if (plinthParams.addHole && plinthParams.hollowEnabled) {
    const topThickness = plinthParams.height - plinthParams.hollowHeight
    if (plinthParams.holeDepth >= topThickness) {
      const holeRadius = Math.max(0.05, plinthParams.holeDiameter / 2)
      const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
      const drop = topDrop(plinthParams)
      const ceilingLocalY = hollowHeight - drop / 2
      const holeZWorld = ceilingLocalY * sinT
      const rx = holeRadius + radius
      exclusions.push({ cx: 0, cz: holeZWorld, rx, rz: rx * cosT })
    }
  }
  if (plinthParams.hollowEnabled && plinthParams.suctionHoleEnabled) {
    const suctionRadius = Math.max(0.05, plinthParams.suctionHoleDiameter / 2)
    const suctionZ = suctionHoleZ(plinthParams)
    const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
    const angleRad = plinthParams.angleTop
      ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
      : 0
    const tanA = Math.tan(angleRad)
    const d = Math.max(0.1, plinthParams.depth)
    const ceilingLocalY = hollowHeight - (suctionZ + d / 2) * tanA
    const holeZWorld = ceilingLocalY * sinT + suctionZ * cosT
    const rx = suctionRadius + radius
    exclusions.push({ cx: 0, cz: holeZWorld, rx, rz: rx * cosT })
  }

  const inset = tipRadius + CONE_TIP_PENETRATION
  const interiorHW = Math.max(0, (plinthParams.width + 2 * trimOff) / 2 - inset)
  const interiorHD = Math.max(0, (plinthParams.depth + 2 * trimOff) / 2 * cosT - inset * cosT)

  const seedParts: Array<number | string | boolean> = [
    shape,
    plinthParams.width, plinthParams.depth, plinthParams.height,
    plinthParams.addHole, plinthParams.holeDiameter, plinthParams.holeDepth,
    plinthParams.hollowEnabled, plinthParams.hollowHeight, plinthParams.hollowWallThickness,
    plinthParams.suctionHoleEnabled, plinthParams.suctionHoleDiameter,
    plinthParams.trimEnabled, plinthParams.trimSize, plinthParams.trimHeight, plinthParams.trimProfileId,
    supportParams.supportSize, supportParams.supportTipSize,
    supportParams.supportSpacing, supportParams.interiorSpacing,
    supportParams.plinthAngle,
  ]
  const seed = hashSeed(seedParts)

  const interiorPositions = sampleInteriorPoisson(
    shape,
    interiorHW,
    interiorHD,
    supportParams.interiorSpacing,
    ringPositionsAll,
    exclusions,
    seed,
  )

  return ringPositionsAll.concat(interiorPositions)
}

function createStrutCylinder(start: THREE.Vector3, end: THREE.Vector3, radius: number, segs: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(end, start)
  const length = dir.length()
  if (length < 1e-6) return new THREE.BufferGeometry()
  const geo = new THREE.CylinderGeometry(radius, radius, length, segs)
  geo.deleteAttribute('uv')
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const up = new THREE.Vector3(0, 1, 0)
  const normDir = dir.clone().normalize()
  const quat = new THREE.Quaternion().setFromUnitVectors(up, normDir)
  const matrix = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1))
  geo.applyMatrix4(matrix)
  return geo
}

function segmentsIntersect2D(
  a1x: number, a1z: number, a2x: number, a2z: number,
  b1x: number, b1z: number, b2x: number, b2z: number,
): boolean {
  const d1 = (b2x - b1x) * (a1z - b1z) - (b2z - b1z) * (a1x - b1x)
  const d2 = (b2x - b1x) * (a2z - b1z) - (b2z - b1z) * (a2x - b1x)
  const d3 = (a2x - a1x) * (b1z - a1z) - (a2z - a1z) * (b1x - a1x)
  const d4 = (a2x - a1x) * (b2z - a1z) - (a2z - a1z) * (b2x - a1x)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return false
}

function pointToSegmentDistance2D(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  let t = lenSq < 1e-12 ? 0 : ((px - ax) * dx + (pz - az) * dz) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + t * dx
  const cz = az + t * dz
  const ex = px - cx
  const ez = pz - cz
  return Math.sqrt(ex * ex + ez * ez)
}

function segmentToSegmentMinDistance2D(
  a1x: number, a1z: number, a2x: number, a2z: number,
  b1x: number, b1z: number, b2x: number, b2z: number,
): number {
  if (segmentsIntersect2D(a1x, a1z, a2x, a2z, b1x, b1z, b2x, b2z)) return 0
  const d1 = pointToSegmentDistance2D(a1x, a1z, b1x, b1z, b2x, b2z)
  const d2 = pointToSegmentDistance2D(a2x, a2z, b1x, b1z, b2x, b2z)
  const d3 = pointToSegmentDistance2D(b1x, b1z, a1x, a1z, a2x, a2z)
  const d4 = pointToSegmentDistance2D(b2x, b2z, a1x, a1z, a2x, a2z)
  return Math.min(d1, d2, d3, d4)
}

function aabbOverlaps(
  minAx: number, minAz: number, maxAx: number, maxAz: number,
  minBx: number, minBz: number, maxBx: number, maxBz: number,
): boolean {
  return minAx <= maxBx && maxAx >= minBx && minAz <= maxBz && maxAz >= minBz
}

export function buildScaffoldingMesh(
  basePositions: THREE.Vector3[],
  tipPositions: THREE.Vector3[],
  overCavity: boolean[] | null,
  contactHeights: number[],
  cavityParams: CavityParams | null,
  supportSize: number,
  supportSpacing: number,
  scaffoldingAngle: number,
  segs: number,
): THREE.BufferGeometry {
  if (basePositions.length < 2 || scaffoldingAngle <= 0 || scaffoldingAngle >= 90) return new THREE.BufferGeometry()

  const yConeStarts: number[] = []
  for (let i = 0; i < basePositions.length; i++) {
    const pt = tipPositions[i]
    const supportOverCavity = overCavity ? overCavity[i] : false
    const yContactCenter = supportOverCavity && cavityParams
      ? cavityIntersectionHeight(pt.x, pt.z, cavityParams)
      : contactHeights[i]
    yConeStarts.push(yContactCenter - CONE_START_GAP)
  }

  const angleRad = (scaffoldingAngle * Math.PI) / 180
  const tanAngle = Math.tan(angleRad)
  const strutRadius = (SCAFFOLDING_SCALE * supportSize) / 2
  const supportRadius = supportSize / 2
  const maxDist = supportSize + supportSpacing + SCAFFOLDING_GAP_TOLERANCE
  const supportClearance = strutRadius + supportRadius + SCAFFOLDING_GAP_TOLERANCE
  const strutClearance = 2 * strutRadius + SCAFFOLDING_GAP_TOLERANCE

  const geometries: THREE.BufferGeometry[] = []
  const acceptedPairs: Array<[number, number]> = []

  for (let i = 0; i < basePositions.length; i++) {
    for (let j = i + 1; j < basePositions.length; j++) {
      if (overCavity && overCavity[i] !== overCavity[j]) continue

      const pi = basePositions[i]
      const pj = basePositions[j]
      const dx = pj.x - pi.x
      const dz = pj.z - pi.z
      const centerDist = Math.sqrt(dx * dx + dz * dz)
      if (centerDist < 1e-6 || centerDist > maxDist) continue

      const segMinX = Math.min(pi.x, pj.x) - supportClearance
      const segMaxX = Math.max(pi.x, pj.x) + supportClearance
      const segMinZ = Math.min(pi.z, pj.z) - supportClearance
      const segMaxZ = Math.max(pi.z, pj.z) + supportClearance

      let blocked = false
      for (let k = 0; k < basePositions.length; k++) {
        if (k === i || k === j) continue
        const pk = basePositions[k]
        if (pk.x < segMinX || pk.x > segMaxX || pk.z < segMinZ || pk.z > segMaxZ) continue
        if (pointToSegmentDistance2D(pk.x, pk.z, pi.x, pi.z, pj.x, pj.z) < supportClearance) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      const candMinX = Math.min(pi.x, pj.x) - strutClearance
      const candMaxX = Math.max(pi.x, pj.x) + strutClearance
      const candMinZ = Math.min(pi.z, pj.z) - strutClearance
      const candMaxZ = Math.max(pi.z, pj.z) + strutClearance

      let overlaps = false
      for (const [a, b] of acceptedPairs) {
        if (a === i || a === j || b === i || b === j) continue
        const pa = basePositions[a]
        const pb = basePositions[b]
        const accMinX = Math.min(pa.x, pb.x) - strutClearance
        const accMaxX = Math.max(pa.x, pb.x) + strutClearance
        const accMinZ = Math.min(pa.z, pb.z) - strutClearance
        const accMaxZ = Math.max(pa.z, pb.z) + strutClearance
        if (!aabbOverlaps(candMinX, candMinZ, candMaxX, candMaxZ, accMinX, accMinZ, accMaxX, accMaxZ)) continue
        if (segmentToSegmentMinDistance2D(pi.x, pi.z, pj.x, pj.z, pa.x, pa.z, pb.x, pb.z) < strutClearance) {
          overlaps = true
          break
        }
      }
      if (overlaps) continue

      acceptedPairs.push([i, j])

      const yTop = Math.min(yConeStarts[i], yConeStarts[j])
      const H = yTop - RAFT_HEIGHT
      if (H <= 0) continue

      const rise = centerDist * tanAngle
      if (rise < 1e-6) continue
      const N = Math.ceil(H / rise)
      const actualRise = H / N

      for (let k = 0; k < N; k++) {
        const yStart = RAFT_HEIGHT + k * actualRise
        const yEnd = RAFT_HEIGHT + (k + 1) * actualRise

        let start: THREE.Vector3
        let end: THREE.Vector3
        if (k % 2 === 0) {
          start = new THREE.Vector3(pi.x, yStart, pi.z)
          end = new THREE.Vector3(pj.x, yEnd, pj.z)
        } else {
          start = new THREE.Vector3(pj.x, yStart, pj.z)
          end = new THREE.Vector3(pi.x, yEnd, pi.z)
        }

        const strutGeo = createStrutCylinder(start, end, strutRadius, segs)
        if (strutGeo.attributes.position.count > 0) {
          geometries.push(strutGeo)
        }
      }
    }
  }

  if (geometries.length === 0) return new THREE.BufferGeometry()
  const merged = mergeGeometries(geometries, false)
  for (const g of geometries) g.dispose()
  return merged ?? new THREE.BufferGeometry()
}

export function buildSupportMeshGeometry(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segs: number, includeScaffolding = false): THREE.BufferGeometry {
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const tanT = Math.tan(tilt)
  const cosT = Math.cos(tilt)
  const raise = RAFT_HEIGHT + supportParams.raiseBy + (plinthParams.depth / 2) * Math.sin(tilt)
  if (radius <= 0) return new THREE.BufferGeometry()

  const positionsRaw = computeSupportPositions(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const sinT = Math.sin(tilt)
  const wall = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityParams: CavityParams | null = plinthParams.hollowEnabled
    ? {
        shape,
        hw: Math.max(0.01, (plinthParams.width - 2 * wall) / 2),
        hd: Math.max(0.01, (plinthParams.depth - 2 * wall) / 2),
        hollowHeight: Math.max(0.1, plinthParams.hollowHeight),
        plinthDepth: Math.max(0.1, plinthParams.depth),
        topTanA: plinthParams.angleTop ? Math.tan((Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180) : 0,
        raise,
        sinT,
        cosT,
        tanT,
      }
    : null
  const overCavity = plinthParams.hollowEnabled
    ? positionsRaw.map((p) => isSupportOverCavity(p, radius, tipRadius, plinthParams, cosT))
    : null
  const { basePositions, tipPositions, contactHeights } = applySupportOffset(positionsRaw, overCavity, cavityParams, sinT, tanT, raise, supportParams.supportOffsetCavity ?? SUPPORT_OFFSET_CAVITY)
  const supportGeo = buildSupportMesh(basePositions, tipPositions, radius, tipRadius, contactHeights, overCavity, cavityParams, sinT, cosT, segs, supportParams.supportCaps ?? SUPPORT_CAPS)
  const raftGeo = buildRaftMesh(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)

  const normSupport = supportGeo.index ? supportGeo.toNonIndexed() : supportGeo.clone()
  const normRaft = raftGeo.index ? raftGeo.toNonIndexed() : raftGeo.clone()
  const mergeGeos: THREE.BufferGeometry[] = [normSupport, normRaft]

  let scaffoldGeo: THREE.BufferGeometry | null = null
  if (includeScaffolding && supportParams.scaffoldingEnabled) {
    scaffoldGeo = buildScaffoldingMesh(basePositions, tipPositions, overCavity, contactHeights, cavityParams, supportParams.supportSize, supportParams.supportSpacing, supportParams.scaffoldingAngle, segs)
    if (scaffoldGeo.attributes.position.count > 0) {
      mergeGeos.push(scaffoldGeo.index ? scaffoldGeo.toNonIndexed() : scaffoldGeo.clone())
    }
  }

  const merged = mergeGeometries(mergeGeos, false)
  normSupport.dispose()
  normRaft.dispose()
  if (scaffoldGeo) scaffoldGeo.dispose()
  if (!merged) return supportGeo
  supportGeo.dispose()
  raftGeo.dispose()
  return merged
}

function csgUnion(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const stripToPosition = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone()
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', nonIndexed.attributes.position.clone())
    out.computeVertexNormals()
    nonIndexed.dispose()
    return out
  }

  const aGeo = stripToPosition(a)
  const bGeo = stripToPosition(b)
  const aBrush = new Brush(aGeo)
  aBrush.updateMatrixWorld(true)
  const bBrush = new Brush(bGeo)
  bBrush.updateMatrixWorld(true)

  const evaluator = new Evaluator()
  ;(evaluator as unknown as { useCDTClipping: boolean }).useCDTClipping = true
  evaluator.attributes = ['position', 'normal']
  evaluator.useGroups = false
  const result = evaluator.evaluate(aBrush, bBrush, ADDITION)

  aGeo.dispose()
  bGeo.dispose()
  return result.geometry
}

export function buildSupportMeshGeometryUnioned(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segs: number): THREE.BufferGeometry {
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const tanT = Math.tan(tilt)
  const cosT = Math.cos(tilt)
  const raise = RAFT_HEIGHT + supportParams.raiseBy + (plinthParams.depth / 2) * Math.sin(tilt)
  if (radius <= 0) return new THREE.BufferGeometry()

  const positionsRaw = computeSupportPositions(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const sinT = Math.sin(tilt)
  const wall = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityParams: CavityParams | null = plinthParams.hollowEnabled
    ? {
        shape,
        hw: Math.max(0.01, (plinthParams.width - 2 * wall) / 2),
        hd: Math.max(0.01, (plinthParams.depth - 2 * wall) / 2),
        hollowHeight: Math.max(0.1, plinthParams.hollowHeight),
        plinthDepth: Math.max(0.1, plinthParams.depth),
        topTanA: plinthParams.angleTop ? Math.tan((Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180) : 0,
        raise,
        sinT,
        cosT,
        tanT,
      }
    : null
  const overCavity = plinthParams.hollowEnabled
    ? positionsRaw.map((p) => isSupportOverCavity(p, radius, tipRadius, plinthParams, cosT))
    : null
  const { basePositions, tipPositions, contactHeights } = applySupportOffset(positionsRaw, overCavity, cavityParams, sinT, tanT, raise, supportParams.supportOffsetCavity ?? SUPPORT_OFFSET_CAVITY)
  const supportGeo = buildSupportMesh(basePositions, tipPositions, radius, tipRadius, contactHeights, overCavity, cavityParams, sinT, cosT, segs, supportParams.supportCaps ?? SUPPORT_CAPS)
  const raftGeo = buildRaftMesh(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const unioned = csgUnion(supportGeo, raftGeo)
  supportGeo.dispose()
  raftGeo.dispose()
  return unioned
}

export function applyYUpToZUp(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4()
  matrix.makeRotationX(Math.PI / 2)
  const out = geometry.clone()
  out.applyMatrix4(matrix)
  out.computeVertexNormals()
  return out
}

export function applySupportTransform(geometry: THREE.BufferGeometry, supportParams: SupportParams, plinthDepth: number): THREE.BufferGeometry {
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const raise = RAFT_HEIGHT + supportParams.raiseBy + (plinthDepth / 2) * Math.sin(tilt)
  const matrix = new THREE.Matrix4()
  matrix.makeRotationX(tilt)
  matrix.setPosition(0, raise, 0)
  const out = geometry.clone()
  out.applyMatrix4(matrix)
  out.computeVertexNormals()
  return out
}

export function unionGeometries(plinthGeometry: THREE.BufferGeometry, supportGeometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return csgUnion(plinthGeometry, supportGeometry)
}

export function mergePlinthWithSupports(plinthGeometry: THREE.BufferGeometry, supportGeometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (supportGeometry.attributes.position.count === 0) return plinthGeometry
  const stripToPosition = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone()
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', nonIndexed.attributes.position.clone())
    out.computeVertexNormals()
    nonIndexed.dispose()
    return out
  }

  const normalizedPlinth = stripToPosition(plinthGeometry)
  const normalizedSupport = stripToPosition(supportGeometry)

  const merged = mergeGeometries([normalizedPlinth, normalizedSupport], false)
  normalizedPlinth.dispose()
  normalizedSupport.dispose()
  if (!merged) return plinthGeometry
  return merged
}