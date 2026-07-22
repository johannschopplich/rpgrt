import type { TextUnit } from './units.ts'

/** Only quote and backslash are escaped – newlines are structural in PO. */
function escapePoText(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/** gettext multiline form: one quoted segment per line, `\n` between lines only. */
function formatPoString(keyword: string, lines: string[]): string {
  if (lines.length <= 1)
    return `${keyword} "${escapePoText(lines[0] ?? '')}"\n`
  let text = `${keyword} ""\n`
  lines.forEach((line, index) => {
    text += `"${escapePoText(line)}${index < lines.length - 1 ? '\\n' : ''}"\n`
  })
  return text
}

function formatPoHeader(projectName: string): string {
  return 'msgid ""\n'
    + 'msgstr ""\n'
    + `"Project-Id-Version: ${projectName} 1.0\\n"\n`
    + '"Language-Team: YOUR NAME <mail@your.address>\\n"\n'
    + '"Language: \\n"\n'
    + '"MIME-Version: 1.0\\n"\n'
    + '"Content-Type: text/plain; charset=UTF-8\\n"\n'
    + '"Content-Transfer-Encoding: 8bit\\n"\n'
    + '"X-CreatedBy: lcfkit"\n'
}

/**
 * Formats units as one lcftrans-compatible PO catalog. Units sharing context and
 * source merge into a single entry that accumulates every occurrence's info lines.
 */
export function formatPoCatalog(units: TextUnit[], projectName: string): string {
  const groups = new Map<string, TextUnit[]>()
  for (const unit of units) {
    const key = `${unit.context ?? ''}\x01${unit.source}`
    const group = groups.get(key)
    if (group === undefined)
      groups.set(key, [unit])
    else
      group.push(unit)
  }

  let text = formatPoHeader(projectName)
  for (const group of groups.values()) {
    text += '\n'
    for (const unit of group) {
      for (const infoLine of unit.info)
        text += `#. ${infoLine}\n`
    }
    const first = group[0]!
    if (first.context !== undefined)
      text += `msgctxt "${escapePoText(first.context)}"\n`
    text += formatPoString('msgid', first.source.split('\n'))
    text += 'msgstr ""\n'
  }
  return text
}
