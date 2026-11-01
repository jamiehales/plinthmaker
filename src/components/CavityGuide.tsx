import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { PlinthParams } from './geometryBuilder.ts'
import { dashedLines, disposeObject, loopSegments, solidLines, translucentMesh } from './guideShapes.ts'

export type CavityGuideMode = 'top' | 'wall' | 'outline'

const ELLIPSE_SEGMENTS = 96
const ELLIPSE_VERTICAL_EDGES = 8
const SURFACE_OFFSET = 0.15

function makeOutline(shape: PlinthParams['shape'], width: number, depth: number): THREE.Vector2[] {
  if (shape === 'ellipse') {
    const outline: THREE.Vector2[] = []
    for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
      const angle = (i / ELLIPSE_SEGMENTS) * Math.PI * 2
      outline.push(new THREE.Vector2((width / 2) * Math.cos(angle), (depth / 2) * Math.sin(angle)))
    }
    return outline
  }
  return [
    new THREE.Vector2(-width / 2, -depth / 2),
    new THREE.Vector2(width / 2, -depth / 2),
    new THREE.Vector2(width / 2, depth / 2),
    new THREE.Vector2(-width / 2, depth / 2),
  ]
}

function liftOutline(outline: THREE.Vector2[], heightAt: (z: number) => number): THREE.Vector3[] {
  return outline.map((point) => new THREE.Vector3(point.x, heightAt(point.y), point.y))
}

function stripGeometry(lowerLoop: THREE.Vector3[], upperLoop: THREE.Vector3[]): THREE.BufferGeometry {
  const pointCount = lowerLoop.length
  const geometry = new THREE.BufferGeometry().setFromPoints([...lowerLoop, ...upperLoop])
  const indices: number[] = []
  for (let i = 0; i < pointCount; i++) {
    const next = (i + 1) % pointCount
    indices.push(i, next, pointCount + i, next, pointCount + next, pointCount + i)
  }
  geometry.setIndex(indices)
  return geometry
}

export default function CavityGuide({ params, mode }: { params: PlinthParams; mode: CavityGuideMode }) {
  const guide = useMemo(() => {
    const wall = Math.max(0.5, params.hollowWallThickness)
    const width = Math.max(0.1, params.width)
    const depth = Math.max(0.1, params.depth)
    const height = Math.max(0.1, params.height)
    const cavityWidth = Math.max(0.1, width - 2 * wall)
    const cavityDepth = Math.max(0.1, depth - 2 * wall)
    const topThickness = height - Math.max(0.1, params.hollowHeight)
    const tanAngle = params.angleTop ? Math.tan((Math.min(89, Math.max(0.5, params.topAngle)) * Math.PI) / 180) : 0
    const topYAt = (z: number) => Math.max(0, Math.min(height, height - (z + depth / 2) * tanAngle))
    const ceilingYAt = (z: number) => Math.max(0, topYAt(z) - topThickness)

    const cavityOutline = makeOutline(params.shape, cavityWidth, cavityDepth)
    const cavityFloor = liftOutline(cavityOutline, () => 0)
    const cavityCeiling = liftOutline(cavityOutline, ceilingYAt)
    const verticalEvery = params.shape === 'ellipse' ? cavityOutline.length / ELLIPSE_VERTICAL_EDGES : 1
    const cavityPoints = [...loopSegments(cavityFloor), ...loopSegments(cavityCeiling)]
    for (let i = 0; i < cavityOutline.length; i += verticalEvery) cavityPoints.push(cavityFloor[i], cavityCeiling[i])
    const cavity = dashedLines(cavityPoints)
    if (mode === 'outline') return { cavity, band: null, bandEdges: null }

    let lowerLoop: THREE.Vector3[]
    let upperLoop: THREE.Vector3[]
    if (mode === 'top') {
      const outerOutline = makeOutline(params.shape, width + 2 * SURFACE_OFFSET, depth + 2 * SURFACE_OFFSET)
      lowerLoop = liftOutline(outerOutline, ceilingYAt)
      upperLoop = liftOutline(outerOutline, topYAt)
    } else {
      const surfaceYAt = (z: number) => topYAt(z) + SURFACE_OFFSET
      lowerLoop = liftOutline(makeOutline(params.shape, width, depth), surfaceYAt)
      upperLoop = liftOutline(cavityOutline, surfaceYAt)
    }
    const band = translucentMesh(stripGeometry(lowerLoop, upperLoop))
    const bandEdges = solidLines([...loopSegments(lowerLoop), ...loopSegments(upperLoop)])
    return { cavity, band, bandEdges }
  }, [params, mode])

  useEffect(() => {
    return () => {
      disposeObject(guide.cavity)
      if (guide.band) disposeObject(guide.band)
      if (guide.bandEdges) disposeObject(guide.bandEdges)
    }
  }, [guide])

  return (
    <group>
      {guide.band ? <primitive object={guide.band} renderOrder={999} /> : null}
      {guide.bandEdges ? <primitive object={guide.bandEdges} renderOrder={999} /> : null}
      <primitive object={guide.cavity} renderOrder={1000} />
    </group>
  )
}
