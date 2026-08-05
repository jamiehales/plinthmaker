import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { type Shape, type PlinthParams, type DrillJigParams, topDrop, RENDER_BASE_SEGMENT_MM, RENDER_FILLET_SEGMENT_MM } from './geometryBuilder.ts'
import { useGeometryWorker, deserializeGeometry, markBuilding, markDone } from './useGeometryWorker.ts'

export type { DrillJigParams } from './geometryBuilder.ts'

function makeOutlineLoop(shape: Shape, w: number, d: number, segMM: number, zScale = 1): THREE.LineLoop {
  let pts: THREE.Vector3[]
  if (shape === 'ellipse') {
    const hw = w / 2
    const hd = (d / 2) * zScale
    const perim = Math.PI * (3 * (hw + hd) - Math.sqrt((3 * hw + hd) * (hw + 3 * hd)))
    const n = Math.max(16, Math.ceil(perim / segMM))
    pts = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push(new THREE.Vector3(hw * Math.cos(a), 0, hd * Math.sin(a)))
    }
  } else {
    const hw = w / 2
    const hd = (d / 2) * zScale
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

export default function DrillJig({
  shape,
  plinthParams,
  jigParams,
  baseSegMM = RENDER_BASE_SEGMENT_MM,
  filletSegMM = RENDER_FILLET_SEGMENT_MM,
}: {
  shape: Shape
  plinthParams: PlinthParams
  jigParams: DrillJigParams
  baseSegMM?: number
  filletSegMM?: number
}) {
  const { build } = useGeometryWorker()
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const reqIdRef = useRef(0)
  const lastBuildRef = useRef(0)
  const pendingParamsRef = useRef<{ shape: Shape; plinthParams: PlinthParams; jigParams: DrillJigParams; baseSegMM: number; filletSegMM: number } | null>(null)
  const activeRef = useRef(false)

  useEffect(() => {
    const now = Date.now()
    const elapsed = now - lastBuildRef.current
    const throttleMs = 150
    pendingParamsRef.current = { shape, plinthParams, jigParams, baseSegMM, filletSegMM }

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
      const { id, promise } = build({ type: 'jig', shape: p.shape, plinthParams: p.plinthParams, jigParams: p.jigParams, baseSegMM: p.baseSegMM, filletSegMM: p.filletSegMM, useCDT: false, computeCavity: false })
      reqIdRef.current = id
      promise.then((msg) => {
        if (msg.id !== reqIdRef.current) {
          markDone()
          activeRef.current = false
          return
        }
        if (msg.type !== 'jig') {
          console.error('jig build error:', msg.type === 'error' ? msg.error : 'unexpected message type')
          markDone()
          activeRef.current = false
          if (pendingParamsRef.current) fire()
          return
        }
        setGeometry((prev) => {
          prev?.dispose()
          return deserializeGeometry(msg.jig)
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
  }, [build, shape, plinthParams, jigParams, baseSegMM, filletSegMM])

  const angleRad = plinthParams.angleTop
    ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
    : 0
  const cosA = Math.cos(angleRad)
  const topZScale = plinthParams.angleTop ? 1 / Math.max(0.01, cosA) : 1
  const flatten = jigParams.flattenTop

  const bottomOutline = useMemo(() => makeOutlineLoop(shape, plinthParams.width, plinthParams.depth, baseSegMM, topZScale), [shape, plinthParams.width, plinthParams.depth, baseSegMM, topZScale])
  const topOutlineZScale = topZScale
  const topOutline = useMemo(() => makeOutlineLoop(shape, plinthParams.width, plinthParams.depth, baseSegMM, topOutlineZScale), [shape, plinthParams.width, plinthParams.depth, baseSegMM, topOutlineZScale])
  const makeHoleCircle = useMemo(() => {
    return (skewed: boolean) => {
      const r = Math.max(0.05, plinthParams.holeDiameter / 2)
      const angleR = plinthParams.angleTop
        ? (Math.min(89, Math.max(0.5, plinthParams.topAngle)) * Math.PI) / 180
        : 0
      const cos = Math.cos(angleR)
      const zScale = skewed && angleR > 0 ? 1 / Math.max(0.01, cos) : 1
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
      return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }))
    }
  }, [plinthParams.holeDiameter, plinthParams.angleTop, plinthParams.topAngle])
  const holeCircleBottom = useMemo(() => makeHoleCircle(true), [makeHoleCircle])
  const holeCircleTop = useMemo(() => makeHoleCircle(!jigParams.flattenTop), [makeHoleCircle, jigParams.flattenTop])

  useEffect(() => {
    return () => {
      geometry?.dispose()
      bottomOutline.geometry.dispose()
      ;(bottomOutline.material as THREE.Material).dispose()
      topOutline.geometry.dispose()
      ;(topOutline.material as THREE.Material).dispose()
      holeCircleBottom.geometry.dispose()
      ;(holeCircleBottom.material as THREE.Material).dispose()
      holeCircleTop.geometry.dispose()
      ;(holeCircleTop.material as THREE.Material).dispose()
    }
  }, [geometry, bottomOutline, topOutline, holeCircleBottom, holeCircleTop])

  const overlap = Math.max(0, jigParams.overlap)
  const wall = Math.max(0.1, jigParams.wallSize)
  const liftOffset = jigParams.lift ? overlap + 20 : 0

  const h = Math.max(0.1, plinthParams.height)
  const d = Math.max(0.1, plinthParams.depth)
  const w = Math.max(0.1, plinthParams.width)
  const drop = topDrop({ angleTop: plinthParams.angleTop, topAngle: plinthParams.topAngle, depth: d })
  const height = Math.max(0.1, jigParams.jigHeight)
  const baseY = h - drop / 2
  const flatTopY = h + height
  const angledTopCircleY = baseY + height / Math.max(0.01, cosA)
  const topCircleY = flatten ? flatTopY : angledTopCircleY
  const topCircleRot = flatten ? 0 : angleRad

  const bottomY = baseY - overlap

  const jigOW = w + 2 * wall
  const jigOD = d + 2 * wall
  const jigZScale = plinthParams.angleTop && !flatten ? 1 / Math.max(0.01, cosA) : 1
  const jigBottomZScale = plinthParams.angleTop ? 1 / Math.max(0.01, cosA) : 1

  const jigTopOutline = useMemo(() => makeOutlineLoop(shape, jigOW, jigOD, baseSegMM, jigZScale), [shape, jigOW, jigOD, baseSegMM, jigZScale])
  const jigBottomOutline = useMemo(() => makeOutlineLoop(shape, jigOW, jigOD, baseSegMM, jigBottomZScale), [shape, jigOW, jigOD, baseSegMM, jigBottomZScale])

  useEffect(() => {
    return () => {
      geometry?.dispose()
      bottomOutline.geometry.dispose()
      ;(bottomOutline.material as THREE.Material).dispose()
      topOutline.geometry.dispose()
      ;(topOutline.material as THREE.Material).dispose()
      holeCircleBottom.geometry.dispose()
      ;(holeCircleBottom.material as THREE.Material).dispose()
      holeCircleTop.geometry.dispose()
      ;(holeCircleTop.material as THREE.Material).dispose()
      jigTopOutline.geometry.dispose()
      ;(jigTopOutline.material as THREE.Material).dispose()
      jigBottomOutline.geometry.dispose()
      ;(jigBottomOutline.material as THREE.Material).dispose()
    }
  }, [geometry, bottomOutline, topOutline, holeCircleBottom, holeCircleTop, jigTopOutline, jigBottomOutline])

  if (!geometry) return null

  const jigBottomY = bottomY
  const jigBottomRot = angleRad

  return (
      <group position={[0, liftOffset, 0]}>
        <mesh geometry={geometry}>
          <meshStandardMaterial
            color="#d98c4a"
            metalness={0.1}
            roughness={0.6}
            transparent
            opacity={0.7}
          />
        </mesh>
        <primitive object={bottomOutline} position={[0, bottomY, 0]} rotation={[angleRad, 0, 0]} renderOrder={1000} />
        <primitive object={topOutline} position={[0, baseY, 0]} rotation={[angleRad, 0, 0]} renderOrder={1000} />
        <primitive object={holeCircleBottom} position={[0, baseY, 0]} rotation={[angleRad, 0, 0]} renderOrder={1000} />
        <primitive object={holeCircleTop} position={[0, topCircleY, 0]} rotation={[topCircleRot, 0, 0]} renderOrder={1000} />
        <primitive object={jigTopOutline} position={[0, topCircleY, 0]} rotation={[topCircleRot, 0, 0]} renderOrder={1000} />
        <primitive object={jigBottomOutline} position={[0, jigBottomY, 0]} rotation={[jigBottomRot, 0, 0]} renderOrder={1000} />
      </group>
  )
}