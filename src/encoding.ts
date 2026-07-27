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

export function isKnownEncoding(encoding: string): boolean {
  return iconv.encodingExists(encoding)
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
 * liblcf remaps detector verdicts to the Windows code pages RPG_RT-era games
 * actually used: the ISO variants misdecode 0x80–0x9F as C1
 * controls, and the plain multi-byte names lack the Windows extensions.
 */
const DETECTED_ENCODING_NORMALIZATION: Record<string, string> = {
  'Shift_JIS': 'cp932',
  'EUC-KR': 'cp949',
  'GB18030': 'cp936',
  'ISO-8859-1': 'windows-1252',
  'ISO-8859-2': 'windows-1250',
  'ISO-8859-5': 'windows-1251',
  'ISO-8859-6': 'windows-1256',
  'ISO-8859-7': 'windows-1253',
  'ISO-8859-8': 'windows-1255',
}

/** Verdicts that are never right for a legacy game file. */
const IGNORED_DETECTION_VERDICTS = new Set(['ASCII', 'UTF-16BE', 'UTF-16LE'])

/**
 * Detection candidates are tried in confidence order, and one is accepted
 * only if it reproduces the sample byte for byte. That gate only rejects
 * multi-byte misfires (e.g. Shift_JIS for a Western game) – every single-byte
 * encoding round-trips all 256 bytes by construction, so among those the
 * detector's ranking and the normalization table carry the decision.
 */
export function detectEncoding(stringBytes: Uint8Array): string | undefined {
  if (stringBytes.length === 0)
    return undefined
  // Short samples give the detector little to work with; liblcf concatenates
  // the sample to itself until it reaches 100 bytes.
  let sample = stringBytes
  while (sample.length < 100) {
    const doubledSample = new Uint8Array(sample.length * 2)
    doubledSample.set(sample)
    doubledSample.set(sample, sample.length)
    sample = doubledSample
  }
  for (const candidate of analyse(sample)) {
    if (IGNORED_DETECTION_VERDICTS.has(candidate.name))
      continue
    const encoding = DETECTED_ENCODING_NORMALIZATION[candidate.name] ?? candidate.name
    if (iconv.encodingExists(encoding) && isLosslessFor(encoding, stringBytes))
      return encoding
  }
  return undefined
}
