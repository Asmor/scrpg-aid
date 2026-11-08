/**
 * The About dialog (scrpg-aid-designs/library/spec.md, section 8a): the version and build date, the
 * credits, the Greater Than Games disclaimer, and plain links to the issues page and the repo.
 * Nothing here sends data anywhere, and the links carry nothing from the user's library.
 */
import { appVersion, buildTime, versionLine } from '../app/build-info'
import { Modal } from './Modal'

export const issuesUrl = 'https://github.com/Asmor/scrpg-aid/issues'
export const repoUrl = 'https://github.com/Asmor/scrpg-aid'

const NewTab = () => <span className="visually-hidden">(opens in a new tab)</span>

export function AboutDialog({ onClose, version = appVersion, built = buildTime }: { onClose: () => void; version?: string; built?: string }) {
  return (
    <Modal title="About SCRPG Aid" onClose={onClose}>
      <div className="about">
        <p>
          <strong>SCRPG Aid</strong> <span className="muted">{versionLine(version, built)}</span>
        </p>
        <p>A game aid for Sentinel Comics: The Roleplaying Game.</p>
        <p>Created by Asmor (Ian Toltz) with assistance from Claude.</p>
        <p>Not associated with or endorsed by Greater Than Games.</p>
        <div className="about__links">
          <a className="button button--primary" href={issuesUrl} target="_blank" rel="noopener">
            Report a bug or request a feature <NewTab />
          </a>
          <p className="muted about__note">Mention your version ({version}) and what you were doing.</p>
          <a href={repoUrl} target="_blank" rel="noopener">
            Source code on GitHub <NewTab />
          </a>
        </div>
        <p className="muted about__note">Your heroes, villains and games are saved in this browser only. Use Settings › Data › Back up everything to keep a copy.</p>
        <div className="button-row">
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
