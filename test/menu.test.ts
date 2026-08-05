import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_SECTION,
  columnCount,
  groupSections,
  looksLikePrice,
  parseItem,
  parseMenu,
  withCurrency
} from '../assets/static/js/menu'

describe('parseItem', () => {
  test('reads the full four-field form', () => {
    const parsed = parseItem('Coffee|Flat White|3.40|Our house blend')
    expect(parsed).toEqual({
      section: 'Coffee',
      item: { name: 'Flat White', price: '3.40', description: 'Our house blend' }
    })
  })

  test('reads section + name + price', () => {
    expect(parseItem('Coffee|Espresso|2.60')?.item).toEqual({
      name: 'Espresso',
      price: '2.60',
      description: ''
    })
  })

  test('reads section + name alone', () => {
    expect(parseItem('Coffee|Espresso')?.item).toEqual({
      name: 'Espresso',
      price: '',
      description: ''
    })
  })

  test('a bare name falls back to the default section', () => {
    const parsed = parseItem('Espresso')
    expect(parsed?.section).toBe(DEFAULT_SECTION)
    expect(parsed?.item.name).toBe('Espresso')
  })

  test('an empty section falls back to the default', () => {
    expect(parseItem('|Espresso|2.60')?.section).toBe(DEFAULT_SECTION)
  })

  // The store drops a blank field *and* its separator, so a section-less item
  // arrives as `name|price` — the same two-field shape as `section|name`.
  // Verified against the store's own applyItemFormat in the round-trip check.
  test('two fields ending in a price is a section-less item, not a section', () => {
    const parsed = parseItem('Cortado|3.10')
    expect(parsed?.section).toBe(DEFAULT_SECTION)
    expect(parsed?.item).toEqual({ name: 'Cortado', price: '3.10', description: '' })
  })

  test('two fields with no digit is section + name', () => {
    const parsed = parseItem('Pastries|Cinnamon Bun')
    expect(parsed?.section).toBe('Pastries')
    expect(parsed?.item.name).toBe('Cinnamon Bun')
  })

  // The one genuinely ambiguous shape: the store drops an empty field *and* its
  // separator, so "no price but a description" arrives with three fields, the
  // same shape as section|name|price.
  test('a digitless third field is read as a description, not a price', () => {
    expect(parseItem('Specials|Soup of the day|Ask your server')?.item).toEqual({
      name: 'Soup of the day',
      price: '',
      description: 'Ask your server'
    })
  })

  test('a third field with digits is read as a price', () => {
    expect(parseItem('Specials|Soup|4.50')?.item.price).toBe('4.50')
  })

  test('an escaped pipe survives inside a field', () => {
    expect(parseItem('Coffee|Filter \\| Batch brew|3.00')?.item.name).toBe('Filter | Batch brew')
  })

  test('trims surrounding whitespace', () => {
    expect(parseItem('  Coffee | Flat White | 3.40 ')?.item.name).toBe('Flat White')
  })

  test('rejects an entry with no item name', () => {
    expect(parseItem('Coffee|')).toBeNull()
    expect(parseItem('')).toBeNull()
  })
})

describe('looksLikePrice', () => {
  test.each([
    ['3.40', true],
    ['£3.40', true],
    ['3,40 €', true],
    ['12/16', true],
    ['2 for 5', true],
    ['Ask your server', false],
    ['Market price', false],
    ['', false]
  ])('%s -> %s', (token, expected) => {
    expect(looksLikePrice(token as string)).toBe(expected)
  })
})

describe('groupSections', () => {
  test('keeps sections in first-appearance order', () => {
    const sections = groupSections([
      { section: 'Coffee', item: { name: 'A', price: '', description: '' } },
      { section: 'Food', item: { name: 'B', price: '', description: '' } },
      { section: 'Coffee', item: { name: 'C', price: '', description: '' } }
    ])
    expect(sections.map((s) => s.title)).toEqual(['Coffee', 'Food'])
  })

  test('regroups non-adjacent items of the same section', () => {
    const sections = groupSections([
      { section: 'Coffee', item: { name: 'A', price: '', description: '' } },
      { section: 'Food', item: { name: 'B', price: '', description: '' } },
      { section: 'Coffee', item: { name: 'C', price: '', description: '' } }
    ])
    expect(sections[0]?.items.map((i) => i.name)).toEqual(['A', 'C'])
  })
})

describe('withCurrency', () => {
  test('prefixes a bare number', () => {
    expect(withCurrency('3.40', '£')).toBe('£3.40')
  })

  test('leaves an already-ornamented price alone', () => {
    expect(withCurrency('$4', '£')).toBe('$4')
    expect(withCurrency('4 EUR', '£')).toBe('4 EUR')
    expect(withCurrency('Market price', '£')).toBe('Market price')
  })

  test('is a no-op with no currency or no price', () => {
    expect(withCurrency('3.40', '')).toBe('3.40')
    expect(withCurrency('', '£')).toBe('')
  })
})

describe('parseMenu', () => {
  const search =
    '?name=Corner+Coffee&currency=%C2%A3' +
    '&item=Coffee%7CEspresso%7C2.60' +
    '&item=Coffee%7CFlat+White%7C3.40%7COur+house+blend' +
    '&item=Pastries%7CAlmond+Croissant%7C3.20' +
    '&note=Oat+milk+at+no+extra+charge'

  test('reads the board copy', () => {
    const menu = parseMenu(search)
    expect(menu.title).toBe('Corner Coffee')
    expect(menu.note).toBe('Oat milk at no extra charge')
    expect(menu.currency).toBe('£')
    expect(menu.configured).toBe(true)
  })

  test('groups into sections and applies currency', () => {
    const menu = parseMenu(search)
    expect(menu.sections.map((s) => s.title)).toEqual(['Coffee', 'Pastries'])
    expect(menu.sections[0]?.items[1]).toEqual({
      name: 'Flat White',
      price: '£3.40',
      description: 'Our house blend'
    })
  })

  test('an empty query string is not configured', () => {
    const menu = parseMenu('')
    expect(menu.configured).toBe(false)
    expect(menu.sections).toEqual([])
  })

  test('skips blank and nameless item params', () => {
    const menu = parseMenu('?item=&item=%20&item=Coffee%7C&item=Coffee%7CEspresso')
    expect(menu.sections[0]?.items).toHaveLength(1)
  })
})

describe('columnCount', () => {
  const menuOf = (sections: number, perSection: number) => ({
    title: '',
    subtitle: '',
    currency: '',
    note: '',
    configured: true,
    sections: Array.from({ length: sections }, (_, s) => ({
      title: `S${s}`,
      items: Array.from({ length: perSection }, (_, i) => ({
        name: `I${i}`,
        price: '',
        description: ''
      }))
    }))
  })

  test('keeps a short menu in one column', () => {
    expect(columnCount(menuOf(2, 3), true)).toBe(1)
  })

  test('splits a medium menu into two in landscape', () => {
    expect(columnCount(menuOf(3, 5), true)).toBe(2)
  })

  test('portrait keeps a medium menu in one column', () => {
    // 18 lines: two columns on a narrow panel would be cramped and leave the
    // screen half empty, so portrait stays single until it has to split.
    expect(columnCount(menuOf(3, 5), false)).toBe(1)
  })

  test('portrait splits once the menu is genuinely long', () => {
    expect(columnCount(menuOf(4, 8), false)).toBe(2)
  })

  test('allows a third column only in landscape', () => {
    const big = menuOf(4, 8)
    expect(columnCount(big, true)).toBe(3)
    expect(columnCount(big, false)).toBe(2)
  })
})
