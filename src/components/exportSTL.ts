import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { downloadBlob } from './download.ts'

export function exportSTL(geometry: THREE.BufferGeometry, filename: string, binary = true): void {
  const exporter = new STLExporter()
  const mesh = new THREE.Mesh(geometry)
  const result = exporter.parse(mesh, { binary })

  let blob: Blob
  if (binary) {
    const view = result as DataView
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
    blob = new Blob([buffer], { type: 'application/octet-stream' })
  } else {
    blob = new Blob([result as string], { type: 'text/plain' })
  }
  downloadBlob(blob, filename)
}
