# Villain Creation

How to build a villain, paraphrased. The options are in `data/villains/*.json`. Page numbers are printed page numbers in the Core Rules.

## What a villain has (p. 152, 208)

- Name, alias, approach, archetype
- Powers and qualities (rated by die, like heroes), plus a d8 roleplaying quality
- A status die, worked out from the archetype (often *not* from Health)
- Abilities. Villains can always use all of them; there are no Green/Yellow/Red ability tiers.
- Max Health (and zone ranges, if needed)
- Optional upgrades and a villainous mastery

A villain with no upgrades is a **minor villain**. One with upgrades (and a mastery) is a **major villain**.

## Steps (p. 208)

1. **Concept:** who the villain is and what they want.
2. **Approach** (p. 208–219, `approaches.json`): how the villain pursues its goals. It provides:
   - The power dice and quality dice to assign. Assign them to any powers and qualities from the main list (p. 47); the suggestions are only ideas.
   - A d8 roleplaying quality
   - Base Health
   - A set number of abilities chosen from its list. Some approaches limit which powers or qualities those abilities can use.
3. **Archetype** (p. 220–234, `archetypes.json`): how the villain fights. It provides:
   - The rule for the status die
   - A Health modifier
   - Abilities. Each archetype lists suggested approach pairings.
4. **Upgrades** (optional, p. 235–238, `upgrades.json`): each upgrade adds Health and makes the villain a match for roughly one more hero.
5. **Mastery** (p. 238): if the villain has any upgrades, choose one mastery. It's an Inherent ability that guarantees success on certain Overcomes.
6. **Health** (p. 239, `health.json`): approach base Health + archetype modifier + 5 × number of heroes + upgrade Health. Look up zone ranges in the chart if the villain needs them.
7. **Finishing touches:** appearance, costume, mannerisms, motivation, and ties to the heroes.

## Running notes that affect the design (p. 154–155)

- Once per scene at most, a villain can use an Overcome to make the scene more dangerous (advance the scene tracker one space).
- Villains can take minor twists but never major twists. Given a choice between a major twist and failing, they fail. The exception: a villain's major twist can be used to end the scene (the villain is captured or escapes).
