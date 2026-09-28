/**
 * Die Antwort der KI-Hilfe in Teilen: Einleitung, nummerierte Schritte, Hinweis.
 *
 * Gelesen wird auch halb fertig, weil die Antwort gestreamt ankommt; jeder
 * Aufruf nimmt den ganzen bisherigen Text. Eine Zielmarke, die nicht im
 * Katalog steht, fällt weg. Eine halb gestreamte Marke („[ziel:spen") wird
 * ausgeblendet, statt als Rohtext aufzublitzen.
 */

export interface Schritt {
  nr: number;
  text: string;
  ziel: string | null;
}

export interface KiAntwort {
  einleitung: string;
  schritte: Schritt[];
  hinweis: string;
}

const MARKE = /\s*\[ziel:([a-z0-9-]+)\]/gi;
const HALBE_MARKE = /\s*\[(?:z(?:i(?:e(?:l(?::[a-z0-9-]*)?)?)?)?)?$/i;
const SCHRITT = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const HINWEIS = /^\s*hinweis:\s*/i;

function ohneMarken(text: string, bekannt: (id: string) => boolean): { text: string; ziel: string | null } {
  let ziel: string | null = null;
  const sauber = text
    .replace(MARKE, (_, id: string) => {
      const kennung = id.toLowerCase();
      if (!ziel && bekannt(kennung)) ziel = kennung;
      return "";
    })
    .replace(HALBE_MARKE, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .trim();
  return { text: sauber, ziel };
}

export function leseAntwort(roh: string, bekannt: (id: string) => boolean = () => false): KiAntwort {
  const einleitung: string[] = [];
  const hinweis: string[] = [];
  const schritte: Schritt[] = [];
  let modus: "einleitung" | "schritte" | "hinweis" = "einleitung";

  for (const zeile of roh.split("\n")) {
    const schritt = SCHRITT.exec(zeile);
    if (schritt && modus !== "hinweis") {
      modus = "schritte";
      const { text, ziel } = ohneMarken(schritt[2] ?? "", bekannt);
      schritte.push({ nr: schritte.length + 1, text, ziel });
      continue;
    }
    if (HINWEIS.test(zeile)) {
      modus = "hinweis";
      hinweis.push(ohneMarken(zeile.replace(HINWEIS, ""), bekannt).text);
      continue;
    }
    const { text } = ohneMarken(zeile, bekannt);
    if (!text) continue;
    if (modus === "einleitung") einleitung.push(text);
    else if (modus === "hinweis") hinweis.push(text);
    else {
      const letzter = schritte[schritte.length - 1];
      if (letzter) letzter.text += ` ${text}`;
    }
  }

  return { einleitung: einleitung.join("\n"), schritte, hinweis: hinweis.join(" ") };
}
