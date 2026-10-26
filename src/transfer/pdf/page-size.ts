/** The PDF export's page sizes. Kept apart from the renderer so the menu can offer them without loading it. */

/** Page sizes in points. */
export const PAGE_SIZES = { letter: { width: 612, height: 792 }, a4: { width: 595.28, height: 841.89 } } as const
export type PageSize = keyof typeof PAGE_SIZES

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
