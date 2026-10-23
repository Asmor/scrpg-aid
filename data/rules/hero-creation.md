# Hero Creation

The steps for building a hero, paraphrased. The options for each step are in `data/heroes/*.json`. Page numbers are printed page numbers in the Core Rules.

## What a finished hero has (p. 43)

- Powers, rated d6 to d12
- Qualities, rated d6 to d12, including one roleplaying quality the player invents
- Status dice for Green, Yellow, and Red
- Green, Yellow, and Red abilities, plus one Out ability
- Two principles
- Maximum Health and the Green/Yellow/Red Health ranges
- Background, power source, archetype, and personality (the "Characteristics" on the sheet)
- Free-form details: hero name, alias, physical attributes, costume/equipment

## Methods (p. 42–43)

- **Guided:** roll dice at each step to narrow the options, then choose among the results. A player may reroll once per step if nothing fits (p. 46).
- **Constructed:** pick any entry at each step instead of rolling. The step still gives the same dice *sizes* for the next step.
- **Freeform ("secret third option"):** assign powers, qualities, and abilities directly, with GM approval.

### Choosing from a table by rolling (p. 43)

After rolling the step's dice, the player may pick the entry matching any single die's value, or the sum of any two dice.

### Assigning dice (p. 44)

- When a step says to assign dice to powers or qualities, only the die **sizes** matter, not the values rolled.
- Several picks may come from the same category, each as its own power or quality.
- If a step offers something the hero already has, the player can either upgrade it with the new die (and use the old die elsewhere in the same step), or keep the existing die and use the new one elsewhere. No die is wasted.

### Defining abilities (p. 44–45)

- Placeholders such as [power], [quality], [element/energy], or a choice of basic actions are decided when the ability is taken and then fixed. Only advancement changes them.
- Players should give every ability a new name that fits their hero.
- Principles add their roleplaying text, minor twist question, and major twist question to the front of the sheet, and their Green ability to the Green abilities section.

## Steps

### 1. Background (p. 49–54) — `backgrounds.json`

1. Roll 2d10 to choose a background.
2. Assign the background's quality dice to qualities from its list.
3. Take a principle from the listed category.
4. Note the power source dice it gives for the next step.

### 2. Power Source (p. 57–70) — `power-sources.json`

1. Roll the dice from the background to choose a power source.
2. Assign those same dice sizes to powers from the power source's list.
3. Gain its Yellow abilities (usually two, each using a different power) and, for most power sources, a Green ability.
4. Apply any extra bonus the entry grants.
5. Note the archetype dice it gives for the next step.

### 3. Archetype (p. 73–98) — `archetypes.json`

1. Roll the dice from the power source to choose an archetype.
2. Assign those same dice sizes. If the archetype has a required power or quality, one die goes there. Then assign one or more dice to powers from the list (the entry says how many), and any remaining dice to qualities from the list.
3. Gain the listed Green abilities and Yellow abilities, plus any fixed abilities or bonuses.
4. Take a principle from the archetype's category.
5. Most archetypes then give 2d10 for the personality roll.

Divided (p. 94) and Modular (p. 96) layer on top of a second archetype; see their entries.

### 4. Personality (p. 101–104) — `personalities.json`

1. Roll (usually 2d10) to choose a personality.
2. Record its Green, Yellow, and Red status dice and its Out ability. Fill in any bracketed choice in the Out ability.
3. Invent a roleplaying quality that sums up the hero and assign it d8 (p. 121).
4. Apply any extra bonus (Impulsive and Mischievous have one).

### 5. Red Abilities (p. 106–111) — `red-abilities.json`

Choose two Red abilities. Each must come from a category in which the hero has a power or quality to use with it. For abilities that don't use a power or quality, the hero needs something in that category rated d6 or higher.

### 6. Retcon (p. 112) — `retcons.json`

Pick one tweak from the retcon list.

### 7. Health (p. 113) — `health.json`

Max Health = 8 + the Red status die's max value + the max value of one Athletic power or Mental quality (d4 if there is none) + a d8 roll or a flat 4 (decided before rolling). Some archetypes and personalities allow other powers or qualities. Look up the Green/Yellow/Red ranges in the table.

### 8. Finishing Touches (p. 114)

Fill in the hero name, alias, physical attributes (gender, age, height, eyes, hair, skin, build), and costume/equipment, and finish naming abilities. Attributes can be filled in loosely.

## Hero advancement (p. 142–143)

- **Collections:** once a hero has six back issues, the group names a collection, records it, and clears the back issues. A GM may let new heroes start with one collection.
- **Between collections**, depending on what happened in the story:
  - **Cosmetic changes:** appearance, codename, costume. No permission needed.
  - **Change details:** any of these:
    - Swap a power for another power at the same die size, updating the abilities that use it.
    - Swap a quality for another quality at the same die size, updating abilities. The roleplaying quality counts.
    - Swap one principle for another.
    - Swap an ability for another of the same color from the same power source or archetype entries, using the same power or quality.
  - **Major rewrite:** rebuild the hero with the constructed method, keeping their history and collections.

## Custom principles (p. 141)

Players can create their own principles with GM approval. A custom principle needs:

- A category
- During-roleplaying text, with neither purely good nor purely bad effects
- Open-ended minor and major twist questions
- A Green ability that improves an Overcome in a specific circumstance, defined neither too narrowly nor too broadly
