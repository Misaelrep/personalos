import { makePixels, type TextureJob } from './pixels'

/**
 * Makes the scene's soft textures (see pixels.ts) off the thread that draws the frames:
 * it is sent jobs, one after another, and answers each with its pixels, handing over the buffer rather than copying it.
 */
const scope = self as unknown as { onmessage: ((e: MessageEvent<{ id: number; job: TextureJob }>) => void) | null; postMessage: (message: unknown, transfer: Transferable[]) => void }

scope.onmessage = (e) => {
  const { id, job } = e.data
  const pixels = makePixels(job)
  scope.postMessage({ id, pixels }, [pixels.data.buffer])
}
