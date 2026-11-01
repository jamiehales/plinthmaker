import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGeometryWorker, deserializeGeometry, markBuilding, markDone, markFailed, markSuccess } from './useGeometryWorker.ts'

import type { Shape, PlinthParams } from './geometryBuilder.ts'
import { topDrop, RENDER_BASE_SEGMENT_MM, RENDER_FILLET_SEGMENT_MM } from './geometryBuilder.ts'
import { DEFAULT_RENDER_THROTTLE_MS } from '../defaults.ts'
import { GUIDE_COLOR } from './guideShapes.ts'
import { ngonVertices } from './ngon.ts'

const DEBUG_OUTLINES = false

function makeOutlineLoop(shape: Shape, sides: number, w: number, d: number, segMM: number, zScale = 1, insetX = 0, insetZ = 0): THREE.LineLoop {
  let pts: THREE.Vector3[]
  if (shape === 'ngon') {
    pts = ngonVertices(sides, Math.max(0.01, w - 2 * insetX), Math.max(0.01, d - 2 * insetZ)).map((point) => new THREE.Vector3(point.x, 0, point.y * zScale))
  } else if (shape === 'ellipse') {
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

const HIGHLIGHT_VERTEX_DECLARATIONS = `
attribute float trimSection;
varying float vTrimSection;
`

const HIGHLIGHT_FRAGMENT_DECLARATIONS = `
uniform float uHighlightSection;
uniform vec3 uHighlightColor;
varying float vTrimSection;
`

const HIGHLIGHT_FRAGMENT = `
if (uHighlightSection >= 0.0 && abs(vTrimSection - uHighlightSection) < 0.5) {
  diffuseColor.rgb = mix(diffuseColor.rgb, uHighlightColor, 0.65);
}
`

function createHighlightMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: '#9aa4b0', metalness: 0.1, roughness: 0.6 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${HIGHLIGHT_VERTEX_DECLARATIONS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrimSection = trimSection;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${HIGHLIGHT_FRAGMENT_DECLARATIONS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${HIGHLIGHT_FRAGMENT}`)
  }
  return material
}


interface PlinthProps {
  params: PlinthParams
  baseSegMM?: number
  filletSegMM?: number
  highlightSection?: number | null
}

export default function Plinth({ params, baseSegMM = RENDER_BASE_SEGMENT_MM, filletSegMM = RENDER_FILLET_SEGMENT_MM, highlightSection = null }: PlinthProps) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const highlightUniforms = useMemo(() => ({
    uHighlightSection: { value: -1 },
    uHighlightColor: { value: new THREE.Color(GUIDE_COLOR) },
  }), [])
  const material = useMemo(() => createHighlightMaterial(highlightUniforms), [highlightUniforms])

  useEffect(() => {
    highlightUniforms.uHighlightSection.value = highlightSection ?? -1
  }, [highlightUniforms, highlightSection])

  useEffect(() => {
    return () => material.dispose()
  }, [material])

  const { build } = useGeometryWorker()
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
    () => makeOutlineLoop(params.shape, params.ngonSides, params.width, params.depth, baseSegMM, topZScale),
    [params.shape, params.ngonSides, params.width, params.depth, baseSegMM, topZScale],
  )
  const insetOutline = useMemo(
    () => makeOutlineLoop(params.shape, params.ngonSides, params.width, params.depth, baseSegMM, topZScale, r, insetZWorld),
    [params.shape, params.ngonSides, params.width, params.depth, baseSegMM, topZScale, r, insetZWorld],
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
      <mesh geometry={geometry} material={material} />
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