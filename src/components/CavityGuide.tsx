import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { PlinthParams } from './geometryBuilder.ts'
import { dashedLines, disposeObject, liftOutline, loopSegments, makeOutline, solidLines, stripGeometry, translucentMesh } from './guideShapes.ts'

export type CavityGuideMode = 'top' | 'wall' | 'outline'

const ELLIPSE_VERTICAL_EDGES = 8
const SURFACE_OFFSET = 0.15

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

    const cavityOutline = params.shape === 'ngon'
      ? makeOutline(params.shape, width, depth, params.ngonSides, -wall)
      : makeOutline(params.shape, cavityWidth, cavityDepth)
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
      const outerOutline = makeOutline(params.shape, width, depth, params.ngonSides, SURFACE_OFFSET)
      lowerLoop = liftOutline(outerOutline, ceilingYAt)
      upperLoop = liftOutline(outerOutline, topYAt)
    } else {
      const surfaceYAt = (z: number) => topYAt(z) + SURFACE_OFFSET
      lowerLoop = liftOutline(makeOutline(params.shape, width, depth, params.ngonSides), surfaceYAt)
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
