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

const WINDOWS_CODE_PAGE_NAMES = ['cp874', 'cp932', 'cp936', 'cp949', 'cp950', 'cp1250', 'cp1251', 'cp1252', 'cp1253', 'cp1254', 'cp1255', 'cp1256', 'cp1257', 'cp1258']

/** Maps a Windows code page to its `cp<N>` name, so `1252`, `windows-1252`, and `cp1252` record alike. */
export function canonicalEncodingName(encoding: string): string {
  if (!iconv.encodingExists(encoding))
    return encoding
  const codec = iconv.getCodec(encoding)
  return WINDOWS_CODE_PAGE_NAMES.find(name => iconv.getCodec(name) === codec) ?? encoding
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
        for (let index = 0; index < text.length; index++) {
          const byte = table.byteForChar.get(text[index]!)
          if (byte === undefined)
            throw unrepresentableError(String.fromCodePoint(text.codePointAt(index)!), encoding)
          bytes[index] = byte
        }
        return bytes
      },
    }
  }
  const knownEncoding = encoding as Parameters<typeof iconv.decode>[1]
  const roundTrips = (text: string): boolean => iconv.decode(iconv.encode(text, knownEncoding), knownEncoding) === text
  return {
    decode: bytes => iconv.decode(bytes, knownEncoding),
    // iconv-lite substitutes `?` for an unmappable character.
    encode(text) {
      const bytes = iconv.encode(text, knownEncoding)
      if (iconv.decode(bytes, knownEncoding) !== text)
        throw unrepresentableError([...text].find(char => !roundTrips(char)), encoding)
      return bytes
    },
  }
}

function unrepresentableError(char: string | undefined, encoding: string): LcfError {
  const subject = char === undefined ? 'Text' : `Character ${JSON.stringify(char)}`
  return new LcfError(`${subject} is not representable in ${encoding}`)
}

function isLosslessFor(encoding: string, bytes: Uint8Array): boolean {
  const transcoder = createTranscoder(encoding)
  try {
    return bytesEqual(transcoder.encode(transcoder.decode(bytes)), bytes)
  }
  catch {
    return false
  }
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
  'ISO-8859-1': 'cp1252',
  'ISO-8859-2': 'cp1250',
  'ISO-8859-5': 'cp1251',
  'ISO-8859-6': 'cp1256',
  'ISO-8859-7': 'cp1253',
  'ISO-8859-8': 'cp1255',
}

/** Verdicts that are never right for a legacy game file. */
const IGNORED_DETECTION_VERDICTS = new Set(['ASCII', 'UTF-16BE', 'UTF-16LE'])

/**
 * Runs charset detection over string bytes; returns an iconv-lite encoding
 * name or undefined. Candidates are tried in confidence order, and one is
 * accepted only if it reproduces the sample byte for byte. That gate only
 * rejects multi-byte misfires (e.g. Shift_JIS for a Western game) – every
 * single-byte encoding round-trips all 256 bytes by construction, so among
 * those the detector's ranking and the normalization table carry the decision.
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
