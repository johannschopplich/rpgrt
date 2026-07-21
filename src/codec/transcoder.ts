import { LcfError } from './errors.ts'

/** Converts between wire bytes (legacy code page) and JS strings. */
export interface Transcoder {
  decode: (bytes: Uint8Array) => string
  encode: (text: string) => Uint8Array
}

/**
 * Maps each byte to the code point of the same value. Lossless for any input,
 * so round trips stay byte-exact even when the real encoding is unknown –
 * non-ASCII text just reads as mojibake until a real transcoder is supplied.
 */
export const latin1Transcoder: Transcoder = {
  decode(bytes) {
    let text = ''
    for (const byte of bytes)
      text += String.fromCharCode(byte)
    return text
  },
  encode(text) {
    const bytes = new Uint8Array(text.length)
    for (let index = 0; index < text.length; index++) {
      const codePoint = text.charCodeAt(index)
      if (codePoint > 0xFF)
        throw new LcfError(`Character ${JSON.stringify(text[index])} is outside the byte range; supply a transcoder for this encoding`)
      bytes[index] = codePoint
    }
    return bytes
  },
}
