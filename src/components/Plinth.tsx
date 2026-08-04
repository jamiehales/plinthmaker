import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'

export type Shape = 'rectangle' | 'ellipse'

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
}

export function topDrop(p: Pick<PlinthParams, 'angleTop' | 'topAngle' | 'depth'>): number {
  if (!p.angleTop) return 0
  const angleRad = (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
  return p.depth * Math.tan(angleRad)
}

function makeBodyGeometry(shape: Shape, w: number, d: number, h: number): THREE.BufferGeometry {
  if (shape === 'ellipse') {
    const cyl = new THREE.CylinderGeometry(w / 2, w / 2, h, 48, 1)
    cyl.scale(1, 1, d / w)
    cyl.computeVertexNormals()
    return cyl
  }
  return new THREE.BoxGeometry(w, h, d)
}

export function buildPlinthBody(p: PlinthParams, tol = 0): THREE.BufferGeometry {
  const w = Math.max(0.1, p.width) + tol
  const d = Math.max(0.1, p.depth) + tol
  const h = Math.max(0.1, p.height)

  let bodyGeo = makeBodyGeometry(p.shape, w, d, h)
  bodyGeo.translate(0, h / 2, 0)

  if (p.angleTop) {
    const drop = topDrop({ angleTop: true, topAngle: p.topAngle, depth: d })
    const angleRad = (Math.min(89, Math.max(0.5, p.topAngle)) * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

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