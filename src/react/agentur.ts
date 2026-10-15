"use client";

import { useSyncExternalStore } from "react";

/**
 * Lennys Zugang auf der Website (0.15.0)
 * =====================================
 *
 * Der Projektraum öffnet die Website mit `#gcf-lenny=<zugang>` (Knopf „Als
 * Lenny anmerken“ auf /feedback). Hier wird er einmal gelesen, im Browser
 * gemerkt und aus der Adresszeile entfernt — er soll weder in einem
 * Lesezeichen noch in einem weitergeschickten Link landen.
 *
 * Der Zugang ist signiert; geprüft wird er NUR im Projektraum. Was hier
 * gelesen wird (Name, Ablauf), dient der Anzeige: Wer ihn fälscht, bekommt
 * einen Knopf „Als Lenny“, aber jede Anmerkung kommt trotzdem als
 * Besucheranmerkung an.
 */

const SPEICHER = "gcf-agentur";
const HASH = /(?:^#|&)gcf-lenny=([A-Za-z0-9_.-]{20,1000})/;

export type Agentur = { zugang: string; name: string; bis: number };

function lese(zugang: string): Agentur | null {
  try {
    const nutzlast = zugang.replace(/^gcl_/, "").split(".")[0] ?? "";
    const json = atob(nutzlast.replace(/-/g, "+").replace(/_/g, "/"));
    const inhalt = JSON.parse(decodeURIComponent(escape(json))) as { l?: unknown; e?: unknown };
    if (typeof inhalt.e !== "number" || inhalt.e < Date.now()) return null;
    return { zugang, name: typeof inhalt.l === "string" ? inhalt.l : "Lenny", bis: inhalt.e };
  } catch {
    return null;
  }
}

let stand: Agentur | null = null;
let gelesen = false;
const hoerer = new Set<() => void>();

function einlesen() {
  if (gelesen) return;
  gelesen = true;
  try {
    const treffer = HASH.exec(window.location.hash);
    if (treffer?.[1]) {
      const neu = lese(treffer[1]);
      if (neu) localStorage.setItem(SPEICHER, neu.zugang);
      const rest = window.location.hash.replace(HASH, "").replace(/^#&?/, "");
      history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
    }
    const gemerkt = localStorage.getItem(SPEICHER);
    stand = gemerkt ? lese(gemerkt) : null;
    if (gemerkt && !stand) localStorage.removeItem(SPEICHER);
  } catch {
    stand = null;
  }
}

/** Der Zugang für die Kopfzeile `x-gcf-agentur`, oder `null`. */
export function agenturZugang(): string | null {
  if (typeof window === "undefined") return null;
  einlesen();
  if (stand && stand.bis < Date.now()) stand = null;
  return stand?.zugang ?? null;
}

export function agenturAbmelden() {
  try {
    localStorage.removeItem(SPEICHER);
  } catch {
    // ohne Speicher: gilt nur bis zum Neuladen
  }
  stand = null;
  hoerer.forEach((h) => h());
}

function abonnieren(h: () => void) {
  hoerer.add(h);
  return () => {
    hoerer.delete(h);
  };
}

/** Ist Lenny in diesem Browser angemeldet? `null` = nein. */
export function useAgentur(): Agentur | null {
  return useSyncExternalStore(
    abonnieren,
    () => {
      einlesen();
      return stand;
    },
    () => null,
  );
}
