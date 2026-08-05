import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGeometryWorker, deserializeGeometry, markBuilding, markDone } from './useGeometryWorker.ts'

export type { Shape, RoundStyle, RoundLocation, PlinthParams } from './geometryBuilder.ts'
export { topDrop, buildPlinthBody, buildGeometry, DOWNLOAD_BASE_SEGMENT_MM, DOWNLOAD_FILLET_SEGMENT_MM, RENDER_BASE_SEGMENT_MM, RENDER_FILLET_SEGMENT_MM } from './geometryBuilder.ts'

import type { PlinthParams } from './geometryBuilder.ts'
import { RENDER_BASE_SEGMENT_MM, RENDER_FILLET_SEGMENT_MM } from './geometryBuilder.ts'

export default function Plinth({ params, baseSegMM = RENDER_BASE_SEGMENT_MM, filletSegMM = RENDER_FILLET_SEGMENT_MM }: { params: PlinthParams; baseSegMM?: number; filletSegMM?: number }) {
  const { build } = useGeometryWorker()
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const reqIdRef = useRef(0)
  const lastBuildRef = useRef(0)
  const pendingParamsRef = useRef<{ params: PlinthParams; baseSegMM: number; filletSegMM: number } | null>(null)
  const activeRef = useRef(false)

  useEffect(() => {
    const now = Date.now()
    const elapsed = now - lastBuildRef.current
    const throttleMs = 150
    pendingParamsRef.current = { params, baseSegMM, filletSegMM }

    if (activeRef.current) {
      return
    }

    const fire = () => {
      const p = pendingParamsRef.current
      if (!p) return
      pendingParamsRef.current = null
      activeRef.current = true
      lastBuildRef.current = Date.now()
      markBuilding()
      const { id, promise } = build({ type: 'plinth', params: p.params, baseSegMM: p.baseSegMM, filletSegMM: p.filletSegMM, useCDT: false })
      reqIdRef.current = id
      promise.then((msg) => {
        if (msg.id !== reqIdRef.current) {
          markDone()
          activeRef.current = false
          return
        }
        if (msg.type !== 'plinth') {
          console.error('plinth build error:', msg.type === 'error' ? msg.error : 'unexpected message type')
          markDone()
          activeRef.current = false
          if (pendingParamsRef.current) fire()
          return
        }
        setGeometry((prev) => {
          prev?.dispose()
          return deserializeGeometry(msg.geometry)
        })
        markDone()
        activeRef.current = false
        if (pendingParamsRef.current) {
          fire()
        }
      })
    }

    if (elapsed >= throttleMs) {
      fire()
    } else {
      const t = setTimeout(fire, throttleMs - elapsed)
      return () => { clearTimeout(t) }
    }
  }, [build, params, baseSegMM, filletSegMM])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#9aa4b0" metalness={0.1} roughness={0.6} />
    </mesh>
  )
}