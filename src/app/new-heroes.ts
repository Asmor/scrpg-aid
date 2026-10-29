/**
 * New heroes that haven't been saved yet. "New hero" opens the wizard on a draft held here, in
 * memory; the first real choice saves it (the hero wizard spec, "Drafts"). Leaving before
 * that leaves nothing in the store, so no "Unnamed hero" appears in the list.
 */
import { createContext, useContext } from 'react'
import type { Hero } from '../hero/model'

export class NewHeroes {
  private readonly heroes = new Map<string, Hero>()

  add(hero: Hero): void {
    this.heroes.set(hero.id, hero)
  }

  get(id: string): Hero | undefined {
    return this.heroes.get(id)
  }

  /** Forgets a hero, once it's saved. */
  remove(id: string): void {
    this.heroes.delete(id)
  }
}

/** The app's new heroes; tests can provide their own. */
export const NewHeroesContext = createContext(new NewHeroes())

export function useNewHeroes(): NewHeroes {
  return useContext(NewHeroesContext)
}
