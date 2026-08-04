import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { type Shape, type PlinthParams } from './Plinth.tsx'

export interface DrillJigParams {
  enabled: boolean
  wallSize: number
  jigHeight: number
  overlap: number
  tolerance: number
  lift: boolean
}

function buildJigGeometry(
  shape: Shape,
  p: PlinthParams,
  jig: DrillJigParams,
): THREE.BufferGeometry {
  const w = Math.max(0.1, p.width)
  const d = Math.max(0.1, p.depth)
  const h = Math.max(0.1, p.height)
  const wall = Math.max(0.1, jig.wallSize)
  const height = Math.max(0.1, jig.jigHeight)
  const overlap = Math.max(0, jig.overlap)
  const tol = Math.max(0, jig.tolerance)

  const topStart = h
  const topEnd = h
  const bottom = topStart - overlap
  const top = topEnd + height
  const totalH = top - bottom

  let outerGeo: THREE.BufferGeometry
  if (shape === 'ellipse') {
    const cyl = new THREE.CylinderGeometry(1, 1, totalH, 48, 1)
    cyl.scale(w / 2 + wall, 1, d / 2 + wall)
    cyl.computeVertexNormals()
    outerGeo = cyl
  } else {
    outerGeo = new THREE.BoxGeometry(w + 2 * wall, totalH, d + 2 * wall)
  }

  const iw = w + tol
  const id = d + tol
  let innerGeo: THREE.BufferGeometry
  if (shape === 'ellipse') {
    const cyl = new THREE.CylinderGeometry(1, 1, h + 0.02, 48, 1)
    cyl.scale(iw / 2, 1, id / 2)
    cyl.computeVertexNormals()
    innerGeo = cyl
  } else {
    innerGeo = new THREE.BoxGeometry(iw, h + 0.02, id)
  }
  innerGeo.translate(0, h / 2, 0)

  const engagedCenterY = bottom + totalH / 2
  outerGeo.translate(0, engagedCenterY, 0)

  const holeRadius = Math.max(0.05, p.holeDiameter / 2)
  const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, totalH + 0.02, 32, 1)
  holeGeo.translate(0, engagedCenterY, 0)

  const outerBrush = new Brush(outerGeo)
  outerBrush.updateMatrixWorld(true)
  const innerBrush = new Brush(innerGeo)
  innerBrush.updateMatrixWorld(true)
  const holeBrush = new Brush(holeGeo)
  holeBrush.updateMatrixWorld(true)

  const evaluator = new Evaluator()
  evaluator.attributes = ['position', 'normal']
  evaluator.useGroups = false
  const step1 = evaluator.evaluate(outerBrush, innerBrush, SUBTRACTION)
  const step2 = evaluator.evaluate(step1, holeBrush, SUBTRACTION)

  const geo = step2.geometry
  if (geo !== outerGeo) outerGeo.dispose()
  innerGeo.dispose()
  holeGeo.dispose()
  return geo
}

export default function DrillJig({
  shape,
  plinthParams,
  jigParams,
}: {
  shape: Shape
  plinthParams: PlinthParams
  jigParams: DrillJigParams
}) {
  const geometry = useMemo(
    () => buildJigGeometry(shape, plinthParams, jigParams),
    [shape, plinthParams, jigParams],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  const overlap = Math.max(0, jigParams.overlap)
  const liftOffset = jigParams.lift ? overlap + 20 : 0

  return (
    <mesh
      geometry={geometry}
      position={[0, liftOffset, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color="#d98c4a"
        metalness={0.1}
        roughness={0.6}
        transparent
        opacity={0.7}
      />
    </mesh>
  )
}