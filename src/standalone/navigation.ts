/**
 * Ersatz für `next/navigation` in der eigenständigen Fassung (0.8.0): Seiten
 * ohne Next (reines HTML, exportierte Design-Seiten) haben keinen Router. Jede
 * Seite ist ein eigener Aufruf, also genügt der Pfad beim Laden; ein Sprung
 * aus der Liste auf eine andere Seite ist ein normaler Seitenwechsel.
 *
 * Nur für den Bundler (`scripts/standalone.mjs`, Alias `next/navigation`).
 */
export function usePathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

export function useRouter(): { push: (ziel: string) => void } {
  return { push: (ziel: string) => window.location.assign(ziel) };
}
