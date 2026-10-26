/** Saving a hero to a file in each export format. */
import { useState } from 'react'
import type { Hero } from '../hero/model'
import { downloadFile } from '../transfer/download'
import { heroFileName, heroJson } from '../transfer/files'
import { heroMarkdown } from '../transfer/markdown'

export function ExportMenu({ hero }: { hero: Hero }) {
  const [error, setError] = useState<string | null>(null)
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
        <button
          type="button"
          className="button"
          onClick={() =>
            // The HTML export renders the sheet to a string, which needs React's server renderer; load it only when asked.
            void import('../transfer/html')
              .then(({ heroHtml }) => {
                setError(null)
                downloadFile(heroFileName(hero, 'html'), heroHtml(hero), 'text/html')
              })
              .catch((e: unknown) => setError(`Couldn't make the HTML file: ${e instanceof Error ? e.message : String(e)}`))
          }
        >
          Download HTML
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="hint">JSON, Markdown, and HTML files can be imported back into the app, here or on another device.</p>
    </section>
  )
}
