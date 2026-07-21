/** Minimal RFC 4180 parser – quoted cells, doubled-quote escapes, LF/CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let isInsideQuotes = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (isInsideQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index++
        }
        else {
          isInsideQuotes = false
        }
      }
      else {
        cell += char
      }
    }
    else if (char === '"') {
      isInsideQuotes = true
    }
    else if (char === ',') {
      row.push(cell)
      cell = ''
    }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n')
        index++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    }
    else {
      cell += char
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
