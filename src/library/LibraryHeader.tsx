/**
 * The library's header bar (docs/design/library/spec.md, "Page layout"): the app's name, the
 * Library | Games section tabs, Play together (host, join, or the game you're in), Data (backup,
 * import, the example hero), and the color scheme switch. On phones, Data and the color scheme
 * share one menu, and the section tabs sit under the bar. The Games page shares the header.
 */
import { gamePath, gamesPath, joinPath, listPath, tablePath } from '../app/route'
import { ThemeToggle } from '../components/ThemeToggle'
import { useHostSnapshot, useSession } from '../session/context'
import type { ThemePreference } from '../theme/theme'
import { PopoverDialog } from './Popover'
import { usePopover } from './popover-state'
import type { BackupStatus } from './backup-time'
import { formatAgoInline } from './when'

const PeopleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M18.5 14.8c1.6.8 2.7 2.6 3 5.2" />
  </svg>
)

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

/** What Play together shows: no game, hosting, or playing in one. */
function useGame(heroName: (id: string) => string | undefined) {
  const session = useSession()
  const hosted = useHostSnapshot(session.hosting)
  if (session.hosting) {
    return { kind: 'hosting' as const, room: session.hosting.room, gameId: session.hosting.gameId, connected: hosted?.connected.size ?? 0 }
  }
  if (session.playing) {
    const info = session.playing.info
    return { kind: 'playing' as const, room: info.room, heroName: heroName(info.heroSourceId) ?? 'your hero', leave: session.leaveGame }
  }
  return { kind: 'none' as const, lastGame: session.lastGame }
}

const players = (n: number) => (n === 1 ? '1 player connected' : `${n} players connected`)

export function PlayTogether({ heroName, now, compact = false }: { heroName: (id: string) => string | undefined; now: Date; compact?: boolean }) {
  const [popover, bindPopover] = usePopover()
  const game = useGame(heroName)
  const inGame = game.kind !== 'none'
  const label = inGame ? `In game · ${game.room}` : 'Play together'
  return (
    <span className="popover-anchor">
      <button
        ref={bindPopover}
        type="button"
        className={compact ? 'icon-button' : 'button button--quiet'}
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        {...(compact ? { 'aria-label': label } : {})}
        onClick={popover.toggle}
      >
        <PeopleIcon />
        {!compact && label}
        {compact && inGame && <span className="dot" aria-hidden="true" />}
      </button>
      {popover.open && (
        <PopoverDialog popover={popover} label="Play together" className={compact ? 'popover--sheet' : 'popover--end'}>
          {game.kind === 'none' && (
            <div className="popover__stack">
              <a className="button button--primary" href={gamesPath}>
                Open your GM table
              </a>
              <p className="popover__hint">Run a game. Start hosting when players are ready.</p>
              <a className="button" href={joinPath()}>
                Join as a player
              </a>
              <p className="popover__hint">Bring a hero into someone's game.</p>
              {game.lastGame && (
                <p className="popover__line">
                  Last game: {game.lastGame.room}
                  {game.lastGame.at ? `, ${formatAgoInline(game.lastGame.at, now)}` : ''} · <a href={joinPath(game.lastGame.room)}>Rejoin</a>
                </p>
              )}
            </div>
          )}
          {game.kind === 'hosting' && (
            <div className="popover__stack">
              <p className="popover__line">
                You're hosting {game.room} · {players(game.connected)}
              </p>
              <a className="button button--primary" href={gamePath(game.gameId)}>
                Return to table
              </a>
            </div>
          )}
          {game.kind === 'playing' && (
            <div className="popover__stack">
              <p className="popover__line">
                You're in {game.room} as {game.heroName}
              </p>
              <a className="button button--primary" href={tablePath(game.room)}>
                Open the game
              </a>
              <button
                type="button"
                className="button"
                onClick={() => {
                  popover.close()
                  game.leave()
                }}
              >
                Leave game
              </button>
            </div>
          )}
        </PopoverDialog>
      )}
    </span>
  )
}

export interface DataActions {
  status: BackupStatus
  busy: boolean
  backUp: () => void
  importFile: () => void
  addExample: () => void
}

/** The Data menu's contents: the backup line and its three actions. */
function DataItems({ data, close }: { data: DataActions; close: () => void }) {
  const run = (action: () => void) => () => {
    close()
    action()
  }
  return (
    <div className="popover__stack">
      <p className="popover__line">{data.status.text}</p>
      <div role="menu" aria-label="Data" className="popover__menu">
        <button type="button" role="menuitem" className="menu-item" disabled={data.busy} onClick={run(data.backUp)}>
          Back up everything
        </button>
        <button type="button" role="menuitem" className="menu-item" disabled={data.busy} onClick={run(data.importFile)}>
          Import from a file…
        </button>
        <button type="button" role="menuitem" className="menu-item" disabled={data.busy} onClick={run(data.addExample)}>
          Add an example hero
        </button>
      </div>
    </div>
  )
}

export function DataMenu({ data }: { data: DataActions }) {
  const [popover, bindPopover] = usePopover()
  return (
    <span className="popover-anchor">
      <button
        ref={bindPopover}
        type="button"
        className="button button--quiet"
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        {...(data.status.remind ? { 'aria-label': 'Data: backup reminder' } : {})}
        onClick={popover.toggle}
      >
        Data
        {data.status.remind && <span className="dot" aria-hidden="true" />}
      </button>
      {popover.open && (
        <PopoverDialog popover={popover} label="Data" className="popover--end popover--wide">
          <DataItems data={data} close={popover.close} />
        </PopoverDialog>
      )}
    </span>
  )
}

/** The phone's header menu: Data's items, then the color scheme. */
export function PhoneMenu({ data, theme, setTheme }: { data: DataActions; theme: ThemePreference; setTheme: (t: ThemePreference) => void }) {
  const [popover, bindPopover] = usePopover()
  const label = data.status.remind ? 'Menu: data, color scheme. Backup reminder' : 'Menu: data, color scheme'
  return (
    <span className="popover-anchor">
      <button ref={bindPopover} type="button" className="icon-button" aria-label={label} aria-haspopup="dialog" aria-expanded={popover.open} onClick={popover.toggle}>
        <MenuIcon />
        {data.status.remind && <span className="dot" aria-hidden="true" />}
      </button>
      {popover.open && (
        <PopoverDialog popover={popover} label="Menu" className="popover--sheet">
          <DataItems data={data} close={popover.close} />
          <ThemeToggle value={theme} onChange={setTheme} />
        </PopoverDialog>
      )}
    </span>
  )
}

/** The Library | Games tabs: links, the current one marked, Games with its count. */
export function SectionTabs({ section, gameCount, className = '' }: { section: 'library' | 'games'; gameCount?: number; className?: string }) {
  return (
    <nav className={`section-tabs ${className}`} aria-label="Sections">
      <a href={listPath} {...(section === 'library' ? { 'aria-current': 'page' as const } : {})}>
        Library
      </a>
      <a href={gamesPath} {...(section === 'games' ? { 'aria-current': 'page' as const } : {})}>
        Games
        {gameCount !== undefined && (
          <span className="section-tabs__n">
            {gameCount}
            <span className="visually-hidden"> {gameCount === 1 ? 'game' : 'games'}</span>
          </span>
        )}
      </a>
    </nav>
  )
}

interface HeaderProps {
  phone: boolean
  theme: ThemePreference
  setTheme: (t: ThemePreference) => void
  /** The Data menu (backup, import, the example hero); left out while there's nothing to show. */
  data?: DataActions
  heroName: (id: string) => string | undefined
  now: Date
  section: 'library' | 'games'
  gameCount?: number
}

export function LibraryHeader({ phone, theme, setTheme, data, heroName, now, section, gameCount }: HeaderProps) {
  return (
    <>
      <header className="app-header library-header">
        <a className="library-header__name" href="#/">
          SCRPG Aid
        </a>
        {!phone && <SectionTabs section={section} {...(gameCount !== undefined ? { gameCount } : {})} />}
        <span className="library-header__actions">
          <PlayTogether heroName={heroName} now={now} compact={phone} />
          {phone && data ? (
            <PhoneMenu data={data} theme={theme} setTheme={setTheme} />
          ) : (
            <>
              {data && <DataMenu data={data} />}
              <ThemeToggle value={theme} onChange={setTheme} />
            </>
          )}
        </span>
      </header>
      {phone && <SectionTabs section={section} className="section-tabs--phone" {...(gameCount !== undefined ? { gameCount } : {})} />}
    </>
  )
}
