/** Saving a hero or a villain to a file in each export format. */
import { useId, useState } from 'react'
import type { Hero } from '../hero/model'
import type { Villain } from '../villain/model'
import { downloadFile } from '../transfer/download'
import { heroFileName, heroJson, villainFileName, villainJson } from '../transfer/files'
import { loadIconDataUris } from '../transfer/icons'
import { heroMarkdown, villainMarkdown } from '../transfer/markdown'
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

/** What's exported: a hero, or a villain (Phase 5). */
type Exported = { hero: Hero; villain?: undefined } | { villain: Villain; hero?: undefined }

export function ExportMenu(props: Exported) {
  const { hero, villain } = props
  const id = useId()
  const fileName = (ext: string) => (hero ? heroFileName(hero, ext) : villainFileName(villain!, ext))
  const [error, setError] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState<PageSize>(() => defaultPageSize(navigator.language))
  const [makingPdf, setMakingPdf] = useState(false)
  const pdf = async () => {
    setMakingPdf(true)
    setError(null)
    try {
      // pdf-lib, the fonts and the icons are only downloaded when a PDF is made (then cached).
      const pdfMaker = await import('../transfer/pdf').catch(asDownloadError)
      downloadFile(fileName('pdf'), hero ? await pdfMaker.exportPdf(hero, pageSize) : await pdfMaker.exportVillainPdf(villain!, pageSize), 'application/pdf')
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
      const [htmlMaker, icons] = await Promise.all([import('../transfer/html').catch(asDownloadError), loadIconDataUris()])
      downloadFile(fileName('html'), hero ? htmlMaker.heroHtml(hero, icons) : htmlMaker.villainHtml(villain!, icons), 'text/html')
    } catch (e) {
      setError(exportErrorText('HTML file', e))
    }
  }
  return (
    <section className="export-menu" aria-labelledby="export-title">
      <h3 id="export-title">Export</h3>
      <div className="button-row">
        <button type="button" className="button" onClick={() => downloadFile(fileName('json'), hero ? heroJson(hero) : villainJson(villain!), 'application/json')}>
          Download JSON
        </button>
        <button type="button" className="button" onClick={() => downloadFile(fileName('md'), hero ? heroMarkdown(hero) : villainMarkdown(villain!), 'text/markdown')}>
          Download Markdown
        </button>
        <button type="button" className="button" onClick={() => void html()}>
          Download HTML
        </button>
      </div>
      <div className="button-row export-menu__pdf">
        <button type="button" className="button" disabled={makingPdf} onClick={() => void pdf()}>
          {makingPdf ? 'Making PDF…' : 'Download PDF'}
        </button>
        <span role="radiogroup" aria-label="Page size" className="export-menu__sizes">
          {(
            [
              ['letter', 'Letter'],
              ['a4', 'A4'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="checkbox">
              <input type="radio" name={`${id}-page`} checked={pageSize === value} onChange={() => setPageSize(value)} />
              {label}
            </label>
          ))}
        </span>
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
