/** Saving a hero to a file in each export format. */
import type { Hero } from '../hero/model'
import { downloadFile } from '../transfer/download'
import { heroFileName, heroJson } from '../transfer/files'
import { heroMarkdown } from '../transfer/markdown'

export function ExportMenu({ hero }: { hero: Hero }) {
  return (
    <section className="export-menu" aria-labelledby="export-title">
      <h3 id="export-title">Export</h3>
      <div className="button-row">
        <button type="button" className="button" onClick={() => downloadFile(heroFileName(hero, 'json'), heroJson(hero), 'application/json')}>
          Download JSON
        </button>
        <button type="button" className="button" onClick={() => downloadFile(heroFileName(hero, 'md'), heroMarkdown(hero), 'text/markdown')}>
          Download Markdown
        </button>
      </div>
      <p className="hint">JSON and Markdown files can be imported back into the app, here or on another device.</p>
    </section>
  )
}
