import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type Shape, type PlinthParams, type SupportParams, RENDER_BASE_SEGMENT_MM } from './geometryBuilder.ts'
import {
  makeBaseOutlinePoints,
  projectToGround,
  buildSupportCircles,
  computeSupportPositions,
} from './supportBuilder.ts'

interface SupportOverlayProps {
  shape: Shape
  plinthParams: PlinthParams
  supportParams: SupportParams
  baseSegMM?: number
}

export default function SupportOverlay({ shape, plinthParams, supportParams, baseSegMM = RENDER_BASE_SEGMENT_MM }: SupportOverlayProps) {
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const cosT = Math.cos(tilt)
  const tanT = Math.tan(tilt)
  const radius = supportParams.supportSize / 2
  const tipRadius = supportParams.supportTipSize / 2
  const raise = supportParams.raiseBy

  const footprint = useMemo(() => {
    const local = makeBaseOutlinePoints(shape, plinthParams.width, plinthParams.depth, baseSegMM)
    const projected = projectToGround(local, cosT)
    const geo = new THREE.BufferGeometry().setFromPoints(projected)
    return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0x4ad6ff, transparent: true, opacity: 0.8, depthTest: false }))
  }, [shape, plinthParams.width, plinthParams.depth, baseSegMM, cosT])

  const supportPositions = useMemo(() => {
    return computeSupportPositions(shape, plinthParams, supportParams, baseSegMM)
  }, [shape, plinthParams, supportParams, baseSegMM])

  const supportCircles = useMemo(() => {
    return new THREE.LineSegments(
      buildSupportCircles(supportPositions, radius, 32),
      new THREE.LineBasicMaterial({ color: 0x6affb0, transparent: true, opacity: 0.8, depthTest: false }),
    )
  }, [supportPositions, radius])

  const supportMesh = useMemo(() => {
    if (radius <= 0 || supportPositions.length === 0) return new THREE.BufferGeometry()
    const contactHeights = supportPositions.map((p) => raise - p.z * tanT)
    const verts: number[] = []
    const indices: number[] = []
    const segs = 16
    const coneStartGap = 3
    for (let i = 0; i < supportPositions.length; i++) {
      const p = supportPositions[i]
      const yContact = contactHeights[i]
      const yConeStart = yContact - coneStartGap
      if (yConeStart <= 0) continue
      const baseVtx = verts.length / 3
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2
        verts.push(p.x + Math.cos(a) * radius, 0, p.z + Math.sin(a) * radius)
      }
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2
        verts.push(p.x + Math.cos(a) * radius, yConeStart, p.z + Math.sin(a) * radius)
      }
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2
        verts.push(p.x + Math.cos(a) * tipRadius, yContact, p.z + Math.sin(a) * tipRadius)
      }
      for (let j = 0; j < segs; j++) {
        const jn = (j + 1) % segs
        indices.push(baseVtx + j, baseVtx + segs + j, baseVtx + segs + jn)
        indices.push(baseVtx + j, baseVtx + segs + jn, baseVtx + jn)
        indices.push(baseVtx + segs + j, baseVtx + 2 * segs + j, baseVtx + 2 * segs + jn)
        indices.push(baseVtx + segs + j, baseVtx + 2 * segs + jn, baseVtx + segs + jn)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [supportPositions, radius, tipRadius, raise, tanT])

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

  useEffect(() => {
    return () => {
      supportMesh.dispose()
    }
  }, [supportMesh])

  return (
    <group>
      <primitive object={footprint} position={[0, 0, 0]} renderOrder={1000} />
      <primitive object={supportCircles} position={[0, 0, 0]} renderOrder={1000} />
      <mesh geometry={supportMesh}>
        <meshStandardMaterial color="#6affb0" metalness={0.1} roughness={0.6} />
      </mesh>
    </group>
  )
}