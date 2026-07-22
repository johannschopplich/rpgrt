# liblcf Serialization Semantics (LDB / LMU / LMT)

Source: EasyRPG/liblcf @ [666e6c0](https://github.com/EasyRPG/liblcf/tree/666e6c0); all file:line references below are into that tree. This documents the exact on-the-wire behavior for the LcfReader/LcfWriter binary format, as driven by `generator/csv/fields.csv` and the generated + hand-written struct readers.

---

## 0. Primitive encodings (the alphabet)

From `src/reader_lcf.cpp` / `src/writer_lcf.cpp`:

| Primitive | Read | Write | Notes |
|---|---|---|---|
| **BER varint (`ReadInt`/`WriteInt`)** | `reader_lcf.cpp:86-105` | `writer_lcf.cpp:50-55` | 7 bits/byte, big-endian groups, high bit (0x80) = "more bytes follow". Max 5 bytes (32-bit). Reader aborts after 6 loops → returns 0. Empty stream → 0. |
| `int32_t` (Int32) | BER via `ReadInt` (`reader_struct.h:250`) | BER (`reader_struct.h:267`) | **scalar Int32 is BER varint**, not fixed-width. |
| `bool` (Boolean) | `ref = ReadInt() > 0` (`reader_lcf.cpp:59-62`) | 1 byte `0` or `1` (`writer_lcf.cpp:69-72`) | Reads a BER int, truthy if >0. Chunk length is normally 1. |
| `int8_t`/`uint8_t` (Int8/UInt8) | 1 raw byte (`reader_lcf.cpp:64-72`) | 1 raw byte | |
| `int16_t` (Int16) | 2 bytes **raw little-endian** (`reader_lcf.cpp:74-78`) | 2 bytes LE | Used by `Ref<X:Int16>`. |
| `uint32_t` (UInt32) | 4 bytes **raw little-endian** (`reader_lcf.cpp:80-84`) | 4 bytes LE | **NOT BER.** Distinct from Int32! |
| `double` (Double) | 8 bytes **raw little-endian** (`reader_lcf.cpp:133-137`) | 8 bytes LE | |
| `std::string` / `DBString` (String/DBString) | raw bytes, count = chunk length, then codepage→UTF-8 `Encode` (`reader_lcf.cpp:218-228`) | raw bytes, Decode UTF-8→codepage (`writer_lcf.cpp:119-131`) | No terminator, no escaping. Length is the byte count of the encoded (codepage) string. |
| `DBBitArray` | `length` bytes, each byte → 1 bool (`reader_lcf.cpp:209-216`) | 1 byte per bool (`writer_lcf.cpp:133-137`) | 1 bool = 1 whole byte (NOT bit-packed – unlike Flags). |

There is **no `uint16_t` TypeCategory** and no BER for `uint32`/`int16`/`double`/`uint8`. Only `int32` (and `bool`, whose write side is a raw byte) touch BER among scalars.

**Endianness:** `SwapByteOrder` is a no-op on little-endian hosts; the format is little-endian.

---

## 1. Type-string categories (fields.csv `Type` column)

`generator/generate.py` `cpp_type()` (line 54) maps the CSV type string to a C++ type; `src/reader_struct.h` `TypeCategory<>` (lines 55-81) then routes it to one of 5 categories: `Primitive, Struct, Flags, RawStruct, Void`. `lcf_type()` (generate.py:42) additionally tags size/count/version/empty fields.

### Primitive scalars
- `Int32`, `Enum<X>` (=int32), `Ref<X>` (=int32) → **BER varint**.
- `UInt32` → 4-byte LE raw.
- `Int8`, `UInt8` → 1 byte. `Boolean` → BER read / 1-byte write. `Double` → 8-byte LE.
- `Ref<X:Int16>` → int16 (2-byte LE raw). `Ref<X:Int32>` → int32.
- `String`/`DBString` → raw bytes = chunk length.
- Read: `Primitive<T>::ReadLcf` (`reader_struct.h:166-213`, int32 specialization :248-279, string :284-304). Element count / byte count comes from the **chunk length** for strings; scalars read one value and warn if length ≠ expected size (`reader_struct.h:171`).
- Write: emitted as `[BER id][BER byte-length][payload]`. `LcfSize` gives the byte length (`IntSize(v)` for BER int32, `sizeof` for fixed, `Decode(str).size()` for strings).

### Primitive vectors – count derived from CHUNK LENGTH, elements FIXED-WIDTH
`Primitive<std::vector<T>>` (`reader_struct.h:218-243`) calls `stream.Read(vec, length)`:
- `Vector<UInt8>` / `Vector<Boolean>`: 1 byte each, count = length (`reader_lcf.cpp:140-159`). Bool: `val > 0`.
- `Vector<Int16>`: 2-byte LE each, count = length/2 (`reader_lcf.cpp:161-175`). Trailing odd byte → skip + push 0.
- `Vector<Int32>` / `Vector<UInt32>` / `Vector<Ref<...:Int32>>` / `Vector<Ref<Map>>`: **4-byte LE raw each**, count = length/4 (`reader_lcf.cpp:177-207`). **NOT BER** – this is the #1 gotcha: scalar Int32 is BER but Vector<Int32> elements are fixed 4-byte LE.
- Write: `LcfWriter::Write(vector)` writes elements back-to-back (`writer_lcf.cpp:80-117`); chunk byte-length = `sizeof(elem)*count`.

### `DBBitArray` (bit array, but 1 byte/bit)
Read `length` bytes → `length` bools (`reader_struct.h:310`, `reader_lcf.cpp:209`). Byte-length = `.size()`.

### Struct fields (Category::Struct) – nested chunk stream
Any bare struct name (`Sound`, `Music`, `System`, `Terms`, `BattleCommands`, `MoveRoute`, `EventPageCondition`, `Start`, `TroopPageCondition`, ...) → `Struct<T>::ReadLcf` (`reader_struct_impl.h:61-95`). **The outer chunk's declared length is ignored**; the reader consumes nested `[id][len][payload]...` chunks until it hits an ID byte `0x00` (or EOF). Write: `Struct<T>::WriteLcf` emits fields then a terminating `0x00` (`reader_struct_impl.h:111-139`).

### `Array<Struct>` / `Vector<EventCommand|MoveCommand>` / ID-indexed arrays
See §2 (Array framing) and §3 (raw command vectors).

### `Array<Struct:Ref<X>>` (e.g. `Array<BattlerAnimationItemSkill:Ref<Actor>>`)
`cpp_type` = `std::vector<BattlerAnimationItemSkill>` (generate.py:68). Wire layout is **identical to `Array<Struct>`** – the `:Ref<Actor>` only annotates that the element's ID field semantically references an Actor. No wire difference.

### `Count<Vector<T>>` and size rows (`Size Field? = t`) → see §4.

### `DatabaseVersion` (0x1A) and `EmptyBlock` (0x1B/0x1C/0x1F)
`DatabaseVersionField` (`reader_struct.h:435-455`): value is a BER int32. LcfSize returns 0 when version==0 (chunk omitted). In a 2k3 DB it is always written; in 2k only if ≠ 0. `EmptyField` (`reader_struct.h:461-480`, Category::Void): read = no-op, write = `[id][0x00]` (zero-length chunk) – only when `present_if_default=1` (all EmptyBlocks) and, being `is2k3=1`, only in 2k3 files.

### `DBArray<Int32>`
Only appears as `EventCommand.parameters` (fields.csv:1025) – never a standalone chunk field. Handled inside the EventCommand raw struct (§3). No `TypeCategory` for it.

### `*_Flags` (Category::Flags) → see §5.

---

## 2. Chunk framing

**A chunk** = `[BER ID][BER length][length bytes of payload]` (`reader_struct_impl.h:67-72`).

**Struct chunk stream** (chunked structs: Actor element bodies, System, Terms, Map, etc.): read chunks in a loop; **ID `0x00` terminates** (`reader_struct_impl.h:69`). The terminator is a single `0x00` byte – the ID only; there is NO length byte after it. Unknown IDs are skipped by `length` bytes (`reader_struct_impl.h:92`). If a field reads the wrong number of bytes, reader re-seeks to `off+length` (`reader_struct_impl.h:82-89`).

**Write side** (`reader_struct_impl.h:111-139`): iterate `fields[]` in table order, emit each present field as `[id][len][payload]` (payload written only if len>0), then `conditional_zero_writer` writes the terminating `WriteInt(0)` – **except for `rpg::Database` and `rpg::Save`**, which write NO trailing 0x00 (`reader_struct_impl.h:97-109, 137-138`). So an LDB file ends at EOF with no terminator; an LMU (Map) ends with `0x00`.

**`Array<Struct>` framing** (`reader_struct_impl.h:221-251`): `[BER element-count]` then per element: `[BER ID]` (only if the struct has an `ID` member – all `Array<>` element types do) followed by the element's **full struct chunk stream ending in `0x00`**. So each element = `[BER id][chunk...][0x00]`. The ID is the element's stored ID value (for Database arrays these happen to be 1-based indices, but that is data, not framing). There is no per-array length prefix in bytes – only the element count.

---

## 3. Raw (non-chunked) structs – bare sequential fields, no chunk IDs

`RawStruct<T>` types (`reader_struct.h:60-66`): `Equipment, EventCommand, MoveCommand, Parameters, TreeMap, Rect` (+`DBString` which is treated as Primitive in practice). These have **empty Index columns** in structs/fields.csv and serialize as bare fields.

### EventCommand (`src/ldb_eventcommand.cpp:39-79`)
Wire layout of ONE command:
```
[BER code][BER indent][BER strlen][strlen codepage bytes][BER param-count][BER param]*param-count
```
- `code`, `indent` = BER int32. If `code == 0` on read, nothing else is read (sentinel).
- string: BER length prefix + raw codepage bytes (encoded length).
- parameters: BER count, then each param as BER int32 (stored into `DBArray<int32>`).

**`Vector<EventCommand>`** (`ldb_eventcommand.cpp:146-206`): NO count/size in the vector itself; commands are read until `Peek()==0`, then **4 bytes `0x00` are skipped** as the terminator. Write: all commands, then `4 × WriteInt(0)` (4 zero bytes) (`:191-197`). Note the wrapping chunk (e.g. EventPage 0x34) still has a normal BER length, AND there is a separate size chunk before it (§4). The 4-zero terminator is inside the payload.

### MoveCommand (`src/lmu_movecommand.cpp:37-59`)
Wire layout of ONE command (variable by command_id):
```
[BER command_id] then, switch on command_id:
  switch_on(32)/switch_off(33):        [BER parameter_a]
  change_graphic(34):                  [BER strlen][string bytes][BER parameter_a]
  play_sound_effect(35):               [BER strlen][string bytes][BER a][BER b][BER c]
  (all others):                        nothing
```
**`Vector<MoveCommand>`** (`:185-193`): NO terminator – read until `Tell() == startpos+length` (driven by the enclosing chunk length). Write: just concatenated commands (`:195-199`).

### Parameters (`src/ldb_parameters.cpp:28-49`)
6 parallel `int16` arrays, each of `n = length/6` bytes → n/2 elements: `maxhp, maxsp, attack, defense, spirit, agility`, each as 2-byte LE ints, in that order, fully sequential. Byte-length = `maxhp.size() * 2 * 6`.

### Equipment (`src/ldb_equipment.cpp:29-59`)
Exactly 10 bytes: 5 × int16 LE = `weapon_id, shield_id, armor_id, helmet_id, accessory_id`. If length ≠ 10, the whole chunk is skipped.

### Rect (`src/lmt_rect.cpp:28-46`)
Exactly 16 bytes: 4 × **uint32 LE** = `l, t, r, b` (asserts length==16).

### TreeMap / LMT top level (`src/lmt_treemap.cpp:29-45`)
`TreeMap` is a RawStruct read directly after the LMT header:
```
Struct<MapInfo>::ReadLcf(maps)      // Array framing: [BER count]{[BER id][chunks][0x00]}*
[BER tree_order-count][BER node]*   // tree_order list
[BER active_node]
Struct<Start>::ReadLcf(start)       // Start is a chunked struct: [chunks...][0x00]
```
No outer terminator beyond Start's own `0x00`. `MapInfo` elements carry a BER ID and their own chunk streams (MapInfo has fields like a `Rect` sub-struct and an `Encounter` array).

---

## 4. Size / Count fields (`Size Field? = t`)

A size row shares the **field name** with its data row but has a **different (smaller) chunk ID** and `size=t` (e.g. Actor `state_ranks` size=0x47, data=0x48; System `party` count=0x15, data=0x16). `lcf_type` (generate.py:42-47): if the CSV type is `Count<...>` → **CountField**, else → **SizeField**.

- **SizeField** (`reader_struct.h:487-518`): the size chunk payload = **byte size of the paired data field's payload** (BER int of `TypeReader<T>::LcfSize`). Used for `Vector<UInt8>`, `Vector<EventCommand>`, `DBBitArray`, `Vector<MoveCommand>` size rows.
- **CountField** (`reader_struct.h:524-537`): payload = **element count** (`.size()`) as BER int. Used for `Count<Vector<Int16>>` etc. (System party/menu_commands).
- **Reader ignores the value**: `SizeField::ReadLcf` reads a dummy int32 and discards it (`reader_struct.h:491-494`); the actual element count is always recovered from the DATA chunk's own length. Size/count chunks exist purely for RPG_RT write-compatibility.
- Emission: because the size ID < data ID, ascending-ID write order (§8) naturally puts the size chunk immediately before its data chunk.

---

## 5. Flags (`flags.csv`, Category::Flags)

Structs with flag sets in ldb/lmu: `TroopPageCondition`, `Terrain`, `EventPageCondition` (+ `SavePicture` in lsd). Read/write in `src/reader_flags.cpp`.

- **Bit order: LSB-first within each byte.** flag[i] = `(byte >> bitidx) & 1`, bitidx 0..7, then advance to next byte (`reader_flags.cpp:16-32`).
- **Byte count is governed by the chunk length on read** (`reader_flags.cpp:24`): once 8 bits are consumed, the reader only advances to the next byte if `byteidx < length`; otherwise it stops and **all remaining flags keep their defaults (false)**. This is exactly how a 2k file can carry fewer flag bytes than the full 2k3 flag set.
- **Write side compacts by engine** (`reader_flags.cpp:42-66`): flags with `is2k3=1` are **skipped entirely** (not written as a 0 bit) when writing a 2k file – so the bit positions shift, and the byte count = `ceil(active_bits / 8)` (`:68-81`). A reimplementation must filter is2k3 flags **before** bit-packing, not after.
- **Unknown high bits**: the read loop only iterates `num_flags` times, so surplus bits in the last byte are ignored.

---

## 6. Strings

Raw codepage bytes, length = the chunk's byte length (or the inline BER length for raw-struct strings). Then `Encode` converts codepage→UTF-8 on read, `Decode` UTF-8→codepage on write (`reader_lcf.cpp:218-228`, `writer_lcf.cpp:119-131`). **No terminator, no escaping.** `String` and `DBString` are wire-identical; `DBString` is just an interned/refcounted in-memory type. Note the length written is the length of the **codepage-encoded** bytes (`Decode(str).size()`), which can differ from the UTF-8 byte length.

---

## 7. Boolean on the wire

Read: `ReadInt() > 0` – a BER int, true iff value > 0 (`reader_lcf.cpp:59-62`). Write: a single raw byte `0x00`/`0x01` (`writer_lcf.cpp:69-72`); chunk length = 1 (`LcfSizeT<bool> = 1`, `reader_struct.h:158-161`). A reader should treat any nonzero as true.

---

## 8. Write-side canonicalization

- **Field emission order = table order = ascending chunk ID.** The `fields[]` array is generated in CSV row order; the writer asserts/warns if `field->id < last` (`reader_struct_impl.h:122-126`), so the CSV is authored in ascending-ID order and the wire is ascending-ID. Size chunks (lower ID) precede their data chunks automatically.
- **PersistIfDefault (`presentifdefault`)**: `0` = omit the chunk when the value equals the struct's default; `1` = always write it (`reader_struct_impl.h:127`, `Field::isPresentIfDefault` `reader_struct.h:383-390`). Default comparison uses a freshly default-constructed struct (`StructDefault<S>::make`, `reader_struct_impl.h:43-57`; Actor is special-cased to run `Setup`).
- **`2k|2k3` split defaults** (e.g. Actor `final_level` = `50|99`, `exp_base` = `30|300`): parsed in `pod_default` (generate.py:107-138) – when `|` is present the C++ default member is set to `-1`, and the real per-engine default is applied by the struct's `Setup(is2k3)` method at load time. For the wire this matters only for the default-omission check.
- **Is2k3 fields when writing a 2k file**: fields with `is2k3=1` are **skipped entirely** (not written) when `!db_is2k3` (`reader_struct_impl.h:119-121`, `:148-150`). On read they're simply absent. Engine version is derived from the DB (`GetEngineVersion`) – for LMU/LMT it's passed in.
- **Terms special case** (`reader_struct.h:383-390`): for `rpg::Terms`, chunk IDs `0x01` (`encounter`) and `0x03` (`escape_success`) are force-omitted-when-default in a 2k3 DB even though their `presentifdefault=1`. This is the only field-level hardcode in the generic machinery.

---

## 9. File-level headers

Each file starts with a **BER length-prefixed magic string** (codepage-encoded, no terminator):

| Format | Magic (len) | Top-level | Trailing |
|---|---|---|---|
| LDB | `LcfDataBase` (11) | `Struct<Database>` chunk stream | **NO 0x00 terminator** (ends at EOF) – `reader_struct_impl.h:97-109`; header check `ldb_reader.cpp:68-79` |
| LMU | `LcfMapUnit` (10) | `Struct<Map>` chunk stream | ends with `0x00` (Map is a normal struct) – `lmu_reader.cpp:70-83` |
| LMT | `LcfMapTree` (10) | `RawStruct<TreeMap>` | ends with `Start` struct's `0x00` – `lmt_reader.cpp:64-76` |

Header write: `WriteInt(header.size()); Write(header)` (`ldb_reader.cpp:104-105`, `lmu_reader.cpp:98-99`, `lmt_reader.cpp:91-92`). Header length is validated by exact char count; content mismatch only warns.

**Version/empty oddities (LDB Database, in ascending-ID order):**
- `version` = `DatabaseVersion` @ 0x1A (§1). Present in 2k3 always; in 2k only if ≠0.
- `commoneventD2/D3` = `EmptyBlock` @ 0x1B/0x1C, `classD1` @ 0x1F – 2k3-only zero-length chunks.
- `battlecommands` @ 0x1D (`BattleCommands` struct), `classes` @ 0x1E, and everything ≥0x1E are `is2k3=1` (2k3-only).

---

## 10. Things not captured by the CSVs (hardcodes in C++ / generate.py)

Grep of `reader_struct*.{h,cpp}`, `generate.py`, and the hand-written `*.cpp`:

1. **RawStruct set** (`reader_struct.h:60-66`): `Equipment, EventCommand, MoveCommand, Parameters, TreeMap, Rect` serialize as bare fields (no chunk IDs) – identified by class, not CSV.
2. **EventCommand vector 4-byte-zero terminator** and the `code==0` sentinel – hand-coded (`ldb_eventcommand.cpp`).
3. **MoveCommand command_id → variable payload switch** (only ids 32/33/34/35 carry params) – hand-coded (`lmu_movecommand.cpp:40-58`).
4. **Parameters = 6 int16 arrays of `length/6` bytes each**; **Equipment = fixed 10 bytes**; **Rect = fixed 16 bytes (uint32)** – hand-coded sizes/asserts.
5. **TreeMap top-level layout** (MapInfo array, tree_order list, active_node, Start) – hand-coded (`lmt_treemap.cpp`).
6. **`conditional_zero_writer`**: `Database` and `Save` omit the trailing `0x00` (`reader_struct_impl.h:97-109`).
7. **Terms 0x01/0x03 2k3 default-omission** (`reader_struct.h:383-390`).
8. **Actor `StructDefault` runs `Setup(is2k3)`** for default comparison (`reader_struct_impl.h:50-57`).
9. **`flag_type` backward-compat**: when the flag struct name equals the flag type prefix, the field is named just `Flags` (generate.py:100-105) – cosmetic, no wire effect.
10. **`DatabaseVersionField` / `EmptyField`** special LcfSize/IsDefault (`reader_struct.h:435-480`).
11. Encoding: strings pass through `Encoder` (codepage ↔ UTF-8); wire lengths are codepage-byte lengths.
