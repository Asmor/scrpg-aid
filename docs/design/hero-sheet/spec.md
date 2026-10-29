# Character page (Sheet and Play): handoff spec

Rebuild the character view and the play screen as one page per character with two modes, **Sheet** and **Play**. This spec covers both modes for heroes, Sheet mode for villains, and the printed PDF. Villain Play mode belongs with the GM screens and is out of scope.

Theme tokens, typefaces and icon rules are the same as in `../hero-wizard/spec.md` (sections Theme tokens and Icon rules). Everything here uses them; nothing introduces new colors.

## Page and modes

- One page component per character. `#/hero/:id` opens Sheet mode and `#/hero/:id/play` opens Play mode; both render the same page, so switching never reloads data or loses state.
- The Sheet/Play switch is a two-button segmented control in the header. Switching keeps the scroll position anchored to the Mechanics heading, and keeps any open roll or dialog.
- Play mode hides everything under Roleplaying (heroes) or About (villains). Mechanics, abilities and forms/modes stay.

## Header (heroes and villains)

1. Breadcrumb: Your heroes (or Your villains) / name.
2. Name in large Barlow Condensed with the alias beside it in muted text.
3. Identity line, muted: `Upper Class · Accident · Speedster · Lone Wolf` for heroes; `Major villain · Bully · Overlord` for villains.
4. On the right: the Sheet/Play switch, Edit, Advancement (heroes only), and an Export menu holding JSON, Markdown, HTML, and PDF (Letter or A4). The export block at the bottom of today's page goes away. In Play mode, Advancement and Export give way to "New issue…", the existing reset between sessions.
5. When the character has rule issues, a banner under the header: "1 rule issue" in `--ui-danger`, the first issue's text, and "Open in edit" linking to the edit summary.

## Hero sheet: section order

Roleplaying comes first, then Mechanics, then forms or modes when the archetype has them.

### Roleplaying (hidden in Play)

Three cards in a row on wide screens:

- **Who they are:** Background, Power source, Archetype, Personality; then a divider; then the physical details that are filled in (Age, Build, Costume, and so on). Empty fields are left out, not shown as blanks.
- **One card per principle:** its name, then "During roleplaying", "Minor twist" and "Major twist" as small uppercase labels, each followed by its text.

Under the cards, a one-line record strip: Hero points, Back issues "0 of 6", Collections, and a link to Advancement.

### Mechanics

Three cards in a row on wide screens:

- **Powers:** one row per power, name left, die icon right.
- **Qualities:** the same, including the roleplaying quality.
- **Status dice and Health:** three game-colored tiles (GREEN, YELLOW, RED) each with its die icon; then Health with the max in large type and the three ranges as game-colored chips.

### Abilities

Bands in this order: Green, Yellow, Red, Out. Each band is a card whose header strip carries the zone label on the zone's game color. The Out band's header uses `--ui-surface-2` and reads "OUT" with "When your Health reaches 0" on the right.

- Principle abilities sit in the Green band, as on the official sheet, not in a separate list.
- Each ability is a row of three columns: action icons then the name (bold), the type (Action, Reaction, Inherent) in muted text, and the ability text with inline action icons.
- Under 980 px, the name and type share the first line and the text wraps underneath.

### Forms and modes (Divided, Form Changer, Modular, Minion Maker)

This replaces today's "Auxiliary sheet" tables, which repeat every die in every mode and hide what actually changes.

**Modular and Form Changer** get one card per mode or form, two per row:

- The base card first ("Default mode" or "Base form"), saying "Uses your base dice."
- Card header: the name, and a game-colored zone chip for the lowest zone it needs (a Yellow mode works in the Yellow or Red zone).
- "Dice changes": one row per changed die, `name [from die] → [to die]`; rows for added traits with an "Added" tag; one muted line "Not in this mode: Cold, Cosmic" for dropped traits. Unchanged traits are not listed.
- The restriction line, if any ("Can't Boost, Hinder, or Overcome."), on `--ui-surface-2` with a circle-slash icon.
- The mode's own ability, with icons before its name.
- The section's subtitle names the abilities that work in every mode or form (Switch, Quick Switch, Emergency Switch; or Change Forms and Emergency Change).

**Divided** gets three columns: Both forms, Civilian form, Heroic form.

- Each column lists its powers and qualities with die icons and a muted kind tag (power, quality, roleplaying).
- When the hero took a second personality, the form columns show their personality name and three small game-colored status chips with die icons.
- "Abilities only in this form" lists abilities that need a form-only trait, with their icons.
- With Divided Psyche instead of Split Form, show one line explaining which dice each form uses, and no columns.

**Minion Maker** gets a grid of minion form cards, three per row: name, "Needs a +2 bonus or more" in muted text, and the form's text. The subtitle names the count and the quality it came from. Minions made during a scene live in Play, not here.

## Villain sheet

Same page, header and components, with these differences:

- **About** (hidden in Play) replaces Roleplaying: a wide card with the concept, then any of appearance, costume, mannerisms, motivation, ties to the heroes and notes that are filled in; and a narrow card listing Kind, Approach, Archetype, Upgrades and Mastery.
- **Mechanics:** Powers and Qualities share one card. The Status card states the archetype's status rule in a sentence and lists its table as rows of condition and die icon (or the single die, for archetypes like Indomitable). Health shows the max, the line explaining how it was built ("Built for 4 heroes: Bully 25, Overlord +15, 5 per hero"), and the three game-colored ranges.
- **Abilities are grouped by where they came from,** not by zone: the approach, the archetype, each upgrade that grants an ability, and the mastery. Group headers use `--ui-surface-2` with the name and a muted note ("Approach", "Upgrade · signature minions appear with the villain"). Villain abilities aren't zoned, so no game colors appear on them.

## Sheet on a phone (under 760 px)

- The Sheet/Play switch is full width under the name; Edit, Advancement and Export share one row of equal buttons below it.
- Roleplaying: the who-they-are card first; each principle card shows its roleplaying text, with the twists behind a "Show twists" button.
- Powers and Qualities sit side by side; Status and Health share one card under them.
- Ability rows: icons, name and type on one line; text underneath.
- Forms, modes and minion forms stack one card per row.

## Printed PDF

The PDF is the Sheet mode page with a print stylesheet, so the screen and the PDF can't drift apart. Whatever produces the PDF today should render these same components.

- Always the light token values, whatever the app theme. Game colors print as fills; every band and chip keeps its text label, so it still reads in grayscale.
- Hidden: the top bar, the mode switch, all buttons and links, the issues banner.
- Page 1: name, alias and identity line; Roleplaying; the record strip with a blank line for hero points; Mechanics with a blank line for current Health.
- Page 2 onward: Abilities, then forms and modes. Cards and ability rows don't split across pages (`break-inside: avoid`).
- Every page has a footer: the name, "Sentinel Comics RPG", and "Page N of M".
- Letter (816 × 1056 px) and A4 (794 × 1123 px), with at least 0.5 in margins. Body text at least 12 px.

## Play mode (heroes)

Play mode is the character page with the roleplaying section hidden and the tracking controls shown. Everything a player changes here (Health, scene, mods, twists, hero points, form or mode, minions) is free and immediate: the app never blocks a change, so players can work around anything the app models wrong. Every change is logged to history.

### Layout

| Width | Layout |
| --- | --- |
| 1280 px and wider | Status column (330 px, sticky) on the left, actions column on the right |
| 760 to 1279 px | Status column (300 px) and actions column |
| Under 760 px | Sticky top bar, three tabs (Actions, Status, History), and the roll as a full-screen sheet. See Play on a phone |

**Rolls open in a modal dialog** at every width of 760 px and up: centered, 560 px wide, over a scrim, with focus trapped inside and returned to the Use button when it closes. Escape and Cancel close it without changing anything. A docked side panel was considered and rejected because a third column squeezes the abilities. Under 760 px the same dialog fills the screen.

### Status column, top to bottom

1. **Health.** Current Health in large type with "of 30"; the personal zone as a game-colored chip; a three-segment meter in the zone colors with the current zone at full opacity and the others faded; the range labels under it. Buttons: −1, +1, a number field, Lose and Gain. Health stops at 0 and at max. At 0 the hero is Out.
2. **Scene and status die.**
   - Solo: a Green, Yellow, Red segmented control; the selected segment takes its game color.
   - In an online game: a read-only zone chip and "Follows the GM's scene tracker".
   - Below it, the status die icon (large) with "Status die: Yellow" and the reason: "You: Yellow · Scene: Green. The more severe one sets your status die and abilities." When Out: "You're Out: only your Out ability is available."
3. **Form or mode** (special archetypes only). See Forms and modes in Play.
4. **Dice.** Powers and qualities in two compact columns with die icons, showing the effective dice for the current form or mode, and a "Full sheet" link to Sheet mode.
5. **Hero points** with − and +, and **Reaction used this round** as a checkbox. In an online game the reaction clears at the start of each round; in solo the player clears it.
6. **Bonuses and penalties.** One row each: a size badge (bonuses on `--ui-accent-soft` with `--ui-accent` text, penalties on `--ui-danger-soft` with `--ui-danger` text; never game colors), the name, Persistent and Exclusive tags, and a remove button. "+ Add" opens an inline form: size −4 to +4, name (required), Persistent, Exclusive, Add. The form is closed by default.
7. **Twists.** One row each with a Minor or Major tag, the text, and a resolve button; "+ Add" opens an inline form the same way.
8. **Your minions** (Minion Maker only). One row each: size as a die icon, name, form tag, its action with icon ("Any basic action" for Autonomous minions), its own bonuses and penalties as small chips with a "+ Mod" button, and Use, shrink and remove buttons. Shrinking below the smallest die removes the minion. "+ Add" adds one by hand; a Make Minion result adds one with its size from the roll.
   - **Each minion has its own bonuses and penalties,** separate from the hero's, with the same fields (size, name, persistent, exclusive). They're added from the row's "+ Mod" button, or by a Boost or Hinder that targets the minion (see Resolve).
   - **Use** opens a small inline roll under the row. The minion rolls its own single die. Its own mods appear as a checklist with the same defaults and exclusive limits as the hero's roll; the hero's mods don't apply. With one die and one effect there's no assignment step: the total is the die plus the checked mods, never below 0, shown with the math ("3 (4 − 1)"). The result shows the effect line ("Deal 6 damage", "Hinder by 3: a −2 penalty"), logs to history, and Done uses up the non-persistent mods it used.
   - A Minion Maker's minion can only take the basic action it was made with, so its roll has no action choice ("Can only Attack, the action it was made with").
   - An **Autonomous** minion picks any of the five basic actions before rolling.
   - The GM's minion tracking in online play reuses this component with every minion able to take any basic action. Build the component with a per-minion setting: one fixed action, or any action.

### Actions column

1. **Basic actions:** Attack, Defend, Boost, Hinder and Overcome as buttons with their icons. Each opens the roll flow with that action chosen.
2. **Ability bands** as in Sheet mode, each row with a Use button or, when it can't be used, the reason in its place. Unusable rows fade the name and text, not the reason.
3. **History:** the latest roll as a card with a 2 px `--ui-accent` border (title, the three dice with their sources, and the effect lines with icons), then older entries newest first with a relative time. Entries cover rolls, Health changes with zone changes, hero points, mods added and used up, twists, scene changes and form or mode changes.

**Ability availability** is one function, used by the Use buttons, the roll flow and the basic action menu. In order, the first rule that applies wins:

| Rule | Shows |
| --- | --- |
| Inherent ability | "Always on", no Use button |
| Hero is Out and this isn't the Out ability | "You're Out" |
| Out ability and the hero isn't Out | "When you're Out" |
| Belongs to a form or mode that isn't active | "Only in Bombardment Mode" |
| Uses an action the active form or mode forbids | "Can't Hinder in Bombardment Mode" |
| Needs a power or quality the current Divided form lacks | "Needs Agility (heroic form)" |
| Zone is more severe than the effective zone, and the ability doesn't belong to the active form or mode | "Needs Red zone" |
| Otherwise | Use button |

### Roll flow

Three steps, shown as a small step bar: Dice and mods, Results, Resolve. The ability's text, with inline icons, stays at the top throughout.

1. **Dice and mods**
   - Basic actions only: an Action select.
   - Power and Quality: when the ability sets one, its name with "set by the ability"; otherwise a select of the hero's powers or qualities plus "Take a d4". The die icon sits at the end of each row.
   - Status: the effective zone's status die, automatic. Abilities that roll a single die (most Out abilities) show just that die.
   - Mods: penalties, then bonuses, as checkboxes with size badge, name and Exclusive tag. Defaults: the largest exclusive penalty and every non-exclusive penalty are checked; bonuses are not. Checking an exclusive mod unchecks the other exclusive mod of the same sign, so at most one exclusive bonus and one exclusive penalty are ever on.
   - Buttons: Roll, and Enter my own roll (one number field per die, each checked against its die's size).
2. **Results**
   - Three dice cards sorted Max, Mid, Min: label, value large, die icon, and the source (Speed, Alertness, Yellow status).
   - One card per effect from the ability's definition (a basic action has one effect using the Mid die): action icon, label with its target note ("Attack · each target"), which die it uses with its value ("Uses Min (3)"), and the total in large type. Total = die value plus the mods on that effect, never below 0. Boost and Hinder also show the bonus or penalty size from the existing rules function.
   - Every checked mod starts on the first effect as a chip. Move a chip by dragging it to another effect (with the touch polyfill) or with the chip's own menu ("Move to Hinder"). The effect under a dragged chip shows a dashed `--ui-accent` border.
   - Buttons: Confirm and Back.
3. **Resolve**
   - Solo: "Tell the table", one line per effect with its icon ("Deal 4 damage to each target", "Hinder each target by 4: a −2 penalty").
   - Online: a target picker per effect (one or many targets, as the effect allows); the app applies the results.
   - Follow-ups that change this hero appear here: add a Hinder's penalty to yourself if you were the target; choose a new form or mode when the ability says to change; add a minion from Make Minion; gain hero points from a principle.
   - For a Minion Maker, Boost and Hinder results can also be given to one of their own minions, even in solo play (Upgrade Minion boosts a minion; an enemy's Hinder can land on one). The mod goes onto that minion's list.
   - Done records the roll as the latest history card, removes the non-persistent mods it used, and shows a toast: "Roll recorded. Used up: Smoke in the air, Head start." with Undo for about ten seconds. Undo restores the mods, history and anything the roll changed.

Cancel is available at every step and changes nothing.

### Forms and modes in Play

- The Form or Mode card shows the current one's name in large type with its zone chip, then every option as a radio row (name, zone chip). Players can pick any option at any time. Options whose zone is more severe than the effective zone carry a muted "Normally needs Yellow" note but stay selectable.
- Under the list: the current option's dice changes, what isn't available, and its restriction, as on the Sheet card.
- The active form or mode sets the effective dice, adds its own ability to its zone band, and applies its restriction through the availability function.
- When the hero's zone becomes less severe than the active option's zone (healed from Yellow to Green while in a Yellow mode), the hero stays in it and keeps its dice and its own ability, but other abilities of that zone lock. A notice under the list says so.
- Abilities that change form or mode (Switch, Quick Switch, Change Forms, Surprise Shift, Emergency Switch, Emergency Change) offer the picker in their Resolve step.
- **Divided:** a full-width Civilian/Heroic segmented control, with the transition method as a one-line reminder under it ("Controllable: you choose when to change, but it takes time"). Switching swaps the personality and status dice when the hero took a second personality, and the card lists what isn't available in this form. Transform flips the control. The app never forces or blocks a change.

### Play on a phone

- **Sticky top bar:** name, current Health large with the zone chip, the status die icon, and hero points; under it −1 and +1 buttons and "Scene Green · you Yellow".
- **Tabs:** Actions (basic actions in a three-column grid, then the ability bands as compact rows of icons, name, and Use or reason; tapping a name expands its text), Status (scene, form or mode, mods, twists, reaction, dice, minions), and History.
- **Roll:** a full-screen sheet with the same three steps and a sticky footer for the step's buttons. Mods move with their menu; dragging also works.

## Acceptance checklist

- [ ] One page per character; switching Sheet and Play keeps scroll and state, and Play hides Roleplaying or About.
- [ ] Section order is Roleplaying, Mechanics, Abilities, then forms or modes.
- [ ] Every die is an icon with `alt`; every listed ability shows its action icons before its name.
- [ ] Principle abilities appear in the Green band.
- [ ] The Modular test hero's modes show only changed, added and dropped dice; Bombardment shows Fire, Agility and Speed raised and Cold and Cosmic dropped.
- [ ] The Divided test hero shows Both, Civilian and Heroic columns, two personalities, and Fast Fingers under Heroic.
- [ ] The test villain shows the Overlord status table, the health breakdown, and abilities grouped by Bully, Overlord, Mook Squad and Master of Conquest.
- [ ] Empty roleplaying fields don't render.
- [ ] Export menu in the header; the old export block is gone.
- [ ] The PDF in both paper sizes matches the sheet, prints light, and never splits a card or ability row.
- [ ] Layout works at 1440, 1024 and 390 px wide, in both themes.
- [ ] Play: Health, scene, hero points, reaction, mods, twists and form changes all log to history, and none of them is ever blocked.
- [ ] Play: the status die and ability availability follow the more severe of the hero's zone and the scene; in an online game the scene is read-only.
- [ ] Play: every unusable ability shows the reason from the availability table, and the first matching rule wins.
- [ ] Roll: default mods are the largest exclusive penalty plus all non-exclusive penalties; never more than one exclusive bonus and one exclusive penalty.
- [ ] Roll: mods start on the first effect and move by drag or by menu; totals update live and never go below 0.
- [ ] Roll: Done uses up non-persistent mods, records the latest roll, and Undo restores everything.
- [ ] Modes: the Modular test hero can switch to any mode at any time; healing back to Green while in Bombardment Mode keeps Bombardment's dice and ability and locks Quick Switch.
- [ ] Minion Maker: Make Minion adds a minion sized from the roll; Use rolls the minion's die with its own mods for its one action (any basic action if Autonomous); a Boost can be given to a minion; shrinking a d4 minion removes it.
- [ ] Phone: top bar, three tabs, and the roll as a full-screen sheet.
