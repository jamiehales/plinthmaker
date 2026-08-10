import { useEffect, useMemo, useRef, useState } from 'react'
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
import { markBuilding, markDone, markFailed, markSuccess, useGenerationFailed } from './useGeometryWorker.ts'

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
  const [supportMesh, setSupportMesh] = useState<{ geo: THREE.BufferGeometry; error: boolean }>({ geo: EMPTY_GEO, error: false })
  const supportMeshRef = useRef(supportMesh)
  supportMeshRef.current = supportMesh

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

  useEffect(() => {
    if (radius <= 0) {
      setSupportMesh((prev) => {
        if (prev.geo !== EMPTY_GEO) prev.geo.dispose()
        return { geo: EMPTY_GEO, error: false }
      })
      markSuccess()
      return
    }
    markBuilding()
    const includeScaffolding = SHOW_SCAFFOLDING_IN_PREVIEW && supportParams.scaffoldingEnabled
    let cancelled = false
    const run = () => {
      try {
        const geo = buildSupportMeshGeometry(shape, plinthParams, supportParams, 16, includeScaffolding)
        if (cancelled) {
          geo.dispose()
          return
        }
        setSupportMesh((prev) => {
          if (prev.geo !== EMPTY_GEO) prev.geo.dispose()
          return { geo, error: false }
        })
        markSuccess()
      } catch (err) {
        console.error('support mesh error:', err)
        if (cancelled) return
        setSupportMesh((prev) => {
          if (prev.geo !== EMPTY_GEO) prev.geo.dispose()
          return { geo: new THREE.BufferGeometry(), error: true }
        })
        markFailed()
      } finally {
        if (!cancelled) markDone()
      }
    }
    const t = setTimeout(run, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
      markDone()
    }
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
      const m = supportMeshRef.current
      if (m.geo !== EMPTY_GEO) m.geo.dispose()
    }
  }, [])

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