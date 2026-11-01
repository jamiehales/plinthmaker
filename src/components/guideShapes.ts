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
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, depthTest }),
  )
}

export function disposeObject(object: THREE.Mesh | THREE.LineSegments) {
  object.geometry.dispose()
  ;(object.material as THREE.Material).dispose()
}
