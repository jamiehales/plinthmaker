import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type Shape, type PlinthParams, type SupportParams, RENDER_BASE_SEGMENT_MM } from './geometryBuilder.ts'

const CONE_START_GAP = 3

export function makeBaseOutlinePoints(shape: Shape, w: number, d: number, segMM: number): THREE.Vector3[] {
  if (shape === 'ellipse') {
    const hw = Math.max(0.01, w / 2)
    const hd = Math.max(0.01, d / 2)
    const perim = Math.PI * (3 * (hw + hd) - Math.sqrt((3 * hw + hd) * (hw + 3 * hd)))
    const n = Math.max(16, Math.ceil(perim / segMM))
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(new THREE.Vector3(hw * Math.cos(a), 0, hd * Math.sin(a)))
    }
    return pts
  }
  const hw = Math.max(0.01, w / 2)
  const hd = Math.max(0.01, d / 2)
  return [
    new THREE.Vector3(-hw, 0, -hd),
    new THREE.Vector3(hw, 0, -hd),
    new THREE.Vector3(hw, 0, hd),
    new THREE.Vector3(-hw, 0, hd),
  ]
}

export function makeInsetOutlinePoints(shape: Shape, w: number, d: number, inset: number, segMM: number): THREE.Vector3[] {
  const iw = Math.max(0.01, w - 2 * inset)
  const id = Math.max(0.01, d - 2 * inset)
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

function buildSupportMesh(positions: THREE.Vector3[], supportRadius: number, tipRadius: number, contactHeights: number[], segs: number): THREE.BufferGeometry {
  if (positions.length === 0) return new THREE.BufferGeometry()
  const verts: number[] = []
  const indices: number[] = []

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    const yContact = contactHeights[i]
    const yConeStart = yContact - CONE_START_GAP
    if (yConeStart <= 0) continue

    const baseVtx = verts.length / 3

    verts.push(p.x, 0, p.z)
    const centerVtx = baseVtx
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      verts.push(p.x + cx * supportRadius, 0, p.z + cz * supportRadius)
    }
    const ring0Vtx = baseVtx + 1
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs
      indices.push(centerVtx, ring0Vtx + jn, ring0Vtx + j)
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
      indices.push(ring0Vtx + j, ring0Vtx + jn, ring1Vtx + jn)
      indices.push(ring0Vtx + j, ring1Vtx + jn, ring1Vtx + j)
    }
    const ring2Vtx = ring1Vtx + segs
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      verts.push(p.x + cx * tipRadius, yContact, p.z + cz * tipRadius)
    }
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs
      indices.push(ring1Vtx + j, ring2Vtx + j, ring2Vtx + jn)
      indices.push(ring1Vtx + j, ring2Vtx + jn, ring1Vtx + jn)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildConcentricRingPositions(shape: Shape, w: number, d: number, cosT: number, s: number, inset: number, segMM: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = []
  const ringStep = s * Math.sqrt(3) / 2
  let shrink = inset
  let ring = 0
  let innermostMinDist = Infinity
  while (true) {
    const rw = w - 2 * shrink
    const rd = (d - 2 * shrink) * cosT
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

export function computeSupportPositions(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segMM: number): THREE.Vector3[] {
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  if (radius <= 0) return []
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const cosT = Math.cos(tilt)

  const insetLocal = makeInsetOutlinePoints(shape, plinthParams.width, plinthParams.depth, tipRadius, segMM)
  const insetProjected = projectToGround(insetLocal, cosT)
  const perim = perimeterLength(insetProjected)
  const n = Math.max(4, Math.round(perim / supportParams.supportSpacing))
  const s = perim / n
  const ringPositions = equidistantPoints(insetProjected, n)

  const gap = Math.min(s, supportParams.supportSpacing)
  const interiorPositions = buildConcentricRingPositions(shape, plinthParams.width, plinthParams.depth, cosT, s, tipRadius + gap, segMM)
  return ringPositions.concat(interiorPositions)
}

export function buildSupportMeshGeometry(shape: Shape, plinthParams: PlinthParams, supportParams: SupportParams, segs: number): THREE.BufferGeometry {
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  const raise = supportParams.raiseBy
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const tanT = Math.tan(tilt)
  if (radius <= 0) return new THREE.BufferGeometry()

  const positions = computeSupportPositions(shape, plinthParams, supportParams, RENDER_BASE_SEGMENT_MM)
  const contactHeights = positions.map((p) => raise - p.z * tanT)
  return buildSupportMesh(positions, radius, tipRadius, contactHeights, segs)
}

export function applyYUpToZUp(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4()
  matrix.makeRotationX(Math.PI / 2)
  const out = geometry.clone()
  out.applyMatrix4(matrix)
  out.computeVertexNormals()
  return out
}

export function applySupportTransform(geometry: THREE.BufferGeometry, supportParams: SupportParams): THREE.BufferGeometry {
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const raise = supportParams.raiseBy
  const matrix = new THREE.Matrix4()
  matrix.makeRotationX(tilt)
  matrix.setPosition(0, raise, 0)
  const out = geometry.clone()
  out.applyMatrix4(matrix)
  out.computeVertexNormals()
  return out
}

export function mergePlinthWithSupports(plinthGeometry: THREE.BufferGeometry, supportGeometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (supportGeometry.attributes.position.count === 0) return plinthGeometry
  const normalizedPlinth = plinthGeometry.index ? plinthGeometry.toNonIndexed() : plinthGeometry.clone()
  normalizedPlinth.computeVertexNormals()

  const normalizedSupport = supportGeometry.index ? supportGeometry.toNonIndexed() : supportGeometry.clone()
  normalizedSupport.computeVertexNormals()

  const merged = mergeGeometries([normalizedPlinth, normalizedSupport], false)
  normalizedPlinth.dispose()
  normalizedSupport.dispose()
  if (!merged) return plinthGeometry
  return merged
}