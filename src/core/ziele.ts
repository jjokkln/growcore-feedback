/**
 * Klickziele der KI-Hilfe — was sie auf der Seite markieren darf.
 *
 * Die KI hängt an einen Schritt nur eine KENNUNG (`[ziel:spenden-knopf]`), nie
 * einen Selektor: Ein Selektor vom Modell wäre eine Vermutung über das Markup,
 * und eine falsche Markierung ist schlimmer als keine. Den Katalog pflegt das
 * Projekt; unbekannte Kennungen verwirft der Parser.
 *
 * ⚠️ Eine neue Funktion ist erst fertig, wenn ihre Knöpfe hier stehen — sonst
 * zeigt die Hilfe still nicht mehr hin.
 */

export interface Ziel {
  /** Was die KI im Katalog liest und die Führungskarte zeigt. */
  name: string;
  /** Auf welcher Seite es liegt, nur als Hinweis für die KI. */
  seite?: string;
  /** Der Reihe nach, das erste SICHTBARE Element gewinnt. */
  selektoren?: Array<{ css: string; vorstufe?: true }>;
  /** Sonst: ein Link, Knopf oder Reiter, dessen Text so beginnt. */
  text?: string;
}

export type ZielKatalog = Record<string, Ziel>;

export function zielKatalogText(ziele: ZielKatalog): string {
  const zeilen = Object.entries(ziele).map(
    ([id, z]) => `- ${id}: ${z.name}${z.seite ? ` (Seite ${z.seite})` : ""}`,
  );
  return zeilen.length ? zeilen.join("\n") : "(keine)";
}
