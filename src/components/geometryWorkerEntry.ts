import { handleBuild, type BuildMessage, type BuildResultMessage } from './geometryWorker.ts'
import { loadManifold } from './csg.ts'

const manifoldReady = loadManifold()

self.onmessage = async (e: MessageEvent<BuildMessage>) => {
  try {
    await manifoldReady
    const result: BuildResultMessage = handleBuild(e.data)
    ;(self as unknown as Worker).postMessage(result)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id: e.data.id, type: 'error', error: String(err) })
  }
}
