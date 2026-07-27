# Vendored liblcf format tables

CSV format definitions copied verbatim from [EasyRPG/liblcf](https://github.com/EasyRPG/liblcf), `generator/csv/`, commit [`666e6c0`](https://github.com/EasyRPG/liblcf/commit/666e6c023696d4a45a67dd9ba879dbff7b0f69f3) (2026-05-20). liblcf is MIT-licensed, Copyright (c) 2014-2025 liblcf authors; the full notice is carried in the third-party section of the root [LICENSE](../../LICENSE).

These files are the authoritative description of the LCF binary format – structs, fields with chunk IDs, types, defaults, persist flags and 2k/2k3 markers, enums, and bit-flag sets. The dev-time generator (`scripts/generate.ts`) emits the committed TypeScript field descriptors and interfaces in `src/generated/` from them. The `*_easyrpg.csv` extension tables (EasyRPG Player / ManiacPatch chunks) merge by appending their rows after each struct's canonical rows, mirroring liblcf's generator.

| File | Rows | Contents |
| --- | --- | --- |
| `structs.csv` | 65 | struct name, format (ldb/lmt/lmu/lsd), base, ID-indexed flag |
| `fields.csv` | 1043 | per-field: owning struct, name, size-field marker, type, chunk ID (empty = raw record), default (`2k\|2k3` split possible), persist-if-default, 2k3-only, comment |
| `enums.csv` | 472 | enum entries with values |
| `flags.csv` | 28 | bit-packed boolean sets |
| `constants.csv` | 8 | named constants |
| `structs_easyrpg.csv` | 4 | extension structs |
| `fields_easyrpg.csv` | 157 | extension fields, appended per struct |
| `enums_easyrpg.csv` | 59 | extension enum entries |
| `flags_easyrpg.csv` | 32 | extension flag bits |

Not vendored: `functions.csv` (C++ helper method declarations – describes no wire data).

To sync with upstream: copy the nine files from `generator/csv/` at the new commit, update the commit reference above, regenerate (`pnpm run generate`), and diff the generated output.
