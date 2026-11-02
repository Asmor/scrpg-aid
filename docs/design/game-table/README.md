# Game table design handoff

The game table: one page for GM, players and observers, with a private side panel (the GM screen, or the player's hero), plus the display view for a TV and the connection flows. Start with `spec.md`; it is the source of truth and says which phase each part belongs to. Theme tokens and icon rules come from `../hero-wizard/spec.md`; library behavior from `../library/spec.md`.

| File | What it shows |
| --- | --- |
| `spec.md` | Game document, scene tracker, what's on the table, turn order and turn-start effects, layout, GM screen, player panel, connecting and per-audience projections, display view, phone, Send/Receive, phases, acceptance checklist |
| `table-desktop.dc.html` | The table at desktop width. A mockup-only switch in the header shows it as GM, Player or Observer. Working: scene tracker (GM clicks), handing off (the environment's turn advances the tracker; a hero's turn clears their reaction), Reveal, What players see, Run, minion Shrink/Remove with the per-die summary, challenge steps, the hero ⋯ menu, quick add (minion dialog), Bring in and Notes tabs |
| `display-1920.dc.html` | The observer display at 1920×1080 |
| `table-phone.dc.html` | A player on a phone: Table and hero tabs, Your turn bar |
| `connect.dc.html` | Play together (not in a game), the GM's Invite panel, Join as a player, Watch a game, and Send |
| `player-states.dc.html` | The player's side of the play-state model: standalone Play (solo game, Start over), the hero picker on rejoin, the first-join note and panel ⋯, the sheet-changed prompt, waiting, the GM's answer, the offline cached view, and pending, reconnecting and rejected actions |
| `gm-sync.dc.html` | The GM's side: the hero card with a pending request, the Requests section, the review dialog with changes and adjustments, the villain ⋯ with Update from library, and its dialog |

The mockups come from a design canvas and won't run as pages on their own; `../hero-wizard/README.md` explains the format. In the desktop mockup the Running panel always shows Gravelord's numbers; the real one shows whatever is selected. Names in the mockups are placeholders.
