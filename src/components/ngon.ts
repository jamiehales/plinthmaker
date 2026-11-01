import * as THREE from 'three'
import { MIN_NGON_SIDES, MAX_NGON_SIDES } from '../defaults.ts'

export interface PolygonEdge {
  start: THREE.Vector2
  end: THREE.Vector2
  normal: THREE.Vector2
  offset: number
}

export function clampNgonSides(sides: number): number {
  return Math.min(MAX_NGON_SIDES, Math.max(MIN_NGON_SIDES, Math.round(sides)))
}

function unitNgonVertices(sides: number): { vertices: THREE.Vector2[]; minX: number; maxX: number; minZ: number; maxZ: number } {
  const sideCount = clampNgonSides(sides)
  const vertices: THREE.Vector2[] = []
  for (let i = 0; i < sideCount; i++) {
    const angle = Math.PI / 2 + Math.PI / sideCount + (i / sideCount) * Math.PI * 2
    vertices.push(new THREE.Vector2(Math.cos(angle), Math.sin(angle)))
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x)
    maxX = Math.max(maxX, vertex.x)
    minZ = Math.min(minZ, vertex.y)
    maxZ = Math.max(maxZ, vertex.y)
  }
  return { vertices, minX, maxX, minZ, maxZ }
}

export function ngonDepthRatio(sides: number): number {
  const { minX, maxX, minZ, maxZ } = unitNgonVertices(sides)
  return (maxZ - minZ) / (maxX - minX)
}

export function ngonVertices(sides: number, width: number, depth: number): THREE.Vector2[] {
  const { vertices: unitVertices, minX, maxX, minZ, maxZ } = unitNgonVertices(sides)
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const scaleX = Math.max(0.01, width) / (maxX - minX)
  const scaleZ = Math.max(0.01, depth) / (maxZ - minZ)
  return unitVertices.map((vertex) => new THREE.Vector2((vertex.x - centerX) * scaleX, (vertex.y - centerZ) * scaleZ))
}

export function polygonEdges(vertices: THREE.Vector2[]): PolygonEdge[] {
  return vertices.map((start, i) => {
    const end = vertices[(i + 1) % vertices.length]
    const normal = new THREE.Vector2(end.y - start.y, -(end.x - start.x)).normalize()
    return { start, end, normal, offset: normal.dot(start) }
  })
}

function offsetPolygonUnclamped(vertices: THREE.Vector2[], distance: number): THREE.Vector2[] {
  const edges = polygonEdges(vertices)
  const count = edges.length
  return edges.map((edge, i) => {
    const previous = edges[(i - 1 + count) % count]
    const previousOffset = previous.offset + distance
    const edgeOffset = edge.offset + distance
    const determinant = previous.normal.x * edge.normal.y - previous.normal.y * edge.normal.x
    if (Math.abs(determinant) < 1e-9) return edge.start.clone().addScaledVector(edge.normal, distance)
    return new THREE.Vector2(
      (previousOffset * edge.normal.y - edgeOffset * previous.normal.y) / determinant,
      (edgeOffset * previous.normal.x - previousOffset * edge.normal.x) / determinant,
    )
  })
}

function keepsEdgeDirections(original: THREE.Vector2[], offset: THREE.Vector2[]): boolean {
  const count = original.length
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count
    const originalDx = original[next].x - original[i].x
    const originalDz = original[next].y - original[i].y
    const offsetDx = offset[next].x - offset[i].x
    const offsetDz = offset[next].y - offset[i].y
    if (originalDx * offsetDx + originalDz * offsetDz <= 0) return false
  }
  return true
}

export function maxPolygonInset(vertices: THREE.Vector2[]): number {
  let low = 0
  let high = Math.max(...polygonEdges(vertices).map((edge) => Math.abs(edge.offset)))
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2
    if (keepsEdgeDirections(vertices, offsetPolygonUnclamped(vertices, -middle))) low = middle
    else high = middle
  }
  return low
}

export function offsetPolygon(vertices: THREE.Vector2[], distance: number): THREE.Vector2[] {
  if (Math.abs(distance) < 1e-9) return vertices.map((vertex) => vertex.clone())
  const safeDistance = distance < 0 ? Math.max(distance, -Math.max(0, maxPolygonInset(vertices) - 0.05)) : distance
  return offsetPolygonUnclamped(vertices, safeDistance)
}

export function ngonOutline(sides: number, width: number, depth: number, offset = 0): THREE.Vector2[] {
  return offsetPolygon(ngonVertices(sides, width, depth), offset)
}

export function ngonCavityOutline(sides: number, width: number, depth: number, wallThickness: number): THREE.Vector2[] {
  return ngonOutline(sides, width, depth, -wallThickness)
}

function cornerGeometry(vertices: THREE.Vector2[], i: number) {
  const count = vertices.length
  const corner = vertices[i]
  const previous = vertices[(i - 1 + count) % count]
  const next = vertices[(i + 1) % count]
  const incoming = new THREE.Vector2().subVectors(corner, previous)
  const outgoing = new THREE.Vector2().subVectors(next, corner)
  const incomingLength = incoming.length()
  const outgoingLength = outgoing.length()
  incoming.divideScalar(incomingLength || 1)
  outgoing.divideScalar(outgoingLength || 1)
  const turn = Math.acos(Math.max(-1, Math.min(1, incoming.dot(outgoing))))
  const halfInterior = (Math.PI - turn) / 2
  return { corner, incoming, outgoing, incomingLength, outgoingLength, turn, halfInterior }
}

export function maxCornerRadius(vertices: THREE.Vector2[]): number {
  let limit = Infinity
  for (let i = 0; i < vertices.length; i++) {
    const { incomingLength, outgoingLength, halfInterior } = cornerGeometry(vertices, i)
    limit = Math.min(limit, (Math.min(incomingLength, outgoingLength) / 2) * Math.tan(halfInterior))
  }
  return limit
}

export function maxCornerTurn(vertices: THREE.Vector2[]): number {
  let largest = 0
  for (let i = 0; i < vertices.length; i++) largest = Math.max(largest, cornerGeometry(vertices, i).turn)
  return largest
}

export function roundPolygonCorners(vertices: THREE.Vector2[], radius: number, arcSegments: number): THREE.Vector2[] {
  const rounded: THREE.Vector2[] = []
  for (let i = 0; i < vertices.length; i++) {
    const { corner, incoming, outgoing, turn, halfInterior } = cornerGeometry(vertices, i)
    const tangentDistance = radius / Math.tan(halfInterior)
    const arcStart = corner.clone().addScaledVector(incoming, -tangentDistance)
    const arcCenter = arcStart.clone().add(new THREE.Vector2(-incoming.y, incoming.x).multiplyScalar(radius))
    const startAngle = Math.atan2(arcStart.y - arcCenter.y, arcStart.x - arcCenter.x)
    rounded.push(arcStart)
    for (let j = 1; j < arcSegments; j++) {
      const angle = startAngle + (turn * j) / arcSegments
      rounded.push(new THREE.Vector2(arcCenter.x + radius * Math.cos(angle), arcCenter.y + radius * Math.sin(angle)))
    }
    rounded.push(corner.clone().addScaledVector(outgoing, tangentDistance))
  }
  return rounded
}

export function pointInConvexPolygon(vertices: THREE.Vector2[], x: number, z: number, margin = 0): boolean {
  for (const edge of polygonEdges(vertices)) {
    if (edge.normal.x * x + edge.normal.y * z > edge.offset - margin) return false
  }
  return true
}

export function distanceToPolygonBoundary(vertices: THREE.Vector2[], x: number, z: number): number {
  let nearest = Infinity
  for (const { start, end } of polygonEdges(vertices)) {
    const dx = end.x - start.x
    const dz = end.y - start.y
    const lengthSquared = dx * dx + dz * dz
    const t = lengthSquared < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.y) * dz) / lengthSquared))
    nearest = Math.min(nearest, Math.hypot(x - (start.x + t * dx), z - (start.y + t * dz)))
  }
  return nearest
}

export function clampToConvexPolygon(vertices: THREE.Vector2[], x: number, z: number): { x: number; z: number } {
  if (pointInConvexPolygon(vertices, x, z)) return { x, z }
  let low = 0
  let high = 1
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2
    if (pointInConvexPolygon(vertices, x * middle, z * middle)) low = middle
    else high = middle
  }
  return { x: x * low, z: z * low }
}
