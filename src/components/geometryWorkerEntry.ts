import { handleBuild, type BuildMessage, type BuildResultMessage } from './geometryWorker.ts'

self.onmessage = (e: MessageEvent<BuildMessage>) => {
  try {
    const result: BuildResultMessage = handleBuild(e.data)
    ;(self as unknown as Worker).postMessage(result)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id: e.data.id, type: 'error', error: String(err) })
  }
}