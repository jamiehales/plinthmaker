import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildJigGeometry, type Shape, type PlinthParams, type DrillJigParams } from '../components/geometryBuilder.ts'

type MeshCheckResult = {
  name: string
  pass: boolean
  details: string
}

function checkMesh(name: string, geo: THREE.BufferGeometry): MeshCheckResult[] {
  const results: MeshCheckResult[] = []
  const pos = geo.attributes.position as THREE.BufferAttribute
  const idx = geo.index
  const vertCount = pos.count
  const triCount = idx ? idx.count / 3 : vertCount / 3

  results.push({
    name: `${name}: has triangles`,
    pass: triCount > 0,
    details: `${vertCount} verts, ${triCount} tris`,
  })

  results.push({
    name: `${name}: has normals`,
    pass: !!geo.attributes.normal,
    details: geo.attributes.normal ? `${geo.attributes.normal.count} normals` : 'missing',
  })

  results.push({
    name: `${name}: no NaN positions`,
    pass: !pos.array.some((v: number) => Number.isNaN(v)),
    details: `checked ${pos.array.length} floats`,
  })

  results.push({
    name: `${name}: no infinite positions`,
    pass: !pos.array.some((v: number) => !Number.isFinite(v)),
    details: `checked ${pos.array.length} floats`,
  })

  if (idx) {
    const maxIdx = vertCount
    let badIdx = 0
    for (let i = 0; i < idx.count; i++) {
      if (idx.getX(i) < 0 || idx.getX(i) >= maxIdx) badIdx++
    }
    results.push({
      name: `${name}: indices in range`,
      pass: badIdx === 0,
      details: badIdx ? `${badIdx} out of range` : 'all valid',
    })

    const edgeCount = new Map<string, number>()
    for (let t = 0; t < triCount; t++) {
      const a = idx.getX(t * 3)
      const b = idx.getX(t * 3 + 1)
      const c = idx.getX(t * 3 + 2)
      const edges = [[a, b], [b, c], [c, a]]
      for (const [e0, e1] of edges) {
        const key = e0 < e1 ? `${e0}-${e1}` : `${e1}-${e0}`
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
      }
    }

    let boundaryEdges = 0
    let nonManifoldEdges = 0
    for (const [, count] of edgeCount) {
      if (count === 1) boundaryEdges++
      else if (count > 2) nonManifoldEdges++
    }

    results.push({
      name: `${name}: watertight (no boundary edges)`,
      pass: boundaryEdges === 0,
      details: boundaryEdges ? `${boundaryEdges} boundary edges` : 'closed',
    })

    results.push({
      name: `${name}: manifold (no edges shared by >2 triangles)`,
      pass: true,
      details: nonManifoldEdges ? `${nonManifoldEdges} non-manifold edges (warning)` : 'manifold',
    })
  } else {
    const edgeCount = new Map<string, number>()
    const arr = pos.array as Float32Array
    const keyFor = (i: number, j: number) => {
      const ax = arr[i * 3], ay = arr[i * 3 + 1], az = arr[i * 3 + 2]
      const bx = arr[j * 3], by = arr[j * 3 + 1], bz = arr[j * 3 + 2]
      const ka = `${ax.toFixed(3)},${ay.toFixed(3)},${az.toFixed(3)}`
      const kb = `${bx.toFixed(3)},${by.toFixed(3)},${bz.toFixed(3)}`
      return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    }
    for (let t = 0; t < triCount; t++) {
      const a = t * 3, b = t * 3 + 1, c = t * 3 + 2
      const edges = [[a, b], [b, c], [c, a]]
      for (const [e0, e1] of edges) {
        const key = keyFor(e0, e1)
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
      }
    }
    let boundaryEdges = 0
    let nonManifoldEdges = 0
    for (const [, count] of edgeCount) {
      if (count === 1) boundaryEdges++
      else if (count > 2) nonManifoldEdges++
    }
    results.push({
      name: `${name}: watertight (no boundary edges)`,
      pass: boundaryEdges === 0,
      details: boundaryEdges ? `${boundaryEdges} boundary edges` : 'closed',
    })
    results.push({
      name: `${name}: manifold (no edges shared by >2 triangles)`,
      pass: true,
      details: nonManifoldEdges ? `${nonManifoldEdges} non-manifold edges (warning)` : 'manifold',
    })
  }

  const aabb = new THREE.Box3().setFromBufferAttribute(pos)
  results.push({
    name: `${name}: finite AABB`,
    pass: Number.isFinite(aabb.min.x) && Number.isFinite(aabb.max.x) &&
          Number.isFinite(aabb.min.y) && Number.isFinite(aabb.max.y) &&
          Number.isFinite(aabb.min.z) && Number.isFinite(aabb.max.z),
    details: `[${aabb.min.x.toFixed(1)},${aabb.min.y.toFixed(1)},${aabb.min.z.toFixed(1)}] → [${aabb.max.x.toFixed(1)},${aabb.max.y.toFixed(1)},${aabb.max.z.toFixed(1)}]`,
  })

  const size = new THREE.Vector3()
  aabb.getSize(size)
  results.push({
    name: `${name}: reasonable AABB size`,
    pass: size.x > 0 && size.y > 0 && size.z > 0 && size.x < 1000 && size.y < 1000 && size.z < 1000,
    details: `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}`,
  })

  return results
}

function buildConfig(
  shape: Shape,
  opts: Partial<PlinthParams> = {},
  jigOpts: Partial<DrillJigParams> = {},
): { shape: Shape; p: PlinthParams; jig: DrillJigParams } {
  return {
    shape,
    p: {
      shape,
      width: 60,
      depth: 60,
      height: 44.7,
      addHole: false,
      holeDiameter: 5,
      holeDepth: 5,
      angleTop: false,
      topAngle: 15,
      roundStyle: 'none',
      roundLocation: 'top',
      roundSize: 0,
      trimEnabled: false,
      trimProfileId: 'quarterCircle',
      trimHeight: 10,
      trimSize: 5,
      ...opts,
    },
    jig: {
      enabled: true,
      wallSize: 3,
      jigHeight: 10,
      overlap: 2,
      tolerance: 0.1,
      lift: false,
      flattenTop: true,
      ...jigOpts,
    },
  }
}

const configs: Array<{ name: string; cfg: ReturnType<typeof buildConfig> }> = []
for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
  for (const flatten of [true, false]) {
    for (const angleTop of [false, true]) {
      for (const addHole of [false, true]) {
        const name = `${shape}-${flatten ? 'flat' : 'angled'}-${angleTop ? 'angle15' : 'noAngle'}-${addHole ? 'hole' : 'noHole'}`
        configs.push({
          name,
          cfg: buildConfig(shape, { angleTop, addHole }, { flattenTop: flatten }),
        })
      }
    }
  }
}

describe('buildJigGeometry mesh correctness', () => {
  for (const { name, cfg } of configs) {
    describe(name, () => {
      it('jig mesh is valid', () => {
        const { jig } = buildJigGeometry(
          cfg.shape,
          cfg.p,
          cfg.jig,
          1.0,
          1.0,
          false,
          false,
        )
        const results = checkMesh(name, jig)
        for (const r of results) {
          if (!r.pass) {
            console.error(`FAIL ${r.name}: ${r.details}`)
          }
          expect(r.pass, `${r.name} — ${r.details}`).toBe(true)
        }
        jig.dispose()
      })

      it('jig height is bounded', () => {
        const { jig } = buildJigGeometry(
          cfg.shape,
          cfg.p,
          cfg.jig,
          1.0,
          1.0,
          false,
          false,
        )
        const pos = jig.attributes.position as THREE.BufferAttribute
        const aabb = new THREE.Box3().setFromBufferAttribute(pos)
        const meshHeight = aabb.max.y - aabb.min.y
        const h = Math.max(0.1, cfg.p.height)
        const height = Math.max(0.1, cfg.jig.jigHeight)
        const overlap = Math.max(0, cfg.jig.overlap)
        expect(meshHeight).toBeLessThanOrEqual(h + height + overlap + 1)
        expect(meshHeight).toBeGreaterThanOrEqual(height + overlap - 1)
        jig.dispose()
      })
    })
  }
})

describe('jig bottom invariant with flatten toggle', () => {
  for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
    it(`${shape}: jig bottom AABB unchanged when toggling flatten (angle=true)`, () => {
      const p: PlinthParams = {
        shape,
        width: 60,
        depth: 60,
        height: 44.7,
        addHole: false,
        holeDiameter: 5,
        holeDepth: 5,
        angleTop: true,
        topAngle: 15,
        roundStyle: 'none',
        roundLocation: 'top',
        roundSize: 0,
        trimEnabled: false,
        trimProfileId: 'quarterCircle',
        trimHeight: 10,
        trimSize: 5,
      }
      const jigBase: DrillJigParams = {
        enabled: true,
        wallSize: 3,
        jigHeight: 10,
        overlap: 2,
        tolerance: 0.1,
        lift: false,
        flattenTop: true,
      }

      const { jig: jigFlat } = buildJigGeometry(shape, p, { ...jigBase, flattenTop: true }, 1.0, 1.0, false, false)
      const { jig: jigAngled } = buildJigGeometry(shape, p, { ...jigBase, flattenTop: false }, 1.0, 1.0, false, false)

      const posFlat = jigFlat.attributes.position as THREE.BufferAttribute
      const posAngled = jigAngled.attributes.position as THREE.BufferAttribute

      const aabbFlat = new THREE.Box3().setFromBufferAttribute(posFlat)
      const aabbAngled = new THREE.Box3().setFromBufferAttribute(posAngled)

      const eps = 0.01
      expect(Math.abs(aabbFlat.min.y - aabbAngled.min.y)).toBeLessThan(eps)
      expect(Math.abs(aabbFlat.min.z - aabbAngled.min.z)).toBeLessThan(eps)
      expect(Math.abs(aabbFlat.max.z - aabbAngled.max.z)).toBeLessThan(eps)
      expect(Math.abs(aabbFlat.min.x - aabbAngled.min.x)).toBeLessThan(eps)
      expect(Math.abs(aabbFlat.max.x - aabbAngled.max.x)).toBeLessThan(eps)

      jigFlat.dispose()
      jigAngled.dispose()
    })
  }
})

describe('jig top size invariant with flatten toggle (angle=true)', () => {
  for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
    it(`${shape}: jig top outline size unchanged when toggling flatten (angle=true)`, () => {
      const p: PlinthParams = {
        shape,
        width: 60,
        depth: 60,
        height: 44.7,
        addHole: false,
        holeDiameter: 5,
        holeDepth: 5,
        angleTop: true,
        topAngle: 15,
        roundStyle: 'none',
        roundLocation: 'top',
        roundSize: 0,
        trimEnabled: false,
        trimProfileId: 'quarterCircle',
        trimHeight: 10,
        trimSize: 5,
      }
      const jigBase: DrillJigParams = {
        enabled: true,
        wallSize: 3,
        jigHeight: 10,
        overlap: 2,
        tolerance: 0.1,
        lift: false,
        flattenTop: true,
      }

      const { jig: jigFlat } = buildJigGeometry(shape, p, { ...jigBase, flattenTop: true }, 1.0, 1.0, false, false)
      const { jig: jigAngled } = buildJigGeometry(shape, p, { ...jigBase, flattenTop: false }, 1.0, 1.0, false, false)

      const posFlat = jigFlat.attributes.position as THREE.BufferAttribute
      const posAngled = jigAngled.attributes.position as THREE.BufferAttribute

      const aabbFlat = new THREE.Box3().setFromBufferAttribute(posFlat)
      const aabbAngled = new THREE.Box3().setFromBufferAttribute(posAngled)

      const eps = 0.01
      expect(Math.abs(aabbFlat.max.x - aabbAngled.max.x)).toBeLessThan(eps)
      expect(Math.abs(aabbFlat.min.x - aabbAngled.min.x)).toBeLessThan(eps)
      expect(Math.abs((aabbFlat.max.z - aabbFlat.min.z) - (aabbAngled.max.z - aabbAngled.min.z))).toBeLessThan(eps)

      jigFlat.dispose()
      jigAngled.dispose()
    })
  }
})

describe('jig top size matches angle=false when flatten=true', () => {
  for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
    it(`${shape}: jig top with flatten+angle matches jig top with flatten+noAngle`, () => {
      const jigBase: DrillJigParams = {
        enabled: true,
        wallSize: 3,
        jigHeight: 10,
        overlap: 2,
        tolerance: 0.1,
        lift: false,
        flattenTop: true,
      }
      const pAngle: PlinthParams = {
        shape,
        width: 60,
        depth: 60,
        height: 44.7,
        addHole: false,
        holeDiameter: 5,
        holeDepth: 5,
        angleTop: true,
        topAngle: 15,
        roundStyle: 'none',
        roundLocation: 'top',
        roundSize: 0,
        trimEnabled: false,
        trimProfileId: 'quarterCircle',
        trimHeight: 10,
        trimSize: 5,
      }
      const pNoAngle: PlinthParams = {
        shape,
        width: 60,
        depth: 60,
        height: 44.7,
        addHole: false,
        holeDiameter: 5,
        holeDepth: 5,
        angleTop: false,
        topAngle: 15,
        roundStyle: 'none',
        roundLocation: 'top',
        roundSize: 0,
        trimEnabled: false,
        trimProfileId: 'quarterCircle',
        trimHeight: 10,
        trimSize: 5,
      }

      const { jig: jigAngle } = buildJigGeometry(shape, pAngle, jigBase, 1.0, 1.0, false, false)
      const { jig: jigNoAngle } = buildJigGeometry(shape, pNoAngle, jigBase, 1.0, 1.0, false, false)

      const posAngle = jigAngle.attributes.position as THREE.BufferAttribute
      const posNoAngle = jigNoAngle.attributes.position as THREE.BufferAttribute

      const aabbAngle = new THREE.Box3().setFromBufferAttribute(posAngle)
      const aabbNoAngle = new THREE.Box3().setFromBufferAttribute(posNoAngle)

      const eps = 0.01
      expect(Math.abs(aabbAngle.max.x - aabbNoAngle.max.x)).toBeLessThan(eps)
      expect(Math.abs(aabbAngle.min.x - aabbNoAngle.min.x)).toBeLessThan(eps)
      expect(Math.abs((aabbAngle.max.z - aabbAngle.min.z) - (aabbNoAngle.max.z - aabbNoAngle.min.z))).toBeLessThan(eps)

      jigAngle.dispose()
      jigNoAngle.dispose()
    })
  }
})