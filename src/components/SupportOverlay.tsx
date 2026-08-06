import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type Shape, type PlinthParams, type SupportParams, RENDER_BASE_SEGMENT_MM } from './geometryBuilder.ts'

interface SupportOverlayProps {
  shape: Shape
  plinthParams: PlinthParams
  supportParams: SupportParams
  baseSegMM?: number
}

function makeBaseOutlinePoints(shape: Shape, w: number, d: number, segMM: number): THREE.Vector3[] {
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

function makeInsetOutlinePoints(shape: Shape, w: number, d: number, inset: number, segMM: number): THREE.Vector3[] {
  const iw = Math.max(0.01, w - 2 * inset)
  const id = Math.max(0.01, d - 2 * inset)
  return makeBaseOutlinePoints(shape, iw, id, segMM)
}

function projectToGround(points: THREE.Vector3[], cosT: number): THREE.Vector3[] {
  return points.map((p) => new THREE.Vector3(p.x, 0, p.z * cosT))
}

function perimeterLength(points: THREE.Vector3[]): number {
  let len = 0
  for (let i = 0; i < points.length; i++) {
    len += points[i].distanceTo(points[(i + 1) % points.length])
  }
  return len
}

function equidistantPoints(points: THREE.Vector3[], n: number): THREE.Vector3[] {
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

function buildSupportCircles(positions: THREE.Vector3[], radius: number, segs: number): THREE.BufferGeometry {
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

export default function SupportOverlay({ shape, plinthParams, supportParams, baseSegMM = RENDER_BASE_SEGMENT_MM }: SupportOverlayProps) {
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const cosT = Math.cos(tilt)
  const radius = supportParams.supportSize / 2

  const footprint = useMemo(() => {
    const local = makeBaseOutlinePoints(shape, plinthParams.width, plinthParams.depth, baseSegMM)
    const projected = projectToGround(local, cosT)
    const geo = new THREE.BufferGeometry().setFromPoints(projected)
    return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0x4ad6ff, transparent: true, opacity: 0.8, depthTest: false }))
  }, [shape, plinthParams.width, plinthParams.depth, baseSegMM, cosT])

  const supportCircles = useMemo(() => {
    if (radius <= 0) {
      return new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x6affb0, transparent: true, opacity: 0.8, depthTest: false }),
      )
    }
    const insetLocal = makeInsetOutlinePoints(shape, plinthParams.width, plinthParams.depth, supportParams.supportTipSize / 2, baseSegMM)
    const insetProjected = projectToGround(insetLocal, cosT)
    const perim = perimeterLength(insetProjected)
    const n = Math.max(4, Math.round(perim / supportParams.supportSpacing))
    const s = perim / n
    const ringPositions = equidistantPoints(insetProjected, n)

    const gap = Math.min(s, supportParams.supportSpacing)
    const interiorPositions = buildConcentricRingPositions(shape, plinthParams.width, plinthParams.depth, cosT, s, supportParams.supportTipSize / 2 + gap, baseSegMM)
    const positions = ringPositions.concat(interiorPositions)
    return new THREE.LineSegments(
      buildSupportCircles(positions, radius, 32),
      new THREE.LineBasicMaterial({ color: 0x6affb0, transparent: true, opacity: 0.8, depthTest: false }),
    )
  }, [shape, plinthParams.width, plinthParams.depth, radius, baseSegMM, cosT, supportParams.supportSpacing, supportParams.supportTipSize])

  useEffect(() => {
    return () => {
      footprint.geometry.dispose()
      ;(footprint.material as THREE.Material).dispose()
    }
  }, [footprint])

  useEffect(() => {
    return () => {
      supportCircles.geometry.dispose()
      ;(supportCircles.material as THREE.Material).dispose()
    }
  }, [supportCircles])

  return (
    <group>
      <primitive object={footprint} position={[0, 0, 0]} renderOrder={1000} />
      <primitive object={supportCircles} position={[0, 0, 0]} renderOrder={1000} />
    </group>
  )
}