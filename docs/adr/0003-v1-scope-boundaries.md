# v1 scope boundaries

Deliberate exclusions, each with a reason a future reader will otherwise re-litigate:

- **JSON only, no XML.** EasyRPG's `lcf2xml` already does full LCF ↔ XML round-trip both directions; competing there is me-too. liblcf has no JSON anywhere, so the JSON shape is ours to design and is the greenfield.
- **LMU + LDB + LMT only, no LSD.** Savegames are the second-largest format (17 structs, 319 fields), the least useful outside a running engine, and the best served by existing tools (lsd2xml, online save editors). Skipping them still covers 74% of structs.
- **Vanilla RPG_RT fidelity, no `*_easyrpg.csv` extension layer.** Those 157 extra fields are EasyRPG Player / ManiacPatch chunks; writing them can produce files vanilla RPG_RT rejects or corrupts. Revisit behind an explicit opt-in flag if demand appears.
- **Isomorphic codec: `Uint8Array`/`DataView`, never Node `Buffer` and no `node:` imports in the codec.** Enables browser use (a future website) without a build fork. Encoding conversion (iconv-lite + charset detection – LCF strings are raw code-page bytes and vanilla games carry no encoding marker) sits at the boundary, not inside the codec.
- **Single package.** Library (`exports`) and CLI (`bin`) ship together; the audience is niche and installs both. Split only if the CLI grows heavy dependencies.
- **CLI surface is `convert`, `extract`, `inject`.** The asset/reference linter and pixel-width overflow checking are the designated fast-follows, not v1.
