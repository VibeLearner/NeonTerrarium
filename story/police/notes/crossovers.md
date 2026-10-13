# Crossover specs (fixed; read with master-design.md)

Rule: the SMALL case owns one bridge clue `sN-c01`, planted inside the small case, paid off on the crossover day. Both sides write a matching row/beat. Boss arcs tag the crossing beat `[x:<small-arc-id>]` and put `pay sN-c01` in its Clue column. Small arcs have a CROSSOVER table with one row per boss case. The shared thing is the same in every boss case it crosses; each boss case supplies the local meaning (below).

| Small case | Boss case | Day | What crosses | Local meaning in the boss case |
|---|---|---|---|---|
| s1 lift lobby muggings (arc s1-lift-lobby-muggings) | b1 | d08-d09 | the arrested mugger carries a paper route slip (document) | slip lists the Square stalls and a payday; the mugger carried bowls for g1 |
| s1 | b3 | d08-d09 | same slip | slip lists bath-house/tea-counter and a locker number |
| s1 | b5 | d08-d09 | same slip | slip lists the metro platform lost property bin and a train time |
| s2 missing delivery (s2-missing-delivery) | b4 | d09 | parcel found with a false bottom (document: label) | label under the dispatcher's terminal id; this is the dead drop |
| s2 | b1 | d09 | same parcel found | label is in the noodle stall's script (a bowl lid number); the Square's tip rides in parcels |
| s3 stall fire (s3-stall-fire) | b1 | d09-d10 | arson suspect arrested at market-plaza | a stall refused the weekly tip; suspect was paid by g1 |
| s3 | b2 | d09-d10 | same suspect | the suspect is the snack stand worker's cousin; fire was a warning for a refused cloakroom cut |
| s4 sky mall pickpocket (s4-sky-mall-pickpocket) | b2 | d07 and d12 | envelope lifted d07, thief arrested d12 | envelope holds Dome snack tokens and tabs, not cash |
| s4 | b5 | d07 and d12 | same | envelope holds lost property tags with a platform number |
| s5 platform lurker (s5-platform-lurker) | b5 | d11 | lurker caught watching the platform | lurker is a lookout who reports train times to the platform attendant |
| s5 | b3 | d11 | same lurker | lurker also sat across from the tea counter; a lookout for the regular |
| s6 screen graffiti (s6-screen-graffiti) | b3 | d10 and d14 | poster covered d10, restored d14 | the covered poster is the missing clerk g2 |
| s6 | b4 | d10 and d14 | same | the covered poster is the courier g1 who works doorsteps |
| s7 missing regular (s7-missing-regular) | b1 | d09 and d17 | resident goes missing d09, found d17 | the missing resident is the informant (vending machine restocker) |
| s7 | b3 | d09 and d17 | same | the missing resident is the informant (front desk attendant) |
| s7 | b5 | d09 and d17 | same | the missing resident is the informant (lost property clerk) |

Small case owners and leads: s1 H and D, s2 E, s3 F, s4 D, s5 H, s6 G, s7 C.
In a boss case that does not list a small case, that small case still runs unchanged as background.

## Final bridge payoff days (as built)
s1-c01 d09, s2-c01 d09, s3-c01 d09, s4-c01 d12, s5-c01 d11, s6-c01 d14, s7-c01 d17. Each is planted at least two days earlier except s2/s3/s5 where the bridge clue is planted d07 and paid d09 to d11. Boss rows on the first crossing day carry the tagged beat; the pay token sits on the row that contains the payoff day.
