/** Saving a hero to a file in each export format. */
import { useId, useState } from 'react'
import type { Hero } from '../hero/model'
import { downloadFile } from '../transfer/download'
import { heroFileName, heroJson } from '../transfer/files'
import { loadIconDataUris } from '../transfer/icons'
import { heroMarkdown } from '../transfer/markdown'
import { defaultPageSize, type PageSize } from '../transfer/pdf/page-size'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * What to tell the player when an export fails. The PDF maker isn't cached up front, so its
 * first download needs a connection; and after an update, a page still running the old
 * version asks for files that are gone, until the update is accepted or the page reloaded.
 */
function exportErrorText(what: string, e: unknown): string {
  if (e instanceof Error && e.name === 'DownloadError') {
    return navigator.onLine
      ? `Couldn't make the ${what}: part of it couldn't be downloaded. If the app offers an update, accept it (or reload the page), then try again.`
      : `Couldn't make the ${what}: you're offline, and part of it downloads the first time it's used. Connect to the internet and try again.`
  }
  return `Couldn't make the ${what}: ${errorText(e)}`
}

/** A failed dynamic import counts as a download error. */
const asDownloadError = (e: unknown): never => {
  throw Object.assign(e instanceof Error ? e : new Error(String(e)), { name: 'DownloadError' })
}

export function ExportMenu({ hero }: { hero: Hero }) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState<PageSize>(() => defaultPageSize(navigator.language))
  const [makingPdf, setMakingPdf] = useState(false)
  const pdf = async () => {
    setMakingPdf(true)
    setError(null)
    try {
      // pdf-lib, the fonts and the icons are only downloaded when a PDF is made (then cached).
      const { exportPdf } = await import('../transfer/pdf').catch(asDownloadError)
      downloadFile(heroFileName(hero, 'pdf'), await exportPdf(hero, pageSize), 'application/pdf')
    } catch (e) {
      setError(exportErrorText('PDF', e))
    } finally {
      setMakingPdf(false)
    }
  }
  const html = async () => {
    setError(null)
    try {
      // The HTML export renders the sheet to a string, which needs React's server renderer; load it
      // only when asked. The icons are embedded so the file stands alone.
      const [{ heroHtml }, icons] = await Promise.all([import('../transfer/html').catch(asDownloadError), loadIconDataUris()])
      downloadFile(heroFileName(hero, 'html'), heroHtml(hero, icons), 'text/html')
    } catch (e) {
      setError(exportErrorText('HTML file', e))
    }
  }
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
        <button type="button" className="button" onClick={() => void html()}>
          Download HTML
        </button>
      </div>
      <div className="button-row export-menu__pdf">
        <label className="field field--inline" htmlFor={`${id}-page`}>
          <span>Page size</span>
          <select id={`${id}-page`} value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)}>
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        </label>
        <button type="button" className="button" disabled={makingPdf} onClick={() => void pdf()}>
          {makingPdf ? 'Making PDF…' : 'Download PDF'}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="hint">JSON, Markdown, and HTML files can be imported back into the app, here or on another device. PDFs are for printing and reading.</p>
    </section>
  )
}
