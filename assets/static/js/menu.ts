// Pure, testable helpers for the Menu Board. No DOM here — main.ts owns that.
//
// The whole menu arrives in the launch URL's query string. There is no server
// and no shipped dataset, so this module is the app's entire data layer.
//
// Wire format
// -----------
// Each item is one repeated `item=` param holding a pipe-delimited token:
//
//   item=Coffee|Flat White|3.40|Our house blend, silky and sweet
//        \_____/ \________/ \__/ \________________________________/
//        section   name     price            description
//
// Sections are *not* their own param. They ride on each item and are collected
// in order of first appearance. That is deliberate: the store serialises
// settings with an RFC 6570 template, which expands each variable as its own
// run (`?section=A&section=B&item=…&item=…`), so interleaved section/item
// params would lose their ordering the moment the store built the URL. Carrying
// the section on the item is the only encoding that survives that round trip.
//
// Empty trailing fields collapse, so the short forms all work:
//
//   item=Coffee|Espresso|2.60      no description
//   item=Coffee|Espresso           no price either
//
// Two ambiguities are unavoidable, both because the store's `x-format` drops an
// empty field *and its separator*, so a short token can have more than one
// reading. `looksLikePrice` settles both, and the round trip is verified against
// the store's own composer and template expander:
//
//   Cortado|3.10          no section    -> name|price      (digit in field 2)
//   Coffee|Espresso       no price      -> section|name
//   Lunch|Soup|Ask inside no price      -> section|name|description
//   Coffee|Espresso|2.60  no description-> section|name|price
//
// The reading is wrong only for an item whose price carries no digit at all
// ("Market price") *and* which omits every other optional field. Writing the
// price with a digit, or adding a description, resolves it.

export interface MenuItem {
  name: string
  price: string
  description: string
}

export interface MenuSection {
  title: string
  items: MenuItem[]
}

export interface Menu {
  title: string
  subtitle: string
  currency: string
  note: string
  sections: MenuSection[]
  /** False when nothing parsed and the worked example is standing in. */
  configured: boolean
}

/** Fallback section title when an item carries no section of its own. */
export const DEFAULT_SECTION = 'Menu'

/**
 * Does this token read as a price rather than prose?
 *
 * Any digit qualifies, which covers "3.40", "£3.40", "3,40 €", "12/16" and
 * "2 for 5". Prose descriptions on a cafe menu essentially never contain a
 * digit, and when they do ("Serves 2") the item almost always has a real price
 * in front of it, so this branch is not reached.
 */
export const looksLikePrice = (token: string): boolean => /\d/.test(token)

/** Split on unescaped pipes; `\|` is a literal pipe inside a field. */
const splitFields = (raw: string): string[] =>
  raw
    .split(/(?<!\\)\|/)
    .map((field) => field.replace(/\\\|/g, '|').trim())

/**
 * Parse one `item=` token into a section name and an item.
 *
 * Returns null when there is no item name, which is the only genuinely required
 * field — an entry with just a price is not a menu line.
 */
export const parseItem = (raw: string): { section: string; item: MenuItem } | null => {
  const fields = splitFields(raw)
  if (fields.length === 0) return null

  // One field is a bare item name with no section.
  if (fields.length === 1) {
    const name = fields[0] ?? ''
    return name ? { section: DEFAULT_SECTION, item: { name, price: '', description: '' } } : null
  }

  const [first = '', second = '', third = '', fourth = ''] = fields

  // Two fields are ambiguous: an item with no price or description composes to
  // `section|name`, but an item with no *section* composes to `name|price` —
  // the store drops a blank field along with its separator, so both arrive with
  // the same shape. The digit test tells them apart: `Cortado|3.10` is a priced
  // item with no section, `Coffee|Espresso` is a section and an item.
  if (fields.length === 2) {
    if (looksLikePrice(second)) {
      return first ? { section: DEFAULT_SECTION, item: { name: first, price: second, description: '' } } : null
    }
    return second ? { section: first || DEFAULT_SECTION, item: { name: second, price: '', description: '' } } : null
  }

  const section = first || DEFAULT_SECTION
  const name = second
  if (!name) return null

  // Four fields is the unambiguous full form.
  if (fields.length >= 4) {
    return { section, item: { name, price: third, description: fourth } }
  }

  // Three fields: price or description? See the note at the top of this file.
  return looksLikePrice(third)
    ? { section, item: { name, price: third, description: '' } }
    : { section, item: { name, price: '', description: third } }
}

/**
 * Group items into sections, preserving first-appearance order for the sections
 * and source order within each. Items for the same section stay together even if
 * their `item=` params are not adjacent.
 */
export const groupSections = (entries: { section: string; item: MenuItem }[]): MenuSection[] => {
  const order: string[] = []
  const bySection = new Map<string, MenuItem[]>()
  for (const { section, item } of entries) {
    let bucket = bySection.get(section)
    if (!bucket) {
      bucket = []
      bySection.set(section, bucket)
      order.push(section)
    }
    bucket.push(item)
  }
  return order.map((title) => ({ title, items: bySection.get(title) ?? [] }))
}

/**
 * Prefix a bare numeric price with the board's currency symbol. A price that
 * already carries any non-digit ornament ("$4", "4 EUR", "Market price") is
 * left exactly as written, so the setting never fights an explicit choice.
 */
export const withCurrency = (price: string, currency: string): string => {
  if (!price || !currency) return price
  return /^[\d.,]+$/.test(price) ? `${currency}${price}` : price
}

/** Build the whole board from a query string (`location.search`). */
export const parseMenu = (search: string): Menu => {
  const params = new URLSearchParams(search)

  const entries: { section: string; item: MenuItem }[] = []
  for (const raw of params.getAll('item')) {
    if (!raw.trim()) continue
    const parsed = parseItem(raw)
    if (parsed) entries.push(parsed)
  }

  const currency = (params.get('currency') ?? '').trim()
  const sections = groupSections(entries).map((section) => ({
    title: section.title,
    items: section.items.map((item) => ({
      ...item,
      price: withCurrency(item.price, currency)
    }))
  }))

  return {
    title: (params.get('name') ?? '').trim(),
    subtitle: (params.get('subtitle') ?? '').trim(),
    currency,
    note: (params.get('note') ?? '').trim(),
    sections,
    configured: sections.length > 0
  }
}

/**
 * How many columns the board should flow into.
 *
 * Driven by the number of lines the menu actually has (items plus one heading
 * row per section), not by viewport width — signage runs at a fixed size and a
 * six-line menu should never be split just because the panel is wide.
 *
 * Orientation only sets the ceiling. A portrait panel is narrow, so splitting
 * early gives two cramped columns and leaves the screen half empty; it stays in
 * one column far longer and never goes past two.
 */
export const columnCount = (menu: Menu, landscape: boolean): number => {
  const lines = menu.sections.reduce((sum, section) => sum + section.items.length + 1, 0)
  if (lines <= 9) return 1
  if (!landscape) return lines <= 18 ? 1 : 2
  if (lines <= 20) return 2
  return 3
}
