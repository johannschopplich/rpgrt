import type { EngineVersion } from '../index.ts'

/**
 * Serialization kinds, mirroring liblcf's wire behavior:
 *
 * - `berInt` is the BER integer used by scalar Int32, enums, and refs.
 * - Vector elements are always fixed-width little-endian – including `int32`,
 *   even though the scalar of the same CSV type is BER.
 * - `dbBitArray` stores one whole byte per boolean, despite the name.
 * - `berIntList` (BER count + BER values) occurs only inside the hand-coded
 *   EventCommand layout.
 * - `rawField` embeds a raw record's bare fields as the chunk payload.
 * - `eventCommands` payloads end with four 0x00 bytes; `moveCommands` are
 *   bounded by the chunk length alone.
 * - `stringVector` is liblcf's sparse `Vector<DBString>`: runs of empty
 *   strings compress into `0x800000000 - gap` BER markers between
 *   length-prefixed strings.
 */
export type ScalarKind = 'berInt' | 'boolean' | 'int8' | 'uint8' | 'int16' | 'uint32' | 'double'

export type VectorElementKind = 'boolean' | 'uint8' | 'int16' | 'int32' | 'uint32'

export type FieldCodec
  = | { kind: 'scalar', scalar: ScalarKind }
    | { kind: 'string' }
    | { kind: 'vector', element: VectorElementKind }
    | { kind: 'stringVector' }
    | { kind: 'berIntList' }
    | { kind: 'dbBitArray' }
    | { kind: 'flags', flagSet: string }
    | { kind: 'record', record: string }
    | { kind: 'rawField', record: string }
    | { kind: 'array', record: string }
    | { kind: 'eventCommands' }
    | { kind: 'moveCommands' }
    | { kind: 'databaseVersion' }
    | { kind: 'emptyBlock' }

export type DefaultScalar = number | boolean | string | number[]

/** e.g. Actor finalLevel 50 (2k) / 99 (2k3). */
export type EngineSplitDefault = Record<EngineVersion, DefaultScalar>

/** A flag-set default expanded to its per-bit booleans, e.g. SavePicture flags. */
export type FlagsDefault = Record<string, boolean>

export type FieldDefaultValue = DefaultScalar | EngineSplitDefault | FlagsDefault

export interface FieldDescriptor {
  key: string
  /** The liblcf field name when the camelCased key cannot be regex-inverted back to it. */
  liblcfName?: string
  /** Chunk ID; absent for the positional fields of raw records. */
  id?: number
  /** Chunk ID of the companion size chunk RPG_RT expects before the data chunk. */
  sizeId?: number
  /** What the size chunk stores; the reader ignores it either way. */
  sizeKind?: 'byteLength' | 'elementCount'
  isSizePersistedIfDefault?: boolean
  codec: FieldCodec
  /** Backing enum – tooling metadata; the wire value is a plain integer. */
  enumRef?: string
  /** Record whose ID this value references – tooling metadata. */
  refRecord?: string
  default?: FieldDefaultValue
  isPersistedIfDefault?: boolean
  is2k3Only?: boolean
}

export interface RecordDescriptor {
  fields: FieldDescriptor[]
}

export interface FlagBitDescriptor {
  key: string
  is2k3Only?: boolean
}

/** A chunk no descriptor claims – preserved verbatim so it survives a round trip. */
export interface UnknownChunk {
  id: number
  bytes: Uint8Array
}
