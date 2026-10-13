---
name: "Door Work"
type: main
status: planned
characters: [boss-careful, boss-careless, inside-officer, inside-officer-extra, framed-officer, veteran-officer, rookie-officer, family-caller-officer, burnout-officer, desk-sergeant, night-stakeout-officer, go-between-courier, go-between-bartender, informant, red-herring-night-courier, red-herring-stall-neighbor]
themes: ["ordinary faces", "a door has a schedule"]
acts: [act-1, act-2, act-3]
---
# Door Work

Arc id b2-door-work, clue prefix b2. Cover face: the door worker at neon-dome/door-staff. Default variant CAREFUL. The BASE ledger below is the CAREFUL default (g3 bartender, two safe houses, extra inside officer at station 2, arrest d20). The CAREFUL delta adds extra set-back rows. The CARELESS delta swaps rows out and ends the case d14-d15 with station2:cooperating.

## Setup
The Neon Dome queue is long every night and moves in the wrong order. One door worker waves in people who hand him a snack token. Coats go missing from the cloakroom and walk out the service door in a courier's bag. A and B patrol the Dome on a loop that starts to bend away from the door. B writes everything in a paper notebook.

## Rising Action
Tokens and bar kiosk tabs pass from the door to the bartender to the courier. The courier tries to sell coats in the Market Plaza and one stall refuses. A pickpocket lifts the courier's envelope at the Sky Mall (s4). A stall burns in the Plaza and the arrested man turns out to be the snack stand worker's cousin (s3). The snack stand worker vanishes. B's badge shows on a Dome scan log and then on a wanted poster. The courier's tower unit is searched and the courier is arrested, but evidence from the search goes missing from the station cage under B's badge.

## Climax
B is suspended on the station screens. A swaps shifts so the stakeout watches the wrong door. The informant returns and talks to C. D lays the scan log beside B's desk sign-in sheet. H's comm log times A's call. G corrects the post. A is arrested by B at the front screens. H, C and D open the foundry office and wait there.

## Resolution
The door worker walks into the foundry office at 03:50 on d20 and is arrested by H. The Dome door gets a new worker and the queue moves in order. C finishes his last shift on d21.

## Cast and hidden truth
For the story team only.
- boss-careful: the door worker at neon-dome/door-staff. Sells queue priority for snack tokens and fences coats from the cloakroom. Works only some weekdays. Never speaks to an officer.
- go-between-courier (g1): carries coats and envelopes. Takes the bag from the bartender at the kiosk back door. Uses lifts. Runs the luxury-tower unit 31C as the first safe house.
- go-between-bartender (g3): bar kiosk. Serves one regular first, hands over tabs. Walks to the foundry at 04:10 after close. Foundry office is the second safe house.
- inside-officer (A): leaks patrol routes, skips the Dome door on scans, borrows B's badge and handheld for the theft-night scans, signs the evidence cage out under B's number, swaps shifts with G before the stakeout.
- inside-officer-extra (station 2): sits apart, leaves first, takes the same call ("Not here."), asks what station 1 is working.
- informant: snack stand worker. Sees tokens move, says nothing. Cousin arrested in the fire case. Disappears d11, returns to C d16.
- red-herring-night-courier (rh1): queues at 02:00 and runs from D. Visits a partner who cleans the Dome and hides it from a landlord.
- red-herring-stall-neighbor (rh3): argues with door staff over a blocked loading bay. Owes rent. The heavy bag is stock.
- Framing: A used B's badge on the scan terminal on theft nights, the face-match tool was fed B's badge photo for the poster, and the missing evidence tag carries B's number.

## Truths
| Truth id | Truth | Planted clues (2+) | Payoff day | Red herrings |
|---|---|---|---|---|
| b2-t1 | Queue priority is sold for snack tokens at the door | b2-c01 (d01), b2-c05 (d03) | d12 | b2-c02, b2-c09 |
| b2-t2 | Tokens and tabs run bartender to courier to door | b2-c06 (d04), b2-c11 (d06) | d16 | b2-c09 |
| b2-t3 | A steers patrols and scans away from the Dome | b2-c03 (d02), b2-c07 (d04) | d17 | - |
| b2-t4 | The courier fences cloakroom coats through stalls | b2-c12 (d06), b2-c16 (d08) | d10 | b2-c02 |
| b2-t5 | The luxury-tower unit 31C is a safe house | b2-c15 (d07), b2-c17 (d09) | d13 | b2-c13 |
| b2-t6 | B was framed with his own badge on the scan log | b2-c10 (d05), b2-c14 (d07) | d17 | - |
| b2-t7 | Evidence left the station cage through A | b2-c18 (d11), b2-c19 (d13) | d15 | - |
| b2-t8 | The foundry office is the second safe house | b2-c20 (d13), b2-c21 (d15) | d19 | - |
| b2-t9 | The snack stand worker saw the pattern and stayed quiet | b2-c04 (d02), b2-c08 (d04) | d16 | - |

Red herring clues: b2-c02 (rh3, debunk d14), b2-c09 (rh1, debunk d11), b2-c13 (rh1, debunk d11).

## Beat ledger (BASE)
| Day range | Beat title | Who | Where | What a camera sees | Channel | Clue | State set |
|---|---|---|---|---|---|---|---|
| d01-d03 | Tokens at the door | boss-careful, queue, patrons, veteran-officer, red-herring-stall-neighbor | neon-dome/door-staff | stand: C at the corner counts the queue with lips moving, d01 21:00; queue-order: patron hand-over a snack token to door worker, d01 22:15; wave: door worker lets that patron past 40 waiting; argue: shopkeeper and door worker over a loading bay, point at the bay, d02 18:30; wave: door worker lets a second token holder in, d03 22:40 | seen + conversation | plant b2-c01, herring b2-c02, plant b2-c05 | - |
| d02-d04 | Patrol drifts past the Dome | inside-officer, framed-officer | neon-dome | police-patrol: A and B pass the Dome on a new loop, d02 21:40; police-scan: B scans the door, A stays on the walk and nods at door staff; carry: B writes in a paper notebook; chat: B says "We turned left here yesterday" at the corner, d04 21:35; shrug: A takes the new route | seen + conversation | plant b2-c03, plant b2-c07 | - |
| d02-d04 | Snack stand regular | informant, veteran-officer | neon-dome/snack-stand | serve: snack stand worker serves two cups, d02 22:10; stand: worker faces door staff, then faces the counter top; sit: C at the stand counter, d04 15:00; eat: C and the worker on the same bench, no words; leave: worker leaves first | seen | plant b2-c04, plant b2-c08 | - |
| d04-d06 | Odd hours at the Dome | red-herring-night-courier, family-caller-officer, go-between-bartender, go-between-courier, rookie-officer | neon-dome | queue-order: night courier stands in the queue at 02:00, d04; knock-and-wait: night courier at the staff door 02:05; police-patrol: E walks past; phone-call: E says "Not now, Mama" and "Saturday, I promise", d04 02:10; serve: bartender serves one regular first while 12 wait at the kiosk, d04 23:30; hand-over: bartender gives that regular a paper tab; bump: courier and bartender at the kiosk back door, d06 00:20; hand-over: small paper bag; carry: courier leaves by the service door; run: night courier runs when D calls out, d06 02:00; run: D chases and loses him at the lift | seen + phone | herring b2-c09, plant b2-c06, plant b2-c11, herring b2-c13 | - |
| d05-d07 | Scan log and badge | framed-officer, desk-sergeant, inside-officer | police-station | read-notice: B reads a scan log twice at the front screens, line "badge B, neon-dome door, 23:41", d05; point: B at the line; argue: B and G, B shows the desk sign-in sheet 23:30 to 00:10; stand: A at briefing, d07 07:50; pick-up: A takes B's badge from the locker while B is at briefing; hand-over: A puts the badge back in the locker, d07 15:20 | document + seen | plant b2-c10, plant b2-c14 | B:framed |
| d06-d08 | Coat bags in the plaza | go-between-courier, bystander | market-plaza | carry: courier brings a bag with a Dome tag stub, d06 14:00; hand-over: one stall takes the bag and gives back a thin pouch; carry: courier brings a second bag, d08 14:10; knock-and-wait: courier at a second stall; shrug: stallkeeper pushes the bag back and points at the exit; walk: courier leaves with the bag | seen | plant b2-c12, plant b2-c16 | - |
| d07 | Envelope lifted [x:s4-sky-mall-pickpocket] | go-between-courier, rookie-officer, bystander | sky-mall | carry: courier holds a brown envelope at the rail, 16:20; bump: bystander walks into courier; run: bystander leaves, courier pats pockets and runs after him; chat: D asks the courier what was in the envelope; shrug: courier says "Just paper" | seen + conversation | - | - |
| d07-d09 | Tower unit | go-between-courier, boss-careful | luxury-tower | enter: courier with a takeaway bag rides the lift to floor 31, d07 19:00; knock-and-wait: courier at 31C; enter: courier goes in; walk: door worker in a Dome jacket crosses the lobby, d09 05:30; enter: door worker rides the lift | seen | plant b2-c15, plant b2-c17 | - |
| d09-d10 | Stall fire, cousin held [x:s3-stall-fire] | burnout-officer, informant, bystander | market-plaza | stand: smoke over the stall row, d09 22:00; run: stallkeeper with a bucket; sit: F on the seat 40 minutes, d10 13:20; eat: F at 15:00 alone; search: F opens a man's bag, finds Dome coat tag stubs and a snack token; arrest: F arrests the man, d10 14:10; hug: snack stand worker hugs him before the escort | seen | pay s3-c01, pay b2-c12, pay b2-c16 | - |
| d11 | Stand empty, staff door opens | informant, red-herring-night-courier, veteran-officer | neon-dome/snack-stand | wait-outside: C at the stand, d11 15:00; stand: a stranger serves the counter; point: C at the shutter on the worker's side; hug: night courier and a cleaner at the staff door, d11 02:10; carry: flowers and bread | seen | debunk b2-c09, debunk b2-c13 | inf:missing, rh1:cleared |
| d11-d13 | Evidence cage and station 2 | inside-officer, inside-officer-extra, desk-sergeant, family-caller-officer | police-station | carry: A takes a box out of the cage, d11 21:00; leave: A signs a sheet with a code; sit: station 2 officer sits apart at briefing, d12 07:30; leave: station 2 officer leaves first; chat: station 2 officer asks the desk what station 1 is working; phone-call: station 2 officer says "Not here"; point: E shows the desk a kid's drawing, d12; read-notice: G reads the cage sheet, d13, four logged and three on the shelf | seen + phone + document | plant b2-c18, plant b2-c19 | - |
| d12 | Thief arrested [x:s4-sky-mall-pickpocket] | rookie-officer, go-between-courier, bystander | sky-mall | wait-outside: courier at the rail, d12 16:30; arrest: D arrests the thief, 16:40; search: D opens the brown envelope; read-notice: D reads snack tokens stamped with queue numbers and bar tabs | document + seen | pay s4-c01, pay b2-c01, pay b2-c05 | - |
| d13 | Unit searched | veteran-officer, rookie-officer, inside-officer, go-between-courier | luxury-tower | knock-and-wait: C and D at 31C, d13 06:00; enter: C and D; search: C finds coat bags and snack tokens; arrest: D arrests the courier at the door; stand: A arrives and offers a ride; shrug: courier steps back, refuses; escort: courier to the lift | seen | pay b2-c15, pay b2-c17 | boss:safehouse-burned, g1:arrested |
| d13-d15 | Service door to the foundry | night-stakeout-officer, go-between-bartender, boss-careful | foundry | stakeout: H at the Dome service door, d13 04:00; walk: bartender leaves the service door at 04:10 and walks to the foundry; enter: bartender goes in the office door; sit: H with a flask, d15 03:30; stakeout: H again; enter: door worker in a Dome jacket goes into the foundry office, d15 04:00; leave: H leaves a paper cup on the ledge | seen | plant b2-c20, plant b2-c21 | H:stakeout |
| d14-d15 | Poster and empty cage | desk-sergeant, framed-officer, rookie-officer, inside-officer, red-herring-stall-neighbor | police-station/front-screens | stand: shopkeeper outside the screens ten minutes, d14; hand-over: shopkeeper gives D a landlord receipt; read-notice: D reads the receipt; carry: shopkeeper opens his bag, bread stock; post-feed: G posts a wanted poster with B's badge photo; argue: B and G over the face match; search: G finds the cage shelf empty, d15; read-notice: sign-out tag shows B's badge number; post-feed: G posts B suspended; sit: B alone at the food-counter | document + feed | debunk b2-c02, pay b2-c18, pay b2-c19 | B:suspended, rh3:cleared |
| d16 | Roster at briefing | desk-sergeant, inside-officer, night-stakeout-officer, burnout-officer | police-station | point: G names the foundry stakeout at briefing; chat: A asks G to swap shifts; hand-over: A and G swap roster slips; sit: F late in the back row, shrugs at G; walk: H leaves for the Dome service door; phone-call: A outside says "Not here"; stakeout: H at the service door while the foundry door stays dark | seen + phone | - | boss:tipped-off |
| d16-d17 | Statement and tab book | informant, veteran-officer, rookie-officer, go-between-bartender | neon-dome | sit: snack stand worker returns and sits by C, d16 15:00; chat: worker tells C he watched tokens pass at the door; point: at the door staff; hand-over: worker gives C a folded page; arrest: D and C arrest the bartender at the kiosk, d16 23:30; search: tab book under the till; read-notice: tab lines match the token numbers | conversation + document | pay b2-c04, pay b2-c08, pay b2-c06, pay b2-c11 | inf:talking, g3:arrested |
| d17-d18 | Log does not fit | rookie-officer, veteran-officer, night-stakeout-officer, desk-sergeant, framed-officer, inside-officer-extra, inside-officer | police-station | read-notice: D lays the scan log beside B's sign-in sheet, d17; point: D at 23:41; chat: C says "Ask who held the handheld"; phone-call: A outside says "Not here", overheard; read-notice: H lays the comm log with the time of the call; post-feed: G posts a correction removing B, d18; hand-over: B gives his notebook to G; leave: station 2 officer clears the desk | document + feed + phone | pay b2-c10, pay b2-c14, pay b2-c03, pay b2-c07 | G:corrected-post, B:cleared, station2:insider-exposed |
| d19 | A at the front screens | framed-officer, inside-officer, desk-sergeant | police-station/front-screens | stand: A at the screens, d19 07:50; walk: B walks up to A; arrest: B arrests A; escort: B and A past the screens; stand: G watches | seen | - | A:arrested |
| d19-d21 | Foundry office | veteran-officer, rookie-officer, night-stakeout-officer, boss-careful | foundry | search: C and D open the foundry office, d19; point: D at coat bags and a cage evidence tag; stakeout: H, C and D at the door, d20 03:50; enter: door worker with a key goes into the office; arrest: H arrests the door worker, 04:05; escort: out past the gate; wave: C leaves at 16:00, d21 | seen | pay b2-c20, pay b2-c21 | boss:safehouse2-burned, boss:arrested, case:closed |

## Careless delta
BASE is CAREFUL. These rows replace or remove base rows when the roll is CARELESS and stations cooperate (arrest d14, closed d15). Removed: g3 bartender, foundry office, inside-officer-extra, the d16 and d17 beats of the base, and base beats from "Service door to the foundry" on.

| Day range | Beat title | Who | Where | What a camera sees | Channel | Clue | State set |
|---|---|---|---|---|---|---|---|
| d04-d06 | Odd hours at the Dome [CARELESS] | go-between-courier, red-herring-night-courier, family-caller-officer | neon-dome/bar-kiosk | wait-outside: courier at the kiosk window, d04 23:30; hand-over: kiosk staff gives courier the paper tab directly | seen | - | - |
| d11-d13 | Evidence cage and station 2 [CARELESS] | desk-sergeant, inside-officer | police-station | chat: G and the station 2 desk compare the cage sheet, d12; read-notice: G reads the sheet, d13 | seen + document | - | station2:cooperating |
| d13-d14 | Door worker held at the door [CARELESS] | veteran-officer, rookie-officer, night-stakeout-officer, boss-careful | neon-dome/door-staff | stakeout: H at the corner, d14 02:00; stand: C and D beside the queue; arrest: H arrests the door worker at the door, 02:20; escort: door worker past the queue | seen | - | boss:arrested |
| d14 | A at the front screens [CARELESS] | framed-officer, inside-officer, desk-sergeant | police-station/front-screens | walk: B walks up to A; arrest: B arrests A; post-feed: G posts a correction removing B | seen + feed | - | A:arrested, B:cleared |
| d15 | Queue in order [CARELESS] | queue, patrons, veteran-officer | neon-dome/door-staff | queue-order: patrons file in one by one; wave: C leaves at 16:00 | seen | - | case:closed |

## Careful delta
Extra set-back rows added on top of BASE for the CAREFUL roll (arrest holds at d20). No new clues.

| Day range | Beat title | Who | Where | What a camera sees | Channel | Clue | State set |
|---|---|---|---|---|---|---|---|
| d08-d09 | Door worker swaps nights [CAREFUL] | boss-careful, patrons | neon-dome/door-staff | stand: door worker at the door on Tuesday and Friday, d08 22:00; stand: a stand-in at the door the other nights; queue-order: patrons file in one by one under the stand-in | seen | - | - |
| d10 | Bartender covers for the courier [CAREFUL] | go-between-bartender, go-between-courier | neon-dome/bar-kiosk | wave: courier waves off at the lift hall and skips the kiosk, d10 00:15; carry: bartender takes a paper bag out the service door, 00:20 | seen | - | - |
| d12 | Station 2 skips the door [CAREFUL] | inside-officer-extra | neon-dome | police-patrol: station 2 officer passes the Dome, d12 21:50; walk: past door staff; wave: door worker nods | seen | - | - |
| d14 | Station 2 asks twice [CAREFUL] | inside-officer-extra, desk-sergeant | police-station | chat: station 2 officer asks G about the cage, d14; point: at the sheet; chat: asks again an hour later | seen + conversation | - | - |
| d17 | Foundry lock replaced [CAREFUL] | boss-careful | foundry | carry: door worker brings a new lock to the office door, d17 03:00; leave: door worker walks off before dawn | seen | - | - |
| d19 | Door worker at the door at close [CAREFUL] | boss-careful, night-stakeout-officer | neon-dome/door-staff | stand: door worker at the door, d19 02:00; stakeout: H at the foundry gate, waits, no one comes | seen | - | - |

## Crossover
| Case | Day | Shared | Clue or flag |
|---|---|---|---|
| s3-stall-fire | d09-d10 | arson suspect arrested at market-plaza is the snack stand worker's cousin; the fire was a warning for a refused cloakroom cut | s3-c01 (pay on beat "Stall fire, cousin held") |
| s4-sky-mall-pickpocket | d07 | envelope lifted from the courier holds Dome snack tokens and tabs, not cash | s4-c01 (pay on beat "Envelope lifted") |
| s4-sky-mall-pickpocket | d12 | thief arrested; tokens stamped with queue numbers | s4-c01 (pay on beat "Thief arrested") |

## Officer dynamics
- Pair 1 (A + B): starts P1-2 (small lies, d01), P1-3 on d04 (A changes routes, B says it aloud), P1-4 on d15 (B suspended, A cold), ends P1-5 on d19 (B cleared, A arrested late by B).
- Pair 2 (C + D): starts P2-2 (D impatient, runs after the night courier d06, C holds him back), ends P2-3 (D ahead: lays the log beside the sign-in sheet d17).
- E: phone calls one side, one promise to a kid. F: burning out, sits and eats alone, makes the fire arrest. G: screens and posters, posts then corrects. H: stakeout at the service door and foundry. 

## Clues, questions, promises
Clues (continuity/clues): b2-c01 token passes at the door; b2-c02 rh3 argues with door staff; b2-c03 A skips the door scan; b2-c04 worker faces door then floor; b2-c05 waved in past forty; b2-c06 regular served first with a tab; b2-c07 "We turned left here yesterday"; b2-c08 silent bench; b2-c09 rh1 queue at 02:00; b2-c10 scan log with B's badge; b2-c11 kiosk back door bump; b2-c12 coat bag at a stall; b2-c13 rh1 runs from D; b2-c14 badge out of the locker; b2-c15 takeaway to 31C; b2-c16 stall pushes the bag back; b2-c17 Dome jacket in the tower lobby; b2-c18 cage sheet signed by code; b2-c19 four logged and three shelved; b2-c20 04:10 walk to the foundry; b2-c21 door worker into the foundry office.
Questions (continuity/questions): b2-q01 to b2-q08.
Promises (continuity/promises): b2-p01 B's notebook, b2-p02 C's last shift, b2-p03 E's promise to a kid, b2-p04 H's three nights.
