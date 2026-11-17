// Everything the bar can stock: the 13 starter bottles, 10 spirits, 20 flavors and 10 garnishes to buy.
// One place for the gameplay side of each: what it tastes like per part (v), its tags (for discoveries, fizz and
// the kind of thing it is), how it pours, its price at the supplier, and the plain words the player reads.
// The look of each bottle (shape, glass, liquid color, label) lives in the art file, art/neon_dome.px.js.
//
// Notes per part, before concentration: a typical drink is about 3 parts, so a value of 12 in one part reads as
// about 4 out of 10 in the glass. Strength comes only from alcohol.
//
// group: "spirit" (has alcohol: stands on the left half of the rail), "mixer" (no alcohol: the right half),
// "garnish" (no volume: goes on the glass at the end).

export const STARTER = ["rice", "rye", "rum", "coffee", "yuzu", "ume", "lemongrass", "glow", "ginger", "shiso", "soda", "bitters", "chili"]

// flow: parts per second at full tilt; thick: a heavier, steadier stream; dash: dashes only (0.05 parts each)
export const ITEMS = {
  // ---------------------------------------------------------------- starter spirits
  rice: { group: "spirit", name: "Clear Grid rice spirit", plain: "Rice", v: { strength: 20, sweet: 1 }, tags: ["spirit"], flow: 1.6,
    desc: "A clean, clear spirit. Strong, with a whisper of sweetness, so everything else shows through." },
  rye: { group: "spirit", name: "Ashline smoked rye", plain: "Rye", v: { strength: 18, smoke: 9, spice: 2, bitter: 2 }, tags: ["spirit", "smoked"], flow: 1.5,
    desc: "Strong rye whiskey with a smoky, peppery edge and a little bitterness." },
  rum: { group: "spirit", name: "Neon Cane rum", plain: "Rum", v: { strength: 17, sweet: 6, smoke: 1 }, tags: ["spirit"], flow: 1.6,
    desc: "Strong and gently sweet, with a faint hint of smoke." },
  coffee: { group: "spirit", name: "Night Shift coffee liqueur", plain: "Coffee", v: { sweet: 12, bitter: 12, strength: 8, smoke: 4 }, tags: ["roasted"], flow: 1.2, thick: true,
    desc: "Dark and rich: as sweet as it is bitter, with some kick and a roasted edge." },
  // ---------------------------------------------------------------- starter mixers
  yuzu: { group: "mixer", name: "Yuzu juice", plain: "Yuzu", v: { sour: 16, fresh: 8 }, tags: ["citrus"], flow: 1.8,
    desc: "Sharp, bright citrus. Very sour, with a fresh zing." },
  ume: { group: "mixer", name: "Ume ferment", plain: "Ume", v: { sour: 9, sweet: 9, bitter: 2 }, tags: ["fermented"], flow: 1.4,
    desc: "Plum ferment: sweet and sour at once, with a slightly bitter finish." },
  lemongrass: { group: "mixer", name: "Lemongrass cordial", plain: "Lemongrass", v: { fresh: 16, sweet: 9, sour: 2 }, tags: ["herbal"], flow: 1.1, thick: true,
    desc: "Fresh, grassy and sweet, with a light tang. Pours slowly." },
  glow: { group: "mixer", name: "Glow syrup", plain: "Glow", v: { sweet: 24 }, tags: ["sugar"], flow: 0.9, thick: true,
    desc: "Pure sweetness, thick and glowing. A little goes a long way. Pours slowly." },
  ginger: { group: "mixer", name: "Ginger fire", plain: "Ginger", v: { spice: 18, sweet: 7, fresh: 2 }, tags: ["spice"], flow: 1.6,
    desc: "Hot ginger: spicy and a little sweet." },
  shiso: { group: "mixer", name: "Shiso tonic", plain: "Shiso", v: { bitter: 5, fresh: 6, sweet: 4 }, tags: ["fizz", "herbal"], flow: 2.0,
    desc: "Fizzy and herbal: fresh, lightly bitter, a little sweet. Bubbles lift the fresh notes." },
  soda: { group: "mixer", name: "Soda water", plain: "Soda", v: {}, tags: ["fizz"], flow: 2.2,
    desc: "Bubbles and no flavor. Makes a drink longer and livelier, and softens everything in it." },
  bitters: { group: "mixer", name: "Static bitters", plain: "Bitters", v: { bitter: 40, spice: 6 }, tags: ["bitter"], dash: true,
    desc: "Very bitter, with a touch of spice. Dashes only: 0.05 parts each, six at most." },
  chili: { group: "mixer", name: "Chili tincture", plain: "Chili", v: { spice: 40 }, tags: ["spice"], dash: true,
    desc: "Pure heat. Dashes only: 0.05 parts each, six at most." },

  // ---------------------------------------------------------------- spirits to buy (10)
  agave: { group: "spirit", name: "Dustline agave", plain: "Agave", v: { strength: 18, smoke: 5, fresh: 3, spice: 1, sweet: 1 }, tags: ["spirit", "smoked"], flow: 1.6, price: 34,
    desc: "Desert agave spirit: strong, lightly smoky and green, with a peppery tickle. Softer smoke than the rye." },
  gin: { group: "spirit", name: "Circuit gin", plain: "Gin", v: { strength: 19, fresh: 6, floral: 3, bitter: 1 }, tags: ["spirit", "herbal"], flow: 1.6, price: 30,
    desc: "Botanical gin: strong, fresh and piney, with a hint of flowers." },
  brandy: { group: "spirit", name: "Orchard brandy", plain: "Brandy", v: { strength: 17, fruity: 7, sweet: 3 }, tags: ["spirit", "aged"], flow: 1.5, price: 44,
    desc: "Aged fruit brandy: strong, round and fruity, a little sweet." },
  shochu: { group: "spirit", name: "Lowline barley shochu", plain: "Shochu", v: { strength: 11, sweet: 2, smoke: 1, creamy: 1 }, tags: ["spirit"], flow: 1.7, price: 26,
    desc: "A gentle barley spirit with about half the kick of the others. For drinks that should stay light." },
  lychee: { group: "spirit", name: "Pearl lychee liqueur", plain: "Lychee", v: { sweet: 12, fruity: 9, floral: 4, strength: 6 }, tags: ["fruit"], flow: 1.4, price: 38,
    desc: "Lychee liqueur: sweet and fruity, faintly floral, with a little kick." },
  amaro: { group: "spirit", name: "Undergrid amaro", plain: "Amaro", v: { bitter: 13, sweet: 9, strength: 9, spice: 2, fresh: 2 }, tags: ["herbal", "bitter"], flow: 1.3, price: 42,
    desc: "Bitter herbal liqueur: bittersweet and dark, with some kick. Bitterness you can pour, not just dash." },
  cream: { group: "spirit", name: "Moonmilk cream liqueur", plain: "Cream", v: { creamy: 15, sweet: 10, strength: 5 }, tags: ["creamy"], flow: 1.1, thick: true, price: 40,
    desc: "Cream liqueur: creamy and sweet with a little kick. Cream softens strength and bitterness." },
  anise: { group: "spirit", name: "Greenwire anise", plain: "Anise", v: { strength: 24, fresh: 9, spice: 3, sweet: 2, floral: 1 }, tags: ["spirit", "herbal"], flow: 1.5, price: 48,
    desc: "Overproof anise spirit: the strongest bottle in the dome, cool and herbal. Use a little." },
  whiskey: { group: "spirit", name: "Copper corn whiskey", plain: "Whiskey", v: { strength: 18, sweet: 5, smoke: 2, creamy: 3 }, tags: ["spirit", "aged"], flow: 1.5, price: 46,
    desc: "Sweet corn whiskey aged in charred barrels: strong, round, a touch of smoke and vanilla cream." },
  bloom: { group: "spirit", name: "Bloom elderflower liqueur", plain: "Bloom", v: { floral: 14, sweet: 12, strength: 6, fresh: 2 }, tags: ["floral"], flow: 1.3, price: 40,
    desc: "Elderflower liqueur: very floral and sweet, with a little kick." },

  // ---------------------------------------------------------------- flavors to buy (20)
  passion: { group: "mixer", name: "Passionfruit pulp", plain: "Passion", v: { fruity: 16, sour: 10, sweet: 3 }, tags: ["fruit", "tropical"], flow: 1.0, thick: true, price: 22,
    desc: "Tropical fruit pulp: very fruity and tart. Pours slowly." },
  shrub: { group: "mixer", name: "Berry shrub", plain: "Shrub", v: { fruity: 10, sour: 12, sweet: 4 }, tags: ["fruit"], flow: 1.4, price: 20,
    desc: "Berries kept in vinegar: fruity and sharply sour." },
  peach: { group: "mixer", name: "Peach nectar", plain: "Peach", v: { fruity: 12, sweet: 8, creamy: 2 }, tags: ["fruit"], flow: 1.1, thick: true, price: 18,
    desc: "Thick peach nectar: fruity, sweet and soft." },
  pineapple: { group: "mixer", name: "Pineapple juice", plain: "Pineapple", v: { fruity: 11, sweet: 7, sour: 5 }, tags: ["fruit", "tropical"], flow: 1.7, price: 16,
    desc: "Fruity, sweet and a little tart." },
  grapefruit: { group: "mixer", name: "Pink grapefruit", plain: "Grapefruit", v: { sour: 10, bitter: 6, fruity: 4, fresh: 3 }, tags: ["citrus"], flow: 1.8, price: 16,
    desc: "Citrus that bites back: sour and bitter, a little fruity." },
  coconut: { group: "mixer", name: "Coconut cream", plain: "Coconut", v: { creamy: 18, sweet: 4 }, tags: ["creamy", "tropical"], flow: 0.9, thick: true, price: 24,
    desc: "Thick and very creamy, barely sweet. Cream softens strength and bitterness. Pours slowly." },
  orgeat: { group: "mixer", name: "Orgeat", plain: "Orgeat", v: { sweet: 14, creamy: 9, floral: 2 }, tags: ["creamy", "nut", "sugar"], flow: 1.0, thick: true, price: 22,
    desc: "Almond syrup: sweet and creamy, with a hint of orange blossom." },
  honey: { group: "mixer", name: "Honey syrup", plain: "Honey", v: { sweet: 20, floral: 4, creamy: 1 }, tags: ["sugar", "floral"], flow: 0.9, thick: true, price: 14,
    desc: "Very sweet, with a soft floral edge. Pours slowly." },
  rose: { group: "mixer", name: "Rose water", plain: "Rose", v: { floral: 36, sweet: 2 }, tags: ["floral"], dash: true, price: 18,
    desc: "Pure rose. Dashes only: 0.05 parts each, six at most." },
  lavender: { group: "mixer", name: "Lavender syrup", plain: "Lavender", v: { sweet: 14, floral: 12 }, tags: ["floral", "sugar"], flow: 0.9, thick: true, price: 20,
    desc: "Sweet and floral. Pours slowly." },
  hibiscus: { group: "mixer", name: "Hibiscus tea", plain: "Hibiscus", v: { sour: 9, floral: 6, fruity: 6, bitter: 2 }, tags: ["tea", "floral"], flow: 1.8, price: 18,
    desc: "Ruby flower tea: tart, floral and a little fruity." },
  matcha: { group: "mixer", name: "Matcha", plain: "Matcha", v: { bitter: 10, fresh: 8, creamy: 3 }, tags: ["tea"], flow: 1.4, price: 24,
    desc: "Whisked green tea: bitter and fresh, a little creamy." },
  lapsang: { group: "mixer", name: "Smoked black tea", plain: "Lapsang", v: { smoke: 10, bitter: 6 }, tags: ["tea", "smoked"], flow: 1.8, price: 20,
    desc: "Tea dried over pine smoke: smoky and a little bitter, no alcohol. Smoke without the kick." },
  cola: { group: "mixer", name: "Cyber cola", plain: "Cola", v: { sweet: 12, spice: 3, bitter: 2 }, tags: ["fizz", "sugar"], flow: 2.1, price: 12,
    desc: "Fizzy and sweet, with warm spice. Bubbles lift the fresh and floral notes." },
  tonic: { group: "mixer", name: "Quinine tonic", plain: "Tonic", v: { bitter: 10, sweet: 5 }, tags: ["fizz", "bitter"], flow: 2.1, price: 14,
    desc: "Fizzy and bitter, a little sweet. Bubbles lift the fresh and floral notes." },
  pandan: { group: "mixer", name: "Pandan syrup", plain: "Pandan", v: { sweet: 12, fresh: 5, creamy: 4, floral: 2 }, tags: ["herbal", "sugar"], flow: 1.0, thick: true, price: 20,
    desc: "Green leaf syrup: sweet, fresh and softly creamy." },
  miso: { group: "mixer", name: "Miso caramel", plain: "Miso", v: { sweet: 14, creamy: 4, smoke: 4, bitter: 2 }, tags: ["roasted", "fermented"], flow: 0.8, thick: true, price: 26,
    desc: "Salted miso caramel: sweet, creamy and toasty. Pours slowly." },
  mint: { group: "mixer", name: "Mint cordial", plain: "Mint", v: { fresh: 20, sweet: 6 }, tags: ["herbal"], flow: 1.4, price: 14,
    desc: "Very fresh and cool, a little sweet." },
  cardamom: { group: "mixer", name: "Cardamom tincture", plain: "Cardamom", v: { spice: 24, floral: 10, fresh: 6 }, tags: ["spice"], dash: true, price: 22,
    desc: "Warm, floral spice. Dashes only: 0.05 parts each, six at most." },
  cacao: { group: "mixer", name: "Cacao bitters", plain: "Cacao", v: { bitter: 30, smoke: 4, sweet: 2 }, tags: ["roasted", "bitter"], dash: true, price: 24,
    desc: "Dark chocolate bitters: bitter and roasted. Dashes only: 0.05 parts each, six at most." },

  // ---------------------------------------------------------------- garnishes to buy (10)
  // A garnish has no volume. It's an aroma: it nudges the notes it names by a fixed amount, however big the drink.
  // add: points added to a note; hide: points taken off a note (salt hides bitterness). fam: what a guest might
  // ask for ("something citrus on it"); color: its swatch on the screen.
  twist: { group: "garnish", name: "Lemon twist", plain: "Twist", fx: { add: { fresh: 1.2, sour: 0.3 } }, fam: ["citrus"], color: "#F4DC5A", price: 10,
    desc: "A curl of lemon peel: adds a little Fresh and a touch of Sour." },
  mintsprig: { group: "garnish", name: "Mint sprig", plain: "Mint sprig", fx: { add: { fresh: 1.5 } }, fam: ["herb"], color: "#5FC07A", price: 10,
    desc: "A sprig of mint: adds Fresh." },
  rosemary: { group: "garnish", name: "Smoked rosemary", plain: "Rosemary", fx: { add: { smoke: 1.2, fresh: 0.5 } }, fam: ["herb", "smoke"], color: "#7A9A6A", price: 14,
    desc: "A rosemary sprig, lit and blown out: adds Smoke and a little Fresh." },
  cherry: { group: "garnish", name: "Brandied cherry", plain: "Cherry", fx: { add: { fruity: 1.0, sweet: 0.6 } }, fam: ["fruit", "sweet"], color: "#B4203A", price: 12,
    desc: "A dark cherry on a pick: adds Fruity and a little Sweet." },
  salt: { group: "garnish", name: "Salt rim", plain: "Salt rim", fx: { hide: { bitter: 1.2 }, add: { sweet: 0.3 } }, fam: ["rim"], color: "#E8EEF0", price: 12,
    desc: "Salt round the rim: hides some Bitter and makes the drink taste a little sweeter." },
  chilirim: { group: "garnish", name: "Chili-sugar rim", plain: "Chili rim", fx: { add: { spice: 1.2, sweet: 0.4 } }, fam: ["rim", "spice"], color: "#D8503A", price: 14,
    desc: "Chili and sugar round the rim: adds Spice and a little Sweet." },
  orchid: { group: "garnish", name: "Orchid", plain: "Orchid", fx: { add: { floral: 1.4 } }, fam: ["flower"], color: "#D88AE8", price: 16,
    desc: "An edible orchid floating on top: adds Floral." },
  nutmeg: { group: "garnish", name: "Grated nutmeg", plain: "Nutmeg", fx: { add: { spice: 0.5, creamy: 0.6 } }, fam: ["spice"], color: "#9A6A40", price: 12,
    desc: "A dusting of nutmeg: adds a little Creamy and a little Spice." },
  orange: { group: "garnish", name: "Dried orange wheel", plain: "Orange", fx: { add: { fruity: 0.6, sweet: 0.3, bitter: 0.3 } }, fam: ["citrus", "fruit"], color: "#E8822A", price: 12,
    desc: "A dried orange slice: adds a little Fruity, Sweet and Bitter." },
  beans: { group: "garnish", name: "Coffee beans", plain: "Beans", fx: { add: { bitter: 0.5, smoke: 0.5 } }, fam: ["roast"], color: "#4A2A1A", price: 12,
    desc: "Three roasted beans on the foam: adds a little Bitter and Smoke." },
}
export const isGarnish = (id) => ITEMS[id] && ITEMS[id].group === "garnish"
export const BUYABLE = Object.keys(ITEMS).filter((id) => !STARTER.includes(id))
export const GARNISHES = Object.keys(ITEMS).filter(isGarnish)
// what a guest can ask a garnish to be, in the bartender's own words (the guest's words are in voices.js)
export const GARNISH_FAMILIES = { citrus: "citrus", herb: "an herb", fruit: "fruit", rim: "a rim", flower: "a flower", spice: "spice", smoke: "smoke", roast: "roasted", sweet: "something sweet" }
