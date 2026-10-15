/**
 * Die Stellen der Seite, die der KI-Assistent einkreisen darf (0.12.0).
 *
 * Mit jeder Frage geht eine kurze Liste an die Sammelstelle: Kennung, Art,
 * Beschriftung — nie Markup, nie Selektoren. Die KI wählt eine Kennung, der
 * Browser kennt das Element dazu. Wie bei den Zielmarken gilt: Die KI rät nicht
 * über das Markup, sie zeigt auf etwas, das wir ihr gezeigt haben.
 *
 * Datensparsam (Seiten mit Personendaten) zählen nur Elemente mit
 * `data-review-anker`, und nur dessen Wert geht hinaus — kein Seitentext.
 */
import type { Stelle } from "../core/assistent.ts";
import {
  OVERLAY_ATTR,
  ankerLabel,
  istSeitenweit,
  kuerze,
  selektorPfad,
  zuAnkerAnteil,
  zuDokumentAnteil,
} from "../core/anker.ts";
import type { Punkt } from "../core/konstanten.ts";
import { KI_UI_ATTR } from "./ziel-finden.ts";

const KANDIDATEN = [
  "[data-review-anker]",
  "header",
  "nav",
  "main section",
  "section",
  "article",
  "aside",
  "footer",
  "form",
  "figure",
  "table",
  "h1",
  "h2",
  "h3",
  "h4",
  "img",
  "button",
  "a[href]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=button]",
  "[data-slot=card]",
].join(",");

/** Höchstens so viele Stellen je Frage, Links und Knöpfe extra begrenzt. */
const MAX = 120;
const MAX_LINKS = 40;

function art(el: Element): string {
  if (el.hasAttribute("data-review-anker")) return "Bereich";
  switch (el.tagName) {
    case "HEADER":
      return "Kopfbereich";
    case "NAV":
      return "Navigation";
    case "FOOTER":
      return "Fußbereich";
    case "SECTION":
    case "ARTICLE":
    case "ASIDE":
      return "Abschnitt";
    case "FORM":
      return "Formular";
    case "FIGURE":
    case "IMG":
      return "Bild";
    case "TABLE":
      return "Tabelle";
    case "H1":
    case "H2":
    case "H3":
    case "H4":
      return "Überschrift";
    case "A":
      return "Link";
    case "BUTTON":
      return "Knopf";
    case "INPUT":
    case "SELECT":
    case "TEXTAREA":
      return "Eingabefeld";
    default:
      return el.getAttribute("role") === "button" ? "Knopf" : "Bereich";
  }
}

function eigeneBeschriftung(el: Element): string {
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  if (el.tagName === "IMG") return el.getAttribute("alt")?.trim() || "Bild ohne Beschreibung";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const label = el.labels?.[0]?.textContent?.trim();
    return label || el.getAttribute("placeholder")?.trim() || el.name || "Eingabefeld";
  }
  if (/^(H[1-4]|A|BUTTON)$/.test(el.tagName) || el.getAttribute("role") === "button") {
    return (el.textContent ?? "").trim();
  }
  // Container: der Name der Einheit (data-review-anker, aria-label, erste Überschrift).
  return ankerLabel(el);
}

function sichtbar(el: Element): boolean {
  const box = el.getBoundingClientRect();
  if (box.width < 4 || box.height < 4) return false;
  const stil = getComputedStyle(el);
  return stil.visibility !== "hidden" && stil.display !== "none" && stil.opacity !== "0";
}

export function sammleStellen(datensparsam = false): { liste: Stelle[]; elemente: Map<string, Element> } {
  const liste: Stelle[] = [];
  const elemente = new Map<string, Element>();
  const gesehen = new Set<string>();
  let links = 0;

  const auswahl = datensparsam ? "[data-review-anker]" : KANDIDATEN;
  for (const el of document.querySelectorAll(auswahl)) {
    if (liste.length >= MAX) break;
    if (el.closest(`[${OVERLAY_ATTR}],[${KI_UI_ATTR}]`)) continue;
    if (!sichtbar(el)) continue;
    const a = art(el);
    if (a === "Link" || a === "Knopf") {
      if (links >= MAX_LINKS) continue;
      links += 1;
    }
    const label = kuerze(
      datensparsam ? (el.getAttribute("data-review-anker") ?? "") : eigeneBeschriftung(el),
      80,
    );
    if (!label) continue;
    // Derselbe Text zweimal (Link im Kopf und im Fuß) sagt der KI nichts Neues.
    const schluessel = `${a}|${label}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const id = `s${liste.length + 1}`;
    liste.push({ id, art: a, label });
    elemente.set(id, el);
  }
  return { liste, elemente };
}

/** Ellipse mit 12 px Luft um die Box, beginnend oben in der Mitte (dort sitzt der Zettel). */
function ellipse(box: DOMRect): Punkt[] {
  const luft = 12;
  const mx = box.left + box.width / 2;
  const my = box.top + box.height / 2;
  const rx = box.width / 2 + luft;
  const ry = box.height / 2 + luft;
  const punkte: Punkt[] = [];
  for (let i = 0; i <= 48; i++) {
    const w = (i / 48) * Math.PI * 2 - Math.PI / 2;
    punkte.push({ x: mx + rx * Math.cos(w), y: my + ry * Math.sin(w) });
  }
  return punkte;
}

/**
 * Abgerundetes Rechteck 8 px INNERHALB der Box. Für Bereiche über die volle
 * Breite: Eine Ellipse darum liefe links und rechts aus dem Bild (gemessen
 * 2026-10-15, Abschnitt „Was wir tun“, straffaelligenhilfe).
 */
function rechteck(box: DOMRect): Punkt[] {
  const innen = 8;
  const l = box.left + innen;
  const r = box.right - innen;
  const o = box.top + innen;
  const u = box.bottom - innen;
  const rad = Math.min(24, (r - l) / 4, (u - o) / 4);
  const ecke = (cx: number, cy: number, von: number): Punkt[] =>
    Array.from({ length: 7 }, (_, i) => {
      const w = von + (i / 6) * (Math.PI / 2);
      return { x: cx + rad * Math.cos(w), y: cy + rad * Math.sin(w) };
    });
  const mitte = { x: (l + r) / 2, y: o };
  return [
    mitte,
    ...ecke(r - rad, o + rad, -Math.PI / 2),
    ...ecke(r - rad, u - rad, 0),
    ...ecke(l + rad, u - rad, Math.PI / 2),
    ...ecke(l + rad, o + rad, Math.PI),
    mitte,
  ];
}

/** Die Markierung um ein Element: wie von Hand eingekreist, nur ordentlicher. */
export function markierungFuer(
  el: Element,
  datensparsam = false,
): {
  anchor_selector: string;
  anchor_label: string;
  points: Punkt[];
  fallback: Punkt[];
  viewport_width: number;
  /** Im seitenweiten Kopf- oder Fußbereich: gilt auf allen Seiten (0.14.0). */
  global: boolean;
} {
  const box = el.getBoundingClientRect();
  const gross = box.width > window.innerWidth * 0.7 || box.height > window.innerHeight * 0.7;
  const viewport = gross && box.width > 40 && box.height > 40 ? rechteck(box) : ellipse(box);
  return {
    anchor_selector: selektorPfad(el) || "body",
    anchor_label: kuerze(datensparsam ? ankerLabel(el, true) : eigeneBeschriftung(el) || ankerLabel(el), 120),
    // Die Grenzen des Schemas (-2..3) halten auch kleine Elemente aus: 12 px Luft
    // bei einem 8 px hohen Element sind 2 Boxhöhen.
    points: viewport.map((p) => {
      const a = zuAnkerAnteil(p.x, p.y, box);
      return { x: Math.min(3, Math.max(-2, a.x)), y: Math.min(3, Math.max(-2, a.y)) };
    }),
    fallback: viewport.map((p) => zuDokumentAnteil(p.x, p.y)),
    viewport_width: Math.max(200, Math.min(8000, Math.round(window.innerWidth))),
    global: istSeitenweit(el),
  };
}
