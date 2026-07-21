# lcfkit

> Read and write RPG Maker 2000/2003 LCF files in pure TypeScript – library and CLI.

> [!WARNING]
> Work in progress. Nothing is published yet; the API and CLI surface below describe the v1 target.

RPG Maker 2000/2003 games store everything – maps, database, map tree – in the binary LCF format. The only complete implementation is [EasyRPG's liblcf](https://github.com/EasyRPG/liblcf) (C++). lcfkit reimplements the format in isomorphic TypeScript (`Uint8Array` core, browser-safe, no native builds) so game data becomes scriptable from Node and the web.

## Planned v1

| I want to… | Run |
| --- | --- |
| Turn LCF files into deterministic, diffable JSON (and back) | `lcfkit convert` |
| Dump every message, choice, and database string for (batch/AI) translation | `lcfkit extract` |
| Write translated text back into the game, validated all-or-nothing | `lcfkit inject` |

Design records live in [`CONTEXT.md`](./CONTEXT.md) (domain glossary) and [`docs/adr/`](./docs/adr) (scope and architecture decisions). Format tables are generated from [vendored liblcf CSVs](./vendor/liblcf-csv).

## License

[MIT](./LICENSE) License © Johann Schopplich
