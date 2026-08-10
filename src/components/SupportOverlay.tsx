import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type Shape, type PlinthParams, type SupportParams, RENDER_BASE_SEGMENT_MM } from './geometryBuilder.ts'
import {
  makeBaseOutlinePoints,
  projectToGround,
  buildSupportCircles,
  computeSupportPositions,
  buildSupportMeshGeometry,
  trimFootprintOffset,
} from './supportBuilder.ts'
import { SHOW_SCAFFOLDING_IN_PREVIEW } from '../defaults.ts'
import { markFailed, markSuccess, useGenerationFailed } from './useGeometryWorker.ts'

interface SupportOverlayProps {
  shape: Shape
  plinthParams: PlinthParams
  supportParams: SupportParams
  baseSegMM?: number
}

const EMPTY_GEO = new THREE.BufferGeometry()

export default function SupportOverlay({ shape, plinthParams, supportParams, baseSegMM = RENDER_BASE_SEGMENT_MM }: SupportOverlayProps) {
  const tilt = (supportParams.plinthAngle * Math.PI) / 180
  const cosT = Math.cos(tilt)
  const radius = supportParams.supportSize / 2
  const failed = useGenerationFailed()

  const footprint = useMemo(() => {
    try {
      const trimOff = trimFootprintOffset(plinthParams)
      const local = makeBaseOutlinePoints(shape, plinthParams.width, plinthParams.depth, baseSegMM, trimOff)
      const projected = projectToGround(local, cosT)
      const geo = new THREE.BufferGeometry().setFromPoints(projected)
      return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0x4ad6ff, transparent: true, opacity: 0.8, depthTest: false }))
    } catch (err) {
      console.error('support footprint error:', err)
      const geo = new THREE.BufferGeometry()
      return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0x4ad6ff, transparent: true, opacity: 0.8, depthTest: false }))
    }
  }, [shape, plinthParams, baseSegMM, cosT])

  const supportPositions = useMemo(() => {
    try {
      return computeSupportPositions(shape, plinthParams, supportParams, baseSegMM)
    } catch (err) {
      console.error('support positions error:', err)
      return []
    }
  }, [shape, plinthParams, supportParams, baseSegMM])

  const supportCircles = useMemo(() => {
    try {
      return new THREE.LineSegments(
        buildSupportCircles(supportPositions, radius, 32),
        new THREE.LineBasicMaterial({ color: 0x6affb0, transparent: true, opacity: 0.8, depthTest: false }),
      )
    } catch (err) {
      console.error('support circles error:', err)
      return new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x6affb0, transparent: true, opacity: 0.8, depthTest: false }),
      )
    }
  }, [supportPositions, radius])

  const supportMesh = useMemo<{ geo: THREE.BufferGeometry; error: boolean }>(() => {
    if (radius <= 0) return { geo: EMPTY_GEO, error: false }
    try {
      const geo = buildSupportMeshGeometry(shape, plinthParams, supportParams, 16, SHOW_SCAFFOLDING_IN_PREVIEW && supportParams.scaffoldingEnabled)
      return { geo, error: false }
    } catch (err) {
      console.error('support mesh error:', err)
      return { geo: new THREE.BufferGeometry(), error: true }
    }
  }, [shape, plinthParams, supportParams, radius])

  useEffect(() => {
    if (supportMesh.error) markFailed()
    else markSuccess()
  }, [supportMesh])

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
      if (supportMesh.geo !== EMPTY_GEO) supportMesh.geo.dispose()
    }
  }, [supportMesh])

  if (failed) return null

  return (
    <group>
      <primitive object={footprint} position={[0, 0, 0]} renderOrder={1000} />
      <primitive object={supportCircles} position={[0, 0, 0]} renderOrder={1000} />
      <mesh geometry={supportMesh.geo}>
        <meshStandardMaterial color="#6affb0" metalness={0.1} roughness={0.6} />
      </mesh>
    </group>
  )
}