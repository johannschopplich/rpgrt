import type { Database, EngineVersion, EventCommand, MapUnit, TreeMap } from '../index.ts'
import { RECORD_DESCRIPTORS } from '../generated/descriptors.ts'
import { TreeMapMapType } from '../generated/enums.ts'

/** One translatable entry: stable address, source text, and lcftrans-style context. */
export interface TextUnit {
  address: string
  /** Lines joined with newlines; control codes like `\c[3]` appear verbatim. */
  source: string
  /** lcftrans msgctxt (liblcf naming, e.g. `actors.name`) – drives PO interop. */
  context?: string
  /** lcftrans-style human context lines (`ID 12, Page 1, Line 58, Pos (3,4)`). */
  info: string[]
}

/** Which PO catalog a unit belongs to, mirroring lcftrans's file split. */
export type UnitCatalog = 'terms' | 'common' | 'battle' | 'lmt' | 'map'

export interface CollectedUnit extends TextUnit {
  fileName: string
  catalog: UnitCatalog
  /** Exact number of translation lines required; undefined means any count. */
  expectedLineCount?: number
  /** Applies in any order – each write-back locates its commands at apply time. */
  applyTranslation: (lines: string[]) => void
}

/** A text unit as persisted in strings.json – translation starts empty. */
export interface DumpUnit extends TextUnit {
  translation: string
}

/** The extract output: dump metadata plus every text unit of one or all files. */
export interface Dump {
  engine: EngineVersion
  encoding: string
  units: DumpUnit[]
}

const SHOW_MESSAGE = 10110
const SHOW_MESSAGE_CONTINUATION = 20110
const SHOW_CHOICE = 10140
const SHOW_CHOICE_OPTION = 20140
const SHOW_CHOICE_END = 20141
const CHANGE_HERO_NAME = 10610
const CHANGE_HERO_TITLE = 10620
const CONDITIONAL_BRANCH = 12010
const MANIAC_SHOW_STRING_PICTURE = 3007

const MAX_CHOICE_OPTIONS = 4
const LINES_PER_MESSAGE = 4

/** RPG_RT ignores raw control characters in messages; lcftrans strips them too. */
function removeControlChars(text: string): string {
  let cleanedText = ''
  for (const char of text) {
    const codePoint = char.codePointAt(0)!
    if (codePoint > 0x1F && codePoint !== 0x7F)
      cleanedText += char
  }
  return cleanedText
}

/** Inverse of the generator's camelCasing – reproduces liblcf field names for msgctxt. */
function toLiblcfName(fieldKey: string): string {
  return fieldKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

const DATABASE_TEXT_FIELDS: [arrayKey: string, fieldKeys: string[]][] = [
  ['actors', ['name', 'title', 'skillName']],
  ['classes', ['name']],
  ['skills', ['name', 'description', 'usingMessage1', 'usingMessage2']],
  ['items', ['name', 'description']],
  ['enemies', ['name']],
  ['states', ['name', 'messageActor', 'messageEnemy', 'messageAlready', 'messageAffected', 'messageRecovery']],
]

const TERMS_STRING_KEYS = RECORD_DESCRIPTORS.Terms!.fields
  .filter(field => field.codec.kind === 'string')
  .map(field => field.key)

export function collectDatabaseUnits(database: Database, fileName: string): CollectedUnit[] {
  const units: CollectedUnit[] = []

  for (const [arrayKey, fieldKeys] of DATABASE_TEXT_FIELDS) {
    const elements = (database as unknown as Record<string, unknown>)[arrayKey] as Record<string, unknown>[] | undefined
    for (const element of elements ?? []) {
      for (const fieldKey of fieldKeys) {
        const value = element[fieldKey]
        if (typeof value !== 'string' || value.length === 0)
          continue
        units.push({
          address: `ldb/${arrayKey}/${element.id}/${fieldKey}`,
          source: removeControlChars(value),
          context: `${arrayKey}.${toLiblcfName(fieldKey)}`,
          info: [`ID ${element.id}`],
          fileName,
          catalog: 'terms',
          expectedLineCount: 1,
          applyTranslation: lines => (element[fieldKey] = lines[0]!),
        })
      }
    }
  }

  const terms = database.terms as unknown as Record<string, unknown>
  for (const fieldKey of TERMS_STRING_KEYS) {
    const value = terms[fieldKey]
    if (typeof value !== 'string' || value.length === 0)
      continue
    units.push({
      address: `ldb/terms/${fieldKey}`,
      source: removeControlChars(value),
      context: `terms.${toLiblcfName(fieldKey)}`,
      info: [],
      fileName,
      catalog: 'terms',
      expectedLineCount: 1,
      applyTranslation: lines => (terms[fieldKey] = lines[0]!),
    })
  }

  for (const commonEvent of database.commonevents)
    units.push(...collectCommandUnits(commonEvent.eventCommands, `ldb/commonevents/${commonEvent.id}`, `ID ${commonEvent.id}`, fileName, 'common'))

  for (const troop of database.troops) {
    for (const page of troop.pages)
      units.push(...collectCommandUnits(page.eventCommands, `ldb/troops/${troop.id}/pages/${page.id}`, `ID ${troop.id}, Page ${page.id}`, fileName, 'battle'))
  }

  return units
}

export function collectMapUnits(mapUnit: MapUnit, mapId: number, fileName: string): CollectedUnit[] {
  const units: CollectedUnit[] = []
  for (const event of mapUnit.events) {
    for (const page of event.pages) {
      units.push(...collectCommandUnits(
        page.eventCommands,
        `lmu/${mapId}/events/${event.id}/pages/${page.id}`,
        `ID ${event.id}, Page ${page.id}`,
        fileName,
        'map',
        `, Pos (${event.x},${event.y})`,
      ))
    }
  }
  return units
}

export function collectTreeMapUnits(treeMap: TreeMap, fileName: string): CollectedUnit[] {
  const units: CollectedUnit[] = []
  treeMap.maps.forEach((mapInfo, index) => {
    if (mapInfo.type !== TreeMapMapType.map || mapInfo.name.length === 0)
      return
    units.push({
      address: `lmt/maps/${mapInfo.id}/name`,
      source: removeControlChars(mapInfo.name),
      info: [`ID ${index + 1}`],
      fileName,
      catalog: 'lmt',
      expectedLineCount: 1,
      applyTranslation: lines => (mapInfo.name = lines[0]!),
    })
  })
  return units
}

/** Choice options sit at the same indent as ShowChoice, before ShowChoiceEnd. */
function scanChoiceOptionIndices(commands: EventCommand[], choiceIndex: number): number[] {
  const choiceIndent = commands[choiceIndex]!.indent
  const optionIndices: number[] = []
  for (let scanIndex = choiceIndex + 1; scanIndex < commands.length; scanIndex++) {
    const scanned = commands[scanIndex]!
    if (scanned.indent !== choiceIndent)
      continue
    if (scanned.code === SHOW_CHOICE_OPTION && (scanned.parameters[0] ?? 0) < MAX_CHOICE_OPTIONS)
      optionIndices.push(scanIndex)
    else if (scanned.code === SHOW_CHOICE_END)
      break
  }
  return optionIndices
}

interface MessageBuffer {
  startIndex: number
  indent: number
  lines: string[]
  info: string[]
}

function collectCommandUnits(
  commands: EventCommand[],
  addressPrefix: string,
  idInfo: string,
  fileName: string,
  catalog: UnitCatalog,
  infoSuffix = '',
): CollectedUnit[] {
  const units: CollectedUnit[] = []
  const lineInfo = (startIndex: number): string => `${idInfo}, Line ${startIndex + 1}${infoSuffix}`
  let message: MessageBuffer | undefined

  const flushMessage = (): void => {
    if (message !== undefined && message.lines.some(line => line.length > 0)) {
      const { startIndex, indent, lines } = message
      const lineCount = lines.length
      // Earlier applies can splice this list, so every position is recomputed
      // from the ShowMessage object at apply time. No apply ever removes it:
      // a shrink only splices continuation commands behind the anchor.
      const anchorCommand = commands[startIndex]!
      units.push({
        address: `${addressPrefix}/commands/${startIndex}`,
        source: lines.join('\n'),
        info: [lineInfo(startIndex), ...message.info],
        fileName,
        catalog,
        applyTranslation: (translatedLines) => {
          const anchorIndex = commands.indexOf(anchorCommand)
          for (let offset = 0; offset < Math.min(lineCount, translatedLines.length); offset++)
            commands[anchorIndex + offset]!.string = translatedLines[offset]!
          if (translatedLines.length > lineCount) {
            const addedCommands = translatedLines.slice(lineCount).map(line => ({ code: SHOW_MESSAGE_CONTINUATION, indent, string: line, parameters: [] }))
            commands.splice(anchorIndex + lineCount, 0, ...addedCommands)
          }
          else if (translatedLines.length < lineCount) {
            commands.splice(anchorIndex + translatedLines.length, lineCount - translatedLines.length)
          }
        },
      })
    }
    message = undefined
  }

  const pushSingleLine = (index: number, source: string, context: string | undefined, extraInfo: string): void => {
    if (source.length === 0)
      return
    const command = commands[index]!
    units.push({
      address: `${addressPrefix}/commands/${index}`,
      source,
      context,
      info: [lineInfo(index), extraInfo],
      fileName,
      catalog,
      expectedLineCount: 1,
      applyTranslation: lines => (command.string = lines[0]!),
    })
  }

  for (let index = 0; index < commands.length; index++) {
    const command = commands[index]!
    switch (command.code) {
      case SHOW_MESSAGE: {
        flushMessage()
        message = { startIndex: index, indent: command.indent, lines: [removeControlChars(command.string)], info: [] }
        break
      }
      case SHOW_MESSAGE_CONTINUATION: {
        if (message !== undefined && index === message.startIndex + message.lines.length && command.indent === message.indent)
          message.lines.push(removeControlChars(command.string))
        else
          flushMessage()
        break
      }
      case SHOW_CHOICE: {
        const optionIndices = scanChoiceOptionIndices(commands, index)
        const options = optionIndices.map(optionIndex => removeControlChars(commands[optionIndex]!.string))
        const isEmbedded = message !== undefined && message.lines.some(line => line.length > 0)
          && options.length + message.lines.length <= LINES_PER_MESSAGE
        if (isEmbedded)
          message!.info.push(`Contains choice at line ${index + 1} (${options.length} options)`)
        flushMessage()
        if (options.some(option => option.length > 0)) {
          const originalJoined = options.join('/')
          units.push({
            address: `${addressPrefix}/commands/${index}`,
            source: options.join('\n'),
            info: [lineInfo(index), isEmbedded ? `Choice (${options.length} options, embedded in a message)` : `Choice (${options.length} options)`],
            fileName,
            catalog,
            expectedLineCount: options.length,
            // Other applies can shift command indices, so the choice position
            // and its option positions are re-scanned when applying.
            applyTranslation: (lines) => {
              const currentIndices = scanChoiceOptionIndices(commands, commands.indexOf(command))
              currentIndices.forEach((optionIndex, optionOffset) => (commands[optionIndex]!.string = lines[optionOffset]!))
              // RPG_RT also stores the options slash-joined on the ShowChoice command itself.
              if (command.string === originalJoined)
                command.string = lines.join('/')
            },
          })
        }
        break
      }
      case CHANGE_HERO_NAME: {
        flushMessage()
        pushSingleLine(index, removeControlChars(command.string), 'actors.name', `ChangeHeroName (Actor ${command.parameters[0] ?? 0})`)
        break
      }
      case CHANGE_HERO_TITLE: {
        flushMessage()
        pushSingleLine(index, removeControlChars(command.string), 'actors.title', `ChangeHeroTitle (Actor ${command.parameters[0] ?? 0})`)
        break
      }
      case CONDITIONAL_BRANCH: {
        flushMessage()
        if (command.parameters[0] === 5 && command.parameters[2] === 1)
          pushSingleLine(index, removeControlChars(command.string), 'actors.name', `Condition (Actor Name = ${removeControlChars(command.string)})`)
        break
      }
      case MANIAC_SHOW_STRING_PICTURE: {
        flushMessage()
        const tokens = command.string.split('\x01')
        if (tokens.length >= 4) {
          const lines = tokens[1]!.split('\n').map(removeControlChars)
          if (lines.some(line => line.length > 0)) {
            units.push({
              address: `${addressPrefix}/commands/${index}`,
              source: lines.join('\n'),
              context: 'strpic',
              info: [lineInfo(index), 'Show String Picture'],
              fileName,
              catalog,
              applyTranslation: (translatedLines) => {
                const currentTokens = command.string.split('\x01')
                currentTokens[1] = translatedLines.join('\n')
                command.string = currentTokens.join('\x01')
              },
            })
          }
        }
        break
      }
      default: {
        flushMessage()
        break
      }
    }
  }
  flushMessage()
  return units
}
