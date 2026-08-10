import { useRef, useCallback, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import type { GeometryData, BuildMessage, BuildResultMessage, BuildPlinthMessage, BuildJigMessage } from './geometryWorker.ts'

let workerInstance: Worker | null = null

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('./geometryWorkerEntry.ts', import.meta.url), { type: 'module' })
  }
  return workerInstance
}

export function deserializeGeometry(data: GeometryData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3))
  if (data.index) geo.setIndex(new THREE.BufferAttribute(data.index, 1))
  geo.computeVertexNormals()
  return geo
}

export type BuildPlinthMessageFields = Omit<BuildPlinthMessage, 'id'>
export type BuildJigMessageFields = Omit<BuildJigMessage, 'id'>

type Resolver = (msg: BuildResultMessage) => void

let buildingCount = 0
let generationFailed = false
const listeners = new Set<() => void>()
function notify() { for (const l of listeners) l() }
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
function getBuildingSnapshot(): number { return buildingCount }
function getFailedSnapshot(): boolean { return generationFailed }

export function markBuilding() { buildingCount += 1; notify() }
export function markDone() { buildingCount = Math.max(0, buildingCount - 1); notify() }
export function markFailed() { generationFailed = true; notify() }
export function markSuccess() { generationFailed = false; notify() }

export function useBuilding(): boolean {
  return useSyncExternalStore(subscribe, getBuildingSnapshot, getBuildingSnapshot) > 0
}

export function useGenerationFailed(): boolean {
  return useSyncExternalStore(subscribe, getFailedSnapshot, getFailedSnapshot)
}

let nextId = 0
const resolvers = new Map<number, Resolver>()
let workerInitialized = false

function ensureWorker(): Worker {
  const worker = getWorker()
  if (!workerInitialized) {
    workerInitialized = true
    worker.addEventListener('message', (e: MessageEvent<BuildResultMessage>) => {
      const msg = e.data
      const resolver = resolvers.get(msg.id)
      if (resolver) {
        resolvers.delete(msg.id)
        resolver(msg)
      }
    })
  }
  return worker
}

export function useGeometryWorker() {
  const workerRef = useRef<Worker | null>(null)
  if (!workerRef.current) workerRef.current = ensureWorker()

  const build = useCallback((msg: BuildPlinthMessageFields | BuildJigMessageFields): { id: number; promise: Promise<BuildResultMessage> } => {
    const id = nextId++
    const promise = new Promise<BuildResultMessage>((resolve) => {
      resolvers.set(id, resolve)
      workerRef.current!.postMessage({ ...msg, id } as BuildMessage)
    })
    return { id, promise }
  }, [])

  return { build }
}