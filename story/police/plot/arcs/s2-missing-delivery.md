---
name: "Missing Delivery"
type: subplot
status: planned
characters: [desk-sergeant, family-caller-officer, go-between-courier, night-stakeout-officer, s2-hub-clerk, s2-neighbor, s2-recipient]
themes: ["ordinary faces"]
acts: [act-1, act-2, act-3]
---
# Missing Delivery

## Setup
A parcel scanned out of the logistics hub at 02:58 never reaches door 4C. The recipient waits at the hub counter with a receipt. E takes the case on nights, between calls from home.

## Rising Action
The route log shows a 40 second stop at 4D. A figure in a delivery jacket waits at 4C and then at 4D. A clerk carries out a taped box. E is late to a handoff and H covers.

## Climax
d09: the neighbor at 4D hands E a sealed box she never ordered. E lifts the lid and a false bottom, and the label under it matches the strip from the bay rail.

## Resolution
The box and label go to the evidence desk. E stakes door 4D once more on d10 and the jacket comes back to an empty step. E is granted leave to see family.

## Cast and hidden truth
The parcel was a dead drop meant for door 4C's pickup but a terminal edit typed 4D, so the bot left it with an old woman who never opened it. The figure in the jacket (g1) came for it twice and found nothing. The label carries the dispatcher's terminal id and a bowl lid number, the thread boss helpers pull in b4 and b1. The clerk and the 4C resident are innocent.

Minor characters: s2-recipient, s2-hub-clerk, s2-neighbor.

## Truths
| Truth id | Truth | Planted clues (2+) | Payoff day | Red herrings |
|---|---|---|---|---|
| s2-t1 | The parcel was routed to door 4D, not 4C, after a terminal edit at 02:58. | s2-c02 (d03), s2-c03 (d04) | d09 | s2-c08 |
| s2-t2 | Someone other than the recipient was waiting for the parcel at the doors. | s2-c04 (d05), s2-c05 (d07) | d09 | s2-c09 |
| s2-t3 | The parcel never left the building: it sat unopened at 4D, and it is heavier than its listed contents. | s2-c06 (d06), s2-c07 (d08) | d09 | - |

## Beat ledger (BASE)
| Day range | Beat title | Who | Where | What a camera sees | Channel | Clue | State set |
|---|---|---|---|---|---|---|---|
| d03 | Vanished | s2-recipient, s2-hub-clerk, family-caller-officer | logistics-hub | stand: recipient at the hub counter holding a receipt for door 4C; point: recipient at the hub screen; read-notice: screen line P-7731, out for delivery 02:58, door 4D; shrug: clerk | seen+document | plant s2-c02 | - |
| d04 | Bot log | family-caller-officer, s2-hub-clerk | logistics-hub | search: E at the bay terminal; read-notice: route log, stop at door 4D 03:07 for 40 seconds; leave: clerk leaves 22:00 carrying a taped box; phone-call: E, one side, 'Not now, Mama' | document+seen | plant s2-c03, herring s2-c08 | - |
| d05 | Jacket at 4C | go-between-courier, family-caller-officer | tenements | wait-outside: figure in a delivery jacket outside door 4C 03:05; knock-and-wait: figure at 4C, nobody answers; walk: figure leaves empty-handed; police-patrol: E on the floor above | seen | plant s2-c04 | - |
| d05 | Late handoff | family-caller-officer, night-stakeout-officer | lift | phone-call: E in the lift, one side, 'Put him on'; leave: E leaves the meeting point 02:30; enter: E back at 02:42; wait-outside: H at the meeting point | phone+seen | - | E:late |
| d06 | Mama's neighbor | family-caller-officer | lift | phone-call: E, one side, 'A box at 4D? She did not open it? Mama, slow down'; stand: E in the lift hall; point: E at the hub screen photo of 4D | phone | plant s2-c06 | - |
| d06 | Heavy box | s2-recipient | tenements | carry: recipient out of door 4C with a heavy box 05:00; walk: recipient to the lift; enter: recipient into the lift | seen | herring s2-c09 | - |
| d07-d08 | Strip on the rail | family-caller-officer | logistics-hub | search: E along the bot bay rail; pick-up: peeled label strip with four digits; read-notice: weigh slip 3.4 kg for a 1.1 kg kettle | seen+document | plant s2-c01, plant s2-c07 | - |
| d07 | Jacket at 4D | go-between-courier | tenements | wait-outside: figure in a delivery jacket outside door 4D 03:00; knock-and-wait: figure at 4D, nobody answers; leave: figure leaves empty-handed | seen | plant s2-c05 | - |
| d08 | Gift receipt | s2-hub-clerk, family-caller-officer | logistics-hub | hand-over: clerk hands E a receipt for a kettle gift; read-notice: E reads the date, d04 21:40 | document | debunk s2-c08 | - |
| d08 | Tool crate | s2-recipient, family-caller-officer | tenements | carry: recipient shows E a crate of tools; point: recipient at a work ticket; read-notice: E reads the ticket, shift 05:15 | document | debunk s2-c09 | - |
| d09 | Box at 4D | s2-neighbor, family-caller-officer | tenements | knock-and-wait: E at door 4D; hand-over: neighbor hands E a sealed box; search: E lifts the lid and the false bottom; read-notice: E reads the label under the bottom, T-4417, same digits as the strip | seen+document | pay s2-c01, pay s2-c02, pay s2-c03, pay s2-c04, pay s2-c05, pay s2-c06, pay s2-c07 | case:s2-parcel-found |
| d09 | Label logged | family-caller-officer, desk-sergeant | police-station | carry: E brings the box to the evidence desk; hand-over: E hands the label to the desk sergeant; sit: E at the desk | document | - | - |
| d10 | Door 4D at 03:00 | family-caller-officer, night-stakeout-officer, go-between-courier | tenements | stakeout: E and H at the end of the fourth floor corridor 03:00; wait-outside: figure in a delivery jacket at door 4D; knock-and-wait: figure at 4D, nobody answers; leave: figure leaves empty-handed; phone-call: E, one side, 'Ten minutes, Mama' | seen+phone | - | E:leave-granted |

## Crossover
| Case | Day | Shared | Clue or flag |
|---|---|---|---|
| b4-dead-drop-days | d09 | parcel found with a false bottom (document: label); the label sits under the dispatcher's terminal id; this is the dead drop | s2-c01 |
| b1-long-queue | d09 | same parcel found; the label is in the noodle stall's script (a bowl lid number); the Square's tip rides in parcels | s2-c01 |

The label on the box is the shared document. In b4 it names the dispatcher's terminal id (T-4417 is the strip digits). In b1 the same number appears as a bowl lid number.

## Officer dynamics
No pair ladder. E and H (colleagues, night shift): H covers E's late handoff on d05. E ends with leave granted on d10, as the family calls ease.

## Clues, questions, promises
- s2-c01: Peeled label strip (d07 to d09)
- s2-c02: Screen says 4D (d03 to d09)
- s2-c03: Route log stop (d04 to d09)
- s2-c04: Jacket at 4C (d05 to d09)
- s2-c05: Jacket at 4D (d07 to d09)
- s2-c06: Mama's neighbor and the box (d06 to d09)
- s2-c07: Weigh slip mismatch (d08 to d09)
- s2-c08: Clerk carries a taped box (d04 to d08, red herring)
- s2-c09: Recipient carries a heavy box (d06 to d08, red herring)
- s2-q01: Where did the parcel go between the hub and door 4C? (d03 to d09)
- s2-q02: Who waits at the doors at 03:00? (d05 to d09)
- s2-q03: Why does the screen say 4D? (d03 to d09)
- s2-q04: Why does the clerk carry a taped box out at night? (d04 to d08)
- s2-p01: E promises the recipient an answer by the weekend (d03 to d09)
- s2-p02: E promises his mother a night off (d05 to d10)
