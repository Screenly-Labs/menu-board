// Browser entry. esbuild bundles this (inlining ./menu) into a self-contained
// classic script with no exports, so it loads from a plain <script>. Keep it
// export-free and free of top-level await.

// Side-effect import: installs the replaceChildren shim for the older-browser
// degraded mode. Must stay first so the shim is in place before any render.
import '@screenly-labs/signage-kit/polyfills'
import { removeScreenlyBranding } from '@screenly-labs/signage-kit/branding'
import { columnCount, type Menu, parseMenu } from './menu'

// Shown when the page is opened with no settings (the store preview, or a bare
// visit), so the board is never blank and demonstrates the format. Real
// deployments carry the whole menu in the launch URL's query string. Kept in
// step with the static markup in index.html.
const EXAMPLE =
  'name=Corner+Coffee&subtitle=Roasted+on+Bermondsey+Street&currency=%C2%A3' +
  '&item=Coffee%7CEspresso%7C2.60' +
  '&item=Coffee%7CFlat+White%7C3.40%7COur+house+blend%2C+silky+and+sweet' +
  '&item=Coffee%7CFilter%7C3.00%7CRotating+single+origin' +
  '&item=Coffee%7CMocha%7C3.80' +
  '&item=Pastries%7CAlmond+Croissant%7C3.20%7CBaked+here+each+morning' +
  '&item=Pastries%7CCinnamon+Bun%7C3.00' +
  '&item=Pastries%7CSourdough+Toast%7C2.80%7CWith+butter+and+jam' +
  '&item=Lunch%7CSoup+of+the+Day%7CAsk+at+the+counter' +
  '&item=Lunch%7CToastie%7C6.50%7CCheddar%2C+onion%2C+mustard' +
  '&note=Oat+milk+at+no+extra+charge'

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const setText = (id: string, value: string): void => {
  const node = document.getElementById(id)
  if (!node) return
  node.textContent = value
  node.hidden = value === ''
}

// One section: a heading, then a definition-style list of items. dl/dt/dd is the
// honest structure for a term-and-price list, and it lets the price sit in the
// same row as the name without a table's rigidity.
const renderSection = (section: { title: string; items: Menu['sections'][0]['items'] }) => {
  const wrap = el('section', 'course')
  wrap.append(el('h2', 'course__title', section.title))

  const list = el('dl', 'items')
  for (const item of section.items) {
    const row = el('div', 'item')

    const head = el('div', 'item__head')
    head.append(el('dt', 'item__name', item.name))
    // The leader is decorative: it ties the name to its price the way a printed
    // menu does. Hidden from assistive tech, which reads name then price.
    head.append(el('span', 'item__leader'))
    if (item.price) head.append(el('dd', 'item__price', item.price))
    row.append(head)

    if (item.description) row.append(el('dd', 'item__desc', item.description))
    list.append(row)
  }

  wrap.append(list)
  return wrap
}

// Shrink the root font-size until the whole board fits the panel.
//
// Signage has no scrollbar and nobody standing there to scroll it, so a menu
// that overflows is simply a menu with items missing — the worst failure this
// app has. The fluid root sizes for a typical menu; this is the safety net for
// a long one. Everything is sized in rem, so scaling the root scales the board.
//
// Iterative rather than a single ratio because wrapping is non-linear: shrinking
// the type reflows descriptions onto fewer lines, which frees more height than a
// proportional guess would predict.
const MIN_ROOT_PX = 7
const fitToViewport = (): void => {
  const html = document.documentElement
  // Start from the stylesheet's own clamp so repeated fits never ratchet down.
  html.style.fontSize = ''
  let size = Number.parseFloat(window.getComputedStyle(html).fontSize)
  if (!Number.isFinite(size) || size <= 0) return

  const overflowing = () => html.scrollHeight > window.innerHeight + 1
  // 40 steps of 4% bottoms out around a third of the starting size, well past
  // any menu that is still legible; MIN_ROOT_PX stops it before absurdity.
  for (let i = 0; i < 40 && overflowing() && size > MIN_ROOT_PX; i++) {
    size *= 0.96
    html.style.fontSize = `${size}px`
  }
}

const render = (menu: Menu): void => {
  document.title = menu.title ? `${menu.title} | Menu Board` : 'Menu Board'
  setText('board-title', menu.title || 'Menu')
  setText('board-subtitle', menu.subtitle)
  setText('board-note', menu.note)

  const body = document.getElementById('board-body')
  if (body) {
    const landscape = window.innerWidth >= window.innerHeight
    body.style.setProperty('--columns', String(columnCount(menu, landscape)))
    body.replaceChildren(...menu.sections.map(renderSection))
  }

  // Must run after the sections are in the DOM, so it measures the real board.
  fitToViewport()

  document.documentElement.dataset.state = 'ready'
}

const init = (): void => {
  removeScreenlyBranding()
  const menu = parseMenu(window.location.search || `?${EXAMPLE}`)
  render(menu)
  // Signage panels get rotated in the field, so recompute the column count when
  // the viewport aspect changes. Nothing else here depends on time.
  window.addEventListener('resize', () => render(menu))
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
