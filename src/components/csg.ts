import * as THREE from 'three'
import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d'

const PROPERTIES_PER_VERTEX = 7
const NO_SECTION = -1

let manifoldModule: ManifoldToplevel | null = null
let loadingModule: Promise<ManifoldToplevel> | null = null

export function loadManifold(): Promise<ManifoldToplevel> {
  loadingModule ??= Module().then((loaded) => {
    loaded.setup()
    manifoldModule = loaded
    return loaded
  })
  return loadingModule
}

function requireManifold(): ManifoldToplevel {
  if (!manifoldModule) throw new Error('manifold-3d is not loaded; await loadManifold() first')
  return manifoldModule
}

function toManifold(wasm: ManifoldToplevel, geometry: THREE.BufferGeometry, made: Manifold[]): Manifold {
  const triangles = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  if (!triangles.attributes.normal) triangles.computeVertexNormals()
  const position = triangles.attributes.position
  const normal = triangles.attributes.normal
  const trimSection = triangles.attributes.trimSection
  const vertProperties = new Float32Array(position.count * PROPERTIES_PER_VERTEX)
  for (let i = 0; i < position.count; i++) {
    vertProperties.set([
      position.getX(i), position.getY(i), position.getZ(i),
      normal.getX(i), normal.getY(i), normal.getZ(i),
      trimSection ? trimSection.getX(i) : NO_SECTION,
    ], i * PROPERTIES_PER_VERTEX)
  }
  triangles.dispose()
  const mesh = new wasm.Mesh({
    numProp: PROPERTIES_PER_VERTEX,
    vertProperties,
    triVerts: Uint32Array.from({ length: position.count }, (_, i) => i),
  })
  mesh.merge()
  let solid: Manifold
  try {
    solid = new wasm.Manifold(mesh)
  } catch {
    throw new Error('Boolean input is not a closed solid')
  }
  made.push(solid)
  if (solid.status() !== 'NoError') throw new Error(`Boolean input is not a closed solid (${solid.status()})`)
  return solid
}

function toGeometry(solid: Manifold): THREE.BufferGeometry {
  const mesh = solid.getMesh()
  const stride = mesh.numProp
  const vertexCount = mesh.vertProperties.length / stride
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const trimSections = new Float32Array(vertexCount).fill(NO_SECTION)
  for (let i = 0; i < vertexCount; i++) {
    for (let axis = 0; axis < 3; axis++) {
      positions[i * 3 + axis] = mesh.vertProperties[i * stride + axis]
      normals[i * 3 + axis] = stride >= 6 ? mesh.vertProperties[i * stride + 3 + axis] : 0
    }
    if (stride >= PROPERTIES_PER_VERTEX) trimSections[i] = mesh.vertProperties[i * stride + 6]
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('trimSection', new THREE.BufferAttribute(trimSections, 1))
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.triVerts), 1))
  return geometry
}

function applyBoolean(target: THREE.BufferGeometry, tools: THREE.BufferGeometry[], operation: 'add' | 'subtract'): THREE.BufferGeometry {
  const wasm = requireManifold()
  const made: Manifold[] = []
  try {
    let current = toManifold(wasm, target, made)
    for (const tool of tools) {
      current = current[operation](toManifold(wasm, tool, made))
      made.push(current)
    }
    return toGeometry(current)
  } finally {
    for (const solid of made) solid.delete()
  }
}

export function subtractAll(target: THREE.BufferGeometry, tools: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return applyBoolean(target, tools, 'subtract')
}

export function union(first: THREE.BufferGeometry, second: THREE.BufferGeometry): THREE.BufferGeometry {
  return applyBoolean(first, [second], 'add')
}
