import type { Transcoder } from './codec/transcoder.ts'
import { analyse } from 'chardet'
import iconv from 'iconv-lite'
import { bytesEqual } from './codec/bytes.ts'
import { LcfError } from './codec/errors.ts'

interface SingleByteTable {
  charForByte: string[]
  byteForChar: Map<string, number>
}

const singleByteTableCache = new Map<string, SingleByteTable | undefined>()

/**
 * Derives a bijective byte↔char table for single-byte encodings. iconv-lite
 * maps undefined slots (e.g. 0x81 in windows-1252) to U+FFFD, which would
 * break byte-exact round trips; those slots pass through as their own code
 * point instead. Returns undefined for multi-byte encodings.
 */
function singleByteTable(encoding: string): SingleByteTable | undefined {
  if (singleByteTableCache.has(encoding))
    return singleByteTableCache.get(encoding)
  const knownEncoding = encoding as Parameters<typeof iconv.decode>[1]
  const charForByte: string[] = []
  let isSingleByte = true
  for (let byte = 0; byte < 256 && isSingleByte; byte++) {
    const char = iconv.decode(Uint8Array.of(byte), knownEncoding)
    isSingleByte = char.length === 1 && iconv.decode(Uint8Array.of(byte, 0x41), knownEncoding) === `${char}A`
    charForByte.push(char)
  }
  let table: SingleByteTable | undefined
  if (isSingleByte) {
    const byteForChar = new Map<string, number>()
    for (let byte = 0; byte < 256; byte++) {
      if (charForByte[byte] === '�' || byteForChar.has(charForByte[byte]!))
        charForByte[byte] = String.fromCharCode(byte)
      byteForChar.set(charForByte[byte]!, byte)
    }
    table = { charForByte, byteForChar }
  }
  singleByteTableCache.set(encoding, table)
  return table
}

/** The encoding name follows iconv-lite naming. */
export function createTranscoder(encoding: string): Transcoder {
  if (!iconv.encodingExists(encoding))
    throw new LcfError(`Unknown encoding ${JSON.stringify(encoding)}`)
  const table = singleByteTable(encoding)
  if (table !== undefined) {
    return {
      decode(bytes) {
        let text = ''
        for (const byte of bytes)
          text += table.charForByte[byte]
        return text
      },
      encode(text) {
        const bytes = new Uint8Array(text.length)
        for (let index = 0; index < text.length; index++)
          bytes[index] = table.byteForChar.get(text[index]!) ?? 0x3F
        return bytes
      },
    }
  }
  const knownEncoding = encoding as Parameters<typeof iconv.decode>[1]
  return {
    decode: bytes => iconv.decode(bytes, knownEncoding),
    encode: text => iconv.encode(text, knownEncoding),
  }
}

function isLosslessFor(encoding: string, bytes: Uint8Array): boolean {
  const transcoder = createTranscoder(encoding)
  return bytesEqual(transcoder.encode(transcoder.decode(bytes)), bytes)
}

/** EasyRPG writes either an encoding name or a Windows code page number. */
export function encodingFromIni(iniText: string): string | undefined {
  let isInEasyRpgSection = false
  for (const line of iniText.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('[')) {
      isInEasyRpgSection = /^\[easyrpg\]$/i.test(trimmedLine)
    }
    else if (isInEasyRpgSection) {
      const separatorIndex = trimmedLine.indexOf('=')
      if (separatorIndex !== -1 && trimmedLine.slice(0, separatorIndex).trim().toLowerCase() === 'encoding') {
        const hint = trimmedLine.slice(separatorIndex + 1).trim()
        if (hint.length > 0)
          return normalizeEncodingHint(hint)
      }
    }
  }
  return undefined
}

function normalizeEncodingHint(hint: string): string {
  return /^\d+$/.test(hint) ? `cp${hint}` : hint
}

/**
 * Runs charset detection over string bytes; returns an iconv-lite encoding
 * name or undefined. Candidates are tried in confidence order, and one is
 * accepted only if it reproduces the sample byte for byte – a confidently
 * wrong guess (e.g. Shift_JIS for a Western game) must never corrupt data.
 */
export function detectEncoding(stringBytes: Uint8Array): string | undefined {
  if (stringBytes.length === 0)
    return undefined
  for (const candidate of analyse(stringBytes)) {
    // An ASCII verdict carries no information – every candidate encoding is an ASCII superset.
    if (candidate.name === 'ASCII' || !iconv.encodingExists(candidate.name))
      continue
    if (isLosslessFor(candidate.name, stringBytes))
      return candidate.name
  }
  return undefined
}
