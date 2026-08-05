#!/usr/bin/env bun
// Vendor this app's webfonts into ./assets/static/fonts. The files, versions,
// and copy logic all live in @screenly-labs/signage-kit — this just names the
// families the "Ticket board" design uses: Fraunces for the venue name and
// section headings, Hanken Grotesk for item names and descriptions, and Space
// Mono for the price column (tabular figures, and the receipt vernacular the
// whole design borrows from).

import { syncFonts } from '@screenly-labs/signage-kit/sync-fonts'

export const run = () => syncFonts(['fraunces', 'hanken-grotesk', 'space-mono'])

if (import.meta.main) {
  await run()
}
