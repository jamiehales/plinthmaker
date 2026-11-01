import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { type PlinthParams, suctionHoleZ, topDrop } from './geometryBuilder.ts'
import { EXCESS_COLOR, GUIDE_COLOR, dashedLines, disposeObject, loopSegments, solidLines, translucentMesh } from './guideShapes.ts'

export type HoleGuideMode = 'diameter' | 'depth' | 'suction'

const HOLE_SEGMENTS = 48
const HOLE_VERTICAL_EDGES = 8
const SURFACE_OFFSET = 0.15

function discGeometry(center: THREE.Vector3, ring: THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry().setFromPoints([center, ...ring])
  const indices: number[] = []
  for (let i = 0; i < ring.length; i++) indices.push(0, 1 + i, 1 + ((i + 1) % ring.length))
  geometry.setIndex(indices)
  return geometry
}

export default function HoleGuide({ params, mode }: { params: PlinthParams; mode: HoleGuideMode }) {
  const guide = useMemo(() => {
    const suction = mode === 'suction'
    const radius = Math.max(0.05, (suction ? params.suctionHoleDiameter : params.holeDiameter) / 2)
    const centerZ = suction ? suctionHoleZ(params) : 0
    const height = Math.max(0.1, params.height)
    const depth = Math.max(0.1, params.depth)
    const topThickness = height - Math.max(0.1, params.hollowHeight)
    const tanAngle = params.angleTop ? Math.tan((Math.min(89, Math.max(0.5, params.topAngle)) * Math.PI) / 180) : 0
    const topYAt = (z: number) => Math.max(0, Math.min(height, height - (z + depth / 2) * tanAngle))
    const holeBottomY = height - topDrop(params) / 2 - Math.max(0.1, params.holeDepth)
    const ceilingYAt = (z: number) => Math.max(0, topYAt(z) - topThickness)
    const bottomYAt = (z: number) => (suction ? ceilingYAt(z) : holeBottomY)
    const breaksIntoCavity = !suction && params.hollowEnabled
    const belowCeiling = (point: THREE.Vector3) => breaksIntoCavity && point.y < ceilingYAt(point.z) - 1e-6

    const circle: THREE.Vector2[] = []
    for (let i = 0; i < HOLE_SEGMENTS; i++) {
      const angle = (i / HOLE_SEGMENTS) * Math.PI * 2
      circle.push(new THREE.Vector2(radius * Math.cos(angle), centerZ + radius * Math.sin(angle)))
    }
    const opening = circle.map((point) => new THREE.Vector3(point.x, topYAt(point.y), point.y))
    const bottom = circle.map((point) => new THREE.Vector3(point.x, bottomYAt(point.y), point.y))
    const outlinePoints = loopSegments(opening)
    const excessPoints: THREE.Vector3[] = []
    for (let i = 0; i < HOLE_SEGMENTS; i += HOLE_SEGMENTS / HOLE_VERTICAL_EDGES) {
      if (belowCeiling(bottom[i])) {
        const ceilingPoint = bottom[i].clone().setY(ceilingYAt(bottom[i].z))
        outlinePoints.push(opening[i], ceilingPoint)
        excessPoints.push(ceilingPoint, bottom[i])
      } else {
        outlinePoints.push(opening[i], bottom[i])
      }
    }
    for (let i = 0; i < HOLE_SEGMENTS; i++) {
      const start = bottom[i]
      const end = bottom[(i + 1) % HOLE_SEGMENTS]
      const middle = start.clone().add(end).multiplyScalar(0.5)
      if (belowCeiling(middle)) {
        excessPoints.push(start, end)
        excessPoints.push(start.clone().setY(ceilingYAt(start.z)), end.clone().setY(ceilingYAt(end.z)))
      } else {
        outlinePoints.push(start, end)
      }
    }
    const outline = dashedLines(outlinePoints)
    const excess = dashedLines(excessPoints, EXCESS_COLOR)

    let fill: THREE.Mesh
    let edge: THREE.LineSegments
    if (mode !== 'depth') {
      const raisedOpening = opening.map((point) => point.clone().setY(point.y + SURFACE_OFFSET))
      fill = translucentMesh(discGeometry(new THREE.Vector3(0, topYAt(centerZ) + SURFACE_OFFSET, centerZ), raisedOpening))
      edge = solidLines(loopSegments(raisedOpening))
    } else {
      const bottomColor = belowCeiling(new THREE.Vector3(0, holeBottomY, 0)) ? EXCESS_COLOR : GUIDE_COLOR
      fill = translucentMesh(discGeometry(new THREE.Vector3(0, holeBottomY, 0), bottom), false, bottomColor)
      edge = solidLines(loopSegments(bottom), false, bottomColor)
    }
    return { outline, excess, fill, edge }
  }, [params, mode])

  useEffect(() => {
    return () => {
      disposeObject(guide.outline)
      disposeObject(guide.excess)
      disposeObject(guide.fill)
      disposeObject(guide.edge)
    }
  }, [guide])

  return (
    <group>
      <primitive object={guide.fill} renderOrder={999} />
      <primitive object={guide.edge} renderOrder={1000} />
      <primitive object={guide.outline} renderOrder={1000} />
      <primitive object={guide.excess} renderOrder={1000} />
    </group>
  )
}
