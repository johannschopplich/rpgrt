# lcfkit

Reads and writes the binary LCF files of RPG Maker 2000/2003 games (maps, database, map tree) in pure TypeScript, and ships a CLI for JSON conversion and translation workflows. Reimplements the format knowledge of EasyRPG's C++ liblcf without wrapping it.

## Language

### Wire format

**LCF**:
The chunked binary container format RPG Maker 2000/2003 uses for all game data files (`.lmu`, `.ldb`, `.lmt`, `.lsd`).

**Chunk**:
One wire unit: a BER-encoded ID, a BER-encoded byte length, and a payload. A chunk stream is terminated by ID 0.
_Avoid_: tag, block, TLV

**BER integer**:
The base-128 big-endian varint (high bit = continuation) used for chunk IDs, lengths, and integer fields.
_Avoid_: varint (alone), VLQ

**Size chunk**:
A companion chunk RPG_RT expects immediately before certain data chunks, holding the data payload's byte length or element count. Readers ignore its value; it exists only for write compatibility.

**Flag set**:
A named group of booleans bit-packed LSB-first into a single chunk (e.g. terrain passability). 2k3-only bits are dropped before packing when writing a 2k file.

**Record**:
A decoded, typed object such as `Actor` or `EventPage` – the in-memory counterpart of one struct's chunk stream.
_Avoid_: struct, model, entity

**Raw record**:
A record serialized as a fixed field sequence without chunk framing (`EventCommand`, `MoveCommand`, `Parameters`, `Equipment`, `Rect`, `TreeMap`). Cannot skip unknown data because there are no IDs.

**Field descriptor**:
One generated metadata entry driving the codec: chunk ID, type, default value, persist-if-default flag, and 2k3-only flag. Generated from the vendored liblcf CSVs.
_Avoid_: schema entry, field definition

**Engine version**:
Which Maker the file targets: `2k` (RPG Maker 2000) or `2k3` (RPG Maker 2003). One flag threaded through the codec; never separate classes.
_Avoid_: RPG Maker version, game version

### Layers

**Codec**:
The pure decode/encode layer: `Uint8Array` in, records out, and back. No I/O, no console, no Node built-ins – isomorphic by construction.
_Avoid_: parser, serializer (as layer names)

**Corpus**:
Real, third-party game files used locally for byte-fidelity testing. Lives in `test/corpus/`, never committed.

**Fixture**:
A committed, self-authored test file in `test/fixtures/`. Never a copyrighted game file.

### Translation

**Extract**:
Pulling all text units out of a game directory into a dump (JSON by default, PO for EasyRPG interop).

**Inject**:
Writing translated text units from a dump back into the game's LCF files. Validates everything in memory before touching any file.
_Avoid_: import, patch

**Text unit**:
One translatable entry: stable address (map/event/page/line), source text with control codes verbatim, and derivable context (event name, coordinates, resolved speaker).
_Avoid_: string, message (both overloaded)

**Control code**:
An inline command inside message text, e.g. `\c[3]`, `\n[1]`. Zero display width; must survive translation byte-exact, in count and order.
_Avoid_: escape sequence, formatting code

**Encoding**:
The legacy code page (Shift-JIS, Windows-1252, …) of a game's strings and filenames. Detected per game (ini hint, then charset detection), recorded in the dump, and reused verbatim on inject.
