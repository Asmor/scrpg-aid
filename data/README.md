# Rules Data

Mechanical content extracted from *Sentinel Comics: The Roleplaying Game — Core Rules*. This is what the app reads to build characters.

## Layout

| Path | Contents |
| --- | --- |
| `rules/` | Paraphrased process documents (Markdown): core concepts, hero creation, villain creation, minion/lieutenant/environment creation |
| `heroes/powers-qualities.json` | Power and quality categories and entries (p. 47, 115–121) |
| `heroes/backgrounds.json` | Step 1: backgrounds (p. 48–54) |
| `heroes/power-sources.json` | Step 2: power sources (p. 56–70) |
| `heroes/archetypes.json` | Step 3: archetypes, including Minion-Maker, Form-Changer, Divided, Modular (p. 72–98) |
| `heroes/personalities.json` | Step 4: personalities, status dice, Out abilities (p. 100–104) |
| `heroes/red-abilities.json` | Step 5: Red abilities by category (p. 106–111) |
| `heroes/retcons.json` | Step 6: retcon options (p. 112) |
| `heroes/health.json` | Step 7: Health formula and zone ranges (p. 113) |
| `heroes/principles.json` | The 64 principles (p. 122–141) |
| `villains/approaches.json` | Villain approaches (p. 208–219) |
| `villains/archetypes.json` | Villain archetypes and status rules (p. 220–234) |
| `villains/upgrades.json` | Villain upgrades and masteries (p. 235–238) |
| `villains/health.json` | Villain Health formula and zone chart (p. 239) |
| `minions/minions.json` | Minion and lieutenant creation guidelines, scene difficulty (p. 186, 204–207) |
| `environments/environments.json` | Environment creation, twist strength guidelines, challenges (p. 157, 189–199, 240–245) |

Pre-made heroes, villains, minions, and environments (Chapter 7, adventure issues, and examples) are intentionally **not** included.

## Conventions

- **Page numbers** (`page`, `pages`, `chartPage`) are the numbers printed in the Core Rules, so players can look things up in a physical book. (The PDF page index is the printed page + 8.)
- **Ids** are kebab-case and unique within their list. Cross-references use these ids.
- **Dice** are strings: `"d4"`, `"d6"`, `"d8"`, `"d10"`, `"d12"`.
- **Option references** use one key: `{ "power": id }`, `{ "quality": id }`, `{ "powerCategory": id }`, or `{ "qualityCategory": id }`. Ids come from `heroes/powers-qualities.json`.
- **Abilities** are `{ "name", "type", "text" }`, where `type` is `A` (action), `R` (reaction), `I` (inherent), or `A/I`. They may also have `requires` (an option reference the hero must have to take the ability, e.g. Psychic Yellow abilities and Hallmark Red abilities).
- **Choice blocks** are `{ "count", "options" }`, plus an optional `constraint` (prose) and `rule` (machine token: `differentPowers`, `differentQualities`, or `differentPowersOrQualities`). `count` is a number, or for dice assignment one of `one`, `oneOrMore`, `any`, `atLeastTwo`, `remaining`. A Yellow block with `fromGreenList: true` means "take one of the Green options as a Yellow ability" and has no `options` of its own.
- **Roll tables:** hero tables use `roll` (1–20, the result that selects the entry). Villain approaches, villain archetypes, and upgrades use `number` (their position in the book; they are chosen, not rolled).
- **Archetype specifics:** the Psychic archetype's `qualities` block also has `powerOptions`, because its remaining dice can go to powers or qualities. `principleCategory: "fromSecondaryArchetype"` (Modular) means the principle comes from the archetype being modularized. `secondaryArchetype.reroll` is `"required"` (Divided) or `"optional"` (Modular).
- **Villain Health ranges:** the top row has `orMore: true` and applies to any max Health of 100 or more (its Green range runs from the villain's max down to 75).
- **Zones** are `green`, `yellow`, `red`.
- **Verbatim vs. paraphrased:** Text that is written onto a character sheet is copied verbatim: ability game text, Out abilities, principle roleplaying/twist text, and minion form `effect` text. Everything else (`summary`, `note`, `constraint`, rules documents) is paraphrased. Flavor text is omitted.
- Fields named `summary`, `note`, `constraint`, or `guidance` are human-readable. Structured fields next to them (`kind`, `count`, `options`, `tiers`, ...) are the machine-usable form.

## Validation

```
python3 scripts/validate_data.py
```

This checks that every file parses; that entries have their required fields; that ids are unique; that cross-references and option references resolve; that abilities have a name, type, and text; that choice counts don't exceed their options; that dice, ability types, and enumerated values are valid; that page numbers fall within the book section each file covers (`PAGE_SPANS`, which also catches PDF page indexes); that roll tables cover 1–20; and that Health tables are contiguous. When you add a data file, register its page span in the script.

## How it was extracted

Most icons in the PDF (die sizes, action types) are vector drawings, not text. The extraction combined text extraction with automated icon detection. Wherever die icons were missing from the extracted text (for example, personality status dice, villain approach and archetype dice, and several individual abilities), they were read from rendered page images. Other pages were spot-checked.
