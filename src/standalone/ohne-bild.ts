/**
 * Ersatz für `html-to-image` in der eigenständigen Fassung (0.17.0): Dort nimmt
 * die Sammelstelle (galdora-network) keine Bilder an, und die Bibliothek wöge
 * rund 15 KB mehr im einen Skript. `stelleAlsBild` fängt den Fehler und
 * speichert ohne Bild.
 *
 * Nur für den Bundler (`scripts/standalone.mjs`, Alias `html-to-image`).
 */
export async function toJpeg(): Promise<string> {
  throw new Error("Bilder gibt es in der eigenständigen Fassung nicht.");
}
