import type { Database, MapUnit } from '../src/index.ts'
import { describe, expect, it } from 'vitest'
import { defaultRecord } from '../src/codec/defaults.ts'
import { decideEncoding, decideEngine } from '../src/commands/resolve.ts'
import { createTranscoder } from '../src/encoding.ts'
import { encodeDatabase, encodeMapUnit } from '../src/index.ts'

function database2k3Bytes(): Uint8Array {
  return encodeDatabase(defaultRecord('Database', '2k3') as unknown as Database, { engine: '2k3' })
}

function map2kBytes(): Uint8Array {
  return encodeMapUnit(defaultRecord('MapUnit', '2k') as unknown as MapUnit, { engine: '2k' })
}

describe('decideEngine', () => {
  it('lets the flag win over a sibling database', () => {
    const result = decideEngine({ engineFlag: '2k', kind: 'ldb', bytes: database2k3Bytes(), databaseBytes: database2k3Bytes() })
    expect(result).toEqual({ engine: '2k', engineSource: 'flag' })
  })

  it('scans the database ahead of a round-trip probe', () => {
    const bytes = database2k3Bytes()
    const result = decideEngine({ kind: 'ldb', bytes, databaseBytes: bytes })
    expect(result).toEqual({ engine: '2k3', engineSource: 'database' })
  })

  it('identifies a lone 2k map by re-encoding when no database is present', () => {
    const result = decideEngine({ kind: 'lmu', bytes: map2kBytes() })
    expect(result).toEqual({ engine: '2k', engineSource: 'roundTrip' })
  })

  it('falls back to 2k3 when nothing decides', () => {
    const result = decideEngine({ kind: 'lmu', bytes: new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]) })
    expect(result).toEqual({ engine: '2k3', engineSource: 'fallback' })
  })

  it('rejects an unknown engine flag', () => {
    expect(() => decideEngine({ engineFlag: 'sega', kind: 'lmu', bytes: map2kBytes() })).toThrow('Unknown engine')
  })
})

describe('decideEncoding', () => {
  const japaneseSample = createTranscoder('shift_jis').encode('こんにちは。日本語のテキストサンプルです。')

  it('lets the flag win over an ini hint and validates it', () => {
    const result = decideEncoding({ encodingFlag: 'cp1252', iniText: '[EasyRPG]\nEncoding=932\n' })
    expect(result).toEqual({ encoding: 'cp1252', encodingSource: 'flag' })
  })

  it('prefers the ini hint over detection', () => {
    const result = decideEncoding({ iniText: '[EasyRPG]\nEncoding=1252\n', getSampleBytes: () => japaneseSample })
    expect(result).toEqual({ encoding: 'cp1252', encodingSource: 'ini' })
  })

  it('detects the encoding from a Shift-JIS sample', () => {
    const result = decideEncoding({ getSampleBytes: () => japaneseSample })
    expect(result.encodingSource).toBe('detected')
  })

  it('falls back to windows-1252 without an ini hint or sample', () => {
    const result = decideEncoding({})
    expect(result).toEqual({ encoding: 'windows-1252', encodingSource: 'fallback' })
  })

  it('rejects an unknown encoding flag', () => {
    expect(() => decideEncoding({ encodingFlag: 'not-an-encoding' })).toThrow('Unknown encoding')
  })
})
