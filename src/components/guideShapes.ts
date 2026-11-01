import * as THREE from 'three'

export const GUIDE_COLOR = 0xffc857
export const EXCESS_COLOR = 0xe2685c

export function loopSegments(loop: THREE.Vector3[]): THREE.Vector3[] {
  return loop.flatMap((point, i) => [point, loop[(i + 1) % loop.length]])
}

export function dashedLines(points: THREE.Vector3[], color = GUIDE_COLOR): THREE.LineSegments {
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({ color, dashSize: 1.5, gapSize: 1, transparent: true, opacity: 0.9, depthTest: false }),
  )
  lines.computeLineDistances()
  return lines
}

export function solidLines(points: THREE.Vector3[], depthTest = true, color = GUIDE_COLOR): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, depthTest }),
  )
}

export function translucentMesh(geometry: THREE.BufferGeometry, depthTest = true, color = GUIDE_COLOR): THREE.Mesh {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, depthTest, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  )
}

const ELLIPSE_SEGMENTS = 96

export function makeOutline(shape: 'rectangle' | 'ellipse', width: number, depth: number): THREE.Vector2[] {
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

export function liftOutline(outline: THREE.Vector2[], heightAt: (z: number) => number): THREE.Vector3[] {
  return outline.map((point) => new THREE.Vector3(point.x, heightAt(point.y), point.y))
}

export function stripGeometry(lowerLoop: THREE.Vector3[], upperLoop: THREE.Vector3[]): THREE.BufferGeometry {
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

export function disposeObject(object: THREE.Mesh | THREE.LineSegments) {
  object.geometry.dispose()
  ;(object.material as THREE.Material).dispose()
}
