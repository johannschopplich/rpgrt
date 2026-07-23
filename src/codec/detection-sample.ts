/**
 * Collects the wire bytes of every string in a record decoded with the default
 * transcoder (each code point is the original byte), as a detection sample.
 */
export function collectStringBytes(record: unknown): Uint8Array {
  const stringValues: string[] = []
  collectStrings(record, stringValues)
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
