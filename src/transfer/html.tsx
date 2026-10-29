/**
 * The hero (or villain) sheet as one self-contained HTML file: the on-screen sheet with the app's styles
 * and icons inlined, in the light theme, so it opens and prints anywhere without the app.
 * The hero's JSON rides along in a JSON script tag (never run), so the file can be
 * imported back. Rule warnings are left out.
 */
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroSheetTitle, HeroSheetView } from '../components/HeroSheetView'
import { IconSource, type IconName } from '../components/icon-source'
import { heroDisplayName, type Hero } from '../hero/model'
import appCss from '../index.css?inline'
import tokensCss from '../theme/tokens.css?inline'
import { villainDisplayName, type Villain } from '../villain/model'
import { VillainSheetView } from '../villain/VillainSheetView'
import { embeddableJson, embeddableVillainJson, SCRIPT_OPEN } from './embed'

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** `icons` gives each icon's embedded copy (a data URI; see ./icons.ts). */
export function heroHtml(hero: Hero, icons: Readonly<Record<IconName, string>>): string {
  return page(
    heroDisplayName(hero),
    <>
      <HeroSheetTitle hero={hero} />
      <HeroSheetView hero={hero} interactive={false} />
    </>,
    embeddableJson(hero),
    icons,
  )
}

/** A villain's sheet as one self-contained HTML file, the same way (Phase 5). */
export function villainHtml(villain: Villain, icons: Readonly<Record<IconName, string>>): string {
  return page(villainDisplayName(villain), <VillainSheetView villain={villain} warnings={false} />, embeddableVillainJson(villain), icons)
}

function page(title: string, sheet: ReactElement, json: string, icons: Readonly<Record<IconName, string>>): string {
  const body = renderToStaticMarkup(<IconSource.Provider value={(name) => icons[name]}>{sheet}</IconSource.Provider>)
  return [
    '<!doctype html>',
    '<html lang="en" data-theme="light">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${tokensCss}\n${appCss}</style>`,
    '</head>',
    '<body>',
    `<main class="app-main">${body}</main>`,
    `${SCRIPT_OPEN}${json}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
