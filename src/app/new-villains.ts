/**
 * New villains that haven't been saved yet, like ./new-heroes.ts: "New villain" opens the wizard
 * on a draft held here, and its first real choice saves it (the villain wizard spec, section 1).
 */
import { createContext, useContext } from 'react'
import type { Villain } from '../villain/model'

export class NewVillains {
  private readonly villains = new Map<string, Villain>()

  add(villain: Villain): void {
    this.villains.set(villain.id, villain)
  }

  get(id: string): Villain | undefined {
    return this.villains.get(id)
  }

  /** Forgets a villain, once it's saved. */
  remove(id: string): void {
    this.villains.delete(id)
  }
}

/** The app's new villains; tests can provide their own. */
export const NewVillainsContext = createContext(new NewVillains())

export function useNewVillains(): NewVillains {
  return useContext(NewVillainsContext)
}
