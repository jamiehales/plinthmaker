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
  point: THREE.Vector3,
  supportRadius: number,
  tipRadius: number,
  plinthParams: PlinthParams,
  cosTilt: number,
): boolean {
  if (!plinthParams.hollowEnabled) return false
  const wallThickness = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityHalfWidth = Math.max(0.01, (plinthParams.width - 2 * wallThickness) / 2)
  const cavityHalfDepth = Math.max(0.01, (plinthParams.depth - 2 * wallThickness) / 2)
  const zLocal = point.z / Math.max(0.01, cosTilt)
  const maxRadius = Math.max(supportRadius, tipRadius)

  if (plinthParams.shape === 'ellipse') {
    const ellipseHalfWidth = cavityHalfWidth - maxRadius
    const ellipseHalfDepth = cavityHalfDepth - maxRadius
    if (ellipseHalfWidth <= 0 || ellipseHalfDepth <= 0) return false
    return (point.x * point.x) / (ellipseHalfWidth * ellipseHalfWidth) + (zLocal * zLocal) / (ellipseHalfDepth * ellipseHalfDepth) <= 1
  }

  return Math.abs(point.x) + maxRadius <= cavityHalfWidth && Math.abs(zLocal) + maxRadius <= cavityHalfDepth
}

interface CavityParams {
  shape: Shape
  cavityHalfWidth: number
  cavityHalfDepth: number
  hollowHeight: number
  plinthDepth: number
  topTanAngle: number
  raise: number
  sinTilt: number
  cosTilt: number
  tanTilt: number
}

function cavityCeilingHeight(xWorld: number, zWorld: number, cavity: CavityParams): number {
  void xWorld
  const denom = cavity.cosTilt - cavity.sinTilt * cavity.topTanAngle
  const safeDenom = Math.max(0.01, Math.abs(denom)) * Math.sign(denom || 1)
  return cavity.raise + (cavity.hollowHeight - (cavity.plinthDepth / 2) * cavity.topTanAngle - zWorld * (cavity.sinTilt + cavity.cosTilt * cavity.topTanAngle)) / safeDenom
}

function cavityWallHeight(xWorld: number, zWorld: number, cavity: CavityParams): number {
  if (Math.abs(cavity.sinTilt) < 1e-6) return Infinity
  const safeCosTilt = Math.max(0.01, cavity.cosTilt)
  const ceilingAtZLocal = (zLocal: number) => cavity.hollowHeight - (zLocal + cavity.plinthDepth / 2) * cavity.topTanAngle

  if (cavity.shape === 'ellipse') {
    const xTerm = (xWorld * xWorld) / (cavity.cavityHalfWidth * cavity.cavityHalfWidth)
    if (xTerm >= 1) return Infinity
    const halfDepthOffset = cavity.cavityHalfDepth * Math.sqrt(1 - xTerm)
    const hits: Array<{ yLocal: number; zLocal: number }> = [
      { yLocal: (zWorld + halfDepthOffset * cavity.cosTilt) / cavity.sinTilt, zLocal: -halfDepthOffset },
      { yLocal: (zWorld - halfDepthOffset * cavity.cosTilt) / cavity.sinTilt, zLocal: halfDepthOffset },
    ]
    let lowestWallHeight = Infinity
    for (const { yLocal, zLocal } of hits) {
      if (yLocal >= 0 && yLocal <= ceilingAtZLocal(zLocal)) {
        const yWorld = cavity.raise + yLocal / safeCosTilt - zWorld * cavity.tanTilt
        if (yWorld < lowestWallHeight) lowestWallHeight = yWorld
      }
    }
    return lowestWallHeight
  }

  const hits: Array<{ yLocal: number; zLocal: number }> = [
    { yLocal: (zWorld + cavity.cavityHalfDepth * cavity.cosTilt) / cavity.sinTilt, zLocal: -cavity.cavityHalfDepth },
    { yLocal: (zWorld - cavity.cavityHalfDepth * cavity.cosTilt) / cavity.sinTilt, zLocal: cavity.cavityHalfDepth },
  ]
  let lowestWallHeight = Infinity
  for (const { yLocal, zLocal } of hits) {
    if (yLocal >= 0 && yLocal <= ceilingAtZLocal(zLocal)) {
      const yWorld = cavity.raise + yLocal / safeCosTilt - zWorld * cavity.tanTilt
      if (yWorld < lowestWallHeight) lowestWallHeight = yWorld
    }
  }
  return lowestWallHeight
}

function cavityIntersectionHeight(xWorld: number, zWorld: number, cavity: CavityParams): number {
  return Math.min(cavityCeilingHeight(xWorld, zWorld, cavity), cavityWallHeight(xWorld, zWorld, cavity))
}

function cavityCeilingNormal(cavity: CavityParams): THREE.Vector3 {
  const normalY = cavity.cosTilt - cavity.sinTilt * cavity.topTanAngle
  const normalZ = cavity.sinTilt + cavity.cosTilt * cavity.topTanAngle
  const length = Math.hypot(normalY, normalZ)
  if (length < 1e-6) return new THREE.Vector3(0, -1, 0)
  return new THREE.Vector3(0, -normalY / length, -normalZ / length)
}

function cavityWallNormal(xWorld: number, zWorld: number, cavity: CavityParams): THREE.Vector3 | null {
  if (Math.abs(cavity.sinTilt) < 1e-6) return null
  const safeCosTilt = Math.max(0.01, cavity.cosTilt)
  const ceilingAtZLocal = (zLocal: number) => cavity.hollowHeight - (zLocal + cavity.plinthDepth / 2) * cavity.topTanAngle

  if (cavity.shape === 'ellipse') {
    const xTerm = (xWorld * xWorld) / (cavity.cavityHalfWidth * cavity.cavityHalfWidth)
    if (xTerm >= 1) return null
    const halfDepthOffset = cavity.cavityHalfDepth * Math.sqrt(1 - xTerm)
    const hits: Array<{ yLocal: number; zLocal: number; xLocal: number }> = [
      { yLocal: (zWorld + halfDepthOffset * cavity.cosTilt) / cavity.sinTilt, zLocal: -halfDepthOffset, xLocal: xWorld },
      { yLocal: (zWorld - halfDepthOffset * cavity.cosTilt) / cavity.sinTilt, zLocal: halfDepthOffset, xLocal: xWorld },
    ]
    let best: { yWorld: number; zLocal: number; xLocal: number } | null = null
    for (const { yLocal, zLocal, xLocal } of hits) {
      if (yLocal >= 0 && yLocal <= ceilingAtZLocal(zLocal)) {
        const yWorld = cavity.raise + yLocal / safeCosTilt - zWorld * cavity.tanTilt
        if (!best || yWorld < best.yWorld) best = { yWorld, zLocal, xLocal }
      }
    }
    if (!best) return null
    const localNormal = new THREE.Vector3(best.xLocal / (cavity.cavityHalfWidth * cavity.cavityHalfWidth), 0, best.zLocal / (cavity.cavityHalfDepth * cavity.cavityHalfDepth)).normalize()
    return new THREE.Vector3(localNormal.x, -localNormal.z * cavity.sinTilt, localNormal.z * cavity.cosTilt)
  }

  const hits: Array<{ yLocal: number; zLocal: number; side: number }> = [
    { yLocal: (zWorld + cavity.cavityHalfDepth * cavity.cosTilt) / cavity.sinTilt, zLocal: -cavity.cavityHalfDepth, side: -1 },
    { yLocal: (zWorld - cavity.cavityHalfDepth * cavity.cosTilt) / cavity.sinTilt, zLocal: cavity.cavityHalfDepth, side: 1 },
  ]
  let best: { yWorld: number; side: number } | null = null
  for (const { yLocal, zLocal, side } of hits) {
    if (yLocal >= 0 && yLocal <= ceilingAtZLocal(zLocal)) {
      const yWorld = cavity.raise + yLocal / safeCosTilt - zWorld * cavity.tanTilt
      if (!best || yWorld < best.yWorld) best = { yWorld, side }
    }
  }
  if (!best) return null
  return new THREE.Vector3(0, -best.side * cavity.sinTilt, best.side * cavity.cosTilt)
}

function supportSurfaceNormal(point: THREE.Vector3, overCavityFlag: boolean, cavity: CavityParams | null, sinTilt: number, cosTilt: number): THREE.Vector3 {
  if (overCavityFlag && cavity) {
    const wallNormal = cavityWallNormal(point.x, point.z, cavity)
    if (wallNormal) {
      const ceilingHeight = cavityCeilingHeight(point.x, point.z, cavity)
      const wallHeight = cavityWallHeight(point.x, point.z, cavity)
      if (wallHeight <= ceilingHeight + 1e-6) return wallNormal
    }
    return cavityCeilingNormal(cavity)
  }
  if (cavity) return new THREE.Vector3(0, -cavity.cosTilt, -cavity.sinTilt)
  return new THREE.Vector3(0, -cosTilt, -sinTilt)
}

function supportNormalXZ(point: THREE.Vector3, overCavityFlag: boolean, cavity: CavityParams | null, sinTilt: number): THREE.Vector3 {
  if (overCavityFlag && cavity) {
    const wallNormal = cavityWallNormal(point.x, point.z, cavity)
    if (wallNormal) {
      const ceilingHeight = cavityCeilingHeight(point.x, point.z, cavity)
      const wallHeight = cavityWallHeight(point.x, point.z, cavity)
      if (wallHeight <= ceilingHeight + 1e-6) return new THREE.Vector3(-wallNormal.x, 0, -wallNormal.z)
    }
    const ceilingNormal = cavityCeilingNormal(cavity)
    return new THREE.Vector3(0, 0, ceilingNormal.z)
  }
  return new THREE.Vector3(0, 0, -sinTilt)
}

function applySupportOffset(
  positions: THREE.Vector3[],
  overCavity: boolean[] | null,
  cavityParams: CavityParams | null,
  sinTilt: number,
  tanTilt: number,
  raise: number,
  offsetCavity: number,
): { basePositions: THREE.Vector3[]; tipPositions: THREE.Vector3[]; contactHeights: number[] } {
  const basePositions = positions.map((point, i) => {
    const overCavityFlag = overCavity ? overCavity[i] : false
    const normalXZ = supportNormalXZ(point, overCavityFlag, cavityParams, sinTilt)
    const amount = overCavityFlag ? offsetCavity : SUPPORT_OFFSET_EDGE
    return new THREE.Vector3(point.x + amount * normalXZ.x, point.y, point.z + amount * normalXZ.z)
  })
  const tipPositions = positions
  const contactHeights = tipPositions.map((point) => raise - point.z * tanTilt)
  return { basePositions, tipPositions, contactHeights }
}

export function makeBaseOutlinePoints(shape: Shape, width: number, depth: number, segMM: number, trimOffset = 0): THREE.Vector3[] {
  const expandedWidth = width + 2 * trimOffset
  const expandedDepth = depth + 2 * trimOffset
  if (shape === 'ellipse') {
    const halfWidth = Math.max(0.01, expandedWidth / 2)
    const halfDepth = Math.max(0.01, expandedDepth / 2)
    const perim = Math.PI * (3 * (halfWidth + halfDepth) - Math.sqrt((3 * halfWidth + halfDepth) * (halfWidth + 3 * halfDepth)))
    const segmentCount = Math.max(16, Math.ceil(perim / segMM))
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < segmentCount; i++) {
      const angle = (i / segmentCount) * Math.PI * 2
      pts.push(new THREE.Vector3(halfWidth * Math.cos(angle), 0, halfDepth * Math.sin(angle)))
    }
    return pts
  }
  const halfWidth = Math.max(0.01, expandedWidth / 2)
  const halfDepth = Math.max(0.01, expandedDepth / 2)
  return [
    new THREE.Vector3(-halfWidth, 0, -halfDepth),
    new THREE.Vector3(halfWidth, 0, -halfDepth),
    new THREE.Vector3(halfWidth, 0, halfDepth),
    new THREE.Vector3(-halfWidth, 0, halfDepth),
  ]
}

function makeEllipseOutline(width: number, depth: number, segmentCount: number, cosTilt: number): THREE.Vector3[] {
  const halfWidth = Math.max(0.01, width / 2)
  const halfDepth = Math.max(0.01, depth / 2) * cosTilt
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < segmentCount; i++) {
    const angle = (i / segmentCount) * Math.PI * 2
    pts.push(new THREE.Vector3(halfWidth * Math.cos(angle), 0, halfDepth * Math.sin(angle)))
  }
  return pts
}

export function makeInsetOutlinePoints(shape: Shape, width: number, depth: number, inset: number, segMM: number, trimOffset = 0): THREE.Vector3[] {
  const insetWidth = Math.max(0.01, width + 2 * trimOffset - 2 * inset)
  const insetDepth = Math.max(0.01, depth + 2 * trimOffset - 2 * inset)
  return makeBaseOutlinePoints(shape, insetWidth, insetDepth, segMM)
}

export function projectToGround(points: THREE.Vector3[], cosTilt: number): THREE.Vector3[] {
  return points.map((point) => new THREE.Vector3(point.x, 0, point.z * cosTilt))
}

export function perimeterLength(points: THREE.Vector3[]): number {
  let length = 0
  for (let i = 0; i < points.length; i++) {
    length += points[i].distanceTo(points[(i + 1) % points.length])
  }
  return length
}

export function equidistantPoints(points: THREE.Vector3[], count: number): THREE.Vector3[] {
  const pointCount = points.length
  const cumulative: number[] = [0]
  for (let i = 0; i < pointCount; i++) {
    cumulative.push(cumulative[i] + points[i].distanceTo(points[(i + 1) % pointCount]))
  }
  const total = cumulative[pointCount]
  if (total < 1e-6) return []
  const step = total / count
  const out: THREE.Vector3[] = []
  let segmentIndex = 0
  for (let i = 0; i < count; i++) {
    const target = i * step
    while (segmentIndex < pointCount && cumulative[segmentIndex + 1] < target) segmentIndex++
    const segStart = cumulative[segmentIndex]
    const segEnd = cumulative[segmentIndex + 1]
    const t = segEnd - segStart < 1e-6 ? 0 : (target - segStart) / (segEnd - segStart)
    const pointA = points[segmentIndex]
    const pointB = points[(segmentIndex + 1) % pointCount]
    out.push(new THREE.Vector3(pointA.x + (pointB.x - pointA.x) * t, 0, pointA.z + (pointB.z - pointA.z) * t))
  }
  return out
}

function cumulativeArcLength(points: THREE.Vector3[]): number[] {
  const pointCount = points.length
  const cumulative: number[] = [0]
  for (let i = 0; i < pointCount; i++) {
    cumulative.push(cumulative[i] + points[i].distanceTo(points[(i + 1) % pointCount]))
  }
  return cumulative
}

function pointAtArcLength(points: THREE.Vector3[], cumulative: number[], arc: number): THREE.Vector3 {
  const pointCount = points.length
  const total = cumulative[pointCount]
  let wrappedArc = arc
  while (wrappedArc < 0) wrappedArc += total
  while (wrappedArc >= total) wrappedArc -= total
  let segmentIndex = 0
  while (segmentIndex < pointCount && cumulative[segmentIndex + 1] < wrappedArc) segmentIndex++
  const segStart = cumulative[segmentIndex]
  const segEnd = cumulative[segmentIndex + 1]
  const t = segEnd - segStart < 1e-6 ? 0 : (wrappedArc - segStart) / (segEnd - segStart)
  const pointA = points[segmentIndex]
  const pointB = points[(segmentIndex + 1) % pointCount]
  return new THREE.Vector3(pointA.x + (pointB.x - pointA.x) * t, 0, pointA.z + (pointB.z - pointA.z) * t)
}

function nearestArcLength(points: THREE.Vector3[], cumulative: number[], target: THREE.Vector3): number {
  const pointCount = points.length
  let bestDist = Infinity
  let bestArc = 0
  for (let i = 0; i < pointCount; i++) {
    const pointA = points[i]
    const pointB = points[(i + 1) % pointCount]
    const segLen = cumulative[i + 1] - cumulative[i]
    if (segLen < 1e-9) continue
    const t = Math.max(0, Math.min(1, ((target.x - pointA.x) * (pointB.x - pointA.x) + (target.z - pointA.z) * (pointB.z - pointA.z)) / (segLen * segLen)))
    const projectedX = pointA.x + (pointB.x - pointA.x) * t
    const projectedZ = pointA.z + (pointB.z - pointA.z) * t
    const dist = (projectedX - target.x) * (projectedX - target.x) + (projectedZ - target.z) * (projectedZ - target.z)
    if (dist < bestDist) {
      bestDist = dist
      bestArc = cumulative[i] + t * segLen
    }
  }
  return bestArc
}

function computeOuterRingAnchors(shape: Shape, width: number, depth: number, inset: number, cosTilt: number, trimOffset = 0): THREE.Vector3[] {
  const insetWidth = Math.max(0.01, width + 2 * trimOffset - 2 * inset)
  const insetDepth = Math.max(0.01, depth + 2 * trimOffset - 2 * inset)
  const halfWidth = insetWidth / 2
  const halfDepth = (insetDepth / 2) * cosTilt
  if (shape === 'ellipse') {
    return [
      new THREE.Vector3(halfWidth, 0, 0),
      new THREE.Vector3(0, 0, halfDepth),
      new THREE.Vector3(-halfWidth, 0, 0),
      new THREE.Vector3(0, 0, -halfDepth),
    ]
  }
  return [
    new THREE.Vector3(-halfWidth, 0, -halfDepth),
    new THREE.Vector3(halfWidth, 0, -halfDepth),
    new THREE.Vector3(halfWidth, 0, halfDepth),
    new THREE.Vector3(-halfWidth, 0, halfDepth),
  ]
}

export function equidistantPointsWithAnchors(points: THREE.Vector3[], anchors: THREE.Vector3[], spacing: number): THREE.Vector3[] {
  const pointCount = points.length
  const cumulative = cumulativeArcLength(points)
  const total = cumulative[pointCount]
  if (total < 1e-6) return []
  if (anchors.length === 0) return equidistantPoints(points, Math.max(4, Math.round(total / spacing)))

  const anchorArcs = anchors.map((anchor) => nearestArcLength(points, cumulative, anchor)).sort((a, b) => a - b)
  const anchorCount = anchorArcs.length
  const positions: THREE.Vector3[] = []
  for (let i = 0; i < anchorCount; i++) {
    const startArc = anchorArcs[i]
    const endArc = i + 1 < anchorCount ? anchorArcs[i + 1] : anchorArcs[0] + total
    const segLen = endArc - startArc
    if (segLen <= 1e-6) continue
    const count = Math.max(1, Math.ceil(segLen / spacing))
    const step = segLen / count
    for (let j = 0; j < count; j++) {
      positions.push(pointAtArcLength(points, cumulative, startArc + j * step))
    }
  }
  return positions
}

export function buildSupportCircles(positions: THREE.Vector3[], radius: number, segs: number): THREE.BufferGeometry {
  const vertCount = positions.length * segs * 2
  const arr = new Float32Array(vertCount * 3)
  let offset = 0
  for (const point of positions) {
    for (let j = 0; j < segs; j++) {
      const angle1 = (j / segs) * Math.PI * 2
      const angle2 = ((j + 1) / segs) * Math.PI * 2
      arr[offset++] = point.x + Math.cos(angle1) * radius
      arr[offset++] = 0
      arr[offset++] = point.z + Math.sin(angle1) * radius
      arr[offset++] = point.x + Math.cos(angle2) * radius
      arr[offset++] = 0
      arr[offset++] = point.z + Math.sin(angle2) * radius
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  return geo
}

function buildSupportMesh(basePositions: THREE.Vector3[], tipPositions: THREE.Vector3[], supportRadius: number, tipRadius: number, contactHeights: number[], overCavity: boolean[] | null, cavityParams: CavityParams | null, sinTilt: number, cosTilt: number, segs: number, caps: boolean, raftHeight: number): THREE.BufferGeometry {
  if (basePositions.length === 0) return new THREE.BufferGeometry()
  const verts: number[] = []
  const indices: number[] = []

  for (let i = 0; i < basePositions.length; i++) {
    const basePoint = basePositions[i]
    const tipPoint = tipPositions[i]
    const supportOverCavity = overCavity ? overCavity[i] : false
    const yContactCenter = supportOverCavity && cavityParams
      ? cavityIntersectionHeight(tipPoint.x, tipPoint.z, cavityParams)
      : contactHeights[i]
    const yConeStart = yContactCenter - CONE_START_GAP
    if (yConeStart <= raftHeight) continue

    const baseVtx = verts.length / 3

    verts.push(basePoint.x, raftHeight, basePoint.z)
    const centerVtx = baseVtx
    for (let j = 0; j < segs; j++) {
      const angle = (j / segs) * Math.PI * 2
      const cosAngle = Math.cos(angle)
      const sinAngle = Math.sin(angle)
      verts.push(basePoint.x + cosAngle * supportRadius, raftHeight, basePoint.z + sinAngle * supportRadius)
    }
    const ring0Vtx = baseVtx + 1
    if (caps) {
      for (let j = 0; j < segs; j++) {
        const jNext = (j + 1) % segs
        indices.push(centerVtx, ring0Vtx + jNext, ring0Vtx + j)
      }
    }
    const ring1Vtx = ring0Vtx + segs
    for (let j = 0; j < segs; j++) {
      const angle = (j / segs) * Math.PI * 2
      const cosAngle = Math.cos(angle)
      const sinAngle = Math.sin(angle)
      verts.push(basePoint.x + cosAngle * supportRadius, yConeStart, basePoint.z + sinAngle * supportRadius)
    }
    for (let j = 0; j < segs; j++) {
      const jNext = (j + 1) % segs
      indices.push(ring0Vtx + j, ring1Vtx + j, ring1Vtx + jNext)
      indices.push(ring0Vtx + j, ring1Vtx + jNext, ring0Vtx + jNext)
    }
    const ring2Vtx = ring1Vtx + segs
    const surfaceNormal = supportSurfaceNormal(tipPoint, supportOverCavity, cavityParams, sinTilt, cosTilt).normalize()
    const contactPoint = new THREE.Vector3(tipPoint.x, yContactCenter, tipPoint.z)
    for (let j = 0; j < segs; j++) {
      const angle = (j / segs) * Math.PI * 2
      const groundDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))
      const planeDir = groundDir.clone().addScaledVector(surfaceNormal, -groundDir.dot(surfaceNormal))
      if (planeDir.lengthSq() < 1e-12) planeDir.set(1, 0, 0)
      planeDir.normalize()
      const tipX = contactPoint.x + planeDir.x * tipRadius
      const tipY = contactPoint.y + planeDir.y * tipRadius
      const tipZ = contactPoint.z + planeDir.z * tipRadius
      verts.push(tipX, tipY, tipZ)
    }
    for (let j = 0; j < segs; j++) {
      const jNext = (j + 1) % segs
      indices.push(ring1Vtx + j, ring2Vtx + j, ring2Vtx + jNext)
      indices.push(ring1Vtx + j, ring2Vtx + jNext, ring1Vtx + jNext)
    }
    if (caps) {
      const tipCenterVtx = verts.length / 3
      verts.push(tipPoint.x, yContactCenter, tipPoint.z)
      for (let j = 0; j < segs; j++) {
        const jNext = (j + 1) % segs
        indices.push(tipCenterVtx, ring2Vtx + jNext, ring2Vtx + j)
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
  const cosTilt = Math.cos(tilt)
  const expand = supportParams.supportSize + 5
  const trimOff = trimFootprintOffset(plinthParams)

  const topWidth = plinthParams.width + 2 * trimOff + expand
  const topDepth = plinthParams.depth + 2 * trimOff + expand
  const bottomWidth = topWidth - 2 * RAFT_BOTTOM_INSET
  const bottomDepth = topDepth - 2 * RAFT_BOTTOM_INSET

  const topPts = projectToGround(makeBaseOutlinePoints(shape, topWidth, topDepth, segMM), cosTilt)
  const pointCount = topPts.length
  const botPtsRaw = shape === 'ellipse'
    ? makeEllipseOutline(bottomWidth, bottomDepth, pointCount, cosTilt)
    : makeBaseOutlinePoints(shape, bottomWidth, bottomDepth, segMM)
  const botPts = shape === 'ellipse' ? botPtsRaw : projectToGround(makeBaseOutlinePoints(shape, bottomWidth, bottomDepth, segMM), cosTilt)
  if (pointCount < 3 || botPts.length !== pointCount) return new THREE.BufferGeometry()

  const raftHeight = supportParams.raftHeight ?? DEFAULT_RAFT_HEIGHT

  const verts: number[] = []
  const indices: number[] = []

  for (const point of botPts) verts.push(point.x, 0, point.z)
  for (const point of topPts) verts.push(point.x, raftHeight, point.z)
  const botBase = 0
  const topBase = pointCount

  for (let i = 0; i < pointCount; i++) {
    const nextI = (i + 1) % pointCount
    indices.push(botBase + i, topBase + i, topBase + nextI)
    indices.push(botBase + i, topBase + nextI, botBase + nextI)
  }

  const centerTopVtx = verts.length / 3
  verts.push(0, raftHeight, 0)
  for (let i = 0; i < pointCount; i++) {
    const nextI = (i + 1) % pointCount
    indices.push(centerTopVtx, topBase + nextI, topBase + i)
  }

  const centerBotVtx = verts.length / 3
  verts.push(0, 0, 0)
  for (let i = 0; i < pointCount; i++) {
    const nextI = (i + 1) % pointCount
    indices.push(centerBotVtx, botBase + i, botBase + nextI)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(parts: Array<number | string | boolean>): number {
  let hash = 2166136261
  for (const part of parts) {
    const value = typeof part === 'number' ? Math.round(part * 1000) : part
    const str = String(value)
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
  }
  return hash >>> 0
}

function pointInFootprint(shape: Shape, x: number, z: number, halfWidth: number, halfDepth: number): boolean {
  if (halfWidth <= 0 || halfDepth <= 0) return false
  if (shape === 'ellipse') {
    const normalizedX = x / halfWidth
    const normalizedZ = z / halfDepth
    return normalizedX * normalizedX + normalizedZ * normalizedZ <= 1
  }
  return Math.abs(x) <= halfWidth && Math.abs(z) <= halfDepth
}

function distanceToCavityTopEdge(
  x: number,
  z: number,
  shape: Shape,
  cavityHalfWidth: number,
  cavityHalfDepth: number,
  cosTilt: number,
  sinTilt: number,
  topTanAngle: number,
  hollowHeight: number,
  plinthDepth: number,
): number {
  const ceilingYLocal = hollowHeight - (plinthDepth / 2) * topTanAngle
  const zCenter = ceilingYLocal * sinTilt
  const zHalf = cavityHalfDepth * (cosTilt - topTanAngle * sinTilt)
  if (shape === 'ellipse') {
    const normalizedX = x / cavityHalfWidth
    const normalizedZ = (z - zCenter) / zHalf
    const radiusSquared = normalizedX * normalizedX + normalizedZ * normalizedZ
    if (radiusSquared <= 1) {
      const radius = Math.sqrt(radiusSquared)
      if (radius < 1e-9) return Math.min(cavityHalfWidth, zHalf)
      const edgeScale = 1 / radius - 1
      return Math.hypot(x * edgeScale, (z - zCenter) * edgeScale)
    }
    const radius = Math.sqrt(radiusSquared)
    const unitX = normalizedX / radius
    const unitZ = normalizedZ / radius
    const edgeX = unitX * cavityHalfWidth
    const edgeZ = zCenter + unitZ * zHalf
    return Math.hypot(x - edgeX, z - edgeZ)
  }
  const absX = Math.abs(x)
  const absZ = Math.abs(z - zCenter)
  const insideX = cavityHalfWidth - absX
  const insideZ = zHalf - absZ
  if (insideX >= 0 && insideZ >= 0) return Math.min(insideX, insideZ)
  const outsideX = Math.max(0, absX - cavityHalfWidth)
  const outsideZ = Math.max(0, absZ - zHalf)
  return Math.hypot(outsideX, outsideZ)
}

function inAnyExclusion(x: number, z: number, exclusions: Array<{ cx: number, cz: number, rx: number, rz: number }>): boolean {
  for (const exclusion of exclusions) {
    const dx = x - exclusion.cx
    const dz = z - exclusion.cz
    if ((dx * dx) / (exclusion.rx * exclusion.rx) + (dz * dz) / (exclusion.rz * exclusion.rz) <= 1) return true
  }
  return false
}

function sampleInteriorPoisson(
  shape: Shape,
  halfWidth: number,
  halfDepth: number,
  minDist: number,
  ringPoints: THREE.Vector3[],
  exclusions: Array<{ cx: number, cz: number, rx: number, rz: number }>,
  seed: number,
): THREE.Vector3[] {
  if (halfWidth <= 0 || halfDepth <= 0 || minDist <= 0) return []
  const rng = mulberry32(seed)
  const cell = minDist / Math.SQRT2
  const cols = Math.max(1, Math.ceil((2 * halfWidth) / cell))
  const rows = Math.max(1, Math.ceil((2 * halfDepth) / cell))
  const grid: (THREE.Vector3 | null)[] = new Array(cols * rows).fill(null)
  const gridOriginX = -halfWidth
  const gridOriginZ = -halfDepth
  const toGridIndex = (x: number, z: number): number => {
    const gridX = Math.min(cols - 1, Math.max(0, Math.floor((x - gridOriginX) / cell)))
    const gridZ = Math.min(rows - 1, Math.max(0, Math.floor((z - gridOriginZ) / cell)))
    return gridZ * cols + gridX
  }
  const points: THREE.Vector3[] = []
  const active: THREE.Vector3[] = []

  const maxDim = Math.max(halfWidth, halfDepth)
  const exclusionMargin = minDist
  for (const exclusion of exclusions) {
    const sampleCount = Math.max(8, Math.ceil((2 * Math.PI * Math.max(exclusion.rx, exclusion.rz)) / minDist))
    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2
      const radiusScale = 1 + exclusionMargin / Math.max(exclusion.rx, exclusion.rz)
      const x = exclusion.cx + Math.cos(angle) * exclusion.rx * radiusScale
      const z = exclusion.cz + Math.sin(angle) * exclusion.rz * radiusScale
      if (!pointInFootprint(shape, x, z, halfWidth, halfDepth)) continue
      if (inAnyExclusion(x, z, exclusions)) continue
      const point = new THREE.Vector3(x, 0, z)
      points.push(point)
      active.push(point)
      grid[toGridIndex(x, z)] = point
    }
  }

  const ringMinDistSquared = minDist * minDist
  for (let i = 0; i < ringPoints.length; i++) {
    const ringPoint = ringPoints[i]
    const gridX = Math.min(cols - 1, Math.max(0, Math.floor((ringPoint.x - gridOriginX) / cell)))
    const gridZ = Math.min(rows - 1, Math.max(0, Math.floor((ringPoint.z - gridOriginZ) / cell)))
    for (let gz = Math.max(0, gridZ - 2); gz <= Math.min(rows - 1, gridZ + 2); gz++) {
      for (let gx = Math.max(0, gridX - 2); gx <= Math.min(cols - 1, gridX + 2); gx++) {
        const gridPoint = grid[gz * cols + gx]
        if (gridPoint && gridPoint.distanceToSquared(ringPoint) < ringMinDistSquared) {
          grid[gz * cols + gx] = null
          const pointIdx = points.indexOf(gridPoint)
          if (pointIdx >= 0) points.splice(pointIdx, 1)
          const activeIdx = active.indexOf(gridPoint)
          if (activeIdx >= 0) active.splice(activeIdx, 1)
        }
      }
    }
  }

  if (active.length === 0 && points.length === 0) {
    let placed = false
    for (let tries = 0; tries < 30 && !placed; tries++) {
      const x = (rng() * 2 - 1) * halfWidth
      const z = (rng() * 2 - 1) * halfDepth
      if (!pointInFootprint(shape, x, z, halfWidth, halfDepth)) continue
      if (inAnyExclusion(x, z, exclusions)) continue
      let tooClose = false
      for (const ringPoint of ringPoints) {
        const dx = x - ringPoint.x
        const dz = z - ringPoint.z
        if (dx * dx + dz * dz < ringMinDistSquared) { tooClose = true; break }
      }
      if (tooClose) continue
      const point = new THREE.Vector3(x, 0, z)
      points.push(point)
      active.push(point)
      grid[toGridIndex(x, z)] = point
      placed = true
    }
    if (!placed) return points
  }

  const maxCandidates = 30
  const minDistSquared = minDist * minDist
  let iterations = 0
  const maxIterations = 20000
  while (active.length > 0 && iterations < maxIterations) {
    iterations++
    const activeIdx = Math.floor(rng() * active.length)
    const basePoint = active[activeIdx]
    let found = false
    for (let j = 0; j < maxCandidates; j++) {
      const angle = rng() * Math.PI * 2
      const radius = minDist + rng() * minDist
      const x = basePoint.x + Math.cos(angle) * radius
      const z = basePoint.z + Math.sin(angle) * radius
      if (!pointInFootprint(shape, x, z, halfWidth, halfDepth)) continue
      if (inAnyExclusion(x, z, exclusions)) continue
      let tooClose = false
      for (const ringPoint of ringPoints) {
        const dx = x - ringPoint.x
        const dz = z - ringPoint.z
        if (dx * dx + dz * dz < ringMinDistSquared) { tooClose = true; break }
      }
      if (tooClose) continue
      const gridX = Math.min(cols - 1, Math.max(0, Math.floor((x - gridOriginX) / cell)))
      const gridZ = Math.min(rows - 1, Math.max(0, Math.floor((z - gridOriginZ) / cell)))
      let neighborTooClose = false
      for (let gz = Math.max(0, gridZ - 2); gz <= Math.min(rows - 1, gridZ + 2); gz++) {
        for (let gx = Math.max(0, gridX - 2); gx <= Math.min(cols - 1, gridX + 2); gx++) {
          const gridPoint = grid[gz * cols + gx]
          if (gridPoint && gridPoint !== basePoint) {
            const dx = x - gridPoint.x
            const dz = z - gridPoint.z
            if (dx * dx + dz * dz < minDistSquared) { neighborTooClose = true; break }
          }
        }
        if (neighborTooClose) break
      }
      if (neighborTooClose) continue
      const point = new THREE.Vector3(x, 0, z)
      points.push(point)
      active.push(point)
      grid[gridZ * cols + gridX] = point
      found = true
      break
    }
    if (!found) {
      active.splice(activeIdx, 1)
    }
  }

  void maxDim
  return points
}

function computeRingPositionsAroundOutline(shape: Shape, ringWidth: number, ringDepth: number, spacing: number, cosTilt: number, segMM: number, centerZ: number, ensurePlusZ: boolean): THREE.Vector3[] {
  const ringLocal = makeBaseOutlinePoints(shape, ringWidth, ringDepth, segMM)
  const ringProjected = projectToGround(ringLocal, cosTilt)
  const perim = perimeterLength(ringProjected)
  if (perim < 1e-6) return []

  const anchors = computeOuterRingAnchors(shape, ringWidth, ringDepth, 0, cosTilt)
  const ringPositions = equidistantPointsWithAnchors(ringProjected, anchors, spacing)

  if (ensurePlusZ) {
    const plusZMin = new THREE.Vector3(0, 0, (ringDepth / 2) * cosTilt)
    if (!ringPositions.some((point) => point.distanceTo(plusZMin) < spacing * 0.25)) {
      ringPositions.push(plusZMin)
    }
  }

  return ringPositions.map((point) => new THREE.Vector3(point.x, 0, point.z + centerZ))
}

function computeCavityEdgeRingPositions(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, cosTilt: number, segMM: number): THREE.Vector3[] {
  if (!plinthParams.hollowEnabled) return []
  const tipRadius = supportParams.supportTipSize / 2
  const wallThickness = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityWidth = Math.max(0.1, plinthParams.width - 2 * wallThickness)
  const cavityDepth = Math.max(0.1, plinthParams.depth - 2 * wallThickness)
  const expand = tipRadius + CONE_TIP_PENETRATION
  const ringWidth = cavityWidth + 2 * expand
  const ringDepth = cavityDepth + 2 * expand
  if (ringWidth > plinthParams.width || ringDepth > plinthParams.depth) return []

  return computeRingPositionsAroundOutline(shape, ringWidth, ringDepth, supportParams.supportSpacing, cosTilt, segMM, 0, false)
}

function computeHoleEdgeRingPositions(plinthParams: PlinthParams, supportParams: SupportParams, cosTilt: number, sinTilt: number, segMM: number): THREE.Vector3[] {
  if (!plinthParams.addHole || !plinthParams.hollowEnabled) return []
  const topThickness = plinthParams.height - plinthParams.hollowHeight
  if (plinthParams.holeDepth < topThickness) return []
  const supportRadius = supportParams.supportSize / 2
  const holeRadius = Math.max(0.05, plinthParams.holeDiameter / 2)
  const ringRadius = holeRadius + supportRadius + CONE_TIP_PENETRATION
  const ringWidth = ringRadius * 2
  const ringDepth = ringRadius * 2
  if (ringWidth > plinthParams.width || ringDepth > plinthParams.depth) return []

  const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
  const drop = topDrop(plinthParams)
  const ceilingLocalY = hollowHeight - drop / 2
  const holeZWorld = ceilingLocalY * sinTilt
  return computeRingPositionsAroundOutline('ellipse', ringWidth, ringDepth, supportParams.supportSpacing, cosTilt, segMM, holeZWorld, true)
}

function computeSuctionHoleEdgeRingPositions(plinthParams: PlinthParams, supportParams: SupportParams, cosTilt: number, sinTilt: number, segMM: number): THREE.Vector3[] {
  if (!plinthParams.hollowEnabled || !plinthParams.suctionHoleEnabled) return []
  const supportRadius = supportParams.supportSize / 2
  const suctionRadius = Math.max(0.05, plinthParams.suctionHoleDiameter / 2)
  const ringRadius = suctionRadius + supportRadius + CONE_TIP_PENETRATION
  const ringWidth = ringRadius * 2
  const ringDepth = ringRadius * 2
  if (ringWidth > plinthParams.width || ringDepth > plinthParams.depth) return []

  const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
  const suctionZ = suctionHoleZ(plinthParams)
  const angleRad = plinthParams.angleTop
    ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
    : 0
  const tanAngle = Math.tan(angleRad)
  const plinthDepth = Math.max(0.1, plinthParams.depth)
  const ceilingLocalY = hollowHeight - (suctionZ + plinthDepth / 2) * tanAngle
  const holeZWorld = ceilingLocalY * sinTilt + suctionZ * cosTilt
  const ring = computeRingPositionsAroundOutline('ellipse', ringWidth, ringDepth, supportParams.supportSpacing, cosTilt, segMM, holeZWorld, false)
  return ring.filter((point) => point.z >= holeZWorld - 1e-4)
}

export function computeSupportPositions(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segMM: number): THREE.Vector3[] {
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  if (radius <= 0) return []
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const cosTilt = Math.cos(tilt)

  const trimOff = trimFootprintOffset(plinthParams)
  const insetLocal = makeInsetOutlinePoints(shape, plinthParams.width, plinthParams.depth, tipRadius + CONE_TIP_PENETRATION, segMM, trimOff)
  const insetProjected = projectToGround(insetLocal, cosTilt)
  const perim = perimeterLength(insetProjected)
  if (perim < 1e-6) return []

  const anchors = computeOuterRingAnchors(shape, plinthParams.width, plinthParams.depth, tipRadius + CONE_TIP_PENETRATION, cosTilt, trimOff)
  const ringPositions = equidistantPointsWithAnchors(insetProjected, anchors, supportParams.supportSpacing)

  const cavityRingPositions = computeCavityEdgeRingPositions(shape, plinthParams, supportParams, cosTilt, segMM)
  const sinTilt = Math.sin(tilt)
  const holeRingPositions = computeHoleEdgeRingPositions(plinthParams, supportParams, cosTilt, sinTilt, segMM)
  const suctionRingPositions = computeSuctionHoleEdgeRingPositions(plinthParams, supportParams, cosTilt, sinTilt, segMM)

  const ringPositionsAll = ringPositions.concat(cavityRingPositions, holeRingPositions, suctionRingPositions)

  const exclusions: Array<{ cx: number, cz: number, rx: number, rz: number }> = []
  if (plinthParams.addHole && plinthParams.hollowEnabled) {
    const topThickness = plinthParams.height - plinthParams.hollowHeight
    if (plinthParams.holeDepth >= topThickness) {
      const holeRadius = Math.max(0.05, plinthParams.holeDiameter / 2)
      const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
      const drop = topDrop(plinthParams)
      const ceilingLocalY = hollowHeight - drop / 2
      const holeZWorld = ceilingLocalY * sinTilt
      const exclusionRx = holeRadius + radius
      exclusions.push({ cx: 0, cz: holeZWorld, rx: exclusionRx, rz: exclusionRx * cosTilt })
    }
  }
  if (plinthParams.hollowEnabled && plinthParams.suctionHoleEnabled) {
    const suctionRadius = Math.max(0.05, plinthParams.suctionHoleDiameter / 2)
    const suctionZ = suctionHoleZ(plinthParams)
    const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
    const angleRad = plinthParams.angleTop
      ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
      : 0
    const tanAngle = Math.tan(angleRad)
    const plinthDepth = Math.max(0.1, plinthParams.depth)
    const ceilingLocalY = hollowHeight - (suctionZ + plinthDepth / 2) * tanAngle
    const holeZWorld = ceilingLocalY * sinTilt + suctionZ * cosTilt
    const exclusionRx = suctionRadius + radius
    exclusions.push({ cx: 0, cz: holeZWorld, rx: exclusionRx, rz: exclusionRx * cosTilt })
  }

  const inset = tipRadius + CONE_TIP_PENETRATION
  const interiorHalfWidth = Math.max(0, (plinthParams.width + 2 * trimOff) / 2 - inset)
  const interiorHalfDepth = Math.max(0, (plinthParams.depth + 2 * trimOff) / 2 * cosTilt - inset * cosTilt)

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

  const interiorPositionsRaw = sampleInteriorPoisson(
    shape,
    interiorHalfWidth,
    interiorHalfDepth,
    supportParams.interiorSpacing,
    ringPositionsAll,
    exclusions,
    seed,
  )

  let interiorPositions = interiorPositionsRaw
  if (plinthParams.hollowEnabled) {
    const wallThickness = Math.max(0.5, plinthParams.hollowWallThickness)
    const cavityHalfWidth = Math.max(0.01, (plinthParams.width - 2 * wallThickness) / 2)
    const cavityHalfDepth = Math.max(0.01, (plinthParams.depth - 2 * wallThickness) / 2)
    const topTanAngle = plinthParams.angleTop
      ? Math.tan((Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180)
      : 0
    const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
    const plinthDepth = Math.max(0.1, plinthParams.depth)
    const keepDistance = supportParams.supportSize
    interiorPositions = interiorPositionsRaw.filter((point) => {
      const distance = distanceToCavityTopEdge(point.x, point.z, shape, cavityHalfWidth, cavityHalfDepth, cosTilt, sinTilt, topTanAngle, hollowHeight, plinthDepth)
      return distance >= keepDistance
    })
  }

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
  const normalizedDir = dir.clone().normalize()
  const quat = new THREE.Quaternion().setFromUnitVectors(up, normalizedDir)
  const matrix = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1))
  geo.applyMatrix4(matrix)
  return geo
}

function segmentsIntersect2D(
  a1x: number, a1z: number, a2x: number, a2z: number,
  b1x: number, b1z: number, b2x: number, b2z: number,
): boolean {
  const cross1 = (b2x - b1x) * (a1z - b1z) - (b2z - b1z) * (a1x - b1x)
  const cross2 = (b2x - b1x) * (a2z - b1z) - (b2z - b1z) * (a2x - b1x)
  const cross3 = (a2x - a1x) * (b1z - a1z) - (a2z - a1z) * (b1x - a1x)
  const cross4 = (a2x - a1x) * (b2z - a1z) - (a2z - a1z) * (b2x - a1x)
  if (((cross1 > 0 && cross2 < 0) || (cross1 < 0 && cross2 > 0)) && ((cross3 > 0 && cross4 < 0) || (cross3 < 0 && cross4 > 0))) return true
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
  const closestX = ax + t * dx
  const closestZ = az + t * dz
  const errorX = px - closestX
  const errorZ = pz - closestZ
  return Math.sqrt(errorX * errorX + errorZ * errorZ)
}

function segmentToSegmentMinDistance2D(
  a1x: number, a1z: number, a2x: number, a2z: number,
  b1x: number, b1z: number, b2x: number, b2z: number,
): number {
  if (segmentsIntersect2D(a1x, a1z, a2x, a2z, b1x, b1z, b2x, b2z)) return 0
  const dist1 = pointToSegmentDistance2D(a1x, a1z, b1x, b1z, b2x, b2z)
  const dist2 = pointToSegmentDistance2D(a2x, a2z, b1x, b1z, b2x, b2z)
  const dist3 = pointToSegmentDistance2D(b1x, b1z, a1x, a1z, a2x, a2z)
  const dist4 = pointToSegmentDistance2D(b2x, b2z, a1x, a1z, a2x, a2z)
  return Math.min(dist1, dist2, dist3, dist4)
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
  raftHeight: number,
): THREE.BufferGeometry {
  if (basePositions.length < 2 || scaffoldingAngle <= 0 || scaffoldingAngle >= 90) return new THREE.BufferGeometry()

  const yConeStarts: number[] = []
  for (let i = 0; i < basePositions.length; i++) {
    const tipPoint = tipPositions[i]
    const supportOverCavity = overCavity ? overCavity[i] : false
    const yContactCenter = supportOverCavity && cavityParams
      ? cavityIntersectionHeight(tipPoint.x, tipPoint.z, cavityParams)
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

      const pointI = basePositions[i]
      const pointJ = basePositions[j]
      const dx = pointJ.x - pointI.x
      const dz = pointJ.z - pointI.z
      const centerDist = Math.sqrt(dx * dx + dz * dz)
      if (centerDist < 1e-6 || centerDist > maxDist) continue

      const segMinX = Math.min(pointI.x, pointJ.x) - supportClearance
      const segMaxX = Math.max(pointI.x, pointJ.x) + supportClearance
      const segMinZ = Math.min(pointI.z, pointJ.z) - supportClearance
      const segMaxZ = Math.max(pointI.z, pointJ.z) + supportClearance

      let blocked = false
      for (let k = 0; k < basePositions.length; k++) {
        if (k === i || k === j) continue
        const pointK = basePositions[k]
        if (pointK.x < segMinX || pointK.x > segMaxX || pointK.z < segMinZ || pointK.z > segMaxZ) continue
        if (pointToSegmentDistance2D(pointK.x, pointK.z, pointI.x, pointI.z, pointJ.x, pointJ.z) < supportClearance) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      const candMinX = Math.min(pointI.x, pointJ.x) - strutClearance
      const candMaxX = Math.max(pointI.x, pointJ.x) + strutClearance
      const candMinZ = Math.min(pointI.z, pointJ.z) - strutClearance
      const candMaxZ = Math.max(pointI.z, pointJ.z) + strutClearance

      let overlaps = false
      for (const [a, b] of acceptedPairs) {
        if (a === i || a === j || b === i || b === j) continue
        const pointA = basePositions[a]
        const pointB = basePositions[b]
        const accMinX = Math.min(pointA.x, pointB.x) - strutClearance
        const accMaxX = Math.max(pointA.x, pointB.x) + strutClearance
        const accMinZ = Math.min(pointA.z, pointB.z) - strutClearance
        const accMaxZ = Math.max(pointA.z, pointB.z) + strutClearance
        if (!aabbOverlaps(candMinX, candMinZ, candMaxX, candMaxZ, accMinX, accMinZ, accMaxX, accMaxZ)) continue
        if (segmentToSegmentMinDistance2D(pointI.x, pointI.z, pointJ.x, pointJ.z, pointA.x, pointA.z, pointB.x, pointB.z) < strutClearance) {
          overlaps = true
          break
        }
      }
      if (overlaps) continue

      acceptedPairs.push([i, j])

      const yTop = Math.min(yConeStarts[i], yConeStarts[j])
      const totalHeight = yTop - raftHeight
      if (totalHeight <= 0) continue

      const rise = centerDist * tanAngle
      if (rise < 1e-6) continue
      const strutCount = Math.ceil(totalHeight / rise)
      const actualRise = totalHeight / strutCount

      for (let k = 0; k < strutCount; k++) {
        const yStart = raftHeight + k * actualRise
        const yEnd = raftHeight + (k + 1) * actualRise

        let start: THREE.Vector3
        let end: THREE.Vector3
        if (k % 2 === 0) {
          start = new THREE.Vector3(pointI.x, yStart, pointI.z)
          end = new THREE.Vector3(pointJ.x, yEnd, pointJ.z)
        } else {
          start = new THREE.Vector3(pointJ.x, yStart, pointJ.z)
          end = new THREE.Vector3(pointI.x, yEnd, pointI.z)
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
  for (const geo of geometries) geo.dispose()
  return merged ?? new THREE.BufferGeometry()
}

export function buildSupportMeshGeometry(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segs: number, includeScaffolding = false): THREE.BufferGeometry {
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const tanTilt = Math.tan(tilt)
  const cosTilt = Math.cos(tilt)
  const raftHeight = supportParams.raftHeight ?? DEFAULT_RAFT_HEIGHT
  const raise = raftHeight + supportParams.raiseBy + (plinthParams.depth / 2) * Math.sin(tilt)
  if (radius <= 0) return new THREE.BufferGeometry()

  const positionsRaw = computeSupportPositions(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const sinTilt = Math.sin(tilt)
  const wallThickness = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityParams: CavityParams | null = plinthParams.hollowEnabled
    ? {
        shape,
        cavityHalfWidth: Math.max(0.01, (plinthParams.width - 2 * wallThickness) / 2),
        cavityHalfDepth: Math.max(0.01, (plinthParams.depth - 2 * wallThickness) / 2),
        hollowHeight: Math.max(0.1, plinthParams.hollowHeight),
        plinthDepth: Math.max(0.1, plinthParams.depth),
        topTanAngle: plinthParams.angleTop ? Math.tan((Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180) : 0,
        raise,
        sinTilt,
        cosTilt,
        tanTilt,
      }
    : null
  const overCavity = plinthParams.hollowEnabled
    ? positionsRaw.map((point) => isSupportOverCavity(point, radius, tipRadius, plinthParams, cosTilt))
    : null
  const { basePositions, tipPositions, contactHeights } = applySupportOffset(positionsRaw, overCavity, cavityParams, sinTilt, tanTilt, raise, supportParams.supportOffsetCavity ?? SUPPORT_OFFSET_CAVITY)
  const supportGeo = buildSupportMesh(basePositions, tipPositions, radius, tipRadius, contactHeights, overCavity, cavityParams, sinTilt, cosTilt, segs, supportParams.supportCaps ?? SUPPORT_CAPS, raftHeight)
  const raftGeo = buildRaftMesh(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)

  const normSupport = supportGeo.index ? supportGeo.toNonIndexed() : supportGeo.clone()
  const normRaft = raftGeo.index ? raftGeo.toNonIndexed() : raftGeo.clone()
  const mergeGeos: THREE.BufferGeometry[] = [normSupport, normRaft]

  let scaffoldGeo: THREE.BufferGeometry | null = null
  if (includeScaffolding && supportParams.scaffoldingEnabled) {
    scaffoldGeo = buildScaffoldingMesh(basePositions, tipPositions, overCavity, contactHeights, cavityParams, supportParams.supportSize, supportParams.supportSpacing, supportParams.scaffoldingAngle, segs, raftHeight)
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
  const tanTilt = Math.tan(tilt)
  const cosTilt = Math.cos(tilt)
  const raftHeight = supportParams.raftHeight ?? DEFAULT_RAFT_HEIGHT
  const raise = raftHeight + supportParams.raiseBy + (plinthParams.depth / 2) * Math.sin(tilt)
  if (radius <= 0) return new THREE.BufferGeometry()

  const positionsRaw = computeSupportPositions(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const sinTilt = Math.sin(tilt)
  const wallThickness = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityParams: CavityParams | null = plinthParams.hollowEnabled
    ? {
        shape,
        cavityHalfWidth: Math.max(0.01, (plinthParams.width - 2 * wallThickness) / 2),
        cavityHalfDepth: Math.max(0.01, (plinthParams.depth - 2 * wallThickness) / 2),
        hollowHeight: Math.max(0.1, plinthParams.hollowHeight),
        plinthDepth: Math.max(0.1, plinthParams.depth),
        topTanAngle: plinthParams.angleTop ? Math.tan((Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180) : 0,
        raise,
        sinTilt,
        cosTilt,
        tanTilt,
      }
    : null
  const overCavity = plinthParams.hollowEnabled
    ? positionsRaw.map((point) => isSupportOverCavity(point, radius, tipRadius, plinthParams, cosTilt))
    : null
  const { basePositions, tipPositions, contactHeights } = applySupportOffset(positionsRaw, overCavity, cavityParams, sinTilt, tanTilt, raise, supportParams.supportOffsetCavity ?? SUPPORT_OFFSET_CAVITY)
  const supportGeo = buildSupportMesh(basePositions, tipPositions, radius, tipRadius, contactHeights, overCavity, cavityParams, sinTilt, cosTilt, segs, supportParams.supportCaps ?? SUPPORT_CAPS, raftHeight)
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
  const raftHeight = supportParams.raftHeight ?? DEFAULT_RAFT_HEIGHT
  const raise = raftHeight + supportParams.raiseBy + (plinthDepth / 2) * Math.sin(tilt)
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