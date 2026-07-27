import type { EngineVersion } from '../src/index.ts'
import { decodeLcfFile, encodeLcfFile, lcfFormatFor } from '../src/codec/formats.ts'

/** Decode and re-encode a file's bytes, dispatching the codec by extension. */
export function reencode(bytes: Uint8Array, fileName: string, engine: EngineVersion): Uint8Array {
  const format = lcfFormatFor(fileName)!
  const options = { engine }
  return encodeLcfFile(decodeLcfFile<object>(bytes, format, options), format, options)
}
