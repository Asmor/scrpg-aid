/**
 * The PDF export (scrpg-aid-designs/hero-sheet/spec.md, "Printed PDF"): the browser prints the Sheet
 * page with the print stylesheet in ../index.css, so the screen and the PDF can't drift apart.
 * Printing to PDF is the browser's own "Save as PDF". This sets the paper size and puts the
 * character's name in the page footer for the one print, then takes them away again.
 */

export type PageSize = 'letter' | 'a4'

/** Where Letter paper is the norm; everywhere else uses A4. */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'PR'])

/** The usual paper for a locale such as "en-US" or "fr-CA": Letter in the Americas' Letter countries, A4 elsewhere. */
export function defaultPageSize(locale: string | undefined): PageSize {
  if (!locale) return 'letter'
  let region: string | undefined
  try {
    region = new Intl.Locale(locale).maximize().region
  } catch {
    return 'letter'
  }
  return region && !LETTER_REGIONS.has(region) ? 'a4' : 'letter'
}

/** Text as a CSS string, quotes and all; "<" is escaped too, so it can't end a <style> it's in. */
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\3c ').replace(/[\r\n]+/g, ' ')}"`
}

/** The name in the printed footer's left corner (the HTML export carries this too). */
export function footerRule(name: string): string {
  return `@page { @bottom-left { content: ${cssString(name)}; } }`
}

/** The page rules for one print: the paper size, and the name in the footer. */
export function pageRules(name: string, size: PageSize): string {
  return `@page { size: ${size === 'a4' ? 'A4' : 'letter'}; @bottom-left { content: ${cssString(name)}; } }`
}

/** Prints the page on `size` paper with `name` in the footer. */
export function printSheet(name: string, size: PageSize, win: Window = window): void {
  // A print whose afterprint never came (some webviews) leaves its rules behind; clear them.
  win.document.head.querySelectorAll('style[data-print]').forEach((s) => s.remove())
  const style = win.document.createElement('style')
  style.dataset.print = ''
  style.textContent = pageRules(name, size)
  win.document.head.append(style)
  const done = () => {
    style.remove()
    win.removeEventListener('afterprint', done)
  }
  win.addEventListener('afterprint', done)
  win.print()
}
