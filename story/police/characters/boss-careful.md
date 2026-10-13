---
name: "Boss (Careful)"
role: antagonist
status: alive
relationships:
  - character: boss-careless
    type: same-person-variant
  - character: go-between-courier
    type: subordinate
  - character: go-between-clerk
    type: subordinate
  - character: go-between-bartender
    type: subordinate
  - character: inside-officer
    type: subordinate
  - character: inside-officer-extra
    type: subordinate
tags:
  - crime-boss
  - variant-careful
  - hides-behind-a-face
arc: slow-money
arc-type: change-negative
lie: "Three layers make a wall."
truth: "A wall has a door, and a door has a schedule."
---

# Boss, CAREFUL variant

The same criminal when the roll is CAREFUL. Harder to solve.

## Structure
Layers: boss, g1 (courier), g2 (clerk) in some cases, plus g3 (go-between-bartender) as an extra go-between. Two safe houses (the second is a back-up in a different zone). One inside officer per station: inside-officer at station 1, inside-officer-extra at each extra station. Payoffs split in two hand-overs through two people.

## Camera-safe tells
- Routine varies by weekday; the face is still the face.
- Never speaks to A or any officer; the go-between does.
- Burned safe house: moves within a day (boss:safehouse2-burned follows a week later).
- Sends g3 to talk instead of g1 when g1 is watched.
- Arrest only d19 to d21 even with cooperating stations.

## Thread
Slow money, extra cover, a late slip. Falls to a stakeout, not a tip.

## Flags
boss:arrested, boss:fled, boss:safehouse-burned, boss:safehouse2-burned, boss:tipped-off
