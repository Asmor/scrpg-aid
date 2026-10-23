# CLAUDE.md

## Project

A progressive web app for creating, editing, saving, sharing, and exporting (PDF, Markdown) content for the **Sentinel Comics RPG**: heroes, villains, lieutenants & minions, and environments. It must be responsive and have unit test coverage that is as complete as practical.

`GOAL.md` is the source of truth for scope and phases. It is still being written; when it is silent or ambiguous about something, ask rather than guess. Work one phase at a time, in order, and don't start a later phase without being asked.

## Layout

- `sources/`: the rulebook PDFs (Core Rules, Creating Heroes Quick Reference). Gitignored because they're copyrighted. Never commit them or copy them into the repo. **Don't open, read, render, or extract from them in any way without explicit approval from the user.**
- `data/`: rules data extracted from the PDFs (Phase 0). The app reads its rules from here, and it is the **source of truth** for game rules. See `data/README.md` for file layout and conventions.
- `scripts/validate_data.py`: validates everything in `data/` (stdlib Python 3, no dependencies).
- `GOAL.md`: project goals and phases.
- `src/`: the app. React 19 + TypeScript (strict) + Vite, with `vite-plugin-pwa` for offline support. Rules logic lives in `src/rules/` (pure, UI-independent); tests sit next to the code as `*.test.ts(x)` and run in Vitest with jsdom and Testing Library.
- Storage: heroes are saved in the browser only (IndexedDB) for Phase 1, behind a storage interface so cloud storage (Drive, OneDrive, Dropbox) can be added later.
- `.github/workflows/deploy.yml`: runs `npm run check` on every push and PR, and deploys `main` to GitHub Pages. `BASE_PATH` sets the URL prefix (`/<repo>/` on Pages, `/` locally).

## Commands

Node 22+ and Python 3 are required.

- Install: `npm install`
- Run locally: `npm run dev`
- Tests: `npm test` (watch mode: `npm run test:watch`, coverage: `npm run coverage`)
- Lint: `npm run lint` (oxlint)
- Typecheck: `npm run typecheck`
- Build: `npm run build` (output in `dist/`), preview with `npm run preview`
- Validate rules data: `npm run validate:data` (runs `python3 scripts/validate_data.py`; must pass before any change to `data/` is done)
- Everything CI runs: `npm run check`

## Rules data (`data/`)

Phase 0 is complete (the user has declared it done), so `data/` is now the source of truth for the rules. If anything in it seems missing, wrong, or suspect, **stop and ask the user**. Don't go looking for the answer yourself, whether in the PDFs, on the web, or from memory of the game, and don't fill gaps with guesses. The user decides how to fix the data, and when you are asked to change it, the guidelines below apply. Being asked to change the data does **not** mean you're approved to open the PDFs; that needs its own explicit approval.

The Core Rules is currently the only source book. More sources may be added later, so don't build anything (data structures, page references, UI) that assumes there will only ever be one book. Don't add support for other books until asked, though.

- Capture **mechanics**: processes (character creation flow, HP calculation, etc.) and content (archetypes, origins, powers, qualities, abilities, principles, etc.).
- Scope is the whole Core Rules, but only what's needed to **make** things: heroes, villains, lieutenants & minions, environments. Do not capture pre-made characters, villains, or environments from the book.
- Format: **JSON** for game content (checked by `scripts/validate_data.py`; extend it when you add new structures or files); **Markdown** in `data/rules/` for distilled processes (creation flow, HP, etc.).
- Every entry gets a **page reference**: a `book` id from `data/books.json` plus the **printed page number** in that book (not the PDF page index), so players can find it in the physical book.
- If the user approves consulting the PDFs: `Creating_Heroes_Quick_Reference.pdf` is pages copied out of the Core Rules. Use it as a guide only and always cite the Core Rules page.
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
