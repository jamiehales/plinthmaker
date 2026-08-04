import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'

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

const BASE_SEGMENT_MM = 0.1
const FILLET_SEGMENT_MM = 0.05

function segsForArc(radius: number, sweepRad: number, min = 4): number {
  return Math.max(min, Math.ceil((radius * sweepRad) / FILLET_SEGMENT_MM))
}

function segsForEllipse(hw: number, hd: number, min = 16): number {
  const perim = Math.PI * (3 * (hw + hd) - Math.sqrt((3 * hw + hd) * (hw + 3 * hd)))
  return Math.max(min, Math.ceil(perim / BASE_SEGMENT_MM))
}

export function topDrop(p: Pick<PlinthParams, 'angleTop' | 'topAngle' | 'depth'>): number {
  if (!p.angleTop) return 0
  const angleRad = (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
  return p.depth * Math.tan(angleRad)
}

function makeOutline(shape: Shape, w: number, d: number, style: RoundStyle, edgeRound: boolean, r: number): THREE.Vector2[] {
  if (shape === 'ellipse') {
    const pts: THREE.Vector2[] = []
    const n = segsForEllipse(w / 2, d / 2)
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
    const arcN = segsForArc(cr, Math.PI / 2)
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

function buildRoundedBody(p: PlinthParams, tol = 0): THREE.BufferGeometry {
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

  const baseOutline = makeOutline(p.shape, w, d, p.roundStyle, edgeRound, r)
  const np = baseOutline.length

  type Ring = { y: number; pts: THREE.Vector2[] }
  const rings: Ring[] = [{ y: 0, pts: baseOutline }]

  if (topRound) {
    rings.push({ y: h - r, pts: baseOutline.map((p) => p.clone()) })
    const steps = p.roundStyle === 'chamfer' ? 1 : segsForArc(r, Math.PI / 2, 4)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const shrink = r - r * Math.cos(t * Math.PI / 2)
      const y = (h - r) + r * Math.sin(t * Math.PI / 2)
      rings.push({ y, pts: shrinkOutline(baseOutline, shrink) })
    }
    rings.push({ y: h, pts: shrinkOutline(baseOutline, r) })
  } else {
    rings.push({ y: h, pts: baseOutline.map((p) => p.clone()) })
  }

  const positions: number[] = []
  for (const ring of rings) {
    for (const pt of ring.pts) {
      positions.push(pt.x, ring.y, pt.y)
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
  const topTri = triangulateOutline(rings[rings.length - 1].pts)
  const sideVertCount = rings.length * np
  const bottomOffset = sideVertCount
  const topOffset = sideVertCount + bottomTri.positions.length / 3

  for (let i = 0; i < bottomTri.positions.length; i += 3) {
    positions.push(bottomTri.positions[i], 0, bottomTri.positions[i + 1])
  }
  for (const idx of bottomTri.indices) {
    indices.push(bottomOffset + idx)
  }
  for (let i = 0; i < topTri.positions.length; i += 3) {
    positions.push(topTri.positions[i], h, topTri.positions[i + 1])
  }
  for (let i = 0; i < topTri.indices.length; i += 3) {
    indices.push(
      topOffset + topTri.indices[i + 1],
      topOffset + topTri.indices[i],
      topOffset + topTri.indices[i + 2],
    )
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  const flat = geo.toNonIndexed()
  geo.dispose()
  flat.computeVertexNormals()
  return flat
}

export function buildPlinthBody(p: PlinthParams, tol = 0): THREE.BufferGeometry {
  let bodyGeo = buildRoundedBody(p, tol)

  if (p.angleTop) {
    const d = Math.max(0.1, p.depth) + tol
    const h = Math.max(0.1, p.height)
    const drop = topDrop({ angleTop: true, topAngle: p.topAngle, depth: d })
    const angleRad = (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    const w = Math.max(0.1, p.width) + tol

    const bigW = w + 4
    const bigD = d / cosA + 4
    const bigH = h + drop + 40

    const cutGeo = new THREE.BoxGeometry(bigW, bigH, bigD)
    cutGeo.rotateX(angleRad)
    cutGeo.translate(0, h - drop / 2 + (bigH / 2) * cosA, (bigH / 2) * sinA)
    cutGeo.computeVertexNormals()

    const cutBrush = new Brush(cutGeo)
    cutBrush.updateMatrixWorld(true)
    const bodyBrush = new Brush(bodyGeo)
    bodyBrush.updateMatrixWorld(true)

    const evaluator = new Evaluator()
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

export function buildGeometry(p: PlinthParams): THREE.BufferGeometry {
  const bodyGeo = buildPlinthBody(p)
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
  const holeGeo = new THREE.CylinderGeometry(radius, radius, holeDepth + 0.01, 32, 1)

  if (p.angleTop) {
    holeGeo.rotateX(angleRad)
    holeGeo.translate(0, h - drop / 2 - (holeDepth / 2) * cosA, -(holeDepth / 2) * sinA)
  } else {
    holeGeo.translate(0, h - holeDepth / 2, 0)
  }

  const holeBrush = new Brush(holeGeo)
  holeBrush.updateMatrixWorld(true)
  const bodyBrush = new Brush(bodyGeo)
  bodyBrush.updateMatrixWorld(true)

  const evaluator = new Evaluator()
  evaluator.attributes = ['position', 'normal']
  evaluator.useGroups = false
  const result = evaluator.evaluate(bodyBrush, holeBrush, SUBTRACTION)

  const geo = result.geometry
  if (geo !== bodyGeo) bodyGeo.dispose()
  holeGeo.dispose()
  return geo
}

export default function Plinth(params: PlinthParams) {
  const geometry = useMemo(() => buildGeometry(params), [params])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#9aa4b0" metalness={0.1} roughness={0.6} />
    </mesh>
  )
}