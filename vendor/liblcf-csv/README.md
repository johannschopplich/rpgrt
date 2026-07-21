# Vendored liblcf format tables

CSV format definitions from [EasyRPG/liblcf](https://github.com/EasyRPG/liblcf), `generator/csv/`, commit [`666e6c0`](https://github.com/EasyRPG/liblcf/commit/666e6c023696d4a45a67dd9ba879dbff7b0f69f3) (2026-05-20). MIT licensed, Copyright (c) 2014-2025 liblcf authors.

These files are the authoritative description of the LCF binary format – structs, fields with chunk IDs, types, defaults, persist flags and 2k/2k3 markers, enums, and bit-flag sets. The dev-time generator emits the committed TypeScript field descriptors and interfaces from them.

| File | Rows | Contents |
| --- | --- | --- |
| `structs.csv` | 65 | struct name, format (ldb/lmt/lmu/lsd), base, ID-indexed flag |
| `fields.csv` | 1043 | per-field: owning struct, name, size-field marker, type, chunk ID (empty = raw record), default (`2k\|2k3` split possible), persist-if-default, 2k3-only, comment |
| `enums.csv` | 472 | enum entries with values |
| `flags.csv` | 28 | bit-packed boolean sets |
| `constants.csv` | 8 | named constants |

Deliberately **not** vendored (ADR-0001/0003): `*_easyrpg.csv` (EasyRPG Player/ManiacPatch extension chunks vanilla RPG_RT does not understand) and `functions.csv` (C++ helper method declarations).

To sync with upstream: copy the five files from `generator/csv/` at the new commit, update the commit reference above, regenerate, and diff the generated output.
