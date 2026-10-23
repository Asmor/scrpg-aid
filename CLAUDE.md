# CLAUDE.md

## Project

A progressive web app for creating, editing, saving, sharing, and exporting (PDF, Markdown) content for the **Sentinel Comics RPG**: heroes, villains, lieutenants & minions, and environments. It must be responsive and have unit test coverage that is as complete as practical.

`GOAL.md` is the source of truth for scope and phases. It is still being written; when it is silent or ambiguous about something, ask rather than guess. Work one phase at a time, in order, and don't start a later phase without being asked.

## Layout

- `sources/`: the rulebook PDFs (Core Rules, Creating Heroes Quick Reference). Gitignored because they're copyrighted. Never commit them or copy them into the repo.
- `data/`: rules data extracted from the PDFs (Phase 0). The app reads its rules from here. See `data/README.md` for file layout and conventions.
- `scripts/validate_data.py`: validates everything in `data/` (stdlib Python 3, no dependencies).
- `GOAL.md`: project goals and phases.

No tech stack has been chosen for the app yet. Once one is, record it here along with the commands to install, run, test, lint, and build.

## Commands

- Validate rules data: `python3 scripts/validate_data.py` (must pass before any change to `data/` is done)

## Rules data (`data/`)

- Capture **mechanics**: processes (character creation flow, HP calculation, etc.) and content (archetypes, origins, powers, qualities, abilities, principles, etc.).
- Scope is the whole Core Rules, but only what's needed to **make** things: heroes, villains, lieutenants & minions, environments. Do not capture pre-made characters, villains, or environments from the book.
- Format: **JSON** for game content (checked by `scripts/validate_data.py`; extend it when you add new structures or files); **Markdown** in `data/rules/` for distilled processes (creation flow, HP, etc.).
- Every entry gets a **page reference** using the **printed page number** in the Core Rules, not the PDF page index, so players can find it in the physical book.
- `Creating_Heroes_Quick_Reference.pdf` is pages copied out of the Core Rules. Use it as a guide only; always cite the Core Rules page.
- Copy text verbatim only if it would appear verbatim on a character sheet (e.g. ability text). Rewrite explanations of how to play in your own words. Leave out flavor text and prose.
- Use one structure and one naming convention across all data files, and make sure every file parses.

## Code conventions

- Drive game rules from `data/`. Don't hardcode mechanics in UI components.
- Keep rules logic (calculations, validation, creation-step state) in pure, UI-independent modules so unit tests can cover it.
- Saved and shared content needs a versioned format. If you change the format, keep old saves loading or add a migration.
- The UI must work at phone width, and once loaded the app should keep working offline.

## Definition of done

A change is **not done** until the `code-reviewer` sub-agent (`.claude/agents/code-reviewer.md`) has approved it:

1. Finish the change and run the tests yourself.
2. Ask the `code-reviewer` agent to review it. Tell it what the change was meant to do.
3. If it returns `CHANGES REQUESTED`, fix every blocking finding and have it review again. Repeat until it returns `APPROVED`.
4. Only then call the work complete. When you do, give the reviewer's verdict and mention any nits you chose not to fix.

Don't skip the review or call a change done while a blocking finding is still open, however small the change.
