/**
 * Terms fields liblcf samples for charset detection. The rest of Terms holds
 * untranslated garbage even in default databases, and asset filenames or
 * event text would dilute the sample with ASCII.
 */
const SAMPLED_TERMS_KEYS = [
  'menuSave',
  'menuQuit',
  'newGame',
  'loadGame',
  'exitGame',
  'status',
  'row',
  'order',
  'waitOn',
  'waitOff',
  'level',
  'healthPoints',
  'spiritPoints',
  'normalStatus',
  'spCost',
  'attack',
  'defense',
  'spirit',
  'agility',
  'weapon',
  'shield',
  'armor',
  'helmet',
  'accessory',
  'saveGameMessage',
  'loadGameMessage',
  'exitGameMessage',
  'file',
  'yes',
  'no',
] as const

/**
 * The detection sample liblcf uses for a database: every System string plus
 * the curated Terms subset.
 */
export function collectDatabaseSampleBytes(database: { system: unknown, terms: unknown }): Uint8Array {
  const stringValues: string[] = []
  collectStrings(database.system, stringValues)
  const terms = (database.terms ?? {}) as Record<string, unknown>
  for (const key of SAMPLED_TERMS_KEYS)
    collectStrings(terms[key], stringValues)
  return toSampleBytes(stringValues)
}

/**
 * Collects the wire bytes of every string in a record decoded with the default
 * transcoder (each code point is the original byte), as a detection sample for
 * files without a sibling database.
 */
export function collectStringBytes(record: unknown): Uint8Array {
  const stringValues: string[] = []
  collectStrings(record, stringValues)
  return toSampleBytes(stringValues)
}

function toSampleBytes(stringValues: string[]): Uint8Array {
  const byteLength = stringValues.reduce((total, text) => total + text.length + 1, 0)
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const text of stringValues) {
    for (let index = 0; index < text.length; index++)
      bytes[offset++] = text.charCodeAt(index) & 0xFF
    bytes[offset++] = 0x0A
  }
  return bytes
}

function collectStrings(value: unknown, stringValues: string[]): void {
  if (typeof value === 'string') {
    if (value.length > 0)
      stringValues.push(value)
  }
  else if (Array.isArray(value)) {
    for (const element of value)
      collectStrings(element, stringValues)
  }
  else if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) {
    for (const element of Object.values(value))
      collectStrings(element, stringValues)
  }
}
