/**
 * Ein Klickziel aus dem Katalog auf der aktuellen Seite finden.
 *
 * Selektoren zuerst, dann Text. Gezählt wird nur, was SICHTBAR ist: Ein
 * ausgeblendetes Menü steht im DOM, und ein Rahmen darum zeigt ins Leere.
 * Nie gefunden wird etwas in der KI-Hilfe selbst oder im Overlay.
 */
import type { ZielKatalog } from "../core/ziele.ts";

export const KI_UI_ATTR = "data-ki-ui";

function sichtbar(el: Element): boolean {
  const box = el.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return false;
  const stil = getComputedStyle(el);
  return stil.visibility !== "hidden" && stil.display !== "none";
}

function eigen(el: Element): boolean {
  return Boolean(el.closest(`[${KI_UI_ATTR}],[data-review-ui]`));
}

function text(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function findeZiel(ziele: ZielKatalog, id: string): { el: Element; vorstufe: boolean } | null {
  const ziel = ziele[id];
  if (!ziel) return null;

  for (const s of ziel.selektoren ?? []) {
    let treffer: NodeListOf<Element>;
    try {
      treffer = document.querySelectorAll(s.css);
    } catch {
      continue;
    }
    for (const el of treffer) {
      if (!eigen(el) && sichtbar(el)) return { el, vorstufe: Boolean(s.vorstufe) };
    }
  }

  if (ziel.text) {
    for (const el of document.querySelectorAll("a, button, [role=tab], [role=menuitem]")) {
      if (!eigen(el) && sichtbar(el) && text(el).startsWith(ziel.text)) return { el, vorstufe: false };
    }
  }
  return null;
}
