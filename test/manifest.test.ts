import { describe, expect, test } from 'bun:test'
import manifest from '../.well-known/signage-app.json'

// Guards the signage app manifest (.well-known/signage-app.json) against the
// core rules of the app-store manifest schema. The store's index build rejects
// any app whose manifest fails validation, so keep this in step with
// static/schemas/signage-app-manifest.schema.json in the app-store repo.
//
// Menu Board is a settings app whose payload is entirely in the URL: repeated
// `item=` params carrying pipe-delimited tokens, composed by `x-format`.

describe('signage-app.json manifest', () => {
  test('declares the current manifest version', () => {
    expect(manifest.manifestVersion).toBe('1')
  })

  test('has a store-valid id slug', () => {
    expect(manifest.id).toBe('menu-board')
    expect(manifest.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  test('has non-empty required human copy', () => {
    for (const key of ['name', 'description'] as const) {
      expect(typeof manifest[key]).toBe('string')
      expect(manifest[key].length).toBeGreaterThan(0)
    }
  })

  test('launches from a valid https base URL', () => {
    const url = new URL(manifest.launch.baseUrl)
    expect(url.protocol).toBe('https:')
  })

  test('is a settings app: a template requires a settings schema', () => {
    expect('template' in manifest.launch).toBe(true)
    expect('settings' in manifest).toBe(true)
    expect(manifest.settings.type).toBe('object')
  })

  test('exposes the board copy fields plus the item array', () => {
    const props = Object.keys(manifest.settings.properties)
    for (const field of ['name', 'subtitle', 'currency', 'item', 'note']) {
      expect(props).toContain(field)
    }
    expect(manifest.settings.properties.item.type).toBe('array')
  })

  test('items compose into one token via x-format, with name required', () => {
    const items = manifest.settings.properties.item.items
    expect(items['x-format']).toBe('{section}|{name}|{price}|{description}')
    expect(items.required).toEqual(['name'])
    // Every field the format interpolates must exist as a property.
    const fields = (items['x-format'].match(/\{(\w+)\}/g) ?? []).map((m: string) => m.slice(1, -1))
    for (const field of fields) expect(Object.keys(items.properties)).toContain(field)
  })

  test('the repeated item param is exploded', () => {
    // Without the `*` the array would serialise as one comma-joined value
    // instead of repeating the param (see docs/app-manifest.md).
    expect(manifest.launch.template).toContain('item*')
  })

  test('every launch-template variable maps to a settings property', () => {
    const vars = (manifest.launch.template.match(/[a-z0-9]+/gi) ?? []).filter(
      (v: string) => v.length > 0
    )
    const props = new Set(Object.keys(manifest.settings.properties))
    for (const v of vars) expect(props.has(v)).toBe(true)
  })

  test('puts every parameter in a single query expression', () => {
    const groups = manifest.launch.template.match(/\{[?&][^}]*\}/g) ?? []
    expect(groups.length).toBe(1)
    expect(groups[0]?.startsWith('{?')).toBe(true)
  })

  test('tags are unique strings', () => {
    const tags = manifest.tags
    for (const t of tags) expect(typeof t).toBe('string')
    expect(new Set(tags).size).toBe(tags.length)
  })

  test('declares fixed pacing with nothing to refresh', () => {
    // The menu only changes when the URL does, so there is no data to re-fetch
    // and no internal rotation to pace.
    expect(manifest.playback.pacing).toBe('fixed')
    expect('refreshIntervalS' in manifest.playback).toBe(false)
  })

  test('only carries known top-level keys', () => {
    const allowed = new Set([
      'manifestVersion',
      'id',
      'name',
      'description',
      'summary',
      'vendor',
      'tags',
      'icon',
      'screenshots',
      'homepage',
      'source',
      'support',
      'playback',
      'settings',
      'launch'
    ])
    for (const key of Object.keys(manifest)) expect(allowed).toContain(key)
  })
})
