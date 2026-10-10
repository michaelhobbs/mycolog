// Fuzzy matching for the header search.
//
// This module is deliberately free of any build-time import, exactly like
// `./species-facets`: it is imported by `SiteSearch`'s bundled <script>, so
// pulling a content collection or a Wikidata snapshot in here would ship all of
// it to the browser on every one of the built pages.
//
// Why hand-rolled rather than a library: the corpus is 69 species. Scoring it is
// a few hundred folded fields -- microseconds -- and `package.json` carries four
// runtime dependencies, all of them load-bearing. A fuzzy-search library would be
// the first dependency here that exists only for 69 records.
//
// Four score layers, best first, so a hit on a whole word can never be outranked
// by a lucky trigram overlap:
//
//   1. the query appears verbatim in a field        (earlier position scores higher)
//   2. the query *is* a field token                 ("cep", "steinpilz")
//   3. every query token is a field token           ("boletus edulis")
//   4. fuzzy: trigram Dice, boosted by an edit distance of 1
//
// Each field is multiplied by a per-field weight on top. The site's curated
// common names are worth the most, then the scientific name, then the slug, and
// `SearchRecord.names` (the Wikidata common names and aliases) last: aliases are
// a fallback corpus, and one that merely overlaps a real name by trigrams must
// not displace it -- see `NAME_WEIGHT` for the measurement that pins the bound.
//
// Two rules do the real work, and both are here because measurement said so
// rather than because they are conventional:
//
//   - **Layer 4 requires a query token of at least 4 characters.** Below that a
//     trigram is nearly meaningless: without the floor, "gift" fuzzy-matches
//     *Common Split Gil**l** on two trigrams and "fl" returns three unrelated
//     species. Short queries stay substring-only, which is the honest reading of
//     a query that says almost nothing.
//   - **Every query token must clear the threshold, and the worst one decides.**
//     Taking the best token would let "edulis zzzz" match *Boletus edulis*.
//
// Verified against the real names by `npm run check:search`: `flignpilz`,
// `flugelpilz`, `harmasch`, `anhansel`, `knollenblater`, `canterelle` and
// `rohrling` all resolve, as do the Wikidata aliases `fly amanita`, `wood ear`
// and `Fliangschwammerl`; `zzzz`, `wucht` and `xymyc` all return nothing.

import type { Locale } from '../i18n'

/** One searchable species, as carried by /search-index.json. */
export interface SearchRecord {
  /** Collection id, which is also the URL segment: `/{locale}/mushrooms/{slug}`. */
  slug: string
  scientific: string
  en: string
  de: string
  /** Common-name extras -- Wikidata `P1843` values and aliases -- beyond the
   *  site's own `en`/`de`, so `fly amanita` or `Fliangschwammerl` find the
   *  species the page lists them under "also known as". Never the site's own
   *  names or the scientific name (they are fields already). Possibly empty. */
  names: string[]
}

export interface SearchResult {
  record: SearchRecord
  /** Higher is better. Zero or below means "no match", not "worst match". */
  score: number
  /** The common name in the requested locale, which is what the reader asked for. */
  label: string
  /** The name in the other locale, when it differs. */
  altLabel: string
  /** The extra name that the query matched best in, when it beat every standard
   *  field -- the name a reader typed that only "also known as" explains.
   *  Empty when the match is on a standard field, so the suggestion row can
   *  keep showing the other-locale name instead. */
  matchedName: string
  href: string
}

/* ── Scoring constants ──────────────────────────────────────────────────── */

const EXACT = 1000
const TOKEN = 900
const ALL_TOKENS = 850
/** A token within one edit (insert, delete, substitute or transpose) of a target. */
const NEAR_EXACT = 0.95
const FUZZY_SCALE = 500
/**
 * The multiplier applied to `SearchRecord.names` fields.
 *
 * Chosen from the score bands, not taste, and bounded from both sides. It must
 * stay above 500/900 (~0.56) so an exact alias hit (900 x w) still clears the
 * fuzzy ceiling (500) -- "wood ear" must find *Jelly ear* -- and below the
 * measured 0.83 at which *Spargelpilz*'s trigram overlap with the typo
 * `flugelpilz` overtakes *Fliegenpilz*'s. 0.8 sits in that window with margin.
 */
const NAME_WEIGHT = 0.8
/** Dice coefficient a token must reach to count as a fuzzy match at all. */
const MIN_DICE = 0.34
/** Below this length a query token may only match as a substring. */
const MIN_FUZZY_LEN = 4
/** Suggestions offered. */
export const MAX_SUGGESTIONS = 8

/* ── Normalisation ──────────────────────────────────────────────────────── */

/**
 * Fold to a comparable form: case, accents and punctuation all stop mattering.
 *
 * NFD then dropping combining marks is what makes `rohrling` find `Röhrling` and
 * `anhansel` find `Anhängsel-Röhrling` -- and it is the only reason a German
 * reader does not have to type umlauts. Non-alphanumerics become spaces so that
 * `boletus-edulis` and `Boletus edulis` are the same string, and so a slug can be
 * scored by passing it through with hyphens turned into spaces.
 *
 * Backed by `foldWithMap` so scoring and highlighting cannot drift apart: they
 * are literally the same walk over the string, differing only in whether the
 * index map is kept.
 */
export function fold(value: string): string {
  return foldWithMap(value).folded
}

/**
 * `fold`, plus the position each folded character came from.
 *
 * One original code point can emit several folded characters (a decomposed
 * ligature) and several original code points collapse into one space, so the map
 * is what turns a match found in folded space back into a `[start, end)` range
 * over the string a reader is actually looking at.
 *
 * Folding happens per code point rather than over the whole string at once:
 * `String.normalize` on the full value would renumber everything after the first
 * accent, and `map` has to keep pointing into `value`.
 */
function foldWithMap(value: string): { folded: string; map: number[] } {
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < value.length;) {
    const codePoint = value.codePointAt(i) ?? 0
    const width = codePoint > 0xffff ? 2 : 1
    let letters = ''
    for (const char of String.fromCodePoint(codePoint).normalize('NFD')) {
      if (/\p{Diacritic}/u.test(char)) continue
      letters += char.toLowerCase()
    }
    if (letters !== '' && /^[a-z0-9]+$/.test(letters)) {
      for (const letter of letters) {
        folded += letter
        map.push(i)
      }
    } else if (folded !== '' && !folded.endsWith(' ')) {
      folded += ' '
      map.push(i)
    }
    i += width
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1)
    map.pop()
  }
  return { folded, map }
}

/* ── Fuzzy primitives ───────────────────────────────────────────────────── */

/** Trigrams of a folded string, space-padded so word edges are distinguishable. */
function trigrams(folded: string): Set<string> {
  const padded = `  ${folded} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

/**
 * Sørensen–Dice over trigrams: `2 * |A n B| / (|A| + |B|)`.
 *
 * Unlike an edit distance this degrades gracefully instead of failing outright
 * when a word is longer or shorter than expected, which is what catches
 * `flugelpilz` -- three edits from `Fliegenpilz`, so an edit-distance gate of 1
 * rejects it even though a reader would obviously mean that species.
 */
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return (2 * shared) / (a.size + b.size)
}

/**
 * Optimal string alignment distance: Levenshtein plus the Damerau transposition.
 *
 * Bounded and cheap because it only ever runs between a query token and a token
 * of near-identical length -- see `nearMatch`. The transposition term is what
 * makes a swapped pair (`flignpilz` for `fliegenpilz`) score as a near-exact hit
 * rather than as two unrelated substitutions.
 */
function osa(a: string, b: string, max: number): number {
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > max) return max + 1
  let prev = Array.from({ length: lb + 1 }, (_, i) => i)
  let cur = new Array<number>(lb + 1)
  for (let i = 1; i <= la; i++) {
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= lb; j++) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, sub)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev[j - 2] + 1)
      }
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    // Nothing below this can recover, so stop rather than finish the row.
    if (rowMin > max) return max + 1
    const swap = prev
    prev = cur
    cur = swap
  }
  return prev[lb]
}

/** Is this query token one typo away from that target token? */
function nearMatch(q: string, t: string): boolean {
  if (q.length < MIN_FUZZY_LEN || t.length < MIN_FUZZY_LEN) return false
  if (Math.abs(q.length - t.length) > 1) return false
  return osa(q, t, 1) <= 1
}

/* ── Scoring ────────────────────────────────────────────────────────────── */

/**
 * Score one query against one already-folded field. `0` means no match.
 *
 * `foldedQuery` is passed in rather than refolded because the caller folds it
 * once per keystroke and then scores every field with it.
 */
export function scoreField(foldedQuery: string, foldedField: string): number {
  if (foldedQuery.length === 0 || foldedField.length === 0) return 0

  // 1. Substring anywhere, earlier is better.
  const at = foldedField.indexOf(foldedQuery)
  if (at >= 0) return EXACT - Math.min(at, 99) * 0.5

  const tokens = foldedField.split(' ')
  // 2. The whole query is one token.
  if (tokens.includes(foldedQuery)) return TOKEN
  const queryTokens = foldedQuery.split(' ')
  // 3. A multi-word query whose every token is a token.
  if (queryTokens.length > 1 && queryTokens.every((t) => tokens.includes(t))) return ALL_TOKENS

  // Short queries stop here on purpose -- see MIN_FUZZY_LEN.
  if (queryTokens.some((t) => t.length < MIN_FUZZY_LEN)) return 0

  const fieldTrigrams = trigrams(foldedField)
  const tokenTrigrams = tokens.map((t) => trigrams(t))

  // 4. Fuzzy, and the *worst* query token decides.
  let worst = 1
  for (const q of queryTokens) {
    if (foldedField.includes(q)) {
      // A substring hit on this token is as good as it gets for this token.
      worst = Math.min(worst, 1)
      continue
    }
    let best = dice(trigrams(q), fieldTrigrams)
    for (let i = 0; i < tokens.length; i++) {
      if (nearMatch(q, tokens[i])) best = Math.max(best, NEAR_EXACT)
      best = Math.max(best, dice(trigrams(q), tokenTrigrams[i]))
    }
    if (best < MIN_DICE) return 0
    worst = Math.min(worst, best)
  }
  return worst * FUZZY_SCALE
}

/**
 * A record's fields, in preference order.
 *
 * The multipliers are what break ties sensibly rather than arbitrarily: a hit on
 * the common name should outrank the same hit on the scientific name, and a hit
 * on the slug is weaker than either because a slug is an internal handle, not a
 * name a reader would have seen on the page.
 *
 * `SearchRecord.names` is weighted *below* every other field (see `NAME_WEIGHT`)
 * on purpose. Aliases are a fallback corpus, and an alias that merely overlaps a
 * typo by trigrams must never displace a real hit on the species' own name:
 * `Spargelpilz` is a *Coprinus comatus* alias, and an unweighted `flugelpilz`
 * (a typo of *Fliegenpilz*) scores it above *Amanita muscaria*. The weight keeps
 * the two apart without silencing aliases, because an exact alias hit is still
 * far above the fuzzy ceiling -- see `NAME_WEIGHT`.
 */
function fieldScores(foldedQuery: string, record: SearchRecord): number[] {
  return [
    scoreField(foldedQuery, fold(record.en)),
    scoreField(foldedQuery, fold(record.de)),
    scoreField(foldedQuery, fold(record.scientific)) * 0.97,
    scoreField(foldedQuery, fold(record.slug.replace(/-/g, ' '))) * 0.9,
  ]
}

/**
 * Each extra common name scored as its own field. Returns the best alongside
 * the raw name, so `search` can tell the caller *which* name answered when one
 * outscored every standard field -- that is the name a suggestion row must show
 * to explain itself.
 */
function nameScores(foldedQuery: string, record: SearchRecord): { score: number; name: string }[] {
  const foldedNames = record.names.map((name) => ({ name, folded: fold(name) }))
  return foldedNames
    .map(({ name, folded }) => ({
      score: scoreField(foldedQuery, folded) * NAME_WEIGHT,
      name,
    }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Rank records against a query.
 *
 * `locale` picks which common name is the headline, but **both** are always
 * searched: a reader who types `Fliegenpilz` on the English page should find the
 * species, and gets its English name back as the suggestion. Some entries carry
 * no German name at all, so each name falls back to the other rather than
 * rendering an empty suggestion.
 *
 * `record.names` (Wikidata common names and aliases) is searched too, with one
 * rule over the headline: a suggestion only surfaces `matchedName` when it
 * strictly outscored every standard field. The site's own common name is the
 * answer a reader is heading for, so it stays the headline even when the query
 * only touched an alias -- but a name that *explains the hit* must be visible,
 * or the row appears with nothing lit up.
 *
 * Ties are broken alphabetically so the order is stable between keystrokes --
 * two records scoring identically would otherwise swap places on every repaint
 * and move the row under the reader's cursor.
 */
export function search(
  records: readonly SearchRecord[],
  query: string,
  locale: Locale,
): SearchResult[] {
  const foldedQuery = fold(query)
  if (foldedQuery.length === 0) return []

  const results: SearchResult[] = []
  for (const record of records) {
    const standard = fieldScores(foldedQuery, record)
    let best = 0
    for (const s of standard) if (s > best) best = s

    let matchedName = ''
    for (const { score, name } of nameScores(foldedQuery, record)) {
      if (score <= best) break
      best = score
      matchedName = name
    }
    if (best <= 0) continue

    const en = record.en || record.de
    const de = record.de || record.en
    const label = locale === 'de' ? de : en
    const altLabel = locale === 'de' ? en : de
    results.push({
      record,
      score: best,
      label,
      matchedName,
      // Only worth showing when it is genuinely a different name.
      altLabel: altLabel === label ? '' : altLabel,
      href: `/${locale}/mushrooms/${record.slug}`,
    })
  }

  results.sort(
    (a, b) =>
      b.score - a.score ||
      a.label.localeCompare(b.label) ||
      a.record.slug.localeCompare(b.record.slug),
  )
  return results.slice(0, MAX_SUGGESTIONS)
}

/* ── Highlighting ───────────────────────────────────────────────────────── */

/**
 * Where `query` shows up in `text`, as sorted, merged `[start, end)` ranges over
 * the **original** string -- ready for `text.slice(start, end)` in a `<mark>`.
 *
 * Two passes, and the second only runs when the first found nothing for that
 * query token:
 *
 *   1. the query token verbatim, so `stein` lights up inside `Steinpilz`;
 *   2. the single field token the query token is *closest* to, so a typo still
 *      lights up the word it is a typo of -- `flignpilz` highlights
 *      `Fliegenpilz`, which is the whole point of showing that row at all.
 *
 * Pass 2 applies the same `MIN_FUZZY_LEN` floor and `MIN_DICE` gate as the
 * scorer, for the same reason the scorer has them: highlighting `fl` in an
 * unrelated word would be drawing a claim the matcher did not make. Nothing is
 * ever highlighted twice -- ranges are merged before they are returned.
 *
 * Called only for the rows actually painted (at most `MAX_SUGGESTIONS` x 3), so
 * it never touches the 58-record ranking pass.
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const { folded, map } = foldWithMap(text)
  const foldedQuery = fold(query)
  if (folded === '' || foldedQuery === '') return []

  const found: [number, number][] = []
  const add = (start: number, length: number): void => {
    if (start < 0 || start >= map.length) return
    const last = Math.min(start + length - 1, map.length - 1)
    const from = map[start]
    const to = map[last] + 1
    if (to > from) found.push([from, to])
  }

  // The whole query verbatim is the common case, and one range reads better in
  // the DOM than the per-token ranges that would piece it back together.
  const whole = folded.indexOf(foldedQuery)
  if (whole >= 0) add(whole, foldedQuery.length)

  const tokens: { text: string; start: number }[] = []
  let offset = 0
  for (const token of folded.split(' ')) {
    tokens.push({ text: token, start: offset })
    offset += token.length + 1
  }

  for (const queryToken of foldedQuery.split(' ')) {
    if (queryToken === '') continue
    const verbatim = folded.indexOf(queryToken)
    if (verbatim >= 0) {
      add(verbatim, queryToken.length)
      continue
    }
    if (queryToken.length < MIN_FUZZY_LEN) continue

    // The closest single word, not every near word: one highlight per query
    // token reads as an answer, a scatter of them reads as noise.
    const queryTrigrams = trigrams(queryToken)
    let bestIndex = -1
    let bestScore = 0
    for (let i = 0; i < tokens.length; i++) {
      const target = tokens[i].text
      if (target.length < MIN_FUZZY_LEN) continue
      let score = dice(queryTrigrams, trigrams(target))
      if (nearMatch(queryToken, target)) score = Math.max(score, NEAR_EXACT)
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    if (bestIndex >= 0 && bestScore >= MIN_DICE) {
      add(tokens[bestIndex].start, tokens[bestIndex].text.length)
    }
  }

  found.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: [number, number][] = []
  for (const range of found) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) {
      if (range[1] > last[1]) last[1] = range[1]
    } else {
      merged.push(range)
    }
  }
  return merged
}
