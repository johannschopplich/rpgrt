/** CSV field names are snake_case; generated TS and JSON use camelCase. */
export function toCamelCase(snakeCaseName: string): string {
  return snakeCaseName.replaceAll(/_(\w)/g, (_, letter: string) => letter.toUpperCase())
}

const IDENTIFIER_PATTERN = /^[a-z_$][\w$]*$/i

export function toObjectKey(name: string): string {
  return IDENTIFIER_PATTERN.test(name) ? name : `'${name.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`
}
