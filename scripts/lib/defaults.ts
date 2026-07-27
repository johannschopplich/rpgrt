import type { DefaultScalar, FieldCodec, FieldDefaultValue, FlagsDefault } from '../../src/codec/descriptors.ts'
import type { FlagBit } from './tables.ts'
import { toCamelCase } from './names.ts'

/**
 * Default Value cells hold numbers, True/False, quoted strings, list
 * expressions like `[31]+[15]*143` and `[0,1,2]`, `2k|2k3` splits, and – in
 * lsd and EasyRPG rows – symbolic constants (`kPanXDefault`), C integer
 * expressions (`9 * 256`), `DBString(kDefaultTerm)` wrappers, and
 * record/comprehension literals (`Music{ "" }`, `[x for x in range(0, 144)]`).
 *
 * `constants` maps a symbol to its raw `constants.csv` value, scoped to the
 * field's owning struct so the two `kDefaultMessage` rows never collide.
 */
export function parseDefaultCell(
  rawDefault: string,
  codec: FieldCodec,
  constants?: ReadonlyMap<string, string>,
): FieldDefaultValue | undefined {
  if (rawDefault === '')
    return undefined
  // Record-typed struct literals and Python range comprehensions have no scalar
  // representation; every such field is PersistIfDefault=1, so resolveDefault
  // synthesizes the value and byte-identity is unaffected (see decision 6).
  if (isRecordLiteral(rawDefault) || isComprehension(rawDefault))
    return undefined
  if (!rawDefault.startsWith('"') && rawDefault.includes('|')) {
    const parts = rawDefault.split('|')
    if (parts.length !== 2)
      throw new Error(`Bad split default: ${rawDefault}`)
    return { '2k': parseLiteral(parts[0]!, codec, constants), '2k3': parseLiteral(parts[1]!, codec, constants) }
  }
  return parseLiteral(rawDefault, codec, constants)
}

function isRecordLiteral(text: string): boolean {
  return /^[a-z_]\w*\s*\{/i.test(text)
}

function isComprehension(text: string): boolean {
  return / for /.test(text)
}

function parseLiteral(text: string, codec: FieldCodec, constants?: ReadonlyMap<string, string>): DefaultScalar {
  if (text === 'True')
    return true
  if (text === 'False')
    return false
  if (text.startsWith('"') && text.endsWith('"'))
    return unescapeCString(text.slice(1, -1))
  if (text.startsWith('['))
    return parseListExpression(text)
  const dbStringMatch = /^DBString\((?<symbol>\w+)\)$/.exec(text)
  if (dbStringMatch)
    return parseLiteral(dbStringMatch.groups!.symbol!, codec, constants)
  const constantValue = constants?.get(text)
  if (constantValue !== undefined)
    return parseLiteral(constantValue, codec, constants)
  const value = evaluateIntExpression(text) ?? Number(text)
  if (Number.isNaN(value))
    throw new Error(`Bad default literal: ${text}`)
  // Boolean defaults are sometimes written as plain integers.
  if (codec.kind === 'scalar' && codec.scalar === 'boolean')
    return value > 0
  return value
}

/** liblcf writes C sentinels like `\x1`; unescape the hex form to its code point. */
function unescapeCString(text: string): string {
  return text.replace(/\\x([0-9a-fA-F]+)/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
}

/** The only C expressions in the CSVs: a single `*` or `<<` on integer literals. */
function evaluateIntExpression(text: string): number | undefined {
  const multiply = /^(-?\d+)\s*\*\s*(-?\d+)$/.exec(text)
  if (multiply)
    return Number(multiply[1]) * Number(multiply[2])
  const shift = /^(-?\d+)\s*<<\s*(-?\d+)$/.exec(text)
  if (shift)
    return Number(shift[1]) << Number(shift[2])
  return undefined
}

/** `[v]` terms with an optional `*count` repeat, joined by `+`, or a plain `[v,v,…]` list. */
function parseListExpression(text: string): number[] {
  const plainListMatch = /^\[(?<values>-?\d+(?:\s*,\s*-?\d+)+)\]$/.exec(text)
  if (plainListMatch)
    return plainListMatch.groups!.values!.split(',').map(Number)
  const values: number[] = []
  for (const term of text.split('+')) {
    const match = /^\[(?<value>-?\d+)\](?:\*(?<repeat>\d+))?$/.exec(term.trim())
    if (!match)
      throw new Error(`Bad list default: ${text}`)
    const value = Number(match.groups!.value)
    const repeatCount = match.groups!.repeat === undefined ? 1 : Number(match.groups!.repeat)
    for (let index = 0; index < repeatCount; index++)
      values.push(value)
  }
  return values
}

/**
 * A flag-set default cell is a bitmask over the set's bits in order, mirroring
 * liblcf's `flag_set`: bit n of the mask is the nth flag. Left
 * as a bare number it would leak into decoded records where the type declares
 * per-bit booleans.
 */
export function expandFlagsDefault(value: FieldDefaultValue, bits: FlagBit[]): FlagsDefault {
  if (typeof value !== 'number')
    throw new Error(`Flag-set default is not a bitmask: ${JSON.stringify(value)}`)
  const flags: FlagsDefault = {}
  bits.forEach((bit, index) => {
    flags[toCamelCase(bit.fieldName)] = (value & (1 << index)) !== 0
  })
  return flags
}
