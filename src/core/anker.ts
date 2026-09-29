/**
 * Verankerung von Marken im Dokument.
 *
 * Katalog-Baustein „Abnahme-Overlay-mit-Freihand".
 *
 * ⚠️ Eine Marke bei `left: 812px` ist beim nächsten Aufruf falsch: ein
 * schmaleres Fenster, eine andere Schrift, ein Absatz mehr. Gespeichert wird
 * deshalb ein ELEMENT plus der Anteil in seiner Box; beim Anzeigen wird
 * zurückgerechnet. Fällt das Element weg, greift der Dokument-Anteil.
 *
 * Projekte markieren eine eigene Einheit mit `data-review-anker="Name"`.
 */
import type { Punkt } from "./typen.ts";

/**
 * „Das ist eine eigene Einheit." Ein Klick irgendwo im Text verankert nicht
 * am zufällig getroffenen `<span>` — der verschwindet beim nächsten
 * Textumbruch —, sondern am umgebenden Block.
 */
const ANKER_SELEKTOR = [
  "[data-review-anker]",
  "section",
  "header",
  "footer",
  "article",
  "aside",
  "nav",
  "form",
  "figure",
  "table",
  // shadcn-Karten und Tabellenzeilen in Webapps — ohne diese Zeilen
  // verankerte ein Klick in eine Karte am getroffenen `<span>`.
  "[data-slot=card]",
  "[data-slot=table-row]",
  "[role=tabpanel]",
].join(",");

/** Elemente, die als Anker nichts taugen. Darüber hinaus wird nicht gesucht. */
const STOPP = new Set(["BODY", "HTML", "MAIN"]);

/** Alles, was zum Overlay selbst gehört — daran wird nie verankert. */
export const OVERLAY_ATTR = "data-review-ui";

export function kuerze(wert: string, max: number): string {
  const sauber = wert.replace(/\s+/g, " ").trim();
  return sauber.length <= max ? sauber : `${sauber.slice(0, max - 1).trimEnd()}…`;
}

/** Zum angeklickten Element die nächste sinnvolle Bezugseinheit. */
export function sektionsWurzel(element: Element | null): Element | null {
  let aktuell: Element | null = element;
  while (aktuell && !STOPP.has(aktuell.tagName)) {
    if (aktuell.matches(ANKER_SELEKTOR)) return aktuell;
    aktuell = aktuell.parentElement;
  }
  return element;
}

/** Index unter den Geschwistern gleichen Tags (1-basiert). */
function nterVomTyp(element: Element): number {
  const eltern = element.parentElement;
  if (!eltern) return 1;
  let index = 0;
  for (let i = 0; i < eltern.children.length; i += 1) {
    const kind = eltern.children[i];
    if (kind.tagName === element.tagName) {
      index += 1;
      if (kind === element) return index;
    }
  }
  return index || 1;
}

/**
 * CSS-Pfad zum Wiederfinden (`#id` beendet den Pfad, sonst
 * `tag:nth-of-type(n)` je Ebene).
 *
 * Arbeitsmaterial, keine stabile Zusage: Der Pfad bricht, sobald sich das
 * Markup ändert. Deshalb wird zusätzlich immer das Label gespeichert — und
 * deshalb gibt es den Dokument-Notnagel.
 */
export function selektorPfad(element: Element | null, maxTiefe = 8): string {
  const teile: string[] = [];
  let aktuell: Element | null = element;
  let tiefe = 0;

  while (aktuell && !STOPP.has(aktuell.tagName) && tiefe < maxTiefe) {
    const tag = aktuell.tagName.toLowerCase();
    if (aktuell.id) {
      teile.unshift(`#${CSS.escape(aktuell.id)}`);
      break;
    }
    teile.unshift(`${tag}:nth-of-type(${nterVomTyp(aktuell)})`);
    aktuell = aktuell.parentElement;
    tiefe += 1;
  }

  return kuerze(teile.join(" > "), 500);
}

/**
 * Lesbarer Name, in absteigender Verlässlichkeit:
 * `data-review-anker` → `aria-label` → erste Überschrift → `id` → Tag.
 */
export function ankerLabel(element: Element | null, datensparsam = false): string {
  if (!element) return "Unbekannte Stelle";

  const gesetzt = element.getAttribute("data-review-anker");
  if (gesetzt?.trim()) return kuerze(gesetzt, 120);

  // Datensparsam: nur, was das Projekt selbst als Namen vergeben hat. `aria-label`
  // und Überschrift zeigen auf Seiten mit Personendaten den Menschen, um den es
  // geht („Bewerber Max Muster"), und würden ihn in die Anmerkung kopieren.
  if (datensparsam) {
    if (element.id) return kuerze(`#${element.id}`, 120);
    return kuerze(`<${element.tagName.toLowerCase()}>`, 120);
  }

  const aria = element.getAttribute("aria-label");
  if (aria?.trim()) return kuerze(aria, 120);

  const ueberschrift = element.querySelector("h1, h2, h3, h4");
  const text = ueberschrift?.textContent?.trim();
  if (text) return kuerze(text, 120);

  if (element.id) return kuerze(`#${element.id}`, 120);

  return kuerze(`<${element.tagName.toLowerCase()}>`, 120);
}

/**
 * Wie die Stelle in der Arbeitsliste heißt.
 *
 * ⚠️ Anker und Beschriftung sind ABSICHTLICH zweierlei. Der Anker muss eine
 * große, stabile Einheit sein, sonst rutscht die Marke beim nächsten
 * Textumbruch weg — die Beschriftung darf dafür so genau sein wie möglich.
 * Nimmt man beides aus der Sektion, heißen drei Anmerkungen an drei Stellen
 * einer Seite alle gleich, und die Liste nach dem Termin ist nur noch über
 * den Fließtext lesbar. Gemessen am 18.09.2026: zwei Punkte, 300 px
 * auseinander, beide mit derselben Sektionsüberschrift.
 */
export function stellenLabel(
  getroffen: Element | null,
  sektion: Element | null,
  datensparsam = false,
): string {
  const grob = ankerLabel(sektion, datensparsam);
  if (!getroffen || getroffen === sektion) return grob;

  // Datensparsam kein Text, kein `alt`, kein `aria-label` des getroffenen
  // Elements: Nur die Art des Elements sagt, wo geklickt wurde.
  if (datensparsam) {
    const tag = getroffen.tagName.toLowerCase();
    return tag === "div" || tag === "span" ? grob : kuerze(`${grob} → <${tag}>`, 120);
  }

  // ⚠️ `textContent` NUR bei einem Element ohne Element-Kinder. Bei einem
  // Container klebt es alle Kindtexte ohne Trennzeichen aneinander und
  // liefert Zeichenfolgen wie „LeistungenIhre Pflege in guten HändenKlassische
  // und apparative…" — schlechter als gar keine Beschriftung, weil sie
  // aussieht, als stünde sie so auf der Seite. Wer einen Container trifft,
  // hat in einen Zwischenraum geklickt; dann ist die Sektion die ehrliche
  // Antwort.
  const eigenerText = getroffen.children.length === 0 ? (getroffen.textContent ?? "").trim() : "";
  const eigen =
    getroffen.getAttribute("aria-label")?.trim() || getroffen.getAttribute("alt")?.trim() || eigenerText;

  if (!eigen) {
    // Ein Bild oder eine leere Fläche hat keinen Text — dann sagt
    // wenigstens die Art des Elements, was gemeint war.
    const tag = getroffen.tagName.toLowerCase();
    return tag === "div" || tag === "span" ? grob : `${grob} → <${tag}>`;
  }

  const fein = kuerze(eigen, 60);
  return fein === grob ? grob : kuerze(`${grob} → ${fein}`, 120);
}

// ─────────────────────────────────────────────────────────────────────────────
// Umrechnung
// ─────────────────────────────────────────────────────────────────────────────

/** Das Element unter einem Viewport-Punkt — das Overlay selbst übersprungen. */
export function elementUnter(x: number, y: number): Element | null {
  // elementsFromPoint statt elementFromPoint: Das Overlay liegt über allem,
  // und `pointer-events: none` allein hilft nicht, weil die Pins selbst
  // wieder Ereignisse annehmen müssen.
  const treffer = document.elementsFromPoint(x, y);
  return treffer.find((el) => !el.closest(`[${OVERLAY_ATTR}]`)) ?? null;
}

/** Viewport-Punkt → Anteil innerhalb der Ankerbox. */
export function zuAnkerAnteil(x: number, y: number, box: DOMRect): Punkt {
  return {
    x: box.width > 0 ? (x - box.left) / box.width : 0,
    y: box.height > 0 ? (y - box.top) / box.height : 0,
  };
}

/** Anteil innerhalb der Ankerbox → Viewport-Punkt. */
export function ausAnkerAnteil(p: Punkt, box: DOMRect): Punkt {
  return { x: box.left + p.x * box.width, y: box.top + p.y * box.height };
}

/** Viewport-Punkt → Anteil des GESAMTEN Dokuments (der Notnagel). */
export function zuDokumentAnteil(x: number, y: number): Punkt {
  const d = document.documentElement;
  const breite = Math.max(d.scrollWidth, 1);
  const hoehe = Math.max(d.scrollHeight, 1);
  return { x: (x + window.scrollX) / breite, y: (y + window.scrollY) / hoehe };
}

/** Anteil des Dokuments → Viewport-Punkt. */
export function ausDokumentAnteil(p: Punkt): Punkt {
  const d = document.documentElement;
  return {
    x: p.x * d.scrollWidth - window.scrollX,
    y: p.y * d.scrollHeight - window.scrollY,
  };
}

/**
 * Wo eine gespeicherte Anmerkung JETZT liegt, in Viewport-Koordinaten.
 *
 * Gibt zusätzlich zurück, ob der Anker gefunden wurde: Die Oberfläche
 * kennzeichnet eine Marke, die nur noch ungefähr sitzt, statt sie stillschweigend
 * falsch zu zeigen. Eine Marke, die still an die falsche Stelle rutscht, ist
 * schlimmer als eine, die sagt „ich bin mir nicht mehr sicher".
 *
 * `null` heißt: kein Anker UND kein Notnagel — eine GrowCore-Anmerkung, deren
 * Element auf dieser Fassung der Seite fehlt. Sie erscheint dann nur in der
 * Liste, mit „Stelle nicht gefunden".
 */
export function aktuellePunkte(notiz: {
  anchor_selector: string;
  points: Punkt[];
  fallback: Punkt[];
}): { punkte: Punkt[]; verankert: boolean } | null {
  const anker = findeAnker(notiz.anchor_selector);

  if (anker) {
    const box = anker.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      return { punkte: notiz.points.map((p) => ausAnkerAnteil(p, box)), verankert: true };
    }
  }
  if (notiz.fallback.length === 0) return null;
  return { punkte: notiz.fallback.map(ausDokumentAnteil), verankert: false };
}

/** `querySelector`, der an einem ungültigen Selektor nicht wirft. */
export function findeAnker(selektor: string): Element | null {
  try {
    return document.querySelector(selektor);
  } catch {
    // Ein Selektor aus einer anderen Fassung der Seite kann heute
    // syntaktisch ungültig sein. Kein Grund, die Marke zu verlieren.
    return null;
  }
}

/** Glättet einen Freihandzug: weniger Punkte, gleiche Linie. */
export function ausduennen(punkte: Punkt[], mindestabstand = 3): Punkt[] {
  if (punkte.length <= 2) return punkte;
  const raus: Punkt[] = [punkte[0]];
  for (const p of punkte.slice(1, -1)) {
    const letzter = raus[raus.length - 1];
    if (Math.hypot(p.x - letzter.x, p.y - letzter.y) >= mindestabstand) raus.push(p);
  }
  raus.push(punkte[punkte.length - 1]);
  return raus;
}

/** Ein Freihandzug als SVG-Pfad, quadratisch geglättet. */
export function alsPfad(punkte: Punkt[]): string {
  if (punkte.length === 0) return "";
  if (punkte.length === 1) return `M ${punkte[0].x} ${punkte[0].y}`;
  let d = `M ${punkte[0].x} ${punkte[0].y}`;
  for (let i = 1; i < punkte.length - 1; i += 1) {
    const a = punkte[i];
    const b = punkte[i + 1];
    d += ` Q ${a.x} ${a.y} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`;
  }
  const letzter = punkte[punkte.length - 1];
  d += ` L ${letzter.x} ${letzter.y}`;
  return d;
}
