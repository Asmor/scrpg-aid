# Rulings

This file records the decisions made (by the user, or by the permissive default the user set) where the rules data (and the book behind it) was ambiguous, silent, or needed correcting. Each entry gives the page, the original question, the decision, and its **basis**:

- **Interpretation:** the user's reading of what the book means.
- **Fiat:** a house rule, where the book doesn't settle it.
- **Default:** not asked. For niche creation cases the user asked Claude not to ask and to take the permissive reading; these are open to review.

The decisions are also applied in the data and code. Where a ruling shapes the data, `data/README.md` describes how it's encoded. Page numbers are printed Core Rules pages (`core-rules` in `books.json`).

Ruling numbers are permanent IDs, so other notes can refer to them. A new ruling takes the next number, whichever section it's filed in.

> **Draft:** each basis below marked "(guess)" is Claude's guess and still needs the user to confirm it.

## Abilities and restrictions

### 1. Abilities that use no power or quality
- **Pages:** Shadow (p. 74), Physical Powerhouse (p. 75), Armored (p. 79), and other archetypes with ability restrictions.
- **Question:** Some abilities in restricted lists don't use any power or quality (e.g. Shadow's Untouchable, Armored's Deflect, Physical Powerhouse's Damage Resistant). How should restrictions like "each uses a different power or quality" or Armored's "at least two different powers" treat them?
- **Decision:** They're exempt: always allowed, and they count toward nothing.
- **Basis:** Interpretation (guess).

### 2. Elemental Manipulator's Green abilities
- **Page:** Elemental Manipulator (p. 81).
- **Question:** "Both use your Elemental/Energy powers." Must the two abilities use two different Elemental/Energy powers, or can both use the same one?
- **Decision:** Both may use the same power.
- **Basis:** Interpretation (guess).

### 3. Element/energy blanks
- **Page:** Elemental Manipulator (p. 81).
- **Question:** Energy Alignment and Energy Redirection say "[element/energy you have a related power for]". Does that count as "using" the related Elemental/Energy power for the restriction?
- **Decision:** Yes, it counts as using that power.
- **Basis:** Interpretation (guess).

### 4. Focused with an exempt ability
- **Page:** villain approach Focused (p. 213).
- **Question:** Focused says "two use the same power, the third a different power." If one of the three uses no power, may the other two use the same power or different powers?
- **Decision:** Either is fine.
- **Basis:** Interpretation (guess).

### 5. Abilities that name their power
- **Pages:** Powered Suit (p. 62), Psychic (p. 84), and others.
- **Question:** Eight abilities name their power in the text instead of a [bracket] (e.g. Onboard Upgrade: "Boost yourself using Power Suit"; Psychic's "Attack using Telepathy"). Should they count as using that power for restrictions?
- **Decision:** Yes. An ability whose `requires` names one power or quality uses it. `requires: Power Suit` was added to Onboard Upgrade (see Data corrections).
- **Basis:** Interpretation (guess).

### 6. Power restrictions and quality uses
- **Pages:** Armored (p. 79), Wild Card (p. 89).
- **Question:** Some "each uses a different power" blocks include [power/quality] abilities (e.g. Wild Card's Multitask, Armored's Unstoppable Charge). If the player fills one with a quality, what happens?
- **Decision:** That's allowed. Rules about powers only look at the abilities that use powers.
- **Basis:** Interpretation (guess).

## Creation steps

### 7. When a table reroll is allowed
- **Page:** p. 46.
- **Question:** The rules say a player "may reroll once per step if nothing fits." When should the app offer the reroll?
- **Decision:** Whenever the player dislikes the options. "Nothing fits" means nothing fits their concept.
- **Basis:** Interpretation (guess).

### 8. "Gain" bonuses on a power or quality the hero already has
- **Pages:** Assigning dice (p. 44); Mystical (p. 59), for example.
- **Question:** Some bonuses say "gain a power/quality" (e.g. Mystical: gain an Information quality at d10). If the hero already has it, what happens?
- **Decision:** The bonus may upgrade the existing die if the bonus die is bigger; warn if it's the same size or smaller.
- **Basis:** Interpretation (guess).

### 9. Alien's bonus with a d6 quality but no d6 power
- **Page:** Alien (p. 67).
- **Question:** "Upgrade one d6 power or quality to d8. If you have no d6 powers, instead add a new power from this power source's list at d6." What can a hero with a d6 quality but no d6 power do?
- **Decision:** Either option: upgrade the d6 quality, or take the new d6 power.
- **Basis:** Interpretation (guess).

### 42. A power source roll after the background's dice change
- **Pages:** Power source (p. 56–57); Methods (p. 46).
- **Question:** The power source step rolls the dice the background gives. If a Guided player rolls for a power source and then changes to a background with different power source dice, the old roll no longer fits. Does the new roll count against the step's one reroll?
- **Decision:** No. The new dice get a fresh roll, and the step still has its one reroll.
- **Basis:** Interpretation.

### 43. Swapping the die on a required trait the hero already has
- **Pages:** Archetype step notes (p. 73); Assigning dice (p. 44).
- **Question:** An archetype whose required power or quality the hero already has may "swap the die" (`ifAlreadyHave: "swap"`). Elsewhere a die only replaces an existing one if it's bigger. Does swapping allow a smaller (or equal) die?
- **Decision:** Yes. For the required trait, the archetype die replaces the old die whatever its size, and the old die joins the archetype step's dice to assign elsewhere.
- **Basis:** Interpretation.

### 44. Swapping onto more than one trait that fits a required category
- **Pages:** Archetype step notes (p. 73); e.g. Blaster (p. 77), Elemental Manipulator (p. 81), Form-Changer (p. 90).
- **Question:** When the required trait is a whole category (e.g. "an Elemental/Energy power") and the hero already has several traits in it, does ruling 43's swap apply to just one of them?
- **Decision:** No. Every trait the hero already has that fits the required list may swap in any die.
- **Basis:** Interpretation.

### 45. Divided's second archetype roll
- **Pages:** Divided (p. 94); Archetype (p. 72–73).
- **Question:** Divided says to "reroll the power source dice and pick a second archetype". In a Guided game, which dice are rolled?
- **Decision:** The archetype step's dice again (the dice the power source gives). The second archetype is chosen from that roll, and can't be Divided or Modular.
- **Basis:** Interpretation.

### 46. Rerolling the second archetype's roll
- **Pages:** Divided (p. 94); Modular (p. 96); Methods (p. 46).
- **Question:** Divided's second archetype roll (and Modular's, if the player rolls fresh): can it be rerolled, and does that use the archetype step's reroll?
- **Decision:** It's a new roll with its own one reroll, whether or not the first archetype roll used its reroll.
- **Basis:** Interpretation.

### 47. Modular's base archetype after a fresh roll
- **Pages:** Modular (p. 96).
- **Question:** Modular's base archetype is "another option from your archetype roll, or reroll". After rolling fresh, may the player still pick an option from the original roll?
- **Decision:** No. The fresh roll replaces the original one for choosing the base archetype.
- **Basis:** Interpretation.

### 48. Choosing Divided's second personality
- **Pages:** Divided (p. 94); Personality (p. 100–101).
- **Question:** A Divided hero may take a second personality for the heroic form. Is it rolled for?
- **Decision:** No. The player chooses it freely, as long as it differs from the civilian form's personality.
- **Basis:** Default (permissive; not asked).

### 49. Swapping the roleplaying quality during advancement
- **Pages:** Hero advancement (p. 142–143).
- **Question:** Between collections a hero may swap a quality for another at the same die size, and "the roleplaying quality counts". What does that mean for the roleplaying quality, which the player invents?
- **Decision:** Changing it means rewriting (renaming) it, which the player can do at any time; it isn't swapped for a quality from the lists.
- **Basis:** Default (not asked). Worth confirming: the plainer reading may be that it can be swapped for a listed quality at its die.

### 50. Swapping a Red ability during advancement
- **Pages:** Hero advancement (p. 142–143); Red abilities (p. 106–111).
- **Question:** The ability swap names abilities "from the same power source or archetype entries". Can a Red ability be swapped too?
- **Decision:** Yes, for another from the same Red ability category, using the same power or quality. Fixed abilities and Divided's transition ability can't be swapped.
- **Basis:** Default (permissive; not asked).

### 51. What a swap doesn't recheck
- **Pages:** Hero advancement (p. 142–143).
- **Question:** A power or quality swap can break links set at creation (a Red ability's category, an archetype's required trait), and "swap one principle for another" doesn't say which principles. Are these limited?
- **Decision:** No. Swaps aren't checked against creation's lists or links, and the new principle may come from any category; it just can't be one the hero already has.
- **Basis:** Default (permissive; not asked).

## Red abilities

### 10. Minion-Maker's extra Red abilities
- **Page:** Minion-Maker (p. 86–88).
- **Question:** Minion-Maker has three extra Red abilities (Construction Focus, Swarm Combat, Sacrifice), but the data doesn't say how they're used. Are they extra choices for the two Red abilities, or a bonus Red ability?
- **Decision:** "They are valid additional options any time the minion maker is selecting a red power". That includes a Red ability gained from a retcon.
- **Basis:** Interpretation (guess).

### 11. Red abilities with the same name
- **Pages:** Red abilities (p. 106–111). Powerful Strike is on p. 106, 107 and 109; Final Wrath on p. 108, 109 and 110.
- **Question:** Some Red ability names appear in more than one category list (e.g. Powerful Strike is in both Elemental/Energy and Materials with identical text; Final Wrath appears with different texts). Can a hero take the same-named Red ability from two lists?
- **Decision:** No. "Disallow choosing powers with the same name." Only the book's name counts: "User-supplied names can neither cause nor resolve a duplication."
- **Basis:** Fiat (guess).

## Retcons (p. 112)

### 12. Restrictions after the "change which power or quality an ability uses" retcon
- **Question:** After the change, must the ability still follow its original restrictions? For example, Paragon Feat (an Athletic Red ability) moved onto Fire, or Accident's Inflict moved onto a power another Yellow ability already uses.
- **Decision:** Only the bracket has to fit. The Red category and the block's rules no longer apply.
- **Basis:** Interpretation (guess).

### 13. The same retcon on the Out ability
- **Question:** Can it target the Out ability (e.g. Lone Wolf's "rolling your single [quality] die", p. 101)?
- **Decision:** Yes.
- **Basis:** Interpretation (guess).

### 14. Raising a Red status die that's already d12
- **Pages:** Nurturing (p. 103), Naive (p. 104).
- **Question:** Nurturing and Naive already have a d12 Red status die. If a player takes the "raise your Red status die" retcon anyway, it does nothing. Warn them?
- **Decision:** "Don't allow raising a d12." The app doesn't offer the retcon then; this is an exception to warn-only.
- **Basis:** Interpretation (guess).

### 15. The same retcon on a Form-Changer form ability
- **Page:** Form-Changer (p. 90–91).
- **Question:** Can the "change which power or quality an ability uses" retcon target a form ability (e.g. Strong Form)?
- **Decision:** Yes.
- **Basis:** Interpretation (guess).

## Form-Changer (p. 90–91) and Minion-Maker (p. 86–88)

### 16. The Yellow form's upgrades
- **Question:** The Yellow form "may also rearrange powers and upgrades any two dice by one size." Which dice can be upgraded?
- **Decision:** Two different dice of any kind, powers or qualities, each one size.
- **Basis:** Interpretation (guess).

### 17. Forms that drop a power the base abilities use
- **Question:** "The abilities above work in every form." Must every form keep the powers its base abilities use? For example, if a form drops its only Self Control power, Change Forms has no die to roll there.
- **Decision:** "No requirement, and I'd say that if a form lacks a specified power or quality it should use a d4 for that missing attribute."
- **Basis:** No requirement: Interpretation (guess). The d4: Fiat (guess).

### 18. Forms on a second archetype
- **Pages:** Divided (p. 94–95), Modular (p. 96–98).
- **Question:** If Divided's or Modular's second archetype is Form-Changer or Minion-Maker, does the hero also get its forms or minion forms?
- **Decision:** Yes. (The details were settled when Divided was built: they're recorded on the second archetype.)
- **Basis:** Interpretation (guess).

### 19. Which quality sets the number of minion forms
- **Question:** Minion-Maker chooses a number of forms "equal to the maximum value of a related quality (such as Creativity, Magical Lore, Otherworldly Mythos, Science, or Technology)." Which qualities count?
- **Decision:** Any quality, the player's call. The list is examples.
- **Basis:** Interpretation (guess).

## Divided (p. 94–95)

### 20. Whose Out ability a two-personality hero gets
- **Question:** A Divided hero may take two personalities, one per form, "with status dice changing accordingly," but still has only one Out ability. Whose Out ability do they get?
- **Decision:** The player chooses one.
- **Basis:** Fiat (guess).

### 21. Which Red status die Health uses
- **Page:** Health (p. 113).
- **Question:** Max Health adds the Red status die. With two personalities, whose Red die is used?
- **Decision:** The larger one.
- **Basis:** Fiat (guess).

### 22. "[a power gained from your archetype]"
- **Question:** The transition abilities Possess Person and Possess Object say "[a power gained from your archetype]" / "[a quality gained from your archetype]". For a Divided hero, which archetype is that?
- **Decision:** The second archetype (e.g. Speedster in "Divided Speedster").
- **Basis:** Interpretation (guess).

### 23. Two personalities' bonuses
- **Page:** e.g. Impulsive (p. 101).
- **Question:** If the hero has two personalities, does each personality's bonus apply?
- **Decision:** "Each personality applies separately to the respective forms."
- **Basis:** Interpretation (guess).

### 24. Bonus-created powers and qualities with Split Form
- **Question:** If one personality's bonus gives the hero a new power or quality, it exists only in that personality's form. Where does it go in Split Form's split?
- **Decision:** In its own form only. The player doesn't place it in the split, and it can't be one of the two powers or two qualities that both forms always have.
- **Basis:** Interpretation (guess).

### 25. The heroic Out ability, and Health, with two forms
- **Page:** Health (p. 113).
- **Question:** If the player picks the heroic personality's Out ability, must the power or quality it uses be one the heroic form has? And can Health add a power or quality that only one form has?
- **Decision:** The heroic Out ability must use a power or quality the heroic form has. Health can use a power or quality from either form.
- **Basis:** Out ability: Interpretation (guess). Health: Fiat (guess).

### 26. The Red status die retcon with two personalities
- **Page:** Retcons (p. 112).
- **Question:** Each personality has its own status dice. Which form's Red die goes up?
- **Decision:** The player picks one.
- **Basis:** Fiat (guess).

## Modular (p. 96–98)

### 27. Modular built on Divided
- **Question:** Can Modular be built on Divided? The data only excluded Modular itself.
- **Decision:** No. Divided was added to Modular's `exclude` list.
- **Basis:** Interpretation (guess).

### 28. The base archetype's bonuses
- **Page:** e.g. Robot/Cyborg (p. 82).
- **Question:** Modular takes a base archetype's powers and qualities but "skip its abilities." Does the base archetype's bonus still apply (e.g. Robot/Cyborg's extra Technological power)?
- **Decision:** Yes. Only abilities are skipped.
- **Basis:** Interpretation (guess).

### 29. The base archetype's Health options
- **Page:** e.g. Armored (p. 79).
- **Question:** Does the base archetype's Health option still apply (e.g. Armored lets a Materials/Technological power count for Health)?
- **Decision:** Yes.
- **Basis:** Interpretation (guess).

### 30. Repeated modes
- **Question:** You take two Yellow modes. Can the same mode be picked twice, and can a mode repeat across zones?
- **Decision:** All modes must be different.
- **Basis:** Interpretation (guess).

### 31. Powers a mode doesn't pick
- **Question:** Each mode "adjusts some of your default-mode power dice" (e.g. Debilitator: pick 4 powers, 1 same, 1 down, 2 up). What happens to default-mode powers the mode doesn't pick?
- **Decision:** They're unavailable in that mode. The user first answered "Kept unchanged", then corrected it: "only the 4 selected powers are available in that mode".
- **Basis:** Interpretation (guess).

### 39. Which powers the d6 filler powers can be
- **Page:** p. 96.
- **Question:** "If you then have fewer than four powers, add d6 powers of your choice until you have four." Which powers can those d6 powers be?
- **Decision:** Powers from the base archetype's lists or the power source's list.
- **Basis:** Fiat.

### 40. Raising a d12 or lowering a d4 in a mode
- **Pages:** Modular (p. 96–98).
- **Question:** Modes say "die sizes cannot go below d4 or above d12." If a mode raises a power that's already d12, or lowers one that's already d4, what happens?
- **Decision:** It's allowed, and the die just stays at d12 or d4.
- **Basis:** Fiat.

### 41. The ability retcon on a mode ability
- **Page:** Retcons (p. 112).
- **Question:** Can the retcon "change which power or quality one of your abilities uses" target a Modular mode's ability (e.g. Debilitator)? (Ruling 15 lets it target Form-Changer form abilities.)
- **Decision:** Yes. The new power must be one of that mode's powers.
- **Basis:** Fiat.

## Mods (p. 20–22, 26–27)

These came from questions the user put to the rules-expert agent about an action with several effects (e.g. Attack with your Max die and Hinder with your Min die). See also `data/rules/core-concepts.md`, "How mods are applied".

### 32. One mod, several effects
- **Question:** Can one bonus or penalty apply to several effects in the same action?
- **Decision:** "Each mod applies to exactly one die."
- **Basis:** Interpretation (guess).

### 33. Who assigns a mod
- **Question:** Who decides which effect each one goes on?
- **Decision:** Whoever created the bonus or penalty decides. In the app, the user assigns mods and is expected to coordinate with the other players and the GM when the decision isn't theirs.
- **Basis:** Interpretation (guess).

### 34. When mods are assigned
- **Question:** Is that decided before rolling, or after the dice are sorted into Min, Mid and Max?
- **Decision:** After the roll: choose mods to apply, roll, then assign the chosen mods to effects. The user called this "the executive decision" because "the rules are ambiguous on this."
- **Basis:** Fiat (from the user's own wording).

### 35. The exclusive limit
- **Question:** Is the limit of one exclusive bonus and one exclusive penalty per roll, or per effect?
- **Decision:** Per roll.
- **Basis:** Interpretation (guess).

### 36. Several exclusive mods of different sizes
- **Question:** With several exclusive mods of different sizes, which apply: the largest, or the player's choice?
- **Decision:** For penalties, the largest by default, but the player can change it. For bonuses, the player chooses.
- **Basis:** Fiat (guess).

### 37. Using mods up
- **Question:** Is a one-use bonus spent as soon as it's applied to one effect, and can a persistent one apply to several effects?
- **Decision:** Mods are used up after a single effect unless they're persistent. A persistent mod isn't used up, but it can still go on only one effect die per roll.
- **Basis:** Interpretation (guess).

### 38. Stacking
- **Question:** Can non-exclusive bonuses and penalties stack on top of the exclusive one?
- **Decision:** Yes. All mods stack additively.
- **Basis:** Interpretation (guess).

## Forms and modes in play (Phase 3)

### 52. A mode without a power an ability uses
- **Pages:** Modular (p. 96–98).
- **Question:** A Modular mode keeps only the powers it picks. What does an ability that uses a power the mode lacks roll?
- **Decision:** A d4 for that power, as ruling 17 does for Form-Changer forms.
- **Basis:** Default (permissive; not asked).

### 53. Abilities and a mode's "can't" actions
- **Pages:** Modular (p. 96–98).
- **Question:** A mode says the hero can't take certain basic actions (e.g. "can't Attack or Hinder"). Does that stop abilities too?
- **Decision:** Only an ability whose every effect is one of those actions is blocked. An ability that can do something else can still be used.
- **Basis:** Default (permissive; not asked).

### 54. Powerless mode
- **Pages:** Modular (p. 96–98).
- **Question:** Powerless mode has no zone, and allows "only abilities from your principles". Which zone does it need, and can the Out ability be used in it?
- **Decision:** It can be used in any zone, and the Out ability can be used when Out. An Out hero may also change to any form or mode, Yellow and Red ones included.
- **Basis:** Default (permissive; not asked).

### 55. The Out ability and Divided's forms
- **Pages:** Divided (p. 94–95).
- **Question:** "You cannot use abilities related to a power or quality you don't have access to." Does that block the Out ability when the hero is Out in the form that lacks its power or quality?
- **Decision:** No. It rolls a d4 for the missing one (as in ruling 17).
- **Basis:** Default (permissive; not asked).

### 56. Divided Psyche and an ability's own power or quality
- **Pages:** Divided (p. 94–95).
- **Question:** With Divided Psyche, the civilian form uses "two qualities instead of a power and a quality" (and the heroic form two powers). Does an ability that names a power, used in civilian form, still roll that power?
- **Decision:** No. The roll is two qualities and the status die. The ability's own trait fills a slot only when it's of the kind being rolled.
- **Basis:** Default (permissive; not asked).

### 59. A mode's or form's own Inherent ability
- **Pages:** Modular (p. 96–98), e.g. Destroyer Mode's "Destroyer"; Form-Changer (p. 90–91).
- **Question:** Inherent abilities are always on. Does a mode's or form's own Inherent ability apply outside that mode or form?
- **Decision:** No. It applies only while the hero is in that mode or form; outside it, it's "Only in" that mode or form.
- **Basis:** Interpretation (the user's ruling).

### 60. Inherent abilities in Powerless mode
- **Pages:** Modular (p. 96–98); extends ruling 54.
- **Question:** Powerless mode allows "only abilities from your principles". Does that switch off the hero's other Inherent abilities too?
- **Decision:** Yes. In Powerless mode, Inherent abilities that aren't from a principle are off, like other non-principle abilities. Basic actions still work.
- **Basis:** Interpretation (the user's ruling).

### 61. A negative roll total
- **Pages:** Mods (p. 22, 26–27).
- **Question:** Penalties can take an effect's total (its die plus the mods on it) below 0. What happens then?
- **Decision:** The roll's total can be negative, but its effect can't: a damage roll of −1 deals 0 damage, and the same goes for Defend and Recover. (A Boost or Hinder of 0 or less already makes no mod, and an Overcome of 0 or less is a spectacular failure.)
- **Basis:** Interpretation (the user's ruling).

### 62. Which die sets a minion's size
- **Pages:** Minion-Maker (p. 86–88), Make Minion and its minion chart.
- **Question:** Make Minion sizes the minion from the roll's result, but doesn't say which die. Which one?
- **Decision:** The Mid die (plus any mods on it). Mid is always the default; an ability that means Min or Max says so.
- **Basis:** Interpretation (the user's ruling).

### 63. Giving a minion a form in play
- **Pages:** Minion-Maker (p. 86–88), minion forms.
- **Question:** Adding a minion form means discarding a bonus (yours or a willing ally's) that meets the form's requirement. Does the game aid have to check and discard that bonus?
- **Decision:** No. The player picks any of their forms for a minion, and removes the bonus themselves if they're following that rule; the app never blocks a change.
- **Basis:** Default (permissive; not asked).

## Villains (p. 208–239)

### 57. Quality Upgrade's extra abilities and an approach's pattern
- **Pages:** Quality Upgrade (p. 237); approaches with a pattern, e.g. Specialized (p. 208–219).
- **Question:** Quality Upgrade gives another approach ability for each quality already at d12. An approach like Specialized says its abilities follow a pattern ("two use the same quality and the third uses a different quality"). Does the extra ability have to fit the pattern too?
- **Decision:** No. The pattern covers the approach's usual number of abilities; an extra one may use any power or quality.
- **Basis:** Default (permissive; not asked).

## Minions and lieutenants (p. 16–17, 204–207)

### 58. What makes a minion's save successful
- **Pages:** Opposition basics (p. 16–17).
- **Question:** A failed save defeats a minion, and a successful one lowers its die, but the data doesn't give the threshold. For lieutenants, the die drops when the save is lower than the damage. Does a minion's save succeed on a tie?
- **Decision:** Yes. A save succeeds when it's at least the damage, the same comparison as for lieutenants.
- **Basis:** Interpretation (the user's ruling).

## Data corrections

These fix the data rather than settling an ambiguity.

- **Lead by Example** (Red abilities, Social, p. 111): the text read "using [quality.] Use your Max die", with the period inside the bracket. Fixed to "[quality]."
- **Onboard Upgrade** (Powered Suit, p. 62): added `requires: Power Suit`, so it counts as using Power Suit (ruling 5).
- **Principle of Dependence** (p. 131): the roleplaying text's "[something]" blank wasn't marked as player-filled. `customization` was added so the player fills it in.
