"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import type { Schritt } from "../core/ki-antwort.ts";
import type { Ziel, ZielKatalog } from "../core/ziele.ts";
import { useLocalStorageState } from "./hooks.ts";
import { findeZiel, KI_UI_ATTR } from "./ziel-finden.ts";

/**
 * Die Führung: markiert, was als Nächstes anzuklicken ist, und rückt weiter,
 * sobald es angeklickt wurde.
 *
 * Gestartet aus einer Antwort der KI-Hilfe („Schritt für Schritt zeigen"
 * oder „Zeigen" an einem Schritt). Die KI entscheidet nur, WELCHES Ziel, nie
 * WO es liegt — das steht im Katalog des Projekts.
 *
 * ─── Weiter beim Klick, nicht beim Knopf ────────────────────────────────────
 *
 * Ein Klick auf das markierte Element rückt die Führung weiter, ohne dass er
 * abgefangen wird: Er tut, was er ohnehin tut (Seite wechseln, Reiter öffnen,
 * Dialog aufmachen), und die Führung folgt. Der Knopf „Weiter“ bleibt für
 * Schritte ohne Ziel und für den Fall, dass jemand den Weg anders gegangen ist.
 * Ein Klick auf eine VORSTUFE (Menüknopf auf dem Handy) rückt nicht weiter —
 * der eigentliche Link kommt erst danach.
 *
 * ─── Warum der Stand im localStorage liegt ──────────────────────────────────
 *
 * Aus demselben Grund wie beim Rundgang: Jede Seite rendert ihren Rahmen
 * selbst, ein Seitenwechsel baut die Führung neu auf. Ein Schritt, der die
 * Seite wechselt, ginge mit einem `useState` verloren.
 */

const EBENE = 2147482200;
const STAND = "gcf-ki-fuehrung";
export const FUEHRUNG_EREIGNIS = "gcf:ki-fuehrung";

interface Stand {
  schritte: Array<Pick<Schritt, "text" | "ziel">>;
  index: number;
}

/**
 * Die Unterkante des freien Bereichs. Liegt das offene KI-Fenster quer über
 * dem unteren Bildschirm (Handy), zählt nur, was darüber frei ist — sonst
 * markierte die Führung eine Stelle hinter dem Fenster.
 */
function freiBis(): number {
  const fenster = document.getElementById("gcf-ki-fenster");
  const box = fenster?.getBoundingClientRect();
  if (box && box.width > window.innerWidth * 0.6) return Math.max(120, box.top - 8);
  return window.innerHeight;
}

export function starteFuehrung(schritte: Schritt[], ab = 0) {
  window.dispatchEvent(
    new CustomEvent<Stand>(FUEHRUNG_EREIGNIS, {
      detail: { schritte: schritte.map((s) => ({ text: s.text, ziel: s.ziel })), index: ab },
    }),
  );
}

export function Fuehrung({
  ziele,
  onZurKiHilfe,
  onLaeuft,
}: {
  ziele: ZielKatalog;
  onZurKiHilfe: () => void;
  /** Meldet, ob gerade geführt wird — das KI-Fenster schrumpft dann auf dem Handy. */
  onLaeuft?: (laeuft: boolean) => void;
}) {
  const pfad = usePathname();
  const [stand, setStand] = useLocalStorageState<Stand | null>(STAND, null);
  const [gefunden, setGefunden] = useState<"ja" | "vorstufe" | "nein">("nein");

  const rahmenRef = useRef<HTMLDivElement>(null);
  const karteRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<{ el: Element; vorstufe: boolean } | null>(null);
  const standRef = useRef(stand);

  useEffect(() => {
    standRef.current = stand;
  }, [stand]);

  useEffect(() => {
    const start = (e: Event) => setStand((e as CustomEvent<Stand>).detail);
    window.addEventListener(FUEHRUNG_EREIGNIS, start);
    return () => window.removeEventListener(FUEHRUNG_EREIGNIS, start);
  }, [setStand]);

  useEffect(() => {
    onLaeuft?.(Boolean(stand));
  }, [stand, onLaeuft]);

  const schritt = stand ? (stand.schritte[stand.index] ?? null) : null;
  const ziel: Ziel | null = schritt?.ziel ? (ziele[schritt.ziel] ?? null) : null;

  // Suchen alle 250 ms, Positionieren jedes Bild — ein Text-Scan über alle
  // Knöpfe je Bild wäre die teure Stelle.
  useEffect(() => {
    if (!schritt) return;
    elementRef.current = null;
    let zuletzt: Element | null = null;
    const suchen = () => {
      const treffer = schritt.ziel ? findeZiel(ziele, schritt.ziel) : null;
      elementRef.current = treffer;
      setGefunden(treffer ? (treffer.vorstufe ? "vorstufe" : "ja") : "nein");
      if (treffer && treffer.el !== zuletzt) {
        zuletzt = treffer.el;
        const frei = freiBis();
        if (frei < window.innerHeight) {
          // In die Mitte des FREIEN Bereichs, nicht des Bildschirms.
          const r = treffer.el.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + r.top - Math.max(12, (frei - r.height) / 2), behavior: "smooth" });
        } else {
          treffer.el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    };
    // Erster Lauf nicht synchron im Effekt (react-hooks/set-state-in-effect).
    // 60 ms: Das KI-Fenster schrumpft erst im nächsten Render, `freiBis` soll
    // schon die neue Höhe sehen.
    const erst = window.setTimeout(suchen, 60);
    const takt = window.setInterval(suchen, 250);

    let bild = 0;
    const setzen = () => {
      const rahmen = rahmenRef.current;
      const karte = karteRef.current;
      const box = elementRef.current?.el.getBoundingClientRect();
      if (rahmen && karte) {
        const k = karte.getBoundingClientRect();
        const unten = freiBis();
        if (box && box.width > 0) {
          const rand = 5;
          rahmen.style.display = "block";
          rahmen.style.transform = `translate3d(${Math.round(box.left - rand)}px, ${Math.round(box.top - rand)}px, 0)`;
          rahmen.style.width = `${Math.round(box.width + rand * 2)}px`;
          rahmen.style.height = `${Math.round(box.height + rand * 2)}px`;
          const x = Math.min(Math.max(box.left, 12), Math.max(12, window.innerWidth - k.width - 12));
          let y = box.bottom + 16;
          if (y + k.height > unten - 12) y = box.top - k.height - 16;
          if (y < 12) y = Math.max(12, unten - k.height - 12);
          karte.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
        } else {
          rahmen.style.display = "none";
          karte.style.transform = `translate3d(16px, ${Math.round(unten - k.height - 16)}px, 0)`;
        }
      }
      bild = requestAnimationFrame(setzen);
    };
    bild = requestAnimationFrame(setzen);

    return () => {
      window.clearTimeout(erst);
      window.clearInterval(takt);
      cancelAnimationFrame(bild);
    };
    // `pfad` gehört dazu: Nach einem Seitenwechsel steht dasselbe Ziel woanders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schritt, pfad]);

  // Der Klick auf das markierte Element rückt weiter — in der Capture-Phase,
  // damit ein Element, das sich beim Klick selbst entfernt, noch zählt.
  useEffect(() => {
    if (!schritt) return;
    const beiKlick = (e: MouseEvent) => {
      const treffer = elementRef.current;
      const s = standRef.current;
      if (!treffer || treffer.vorstufe || !s) return;
      if (!(e.target instanceof Node) || !treffer.el.contains(e.target)) return;
      const naechster = s.index + 1;
      setStand(naechster < s.schritte.length ? { ...s, index: naechster } : null);
    };
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStand(null);
    };
    document.addEventListener("click", beiKlick, true);
    window.addEventListener("keydown", beiTaste);
    return () => {
      document.removeEventListener("click", beiKlick, true);
      window.removeEventListener("keydown", beiTaste);
    };
  }, [schritt, setStand]);

  if (!stand || !schritt) return null;
  const letzter = stand.index === stand.schritte.length - 1;

  return (
    <>
      <div
        ref={rahmenRef}
        aria-hidden
        className="gcf-rahmen"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          display: "none",
          zIndex: EBENE,
          pointerEvents: "none",
          borderRadius: 10,
        }}
      />
      <div
        ref={karteRef}
        {...{ [KI_UI_ATTR]: "" }}
        role="status"
        aria-live="polite"
        className="gcf-karte"
        // Über dem KI-Fenster (2147482500), das jetzt offen bleibt.
        style={{ zIndex: EBENE + 400 }}
      >
        <p className="gcf-eyebrow">
          KI-Hilfe · Schritt {stand.index + 1} von {stand.schritte.length}
        </p>
        <p className="gcf-karte-text">{schritt.text}</p>
        <p className="gcf-klein">
          {gefunden === "ja"
            ? "Klicken Sie auf die markierte Stelle."
            : gefunden === "vorstufe"
              ? "Öffnen Sie zuerst das Menü (markiert)."
              : ziel
                ? `Gesucht: ${ziel.name} — auf dieser Seite nicht zu sehen.`
                : "Dafür gibt es keine feste Stelle zum Markieren."}
        </p>
        <div className="gcf-karte-leiste">
          <button type="button" onClick={() => setStand(null)} className="gcf-leise-knopf">
            Beenden
          </button>
          <button
            type="button"
            onClick={() => {
              setStand(null);
              onZurKiHilfe();
            }}
            className="gcf-leise-knopf"
          >
            Zur KI-Hilfe
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            disabled={stand.index === 0}
            onClick={() => setStand({ ...stand, index: stand.index - 1 })}
            className="gcf-knopf"
          >
            Zurück
          </button>
          <button
            type="button"
            onClick={() => setStand(letzter ? null : { ...stand, index: stand.index + 1 })}
            className="gcf-knopf gcf-primaer"
          >
            {letzter ? "Fertig" : "Weiter"}
          </button>
        </div>
      </div>
    </>
  );
}
