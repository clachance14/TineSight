'use client'

import { DeerCatalog } from '@/components/deer/deer-catalog'

/**
 * Catalog page wrapper. Bucks are never "added" blank here — a Buck is only ever
 * identified from a Detection in the photo flow (see CONTEXT.md / ADR 0005), so
 * this page is read-and-navigate only; tapping a card opens the Buck's profile.
 */
export function DeerCatalogClient() {
  return <DeerCatalog />
}
