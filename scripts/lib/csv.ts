/** Minimal RFC 4180 parser – quoted cells, doubled-quote escapes, LF/CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let isInsideQuotes = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]!
    if (isInsideQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index++
        }
        else {
          isInsideQuotes = false
        }
      }
      else {
        cell += character
      }
    }
    else if (character === '"') {
      isInsideQuotes = true
    }
    else if (character === ',') {
      row.push(cell)
      cell = ''
    }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n')
        index++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    }
    else {
      cell += character
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
