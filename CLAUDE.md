# CLAUDE.md

Guidance for working in this repo.

## What this is

A **static** full-screen menu board for cafes, bars and small kitchens, hosted on
**GitHub Pages**. Sibling to the `opening-hours` and `quotes` apps (also static,
also Pages), and to `weather-app`/`clock-app` (those are Cloudflare Workers — this
one has **no server**). All logic is client-side.

Like Opening Hours this is a **settings** app, and it takes the idea further: the
*entire* payload is the URL. There is no shipped dataset, no fetch, and no state
that outlives the query string. One deployment serves every venue.

## Stack & conventions

- **Bun** for everything (package manager, bundler, test runner). Use `bun` /
  `bunx` — never npm/npx.
- **TypeScript**, strict. All browser JS is authored as `.ts` and bundled by Bun.
- **Tailwind CSS v4**, CSS-first: tokens live in `@theme` in
  `assets/static/styles/tailwind.css`; compiled by `@tailwindcss/cli` at build.
- **Biome** for lint/format: single quotes, no semicolons, 2-space, 100 cols.
  CSS is intentionally excluded from Biome (it doesn't parse Tailwind at-rules).

## Commands

```sh
bun install         # deps; vendored fonts come from @fontsource via sync-fonts
bun run dev         # build + serve dist/ locally
bun run build       # assemble dist/ (see below)
bun test            # bun:test — parser/grouping/column helpers + manifest guard
bun run typecheck   # tsc --noEmit
bun run lint        # biome lint --error-on-warnings
```

## Layout & build

Web root is served from the site root (custom domain), so assets are referenced
absolutely as `/static/...`.

- `index.html` — the page shell. Ships a static worked example inline (Corner
  Coffee) so the board is never blank pre-JS or in the store preview; keep it in
  step with `EXAMPLE` in `main.ts`. Asset URLs carry `?v=__ASSET_VERSION__`,
  replaced at build.
- `assets/static/js/menu.ts` — **pure, exported, unit-tested** helpers: the wire
  format (`parseItem`/`parseMenu`), section grouping (`groupSections`), currency
  (`withCurrency`) and layout arithmetic (`columnCount`). The file header
  documents the encoding and *why* it is shaped that way — read it before
  changing the format.
- `assets/static/js/main.ts` — the browser **entry**. Reads the query string
  (falls back to the example), renders the sections, and runs `fitToViewport`.
  Keep it **export-free** and free of top-level `await` so Bun bundles it to a
  self-contained classic script.
- `.well-known/signage-app.json` — the [app-store manifest](../app-store/docs/app-manifest.md).
  The menu is an **array** setting whose items compose to one token via
  `x-format` (`{section}|{name}|{price}|{description}`), exploded in the launch
  template as `item*`. `test/manifest.test.ts` guards it against the store's
  schema.

`build.js` builds into `dist/` **without mutating sources**: vendor fonts → copy
`index.html` + static assets + `.well-known/` → compile+minify Tailwind →
bundle+minify the TS → stamp a sha256 content hash into `?v=` URLs → write `CNAME`.
There is no shipped dataset — the data is the URL — so nothing but JS+CSS feeds
the cache-busting hash. `dist/` is gitignored and is the artifact Pages publishes.

## Two things that are load-bearing

**Sections ride on the item.** They are not their own param. The store serialises
settings with an RFC 6570 template, which expands each variable as its own run,
so interleaved `section=`/`item=` params would lose their ordering the moment the
store built the URL. Carrying the section on each item is the only encoding that
survives the round trip. Do not "simplify" this.

**The board must always fit.** Signage has no scrollbar and no one to scroll it,
so overflow means items silently missing — the worst failure this app has.
`columnCount` picks the column count from the line count, and `fitToViewport`
shrinks the root font-size until the board fits. Any layout change needs
re-testing with a long menu (25+ items), not just the example.

## Design — "Ticket board"

The vernacular is enamel cafe signage and the paper ticket, deliberately **not**
the chalkboard — that cliche photographs well and reads badly at three metres.
Warm near-black ground (`--color-ink`) rather than slate, amber (`--color-amber`)
rather than chalk-white, and Space Mono prices that line up like a till roll.
Fraunces (display: title + section headings) over Hanken Grotesk (item names and
descriptions).

The signature is the **section band**: an amber rule the full width of the column
with the section name sitting on it, so the eye can jump to "Pastries" from across
the room without reading an item. The item leader is a faint hairline rather than
a dotted one — the dotted leader is the sibling Opening Hours app's signature and
shouldn't be duplicated across the store.

One fluid root font-size (`clamp(vw+vh)` tuned via `--root-*`) is
orientation-neutral; children size in `rem`, so it works from the 800×480 Pi
display to 4K, portrait and landscape, with no breakpoints.

## Quality bars

- **Accessibility:** target a 100 Lighthouse/PageSpeed accessibility score —
  `dl`/`dt`/`dd` for the term-and-price structure, one `h1` with `h2` sections,
  AA contrast (verified 87 checks across three resolutions, 0 failures), `lang`,
  named links, zoomable viewport, reduced-motion respected.
- **Resolutions:** must look correct at every entry in the README table, both
  orientations, **and** with a long menu.
- Run `typecheck`, `lint`, and `test` before pushing (CI enforces them).

## Deploy

Deploys are **tag-driven**, not branch-driven: pushing a CalVer tag (`YYYY.N`)
runs `.github/workflows/deploy-pages.yml`, which builds and publishes to Pages.
It also accepts `workflow_dispatch`. Pushing to `master` alone does nothing —
cut a tag. PRs run `ci.yml` (typecheck + lint + test + build). Action versions
are SHA-pinned.

(The sibling apps' READMEs claim master-push deploys; that is stale — their
workflows are tag-triggered too.)
