/** The home page: your heroes and your villains (Phase 5). An import on one refreshes the other. */
import { useState } from 'react'
import { VillainList } from '../villain/VillainList'
import { HeroList } from './HeroList'

export function Home() {
  const [version, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)
  return (
    <>
      <HeroList onImported={bump} refresh={version} />
      <VillainList refresh={version} onChanged={bump} />
    </>
  )
}
