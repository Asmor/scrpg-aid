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
  - Note that the Modular archetype is particularly complicated and unique
