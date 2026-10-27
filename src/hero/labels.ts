/** Display labels shared by the on-screen sheet, the editor, and the exports. */
import type { AbilityType, Zone } from '../rules/types'
import type { HeroDetails } from './model'

export const DETAIL_LABEL: Record<keyof HeroDetails, string> = {
  name: 'Hero name',
  alias: 'Alias',
  player: 'Player',
  gender: 'Gender',
  age: 'Age',
  height: 'Height',
  eyes: 'Eyes',
  hair: 'Hair',
  skin: 'Skin',
  build: 'Build',
  costume: 'Costume / equipment',
}

export const ZONE_LABEL: Record<Zone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

/** Zones in play, including Out (p. 14). */
export const PLAY_ZONE_LABEL: Record<Zone | 'out', string> = { ...ZONE_LABEL, out: 'Out' }

export const ABILITY_TYPE_LABEL: Record<AbilityType, string> = { A: 'Action', R: 'Reaction', I: 'Inherent', 'A/I': 'Action or Inherent' }
