<div align="center">

# lcfkit

Read and write RPG Maker 2000/2003 LCF files in pure TypeScript – library and CLI.

[When to Use](#when-to-use) •
[Installation](#installation) •
[CLI](#cli) •
[Usage](#usage) •
[Safety](#safety--limits) •
[API](#programmatic-api)

</div>

RPG Maker 2000/2003 games – *Yume Nikki*, *OFF*, *Ib*, and thousands of freeware classics – store everything in the binary LCF format: maps (`Map0001.lmu`), the database (`RPG_RT.ldb`), the map tree (`RPG_RT.lmt`). The only complete implementation has been [EasyRPG's liblcf](https://github.com/EasyRPG/liblcf) – C++, a native build toolchain between you and the data, and XML as the only text output. lcfkit reimplements the format in isomorphic TypeScript (`Uint8Array` core, browser-safe, no native builds): LCF in, typed records or diffable JSON out, and the *same bytes* back.

It's built for translation work. `extract` pulls every message, choice, hero name, and database string into one dump with stable addresses; `inject` validates the translated dump in memory – line counts, encodability, staleness – and writes it back all-or-nothing. PO export follows [lcftrans](https://easyrpg.org/player/guide/game_translation/) catalog naming, so gettext editors and EasyRPG Player's translation workflow line up.

## When to Use

| I want to… | Run |
| --- | --- |
| Turn an LCF file into readable, diffable JSON | `convert Map0001.lmu` |
| Turn edited JSON back into a game file | `convert Map0001.lmu.json` |
| Dump every translatable string of a game | `extract ./game` |
| Get one dump per game file instead of one big one | `extract --split` |
| Translate with Poedit/Weblate or lcftrans tooling | `extract --po` |
| Write my translated dump back into the game | `inject ./game strings.json` |
| Fix a wrong engine or codepage guess | `--engine 2k3`, `--encoding 932` |

## Installation

```bash
npm install lcfkit

# Or run once, without installing
npx lcfkit convert Map0001.lmu
```

Requires Node 22+ for the CLI; the codec itself runs anywhere `Uint8Array` does, browsers included.

## CLI

```bash
# LCF → JSON, written next to the file
npx lcfkit convert Map0001.lmu

# Edit the JSON, then back to LCF
npx lcfkit convert Map0001.lmu.json
```

```text
lcfkit convert <file> [options]         # .lmu/.ldb/.lmt → JSON, or .json → LCF
lcfkit extract <game> [options]         # game directory → translatable text dump
lcfkit inject  <game> <dump> [options]  # dump → game files, all-or-nothing

Options:
  -o, --output <path>    Output path (default: next to the input; strings.json for extract)
      --split            extract only: one JSON dump per game file
      --po               extract only: lcftrans-compatible PO catalogs
      --engine <2k|2k3>  Override engine detection
      --encoding <name>  Override encoding detection (e.g. Shift_JIS or 932)
```

Engine and encoding are detected per game – from `RPG_RT.ldb`, the `Encoding` key in `RPG_RT.ini`, or charset detection over the game's text – and every command reports what it picked and why. The flags override detection when it guesses wrong.

## Usage

### LCF ⇄ JSON

`convert` writes a self-describing envelope – format, engine, and encoding travel with the data, so converting back needs no flags:

```jsonc
// Map0001.lmu.json
{
  "format": "lmu",
  "engine": "2k",
  "encoding": "Shift_JIS",
  "data": {
    "events": [
      { "id": 1, "name": "guard", "x": 3, "y": 4, "pages": [/* … */] }
    ]
  }
}
```

Edit anything – event commands, terrain, database records – and convert back. Chunks lcfkit doesn't know (editor extensions, corrupt leftovers) are carried through as base64 under `_unknown` and written back verbatim. If a file wouldn't survive the round trip byte for byte, `convert` says so up front instead of letting you find out after editing.

### Extract → translate → inject

`extract` walks the whole game directory and pulls every text unit into one dump. Multi-line messages are one unit, choices keep their option lines together, and control codes like `\c[3]` stay verbatim:

```jsonc
// strings.json
{
  "engine": "2k",
  "encoding": "Shift_JIS",
  "units": [
    {
      "address": "lmu/1/events/1/pages/1/commands/0",
      "source": "むかしむかし、\nあるところに…",
      "translation": "",
      "info": ["ID 1, Page 1, Line 1, Pos (3,4)"]
    },
    {
      "address": "ldb/actors/1/name",
      "source": "アレックス",
      "translation": "",
      "context": "actors.name",
      "info": ["ID 1"]
    }
  ]
}
```

Fill in the `translation` fields – by hand, script, or machine – and inject. Units left empty stay untouched, so partial translations are fine:

```bash
npx lcfkit extract ./game -o strings.json
# … fill in "translation" fields …
npx lcfkit inject ./game strings.json
```

Messages may grow or shrink lines freely; a choice must keep exactly its option count, and `inject` tells you which unit breaks the rule.

> [!TIP]
> For large games, `extract --split` writes one dump per game file (`strings/Map0001.lmu.json`, …) so translators can work in parallel. `inject` accepts the directory just the same.

### PO catalogs for gettext tools

```bash
npx lcfkit extract ./game --po -o po
```

This writes the same catalogs lcftrans produces – `RPG_RT.ldb.po` (database terms), `RPG_RT.ldb.common.po` (common events), `RPG_RT.ldb.battle.po` (battle events), `RPG_RT.lmt.po` (map names), and one `Map####.po` per map – with lcftrans-style `msgctxt` and `#.` location comments, ready for Poedit, Weblate, or [EasyRPG Player's `Language/` folder workflow](https://easyrpg.org/player/guide/game_translation/).

PO export is one-way: `inject` reads the JSON dumps. Use PO when your pipeline ends in EasyRPG Player's runtime translation loading; use JSON dumps when you want lcfkit to write the game files themselves.

### Encodings, or: avoiding mojibake

LCF predates Unicode – text is stored in a legacy codepage with no marker in the file. Japanese games are Shift_JIS (cp932), Western ones usually Windows-1252, and reading with the wrong one turns every string into mojibake. lcfkit makes the codepage explicit: detection records it in the envelope or dump, `inject` re-encodes with the same codepage, and any translated character that doesn't exist in it (e.g. `é` in a Shift_JIS game) aborts the injection with the exact unit named – it never silently writes `?`.

## Safety & limits

**Round trips are byte-identical.** Decoding and re-encoding an untouched file reproduces it byte for byte – defaults, chunk order, size chunks, engine quirks, and unknown chunks included. This is verified against a corpus of real 2k/2k3 games and is the foundation everything else stands on: a diff between source and converted game shows *your* edits, nothing else.

**`inject` is all-or-nothing.** Every translation is validated in memory first – unknown addresses, source text that drifted since extraction (stale dump), wrong choice line counts, characters the game's codepage can't represent. One failure means nothing is written, with every reason listed. The writes themselves are staged and atomically renamed, so even a crash mid-inject never leaves a truncated game file.

Limits, so you don't discover them the hard way: lcfkit reads and writes maps, database, and map tree – not save files (`.lsd`) and not `RPG_RT.exe`. Maps without the canonical `MapNNNN` filename are skipped during extract (their units would have no stable address; `extract` reports each skip).

## Programmatic API

```ts
import { decodeMapUnit, encodeMapUnit } from 'lcfkit'
import { createTranscoder } from 'lcfkit/encoding'

const transcoder = createTranscoder('Shift_JIS')
const mapUnit = decodeMapUnit(bytes, { engine: '2k', transcoder })
mapUnit.events[0].name = 'guard'
const encoded = encodeMapUnit(mapUnit, { engine: '2k', transcoder })
```

### Codec (`lcfkit`)

Pure and isomorphic – no Node built-ins, safe to bundle for the browser. One decode/encode pair per file kind:

```ts
function decodeMapUnit(bytes: Uint8Array, options: CodecOptions): MapUnit
function encodeMapUnit(mapUnit: MapUnit, options: CodecOptions): Uint8Array
function decodeDatabase(bytes: Uint8Array, options: CodecOptions): Database
function encodeDatabase(database: Database, options: CodecOptions): Uint8Array
function decodeMapTree(bytes: Uint8Array, options: CodecOptions): TreeMap
function encodeMapTree(treeMap: TreeMap, options: CodecOptions): Uint8Array

interface CodecOptions {
  engine: '2k' | '2k3'
  /**
   * Converts between wire bytes and strings. Defaults to a lossless
   * byte↔code point mapping, so round trips stay byte-exact even
   * before the game's real encoding is known.
   */
  transcoder?: Transcoder
}
```

Every record – `MapUnit`, `Database`, `Actor`, `EventCommand`, and the rest – is a generated TypeScript interface derived from liblcf's format tables, with enums to match. Decode errors throw `LcfError` with the record path and byte offset.

### Encoding helpers (`lcfkit/encoding`)

```ts
/** iconv-lite-backed transcoder for a named codepage, e.g. 'Shift_JIS' or 'cp1252' */
function createTranscoder(encoding: string): Transcoder

/** Charset detection over string bytes – never returns an encoding that would corrupt the sample */
function detectEncoding(bytes: Uint8Array): string | undefined

/** Reads the EasyRPG `Encoding` key from RPG_RT.ini text */
function encodingFromIni(iniText: string): string | undefined
```

---

Design records live in [`CONTEXT.md`](./CONTEXT.md) (domain glossary) and [`docs/adr/`](./docs/adr) (scope and architecture decisions). Format tables are generated from [vendored liblcf CSVs](./vendor/liblcf-csv).

## License

[MIT](./LICENSE) License © 2026-PRESENT [Johann Schopplich](https://github.com/johannschopplich)
