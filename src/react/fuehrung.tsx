"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import type { Schritt } from "../core/ki-antwort.ts";
import type { Ziel, ZielKatalog } from "../core/ziele.ts";
import { useLocalStorageState } from "./hooks.ts";
import { findeZiel, KI_UI_ATTR } from "./ziel-finden.ts";
import { pfeilVersatz, ziehenStarten, type Versatz } from "./ziehen.ts";

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
 * ─── Zeiger statt Rahmen (0.18.0, Lenny 2026-11-24) ─────────────────────────
 *
 * Kein Rahmen und keine Karte mehr an der Stelle. Ein leuchtender Mauszeiger
 * gleitet aus dem KI-Fenster zur Stelle, „klickt“ dort (nur Animation, kein
 * echter Klick) und wiederholt das, bis wirklich geklickt oder abgebrochen
 * wird. Schritttext und Knöpfe stehen in einer schmalen Leiste unten mittig,
 * unabhängig vom KI-Fenster und am Griff verschiebbar.
 * Bei „weniger Bewegung“ steht der Zeiger still auf der Stelle.
 *
 * ─── Warum der Stand im localStorage liegt ──────────────────────────────────
 *
 * Aus demselben Grund wie beim Rundgang: Jede Seite rendert ihren Rahmen
 * selbst, ein Seitenwechsel baut die Führung neu auf. Ein Schritt, der die
 * Seite wechselt, ginge mit einem `useState` verloren.
 */

const EBENE = 2147483300;
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

/**
 * Holt die Stelle ins Bild, ohne die Seite zu verschieben (0.18.0). `scrollIntoView`
 * scrollt auch Rahmen mit `overflow: hidden` (Boltwork: `h-dvh overflow-hidden` um
 * die ganze App) — danach war oben ein Stück abgeschnitten und nicht mehr
 * erreichbar. Hier nur, wenn die Stelle nicht schon sichtbar ist, und nur am
 * nächsten Vorfahren, der wirklich scrollt (auto/scroll), sonst am Fenster.
 */
function sichtbarMachen(el: Element, frei: number) {
  const r = el.getBoundingClientRect();
  if (r.top >= 12 && r.bottom <= frei - 12) return;
  const delta = r.top - Math.max(12, (frei - r.height) / 2);
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) {
      p.scrollBy({ top: delta, behavior });
      return;
    }
  }
  window.scrollBy({ top: delta, behavior });
}

export function starteFuehrung(schritte: Schritt[], ab = 0) {
  window.dispatchEvent(
    new CustomEvent<Stand>(FUEHRUNG_EREIGNIS, {
      detail: { schritte: schritte.map((s) => ({ text: s.text, ziel: s.ziel })), index: ab },
    }),
  );
}

/** Zeiger in ms: einmal hingleiten, dann klicken und kurz stehen, im Wechsel bis zum echten Klick. */
const GLEITEN = 900;
const KLICK = 650;
const STEHEN = 750;
const TAKT = KLICK + STEHEN;

function sanft(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function Fuehrung({
  ziele,
  onLaeuft,
  anrede = "Sie",
}: {
  ziele: ZielKatalog;
  /** „du“ oder „Sie“ (Standard) für die Hinweise auf der Karte (0.10.0). */
  anrede?: "du" | "Sie";
  /** Seit 0.18.0 ohne Wirkung: Das KI-Fenster bleibt während der Führung offen. */
  onZurKiHilfe?: () => void;
  /** Meldet, ob gerade geführt wird — das KI-Fenster schrumpft dann auf dem Handy. */
  onLaeuft?: (laeuft: boolean) => void;
}) {
  const pfad = usePathname();
  const [stand, setStand] = useLocalStorageState<Stand | null>(STAND, null);
  const [gefunden, setGefunden] = useState<"ja" | "vorstufe" | "nein">("nein");

  const zeigerRef = useRef<HTMLDivElement>(null);
  const welleRef = useRef<HTMLDivElement>(null);
  const karteRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<{ el: Element; vorstufe: boolean } | null>(null);
  const standRef = useRef(stand);
  /** Selbst verschobene Lage der Schrittleiste; `null` = unten mittig. Gilt für die ganze Führung. */
  const ortRef = useRef<Versatz | null>(null);

  const verschieben = (basis: Versatz, d: Versatz) => {
    const k = karteRef.current?.getBoundingClientRect();
    const b = k?.width ?? 300;
    const h = k?.height ?? 50;
    ortRef.current = {
      x: Math.min(Math.max(8, basis.x + d.x), window.innerWidth - b - 8),
      y: Math.min(Math.max(8, basis.y + d.y), window.innerHeight - h - 8),
    };
  };
  const jetzigeLage = (): Versatz => {
    const k = karteRef.current?.getBoundingClientRect();
    return { x: k?.left ?? 0, y: k?.top ?? 0 };
  };

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
        sichtbarMachen(treffer.el, freiBis());
      }
    };
    // Erster Lauf nicht synchron im Effekt (react-hooks/set-state-in-effect).
    // 60 ms: Das KI-Fenster schrumpft erst im nächsten Render, `freiBis` soll
    // schon die neue Höhe sehen.
    const erst = window.setTimeout(suchen, 60);
    const takt = window.setInterval(suchen, 250);

    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Ein Durchgang beginnt neu, sobald das Ziel ein anderes Element ist.
    let durchgang: { el: Element | null; t0: number } = { el: null, t0: 0 };

    let bild = 0;
    const setzen = (jetzt: number) => {
      const zeiger = zeigerRef.current;
      const welle = welleRef.current;
      const karte = karteRef.current;
      if (zeiger && welle && karte) {
        // Leiste: unten mittig im Browserfenster, unabhängig vom KI-Fenster. Nur wenn
        // das KI-Fenster quer über dem Bildschirm liegt (Handy), sitzt sie darüber.
        // Selbst verschoben bleibt sie, wo sie hingezogen wurde.
        const k = karte.getBoundingClientRect();
        const fenster = document.getElementById("gcf-ki-fenster")?.getBoundingClientRect();
        const quer = fenster ? fenster.width > window.innerWidth * 0.6 : false;
        const treffer = elementRef.current;
        const box = treffer?.el.getBoundingClientRect();
        let kx: number;
        let ky: number;
        if (ortRef.current) {
          kx = Math.min(ortRef.current.x, window.innerWidth - k.width - 8);
          ky = Math.min(ortRef.current.y, window.innerHeight - k.height - 8);
        } else {
          kx = (window.innerWidth - k.width) / 2;
          ky = (quer && fenster ? fenster.top - 10 : window.innerHeight - 20) - k.height;
          // Deckt die Leiste die Stelle zu, geht sie nach oben.
          if (box && box.width > 0 && box.left < kx + k.width && box.right > kx && box.top < ky + k.height && box.bottom > ky) {
            ky = 16;
          }
        }
        kx = Math.max(8, kx);
        ky = Math.max(8, ky);
        karte.style.transform = `translate3d(${Math.round(kx)}px, ${Math.round(ky)}px, 0)`;
        // Der Zeiger startet am KI-Fenster, eingeklappt am Knopf „KI-Assistent“, sonst an der Leiste.
        const knopf = fenster ? null : document.querySelector(".gcf-ki-knopf")?.getBoundingClientRect();
        const start = fenster
          ? { x: fenster.left + 28, y: fenster.top + 28 }
          : knopf && knopf.width > 0
            ? { x: knopf.left + 20, y: knopf.top + knopf.height / 2 }
            : { x: kx + 24, y: ky + 12 };

        if (treffer && box && box.width > 0) {
          if (durchgang.el !== treffer.el) durchgang = { el: treffer.el, t0: jetzt };
          // Spitze des Zeigers auf die Mitte der Stelle.
          const zx = box.left + Math.min(box.width / 2, 40);
          const zy = box.top + box.height / 2;
          const sx = start.x;
          const sy = start.y;
          const t = ruhig ? GLEITEN + KLICK : jetzt - durchgang.t0;
          const g = sanft(Math.min(1, t / GLEITEN));
          const x = sx + (zx - sx) * g;
          const y = sy + (zy - sy) * g;
          // Nach dem Hingleiten nur noch der Klick, immer wieder.
          const c = t < GLEITEN ? -1 : (t - GLEITEN) % TAKT;
          let druck = 1;
          let wellen = 0;
          let deckung = 1;
          if (!ruhig) {
            if (c >= 0 && c < 120) druck = 1 - 0.2 * (c / 120);
            else if (c >= 120 && c < 280) druck = 0.8 + 0.2 * ((c - 120) / 160);
            if (c >= 90 && c < KLICK) wellen = (c - 90) / (KLICK - 90);
            if (t < 150) deckung = t / 150;
          }
          zeiger.style.display = "block";
          zeiger.style.opacity = String(deckung);
          zeiger.style.transform = `translate3d(${Math.round(x - 3)}px, ${Math.round(y - 2)}px, 0) scale(${druck.toFixed(3)})`;
          if (wellen > 0) {
            welle.style.display = "block";
            welle.style.opacity = String((0.85 * (1 - wellen)).toFixed(3));
            welle.style.transform = `translate3d(${Math.round(zx - 22)}px, ${Math.round(zy - 22)}px, 0) scale(${(0.35 + 1.4 * wellen).toFixed(3)})`;
          } else {
            welle.style.display = "none";
          }
        } else {
          durchgang = { el: null, t0: 0 };
          zeiger.style.display = "none";
          welle.style.display = "none";
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

  // Neuer Schritt: Leiste leuchtet kurz auf, die Schrittzahl springt (0.18.0).
  // Ohne das übersahen manche, dass sich der Text geändert hat.
  const index = stand?.index ?? -1;
  useEffect(() => {
    const karte = karteRef.current;
    if (!karte || index < 0) return;
    karte.classList.remove("gcf-karte-neu");
    void karte.offsetWidth;
    karte.classList.add("gcf-karte-neu");
  }, [index]);

  if (!stand || !schritt) return null;
  const letzter = stand.index === stand.schritte.length - 1;

  return (
    <>
      <div ref={welleRef} aria-hidden className="gcf-zeiger-welle" style={{ zIndex: EBENE + 500 }} />
      <div ref={zeigerRef} aria-hidden className="gcf-zeiger" style={{ zIndex: EBENE + 500 }}>
        <svg width="26" height="30" viewBox="0 0 26 30" fill="none">
          <path
            d="M3 2.5 L3 24 L8.6 18.6 L12.4 27.2 L16.4 25.4 L12.7 17 L20.6 17 Z"
            fill="#ffffff"
            stroke="var(--gcf-primaer)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div
        ref={karteRef}
        {...{ [KI_UI_ATTR]: "" }}
        role="status"
        aria-live="polite"
        className="gcf-karte gcf-karte-unten"
        // Über dem KI-Fenster (2147483600).
        style={{ zIndex: EBENE + 400 }}
      >
        <button
          type="button"
          className="gcf-karte-griff"
          aria-label="Schrittleiste verschieben (Pfeiltasten)"
          title="Verschieben"
          onPointerDown={(e) => {
            const basis = jetzigeLage();
            ziehenStarten(e, { beiZug: (d) => verschieben(basis, d) });
          }}
          onKeyDown={(e) => {
            const d = pfeilVersatz(e);
            if (!d) return;
            e.preventDefault();
            verschieben(jetzigeLage(), d);
          }}
        >
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
            {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />))}
          </svg>
        </button>
        <span className="gcf-schritt-zahl" aria-label={`Schritt ${stand.index + 1} von ${stand.schritte.length}`}>
          {stand.index + 1}/{stand.schritte.length}
        </span>
        <p className="gcf-karte-text">
          {schritt.text}
          {gefunden === "vorstufe" && (
            <span className="gcf-leise"> {anrede === "du" ? "Erst das Menü öffnen." : "Erst das Menü öffnen."}</span>
          )}
          {gefunden === "nein" && ziel && <span className="gcf-leise"> ({ziel.name} ist hier nicht zu sehen.)</span>}
        </p>
        {stand.index > 0 && (
          <button type="button" onClick={() => setStand({ ...stand, index: stand.index - 1 })} className="gcf-knopf">
            Zurück
          </button>
        )}
        <button
          type="button"
          onClick={() => setStand(letzter ? null : { ...stand, index: stand.index + 1 })}
          className="gcf-knopf gcf-primaer"
        >
          {letzter ? "Fertig" : "Weiter"}
        </button>
        <button type="button" onClick={() => setStand(null)} className="gcf-icon-knopf gcf-karte-zu" aria-label="Führung beenden" title="Beenden">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
    </>
  );
}
