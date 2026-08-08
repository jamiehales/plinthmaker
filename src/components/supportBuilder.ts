import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Brush, Evaluator, ADDITION } from 'three-bvh-csg'
import { type Shape, type PlinthParams, type SupportParams, RENDER_BASE_SEGMENT_MM, suctionHoleZ } from './geometryBuilder.ts'
import { sampleTrimOffset, getTrimProfile } from './trimProfiles.ts'
import {
  DEFAULT_CONE_START_GAP, DEFAULT_RAFT_HEIGHT, DEFAULT_RAFT_BOTTOM_INSET,
  DEFAULT_CONE_TIP_PENETRATION, DEFAULT_SUPPORT_CAPS,
  DEFAULT_SCAFFOLDING_SCALE, DEFAULT_SCAFFOLDING_GAP_TOLERANCE,
} from '../defaults.ts'

const CONE_START_GAP = DEFAULT_CONE_START_GAP
const RAFT_HEIGHT = DEFAULT_RAFT_HEIGHT
const RAFT_BOTTOM_INSET = DEFAULT_RAFT_BOTTOM_INSET
const CONE_TIP_PENETRATION = DEFAULT_CONE_TIP_PENETRATION
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
  raise: number
  sinT: number
  cosT: number
  tanT: number
}

function cavityIntersectionHeight(xW: number, zW: number, c: CavityParams): number {
  const yCeiling = c.raise + c.hollowHeight / Math.max(0.01, c.cosT) - zW * c.tanT

  if (Math.abs(c.sinT) < 1e-6) return yCeiling

  let yWall = Infinity

  if (c.shape === 'ellipse') {
    const xTerm = (xW * xW) / (c.hw * c.hw)
    if (xTerm >= 1) return yCeiling
    const dz = c.hd * Math.sqrt(1 - xTerm)
    const yL1 = (zW + dz * c.cosT) / c.sinT
    const yL2 = (zW - dz * c.cosT) / c.sinT
    for (const yL of [yL1, yL2]) {
      if (yL >= 0 && yL <= c.hollowHeight) {
        const yW = c.raise + yL / Math.max(0.01, c.cosT) - zW * c.tanT
        if (yW < yWall) yWall = yW
      }
    }
  } else {
    const yL1 = (zW + c.hd * c.cosT) / c.sinT
    const yL2 = (zW - c.hd * c.cosT) / c.sinT
    for (const yL of [yL1, yL2]) {
      if (yL >= 0 && yL <= c.hollowHeight) {
        const yW = c.raise + yL / Math.max(0.01, c.cosT) - zW * c.tanT
        if (yW < yWall) yWall = yW
      }
    }
  }

  return Math.min(yCeiling, yWall)
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
    const count = Math.max(1, Math.round(segLen / spacing))
    const step = segLen / count
    for (let j = 0; j < count; j++) {
      positions.push(pointAtArcLength(points, cum, startArc + j * step))
    }
  }
  return positions
}

function equidistantPointsWithOffset(points: THREE.Vector3[], n: number, offset: number): THREE.Vector3[] {
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
    let target = i * step + offset
    while (target >= total) target -= total
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

function buildSupportMesh(positions: THREE.Vector3[], supportRadius: number, tipRadius: number, contactHeights: number[], overCavity: boolean[] | null, cavityParams: CavityParams | null, tanT: number, segs: number, caps: boolean): THREE.BufferGeometry {
  if (positions.length === 0) return new THREE.BufferGeometry()
  const verts: number[] = []
  const indices: number[] = []

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    const supportOverCavity = overCavity ? overCavity[i] : false
    const yContactCenter = supportOverCavity && cavityParams
      ? cavityIntersectionHeight(p.x, p.z, cavityParams)
      : contactHeights[i]
    const yConeStart = yContactCenter - CONE_START_GAP
    if (yConeStart <= RAFT_HEIGHT) continue

    const baseVtx = verts.length / 3

    verts.push(p.x, RAFT_HEIGHT, p.z)
    const centerVtx = baseVtx
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      verts.push(p.x + cx * supportRadius, RAFT_HEIGHT, p.z + cz * supportRadius)
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
      verts.push(p.x + cx * supportRadius, yConeStart, p.z + cz * supportRadius)
    }
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs
      indices.push(ring0Vtx + j, ring1Vtx + j, ring1Vtx + jn)
      indices.push(ring0Vtx + j, ring1Vtx + jn, ring0Vtx + jn)
    }
    const ring2Vtx = ring1Vtx + segs
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      const zTip = p.z + cz * tipRadius
      const xTip = p.x + cx * tipRadius
      const yTip = supportOverCavity && cavityParams
        ? cavityIntersectionHeight(xTip, zTip, cavityParams)
        : contactHeights[i] - (zTip - p.z) * tanT
      verts.push(xTip, yTip, zTip)
    }
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs
      indices.push(ring1Vtx + j, ring2Vtx + j, ring2Vtx + jn)
      indices.push(ring1Vtx + j, ring2Vtx + jn, ring1Vtx + jn)
    }
    if (caps) {
      const tipCenterVtx = verts.length / 3
      verts.push(p.x, yContactCenter, p.z)
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

function buildConcentricRingPositions(shape: Shape, w: number, d: number, cosT: number, s: number, inset: number, segMM: number, trimOffset = 0): THREE.Vector3[] {
  const positions: THREE.Vector3[] = []
  const ringStep = s * Math.sqrt(3) / 2
  let shrink = inset
  let ring = 0
  let innermostMinDist = Infinity
  while (true) {
    const rw = w + 2 * trimOffset - 2 * shrink
    const rd = (d + 2 * trimOffset - 2 * shrink) * cosT
    const hw = rw / 2
    const hd = rd / 2
    if (hw < s / 2 || hd < s / 2) break
    const ringPoints = shape === 'ellipse'
      ? makeBaseOutlinePoints('ellipse', rw, rd, segMM)
      : makeBaseOutlinePoints('rectangle', rw, rd, segMM)
    const projected = projectToGround(ringPoints, 1)
    const perim = perimeterLength(projected)
    const n = Math.max(4, Math.round(perim / s))
    const offset = (ring & 1) * (perim / n / 2)
    const ringPositions = equidistantPointsWithOffset(projected, n, offset)
    let ringMinDist = Infinity
    for (const p of ringPositions) {
      const dist = Math.sqrt(p.x * p.x + p.z * p.z)
      if (dist < ringMinDist) ringMinDist = dist
    }
    innermostMinDist = ringMinDist
    positions.push(...ringPositions)
    shrink += ringStep
    ring++
  }
  if (innermostMinDist >= s) {
    positions.push(new THREE.Vector3(0, 0, 0))
  }
  return positions
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

  const ringLocal = makeBaseOutlinePoints(shape, ringW, ringD, segMM)
  const ringProjected = projectToGround(ringLocal, cosT)
  const perim = perimeterLength(ringProjected)
  if (perim < 1e-6) return []

  const anchors = computeOuterRingAnchors(shape, ringW, ringD, 0, cosT)
  return equidistantPointsWithAnchors(ringProjected, anchors, supportParams.supportSpacing)
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
  const s = ringPositions.length > 0 ? perim / ringPositions.length : supportParams.supportSpacing

  const cavityRingPositions = computeCavityEdgeRingPositions(shape, plinthParams, supportParams, cosT, segMM)

  const gap = Math.min(s, supportParams.supportSpacing)
  const interiorPositions = buildConcentricRingPositions(shape, plinthParams.width, plinthParams.depth, cosT, s, tipRadius + gap, segMM, trimOff)
  let allPositions = ringPositions.concat(cavityRingPositions, interiorPositions)

  if (plinthParams.hollowEnabled && plinthParams.suctionHoleEnabled) {
    const suctionRadius = Math.max(0.05, plinthParams.suctionHoleDiameter / 2)
    const suctionZ = suctionHoleZ(plinthParams)
    const hollowHeight = Math.max(0.1, plinthParams.hollowHeight)
    const sinT = Math.sin(tilt)
    const holeZWorld = hollowHeight * sinT + suctionZ * cosT
    const exclusionRadius = suctionRadius + radius
    allPositions = allPositions.filter((p) => {
      return Math.sqrt(p.x * p.x + (p.z - holeZWorld) * (p.z - holeZWorld)) > exclusionRadius
    })
  }

  return allPositions
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

export function buildScaffoldingMesh(
  positions: THREE.Vector3[],
  overCavity: boolean[] | null,
  contactHeights: number[],
  cavityParams: CavityParams | null,
  supportSize: number,
  supportSpacing: number,
  scaffoldingAngle: number,
  segs: number,
): THREE.BufferGeometry {
  if (positions.length < 2 || scaffoldingAngle <= 0 || scaffoldingAngle >= 90) return new THREE.BufferGeometry()

  const yConeStarts: number[] = []
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    const supportOverCavity = overCavity ? overCavity[i] : false
    const yContactCenter = supportOverCavity && cavityParams
      ? cavityIntersectionHeight(p.x, p.z, cavityParams)
      : contactHeights[i]
    yConeStarts.push(yContactCenter - CONE_START_GAP)
  }

  const angleRad = (scaffoldingAngle * Math.PI) / 180
  const tanAngle = Math.tan(angleRad)
  const strutRadius = (SCAFFOLDING_SCALE * supportSize) / 2
  const maxDist = supportSize + supportSpacing + SCAFFOLDING_GAP_TOLERANCE

  const geometries: THREE.BufferGeometry[] = []
  const acceptedPairs: Array<[number, number]> = []

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (overCavity && overCavity[i] !== overCavity[j]) continue

      const pi = positions[i]
      const pj = positions[j]
      const dx = pj.x - pi.x
      const dz = pj.z - pi.z
      const centerDist = Math.sqrt(dx * dx + dz * dz)
      if (centerDist < 1e-6 || centerDist > maxDist) continue

      let overlaps = false
      for (const [a, b] of acceptedPairs) {
        if (a === i || a === j || b === i || b === j) continue
        const pa = positions[a]
        const pb = positions[b]
        if (segmentsIntersect2D(pi.x, pi.z, pj.x, pj.z, pa.x, pa.z, pb.x, pb.z)) {
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

  const positions = computeSupportPositions(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const contactHeights = positions.map((p) => raise - p.z * tanT)
  const sinT = Math.sin(tilt)
  const wall = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityParams: CavityParams | null = plinthParams.hollowEnabled
    ? {
        shape,
        hw: Math.max(0.01, (plinthParams.width - 2 * wall) / 2),
        hd: Math.max(0.01, (plinthParams.depth - 2 * wall) / 2),
        hollowHeight: Math.max(0.1, plinthParams.hollowHeight),
        raise,
        sinT,
        cosT,
        tanT,
      }
    : null
  const overCavity = plinthParams.hollowEnabled
    ? positions.map((p) => isSupportOverCavity(p, radius, tipRadius, plinthParams, cosT))
    : null
  const supportGeo = buildSupportMesh(positions, radius, tipRadius, contactHeights, overCavity, cavityParams, tanT, segs, supportParams.supportCaps ?? SUPPORT_CAPS)
  const raftGeo = buildRaftMesh(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)

  const normSupport = supportGeo.index ? supportGeo.toNonIndexed() : supportGeo.clone()
  const normRaft = raftGeo.index ? raftGeo.toNonIndexed() : raftGeo.clone()
  const mergeGeos: THREE.BufferGeometry[] = [normSupport, normRaft]

  let scaffoldGeo: THREE.BufferGeometry | null = null
  if (includeScaffolding && supportParams.scaffoldingEnabled) {
    scaffoldGeo = buildScaffoldingMesh(positions, overCavity, contactHeights, cavityParams, supportParams.supportSize, supportParams.supportSpacing, supportParams.scaffoldingAngle, segs)
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

  const positions = computeSupportPositions(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const contactHeights = positions.map((p) => raise - p.z * tanT)
  const sinT = Math.sin(tilt)
  const wall = Math.max(0.5, plinthParams.hollowWallThickness)
  const cavityParams: CavityParams | null = plinthParams.hollowEnabled
    ? {
        shape,
        hw: Math.max(0.01, (plinthParams.width - 2 * wall) / 2),
        hd: Math.max(0.01, (plinthParams.depth - 2 * wall) / 2),
        hollowHeight: Math.max(0.1, plinthParams.hollowHeight),
        raise,
        sinT,
        cosT,
        tanT,
      }
    : null
  const overCavity = plinthParams.hollowEnabled
    ? positions.map((p) => isSupportOverCavity(p, radius, tipRadius, plinthParams, cosT))
    : null
  const supportGeo = buildSupportMesh(positions, radius, tipRadius, contactHeights, overCavity, cavityParams, tanT, segs, supportParams.supportCaps ?? SUPPORT_CAPS)
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