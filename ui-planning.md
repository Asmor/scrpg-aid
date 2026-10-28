Claude Code: Do not read this document. It is for human use.

## Usage scenarios

### Building a character

User just wants to build a character and then print out a sheet.

### Play aid for single player

User wants to use application as a replacement for a character sheet at the table, without connecting to other players.

### Play aid for GM

User wants to use application for managing a game, without connecting to other players.

### Play aid for group

All members of a group (GM and players) want to use application for tracking everything.

- GM is the host
- Players are clients
- Connection is based on an 8-character room code and optionally a password
- Actions are modeled fully within the application, and you can target the effects
  - e.g. You make an attack, and the result dialog includes selecting who each effect affects
    - Note: Most effects will have a single target, but there are effects which can have multiple targets

## Screens

### Main Screen

Manage all the content

### Create flow

A wizard which takes you through the steps of character creation

### Edit flow

Essentially just re-opening the create flow but with stuff already filled in

### View character

Base on the layout of the official character sheet, which I will provide as a PDF.

Assume there may be arbitrarily many:

- Blocks of powers of a single color
- Text
- Headers

### Play character

- Track
  - Current HP
  - Powers / Qualities / Status dice
  - Reaction (boolean; used or not)
  - Bonuses and penalties
    - Each has a name
    - Each can be flagged persistent and/or exclusive
  - Twists
  - Hero points
  - Back issues & Collections
- Abilities
  - With some exceptions, abilities generally roll three dice; a power die, a quality die, and a status die.
    - You can always take a d4 in place of choosing a power or quality.
  - Can use any ability or basic action
  - Basic actions: Attack, Defend, Boost, Hinder, Overcome
    - Basic actions need you to pick power AND quality
  - Abilities will usually have either a fixed power or a fixed quality, and you must select the other.
  - When using an ability or basic action, you can apply mods:
    - Each roll may use at most one exclusive bonus and at most one exclusive penalty
      - If there are one or more exclusive penalties, default to the largest exclusive penalty being selected. But it may be changed or removed.
    - All non-exclusive penalties are turned on by default.
    - Each mod applies to a single die in the roll.
    - Applying mods:
      - After rolling, you'll have three effect dice; Min, Mid, and Max.
      - There will be one or more effects which apply to specific dice.
        - e.g. "Attack using Mid"
      - If there's only one effect, all selected mods apply to that effect's die.
      - If there are multiple effects, the mods are all applied to the first effect and may be dragged-and-dropped on other effects.
        - Worth noting: Using a polyfill to allow for drag and drop on mobile
  - When using an ability or basic action, you can apply the effects
    - Note: All applications which apply to other characters are only handled in a networked session.
      - When playing without connecting to other players, the result is simply stated and the player would communicate that result to the table.
    - Attack: Select a target to take the damage
    - Defend: Select a target to be defended
    - Boost: Define the bonus and choose who to give it to
    - Hinder: Define the penalty and choose who to give it to
    - Overcome: Used in a wide variety of creative ways which aren't suited to automation. However, one potential use is to check off a box in a challenge, so that should be an option.
- Omit the RP stuff (description, archetypes etc, principal definitions)
  - Should be easy to swap back and forth between "view" and "play" without losing context or state to check that stuff as needed

### Play online

This is the most complicated scene. Would like to go for a responsive view which can take advantage of wider screens but still works well on narrow screens

Will need to be able to display and interact with:

- Initiative
  - It's popcorn initiative.
  - Not ordered.
  - All that matters is who hasn't yet gone this round.
  - GM selects who goes first in first round.
  - After that, each person chooses who goes next at the end of their turn.
  - Groups of minions and lieutenants act as a single character for the purpose of initiative.
  - Environment also acts as a character for initiative.
  - Players control their own PCs, GM controls everything else.
- Game state
  - Scene tracker
  - Challenges
  - "Active" and "Open" villains, leiutenants, and minions (see below)
- (GM only) GM control screen
  - add and remove villains, leiutenants, minions, and challenges
  - Mark villains, lieutenants, and minions visibility:
    - "Staged" - Not visible to players, not in initiative list
    - "Active" - In the initiative list. Players can see:
      - Name
      - Type (villain, lieutenant, minion)
      - Personal status (villain only)
      - Die size (lieutenant and minion)
    - "Open" - Players can see all information about the character
- (Player only) Your character
- Other players' characters
- History
  - In particular, the most recent roll by anyone should always be displayed prominently
    - Maybe even a toast when someone rolls?
  - History includes other events as well, like gaining and losing health.
