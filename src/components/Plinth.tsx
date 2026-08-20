import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGeometryWorker, deserializeGeometry, markBuilding, markDone, markFailed, markSuccess } from './useGeometryWorker.ts'

import type { Shape, PlinthParams } from './geometryBuilder.ts'
import { topDrop, RENDER_BASE_SEGMENT_MM, RENDER_FILLET_SEGMENT_MM } from './geometryBuilder.ts'
import { DEFAULT_RENDER_THROTTLE_MS } from '../defaults.ts'

const DEBUG_OUTLINES = false

function makeOutlineLoop(shape: Shape, w: number, d: number, segMM: number, zScale = 1, insetX = 0, insetZ = 0): THREE.LineLoop {
  let pts: THREE.Vector3[]
  if (shape === 'ellipse') {
    const hw = Math.max(0.01, w / 2 - insetX)
    const hd = Math.max(0.01, (d / 2 - insetZ) * zScale)
    const perim = Math.PI * (3 * (hw + hd) - Math.sqrt((3 * hw + hd) * (hw + 3 * hd)))
    const n = Math.max(16, Math.ceil(perim / segMM))
    pts = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(new THREE.Vector3(hw * Math.cos(a), 0, hd * Math.sin(a)))
    }
  } else {
    const hw = Math.max(0.01, w / 2 - insetX)
    const hd = Math.max(0.01, (d / 2 - insetZ) * zScale)
    pts = [
      new THREE.Vector3(-hw, 0, -hd),
      new THREE.Vector3(hw, 0, -hd),
      new THREE.Vector3(hw, 0, hd),
      new THREE.Vector3(-hw, 0, hd),
    ]
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false }))
}

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
    const throttleMs = DEFAULT_RENDER_THROTTLE_MS
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
          markFailed()
          markDone()
          activeRef.current = false
          if (pendingParamsRef.current) fire()
          return
        }
        setGeometry((prev) => {
          prev?.dispose()
          return deserializeGeometry(msg.geometry)
        })
        markSuccess()
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

  const angleRad = params.angleTop
    ? (Math.min(89, Math.max(0.5, params.topAngle)) * Math.PI) / 180
    : 0
  const cosA = Math.cos(angleRad)
  const topZScale = params.angleTop ? 1 / Math.max(0.01, cosA) : 1

  const d = Math.max(0.1, params.depth)
  const w = Math.max(0.1, params.width)
  const drop = topDrop({ angleTop: params.angleTop, topAngle: params.topAngle, depth: d })
  const h = Math.max(0.1, params.height)
  const topY = h - drop / 2

  const rounding = params.roundStyle !== 'none' && params.roundSize > 0
  const minTopY = Math.max(0.01, h - drop)
  const r = rounding
    ? Math.min(params.roundSize, w / 2 - 0.01, d / 2 - 0.01, h / 2 - 0.01, minTopY - 0.01)
    : 0

  const sinA = Math.sin(angleRad)
  const tanA = Math.tan(angleRad)
  const insetZWorld = r * cosA
  const shift = r * (tanA / (1 + tanA))
  const shiftY = -sinA * shift
  const shiftZ = cosA * shift

  const topOutline = useMemo(
    () => makeOutlineLoop(params.shape, params.width, params.depth, baseSegMM, topZScale),
    [params.shape, params.width, params.depth, baseSegMM, topZScale],
  )
  const insetOutline = useMemo(
    () => makeOutlineLoop(params.shape, params.width, params.depth, baseSegMM, topZScale, r, insetZWorld),
    [params.shape, params.width, params.depth, baseSegMM, topZScale, r, insetZWorld],
  )

  useEffect(() => {
    return () => {
      topOutline.geometry.dispose()
      ;(topOutline.material as THREE.Material).dispose()
    }
  }, [topOutline])

  useEffect(() => {
    return () => {
      insetOutline.geometry.dispose()
      ;(insetOutline.material as THREE.Material).dispose()
    }
  }, [insetOutline])

  if (!geometry) return null

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#9aa4b0" metalness={0.1} roughness={0.6} />
      </mesh>
      {DEBUG_OUTLINES ? (
        <>
          <primitive object={topOutline} position={[0, topY - r, 0]} rotation={[angleRad, 0, 0]} renderOrder={1000} />
          {rounding ? (
            <primitive object={insetOutline} position={[0, topY + shiftY, shiftZ]} rotation={[angleRad, 0, 0]} renderOrder={1000} />
          ) : null}
        </>
      ) : null}
    </group>
  )
}