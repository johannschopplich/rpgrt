import { describe, expect, it } from 'vitest'
import { collectStringBytes } from '../src/codec/detection-sample.ts'
import { LcfError } from '../src/codec/errors.ts'
import { latin1Transcoder } from '../src/codec/transcoder.ts'
import { createTranscoder, detectEncoding, encodingFromIni } from '../src/encoding.ts'

describe('createTranscoder', () => {
  it('round-trips windows-1252 text', () => {
    const transcoder = createTranscoder('windows-1252')
    const text = 'Käse – Straße'
    expect(transcoder.decode(transcoder.encode(text))).toBe(text)
    expect(transcoder.encode('ä')[0]).toBe(0xE4)
  })

  it('round-trips shift_jis text', () => {
    const transcoder = createTranscoder('Shift_JIS')
    const text = 'こんにちは世界'
    expect(transcoder.decode(transcoder.encode(text))).toBe(text)
  })

  it('rejects unknown encodings', () => {
    expect(() => createTranscoder('klingon-8')).toThrow(LcfError)
  })

  it('round-trips every byte value through a single-byte encoding', () => {
    const allBytes = Uint8Array.from({ length: 256 }, (_, index) => index)
    for (const encoding of ['windows-1252', 'ISO-8859-2', 'cp1250']) {
      const transcoder = createTranscoder(encoding)
      expect([...transcoder.encode(transcoder.decode(allBytes))], encoding).toEqual([...allBytes])
    }
  })
})

describe('encodingFromIni', () => {
  it('reads the EasyRPG section and normalizes code page numbers', () => {
    const iniText = '[RPG_RT]\nGameTitle=Test\n\n[EasyRPG]\nEncoding=932\n'
    expect(encodingFromIni(iniText)).toBe('cp932')
  })

  it('passes encoding names through', () => {
    expect(encodingFromIni('[EasyRPG]\nEncoding=Shift_JIS\n')).toBe('Shift_JIS')
  })

  it('ignores keys outside the EasyRPG section', () => {
    expect(encodingFromIni('[RPG_RT]\nEncoding=932\n')).toBeUndefined()
    expect(encodingFromIni('[RPG_RT]\nGameTitle=Test\n')).toBeUndefined()
  })
})

describe('detectEncoding', () => {
  it('detects japanese string bytes as the Windows Shift_JIS variant', () => {
    const text = '勇者は旅立った。魔王の城は北にある。伝説の剣を探せ。'.repeat(4)
    const bytes = createTranscoder('Shift_JIS').encode(text)
    expect(detectEncoding(bytes)).toBe('cp932')
  })

  it('returns undefined for an empty sample', () => {
    expect(detectEncoding(new Uint8Array())).toBeUndefined()
  })

  it('detects Western text as windows-1252, never an ISO variant', () => {
    const text = 'Käse und Brot für die Mönche im Gewölbe. Grüße aus dem Schloß. '.repeat(6)
    const bytes = createTranscoder('windows-1252').encode(text)
    expect(detectEncoding(bytes)).toBe('windows-1252')
  })

  it('survives a short sample by tiling it', () => {
    const bytes = createTranscoder('Shift_JIS').encode('魔王の城')
    expect(detectEncoding(bytes)).toBe('cp932')
  })
})

describe('collectStringBytes', () => {
  it('gathers nested strings as their original bytes', () => {
    const record = {
      name: latin1Transcoder.decode(createTranscoder('windows-1252').encode('Käse')),
      nested: { title: 'Öl' },
      list: [{ text: 'ab' }],
      count: 7,
      _unknown: [{ id: 1, bytes: new Uint8Array([0xFF]) }],
    }
    const bytes = collectStringBytes(record)
    expect(latin1Transcoder.decode(bytes)).toContain('ab\n')
    expect(bytes).toContain(0xE4)
    expect(bytes).not.toContain(0xFF)
  })
})
