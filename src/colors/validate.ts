/** The shape of saved colors, which can come from other people's browsers. */
import { object, oneOf, boolean, type Check } from '../shape'
import { CHAR_COLORS, GRADIENTS } from './palette'

export const charColor: Check = oneOf(...CHAR_COLORS)

export const appearanceShape: Check = object({ primary: charColor, 'secondary?': charColor, 'gradient?': oneOf(...GRADIENTS), 'invert?': boolean })
