import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg'

export function enableCDT(evaluator: Evaluator): void {
  ;(evaluator as unknown as { useCDTClipping: boolean }).useCDTClipping = true
}

export type Shape = 'rectangle' | 'ellipse'
export type RoundStyle = 'none' | 'chamfer' | 'fillet'
export type RoundLocation = 'none' | 'top' | 'edges' | 'both'

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
}

export interface DrillJigParams {
  enabled: boolean
  wallSize: number
  jigHeight: number
  overlap: number
  tolerance: number
  lift: boolean
  flattenTop: boolean
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

function shrinkOutline(pts: THREE.Vector2[], amount: number): THREE.Vector2[] {
  if (amount <= 0) return pts.map((p) => p.clone())
  const normals = computeNormals2D(pts)
  return pts.map((p, i) => new THREE.Vector2(p.x - normals[i].x * amount, p.y - normals[i].y * amount))
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

function triangulateOutline(pts: THREE.Vector2[]): { positions: number[]; indices: number[] } {
  const clean = dedupOutline(pts)
  const shape = new THREE.Shape(clean)
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

  const rounding = p.roundStyle !== 'none' && p.roundLocation !== 'none' && p.roundSize > 0
  const r = rounding
    ? Math.min(p.roundSize, w / 2 - 0.01, d / 2 - 0.01, h / 2 - 0.01)
    : 0

  const edgeRound = rounding && p.shape === 'rectangle' &&
    (p.roundLocation === 'edges' || p.roundLocation === 'both')
  const topRound = rounding && (p.roundLocation === 'top' || p.roundLocation === 'both')

  const baseOutline = makeOutline(p.shape, w, d, p.roundStyle, edgeRound, r, baseSegMM, filletSegMM)
  const np = baseOutline.length

  const angleTop = p.angleTop && !topRound
  const angleRad = angleTop
    ? (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    : 0
  const tanA = Math.tan(angleRad)

  type Ring = { y: number; pts: THREE.Vector2[] }
  const rings: Ring[] = [{ y: 0, pts: baseOutline }]

  if (topRound) {
    rings.push({ y: h - r, pts: baseOutline.map((p) => p.clone()) })
    const steps = p.roundStyle === 'chamfer' ? 1 : segsForArc(r, Math.PI / 2, filletSegMM, 4)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const shrink = r - r * Math.cos(t * Math.PI / 2)
      const y = (h - r) + r * Math.sin(t * Math.PI / 2)
      rings.push({ y, pts: shrinkOutline(baseOutline, shrink) })
    }
    rings.push({ y: h, pts: shrinkOutline(baseOutline, r) })
  } else if (angleTop) {
    rings.push({ y: h, pts: baseOutline.map((p) => p.clone()) })
  } else {
    rings.push({ y: h, pts: baseOutline.map((p) => p.clone()) })
  }

  const topRing = rings[rings.length - 1]
  const topYForPt: number[] = []
  if (angleTop) {
    for (let k = 0; k < topRing.pts.length; k++) {
      const z = topRing.pts[k].y
      topYForPt.push(Math.max(0, Math.min(h, h - (z + d / 2) * tanA)))
    }
  }

  const positions: number[] = []
  for (let j = 0; j < rings.length; j++) {
    const ring = rings[j]
    const isAngledTopRing = angleTop && j === rings.length - 1
    for (let k = 0; k < ring.pts.length; k++) {
      const pt = ring.pts[k]
      const y = isAngledTopRing ? topYForPt[k] : ring.y
      positions.push(pt.x, y, pt.y)
    }
  }

  const indices: number[] = []
  for (let j = 0; j < rings.length - 1; j++) {
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

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  const flat = geo.toNonIndexed()
  geo.dispose()
  flat.computeVertexNormals()
  return flat
}

export function buildPlinthBody(p: PlinthParams, tol = 0, baseSegMM = DOWNLOAD_BASE_SEGMENT_MM, filletSegMM = DOWNLOAD_FILLET_SEGMENT_MM, useCDT = true): THREE.BufferGeometry {
  let bodyGeo = buildRoundedBody(p, tol, baseSegMM, filletSegMM)

  const rounding = p.roundStyle !== 'none' && p.roundLocation !== 'none' && p.roundSize > 0
  const topRound = rounding && (p.roundLocation === 'top' || p.roundLocation === 'both')

  if (p.angleTop && topRound) {
    const d = Math.max(0.1, p.depth) + tol
    const h = Math.max(0.1, p.height)
    const drop = topDrop({ angleTop: true, topAngle: p.topAngle, depth: d })
    const angleRad = (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    const w = Math.max(0.1, p.width) + tol

    const eps = 0.01
    const bigW = w + 4
    const bigD = d / cosA + 4
    const bigH = h + drop + 40

    const cutGeo = new THREE.BoxGeometry(bigW, bigH, bigD)
    cutGeo.rotateX(angleRad)
    cutGeo.translate(0, h - drop / 2 + eps + (bigH / 2) * cosA, (bigH / 2) * sinA)
    cutGeo.computeVertexNormals()

    const cutBrush = new Brush(cutGeo)
    cutBrush.updateMatrixWorld(true)
    const bodyBrush = new Brush(bodyGeo)
    bodyBrush.updateMatrixWorld(true)

    const evaluator = new Evaluator()
    if (useCDT) enableCDT(evaluator)
    evaluator.attributes = ['position', 'normal']
    evaluator.useGroups = false
    const result = evaluator.evaluate(bodyBrush, cutBrush, SUBTRACTION)

    const cut = result.geometry
    if (cut !== bodyGeo) bodyGeo.dispose()
    cutGeo.dispose()
    bodyGeo = cut
  }

  return bodyGeo
}

export function buildGeometry(p: PlinthParams, baseSegMM = DOWNLOAD_BASE_SEGMENT_MM, filletSegMM = DOWNLOAD_FILLET_SEGMENT_MM, useCDT = true): THREE.BufferGeometry {
  const bodyGeo = buildPlinthBody(p, 0, baseSegMM, filletSegMM, useCDT)
  const h = Math.max(0.1, p.height)

  if (!p.addHole) return bodyGeo

  const drop = topDrop(p)
  const angleRad = p.angleTop
    ? (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    : 0
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)

  const radius = Math.max(0.05, p.holeDiameter / 2)
  const holeDepth = Math.max(0.1, p.holeDepth)
  const extraTop = 2
  const holeGeo = new THREE.CylinderGeometry(radius, radius, holeDepth + extraTop, circleSegments(radius * 2, baseSegMM), 1)

  holeGeo.rotateX(angleRad)
  const halfExtra = (extraTop - holeDepth) / 2
  holeGeo.translate(0, h - drop / 2 + halfExtra * cosA, halfExtra * sinA)

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

function buildFlattenSlab(
  shape: Shape,
  ow: number,
  odFlat: number,
  flatTopY: number,
  baseY: number,
  overlap: number,
  cosA: number,
  tanA: number,
  baseSegMM: number,
): THREE.BufferGeometry {
  const overlapDepth = overlap / Math.max(0.01, cosA)
  const bottomYAt = (z: number) => baseY - overlapDepth - z * tanA

  let geo: THREE.BufferGeometry
  if (shape === 'ellipse') {
    const segs = Math.max(8, Math.ceil((Math.PI * (ow + odFlat)) / baseSegMM))
    geo = new THREE.CylinderGeometry(1, 1, 1, segs, 1)
    geo.scale(ow / 2, 1, odFlat / 2)
  } else {
    geo = new THREE.BoxGeometry(ow, 1, odFlat)
  }

  const pos = geo.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  for (let i = 0; i < arr.length; i += 3) {
    const y = arr[i + 1]
    const z = arr[i + 2]
    arr[i + 1] = y > 0 ? flatTopY : bottomYAt(z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function buildHoleCylinder(
  radius: number,
  segs: number,
  topY: number,
  bottomYAt: (z: number) => number,
  overshootTop: number,
  overshootBottom: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, segs, 3)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  for (let i = 0; i < arr.length; i += 3) {
    const y = arr[i + 1]
    const z = arr[i + 2]
    if (y < -0.25) {
      arr[i + 1] = bottomYAt(z) - overshootBottom
    } else if (y < 0) {
      arr[i + 1] = bottomYAt(z)
    } else if (y < 0.25) {
      arr[i + 1] = topY
    } else {
      arr[i + 1] = topY + overshootTop
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

export function buildJigGeometry(
  shape: Shape,
  p: PlinthParams,
  jig: DrillJigParams,
  baseSegMM = DOWNLOAD_BASE_SEGMENT_MM,
  filletSegMM = DOWNLOAD_FILLET_SEGMENT_MM,
  useCDT = true,
  computeCavity = true,
): { jig: THREE.BufferGeometry; cavity: THREE.BufferGeometry | null } {
  const w = Math.max(0.1, p.width)
  const d = Math.max(0.1, p.depth)
  const h = Math.max(0.1, p.height)
  const wall = Math.max(0.1, jig.wallSize)
  const height = Math.max(0.1, jig.jigHeight)
  const overlap = Math.max(0, jig.overlap)
  const tol = Math.max(0, jig.tolerance)

  const drop = topDrop({ angleTop: p.angleTop, topAngle: p.topAngle, depth: d })
  const angleRad = p.angleTop
    ? (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    : 0

  const cosA = Math.cos(angleRad)

  const flatten = jig.flattenTop
  const slabH = overlap + height
  const ow = w + 2 * wall
  const od = (d + 2 * wall) / Math.max(0.01, cosA)

  const odFlat = d + 2 * wall
  const flatTopY = h + height
  const baseY = h - drop / 2
  const tanA = Math.tan(angleRad)

  let outerGeo: THREE.BufferGeometry
  if (flatten) {
    outerGeo = buildFlattenSlab(shape, ow, odFlat, flatTopY, baseY, overlap, cosA, tanA, baseSegMM)
  } else {
    if (shape === 'ellipse') {
      const segs = Math.max(8, Math.ceil((Math.PI * (ow + od)) / baseSegMM))
      const cyl = new THREE.CylinderGeometry(1, 1, slabH, segs, 1)
      cyl.scale(ow / 2, 1, od / 2)
      cyl.computeVertexNormals()
      outerGeo = cyl
    } else {
      outerGeo = new THREE.BoxGeometry(ow, slabH, od)
    }
    outerGeo.translate(0, (height - overlap) / 2, 0)
    outerGeo.rotateX(angleRad)
    outerGeo.translate(0, h - drop / 2, 0)
  }

  const _tInner0 = performance.now()
  const innerGeo = buildPlinthBody({ ...p, roundStyle: 'none', roundLocation: 'none' }, tol, baseSegMM, filletSegMM, useCDT)
  const _tInner1 = performance.now()

  const holeRadius = Math.max(0.05, p.holeDiameter / 2)
  const holeSegs = Math.max(8, Math.ceil((2 * Math.PI * holeRadius) / baseSegMM))
  let holeGeo: THREE.BufferGeometry
  if (flatten) {
    const overlapDepth = overlap / Math.max(0.01, cosA)
    const slabBottomYAt = (z: number) => baseY - overlapDepth - z * tanA
    holeGeo = buildHoleCylinder(holeRadius, holeSegs, flatTopY, slabBottomYAt, 2, 2)
  } else {
    holeGeo = buildHoleCylinder(holeRadius, holeSegs, height, () => -overlap, 2, 2)
    holeGeo.rotateX(angleRad)
    holeGeo.translate(0, baseY, 0)
  }

  const outerBrush = new Brush(outerGeo)
  outerBrush.updateMatrixWorld(true)
  const innerBrush = new Brush(innerGeo)
  innerBrush.updateMatrixWorld(true)
  const holeBrush = new Brush(holeGeo)
  holeBrush.updateMatrixWorld(true)

  const evaluator = new Evaluator()
  if (useCDT) enableCDT(evaluator)
  evaluator.attributes = ['position', 'normal']
  evaluator.useGroups = false

  const outerResult = outerBrush

  const step1 = evaluator.evaluate(outerResult, innerBrush, SUBTRACTION)
  const _tCsg2 = performance.now()
  const step2 = evaluator.evaluate(step1, holeBrush, SUBTRACTION)
  const _tCsg3 = performance.now()

  const resultBrush = step2

  console.log(
    `[jig-steps] inner=${(_tInner1 - _tInner0).toFixed(1)}ms ` +
    `outer-inner=${(_tCsg2 - _tInner1).toFixed(1)}ms ` +
    `-hole=${(_tCsg3 - _tCsg2).toFixed(1)}ms ` +
    `| outer=${outerGeo.attributes.position.count}v ` +
    `inner=${innerGeo.attributes.position.count}v` +
    (flatten ? ' (flatten)' : '')
  )

  let cavityGeo: THREE.BufferGeometry | null = null
  if (computeCavity) {
    const cavityBrush = evaluator.evaluate(innerBrush, outerResult, INTERSECTION)
    cavityGeo = cavityBrush.geometry
  }

  const geo = resultBrush.geometry
  if (geo !== outerGeo) outerGeo.dispose()
  innerGeo.dispose()
  holeGeo.dispose()
  return { jig: geo, cavity: cavityGeo }
}