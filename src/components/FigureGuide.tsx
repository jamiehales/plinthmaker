import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { type PlinthParams } from './geometryBuilder.ts'
import { type FigureSilhouette, loadFigureSilhouette } from './figureCatalog.ts'
import { GUIDE_COLOR } from './guideShapes.ts'
import { clampToConvexPolygon, ngonVertices } from './ngon.ts'
import {
  FIGURE_OPACITY, FIGURE_HANDLE_RADIUS_SCALE, FIGURE_HANDLE_MIN_RADIUS, FIGURE_HANDLE_MAX_RADIUS,
  FIGURE_HANDLE_OPACITY, FIGURE_HANDLE_HOVER_OPACITY, FIGURE_HANDLE_ARROW_SCALE,
} from '../defaults.ts'

export interface FigurePosition {
  x: number
  z: number
}

interface FigureGuideProps {
  id: number
  params: PlinthParams
  imagePath: string
  position: FigurePosition
  onPositionChange: (id: number, position: FigurePosition) => void
  onLoadingChange: (id: number, loading: boolean) => void
}

const HANDLE_SEGMENTS = 64
const SURFACE_OFFSET = 0.15

function moveArrowShape(extent: number): THREE.Shape {
  const armHalfWidth = extent * 0.12
  const headHalfWidth = extent * 0.32
  const headStart = extent * 0.62
  const quarter: [number, number][] = [
    [-armHalfWidth, headStart],
    [-headHalfWidth, headStart],
    [0, extent],
    [headHalfWidth, headStart],
    [armHalfWidth, headStart],
    [armHalfWidth, armHalfWidth],
  ]
  const points: THREE.Vector2[] = []
  for (let turn = 0; turn < 4; turn++) {
    const angle = (-turn * Math.PI) / 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    for (const [x, y] of quarter) points.push(new THREE.Vector2(x * cos - y * sin, x * sin + y * cos))
  }
  return new THREE.Shape(points)
}

function topAngleRadians(params: PlinthParams): number {
  return params.angleTop ? (Math.min(89, Math.max(0.5, params.topAngle)) * Math.PI) / 180 : 0
}

function clampToTop(params: PlinthParams, position: FigurePosition): FigurePosition {
  const halfWidth = Math.max(0.1, params.width) / 2
  const halfDepth = Math.max(0.1, params.depth) / 2
  if (params.shape === 'ngon') return clampToConvexPolygon(ngonVertices(params.ngonSides, halfWidth * 2, halfDepth * 2), position.x, position.z)
  if (params.shape === 'ellipse') {
    const distance = Math.hypot(position.x / halfWidth, position.z / halfDepth)
    return distance <= 1 ? position : { x: position.x / distance, z: position.z / distance }
  }
  return {
    x: Math.max(-halfWidth, Math.min(halfWidth, position.x)),
    z: Math.max(-halfDepth, Math.min(halfDepth, position.z)),
  }
}

export default function FigureGuide({ id, params, imagePath, position, onPositionChange, onLoadingChange }: FigureGuideProps) {
  const [silhouette, setSilhouette] = useState<FigureSilhouette | null>(null)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const rootRef = useRef<THREE.Group>(null)
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null

  useEffect(() => {
    let cancelled = false
    onLoadingChange(id, true)
    loadFigureSilhouette(imagePath)
      .then((loaded) => {
        if (cancelled) {
          loaded.texture.dispose()
          return
        }
        setSilhouette((previous) => {
          previous?.texture.dispose()
          return loaded
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('figure image error:', error)
      })
      .finally(() => {
        if (!cancelled) onLoadingChange(id, false)
      })
    return () => {
      cancelled = true
      onLoadingChange(id, false)
    }
  }, [id, imagePath, onLoadingChange])

  useEffect(() => {
    return () => silhouette?.texture.dispose()
  }, [silhouette])

  useEffect(() => {
    document.body.style.cursor = hovered || dragging ? 'move' : ''
    return () => { document.body.style.cursor = '' }
  }, [hovered, dragging])

  const handleRadius = silhouette
    ? Math.min(FIGURE_HANDLE_MAX_RADIUS, Math.max(FIGURE_HANDLE_MIN_RADIUS, silhouette.widthMM * FIGURE_HANDLE_RADIUS_SCALE))
    : FIGURE_HANDLE_MIN_RADIUS

  const handle = useMemo(() => {
    const disc = new THREE.CircleGeometry(handleRadius, HANDLE_SEGMENTS)
    const ringPoints: THREE.Vector3[] = []
    for (let i = 0; i <= HANDLE_SEGMENTS; i++) {
      const angle = (i / HANDLE_SEGMENTS) * Math.PI * 2
      ringPoints.push(new THREE.Vector3(handleRadius * Math.cos(angle), handleRadius * Math.sin(angle), 0))
    }
    const ring = new THREE.BufferGeometry().setFromPoints(ringPoints)
    const arrow = new THREE.ShapeGeometry(moveArrowShape(handleRadius * FIGURE_HANDLE_ARROW_SCALE))
    return { disc, ring, arrow }
  }, [handleRadius])

  useEffect(() => {
    return () => {
      handle.disc.dispose()
      handle.ring.dispose()
      handle.arrow.dispose()
    }
  }, [handle])

  const angle = topAngleRadians(params)
  const tanAngle = Math.tan(angle)
  const height = Math.max(0.1, params.height)
  const depth = Math.max(0.1, params.depth)
  const topYAt = (z: number) => height - (z + depth / 2) * tanAngle

  const surfacePlane = useMemo(() => {
    const normal = new THREE.Vector3(0, 1, tanAngle).normalize()
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, height - (depth / 2) * tanAngle, 0))
  }, [tanAngle, height, depth])

  const surfacePointFromEvent = (event: ThreeEvent<PointerEvent>): FigurePosition | null => {
    const root = rootRef.current
    if (!root) return null
    const inverse = root.matrixWorld.clone().invert()
    const localRay = event.ray.clone().applyMatrix4(inverse)
    const hit = localRay.intersectPlane(surfacePlane, new THREE.Vector3())
    return hit ? { x: hit.x, z: hit.z } : null
  }

  const dragOffset = useRef<FigurePosition>({ x: 0, z: 0 })

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const point = surfacePointFromEvent(event)
    if (!point) return
    dragOffset.current = { x: position.x - point.x, z: position.z - point.z }
    ;(event.target as Element).setPointerCapture(event.pointerId)
    if (controls) controls.enabled = false
    setDragging(true)
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging) return
    event.stopPropagation()
    const point = surfacePointFromEvent(event)
    if (!point) return
    onPositionChange(id, clampToTop(params, { x: point.x + dragOffset.current.x, z: point.z + dragOffset.current.z }))
  }

  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging) return
    ;(event.target as Element).releasePointerCapture(event.pointerId)
    if (controls) controls.enabled = true
    setDragging(false)
  }

  if (!silhouette) return null

  const clamped = clampToTop(params, position)
  const baseY = topYAt(clamped.z)
  const handleOpacity = hovered || dragging ? FIGURE_HANDLE_HOVER_OPACITY : FIGURE_HANDLE_OPACITY
  const color = new THREE.Color(GUIDE_COLOR)

  return (
    <group ref={rootRef}>
      <group position={[clamped.x, baseY, clamped.z]}>
        <group rotation={[angle - Math.PI / 2, 0, 0]} position={[0, SURFACE_OFFSET, 0]}>
          <mesh
            geometry={handle.disc}
            renderOrder={1000}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
            onPointerOut={() => setHovered(false)}
          >
            <meshBasicMaterial color={color} transparent opacity={handleOpacity} depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          <lineLoop geometry={handle.ring} renderOrder={1000}>
            <lineBasicMaterial color={color} transparent opacity={0.9} depthTest={false} toneMapped={false} />
          </lineLoop>
          <mesh geometry={handle.arrow} renderOrder={1002}>
            <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </group>
        <mesh position={[0, silhouette.heightMM / 2, 0]} renderOrder={1001}>
          <planeGeometry args={[silhouette.widthMM, silhouette.heightMM]} />
          <meshBasicMaterial
            map={silhouette.texture}
            transparent
            opacity={FIGURE_OPACITY}
            alphaTest={0.1}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}
