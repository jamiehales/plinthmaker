import * as THREE from 'three'
import {
  type Shape,
  type PlinthParams,
  type DrillJigParams,
  buildGeometry,
  buildJigGeometry,
} from './geometryBuilder.ts'

export type GeometryData = {
  position: Float32Array
  index: Uint32Array | null
}

function serializeGeometry(geo: THREE.BufferGeometry): GeometryData {
  const position = geo.attributes.position.array as Float32Array
  const index = geo.index ? (geo.index.array as Uint32Array) : null
  return { position: position.slice(), index: index ? index.slice() : null }
}

function serializeNullableGeometry(geo: THREE.BufferGeometry | null): GeometryData | null {
  return geo ? serializeGeometry(geo) : null
}

export type BuildPlinthMessage = {
  id: number
  type: 'plinth'
  params: PlinthParams
  baseSegMM: number
  filletSegMM: number
  useCDT: boolean
}

export type BuildJigMessage = {
  id: number
  type: 'jig'
  shape: Shape
  plinthParams: PlinthParams
  jigParams: DrillJigParams
  baseSegMM: number
  filletSegMM: number
  useCDT: boolean
  computeCavity: boolean
}

export type BuildMessage = BuildPlinthMessage | BuildJigMessage

export type BuildResultMessage = {
  id: number
  type: 'plinth'
  geometry: GeometryData
} | {
  id: number
  type: 'jig'
  jig: GeometryData
  cavity: GeometryData | null
} | {
  id: number
  type: 'error'
  error: string
}

export type BuildPlinthMessageFields = Omit<BuildPlinthMessage, 'id'>
export type BuildJigMessageFields = Omit<BuildJigMessage, 'id'>

export function handleBuild(msg: BuildMessage): BuildResultMessage {
  const t0 = performance.now()
  if (msg.type === 'plinth') {
    const geo = buildGeometry(msg.params, msg.baseSegMM, msg.filletSegMM, msg.useCDT)
    const t1 = performance.now()
    const vertCount = geo.attributes.position.count
    const triCount = geo.index ? geo.index.count / 3 : vertCount / 3
    console.log(
      `[plinth] ${(t1 - t0).toFixed(1)}ms | ${vertCount} verts / ${Math.round(triCount)} tris | ` +
      `shape=${msg.params.shape} w=${msg.params.width} d=${msg.params.depth} h=${msg.params.height} ` +
      `hole=${msg.params.addHole ? msg.params.holeDiameter + 'mm' : 'none'} ` +
      `angle=${msg.params.angleTop ? msg.params.topAngle + '°' : 'none'} ` +
      `round=${msg.params.roundStyle}/${msg.params.roundLocation}/${msg.params.roundSize} ` +
      `segMM=${msg.baseSegMM} CDT=${msg.useCDT}`
    )
    const result: BuildResultMessage = { id: msg.id, type: 'plinth', geometry: serializeGeometry(geo) }
    geo.dispose()
    return result
  }
  const { jig, cavity } = buildJigGeometry(msg.shape, msg.plinthParams, msg.jigParams, msg.baseSegMM, msg.filletSegMM, msg.useCDT, msg.computeCavity)
  const t1 = performance.now()
  const vertCount = jig.attributes.position.count
  const triCount = jig.index ? jig.index.count / 3 : vertCount / 3
  console.log(
    `[jig] ${(t1 - t0).toFixed(1)}ms | ${vertCount} verts / ${Math.round(triCount)} tris | ` +
    `shape=${msg.shape} w=${msg.plinthParams.width} d=${msg.plinthParams.depth} h=${msg.plinthParams.height} ` +
    `wall=${msg.jigParams.wallSize} jigH=${msg.jigParams.jigHeight} overlap=${msg.jigParams.overlap} ` +
    `hole=${msg.plinthParams.addHole ? msg.plinthParams.holeDiameter + 'mm' : 'none'} ` +
    `angle=${msg.plinthParams.angleTop ? msg.plinthParams.topAngle + '°' : 'none'} ` +
    `flatten=${msg.jigParams.flattenTop} ` +
    `segMM=${msg.baseSegMM} CDT=${msg.useCDT}`
  )
  const result: BuildResultMessage = {
    id: msg.id,
    type: 'jig',
    jig: serializeGeometry(jig),
    cavity: serializeNullableGeometry(cavity),
  }
  jig.dispose()
  cavity?.dispose()
  return result
}