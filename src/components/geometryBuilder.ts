import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { getTrimProfile, sampleTrimRings, type TrimProfilePoint } from './trimProfiles.ts'

export function enableCDT(evaluator: Evaluator): void {
  ;(evaluator as unknown as { useCDTClipping: boolean }).useCDTClipping = true
}

export type Shape = 'rectangle' | 'ellipse'
export type RoundStyle = 'none' | 'chamfer' | 'fillet'
export type RoundLocation = 'top' | 'edges' | 'both'

export interface PlinthParams {
  shape: Shape
  width: number
  depth: number
  height: number
  addHole: boolean
  holeDiameter: number
  holeDepth: number
  angleTop: boolean
  topAngle: number
  roundStyle: RoundStyle
  roundLocation: RoundLocation
  roundSize: number
  trimEnabled: boolean
  trimProfileId: string
  trimHeight: number
  trimSize: number
  customTrimPoints?: TrimProfilePoint[]
}

export interface DrillJigParams {
  enabled: boolean
  wallSize: number
  jigHeight: number
  overlap: number
  tolerance: number
  lift: boolean
  flattenTop: boolean
  holeDiameter?: number
}

export interface SupportParams {
  enabled: boolean
  plinthAngle: number
  raiseBy: number
  supportSize: number
  supportTipSize: number
  supportSpacing: number
  supportCaps: boolean
}

export const DOWNLOAD_BASE_SEGMENT_MM = 0.1
export const DOWNLOAD_FILLET_SEGMENT_MM = 0.05
export const RENDER_BASE_SEGMENT_MM = 1.5
export const RENDER_FILLET_SEGMENT_MM = 0.8

function segsForArc(radius: number, sweepRad: number, filletSegMM: number, min = 4): number {
  return Math.max(min, Math.ceil((radius * sweepRad) / filletSegMM))
}

function segsForEllipse(hw: number, hd: number, baseSegMM: number, min = 16): number {
  const perim = Math.PI * (3 * (hw + hd) - Math.sqrt((3 * hw + hd) * (hw + 3 * hd)))
  return Math.max(min, Math.ceil(perim / baseSegMM))
}

function circleSegments(radius: number, segMM: number, min = 8): number {
  return Math.max(min, Math.ceil((2 * Math.PI * radius) / segMM))
}

export function topDrop(p: Pick<PlinthParams, 'angleTop' | 'topAngle' | 'depth'>): number {
  if (!p.angleTop) return 0
  const angleRad = (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
  return p.depth * Math.tan(angleRad)
}

function makeOutline(shape: Shape, w: number, d: number, style: RoundStyle, edgeRound: boolean, r: number, baseSegMM: number, filletSegMM: number): THREE.Vector2[] {
  if (shape === 'ellipse') {
    const pts: THREE.Vector2[] = []
    const n = segsForEllipse(w / 2, d / 2, baseSegMM)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(new THREE.Vector2(w / 2 * Math.cos(a), d / 2 * Math.sin(a)))
    }
    return pts
  }
  if (!edgeRound) {
    return [
      new THREE.Vector2(-w / 2, -d / 2),
      new THREE.Vector2(w / 2, -d / 2),
      new THREE.Vector2(w / 2, d / 2),
      new THREE.Vector2(-w / 2, d / 2),
    ]
  }
  if (style === 'chamfer') {
    const cx = r
    const cz = r
    return [
      new THREE.Vector2(-w / 2 + cx, -d / 2),
      new THREE.Vector2(w / 2 - cx, -d / 2),
      new THREE.Vector2(w / 2, -d / 2 + cz),
      new THREE.Vector2(w / 2, d / 2 - cz),
      new THREE.Vector2(w / 2 - cx, d / 2),
      new THREE.Vector2(-w / 2 + cx, d / 2),
      new THREE.Vector2(-w / 2, d / 2 - cz),
      new THREE.Vector2(-w / 2, -d / 2 + cz),
    ]
  }
  const cr = Math.min(r, w / 2 - 0.01, d / 2 - 0.01)
  const hw = w / 2
  const hd = d / 2
  const corners: Array<{ cx: number; cz: number; start: number; end: number }> = [
    { cx: hw - cr, cz: -hd + cr, start: -Math.PI / 2, end: 0 },
    { cx: hw - cr, cz: hd - cr, start: 0, end: Math.PI / 2 },
    { cx: -hw + cr, cz: hd - cr, start: Math.PI / 2, end: Math.PI },
    { cx: -hw + cr, cz: -hd + cr, start: Math.PI, end: 3 * Math.PI / 2 },
  ]
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i]
    const arcN = segsForArc(cr, Math.PI / 2, filletSegMM)
    pts.push(new THREE.Vector2(c.cx + cr * Math.cos(c.start), c.cz + cr * Math.sin(c.start)))
    for (let j = 1; j < arcN; j++) {
      const t = j / arcN
      const ang = c.start + (c.end - c.start) * t
      pts.push(new THREE.Vector2(c.cx + cr * Math.cos(ang), c.cz + cr * Math.sin(ang)))
    }
  }
  return pts
}

function makeTrimOutline(shape: Shape, w: number, d: number, offset: number, style: RoundStyle, edgeRound: boolean, r: number, np: number): THREE.Vector2[] {
  const wT = w + 2 * offset
  const dT = d + 2 * offset
  if (shape === 'ellipse') {
    const pts: THREE.Vector2[] = []
    const n = Math.max(np, 16)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(new THREE.Vector2(wT / 2 * Math.cos(a), dT / 2 * Math.sin(a)))
    }
    return pts
  }
  if (!edgeRound) {
    return [
      new THREE.Vector2(-wT / 2, -dT / 2),
      new THREE.Vector2(wT / 2, -dT / 2),
      new THREE.Vector2(wT / 2, dT / 2),
      new THREE.Vector2(-wT / 2, dT / 2),
    ]
  }
  if (style === 'chamfer') {
    const cx = r
    const cz = r
    return [
      new THREE.Vector2(-wT / 2 + cx, -dT / 2),
      new THREE.Vector2(wT / 2 - cx, -dT / 2),
      new THREE.Vector2(wT / 2, -dT / 2 + cz),
      new THREE.Vector2(wT / 2, dT / 2 - cz),
      new THREE.Vector2(wT / 2 - cx, dT / 2),
      new THREE.Vector2(-wT / 2 + cx, dT / 2),
      new THREE.Vector2(-wT / 2, dT / 2 - cz),
      new THREE.Vector2(-wT / 2, -dT / 2 + cz),
    ]
  }
  const cr = Math.min(r, wT / 2 - 0.01, dT / 2 - 0.01)
  const hw = wT / 2
  const hd = dT / 2
  const corners: Array<{ cx: number; cz: number; start: number; end: number }> = [
    { cx: hw - cr, cz: -hd + cr, start: -Math.PI / 2, end: 0 },
    { cx: hw - cr, cz: hd - cr, start: 0, end: Math.PI / 2 },
    { cx: -hw + cr, cz: hd - cr, start: Math.PI / 2, end: Math.PI },
    { cx: -hw + cr, cz: -hd + cr, start: Math.PI, end: 3 * Math.PI / 2 },
  ]
  const arcN = Math.max(4, Math.round(np / 4))
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i]
    pts.push(new THREE.Vector2(c.cx + cr * Math.cos(c.start), c.cz + cr * Math.sin(c.start)))
    for (let j = 1; j < arcN; j++) {
      const t = j / arcN
      const ang = c.start + (c.end - c.start) * t
      pts.push(new THREE.Vector2(c.cx + cr * Math.cos(ang), c.cz + cr * Math.sin(ang)))
    }
  }
  return pts
}

function computeNormals2D(pts: THREE.Vector2[]): THREE.Vector2[] {
  const n = pts.length
  const normals: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const cur = pts[i]
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    const e1 = new THREE.Vector2(cur.x - prev.x, cur.y - prev.y)
    const e2 = new THREE.Vector2(next.x - cur.x, next.y - cur.y)
    const n1 = new THREE.Vector2(e1.y, -e1.x).normalize()
    const n2 = new THREE.Vector2(e2.y, -e2.x).normalize()
    const avg = n1.add(n2).normalize()
    normals.push(avg)
  }
  return normals
}

function dedupOutline(pts: THREE.Vector2[], eps = 1e-4): THREE.Vector2[] {
  const out: THREE.Vector2[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const cur = pts[i]
    const prev = out[out.length - 1] ?? pts[(i - 1 + n) % n]
    if (Math.abs(cur.x - prev.x) > eps || Math.abs(cur.y - prev.y) > eps) {
      out.push(cur)
    }
  }
  while (out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if (Math.abs(first.x - last.x) < eps && Math.abs(first.y - last.y) < eps) {
      out.pop()
    } else {
      break
    }
  }
  return out
}

function triangulateOutline(pts: THREE.Vector2[], holes: THREE.Vector2[][] = []): { positions: number[]; indices: number[] } {
  const clean = dedupOutline(pts)
  const shape = new THREE.Shape(clean)
  for (const h of holes) {
    const cleanH = dedupOutline(h)
    if (cleanH.length >= 3) {
      const reversed = cleanH.slice().reverse()
      shape.holes.push(new THREE.Path(reversed))
    }
  }
  const geo = new THREE.ShapeGeometry(shape)
  const pos = geo.attributes.position.array as Float32Array
  const idx = geo.index ? (geo.index.array as Uint32Array) : null
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < pos.length; i += 3) {
    positions.push(pos[i], pos[i + 1], pos[i + 2])
  }
  if (idx) {
    for (let i = 0; i < idx.length; i++) indices.push(idx[i])
  } else {
    for (let i = 0; i < pos.length / 3; i++) indices.push(i)
  }
  geo.dispose()
  return { positions, indices }
}

function buildRoundedBody(p: PlinthParams, tol = 0, baseSegMM = DOWNLOAD_BASE_SEGMENT_MM, filletSegMM = DOWNLOAD_FILLET_SEGMENT_MM): THREE.BufferGeometry {
  const w = Math.max(0.1, p.width) + tol
  const d = Math.max(0.1, p.depth) + tol
  const h = Math.max(0.1, p.height)

  const rounding = p.roundStyle !== 'none' && p.roundSize > 0

  const edgeRound = rounding && p.shape === 'rectangle' &&
    (p.roundLocation === 'edges' || p.roundLocation === 'both')
  const topRound = rounding && (p.roundLocation === 'top' || p.roundLocation === 'both')

  const angleTop = p.angleTop
  const angleRad = angleTop
    ? (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    : 0
  const tanA = Math.tan(angleRad)
  const cosA = Math.cos(angleRad)

  const drop = angleTop ? p.depth * tanA : 0
  const minTopY = Math.max(0.01, h - drop)

  const trimOn = p.trimEnabled && p.trimHeight > 0 && p.trimSize > 0
  const trimHeight = trimOn ? Math.min(p.trimHeight, h - 0.01) : 0
  const trimSize = trimOn ? Math.max(0, p.trimSize) : 0

  const r = rounding
    ? Math.min(p.roundSize, w / 2 - 0.01, d / 2 - 0.01, (h - trimHeight) / 2 - 0.01, minTopY - 0.01)
    : 0

  const baseOutline = makeOutline(p.shape, w, d, p.roundStyle, edgeRound, r, baseSegMM, filletSegMM)
  const np = baseOutline.length

  const topYAt = (z: number) => Math.max(0, Math.min(h, h - (z + d / 2) * tanA))

  type Ring = { y: number | null; ys: number[] | null; pts: THREE.Vector2[] }
  const constYs = (yv: number, n: number) => Array.from({ length: n }, () => yv)

  const rings: Ring[] = []

  if (trimOn) {
    const profile = p.trimProfileId === 'custom' && p.customTrimPoints
      ? { id: 'custom', name: 'Custom', interpolate: 'bezier' as const, points: p.customTrimPoints }
      : getTrimProfile(p.trimProfileId)
    const trimSamples = sampleTrimRings(profile, trimHeight, baseSegMM)
    for (const s of trimSamples) {
      const offset = trimSize * s.offset
      const outline = offset > 1e-6
        ? makeTrimOutline(p.shape, w, d, offset, p.roundStyle, edgeRound, r, np)
        : baseOutline.map((pp) => pp.clone())
      rings.push({ y: s.y, ys: constYs(s.y, outline.length), pts: outline })
    }
  } else {
    rings.push({ y: 0, ys: constYs(0, np), pts: baseOutline })
  }

  if (topRound) {
    const normals = computeNormals2D(baseOutline)
    const shift = r * (tanA / (1 + tanA))
    const steps = p.roundStyle === 'chamfer' ? 1 : segsForArc(r, Math.PI / 2, filletSegMM, 4)
    const ringAt = (t: number): { pts: THREE.Vector2[]; ys: number[] } => {
      const cosT = Math.cos(t * Math.PI / 2)
      const sinT = Math.sin(t * Math.PI / 2)
      const y = sinT
      const s = shift * (1 - cosT)
      const a = r * (1 - Math.sqrt(1 - y * y))
      const b = r * (1 - y)
      const pts: THREE.Vector2[] = []
      const ys: number[] = []
      for (let k = 0; k < np; k++) {
        const p = baseOutline[k]
        const nx = normals[k].x
        const nz = normals[k].y
        const denom = Math.sqrt(nx * nx + nz * nz * cosA * cosA) || 1
        const adx = -nx / denom
        const adz = (-nz * cosA * cosA) / denom
        const x = p.x + a * adx
        const zFinal = p.y + a * adz + cosA * s
        pts.push(new THREE.Vector2(x, zFinal))
        ys.push(Math.max(0, topYAt(zFinal) - b))
      }
      return { pts, ys }
    }
    rings.push({ y: null, ...ringAt(0) })
    for (let i = 1; i < steps; i++) {
      rings.push({ y: null, ...ringAt(i / steps) })
    }
    rings.push({ y: null, ...ringAt(1) })
  } else if (angleTop) {
    rings.push({ y: null, ys: baseOutline.map((pp) => topYAt(pp.y)), pts: baseOutline.map((pp) => pp.clone()) })
  } else {
    rings.push({ y: h, ys: constYs(h, np), pts: baseOutline.map((pp) => pp.clone()) })
  }

  const topRing = rings[rings.length - 1]

  const positions: number[] = []
  for (let j = 0; j < rings.length; j++) {
    const ring = rings[j]
    for (let k = 0; k < ring.pts.length; k++) {
      const pt = ring.pts[k]
      const y = ring.ys ? ring.ys[k] : (ring.y ?? 0)
      positions.push(pt.x, y, pt.y)
    }
  }

  const indices: number[] = []
  for (let j = 0; j < rings.length - 1; j++) {
    const r0 = rings[j]
    const r1 = rings[j + 1]
    const y0 = r0.ys ? r0.ys[0] : (r0.y ?? 0)
    const y1 = r1.ys ? r1.ys[0] : (r1.y ?? 0)
    if (Math.abs(y0 - y1) < 1e-6) continue
    for (let k = 0; k < np; k++) {
      const a = j * np + k
      const b = j * np + (k + 1) % np
      const c = (j + 1) * np + k
      const dd = (j + 1) * np + (k + 1) % np
      indices.push(a, c, b, b, c, dd)
    }
  }

  const bottomTri = triangulateOutline(rings[0].pts)
  const sideVertCount = rings.length * np
  const bottomOffset = sideVertCount

  for (let i = 0; i < bottomTri.positions.length; i += 3) {
    positions.push(bottomTri.positions[i], 0, bottomTri.positions[i + 1])
  }
  for (const idx of bottomTri.indices) {
    indices.push(bottomOffset + idx)
  }

  let cx = 0, cz = 0
  for (const pt of topRing.pts) { cx += pt.x; cz += pt.y }
  cx /= np; cz /= np
  const centerY = angleTop
    ? Math.max(0, Math.min(h, h - (cz + d / 2) * tanA))
    : h
  const centerIdx = sideVertCount + bottomTri.positions.length / 3
  positions.push(cx, centerY, cz)
  const topRingBase = (rings.length - 1) * np
  for (let k = 0; k < np; k++) {
    indices.push(centerIdx, topRingBase + ((k + 1) % np), topRingBase + k)
  }

  let nextVert = centerIdx + 1
  for (let j = 0; j < rings.length - 1; j++) {
    const r0 = rings[j]
    const r1 = rings[j + 1]
    const y0 = r0.ys ? r0.ys[0] : (r0.y ?? 0)
    const y1 = r1.ys ? r1.ys[0] : (r1.y ?? 0)
    if (Math.abs(y0 - y1) < 1e-6) {
      const inner = r1.pts
      const outer = r0.pts
      const stepTri = triangulateOutline(outer, [inner])
      for (let i = 0; i < stepTri.positions.length; i += 3) {
        positions.push(stepTri.positions[i], y0, stepTri.positions[i + 1])
      }
      const stepBase = nextVert
      nextVert += stepTri.positions.length / 3
      for (let i = 0; i < stepTri.indices.length; i += 3) {
        indices.push(stepBase + stepTri.indices[i], stepBase + stepTri.indices[i + 2], stepBase + stepTri.indices[i + 1])
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  const flat = geo.toNonIndexed()
  geo.dispose()
  flat.computeVertexNormals()
  return flat
}

export function buildPlinthBody(p: PlinthParams, tol = 0, baseSegMM = DOWNLOAD_BASE_SEGMENT_MM, filletSegMM = DOWNLOAD_FILLET_SEGMENT_MM, _useCDT = true): THREE.BufferGeometry {
  return buildRoundedBody(p, tol, baseSegMM, filletSegMM)
}

export function buildGeometry(p: PlinthParams, baseSegMM = DOWNLOAD_BASE_SEGMENT_MM, filletSegMM = DOWNLOAD_FILLET_SEGMENT_MM, useCDT = true): THREE.BufferGeometry {
  const bodyGeo = buildPlinthBody(p, 0, baseSegMM, filletSegMM, useCDT)
  const h = Math.max(0.1, p.height)

  if (!p.addHole) return bodyGeo

  const drop = topDrop(p)
  const angleRad = p.angleTop
    ? (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    : 0
  const tanA = Math.tan(angleRad)

  const radius = Math.max(0.05, p.holeDiameter / 2)
  const holeDepth = Math.max(0.1, p.holeDepth)
  const topCenterY = h - drop / 2
  const extraTop = 2 + radius * tanA
  const holeGeo = new THREE.CylinderGeometry(radius, radius, holeDepth + extraTop, circleSegments(radius * 2, baseSegMM), 1)
  holeGeo.translate(0, topCenterY + (extraTop - holeDepth) / 2, 0)

  const holeBrush = new Brush(holeGeo)
  holeBrush.updateMatrixWorld(true)
  const bodyBrush = new Brush(bodyGeo)
  bodyBrush.updateMatrixWorld(true)

  const evaluator = new Evaluator()
  if (useCDT) enableCDT(evaluator)
  evaluator.attributes = ['position', 'normal']
  evaluator.useGroups = false
  const result = evaluator.evaluate(bodyBrush, holeBrush, SUBTRACTION)

  const geo = result.geometry
  if (geo !== bodyGeo) bodyGeo.dispose()
  holeGeo.dispose()
  return geo
}

function buildJigMesh(
  shape: Shape,
  p: PlinthParams,
  jig: DrillJigParams,
  baseSegMM: number,
  filletSegMM: number,
  _computeCavity: boolean,
): { jig: THREE.BufferGeometry; cavity: THREE.BufferGeometry | null } {
  const w = Math.max(0.1, p.width)
  const d = Math.max(0.1, p.depth)
  const h = Math.max(0.1, p.height)
  const wall = Math.max(0.1, jig.wallSize)
  const height = Math.max(0.1, jig.jigHeight)
  const overlap = Math.max(0, jig.overlap)

  const drop = topDrop({ angleTop: p.angleTop, topAngle: p.topAngle, depth: d })
  const angleRad = p.angleTop
    ? (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    : 0

  const cosA = Math.cos(angleRad)
  const flatten = jig.flattenTop
  const baseY = h - drop / 2
  const flatTopY = h + height
  const angledTopY = baseY + height / Math.max(0.01, cosA)
  const topY = flatten ? flatTopY : angledTopY

  const jigOW = w + 2 * wall
  const jigOD = d + 2 * wall
  const jigZScale = p.angleTop && !flatten ? 1 / Math.max(0.01, cosA) : 1
  const cavityZScale = p.angleTop ? 1 / Math.max(0.01, cosA) : 1

  const ow = jigOW
  const od = jigOD * jigZScale

  const outerOutlineRaw = makeOutline(shape, ow, od, 'none', false, 0, baseSegMM, filletSegMM)
  const outerOutline = dedupOutline(outerOutlineRaw)

  const owBot = jigOW
  const odBot = jigOD * cavityZScale

  let outerBotOutline: THREE.Vector2[]
  if (shape === 'ellipse') {
    const nTop = outerOutline.length
    outerBotOutline = []
    for (let k = 0; k < nTop; k++) {
      const a = (k / nTop) * Math.PI * 2
      outerBotOutline.push(new THREE.Vector2(owBot / 2 * Math.cos(a), odBot / 2 * Math.sin(a)))
    }
  } else {
    const hw = owBot / 2
    const hd = odBot / 2
    outerBotOutline = [
      new THREE.Vector2(-hw, -hd),
      new THREE.Vector2(hw, -hd),
      new THREE.Vector2(hw, hd),
      new THREE.Vector2(-hw, hd),
    ]
  }
  outerBotOutline = dedupOutline(outerBotOutline)

  const holeRadius = Math.max(0.05, (jig.holeDiameter ?? p.holeDiameter) / 2)
  const holeBottomZScale = p.angleTop ? 1 / Math.max(0.01, cosA) : 1
  const holeTopZScale = p.angleTop && !flatten ? 1 / Math.max(0.01, cosA) : 1
  const holeSegs = Math.max(8, Math.ceil((2 * Math.PI * holeRadius) / baseSegMM))
  const holeOutlineBot: THREE.Vector2[] = []
  const holeOutlineTop: THREE.Vector2[] = []
  for (let k = 0; k < holeSegs; k++) {
    const a = (k / holeSegs) * Math.PI * 2
    holeOutlineBot.push(new THREE.Vector2(holeRadius * Math.cos(a), holeRadius * Math.sin(a) * holeBottomZScale))
    holeOutlineTop.push(new THREE.Vector2(holeRadius * Math.cos(a), holeRadius * Math.sin(a) * holeTopZScale))
  }
  const holeDeduped = dedupOutline(holeOutlineTop)
  const holeDedupedBot = dedupOutline(holeOutlineBot)
  const M = holeDeduped.length

  const cavityOW = w + jig.tolerance
  const cavityOD = d * cavityZScale + jig.tolerance
  const cavityOutlineRaw = makeOutline(shape, cavityOW, cavityOD, 'none', false, 0, baseSegMM, filletSegMM)
  const cavityOutline = dedupOutline(cavityOutlineRaw)

  const topRot = flatten ? 0 : angleRad
  const bottomY = baseY

  const toWorldTop = (x: number, z: number) => {
    const yR = -z * Math.sin(topRot)
    const zR = z * Math.cos(topRot)
    return [x, topY + yR, zR] as const
  }
  const toWorldBottom = (x: number, z: number) => {
    const yR = -z * Math.sin(angleRad)
    const zR = z * Math.cos(angleRad)
    return [x, bottomY + yR, zR] as const
  }
  const cavityBottomY = baseY - overlap
  const toWorldCavityBottom = (x: number, z: number) => {
    const yR = -z * Math.sin(angleRad)
    const zR = z * Math.cos(angleRad)
    return [x, cavityBottomY + yR, zR] as const
  }
  const jigBottomY = baseY - overlap
  const toWorldJigBottom = (x: number, z: number) => {
    const yR = -z * Math.sin(angleRad)
    const zR = z * Math.cos(angleRad)
    return [x, jigBottomY + yR, zR] as const
  }

  const toWorld = toWorldTop

  const capTri = triangulateOutline(outerOutline, [holeDeduped])
  const positions: number[] = []
  for (let i = 0; i < capTri.positions.length; i += 3) {
    const [wx, wy, wz] = toWorld(capTri.positions[i], capTri.positions[i + 1])
    positions.push(wx, wy, wz)
  }

  const holeTopStart = positions.length / 3
  for (let k = 0; k < M; k++) {
    const [wx, wy, wz] = toWorldTop(holeDeduped[k].x, holeDeduped[k].y)
    positions.push(wx, wy, wz)
  }
  const holeBotStart = positions.length / 3
  for (let k = 0; k < M; k++) {
    const [wx, wy, wz] = toWorldBottom(holeDedupedBot[k].x, holeDedupedBot[k].y)
    positions.push(wx, wy, wz)
  }

  const ceilingTri = triangulateOutline(cavityOutline, [holeDedupedBot])
  const ceilingStart = positions.length / 3
  for (let i = 0; i < ceilingTri.positions.length; i += 3) {
    const [wx, wy, wz] = toWorldBottom(ceilingTri.positions[i], ceilingTri.positions[i + 1])
    positions.push(wx, wy, wz)
  }

  const cavityN = cavityOutline.length
  const cavityTopStart = positions.length / 3
  for (let k = 0; k < cavityN; k++) {
    const [wx, wy, wz] = toWorldBottom(cavityOutline[k].x, cavityOutline[k].y)
    positions.push(wx, wy, wz)
  }
  const cavityBotStart = positions.length / 3
  for (let k = 0; k < cavityN; k++) {
    const [wx, wy, wz] = toWorldCavityBottom(cavityOutline[k].x, cavityOutline[k].y)
    positions.push(wx, wy, wz)
  }

  const botCapTri = triangulateOutline(outerBotOutline, [cavityOutline])
  const botCapStart = positions.length / 3
  for (let i = 0; i < botCapTri.positions.length; i += 3) {
    const [wx, wy, wz] = toWorldJigBottom(botCapTri.positions[i], botCapTri.positions[i + 1])
    positions.push(wx, wy, wz)
  }

  const outerN = outerOutline.length
  const outerTopStart = positions.length / 3
  for (let k = 0; k < outerN; k++) {
    const [wx, wy, wz] = toWorldTop(outerOutline[k].x, outerOutline[k].y)
    positions.push(wx, wy, wz)
  }
  const outerBotN = outerBotOutline.length
  const outerBotStart = positions.length / 3
  for (let k = 0; k < outerBotN; k++) {
    const [wx, wy, wz] = toWorldJigBottom(outerBotOutline[k].x, outerBotOutline[k].y)
    positions.push(wx, wy, wz)
  }

  const indices: number[] = []
  for (let i = 0; i < capTri.indices.length; i += 3) {
    indices.push(capTri.indices[i], capTri.indices[i + 2], capTri.indices[i + 1])
  }

  for (let k = 0; k < M; k++) {
    const k1 = (k + 1) % M
    indices.push(holeBotStart + k, holeBotStart + k1, holeTopStart + k)
    indices.push(holeBotStart + k1, holeTopStart + k1, holeTopStart + k)
  }

  for (let i = 0; i < ceilingTri.indices.length; i += 3) {
    indices.push(ceilingStart + ceilingTri.indices[i], ceilingStart + ceilingTri.indices[i + 1], ceilingStart + ceilingTri.indices[i + 2])
  }

  for (let k = 0; k < cavityN; k++) {
    const k1 = (k + 1) % cavityN
    indices.push(cavityTopStart + k, cavityBotStart + k, cavityTopStart + k1)
    indices.push(cavityTopStart + k1, cavityBotStart + k, cavityBotStart + k1)
  }

  for (let i = 0; i < botCapTri.indices.length; i += 3) {
    indices.push(botCapStart + botCapTri.indices[i], botCapStart + botCapTri.indices[i + 1], botCapStart + botCapTri.indices[i + 2])
  }

  for (let k = 0; k < outerN; k++) {
    const k1 = (k + 1) % outerN
    indices.push(outerTopStart + k, outerTopStart + k1, outerBotStart + k)
    indices.push(outerTopStart + k1, outerBotStart + k1, outerBotStart + k)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  const flat = geo.toNonIndexed()
  geo.dispose()
  flat.computeVertexNormals()

  return { jig: flat, cavity: null }
}

export function buildJigGeometry(
  shape: Shape,
  p: PlinthParams,
  jig: DrillJigParams,
  baseSegMM = DOWNLOAD_BASE_SEGMENT_MM,
  filletSegMM = DOWNLOAD_FILLET_SEGMENT_MM,
  _useCDT = true,
  computeCavity = true,
): { jig: THREE.BufferGeometry; cavity: THREE.BufferGeometry | null } {
  const _t0 = performance.now()
  const result = buildJigMesh(shape, p, jig, baseSegMM, filletSegMM, computeCavity)
  const _t1 = performance.now()

  console.log(
    `[jig-steps] mesh=${(_t1 - _t0).toFixed(1)}ms ` +
    `| outer+jig=${result.jig.attributes.position.count}v` +
    (jig.flattenTop ? ' (flatten)' : '')
  )

  return result
}