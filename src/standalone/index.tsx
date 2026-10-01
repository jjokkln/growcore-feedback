import { createRoot } from "react-dom/client";

import { AnmerkungsOverlay, type OverlayModus } from "../react/overlay.tsx";
// Als Text eingebunden (esbuild `--loader:.css=text`), damit die Seite nur ein Skript braucht.
import stil from "../styles/feedback.css";

/**
 * Die eigenständige Fassung (0.8.0) für Seiten ohne Next und ohne React:
 *
 *   <script src="/feedback/gcf.js" data-projekt="Arbeitsschutz-Doc" defer></script>
 *
 * Optional `data-datensparsam` (Stellenbeschriftung nur aus `data-review-anker`),
 * `data-hinweis="…"` (Zeile unter dem Kommentarfeld). Ohne `?` in der Navigation
 * erscheint der Stift unten links. Sichtbar wird alles erst, wenn die Route der
 * Seite (`/api/feedback/status`) `{ an: true }` sagt — derselbe Schalter wie überall.
 *
 * React steckt im Skript; die Seite muss nichts installieren.
 */

declare global {
  interface Window {
    GrowcoreFeedback?: { mount: (optionen: { projekt: string; modus?: OverlayModus }) => void };
  }
}

let eingebaut = false;

function mount({ projekt, modus }: { projekt: string; modus?: OverlayModus }) {
  if (eingebaut) return;
  eingebaut = true;
  if (!document.querySelector("style[data-gcf]")) {
    const style = document.createElement("style");
    style.dataset.gcf = "";
    style.textContent = stil;
    document.head.appendChild(style);
  }
  const wurzel = document.createElement("div");
  wurzel.dataset.gcfWurzel = "";
  document.body.appendChild(wurzel);
  createRoot(wurzel).render(<AnmerkungsOverlay projekt={projekt} modus={modus} />);
}

window.GrowcoreFeedback = { mount };

// Selbststart über die Attribute des eigenen Skript-Tags.
const tag = document.currentScript as HTMLScriptElement | null;
if (tag?.dataset.projekt) {
  const optionen = {
    projekt: tag.dataset.projekt,
    modus: {
      datensparsam: "datensparsam" in tag.dataset,
      hinweis: tag.dataset.hinweis || undefined,
    },
  };
  if (document.body) mount(optionen);
  else document.addEventListener("DOMContentLoaded", () => mount(optionen), { once: true });
}
