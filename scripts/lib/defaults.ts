import type { DefaultScalar, FieldCodec, FieldDefaultValue } from '../../src/codec/descriptors.ts'

/**
 * Default Value cells hold numbers, True/False, quoted strings, list
 * expressions like `[31]+[15]*143`, and `2k|2k3` splits.
 */
export function parseDefaultCell(rawDefault: string, codec: FieldCodec): FieldDefaultValue | undefined {
  if (rawDefault === '')
    return undefined
  if (!rawDefault.startsWith('"') && rawDefault.includes('|')) {
    const parts = rawDefault.split('|')
    if (parts.length !== 2)
      throw new Error(`Bad split default: ${rawDefault}`)
    return { '2k': parseLiteral(parts[0]!, codec), '2k3': parseLiteral(parts[1]!, codec) }
  }
  return parseLiteral(rawDefault, codec)
}

function parseLiteral(text: string, codec: FieldCodec): DefaultScalar {
  if (text === 'True')
    return true
  if (text === 'False')
    return false
  if (text.startsWith('"') && text.endsWith('"'))
    return text.slice(1, -1)
  if (text.startsWith('['))
    return parseListExpression(text)
  const value = Number(text)
  if (Number.isNaN(value))
    throw new Error(`Bad default literal: ${text}`)
  // Boolean defaults are sometimes written as plain integers.
  if (codec.kind === 'scalar' && codec.scalar === 'boolean')
    return value > 0
  return value
}

/** `[v]` terms with an optional `*count` repeat, joined by `+`. */
function parseListExpression(text: string): number[] {
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
