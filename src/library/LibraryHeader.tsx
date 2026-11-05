/**
 * The library's header bar (docs/design/library/spec.md, "Page layout"): the app's name, the
 * Library | Games section tabs, Play together (host, join, or the game you're in), the color scheme
 * switch, Settings (which holds backups and importing, and carries the backup reminder) and About.
 * On phones, those last three share one menu, and the section tabs sit under the bar. The Games
 * page shares the header.
 */
import { gamePath, gamesPath, joinPath, listPath, receivePath, settingsPath, tablePath, watchPath } from '../app/route'
import { useState } from 'react'
import { AboutButton, AboutDialog } from '../components/About'
import { SettingsLink } from '../settings/SettingsLink'
import { ThemeToggle } from '../components/ThemeToggle'
import { useHostSnapshot, useSession } from '../session/context'
import type { ThemePreference } from '../theme/theme'
import { PopoverDialog } from './Popover'
import { usePopover } from './popover-state'
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

/** What Play together shows: no game, hosting, playing in one, or watching one. */
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
  if (session.watching) {
    return { kind: 'watching' as const, room: session.watching.room, stop: session.stopWatching }
  }
  return { kind: 'none' as const, lastGame: session.lastGame }
}

const players = (n: number) => (n === 1 ? '1 player connected' : `${n} players connected`)

export function PlayTogether({ heroName, now, compact = false }: { heroName: (id: string) => string | undefined; now: Date; compact?: boolean }) {
  const [popover, bindPopover] = usePopover()
  const game = useGame(heroName)
  const inGame = game.kind !== 'none'
  const label = game.kind === 'watching' ? `Watching · ${game.room}` : inGame ? `In game · ${game.room}` : 'Play together'
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
              <a className="button" href={watchPath()}>
                Watch a game
              </a>
              <p className="popover__hint">Show the table on a TV or second screen. No hero needed.</p>
              <ReceiveOption />
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
          {game.kind === 'watching' && (
            <div className="popover__stack">
              <p className="popover__line">This screen is watching {game.room}</p>
              <a className="button button--primary" href={watchPath(game.room)}>
                Open the display
              </a>
              <button
                type="button"
                className="button"
                onClick={() => {
                  popover.close()
                  game.stop()
                }}
              >
                Stop watching
              </button>
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
          {game.kind !== 'none' && (
            <div className="popover__stack">
              <ReceiveOption />
            </div>
          )}
        </PopoverDialog>
      )}
    </span>
  )
}

/** Receive (docs/design/game-table/spec.md, section 15), set apart from the game options. */
function ReceiveOption() {
  return (
    <>
      <hr className="popover__divider" />
      <a className="button" href={receivePath()}>
        Receive
      </a>
      <p className="popover__hint">Get heroes, villains or other items someone is sending you.</p>
    </>
  )
}

/** The phone's header menu: the color scheme, then Settings and About. */
export function PhoneMenu({ remind = false, theme, setTheme }: { remind?: boolean; theme: ThemePreference; setTheme: (t: ThemePreference) => void }) {
  const [popover, bindPopover] = usePopover()
  const [about, setAbout] = useState(false)
  const label = `Menu: color scheme, settings, about${remind ? '. Backup reminder' : ''}`
  return (
    <span className="popover-anchor">
      <button ref={bindPopover} type="button" className="icon-button" aria-label={label} aria-haspopup="dialog" aria-expanded={popover.open} onClick={popover.toggle}>
        <MenuIcon />
        {remind && <span className="dot" aria-hidden="true" />}
      </button>
      {popover.open && (
        <PopoverDialog popover={popover} label="Menu" className="popover--sheet">
          <ThemeToggle value={theme} onChange={setTheme} />
          <hr className="popover__divider" />
          <div role="menu" aria-label="About" className="popover__menu">
            <a role="menuitem" className="menu-item" href={settingsPath} onClick={popover.close}>
              Settings
            </a>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                // Focus goes back to the menu button first, so it returns there when About closes.
                popover.close()
                setAbout(true)
              }}
            >
              About
            </button>
          </div>
        </PopoverDialog>
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
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
  /** It's been a while since a backup: Settings says so. */
  remind?: boolean
  heroName: (id: string) => string | undefined
  now: Date
  section: 'library' | 'games'
  gameCount?: number
}

export function LibraryHeader({ phone, theme, setTheme, remind = false, heroName, now, section, gameCount }: HeaderProps) {
  return (
    <>
      <header className="app-header library-header">
        <a className="library-header__name" href="#/">
          SCRPG Aid
        </a>
        {!phone && <SectionTabs section={section} {...(gameCount !== undefined ? { gameCount } : {})} />}
        <span className="library-header__actions">
          <PlayTogether heroName={heroName} now={now} compact={phone} />
          {phone ? (
            <PhoneMenu remind={remind} theme={theme} setTheme={setTheme} />
          ) : (
            <>
              <ThemeToggle value={theme} onChange={setTheme} />
              <SettingsLink remind={remind} />
              <AboutButton />
            </>
          )}
        </span>
      </header>
      {phone && <SectionTabs section={section} className="section-tabs--phone" {...(gameCount !== undefined ? { gameCount } : {})} />}
    </>
  )
}
