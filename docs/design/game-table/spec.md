# Game table spec

The game table is where a game is run. **It's one page for everyone**: a shared center (the scene, turn order, heroes, opposition and log) that looks the same to the GM, the players and anyone watching, plus a private side panel:

- **The GM** gets the GM screen.
- **A player** gets their own hero's controls.
- **An observer** gets no panel.

It replaces the current GM page and table views (`session/GmPage.tsx`, `session/TableViews.tsx`, `session/PlayerPanel.tsx`) and extends the session protocol in `session/`.

Theme tokens, fonts, icons and dice rules come from `../hero-wizard/spec.md`. Library behavior comes from `../library/spec.md`. Mockups are listed in `README.md`. Where a mockup and this spec differ, follow the spec.

**Build in phases** (section 17). Each phase is usable on its own.

## 1. The play-state model

**The game owns all play state.** The game, on the GM's device, is the single source of truth for everything that happens in play.

- **Library documents are sheets only.** Hero and villain documents hold no Health, mods, twists, hero points, reaction, history, minions or current form. Existing play state on saved characters is dropped. There is no migration.
- **Every character in play is a copy inside a game.** Joining copies the player's hero sheet in. The GM bringing in a villain copies its sheet in. The same character can sit in several games with separate state.
- **Standalone Play is a game too.** A hero's or villain's Play page outside any game uses a personal **solo game** for that character, created on first use (section 12).
- **Players act by sending each action** to the GM's device, which validates it, applies it and sends the result to everyone (section 10).
- **Players cache what they're allowed to see.** They can open a game later without the GM connected, read-only (section 11).

## 2. Words used here

- **Game:** a document on the GM's device holding one table's state: scene, tracker, turn order, the copied sheets and play state of every character on the table, private notes and the log.
- **Roles:**
  - **GM:** owns the game, hosts it, can change anything.
  - **Player:** joins with one hero, acts for that hero and hands off on its turn.
  - **Observer:** joins with no hero, sends nothing, sees what players see.
- **Actor:** anything with a turn-order entry. Each hero is one. So is each villain, each GM-controlled group of minions, each group of lieutenants, and the environment.
- **Sheet:** a character's build, everything the wizard makes. **Play state** is everything that changes during play.
- **Template:** a minion group, lieutenant group, challenge or environment from the library. Each one brought in starts fresh.

## 3. The game document

- Stored on the GM's device in a `games` store with the usual versioned envelope, `updatedAt` and `tags`.
- **Games are not library rows.** They have their own **Games** page at `#/games`, reached from the header tabs (Library | Games, with a count). Mockup: `../library/games-desktop.dc.html`.
- **The table works without hosting.** Opening a game shows the full GM table at once. Hosting (section 10) adds people to it.

### The Games page

- **Title row:** "Games", a search box (by game name), a switch (All / You run / Joined), and **New game** (primary).
- **Two sections,** "You run" and "Joined", each a grid of cards: 3 columns on desktop, 2 on tablets, 1 on phones. A section with no games is hidden. With no games at all, an empty state offers New game and Join as a player.
- **A game you run** shows:
  - **Name**, and a status pill: "Hosting · 3 connected" (accent, with a live dot), "Not hosting", or "Not started" when `round` is 0.
  - **Scene:** its name, "Round 2", and who's acting, then a small read-only scene tracker.
  - **Heroes:** chips with hero name and player name. "No one has joined yet." when empty.
  - **Opposition:** names of villains, groups and challenges, plus "· 2 hidden" or "· all hidden".
  - **Tags.** Games keep tags (for campaigns), edited from the card's ⋯.
  - **Footer:** "Played 1 hour ago" or "Edited 2 days ago", then **Run** (primary), then **Invite** while hosting or **Start hosting** otherwise, then ⋯: Rename, Tags, Duplicate (a fresh copy of the setup with round 0, a full tracker, no players, and characters at fresh play state), Export, Delete….
  - A dashed **New game** card ends the section.
- **A joined game** is cached on a player's device (section 11). It shows:
  - name and "GM: Sam · you play Duality"
  - your hero's zone chip and Health from the cache
  - scene and round
  - the other heroes
  - tags
  - a pill: "Live" when the GM is connected, "GM offline" otherwise
  - **Footer:** "As of Oct 28, 9:42 PM" when offline, then **Open** (primary), then ⋯: "Leave and remove from this device…".
  - Hidden things never appear, since players never receive them.
- **Solo games aren't on this page** (section 12).
- **Cards are sorted** by most recently played or edited. Search filters by name and keeps the sections.

```ts
interface Game extends LibraryDoc {
  name: string
  solo?: { kind: 'hero' | 'villain'; sourceId: string }  // set for a character's solo game
  scene: { name: string; tracker: Zone[]; position: number }
  environment?: EnvironmentOnTable
  round: number                       // 0 before the first round starts
  turn: { order: ActorRef[]; acted: ActorRef[]; current?: ActorRef }
  heroes: HeroInGame[]
  villains: VillainInGame[]
  groups: NpcGroup[]                  // GM minions and lieutenants
  challenges: Challenge[]
  pendingSyncs: SyncRequest[]         // section 8
  notes: string                       // private to the GM
  feed: FeedEntry[]
}
type ActorRef = { kind: 'hero' | 'villain' | 'group' | 'environment'; id: string }
interface Visible { hidden: boolean }  // hidden = staged; players and observers never receive it
interface CharacterInGame {
  id: string                          // id within this game
  sourceId: string                    // the library document it was copied from
  sheet: Hero | Villain               // the copied sheet (build only)
  play: PlayState                     // Health, mods, twists, hero points, reaction, form/mode, minions, history
}
interface HeroInGame extends CharacterInGame { player?: { clientId: string; name: string } }  // no player = the GM's own hero
interface VillainInGame extends CharacterInGame, Visible { playersSee: 'name' | 'status' | 'health' }  // default 'status'
interface NpcGroup extends Visible { id: string; kind: 'minions' | 'lieutenants'; name: string; members: NpcMember[] }
interface NpcMember { id: string; die: Die; mods: PlayMod[] }
interface Challenge extends Visible { id: string; name: string; steps: boolean[] }
interface EnvironmentOnTable extends Visible { id: string; name: string }
```

- **Play state moves off the documents.** `PlayState` is today's play state, moved off the hero and villain documents and into `CharacterInGame.play`. The Play logic (`play/`, `villain/play.ts`) takes a sheet and a play state, not a document.
- **Field names are a guide.** Keep the shapes: a copied sheet plus play state per character, hidden on every opposition item, `playersSee` on villains, members with their own die and mods.

## 4. The scene

- **Tracker:** a row of boxes in game colors, with the current box outlined and dotted. Past boxes are faded. The **scene zone** is the current box's zone and feeds the "scene or personal, whichever is more severe" rule for every character in the game.
- **It advances automatically when the environment's turn starts** (section 6), one box per turn. The log records it: "The scene tracker moved to Yellow 1".
- When the tracker is already on its last box, advancing doesn't move it. The log says "The scene tracker has run out."
- **The GM can correct it** by clicking any box. Everyone else sees it read-only.
- **Scene setup** (GM, from the scene card's ⋯): rename the scene, set the box counts per zone (Green, Yellow, Red, each 0–10), and reset the position to the first box. A new game starts with 3 green, 3 yellow and 2 red boxes at the first box.
- The environment's name shows under the scene name once it's revealed.

## 5. What's on the table

### Heroes

- **Each joined player's hero** is a copy in the game (section 7). The GM can also bring in one of their own heroes from the library; it's copied the same way and has no player.
- **The card shows:**
  - name and player name
  - zone chip, Health "18 / 30" and a Health bar in the zone's color
  - the status die icon
  - mods as chips, and player-made minions as chips ("Drone d8")
  - "Reaction used" while it is
  - "Disconnected" while the player is away
  - "Sheet update requested · Review" while a sync request waits (GM only, section 8)
- **The GM's ⋯ on a hero card** changes the game's copy directly and logs it:
  - Change Health…
  - Give a bonus or penalty…
  - Add a twist…
  - Mark reaction used or unused
  - Remove from the game…

  The player sees the result like any other change.

### Villains

- **Copied in** when the GM brings them in. Damage stays in this game. The same villain can be in several games at once, each with its own state.
- **Update from library…** is in the villain card's ⋯ (section 9).
- Each villain has **What players see**, from the eye button on its card (GM only):
  - **Name only:** players see the name and kind. Instead of a status they see "The GM is keeping its condition secret". Mods are hidden.
  - **Status** (default): plus the zone chip and mods.
  - **Status and Health:** plus Health.

  The GM always sees everything, plus the status die icon.

### Groups of minions and lieutenants (GM-controlled)

- **A group** has a name, a kind (minions or lieutenants) and members. Members start the same size, then change one by one.
- **Summary row:** one die icon and count per die size, largest first ("[d6] × 2 [d4] × 1"). Use die icons, with the size as alt text.
- **Show each / Hide each** lists every member: its die icon, its label ("Minion 2"), and its mods as chips. Everyone sees this list, read-only for players and observers.
- **GM per member:** + Mod, and **Shrink**, which drops one die size. On a d4 the button becomes **Remove**. Removing the last member removes the group and its turn-order entry, and the log says so.
- **Minions a player makes** are part of that hero's play state, shown on the hero card. They act on the hero's turn and have no turn-order entry.

### Challenges

- Name and a row of step checkboxes, with "1 of 3 done". The GM checks steps. Everyone else sees them read-only.

### Hidden items (staging)

- Everything the GM brings in or quick-adds starts **hidden**. On the GM's table a hidden item has a dashed border, a "Hidden from players" badge and **Reveal**. A revealed item's menu has "Hide from players".
- **Hidden items are never sent to players or observers** (section 10).

## 6. Turn order (popcorn, tracked by the game)

- **Actors:**
  - each hero
  - each villain
  - each GM-controlled minion group and each lieutenant group (one entry per group)
  - the environment

  An actor enters the order when it's revealed and leaves it when removed.
- **Starting:** while `round` is 0, the GM's turn card shows "Start round 1" and picks who goes first.
- **Handing off:**
  - Whoever is acting picks who's next, among actors that haven't acted this round, from **Hand off to…**.
  - The player controlling the current hero can hand off. The GM can always hand off, for anyone (the button reads "Hand off for Gravelord").
  - Hidden actors don't appear to players and can't be picked by players.
- **Ending a round:** when nobody is left, **Hand off to…** offers "End round; start round 3" and then asks who starts the new round (any actor, including the current one). `acted` empties and `round` goes up.
- **When a turn starts:**
  - **The actor's reaction is cleared**, for that character only (not at round start). The game's state changes directly.
  - **When the environment's turn starts, the scene tracker advances** (section 4).
  - The log records the handoff.
- **The strip** shows actors in the order they acted this round, then the current actor (accent border, "acting now"), then the rest in a fixed order: heroes, villains, groups, environment. Acted actors are muted with a check. On phones the strip scrolls sideways.
- **A player whose hero is up** sees a "Your turn" bar at the top of the page, with Hand off to… and "Your reaction is ready again" when it was just cleared.
- **The GM can fix mistakes** from the turn card's ⋯: set who's acting, mark an actor as acted or not acted, and set the round number.

## 7. Joining with a hero

- **Join as a player:** the game code, then **Bring a hero** lists the player's library heroes. A hero already in this game shows "in this game since Oct 30" and the button reads **Rejoin with Maya Reyes**. Otherwise it reads **Join with Maya Reyes**.
- **First join:** the player's device sends the hero's sheet, and the GM's device copies it into the game with fresh play state (Health at max).
- **The first time a player sees their panel in this game,** a note explains: "Maya Reyes is in Thursday game. The game keeps her Health, mods and everything else in play. Your library sheet doesn't change." It has a Got it button and shows once per hero per game.
- **From then on, the player panel shows the game's copy.** It's labeled "My hero · game's copy". The player's library hero isn't used during play.
- **The player panel's ⋯:**
  - Update from my sheet… (section 8)
  - Open my library sheet
  - Leave game

  Leaving keeps the hero in the game as disconnected. The GM can remove it.
- **In the library,** a hero or villain row shows which games it's in (see `../library/spec.md`).

## 8. Syncing a changed hero sheet

**Detecting a change.** On rejoin, and from "Update from my sheet…", the player's device compares its library hero's sheet with the game's copy. It compares the build itself, normalized; timestamps and play state don't count. Write it as a pure, tested `sheetDiff(a, b)`. It returns readable changes in sheet terms, grouped by section:

- dice changes ("Speed d10 → d12")
- abilities added, removed or changed ("New: Blinding Strike (Yellow)")
- qualities and powers added or removed
- principles
- forms and modes added or removed
- max Health
- name
- personality and status dice

**The player's prompt** is a dialog on rejoin when the diff isn't empty, titled "Your sheet for Maya Reyes has changed". It shows:

- the changes
- one line on play state ("Health stays at 18", or the adjustments listed below)
- **Ask the GM to update** (primary) and **Keep the game's copy**

Keep closes the dialog and plays the game's copy. The player can ask later from the panel's ⋯.

**Waiting:** the player panel shows "Waiting for the GM to approve your sheet update. You can keep playing meanwhile." with **Cancel request**. One request per hero at a time. A newer request replaces the older one.

**The GM's side:**

- The request appears in three places:
  - a **Requests** section at the top of the GM screen, with a count badge, shown only while there are requests
  - a "Sheet update requested · Review" button on the hero card
  - a GM-only log line
- **Review** opens a dialog: "Update Maya Reyes to Alex's sheet?" It lists what changed on the sheet and what happens in this game (the adjustments), with **Decline** and **Approve**.
- **Approve:** the game's copy gets the new sheet, the adjustments are applied, and both are logged. The player sees a toast: "Updated. The GM approved: Maya Reyes now matches your sheet." It includes any adjustment.
- **Decline:** nothing changes. The player sees: "Not updated. The GM kept the game's copy. You can ask again from My hero ⋯."
- The game keeps its play state through a sync, subject only to the adjustments.

**Adjustments when the new sheet doesn't fit the play state.** Write these as a pure, tested `reconcile(play, newSheet)` that returns the new play state and a list of human-readable adjustments.

| Play state | When the new sheet doesn't fit | Rule |
| --- | --- | --- |
| Health | Above the new max | Lowered to the new max. A higher max never raises current Health |
| Current form, mode (Form Changer, Modular) | No longer on the sheet | Switch to the default form or mode (base form, Green mode) |
| Divided form | Always exists | Kept. Traits the form no longer has follow the new sheet |
| Player-made minions | Their form is gone | The minion stays, with its die and mods, marked "Pick a new form". It can't act until the player picks one of the current forms. Removing it stays possible |
| Minion count | Above the new limit (the quality that sets the count dropped) | Kept. The hero can't make more until under the limit. Shown as "4 of 3 minions" |
| Used-up abilities, once-per-scene uses | The ability is gone | The used flag is dropped |
| Mods, twists, hero points, reaction, the play log | Never affected | Kept |

Each adjustment shows in the review dialog before approval, in the toast and in the log.

## 9. Villain "Update from library" (GM)

- **Where it lives:**
  - the villain card's ⋯ ("Update from library…"), with a "Library sheet changed 2 days ago" line at the top of the menu when it differs
  - in **Bring in**, a villain whose library sheet differs from the game's copy shows a "Library changed" tag and **Update**
- **The dialog** "Update Gravelord from your library?" shows:
  - what changed (the same `sheetDiff`)
  - what happens in this game (the same `reconcile`)
  - "Only this game's Gravelord changes. Other games keep their own copy."
  - **Cancel** and **Update**
- Updating keeps mods, twists and the rest of play state, subject to the adjustments. It's logged.
- No approval step: the GM owns villains.

## 10. Connecting, actions and privacy

### Roles on the wire

- **Bump `SESSION_VERSION` to 2.** Peers on version 1 are told to update.
- `hello` gains a role: `{ role: 'player', clientId, heroSourceId, sheet }` or `{ role: 'observer', clientId, screenName }`.
  - The player's `sheet` is used to copy the hero in on first join, or for the diff on rejoin.
  - The GM refuses observers once a game has 20, and anything from a removed client.

### Player actions

- **Each action is its own message:** `{ v: 2, type: 'action', id, heroId, action, basedOn }`.
  - **`action`** is one of: change Health (by an amount, or set), add or remove a mod, add or remove a twist, spend or gain a hero point, mark reaction used, roll (with the dice and result, rolled on the player's device), use an ability, make, shrink or remove a minion, change form or mode, hand off, or start the next round.
  - **`basedOn`** is the game state version the player's device last saw.
- **The GM's device** validates each action against the current game:
  - it must be the sender's hero
  - the action must be allowed now (turn, zone, availability, limits)
  - a change to a number must be applied as a delta, except "set", which is rejected when `basedOn` is older than the last change to that field
- **If valid,** the GM's device applies it, logs it, bumps the state version and sends everyone their projection.
- **Every action gets a reply:** `{ type: 'result', id, ok: true }` or `{ ok: false, reason }`.
- **Sync messages:**
  - player→GM: `syncRequest { heroId, sheet }` and `syncCancel { heroId }`
  - GM→player: `syncResult { heroId, approved, adjustments }`
- **`heroChange` and the inbox for hero changes are removed.** The GM edits the game directly.
- Observers send only `hello`.

### What each audience receives

- **The GM's device keeps the full game.** After each change it sends each audience its own **projection**, a pure, tested function `project(game, audience: 'player' | 'observer')`. The projection:
  - drops every hidden item, and hidden actors from the turn order
  - drops `notes` and `pendingSyncs`
  - drops villain Health under "Status", and zone, mods and status die under "Name only"
  - drops villains' status dice
  - keeps everything heroes show, including each hero's sheet so players can open it
- **Never send a hidden or private field and rely on the UI to hide it.** Add a test that the projection has no hidden item ids, no `notes`, no `pendingSyncs`, and no Health for a villain set to Status.

### When an action is pending or the GM is unreachable

- **No optimistic changes.** Until the result arrives, the control shows the old value muted with the new one beside it ("18 → 15") and "Sending…".
- **Results:**
  - a valid result updates the value from the new state
  - **Rejected:** a toast "Not applied: <reason>" ("it isn't your turn, so you can't hand off", "your Health had already changed to 14. Check it and try again"), and the value stays as the game has it
  - **No reply within 5 seconds:** "Didn't reach the GM. Nothing changed." with Try again
- **Actions are blocked, not queued, while the connection is down.** A banner says "Reconnecting to the GM… Actions are paused", and controls that change the game are disabled.
- After 30 seconds without reconnecting, the page switches to the offline view (section 11), still retrying.

### Invite, join and watch

- **Invite** (GM header): the code in large monospace, a QR code of the player link, **Copy player link** (`#/join/K7QX-2M`) and **Copy watch link** (`#/watch/K7QX-2M`).
- The Invite dialog also lists who's connected: each player with their hero (connected or disconnected), and each observer by screen name with **Remove**. Removing a player asks first and also removes their hero from the table.
- **Watch a game:** the code and "Name this screen" (remembered on the device), then Start watching. The watching device shows the display view (section 13).
- **Play together** in the library header offers:
  - Open your GM table
  - Join as a player
  - Watch a game
  - Receive (section 15)
  - Rejoin, and the in-game states from the library spec

## 11. A player's cached game (offline)

- **What's cached:** each player's device keeps the latest projection it received for every game it has joined. It shows as a card in the Games page's Joined section. "Leave and remove from this device" only removes the cache.
- **Opening it without the GM connected** shows the table and player panel from the cache:
  - **A banner:** "The GM isn't connected. This is Thursday game as of today, 9:42 PM. Read-only until the GM is back." It has **Try to reconnect** and retries every 30 seconds while the page is open.
  - **Controls that change the game** (Health, mods, Roll, Use, Hand off, minions, form, Update from my sheet) are disabled and labeled "Needs the GM".
  - **Reading still works:** the table, the hero's sheet in the game, the log.
- When the GM connects, the banner clears and the page updates to the live state.

## 12. Standalone Play (solo games)

- **A solo game is created the first time** a hero's or villain's Play page opens outside any game. It holds one copied character, with no turn order and no tracker shown, and the scene zone set from the Play page's scene control as now.
- **It isn't on the Games page or in the library.** It belongs to the character:
  - the Play page header shows a "Solo play" chip
  - deleting the character deletes its solo game
- **The Play page's ⋯:**
  - **Start over…** asks first, then resets play state: Health to max, and clears mods, twists, hero points, minions, form and the play log.
  - **Update from my sheet** happens automatically: opening Play re-copies the sheet if it changed, applying `reconcile` and logging the adjustments. No approval, since the player owns it.
- When the character is also in other games, a line under the header says "Maya Reyes is also in Thursday game. What happens here doesn't affect that game." with a link to open that game.

## 13. Display view (observers)

See `display-1920.dc.html`.

- The shared center only, read-only, at room scale: base type about 24 px, names 38 px, the scene name 64 px, die icons 44 px.
- It fills the screen with no page scroll at 1920×1080. Sections scale down rather than scroll; up to 6 heroes and 8 opposition cards fit.
- No header controls. A footer shows the latest log line and "Watching Thursday game · K7QX-2M".
- It follows the color scheme setting, and defaults to dark when the setting is System.
- **Open display view on the GM's own device** opens `#/game/:id/display` in a new window. That window reads the GM's game through a `BroadcastChannel` (no network, no hosting needed) and applies the observer projection.

## 14. Layout

### Desktop and tablet (760 px and up)

See `table-desktop.dc.html`. Its GM/Player/Observer switch exists only in the mockup.

- **Header:**
  - ← Library
  - the game name (click to rename, GM only)
  - a status pill: "Hosting · K7QX-2M", "Not hosting" with Start hosting, "Playing as Maya Reyes", or "Watching"
  - "4 players · 1 watching"
  - GM only: **Invite** and **Open display view**
- **Body:** a wrapping row. The center is flexible (minimum about 700 px) and the side panel is 360–420 px, stacking below on narrow screens.
- **The center:**
  1. "Your turn" bar
  2. scene card
  3. turn card
  4. Heroes: 4 columns, 2 under 1100 px
  5. Opposition: 3 columns, with Run for the GM on villains and groups
  6. Table log
- The same component renders the center for all roles. Role only removes controls.

### The GM screen (GM's side panel)

The panel is headed "GM screen", with "Only you see this".

1. **Requests**, only while there are sync requests (section 8).
2. **Quick add:** + Minion, + Lieutenant, + Challenge. Each opens a small modal:
   - **Minions or lieutenants:** name, die (d4–d12), how many (1–20), hidden (on by default).
   - **Challenge:** name, number of steps (1–10), hidden (on by default).
   - **Environment:** from the scene card's ⋯: name, hidden (on by default). One per game.
   - "Save to library" saves the item as a template. Hide it until those library types exist.
3. **Running:** appears when the GM picks Run on a villain or group card. That card gets an accent outline.
   - **For a villain:** its Health with − and +, zone, Roll, + Mod, + Twist, abilities with Use, and "Open this villain's sheet".
   - **For a group:** its members with Shrink, Remove and + Mod, plus Roll for one member's die.
4. **Bring in** tab:
   - Pick a saved search, a type or All from the library, then filter by name (`library/query.ts`).
   - Each row shows Bring in, "On the table", "Hidden", "Library changed · Update", or for templates Add another.
   - **Bring in the rest (N), hidden**.
   - A note: everything is copied into this game, so damage never touches the library or other games.
5. **Notes** tab: one private text area.

### The player's side panel

"My hero · game's copy · Maya Reyes" works on the game's copy:

- Health − / + and the big number, with zone chip
- status die, hero points, reaction used
- mods, with + Mod
- **Roll**
- abilities with Use
- the ⋯ menu (section 7)

Every control sends an action (section 10). There is no "Full Play view" link in a game. The panel is the game's play view, and the hero's sheet opens read-only from the name.

### Phones (under 760 px)

See `table-phone.dc.html`.

- **Player:** a sticky top bar with ←, the game name, "Round 2 · The Foundry" and a scene zone chip. Under it, the "Your turn" bar when it's their turn, and the reconnecting or offline banner. Then two tabs: **Table** and **<hero name>**.
- **Table tab:** the tracker, the turn strip scrolling sideways, heroes and opposition as list rows with group summaries and mods inline, then the log.
- **GM on a phone:** tabs for Table, GM screen and Log. GM controls open in bottom sheets.

## 15. Sending items peer to peer

- **Send:** in the library, the row ⋯ and the bulk bar gain **Send…**. It opens a dialog listing the items with their tags and a short code, open until the other side accepts or the sender cancels.
- **Receive:** Play together, then Receive, then the code. It shows the incoming items, then **Accept** imports them through the existing import path, tags included. An item whose id already exists comes in as a copy with a new id.
- **Only sheets travel**, since library documents are sheets. No games and no saved searches.

## 16. Accessibility

- **The turn strip** is an ordered list. Each actor's state ("acted", "acting now") is in text.
- **The scene tracker** is a row of buttons for the GM ("Green 3, current", `aria-current="step"`). For everyone else it's an image with the label "Scene tracker at Green 3 of 8".
- **Live regions:** "Your turn", handoffs, action results ("Not applied: …") and the reconnecting and offline banners go to a polite live region. Hidden actors are never announced to players.
- **Disabled controls** in the offline view keep their labels and add "Needs the GM" to their accessible description.
- **The eye button** is labeled "What players see of Gravelord" and opens a radio menu.
- **Group members** are a list. Shrink and Remove name the member.
- Every dialog moves focus in and returns it. The display view has no interactive elements.

## 17. Phases

1. **The play-state model, local** (rework of the built phase 1):
   - Sheets-only library documents, and play state moved into games.
   - Solo games for standalone Play, with Start over.
   - The GM table with copied villains and the GM's own heroes, scene and tracker, turn order and turn-start effects, groups, challenges, environment, hidden and reveal, What players see, quick add, Bring in, Running, Notes, and GM hero edits.
   - `sheetDiff` and `reconcile`, Update from library for villains, the library's In games column, and the Games page (games you run).
2. **Hosting.**
   - Roles in `hello`, joining by copying the hero in, per-action messages with results, projections, the player panel on the game's copy.
   - The pending, rejected and reconnecting states.
   - Sync request, review and approval.
   - Invite with QR and links.
   - The players' cached games (the Joined section) and the offline view.
   - Replaces `GmPage` and `PlayerPanel`.
3. **Observers and display.** The watch link, observer projection and limits, Remove, the display view, and same-device Open display view over `BroadcastChannel`.
4. **Send and Receive.**

## 18. Acceptance checklist

- [x] Hero and villain documents hold no play state. Old play state is dropped on load.
- [x] A hero's or villain's standalone Play page uses its solo game. Start over resets it. Sheet changes re-copy with `reconcile`. Solo games aren't on the Games page.
- [ ] The Games page lists games you run and joined games as cards, with the contents in section 3. Run works with no hosting.
- [x] Bringing in a villain copies it. The same villain in two games keeps separate state.
- [x] Update from library shows the diff and the adjustments, and changes only that game's copy.
- [x] The tracker drives the scene zone. The environment's turn starts advance it one box and log it.
- [ ] Every opposition item starts hidden. Hidden items show dashed with Reveal for the GM and are absent for everyone else.
- [ ] What players see changes what players receive, not just what they're shown.
- [x] Groups show a per-die summary and each member's die and mods. Shrink steps down, Remove on d4, and the group leaves the turn order when empty.
- [x] Each hero, villain, GM group and the environment gets one turn-order entry once revealed. Player-made minions don't.
- [x] Hand off lists only actors that haven't acted. Round end offers the next round and picks who starts.
- [x] A turn starting clears only that actor's reaction.
- [ ] Joining copies the hero in with fresh play state. The first-join note shows once. The panel works on the game's copy.
- [ ] On rejoin, `sheetDiff` (build only) triggers the prompt. Ask, wait and cancel work. The GM sees the request in Requests and on the hero card.
- [ ] Approve applies the new sheet with `reconcile`'s adjustments, shown before approval, in the toast and in the log. Decline changes nothing.
- [x] `reconcile` follows the table in section 8, and is tested for each row.
- [ ] Every player control sends one action. The GM validates it and replies.
- [ ] A rejected action shows its reason. No reply in 5 seconds shows "Didn't reach the GM".
- [ ] While disconnected, actions are blocked with the reconnecting banner, then the offline view after 30 seconds.
- [ ] `project()` is pure and tested: no hidden items, no notes, no sync requests, no Health for Status villains.
- [ ] A player can open a joined game from the library without the GM. It's read-only, with the "as of" time.
- [ ] Invite shows the code, a QR code, and both links. Watch takes a screen name. The GM can remove an observer.
- [ ] The display view fits 1920×1080 with no scroll and no controls. Open display view works on the same device without hosting.
- [ ] Phone: the player's Table and hero tabs with the Your turn and connection banners. The GM's Table, GM screen and Log tabs.
- [ ] Send and Receive move sheets with their tags, and an existing id becomes a copy.
