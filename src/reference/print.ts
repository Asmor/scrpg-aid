/**
 * Printing a reference sheet (scrpg-aid-designs/reference-sheets/spec.md, section 7), on the hero
 * PDF's print path (../transfer/print.ts): the browser's own print, to Save as PDF. For the one
 * print, the page rules go in, the app is hidden so only the sheet prints, and the title becomes
 * the file name the browser suggests.
 */
import type { SheetContents } from './model'

/** "Thursday game - Scene 3 - The Foundry", or "SCRPG Aid reference sheet - 2026-11-08", without the extension. */
export function sheetFileBase(contents: Pick<SheetContents, 'scene'>, now: Date = new Date()): string {
  const clean = (s: string) =>
    s
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  if (contents.scene) return clean(`${contents.scene.gameName} - Scene ${contents.scene.number} - ${contents.scene.name}`)
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `SCRPG Aid reference sheet - ${day}`
}

/** Waits (up to two seconds) for the sheet's images, the dice and action icons, so none print blank. */
async function imagesReady(root: ParentNode, win: Window): Promise<void> {
  const loading = [...root.querySelectorAll('img')].filter((img) => !img.complete && typeof img.decode === 'function')
  if (!loading.length) return
  await Promise.race([Promise.all(loading.map((img) => img.decode().catch(() => undefined))), new Promise((resolve) => win.setTimeout(resolve, 2000))])
}

/** Prints the mounted `.ref-print` with `rules`, suggesting `title` as the file name. Resolves on afterprint. */
export async function printReference(rules: string, title: string, win: Window = window): Promise<void> {
  const doc = win.document
  const sheet = doc.querySelector('.ref-print')
  if (sheet) await imagesReady(sheet, win)
  doc.head.querySelectorAll('style[data-print]').forEach((s) => s.remove())
  const style = doc.createElement('style')
  style.dataset.print = ''
  style.textContent = rules
  doc.head.append(style)
  const before = doc.title
  doc.title = title
  doc.documentElement.classList.add('printing-reference')
  await new Promise<void>((resolve) => {
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      style.remove()
      doc.title = before
      doc.documentElement.classList.remove('printing-reference')
      win.removeEventListener('afterprint', done)
      resolve()
    }
    win.addEventListener('afterprint', done)
    // print() doesn't block everywhere (Chrome on Android), so this waits for afterprint, as the hero PDF does.
    win.print()
  })
}
