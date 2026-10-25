A progressive web app for creating characters for the Sentinel Comics RPG

## Features

- Create, save, share, and edit various types of content
  - Heroes
  - Villains
  - Lieutenants & Minions
  - Environments
- Export content
  - PDF
  - Markdown
- Responsive design
- Unit test coverage as complete as possible

## Phases

### Phase 0: Data extration **(Complete)**

First, let's get all of the relevant data out of the PDF and into another format which is easier to work with. Markdown, json, yaml, whatever.

- Capture...
  - Mechanical processes
    - Character creation flow, how to calculate HP, etc
  - Mechanical content
    - Archetypes, origins, abilities, powers, qualities, etc
    - Capture page reference for each!
- Do not capture...
  - Prose, descriptions, etc
  - Good rule of thumb: If it wouldn't be written ver batim on a character sheet, it shouldn't be captured ver batim.
    - So ability descriptions, capture
    - Descriptions of how to play the game: do _not_ capture; _distill_. Rewrite in your own words

Output should be kept in `data/`.

### Phase 1: Hero creation

- Create, save, edit, and view a hero
- All options in core rules are implemented
  - Note that some archetypes can be particularly complicated and/or work fundamentally differently than others.
  - Notably, the Divided and Modular archetypes.
  - The Minion Maker also has some unique requirements.
  - This list may not be exhaustive.

### Phase 2: Export & Import

- Export
  - PDF
  - Markdown
    - Should look good both in plain text and rendered
    - Markup only, no HTML
    - Include JSON for importing character at end of the markdown, inside an HTML comment (exception to the "no HTML" rule)
  - HTML
    - Include JSON payload for importing the character in the HTML (e.g. in a script tag or a comment)
  - JSON
- Import
  - JSON
  - HTML
  - Markdown _maybe_
    - Only if it's easy to make the markdown readily importable without sacrificing readability in both plain text and rendered states

### Phase 3: Game aid

- A mode to assist users in tracking their game state
  - Keep track of and apply bonuses and penalties
  - Click on abilities to use them
    - Note: Abilities will usually have one specific power or quality, and then a choice for the other category. And the status die, of course.
    - See raw dice rolls as well as results.
      - Example line for one of the dice: "Min: 4 (Nuclear d8)"
      - Example effect: "Deal 4 (min) damage."
    - Select mods to apply to the roll
      - Unless an ability says otherwise, any given roll may use at most one exclusive bonus and one exclusive penalty
      - Each mod affects a single die
      - Bonuses are always optional
      - Penalties are mandatory
      - Non-persistent mods are removed after use
      - Some abilities may bend these rules, such as letting you use multiple exclusive bonuses.
    - Also note that there needs to be a way for characters to take basic actions without selecting an ability
    - Process is probably something like this:
      - Click ability
      - Modal pops up
        - Make choices as necessary
        - Non-exclusive mods are displayed as checkboxes
          - All penalties checked by default, but can be unchecked
          - Persistent bonuses are checked by default, but can be unchecked
        - Exclusive mods are displayed as radio buttons
          - Largest exclusive bonus and penalty are each selected by default
          - Include a "none" radio button for both types
        - Player clicks "Roll" button
        - Dice rolls are shown
        - Chosen mods are assigned to effect dice
          - If there's only one effect die, automatically assign chosen all mods to it and don't allow changing
          - If there's more than one effect die, default to all mods on the largest effect die and allow drag-and-drop to move them around
        - Player clicks "confirm"
        - Result is shown, history is written
- Timestamped history
  - Timestamp less than an hour: Use relative ("3 minutes ago")
  - Timestamp ≥ 1hr, < 1 day: Write time according to user's time zone and locale ("3:12pm", "15:12")
  - Timestamp ≥ 1 day: Write the full time stamp including date and time formatted per user's locale
  - Track all changes
    - "Lost 4 HP (17 -> 13). Entered Yellow status."
    - "Used ability <name>:"
      - With roll and effects
    - "Gained '-3 tied up' penalty"

### Future plans

- Peer-to-peer
  - Trystero or similar
  - Allow players to see each others' rolls and such
- Villains
- Minions & Lieutenants
- Environments
- GM mode?
