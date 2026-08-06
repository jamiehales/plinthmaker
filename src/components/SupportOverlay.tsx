import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type Shape, type PlinthParams, type SupportParams, RENDER_BASE_SEGMENT_MM } from './geometryBuilder.ts'
import {
  makeBaseOutlinePoints,
  projectToGround,
  buildSupportCircles,
  computeSupportPositions,
  buildSupportMeshGeometry,
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
  const radius = supportParams.supportSize / 2

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
    if (radius <= 0) return new THREE.BufferGeometry()
    return buildSupportMeshGeometry(shape, plinthParams, supportParams, 16)
  }, [shape, plinthParams, supportParams, radius])

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