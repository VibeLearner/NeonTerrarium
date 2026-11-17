// Voices: how each crowd asks for a drink and reacts to it. Same meaning, different words.
//
// Every line keeps a plain cue word for the taste (kick or strong, sweet or sugar, sour or tart or tang, bitter or bite,
// fresh, smoke, heat or spicy, smooth or balanced, layers or simple) and a plain cue for how much (none, a touch, some,
// real, as much as possible), so the player always knows what's meant. The flavor is in the picture around it:
//   industrial   blunt, short, shop floor and machines
//   residential  warm, chatty, home and neighborhood
//   commercial   brisk, polished, office and sales talk
//   luxury       refined, understated, old things and fine things
//
// ask[note][level]: level 0 none, 1 low, 2 mid, 3 high, 4 max. Lines are written without the final period.
// more/less/spot: what they say when a note was too low, too high, or just right. tier: their verdict line.
// mood: how they say their mood (rough shift, celebrating, hungover, restless).
//
// pickLine() never repeats a line until every other line in its set has been used (a shuffled deck per set).

const I = {
  ask: {
    strength: [
      ["no booze, I'm driving the loader in the morning", "zero alcohol, early shift", "skip the hard stuff tonight, no alcohol"],
      ["easy on the booze", "just a splash of the hard stuff", "light on the booze, I'm back on at six"],
      ["some kick, not a knockout", "a decent kick", "medium strength, I've earned that much"],
      ["a real kick, none of that watered stuff", "strong enough to strip paint", "strong. Make it count"],
      ["strong enough to erase my shift", "as strong as the furnace gets", "max strength, knock me flat"],
    ],
    sweet: [
      ["no sugar, I'm not a kid", "no sweet stuff", "keep the sugar off the line"],
      ["go easy on the sugar", "barely sweet", "a pinch of sugar, no more"],
      ["sweet enough to notice", "some sweetness, like a vending machine snack", "medium sweet"],
      ["sweet like a cheap energy drink", "properly sweet, I skipped lunch", "real sweet, sugar rush sweet"],
      ["sweet enough to gum up the gears", "pour the whole sugar drum in", "max sweet, rot my teeth"],
    ],
    sour: [
      ["no sour, my stomach's shot", "no sour stuff", "keep it off the tart side, zero sour"],
      ["a lick of tang", "a touch tart", "barely sour"],
      ["some tart, cuts through the dust", "some sour, cuts the grease", "medium sour, nothing crazy"],
      ["sharp and sour, wakes the crew up", "properly sour, like old battery acid", "real tart, make me squint"],
      ["sour enough to clear a hangover in one go", "as sour as it goes", "max sour, strip the rust off my tongue"],
    ],
    bitter: [
      ["no bitter, I've had enough shop coffee", "no bitter stuff", "zero bite, skip the bitter"],
      ["a scrap of bitter", "a touch of bitter", "just a little bite"],
      ["a bitter edge, like burnt toast", "some bitter, like shop coffee", "some bitter, keeps me honest"],
      ["bitter with a mean bite", "properly bitter, like a foreman's mood", "real bitter, real bite"],
      ["bitter as a pay cut", "as bitter as you've got", "max bitter, chew me up"],
    ],
    fresh: [
      ["nothing green, I'm not a salad", "no fresh herb stuff", "skip the garden, nothing fresh"],
      ["a little fresh lift", "a lick of fresh", "just a bit fresh, clear the fumes"],
      ["fresh, simple as that", "some fresh, like air after the vents kick on", "medium fresh"],
      ["bright and fresh, like morning rain on the yard", "real fresh, blow the dust out", "real fresh"],
      ["fresh like a hose-down after shift", "as fresh as it gets", "max fresh, like I've never seen a smokestack"],
    ],
    smoke: [
      ["can't do smoke tonight", "no smoke, I breathe enough of it", "zero smoky stuff"],
      ["a puff of smoke", "a touch smoky", "a whiff of smoke"],
      ["smoky, like the yard at dusk", "some smoke, like the welding bay", "medium smoke"],
      ["smoky like a forge", "real smoky, like the furnace door", "real smoky"],
      ["pure exhaust, the good kind", "as smoky as you can", "max smoke, like the stack on a bad day"],
    ],
    spice: [
      ["keep the heat off", "nothing spicy, pal", "zero heat, my stomach's done"],
      ["a bit of warmth, it's cold in the yard", "a touch of heat", "barely any heat"],
      ["some heat, like a space heater", "medium spicy, like a hot plate", "a bit of heat, a little burn"],
      ["spicy, wake up my tongue", "real heat, like a fresh weld", "real spicy"],
      ["hot enough to see sparks", "as hot as you can make it", "max heat, melt the casing"],
    ],
    complexity: [
      ["simple, nothing fancy", "keep it simple", "simple, I don't need a story"],
      ["simple, nothing fancy", "keep it simple", "simple, I don't need a story"],
      ["a few layers, sure", "a couple of layers, nothing fancy", "some layers, if you can"],
      ["layers that keep changing", "lots of layers, surprise me", "a drink with layers, like a good engine"],
      ["layers on layers, a whole story", "as many layers as you can stack", "max layers, keep me guessing"],
    ],
    balance: [
      ["rough's fine, I'm rough too", "rough is fine, I'm not fussy", "don't care if it's rough"],
      ["rough's fine, I'm rough too", "rough is fine, I'm not fussy", "don't care if it's rough"],
      ["smooth enough to go down easy", "mostly smooth", "smooth-ish, no sharp edges"],
      ["smooth, nothing rattling", "balanced, like a good machine", "properly smooth"],
      ["perfectly balanced, like a tuned engine", "smooth as a fresh bearing", "dead level balanced, not a wobble"],
    ],
  },
  more: {
    strength: ["Needs more kick, pal.", "Where's the kick? Weak.", "Tastes like the break room tap. More booze."],
    sweet: ["More sugar. Seriously.", "Needs more sugar.", "Not sweet enough, pal."],
    sour: ["Not enough tang.", "More sour next time.", "Wanted more tart in it."],
    bitter: ["Where's the bite? More bitter.", "Not bitter enough.", "Needs more bitter, it's too soft."],
    fresh: ["Needs more fresh lift.", "Wanted it fresher.", "Bit stale. More fresh."],
    smoke: ["Needs smoke. More of it.", "Where's the smoke?", "Not smoky enough for me."],
    spice: ["Crank up the heat.", "Needs more spicy.", "Barely any heat. Turn it up."],
    complexity: ["Too simple. Give it layers.", "Wanted more layers.", "One note. Needs layers."],
    balance: ["Bit rough. Smooth it out.", "Too rough, even for me.", "Rattles like a loose bolt. Smoother."],
  },
  less: {
    strength: ["Too strong, even for me.", "Whoa. Too much booze.", "Too strong, my eyes are watering."],
    sweet: ["Too sweet, gums up my teeth.", "Way too sweet.", "Too much sugar, my teeth hurt."],
    sour: ["Ugh, too sour.", "Too tart, ugh.", "Too much sour, my face is stuck."],
    bitter: ["Too bitter, pal.", "Bite's too much. Too bitter.", "Way too bitter, like burnt coffee."],
    fresh: ["Too green, like chewing grass.", "Too fresh, tastes like lawn.", "Too much fresh herb stuff."],
    smoke: ["Too smoky, I'm coughing.", "Too much smoke, I get enough at work.", "Like licking the stack. Too smoky."],
    spice: ["Too hot, pal!", "Too spicy!", "Too much heat, I'm sweating."],
    complexity: ["Too many layers going on in there.", "Too many layers, pal.", "Too busy. Simpler."],
    balance: ["Too smooth. Boring.", "Too polished, where's the edge?", "Too smooth for me."],
  },
  spot: {
    strength: ["Kick's perfect.", "Kick's right where I want it.", "Now that's a kick."],
    sweet: ["Sweet. Just right, pal.", "Sugar's spot on.", "Sweet enough. Nice."],
    sour: ["Tang's perfect.", "Sour's dead on.", "Tart enough. Good."],
    bitter: ["Bite's perfect.", "Bitter, my kind of bitter.", "Good bite on it."],
    fresh: ["Real fresh.", "Fresh, like the yard after rain.", "Fresh. Clears the fumes right out."],
    smoke: ["Good smoke.", "Smoke's perfect.", "Smoky like the yard. Love it."],
    spice: ["Heat's perfect.", "Heat's spot on.", "Good heat. Real good."],
    complexity: ["Lots of layers. Love it.", "Layers, like a good engine.", "Layers keep changing. Nice."],
    balance: ["Smooth, like a fresh bearing.", "Balanced. Runs clean.", "Runs smooth."],
  },
  tier: {
    Great: ["YES! That's the stuff!", "Oh, that's GOOD. Pour me another!", "Now THAT is a drink!", "Best thing I've had all week!", "Whoa! Hits like a pay raise!"],
    Good: ["Not bad at all!", "Yeah, that works.", "Solid. I'll take it.", "Good stuff, pal.", "That'll do nicely."],
    Meh: ["Eh. It's a drink.", "Hm. Could be worse.", "Not my thing, but fine.", "It's okay, I guess.", "Meh. Drinkable."],
    Bad: ["Ugh! What is this?!", "Blegh. No. Just no.", "Tastes like the coolant tank!", "Nope. Taking that back.", "Oof. That's rough."],
  },
  mood: {
    rough: ["Rough shift.", "Pulled a double at the foundry.", "Twelve hours on the line."],
    celebrating: ["Celebrating! Got the promotion.", "Payday. Celebrating.", "Crew hit quota. Celebrating."],
    hungover: ["Hungover. Head's pounding.", "Rough night last night. Hungover.", "Hungover. Go easy on me."],
    restless: ["Restless. Can't sit still.", "Restless, too much shift coffee.", "Restless. Wired after work."],
  },
}

const R = {
  ask: {
    strength: [
      ["no alcohol for me tonight", "nothing boozy, I've got the kids tomorrow", "alcohol-free, please"],
      ["easy, I want to stay sharp", "just a little alcohol", "light on the booze, it's a school night"],
      ["some kick, nothing wild", "a normal amount of kick", "medium strong, like a Friday"],
      ["something with a real kick", "properly strong, I need it", "strong, like Uncle's home brew"],
      ["as strong as you're allowed", "strong enough to forget my landlord", "maximum kick, I mean it"],
    ],
    sweet: [
      ["zero sugar", "no sugar, I'm cutting back", "nothing sweet, please"],
      ["not too sweet", "just a little sugar", "lightly sweet"],
      ["a little sweet", "sweet, like a bakery bun", "some sweetness"],
      ["sweet, like candy neon", "sweet like Grandma's syrup buns", "properly sweet, I'm treating myself"],
      ["as sweet as you can make it", "dessert-level sweet", "sweet like the whole candy shop"],
    ],
    sour: [
      ["nothing sour", "no sour, it upsets my stomach", "nothing tart, please"],
      ["just a hint of tang", "a squeeze of tart", "a little sour, like a plum"],
      ["a bit tart", "some sour, like pickled plums", "medium sour"],
      ["sharp and sour", "sour like the corner shop's lemon candy", "properly tart"],
      ["sour enough to wake me up", "as sour as you dare", "pucker-up sour, the most you've got"],
    ],
    bitter: [
      ["nothing bitter", "no bitter, please", "nothing with a bite"],
      ["barely bitter", "just a hint of bitter", "a little bite, like dark chocolate"],
      ["a bitter edge", "some bitter, like strong tea", "medium bitter"],
      ["something that bites back", "properly bitter, like Dad's coffee", "real bitter"],
      ["bitter as the bus being late again", "as bitter as my rent increase", "the most bitter thing you can make"],
    ],
    fresh: [
      ["nothing green", "nothing fresh or herby", "skip the fresh stuff"],
      ["a little lift", "a touch of fresh", "just a bit fresh, like an open window"],
      ["fresh", "fresh, like balcony basil", "some freshness"],
      ["bright and fresh, like laundry day sunshine", "really fresh, like the community garden", "properly fresh"],
      ["like breathing on a rooftop garden", "as fresh as spring rain", "the freshest thing you've got"],
    ],
    smoke: [
      ["can't stand smoke", "no smoke, please", "nothing smoky"],
      ["a wisp of smoke", "a little smoky, like a street grill", "just a hint of smoke"],
      ["smoky", "some smoke, like roasted sweet potatoes", "medium smoky"],
      ["really smoky, like the night market grill", "properly smoky", "smoky like a campfire"],
      ["as smoky as you can make it", "smoke on smoke", "the smokiest thing you've got"],
    ],
    spice: [
      ["no heat", "nothing spicy, please", "no spice at all"],
      ["a little warmth", "just a little heat, like ginger tea", "barely spicy"],
      ["some heat", "medium spicy, like noodle stand chili", "a bit of heat"],
      ["spicy", "properly spicy, like Auntie's curry", "real heat"],
      ["hot enough to make me cry", "as spicy as you can make it", "set my mouth on fire, max heat"],
    ],
    complexity: [
      ["simple, nothing fussy", "simple, please", "nothing complicated"],
      ["simple, nothing fussy", "simple, please", "nothing complicated"],
      ["a few layers", "some layers, like a good soup", "a couple of layers"],
      ["something that keeps changing as I drink it", "lots of layers, like Grandma's stew", "layered, surprise me a little"],
      ["layers like Grandma's bedtime stories", "as many layers as you can manage", "layers on layers"],
    ],
    balance: [
      ["rough is fine", "rough is fine, honestly", "I don't mind a rough one"],
      ["rough is fine", "rough is fine, honestly", "I don't mind a rough one"],
      ["smooth enough", "fairly smooth", "smooth-ish"],
      ["smooth, nothing loud", "smooth and comfy, like a favorite sweater", "nice and balanced"],
      ["perfectly balanced", "as smooth as you can make it", "smooth like a warm blanket"],
    ],
  },
  more: {
    strength: ["Needed more kick.", "Could be a bit stronger.", "Hardly any kick in there."],
    sweet: ["Could be sweeter.", "A little more sugar, maybe?", "Needs more sweetness."],
    sour: ["Needed more tang.", "Could use more tart.", "A bit more sour would be nice."],
    bitter: ["Wanted more bite.", "Could be more bitter.", "Needs a bit more bitter."],
    fresh: ["Needed more lift.", "Could be fresher.", "Wanted more fresh in it."],
    smoke: ["Wanted more smoke.", "Could be smokier.", "Needs more smoke."],
    spice: ["Wanted more heat.", "Could be spicier.", "Needs a bit more heat."],
    complexity: ["A bit simple for me.", "Could use more layers.", "A little flat. More layers?"],
    balance: ["A little rough.", "Could be smoother.", "A bit rough around the edges."],
  },
  less: {
    strength: ["Too strong for me.", "Oh, that's strong. Too strong.", "Bit much on the booze."],
    sweet: ["A bit too sweet for me.", "Too sugary, sorry.", "That's too sweet, even for me."],
    sour: ["Too sour.", "Oof, too tart.", "A bit too sour for me."],
    bitter: ["Too bitter.", "That's too bitter, sorry.", "Too much bite for me."],
    fresh: ["Too green.", "A bit too fresh, like eating the garden.", "Too much fresh herb."],
    smoke: ["Too smoky.", "A bit too smoky for me.", "Like a chimney. Too smoky."],
    spice: ["Too hot.", "Too spicy, I need water.", "Way too much heat."],
    complexity: ["Too much going on.", "Too many layers for me.", "A bit busy. Simpler, please."],
    balance: ["Too smooth, almost boring.", "So smooth it's a bit plain.", "Too smooth and tame for me."],
  },
  spot: {
    strength: ["That kick was perfect.", "Just the right kick.", "Strong enough, lovely."],
    sweet: ["Sweet, just right.", "Sweet like Grandma makes it.", "Perfectly sweet."],
    sour: ["That tang was perfect.", "Tart, just right.", "Lovely bit of sour."],
    bitter: ["That bite was perfect.", "Bitter, just how I like it.", "Lovely bite."],
    fresh: ["So fresh.", "Fresh, like an open window.", "Lovely and fresh."],
    smoke: ["Love that smoke.", "Smoky, just right.", "Like the night market. Lovely smoke."],
    spice: ["That heat was perfect.", "Lovely heat.", "Spicy, just right."],
    complexity: ["It keeps changing. I love it.", "So many layers. Lovely.", "Layers, like a good stew."],
    balance: ["So smooth.", "Smooth like a warm blanket.", "Lovely and balanced."],
  },
  tier: {
    Great: ["Oh, this is wonderful!", "Oh wow, I love this!", "This is just perfect, thank you!", "Oh, I could hug you!", "This tastes like home. Amazing!"],
    Good: ["Nice. I like it.", "Oh, that's lovely.", "Mm, that's nice.", "Good one! Thank you.", "That's really nice."],
    Meh: ["Hm. It's okay.", "It's alright, I suppose.", "Not quite my thing.", "Oh. Hm. It's fine.", "Okay. Just okay."],
    Bad: ["Oh dear. No.", "Oh no, that's not good.", "Sorry, I can't drink this.", "Hmm, I'll leave this one.", "Oh! That's awful."],
  },
  mood: {
    rough: ["Rough day.", "Long day with the kids.", "Rough day. The landlord called."],
    celebrating: ["Celebrating! My niece got married.", "Celebrating. Paid off my loan!", "Celebrating with the neighbors."],
    hungover: ["Hungover. Too much karaoke.", "Hungover from the block party.", "A bit hungover, honestly."],
    restless: ["Restless. Can't sleep.", "Restless tonight.", "Restless, the upstairs neighbors are loud."],
  },
}

const C = {
  ask: {
    strength: [
      ["zero alcohol, I have a call later", "keep it alcohol-free, client dinner after", "no booze, I'm still on the clock"],
      ["light alcohol, I need a clear head", "low on the booze, meeting at nine", "a gentle kick, nothing more"],
      ["a moderate kick", "mid strength, keep it professional", "some kick, but presentable"],
      ["a strong one, it's been a long quarter", "real kick, I just closed a deal", "high strength, no half measures"],
      ["the strongest thing on your menu", "maximum strength, I earned the bonus", "full strength, as strong as possible"],
    ],
    sweet: [
      ["zero sugar, I'm on a plan", "sugar-free, please", "no sweetness, keep it lean"],
      ["low on the sugar", "lightly sweet, on-brand subtle", "a low-sugar option"],
      ["a little sweet, like a mint after a meeting", "moderately sweet", "some sweetness, like a promo candy"],
      ["sweet like a launch-party cake", "a sweet one, I'm rewarding myself", "properly sweet, full-sugar edition"],
      ["the sweetest option on the menu", "maximum sweet, the deluxe package", "sweet, all the way up"],
    ],
    sour: [
      ["nothing sour, keep it client-friendly", "zero sour, please", "nothing tart"],
      ["a hint of tang, very subtle", "a subtle tart note", "lightly sour"],
      ["a bit tart, crisp", "some sour, crisp and clean", "a moderate tang"],
      ["sour and sharp, like a deadline", "a bold sour, like a citrus ad", "tart, front and center"],
      ["sour enough for an all-nighter", "maximum sour, high impact", "as tart as it gets"],
    ],
    bitter: [
      ["nothing bitter, I get enough at work", "zero bitter, please", "no bite"],
      ["barely bitter, just a note", "a touch of bitter, like espresso foam", "lightly bitter"],
      ["bitter, with an edge", "some bitter, like the office espresso", "a moderate bite"],
      ["bitter, with real bite", "a bold bitter, like a hostile takeover", "properly bitter"],
      ["bitter as a corp memo", "bitter as a layoff email", "maximum bitter"],
    ],
    fresh: [
      ["nothing green, I'm not a smoothie", "no fresh herbs, please", "hold the fresh stuff"],
      ["a small fresh boost", "lightly fresh", "a fresh accent, subtle"],
      ["fresh and clean", "fresh and crisp, like a new office", "fresh, moderately"],
      ["bright and fresh, like an ad for mountain water", "crisp and very fresh", "a fresh one, really fresh"],
      ["fresh like the lobby's living wall", "as fresh as a product launch", "maximum fresh"],
    ],
    smoke: [
      ["smoke-free, thanks", "zero smoke, I have a presentation", "no smoke at all"],
      ["a light smoky accent", "a subtle smoky note", "lightly smoky"],
      ["smoky, mid-level", "some smoke, like a rooftop grill event", "a moderate smoke"],
      ["like a burnt-out server room", "bold and smoky", "a very smoky one"],
      ["as smoky as a data center fire", "maximum smoke", "as smoky as possible"],
    ],
    spice: [
      ["no heat, keep it mild", "zero spice, please", "nothing spicy, my shirt is white"],
      ["a little warmth, like a heated seat", "lightly spiced", "a subtle heat"],
      ["some heat, nothing risky", "a moderate spice", "some heat, keep it marketable"],
      ["spicy, competitive spicy", "bold heat, like a spicy launch", "high heat, I can handle it"],
      ["hot enough to trend online", "maximum heat", "as spicy as your menu goes"],
    ],
    complexity: [
      ["simple, minimal", "simple, low maintenance", "keep it simple, streamlined"],
      ["simple, minimal", "simple, low maintenance", "keep it simple, streamlined"],
      ["a few layers, well structured", "a couple of layers, well organized", "layers, a reasonable number"],
      ["layers that keep evolving", "layered, like a good pitch deck", "lots of layers"],
      ["a full story arc of layers", "maximum layers, the full roadmap", "layers stacked on layers"],
    ],
    balance: [
      ["rough is fine, ship it", "rough is fine, I'm flexible", "a rough one is acceptable"],
      ["rough is fine, ship it", "rough is fine, I'm flexible", "a rough one is acceptable"],
      ["smooth enough to pass review", "smooth to an acceptable standard", "smooth, within reason"],
      ["clean, nothing loud", "smooth and balanced, nothing off-brand", "polished and smooth"],
      ["balanced to the decimal", "flawlessly smooth, five stars", "perfectly balanced, zero defects"],
    ],
  },
  more: {
    strength: ["Could use more kick.", "Underdelivered on kick.", "Strength is below target."],
    sweet: ["Sweetness needs a bump.", "Sweetness is under budget.", "A bit more sugar next time."],
    sour: ["Tang is too low.", "The sour needs a boost.", "More tart, please."],
    bitter: ["Bite is too soft. More bitter.", "Bitter's underperforming.", "Could use more bitter."],
    fresh: ["Needs a fresh lift.", "Freshness is a bit low.", "Needs to be fresher."],
    smoke: ["Smoke is too light.", "The smoke needs to scale up.", "Needs more smoke presence."],
    spice: ["Heat is too timid.", "Heat is under target.", "Spice needs a boost."],
    complexity: ["Too simple. More layers.", "Needs more layers.", "A bit one-dimensional. More layers."],
    balance: ["Rough around the edges.", "Needs more polish.", "Not quite smooth enough."],
  },
  less: {
    strength: ["Strength is too high.", "Strength is over budget.", "Too much kick for a weeknight."],
    sweet: ["Too sweet for my plan.", "Sweetness is over target.", "Too sugary."],
    sour: ["Sour is too sharp.", "Sour is overdelivering.", "Too tart."],
    bitter: ["Too bitter for me.", "Bitter's a bit aggressive.", "Way too much bitter bite."],
    fresh: ["Too green, like a smoothie bar.", "A bit too fresh.", "Too herby, too fresh."],
    smoke: ["Smoke is too loud.", "Smoke is over spec.", "Too smoky for me."],
    spice: ["Way too hot.", "Heat is way over spec.", "Too spicy."],
    complexity: ["Too many layers, too many moving parts.", "Too many layers. Streamline it.", "Too many layers. Cluttered."],
    balance: ["Too smooth, no edge.", "So smooth it's forgettable.", "So smooth it's a little too safe."],
  },
  spot: {
    strength: ["Kick: perfect.", "Kick is right on target.", "Strength: exactly right."],
    sweet: ["Sweet, nicely done.", "Sweetness is on point.", "Sweet, exactly right."],
    sour: ["Tang is perfect.", "Sour is on target.", "Crisp tart, well done."],
    bitter: ["Bite, just right.", "Bitter is spot on.", "Great bite."],
    fresh: ["Fresh, very fresh.", "Crisp and fresh. Excellent.", "Freshness is perfect."],
    smoke: ["Smoke: excellent.", "Smoke is right on brand.", "Perfectly smoky."],
    spice: ["Heat: perfect.", "Heat is on target.", "Great heat."],
    complexity: ["Layers keep evolving. Love it.", "Great layers.", "Layered like a good pitch."],
    balance: ["Smooth. Excellent.", "Balanced. Five stars.", "Perfectly polished."],
  },
  tier: {
    Great: ["This is incredible.", "Five stars. Easily.", "Exceeds expectations!", "This is a winner!", "I'm telling the whole office about this."],
    Good: ["Nice. Approved.", "Good work. Really good.", "Solid. Well done.", "This works for me.", "Very nice. I'd order it again."],
    Meh: ["Hm. It's acceptable.", "It meets expectations. Barely.", "It's fine. Just fine.", "Not quite there.", "Three stars, maybe."],
    Bad: ["I'll leave this here.", "This isn't working.", "I'll have to pass, sorry.", "One star. Sorry.", "That's a miss."],
  },
  mood: {
    rough: ["Rough day at the office.", "Rough day. Back-to-back meetings.", "Rough week. The quarterly review."],
    celebrating: ["Celebrating! Closed the deal.", "Celebrating a launch.", "Celebrating. Got the corner office."],
    hungover: ["Hungover from the launch party.", "A little hungover. Team building.", "Hungover. Don't tell my boss."],
    restless: ["Restless. Too much espresso.", "Restless. Inbox won't stop.", "Restless, waiting on a call."],
  },
}

const X = {
  ask: {
    strength: [
      ["nothing alcoholic this evening", "without alcohol, if you would", "abstaining tonight, no alcohol"],
      ["only a whisper of alcohol", "lightly strong, please", "a delicate measure of spirit, easy on the kick"],
      ["a composed measure of kick", "moderately strong", "some kick, but well mannered"],
      ["something with a serious kick", "a strong pour, unapologetic", "strong, like an old cognac"],
      ["the strongest you dare to pour", "uncompromisingly strong", "as strong as the house allows"],
    ],
    sweet: [
      ["no sugar whatsoever", "nothing sweet, thank you", "zero sugar, I prefer it dry"],
      ["not too sweet, I prefer restraint", "a suggestion of sweetness", "only faintly sweet"],
      ["a little sweet, like honeyed tea", "gently sweet, like ripe pear", "a measured sweetness"],
      ["generously sweet, like ripe figs", "sweet, like candied orange peel", "sweet, like a dessert wine"],
      ["as sweet as a royal dessert", "lavishly sweet, honey and gold", "sweet beyond reason, indulge me"],
    ],
    sour: [
      ["nothing sour at all", "no tartness, please", "nothing sour, I beg you"],
      ["the faintest tang", "a whisper of tart", "faintly sour, a twist of citrus"],
      ["a bit tart, discreetly", "a crisp sourness", "tart, like a green apple"],
      ["sharp and sour, like a young wine", "boldly tart, like winter citrus", "assertively sour"],
      ["sour enough to make an impression", "as sour as you can make it", "sour enough to make me blink"],
    ],
    bitter: [
      ["nothing bitter, if you please", "no bitterness, please", "nothing bitter, nothing biting"],
      ["barely bitter, a mere suggestion", "a whisper of bitter, like orange pith", "faintly bitter"],
      ["a refined bitter edge", "an elegant bitterness", "bitter, like dark chocolate"],
      ["a bitterness that bites back", "boldly bitter, like an aperitivo", "unashamedly bitter"],
      ["bitter as a divorce settlement", "bitter as old money", "as bitter as you dare"],
    ],
    fresh: [
      ["no green notes", "nothing fresh or herbal, thank you", "no garden notes, please"],
      ["a gentle fresh lift", "a breath of fresh", "faintly fresh, like a cut stem"],
      ["fresh, quietly", "fresh, like a private garden", "pleasantly fresh"],
      ["bright and fresh, like the morning sun", "fresh as dew on the orangery", "vividly fresh"],
      ["fresh as a terrace above the clouds", "as fresh as a spring morning in the hills", "radiantly fresh, the most you can"],
    ],
    smoke: [
      ["I can't abide smoke", "no smoke, I beg you", "nothing smoky, it reminds me of the docks"],
      ["a curl of smoke", "a trace of smoke, like a snuffed candle", "faintly smoky"],
      ["smoky, but discreet", "smoky, like a library fireplace", "a measured smoke"],
      ["smoky, like a cigar lounge", "deeply smoky", "boldly smoky, like an old distillery"],
      ["smoky as a grand old fireplace", "as smoky as the house can manage", "smoke, and then more smoke"],
    ],
    spice: [
      ["without heat, please", "nothing spicy, I'm wearing silk", "no spice whatsoever"],
      ["a little warmth, like a fireside", "a whisper of heat", "faintly warm, like a spice market breeze"],
      ["some heat, tastefully", "a measured heat", "warmly spiced"],
      ["spicy, with conviction", "boldly spicy", "a confident heat"],
      ["hot enough to scandalize the table", "the spiciest the house dares", "a heat that makes headlines"],
    ],
    complexity: [
      ["simple, unadorned", "simple, elegant", "uncomplicated"],
      ["simple, unadorned", "simple, elegant", "uncomplicated"],
      ["a few elegant layers", "a few quiet layers", "some layers, discreetly"],
      ["layers that unfold slowly", "layered, like a good symphony", "many layers, slowly revealed"],
      ["a whole story in a glass", "layers like an old novel", "as many layers as you can compose"],
    ],
    balance: [
      ["rough is quite fine", "a little rough is charming", "rough edges are fine"],
      ["rough is quite fine", "a little rough is charming", "rough edges are fine"],
      ["smooth enough, I suppose", "pleasantly smooth", "smooth, more or less"],
      ["smooth and composed, nothing loud", "smooth, like velvet", "poised and balanced"],
      ["balanced to perfection", "balanced like a string quartet", "flawlessly smooth, like silk"],
    ],
  },
  more: {
    strength: ["It wanted more kick.", "Rather timid. More kick.", "A touch more strength, perhaps."],
    sweet: ["It could be sweeter.", "A little more sweetness, perhaps.", "Rather too dry. Sweeter."],
    sour: ["It lacks tang.", "It wants more tart.", "A little more sour, I think."],
    bitter: ["It lacks bite.", "More bitter, if you would.", "Rather soft. It wants bite."],
    fresh: ["It lacks freshness.", "It wants freshness.", "A little more fresh, perhaps."],
    smoke: ["It lacks smoke.", "A touch more smoke.", "It wants smoke."],
    spice: ["It lacks heat.", "A little more heat, perhaps.", "Rather tame. More spice."],
    complexity: ["A touch simple. More layers.", "Rather plain. More layers.", "It wants depth. More layers."],
    balance: ["A touch rough.", "Rather unpolished.", "It wants smoothing."],
  },
  less: {
    strength: ["Too strong, I'm afraid.", "Rather heavy-handed with the spirit.", "A touch too strong."],
    sweet: ["Overly sweet.", "Rather cloying. Too sweet.", "Too sweet, I'm afraid."],
    sour: ["Overly sour.", "Rather too tart.", "A touch too sour."],
    bitter: ["Overly bitter.", "Rather too bitter.", "The bite is excessive."],
    fresh: ["Overly green.", "Rather too fresh, like chewing a hedge.", "A touch too herbal."],
    smoke: ["Overly smoky.", "Rather too smoky.", "Too much smoke, I'm afraid."],
    spice: ["Overly spicy.", "Rather too spicy.", "The heat is excessive."],
    complexity: ["Too many layers at once.", "Rather crowded. Too many layers.", "Too many layers, I'm afraid."],
    balance: ["Too smooth, almost dull.", "So smooth it says nothing.", "Rather too smooth, too polite."],
  },
  spot: {
    strength: ["The kick is perfect.", "The strength is exquisite.", "Strong, and just so."],
    sweet: ["Sweetness, perfectly judged.", "The sweetness is impeccable.", "Sweet, and beautifully judged."],
    sour: ["The tang is perfect.", "The tartness is precise.", "Sour, beautifully judged."],
    bitter: ["The bite is perfect.", "An exquisite bitterness.", "The bite is impeccable."],
    fresh: ["How fresh.", "Fresh as the morning sun.", "Beautifully fresh."],
    smoke: ["Delightful smoke.", "The smoke is sublime.", "Smoky, like a library fire."],
    spice: ["The heat is perfect.", "The heat is precise.", "A lovely warmth."],
    complexity: ["It keeps unfolding. Lovely layers.", "Layer after layer. Sublime.", "Layers, like a fine novel."],
    balance: ["Exquisitely smooth.", "Smooth as silk.", "Perfectly poised."],
  },
  tier: {
    Great: ["Mm. Exquisite.", "Now that is remarkable.", "Superb. Truly.", "How very impressive.", "Oh, this is quite something."],
    Good: ["Rather nice.", "Rather good, actually.", "Mm. Well made.", "Quite nice.", "A respectable glass."],
    Meh: ["Hm. Passable.", "It's adequate.", "Hm. Interesting. Not quite.", "Perfectly ordinary.", "It'll do, I suppose."],
    Bad: ["I shall leave this here.", "Hm. No, thank you.", "I think not.", "Oh dear. How unfortunate.", "Rather regrettable."],
  },
  mood: {
    rough: ["Rough evening.", "A rough day. The board meeting.", "Rough shift at the gallery opening."],
    celebrating: ["Celebrating an acquisition.", "Celebrating. The yacht is finished.", "Celebrating, quietly."],
    hungover: ["Hungover. The gala ran late.", "A touch hungover, I confess.", "Hungover from the vineyard tour."],
    restless: ["Restless this evening.", "Restless. The opera was dull.", "Restless, I can't think why."],
  },
}

export const VOICES = { industrial: I, residential: R, commercial: C, luxury: X }

// ---------------------------------------------------------------- picking lines without repeats
// one shuffled deck per set (crowd, kind, note, level); a line comes back only after all the others in its set
const decks = new Map()
let rand = Math.random
export function seedVoices(R0) { rand = R0 }
export function pickLine(crowd, kind, ...keys) {
  let list = VOICES[crowd] && VOICES[crowd][kind]
  for (const k of keys) list = list && list[k]
  if (!list || !list.length) return null
  const id = [crowd, kind, ...keys].join("|")
  let d = decks.get(id)
  if (!d || !d.left.length) {
    const left = list.map((_, i) => i)
    for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [left[i], left[j]] = [left[j], left[i]] }
    if (d && d.last !== undefined && left.length > 1 && left[left.length - 1] === d.last) [left[0], left[left.length - 1]] = [left[left.length - 1], left[0]]
    d = { left, last: d && d.last }
    decks.set(id, d)
  }
  const i = d.left.pop(); d.last = i
  return list[i]
}
