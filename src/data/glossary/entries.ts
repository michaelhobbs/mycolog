// The glossary, written by hand.
//
// This is a *curated* list: a term earns an entry when a general reader cannot
// picture it, or when a common word is used in a special mycological sense.
// Obvious ones ("cap shape", "convex", "free gills", "poisonous") have no
// entry, and a lookup that misses simply renders without a tooltip.
//
// `qid` must be a legal member of its morphology enum (src/data/wikidata/
// morphology-types.ts) -- the value is only ever used to look up a mark or a
// facet chip, never to add a species value.
import type { GlossaryEntry } from './types'

export const entries: GlossaryEntry[] = [
  // ── Mushroom anatomy ─────────────────────────────────────────────
  {
    id: 'hymenium',
    term: 'hymenium',
    group: 'structure',
    short: 'The spore-bearing surface under the cap — the gills, pores, teeth or similar.',
    body: 'The hymenium is the spore-producing surface on the under-side of the cap. Its shape — gills, pores, teeth, ridges, a smooth surface or the fleshy gleba — is often the single most useful feature for telling species apart. It is what the "Hymenium" rows on the species page describe.',
  },
  {
    id: 'gills',
    term: 'gills (lamellae)',
    group: 'structure',
    qid: 'Q269345',
    short: 'The blade-like, radially arranged plates under the cap that carry the spores.',
    body: 'Gills (botanically lamellae) are the thin, blade-like plates that radiate from the stipe under the cap. Their attachment to the stipe (free, adnate, decurrent…) and their spacing and colour are key identification characters.',
  },
  {
    id: 'gleba',
    term: 'gleba',
    group: 'structure',
    qid: 'Q2034230',
    short:
      'The spore-producing tissue inside puffballs and related fungi; it becomes a powdery spore mass when ripe.',
    body: 'The gleba is the spore-bearing flesh found inside puffballs, earthstars, stinkhorns and similar fungi. Instead of gills or pores it forms a solid mass that, in mature specimens, dries into a powdery spore dust — the "smoke" a stepped-on puffball releases.',
  },
  {
    id: 'stipe',
    term: 'stipe',
    group: 'structure',
    short: 'The stem of a mushroom, supporting the cap.',
    body: 'The stipe is the mushroom’s stem. Its surface (ring, volva, cortina, reticulation), its shape (bulbous, sliding, hollow) and how the gills attach to it are all used to identify the species.',
  },
  {
    id: 'spore-print',
    term: 'spore print',
    group: 'structure',
    short:
      'The colour pattern a cap leaves behind when it drops its spores onto paper — a reliable identification aid.',
    body: 'A spore print is made by laying a cap gill-side down on paper until it sheds enough spores to leave a coloured dust. Spore colour is remarkably constant within a species, unlike cap colour, so it often settles a close call. The site records it as one of its morphology values.',
  },

  // ── Cap shape ─────────────────────────────────────────────────────
  {
    id: 'campanulate',
    term: 'campanulate',
    group: 'capShape',
    qid: 'Q19887953',
    short: 'Bell-shaped — the cap is a rounded cone, wider than it is tall.',
    body: 'A campanulate cap is bell-shaped: high and rounded in the centre, like a church bell. Many small woodland species start bell-shaped and flatten with age, so note the stage when recording it.',
  },
  {
    id: 'infundibuliform',
    term: 'infundibuliform',
    group: 'capShape',
    qid: 'Q19887958',
    short: 'Funnel-shaped — the cap dips into a hollow centre, like a trumpet.',
    body: 'An infundibuliform cap is funnel- or trumpet-shaped: the centre sinks into a depression and the margin often stays wavy. Chanterelles and many Clitocybe look-alikes are classic funnel shapes.',
  },
  {
    id: 'umbonate',
    term: 'umbonate',
    group: 'capShape',
    qid: 'Q19887964',
    short: 'Having a rounded knob (umbo) in the centre of the cap.',
    body: 'An umbonate cap carries a distinct rounded knob — the umbo — in the middle, like a nipple. The opposite is an umbilicate cap, which has a small dimple instead.',
  },
  {
    id: 'umbilicate',
    term: 'umbilicate',
    group: 'capShape',
    qid: 'Q19887962',
    short: 'Having a small navel-like dimple in the centre of the cap.',
    body: 'An umbilicate cap has a navel-like hole or dimple in the middle — an inverted umbo. The depression is usually small and sharp-edged, unlike the wide hollow of a funnel shape.',
  },

  // ── Hymenium attachment ───────────────────────────────────────────
  {
    id: 'adnate',
    term: 'adnate',
    group: 'hymeniumAttachment',
    qid: 'Q14544569',
    short: 'Gills attached broadly and directly to the stem along their whole width.',
    body: 'Adnate gills meet the stipe across their full width, with no notch and no free gap. It is one of the more common attachments among gilled mushrooms.',
  },
  {
    id: 'adnexed',
    term: 'adnexed',
    group: 'hymeniumAttachment',
    qid: 'Q19887923',
    short: 'Gills that touch the stem but are not attached there, narrowing to a point.',
    body: 'Adnexed gills touch the stipe only briefly, narrowing to a point right before it — neither free nor fully attached. When the narrowing is a cut-out notch instead, the attachment is called sinuate.',
  },
  {
    id: 'decurrent',
    term: 'decurrent',
    group: 'hymeniumAttachment',
    qid: 'Q19887925',
    short: 'Gills running part-way down the stem below the cap.',
    body: 'Decurrent gills continue down the stipe instead of stopping at the cap edge — the signature of chanterelles, oysters and many Clitocybe. The more they run, the stronger the feature.',
  },
  {
    id: 'sinuate',
    term: 'sinuate',
    group: 'hymeniumAttachment',
    qid: 'Q19887930',
    short: 'Gills that notch inward where they meet the stem, leaving a gap.',
    body: 'Sinuate (or emarginate) gills make a distinct inward notch or bay where they meet the stipe, instead of touching it along a straight line. The two terms overlap; emarginate stresses the cut-out itself.',
  },
  {
    id: 'emarginate',
    term: 'emarginate',
    group: 'hymeniumAttachment',
    qid: 'Q19887926',
    short: 'Gills with a notched, cut-away indentation where they join the stem.',
    body: 'Emarginate gills end in a notched, cut-away indentation at the stipe, so they appear to avoid touching it. It is a stronger version of the sinuate attachment.',
  },
  {
    id: 'seceding',
    term: 'seceding',
    group: 'hymeniumAttachment',
    qid: 'Q19887929',
    short: 'Gills attached when young that pull free from the stem as the cap opens.',
    body: 'Seceding gills start attached to the stipe but separate from it as the cap expands, ending up looking almost free. Checking the attachment on a young specimen is the reliable moment.',
  },
  {
    id: 'subdecurrent',
    term: 'subdecurrent',
    group: 'hymeniumAttachment',
    qid: 'Q19887931',
    short: 'Gills running only slightly down the stem — between adnate and decurrent.',
    body: 'Subdecurrent gills run a little way down the stipe but clearly less than truly decurrent ones. It is the common intermediate between an adnate and a decurrent attachment.',
  },

  // ── Stipe characters ──────────────────────────────────────────────
  {
    id: 'volva',
    term: 'volva',
    group: 'stipe',
    qid: 'Q19887985',
    short: 'The cup- or sac-like remnant of the "egg" membrane at the base of the stipe.',
    body: 'The volva is the cup-like remnant left at the base of the stipe when the mushroom pushed out of its universal veil (the "egg" any Amanita starts as). A ring plus a volva is the classic Amanita signature — and their absence is one of the quickest ways to separate an edible from a deadly look-alike.',
  },
  {
    id: 'ring',
    term: 'ring (annulus)',
    group: 'stipe',
    qid: 'Q14544582',
    short: 'The skirt-like remnant of the partial veil left around the upper stipe.',
    body: 'The ring (annulus) is the remnant of the partial veil — the membrane that covered the gills while the cap was closed — left on the upper stipe. It can persist as a full skirt or shrink to a ragged edge, and whether it moves up and down the stipe is itself an identifying character.',
  },
  {
    id: 'ring-and-volva',
    term: 'ring and volva',
    group: 'stipe',
    qid: 'Q19887987',
    short: 'A stipe with both a ring and a cup-like volva at the base — the signature of Amanita.',
    body: 'A stipe carrying both a ring and a volva is the signature of the genus Amanita. In Europe it is worth learning because it telescopes down to one question with serious consequences: ring + volva + white gills = handle with extreme care.',
  },
  {
    id: 'cortina',
    term: 'cortina',
    group: 'stipe',
    qid: 'Q19887988',
    short: 'A cobweb-like veil connecting the cap edge to the stipe in young mushrooms.',
    body: 'The cortina is a fine, cobweb-like partial veil stretched between the cap edge and the stipe while the mushroom is closed. As the cap opens it ruptures, leaving fibres on the stipe and often rust-coloured spore dust in them — the feature that names the entire genus Cortinarius.',
  },
  {
    id: 'reticulate',
    term: 'reticulate',
    group: 'stipe',
    qid: 'Q131915205',
    short: 'Finely netted or veined, as in a stipe covered with a raised mesh.',
    body: 'A reticulate stipe is covered in a raised net-like pattern of ridges, like a fine mesh drawn over the surface. It is a classic character of the king bolete group (Boletus edulis and allies).',
  },

  // ── Ecology ───────────────────────────────────────────────────────
  {
    id: 'mycorrhiza',
    term: 'mycorrhiza',
    group: 'ecology',
    qid: 'Q99974',
    short: 'A mutually beneficial root partnership between a fungus and a plant.',
    body: 'Mycorrhiza is the symbiotic partnership between a fungus and a plant’s roots: the fungus trades water and minerals it collects from the soil for sugars the plant makes. Most sought-after forest mushrooms — boletes, chanterelles, Amanita — are mycorrhizal, which is why they cannot be cultivated and why they appear only around their host trees.',
  },
  {
    id: 'saprobiont',
    term: 'saprobiont',
    group: 'ecology',
    qid: 'Q114750',
    short: 'An organism that feeds by decomposing dead organic matter.',
    body: 'A saprobiont (saprophyte) lives by decomposing dead organic matter — leaf litter, dung, wood. Unlike mycorrhizal species it needs no living host tree, which is why saprobic mushrooms (many Mycena, Psathyrella, shelf fungi) fruit directly on dead wood and are easy to grow.',
  },
  {
    id: 'parasitism',
    term: 'parasitism',
    group: 'ecology',
    qid: 'Q186517',
    short: 'A fungus that feeds on a living host, often harming it.',
    body: 'Parasitic fungi feed on a living host — a tree, insect or other fungus — at the host’s expense. Armillaria honey fungus is a notorious tree parasite; the Cordyceps lineage parasitises insects. The same individual can slip between lifestyles, as many "saprobic" fungi also attack live trees.',
  },
  {
    id: 'nematophagous-fungus',
    term: 'nematophagous fungus',
    group: 'ecology',
    qid: 'Q357006',
    short: 'A fungus that catches and digests nematodes (roundworms).',
    body: 'A nematophagous fungus supplements its diet by trapping and digesting nematodes (roundworms) — with sticky nets, adhesive knobs or constricting rings. The strategy is widespread in soil fungi; on the species page it is recorded for the Cordyceps/Hypocreales line.',
  },

  // ── Edibility ─────────────────────────────────────────────────────
  {
    id: 'choice-mushroom',
    term: 'choice mushroom',
    group: 'edibility',
    qid: 'Q19888517',
    short: 'A top-quality edible mushroom prized by foragers.',
    body: 'A "choice" (French comestible de choix) mushroom is one of the most prized edible species — lofty, meaty, with excellent flavour. The label is a forager’s judgement of quality, not a safety rating: correct identification is assumed, and these pages are not a field guide.',
  },

  // ── Nomenclature ──────────────────────────────────────────────────
  {
    id: 'basionym',
    term: 'basionym',
    group: 'nomenclature',
    short:
      'The original name under which a species was first described, before it was moved to another genus.',
    body: 'The basionym is the name a species received when it was first described. When later research moves it into another genus, the original name becomes the basionym and the original author appears in parentheses — both part of how a name is uniquely pinned down. Example: Suillellus luridus was first described as Boletus luridus, so its basionym is the older Boletus name, and its author citation carries parentheses because the species has since moved genus.',
  },
  {
    id: 'accepted-name',
    term: 'accepted name',
    group: 'nomenclature',
    short: 'The currently correct scientific name, as opposed to older synonyms.',
    body: 'The accepted name is the scientific name currently treated as correct by the taxonomic reference (here, Index Fungorum via Catalogue of Life). Every other published combination for the same species is a synonym or a former name. Names change as taxonomy is revised, so the accepted name can differ from the one a species page uses — and that is not an error.',
  },
  {
    id: 'synonym',
    term: 'synonym',
    group: 'nomenclature',
    short: 'An old or alternative name that refers to the same species but is no longer accepted.',
    body: 'A synonym is a name that points at the same species as the accepted name but is no longer the one in use, usually because the species was moved to another genus or the name was published twice. Listing the synonym history is how a page says "this name and that name are the same fungus".',
  },
  {
    id: 'infraspecific-variation',
    term: 'infraspecific variation',
    group: 'nomenclature',
    short: 'A named rank below species — variety (var.), subspecies (subsp.) or form (f.).',
    body: 'An infraspecific variation is a named rank below the species level, printed after the species name: variety (var.), subspecies (subsp.) or form (f.). Varieties and forms are the ones most often recorded on the species pages — the name splits into base + rank abbreviation + varietal name.',
  },
  {
    id: 'author-citation',
    term: 'author citation',
    group: 'nomenclature',
    short:
      'The author who published a scientific name, used to disambiguate identical-looking names.',
    body: 'The author citation is the name (and year) of the person who first validly published a scientific name, e.g. "Fr." for Elias Fries. Names can coincide, so the author splits otherwise identical strings apart. Parentheses around the author mean the species was first described under a different genus — the basionym author — with the transferring author listed after.',
  },
]
