---
type: timeline
story: neon-terrarium-police
---

# Story Timeline

How the cases interleave over three game weeks (d01 to d21; chapter-NN is game day NN). One boss case is played per run. The seven smaller cases and the background loop run on fixed days beside it, so the same crossing days repeat in every boss case that lists them. Camera log voice: only what the monitor shows.

## 1. The fixed lanes (small cases and background, identical in every run)

Legend: `#` case active, `.` quiet, `X` crossover day with a boss case. Letters mark the day: `B` stall burns, `L` envelope lifted, `A` arrest (mugger, arson suspect, thief), `F` parcel or resident found, `C` lurker caught, `M` resident missing, `P` poster covered, `R` poster restored.

| Case | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s1 lift lobby muggings | . | # | # | # | # | # | # | A | X | # | # | # | . | . | . | . | . | . | . | . | . |
| s2 missing delivery | . | . | # | # | # | # | # | # | F | # | . | . | . | . | . | . | . | . | . | . | . |
| s3 stall fire | . | . | . | . | B | # | # | # | A | X | # | # | # | . | . | . | . | . | . | . | . |
| s4 sky mall pickpocket | . | . | . | . | . | # | L | # | # | # | # | A | # | # | . | . | . | . | . | . | . |
| s5 platform lurker | . | . | . | # | # | # | # | # | # | # | C | # | # | # | # | . | . | . | . | . | . |
| s6 screen graffiti | . | . | . | . | . | . | . | # | # | P | # | # | # | R | # | # | # | . | . | . | . |
| s7 missing regular | . | . | . | . | . | . | . | # | M | # | # | # | # | # | # | # | F | # | # | . | . |
| ordinary police work | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |

Officers on the small cases: s1 H and D, s2 E, s3 F, s4 D, s5 H, s6 G, s7 C. The boss case belongs to pair 1 (A and B) and pair 2 (C and D) first, and to every other officer at least once.

## 2. Where the cases cross

Each crossing: the small case owns a bridge clue (`sN-c01`), and the boss case pays it on the crossing day. The shared thing is the same in every boss case, the local meaning differs (see notes/crossovers.md).

| Day | Small case | Crosses | Shared | Bridge clue pays on |
|---|---|---|---|---|
| d07 and d12 | s4 pickpocket | b2, b5 | envelope lifted d07, thief arrested d12 | d12 |
| d08 to d09 | s1 muggings | b1, b3, b5 | arrested mugger carries a paper route slip | d09 |
| d09 | s2 delivery | b4, b1 | parcel found with a false bottom | d09 |
| d09 and d17 | s7 missing resident | b1, b3, b5 | the informant vanishes d09, found d17 | d17 |
| d09 to d10 | s3 stall fire | b1, b2 | arson suspect arrested at market-plaza | d09 |
| d10 and d14 | s6 graffiti | b3, b4 | poster 4 covered d10, restored d14 | d14 |
| d11 | s5 lurker | b5, b3 | lurker caught watching the platform | d11 |

## 3. Boss case lanes (one is played; each shows its own spine beside the fixed lanes)

Days 1 to 7: small repeated oddities. Days 8 to 11: the crossings land. Days 11 to 15: the frame, the stakeout, the safe house. Days 14 to 21: the arrest, by variant.

| Case (arc) | Cover face | Informant gone, found | B framed, suspended, cleared | Safe house burned | Base arrest | Careless, stations cooperating | Careful |
|---|---|---|---|---|---|---|---|
| b1 long queue | noodle stall keeper, town-square | d09, d17 | d10 to d11, d12, d18 | d15 | d19 to d20 | d14, closed d15 | d21 (second safe house d19 to d20) |
| b2 door work | Dome door worker | d11, d16 to d17 | d05 to d07, d14 to d15, d17 to d18 | d13 | d19 to d21 (careful is the base) | d13 to d14, closed d15 | d19 to d21 |
| b3 the regular | bath house regular | d09, d17 (g2 clerk gone d07) | d13, d13, d14 | d13 | d18 | d14, closed d15 | d20 to d21 |
| b4 dead drop days | logistics hub dispatcher | d12, d16 | d11, d13, d15 | d15 | d17, closed d18 | d15 | d19 to d21 |
| b5 last train | metro platform attendant | d09, d17 | d10, d14 to d15, d17 | d13 | d18 | d14, closed d15 | d20 |

Careless: fewer layers, one safe house, caught sooner when station 2 cooperates (flag station2:cooperating, d10 to d12). Careful: extra go-between g3, a second safe house, one extra inside officer per extra station, arrest only d19 to d21.

## 4. The pair threads across the cases

| Case | Pair 1 (A and B) | Pair 2 (C and D) |
|---|---|---|
| b1 | P1-1 to P1-4 | P2-1 to P2-2 |
| b2 | P1-2 to P1-5 | P2-2 to P2-3 |
| b3 | P1-2 to P1-4 | P2-3 to P2-4 |
| b4 | P1-3 to P1-5 | P2-1 to P2-3 |
| b5 | P1-3 to P1-5 (B arrests A) | P2-4 to P2-5 (torch passed) |

## 5. Event table (hand-kept; chapter is the game day)

| When | Event | Arc | Chapter |
|------|-------|-----|---------|
| d01 to d02 | Routine set at the cover face; first oddity planted in every boss case | boss cases | chapter-01 |
| d02 | Lift lobby muggings begin | s1-lift-lobby-muggings | chapter-02 |
| d03 | Parcel vanishes between logistics-hub and a doorstep | s2-missing-delivery | chapter-03 |
| d04 | Lurker first seen on the metro platform | s5-platform-lurker | chapter-04 |
| d05 | Stall burns at market-plaza | s3-stall-fire | chapter-05 |
| d06 | Stub on the floor at sky-mall | s4-sky-mall-pickpocket | chapter-06 |
| d07 | Envelope lifted on a bench; the clerk is gone in b3 | s4-sky-mall-pickpocket | chapter-07 |
| d08 | Mugger arrested; graffiti begins; informant last seen | s1-lift-lobby-muggings | chapter-08 |
| d09 | Informant missing; parcel found with a false bottom; arson suspect held | s7-missing-regular | chapter-09 |
| d10 | Poster 4 covered on the station screens | s6-screen-graffiti | chapter-10 |
| d11 | Lurker caught on the platform | s5-platform-lurker | chapter-11 |
| d12 | Thief arrested at sky-mall; B suspended on the screens in b1 | s4-sky-mall-pickpocket | chapter-12 |
| d13 | Safe house opened and found cleaned out in b2, b3 and b5 | boss cases | chapter-13 |
| d14 | Poster 4 restored; careless cases arrest with station 2 | s6-screen-graffiti | chapter-14 |
| d15 | Safe house found in b1 and b4; B cleared in b4 | boss cases | chapter-15 |
| d17 | Informant found on the lawn | s7-missing-regular | chapter-17 |
| d18 | B cleared; base arrests in b3 and b5 | boss cases | chapter-18 |
| d19 to d21 | Careful variant: second safe house, extra insider, arrest | boss cases | chapter-19 |
