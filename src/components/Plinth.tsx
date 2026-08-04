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
}

function buildGeometry(p: PlinthParams): THREE.BufferGeometry {
  const w = Math.max(0.1, p.width)
  const d = Math.max(0.1, p.depth)
  const h = Math.max(0.1, p.height)

  let bodyGeo: THREE.BufferGeometry
  if (p.shape === 'ellipse') {
    const cyl = new THREE.CylinderGeometry(w / 2, w / 2, h, 48, 1)
    cyl.scale(1, 1, d / w)
    cyl.computeVertexNormals()
    bodyGeo = cyl
  } else {
    bodyGeo = new THREE.BoxGeometry(w, h, d)
  }

  if (!p.addHole) {
    return bodyGeo
  }

  const radius = Math.max(0.05, p.holeDiameter / 2)
  const holeDepth = Math.max(0.1, p.holeDepth)
  const holeGeo = new THREE.CylinderGeometry(radius, radius, holeDepth + 0.01, 32, 1)
  holeGeo.translate(0, h / 2 - holeDepth / 2, 0)
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
    <mesh
      geometry={geometry}
      position={[0, params.height / 2, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#9aa4b0" metalness={0.1} roughness={0.6} />
    </mesh>
  )
}