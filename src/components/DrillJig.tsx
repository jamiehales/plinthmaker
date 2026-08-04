import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg'
import { type Shape, type PlinthParams, buildPlinthBody, topDrop } from './Plinth.tsx'

export interface DrillJigParams {
  enabled: boolean
  wallSize: number
  jigHeight: number
  overlap: number
  tolerance: number
  lift: boolean
}

export function buildJigGeometry(
  shape: Shape,
  p: PlinthParams,
  jig: DrillJigParams,
): { jig: THREE.BufferGeometry; cavity: THREE.BufferGeometry } {
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

  const slabH = overlap + height
  const ow = w + 2 * wall
  const od = (d + 2 * wall) / Math.max(0.01, cosA)

  let outerGeo: THREE.BufferGeometry
  if (shape === 'ellipse') {
    const cyl = new THREE.CylinderGeometry(1, 1, slabH, 48, 1)
    cyl.scale(ow / 2, 1, od / 2)
    cyl.computeVertexNormals()
    outerGeo = cyl
  } else {
    outerGeo = new THREE.BoxGeometry(ow, slabH, od)
  }
  outerGeo.translate(0, (height - overlap) / 2, 0)
  outerGeo.rotateX(angleRad)
  outerGeo.translate(0, h - drop / 2, 0)

  const innerGeo = buildPlinthBody(p, tol)

  const holeRadius = Math.max(0.05, p.holeDiameter / 2)
  const holeLen = slabH + od + 2
  const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, holeLen, 32, 1)
  holeGeo.translate(0, h - drop / 2, 0)

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

  const cavityBrush = evaluator.evaluate(innerBrush, outerBrush, INTERSECTION)

  const geo = step2.geometry
  const cavityGeo = cavityBrush.geometry
  if (geo !== outerGeo) outerGeo.dispose()
  innerGeo.dispose()
  holeGeo.dispose()
  return { jig: geo, cavity: cavityGeo }
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
  const { jig: geometry, cavity: cavityGeo } = useMemo(
    () => buildJigGeometry(shape, plinthParams, jigParams),
    [shape, plinthParams, jigParams],
  )
  const edges = useMemo(() => new THREE.EdgesGeometry(cavityGeo), [cavityGeo])
  const makeHoleCircle = useMemo(() => {
    return () => {
      const r = Math.max(0.05, plinthParams.holeDiameter / 2)
      const angleR = plinthParams.angleTop
        ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
        : 0
      const cos = Math.cos(angleR)
      const zScale = angleR > 0 ? 1 / Math.max(0.01, cos) : 1
      const segs = 64
      const pts = new Float32Array((segs + 1) * 3)
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2
        pts[i * 3] = Math.cos(a) * r
        pts[i * 3 + 1] = 0
        pts[i * 3 + 2] = Math.sin(a) * r * zScale
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3))
      return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8, depthTest: false }))
    }
  }, [plinthParams.holeDiameter, plinthParams.angleTop, plinthParams.topAngle])
  const holeCircle = useMemo(() => makeHoleCircle(), [makeHoleCircle])
  const holeCircleTop = useMemo(() => makeHoleCircle(), [makeHoleCircle])

  useEffect(() => {
    return () => {
      geometry.dispose()
      cavityGeo.dispose()
      edges.dispose()
      holeCircle.geometry.dispose()
      ;(holeCircle.material as THREE.Material).dispose()
      holeCircleTop.geometry.dispose()
      ;(holeCircleTop.material as THREE.Material).dispose()
    }
  }, [geometry, cavityGeo, edges, holeCircle, holeCircleTop])

  const overlap = Math.max(0, jigParams.overlap)
  const liftOffset = jigParams.lift ? overlap + 20 : 0

  const h = Math.max(0.1, plinthParams.height)
  const d = Math.max(0.1, plinthParams.depth)
  const drop = topDrop({ angleTop: plinthParams.angleTop, topAngle: plinthParams.topAngle, depth: d })
  const height = Math.max(0.1, jigParams.jigHeight)
  const angleRad = plinthParams.angleTop
    ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
    : 0
  const cosA = Math.cos(angleRad)
  const baseY = h - drop / 2
  const topCircleY = baseY + height / Math.max(0.01, cosA)
  const bottomCircleY = baseY

  return (
      <group position={[0, liftOffset, 0]}>
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color="#d98c4a"
            metalness={0.1}
            roughness={0.6}
            transparent
            opacity={0.7}
          />
        </mesh>
        <lineSegments geometry={edges} renderOrder={1000}>
          <lineBasicMaterial color="#1a1a1a" transparent opacity={0.6} depthTest={false} />
        </lineSegments>
        <primitive object={holeCircle} position={[0, bottomCircleY, 0]} rotation={[angleRad, 0, 0]} renderOrder={1000} />
        <primitive object={holeCircleTop} position={[0, topCircleY, 0]} rotation={[angleRad, 0, 0]} renderOrder={1000} />
      </group>
  )
}