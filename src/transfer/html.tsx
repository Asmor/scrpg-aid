/**
 * The hero sheet as one self-contained HTML file: the on-screen sheet with the app's styles
 * and icons inlined, in the light theme, so it opens and prints anywhere without the app.
 * The hero's JSON rides along in a JSON script tag (never run), so the file can be
 * imported back. Rule warnings are left out.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroSheetView } from '../components/HeroSheetView'
import { IconSource, type IconName } from '../components/icon-source'
import { heroDisplayName, type Hero } from '../hero/model'
import appCss from '../index.css?inline'
import { embeddableJson, SCRIPT_OPEN } from './embed'

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** `icons` gives each icon's embedded copy (a data URI; see ./icons.ts). */
export function heroHtml(hero: Hero, icons: Readonly<Record<IconName, string>>): string {
  const sheet = renderToStaticMarkup(
    <IconSource.Provider value={(name) => icons[name]}>
      <HeroSheetView hero={hero} warnings={false} />
    </IconSource.Provider>,
  )
  return [
    '<!doctype html>',
    '<html lang="en" data-theme="light">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(heroDisplayName(hero))}</title>`,
    `<style>${appCss}</style>`,
    '</head>',
    '<body>',
    `<main class="app-main">${sheet}</main>`,
    `${SCRIPT_OPEN}${embeddableJson(hero)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
