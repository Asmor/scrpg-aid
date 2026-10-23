# Rules Data

Mechanical content extracted from *Sentinel Comics: The Roleplaying Game — Core Rules*. This is what the app reads to build characters.

## Layout

| Path | Contents |
| --- | --- |
| `books.json` | Source books that page references point to (currently only the Core Rules): `id`, full `title`, and the `shortTitle` shown in page references |
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

- **Page references:** every object with a `page`, `pages`, or `chartPage` also has a `book`, an id from `books.json` (currently always `"core-rules"`). Page numbers are the numbers printed in that book, so players can look things up in a physical copy. (For the Core Rules PDF, the PDF page index is the printed page + 8.) The Markdown documents in `rules/` cite Core Rules pages.
- **Ids** are kebab-case and unique within their list. Cross-references use these ids.
- **Dice** are strings: `"d4"`, `"d6"`, `"d8"`, `"d10"`, `"d12"`.
- **Option references** use one key: `{ "power": id }`, `{ "quality": id }`, `{ "powerCategory": id }`, or `{ "qualityCategory": id }`. Ids come from `heroes/powers-qualities.json`.
- **Abilities** are `{ "name", "type", "text" }`, where `type` is `A` (action), `R` (reaction), `I` (inherent), or `A/I`. They may also have `requires` (an option reference the hero must have to take the ability, e.g. Psychic Yellow abilities and Hallmark Red abilities).
- **Choice blocks** are `{ "count", "options" }`, plus an optional `constraint` (prose) and `rule` (machine token: `differentPowers`, `differentQualities`, or `differentPowersOrQualities`). `count` is a number, or for dice assignment one of `one`, `oneOrMore`, `any`, `atLeastTwo`, `remaining`. A Yellow block with `fromGreenList: true` means "take one of the Green options as a Yellow ability" and has no `options` of its own.
- **Ability restrictions:** every `constraint` has a machine-readable form the app can check (the validator enforces this). Besides `rule`, `fromGreenList`, and per-option `requires`, a choice block may use these keys. In them, "uses" means the power or quality an ability is used with. How to apply them (decided by the user):
  - An ability that uses no power or quality (e.g. Untouchable, Deflect) is **exempt**. It is always allowed and counts toward nothing, so every restriction applies only to the abilities that do use one.
  - An `[element/energy you have a related power for]` slot counts as using that related power.
  - An ability that names its trait in the text instead of a bracket (e.g. "Boost yourself using Power Suit") has a `requires` naming that one power or quality, and counts as using it.
  - The retcon that changes which power or quality an ability uses only has to fit the ability's bracket. The ability's Red category and its block's restrictions no longer apply to it.
  - A rule about powers (`differentPowers`, `minDifferentPowers`) ignores abilities that use a quality. For example, a `[power/quality]` ability used with a quality is allowed in a "different powers" block and doesn't count toward its minimum.
  - A power or quality is "from" a list when it matches one of the list's option references, no matter which creation step gave the hero its die. For example, a Speedster's Mental quality from their background counts as from the Speedster list.
  - A restriction only requires *different* powers or qualities when it says so (`rule`, `minDifferentPowers`, `sameUsePattern`). Otherwise abilities may share one. For example, both Elemental Manipulator Green abilities may use the same Elemental/Energy power.
  - `usesFrom`: each ability must use a power or quality from `"archetypeLists"` (any of the archetype's required, power, and quality lists), from `"archetypePowerList"` (its power lists only: the `powers` block, plus `required` when it names powers), or from a list of option references.
  - `requireAtLeast`: a list of `{ "count", "uses" }` clauses. At least `count` abilities must use a match for `uses`, which is `"power"`, `"quality"`, or a list of option references. Each ability counts toward at most one clause, so the check is a matching: every clause must be met by its own abilities.
  - `minDifferentPowers`: the abilities together use at least this many different powers.
  - `differentFromGreen: true` (only with `fromGreenList`): the Yellow ability must use a power or quality none of the hero's Green abilities use.
  - A prose constraint on another list uses the same naming: `fixedGreenConstraint` (Minion-Maker's fixed Green abilities) is paired with `fixedGreenRule`, a `rule` token.
  - `sameUsePattern`: `{ "uses": "power" | "quality", "groups": [2, 1] }`. The (non-exempt) abilities use that kind, and the groups give how many share each power or quality (e.g. two share one power, the third uses another). With exempt abilities in the mix, the rest only have to fit into the groups. For example, under `[2, 1]` with one exempt ability, the other two may use the same power or different ones.
- **Roll tables:** hero tables use `roll` (1–20, the result that selects the entry). Villain approaches, villain archetypes, and upgrades use `number` (their position in the book; they are chosen, not rolled).
- **Archetype specifics:** the Psychic archetype's `qualities` block also has `powerOptions`, because its remaining dice can go to powers or qualities. `principleCategory: "fromSecondaryArchetype"` (Modular) means the principle comes from the archetype being modularized. `secondaryArchetype.reroll` is `"required"` (Divided) or `"optional"` (Modular). `extraRedAbilityOptions` (Minion-Maker) are extra choices whenever that hero picks a Red ability, including a Red ability gained from a retcon (the user's ruling); they aren't tied to a power or quality category. A hero can't take two Red abilities with the same name, even from different category lists; only the name in the data counts, not names the player gives their abilities (the user's ruling).
- **Villain Health ranges:** the top row has `orMore: true` and applies to any max Health of 100 or more (its Green range runs from the villain's max down to 75).
- **Zones** are `green`, `yellow`, `red`.
- **Verbatim vs. paraphrased:** Text that is written onto a character sheet is copied verbatim: ability game text, Out abilities, principle roleplaying/twist text, and minion form `effect` text. Everything else (`summary`, `note`, `constraint`, rules documents) is paraphrased. Flavor text is omitted.
- Fields named `summary`, `note`, `constraint`, or `guidance` are human-readable. Structured fields next to them (`kind`, `count`, `options`, `tiers`, ...) are the machine-usable form.

## Validation

```
python3 scripts/validate_data.py
```

This checks that every file parses; that entries have their required fields; that ids are unique; that cross-references and option references resolve; that abilities have a name, type, and text; that choice counts don't exceed their options; that every prose `constraint` has a machine-readable form and that restriction keys are well formed; that dice, ability types, and enumerated values are valid; that every page reference names a book from `books.json`; that page numbers fall within the book section each file covers (`PAGE_SPANS`, per file and per book, which also catches PDF page indexes); that roll tables cover 1–20; and that Health tables are contiguous. When you add a data file, or cite a new book in an existing file, register the page span in the script.

## How it was extracted

Most icons in the PDF (die sizes, action types) are vector drawings, not text. The extraction combined text extraction with automated icon detection. Wherever die icons were missing from the extracted text (for example, personality status dice, villain approach and archetype dice, and several individual abilities), they were read from rendered page images. Other pages were spot-checked.
