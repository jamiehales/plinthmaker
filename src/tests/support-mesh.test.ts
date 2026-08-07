import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { type Shape, type PlinthParams, type SupportParams } from '../components/geometryBuilder.ts'
import { buildSupportMeshGeometry, computeSupportPositions, mergePlinthWithSupports, applySupportTransform, applyYUpToZUp } from '../components/supportBuilder.ts'
import { buildGeometry } from '../components/geometryBuilder.ts'

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
      pass: nonManifoldEdges === 0,
      details: nonManifoldEdges ? `${nonManifoldEdges} non-manifold edges` : 'manifold',
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
      pass: nonManifoldEdges === 0,
      details: nonManifoldEdges ? `${nonManifoldEdges} non-manifold edges` : 'manifold',
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

function buildPlinthConfig(shape: Shape, opts: Partial<PlinthParams> = {}): PlinthParams {
  return {
    shape,
    width: 40,
    depth: 40,
    height: 30,
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
  }
}

function buildSupportConfig(opts: Partial<SupportParams> = {}): SupportParams {
  return {
    enabled: true,
    plinthAngle: 15,
    raiseBy: 10,
    supportSize: 2,
    supportTipSize: 0.4,
    supportSpacing: 5,
    supportCaps: false,
    ...opts,
  }
}

const configs: Array<{ name: string; shape: Shape; p: PlinthParams; s: SupportParams }> = []
for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
  for (const angleTop of [false, true]) {
    for (const plinthAngle of [0, 15, 30]) {
      for (const raiseBy of [5, 10, 20]) {
        const name = `${shape}-${angleTop ? 'angleTop' : 'flat'}-tilt${plinthAngle}-raise${raiseBy}`
        configs.push({
          name,
          shape,
          p: buildPlinthConfig(shape, { angleTop }),
          s: buildSupportConfig({ plinthAngle, raiseBy }),
        })
      }
    }
  }
}

describe('buildSupportMeshGeometry mesh correctness', () => {
  for (const { name, shape, p, s } of configs) {
    describe(name, () => {
      it('support mesh is valid (caps on)', () => {
        const geo = buildSupportMeshGeometry(shape, p, { ...s, supportCaps: true }, 16)
        const results = checkMesh(name, geo)
        for (const r of results) {
          if (!r.pass) {
            console.error(`FAIL ${r.name}: ${r.details}`)
          }
          expect(r.pass, `${r.name} — ${r.details}`).toBe(true)
        }
        geo.dispose()
      })

      it('support mesh fits within expected bounds', () => {
        const geo = buildSupportMeshGeometry(shape, p, s, 16)
        const pos = geo.attributes.position as THREE.BufferAttribute
        const aabb = new THREE.Box3().setFromBufferAttribute(pos)
        expect(aabb.min.y).toBeGreaterThanOrEqual(-0.01)
        expect(aabb.max.y).toBeLessThanOrEqual(s.raiseBy + p.height + 1)
        geo.dispose()
      })
    })
  }
})

describe('buildSupportMeshGeometry caps off produces open tubes', () => {
  for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
    it(`${shape}: caps off has boundary edges, caps on is watertight`, () => {
      const p = buildPlinthConfig(shape)
      const s = buildSupportConfig({ plinthAngle: 15 })
      const geoOff = buildSupportMeshGeometry(shape, p, { ...s, supportCaps: false }, 16)
      const resultsOff = checkMesh(`${shape}-capsOff`, geoOff)
      const watertightOff = resultsOff.find((r) => r.name.endsWith('watertight (no boundary edges)'))
      expect(watertightOff?.pass).toBe(false)
      geoOff.dispose()

      const geoOn = buildSupportMeshGeometry(shape, p, { ...s, supportCaps: true }, 16)
      const resultsOn = checkMesh(`${shape}-capsOn`, geoOn)
      const watertightOn = resultsOn.find((r) => r.name.endsWith('watertight (no boundary edges)'))
      const manifoldOn = resultsOn.find((r) => r.name.endsWith('manifold (no edges shared by >2 triangles)'))
      expect(watertightOn?.pass).toBe(true)
      expect(manifoldOn?.pass).toBe(true)
      geoOn.dispose()
    })
  }
})

describe('computeSupportPositions', () => {
  for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
    it(`${shape}: produces positions for default params`, () => {
      const p = buildPlinthConfig(shape)
      const s = buildSupportConfig()
      const positions = computeSupportPositions(shape, p, s, 1.5)
      expect(positions.length).toBeGreaterThan(0)
    })

    it(`${shape}: zero supportSize returns empty`, () => {
      const p = buildPlinthConfig(shape)
      const s = buildSupportConfig({ supportSize: 0 })
      const positions = computeSupportPositions(shape, p, s, 1.5)
      expect(positions).toHaveLength(0)
    })

    it(`${shape}: positions are within footprint bounds`, () => {
      const p = buildPlinthConfig(shape, { width: 40, depth: 40 })
      const s = buildSupportConfig()
      const positions = computeSupportPositions(shape, p, s, 1.5)
      const tilt = (s.plinthAngle * Math.PI) / 180
      const cosT = Math.cos(tilt)
      const hw = p.width / 2
      const hd = (p.depth / 2) * cosT
      for (const pt of positions) {
        if (shape === 'ellipse') {
          const nx = pt.x / hw
          const nz = pt.z / hd
          expect(nx * nx + nz * nz).toBeLessThanOrEqual(1.01)
        } else {
          expect(Math.abs(pt.x)).toBeLessThanOrEqual(hw + 0.01)
          expect(Math.abs(pt.z)).toBeLessThanOrEqual(hd + 0.01)
        }
      }
    })
  }

  it('rectangle: outer ring places a support near each corner', () => {
    const p = buildPlinthConfig('rectangle', { width: 40, depth: 30 })
    const s = buildSupportConfig({ plinthAngle: 0 })
    const positions = computeSupportPositions('rectangle', p, s, 1.5)
    const hw = p.width / 2
    const hd = p.depth / 2
    const corners = [
      [hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd],
    ]
    const tol = s.supportSpacing / 2 + 0.5
    for (const [cx, cz] of corners) {
      const found = positions.some((pt) => Math.abs(pt.x - cx) <= tol && Math.abs(pt.z - cz) <= tol)
      expect(found, `corner (${cx},${cz}) missing`).toBe(true)
    }
  })

  it('ellipse: outer ring places a support near each axis extremum', () => {
    const p = buildPlinthConfig('ellipse', { width: 50, depth: 30 })
    const s = buildSupportConfig({ plinthAngle: 0 })
    const positions = computeSupportPositions('ellipse', p, s, 1.5)
    const hw = p.width / 2
    const hd = p.depth / 2
    const extrema = [
      [hw, 0], [-hw, 0], [0, hd], [0, -hd],
    ]
    const tol = s.supportSpacing / 2 + 0.5
    for (const [cx, cz] of extrema) {
      const found = positions.some((pt) => Math.abs(pt.x - cx) <= tol && Math.abs(pt.z - cz) <= tol)
      expect(found, `extremum (${cx},${cz}) missing`).toBe(true)
    }
  })
})

describe('mergePlinthWithSupports', () => {
  for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
    for (const plinthAngle of [0, 15, 30]) {
      it(`${shape}: merged geometry is valid and combined (tilt=${plinthAngle})`, () => {
        const p = buildPlinthConfig(shape)
        const s = buildSupportConfig({ plinthAngle })
        const plinthGeo = buildGeometry(p, 1.0, 1.0, false)
        const transformedPlinth = applySupportTransform(plinthGeo, s, p.depth)
        const supportGeo = buildSupportMeshGeometry(shape, p, s, 16)
        const merged = mergePlinthWithSupports(transformedPlinth, supportGeo)
        const pos = merged.attributes.position as THREE.BufferAttribute
        expect(pos.count).toBeGreaterThan(0)
        expect(pos.array.some((v: number) => Number.isNaN(v))).toBe(false)
        expect(pos.array.some((v: number) => !Number.isFinite(v))).toBe(false)
        const supportVertCount = supportGeo.attributes.position.count
        const plinthVertCount = transformedPlinth.attributes.position.count
        expect(pos.count).toBeGreaterThanOrEqual(plinthVertCount + supportVertCount - 1)
        merged.dispose()
        transformedPlinth.dispose()
        plinthGeo.dispose()
        supportGeo.dispose()
      })
    }
  }
})

describe('applySupportTransform', () => {
  it('applies tilt and raise to geometry', () => {
    const s = buildSupportConfig({ plinthAngle: 30, raiseBy: 15 })
    const box = new THREE.BoxGeometry(10, 10, 10)
    box.translate(0, 5, 0)
    const transformed = applySupportTransform(box, s, 10)
    const pos = transformed.attributes.position as THREE.BufferAttribute
    const aabb = new THREE.Box3().setFromBufferAttribute(pos)
    expect(aabb.min.y).toBeGreaterThan(0)
    expect(aabb.max.y).toBeGreaterThan(s.raiseBy)
    box.dispose()
    transformed.dispose()
  })
})

describe('applyYUpToZUp', () => {
  it('converts Y-up to Z-up', () => {
    const box = new THREE.BoxGeometry(10, 20, 30)
    const zup = applyYUpToZUp(box)
    const pos = zup.attributes.position as THREE.BufferAttribute
    const aabb = new THREE.Box3().setFromBufferAttribute(pos)
    const size = new THREE.Vector3()
    aabb.getSize(size)
    expect(size.x).toBeCloseTo(10, 1)
    expect(size.y).toBeCloseTo(30, 1)
    expect(size.z).toBeCloseTo(20, 1)
    box.dispose()
    zup.dispose()
  })
})

describe('trim bottom', () => {
  for (const shape of ['rectangle', 'ellipse'] as Shape[]) {
    it(`${shape}: plinth AABB grows by trimSize when trim enabled`, () => {
      const pNoTrim = buildPlinthConfig(shape, { width: 40, depth: 40, height: 30 })
      const pTrim = buildPlinthConfig(shape, {
        width: 40, depth: 40, height: 30,
        trimEnabled: true, trimSize: 5, trimHeight: 10, trimProfileId: 'quarterCircle',
      })
      const geoNoTrim = buildGeometry(pNoTrim, 1.0, 1.0, false)
      const geoTrim = buildGeometry(pTrim, 1.0, 1.0, false)
      const aabbNoTrim = new THREE.Box3().setFromBufferAttribute(geoNoTrim.attributes.position as THREE.BufferAttribute)
      const aabbTrim = new THREE.Box3().setFromBufferAttribute(geoTrim.attributes.position as THREE.BufferAttribute)
      const noTrimW = aabbNoTrim.max.x - aabbNoTrim.min.x
      const trimW = aabbTrim.max.x - aabbTrim.min.x
      expect(trimW).toBeGreaterThan(noTrimW + 9)
      expect(trimW).toBeLessThan(noTrimW + 11)
      geoNoTrim.dispose()
      geoTrim.dispose()
    })

    it(`${shape}: plinth mesh is valid with trim enabled`, () => {
      const p = buildPlinthConfig(shape, {
        width: 40, depth: 40, height: 30,
        trimEnabled: true, trimSize: 5, trimHeight: 10, trimProfileId: 'quarterCircle',
      })
      const geo = buildGeometry(p, 1.0, 1.0, false)
      const results = checkMesh(`${shape}-trim`, geo)
      for (const r of results) {
        if (!r.pass) console.error(`FAIL ${r.name}: ${r.details}`)
        expect(r.pass, `${r.name} — ${r.details}`).toBe(true)
      }
      geo.dispose()
    })

    it(`${shape}: stepped trim mesh is valid`, () => {
      const p = buildPlinthConfig(shape, {
        width: 40, depth: 40, height: 30,
        trimEnabled: true, trimSize: 5, trimHeight: 10, trimProfileId: 'stepped2',
      })
      const geo = buildGeometry(p, 1.0, 1.0, false)
      const results = checkMesh(`${shape}-trim-stepped`, geo)
      for (const r of results) {
        if (!r.pass) console.error(`FAIL ${r.name}: ${r.details}`)
        expect(r.pass, `${r.name} — ${r.details}`).toBe(true)
      }
      geo.dispose()
    })

    it(`${shape}: supports use trimmed footprint`, () => {
      const p = buildPlinthConfig(shape, {
        width: 40, depth: 40, height: 30,
        trimEnabled: true, trimSize: 5, trimHeight: 10, trimProfileId: 'quarterCircle',
      })
      const s = buildSupportConfig({ plinthAngle: 0 })
      const positions = computeSupportPositions(shape, p, s, 1.5)
      expect(positions.length).toBeGreaterThan(0)
      const hw = (p.width + 2 * p.trimSize) / 2
      const hd = (p.depth + 2 * p.trimSize) / 2
      for (const pt of positions) {
        if (shape === 'ellipse') {
          const nx = pt.x / hw
          const nz = pt.z / hd
          expect(nx * nx + nz * nz).toBeLessThanOrEqual(1.05)
        } else {
          expect(Math.abs(pt.x)).toBeLessThanOrEqual(hw + 0.5)
          expect(Math.abs(pt.z)).toBeLessThanOrEqual(hd + 0.5)
        }
      }
    })
  }

  for (const profileId of ['quarterCircle', 'stepped2'] as const) {
    it(`rectangle: trim with fillet edges is valid (${profileId})`, () => {
      const p = buildPlinthConfig('rectangle', {
        width: 40, depth: 40, height: 30,
        roundStyle: 'fillet', roundLocation: 'edges', roundSize: 2,
        trimEnabled: true, trimSize: 5, trimHeight: 10, trimProfileId: profileId,
      })
      const geo = buildGeometry(p, 1.0, 1.0, false)
      const results = checkMesh(`rect-trim-fillet-${profileId}`, geo)
      for (const r of results) {
        if (!r.pass) console.error(`FAIL ${r.name}: ${r.details}`)
        expect(r.pass, `${r.name} — ${r.details}`).toBe(true)
      }
      geo.dispose()
    })
  }
})