"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { leseEreignis, type IdeeEingabe, type MarkierenEingabe } from "../core/assistent.ts";
import { leseAntwort, type Schritt } from "../core/ki-antwort.ts";
import { ALLE_SEITEN } from "../core/konstanten.ts";
import type { KiNachricht } from "../core/typen.ts";
import type { ZielKatalog } from "../core/ziele.ts";
import { feedbackApi, gespeicherterName, kopfzeilen, nameMerken } from "./client.ts";
import { anmerkungenGeaendert, useFaehigkeiten, useLeisteOffen, useWerkzeugAn } from "./einstieg.ts";
import { Fuehrung, starteFuehrung } from "./fuehrung.tsx";
import { useLocalStorageState, useMounted } from "./hooks.ts";
import { Fadenkreuz, Funken, Haken, Hoch, Info, Pfeil, Runter, Start } from "./icons.tsx";
import { markierungFuer, sammleStellen } from "./stellen.ts";
import { KI_UI_ATTR } from "./ziel-finden.ts";

/**
 * Der KI-Assistent (0.12.0, vorher „KI-Hilfe“): erklärt die Seite, beantwortet
 * Fragen zum Projekt, kreist auf Wunsch Stellen ein und gibt Ideen an Lenny.
 *
 * ─── Wo die KI läuft ────────────────────────────────────────────────────────
 *
 * Im Projektraum, nicht hier: Die eigene Route (`/api/feedback/assistent`)
 * reicht Frage, Seite, Stellen und Wissen per Projektschlüssel weiter, dort
 * antwortet Claude Haiku 5.5 (Anthropic, USA) — growcore-feedback DECISIONS
 * 2026-10-15. Deshalb vor der ersten Frage ein Klick „Einverstanden“, gemerkt
 * im Browser.
 *
 * ─── Kennzeichnung (Pflichtkern 6, Art. 50 AI Act) ──────────────────────────
 *
 * Das Wort „KI" fällt, BEVOR jemand tippt: auf dem Knopf, im Kopf des Fensters,
 * in der Einwilligung, in der ersten Nachricht und über jeder Antwort.
 *
 * ─── Was gespeichert wird ───────────────────────────────────────────────────
 *
 * Der Verlauf liegt im `sessionStorage` dieses Reiters. Der Projektraum hält
 * nur die FRAGE fest (30 Tage), keine Antwort. Eine Anmerkung oder Idee
 * entsteht erst, wenn die Person auf den Knopf unter dem Vorschlag klickt.
 */

const VERLAUF = "gcf-ki-verlauf-2";
const EINWILLIGUNG = "gcf-ki-einwilligung";
const EINWILLIGUNG_STAND = "anthropic-2026-10";

type Vorschlag =
  | { werkzeug: "stelle_markieren"; eingabe: MarkierenEingabe }
  | { werkzeug: "idee_vorschlagen"; eingabe: IdeeEingabe };

type VorschlagStand = "offen" | "erledigt" | "verworfen" | "fehler";

type Eintrag =
  | { rolle: "nutzer"; text: string }
  | {
      rolle: "ki";
      text: string;
      /** Wo der Assistent nachgesehen hat (Beschriftungen), nur zur Anzeige. */
      quellen?: string[];
      vorschlag?: Vorschlag & { stand: VorschlagStand; meldung?: string };
    };

function leseVerlauf(): Eintrag[] {
  try {
    const roh = sessionStorage.getItem(VERLAUF);
    const daten = roh ? (JSON.parse(roh) as Eintrag[]) : [];
    return Array.isArray(daten) ? daten.slice(-30) : [];
  } catch {
    return [];
  }
}

function normPfad(pfad: string | null): string {
  if (!pfad || pfad === "/") return "/";
  return pfad.replace(/\/+$/, "") || "/";
}

/**
 * Was die KI beim nächsten Mal vom Verlauf sieht. Ein entschiedener Vorschlag
 * steht als Satz dabei — sonst schlüge sie dieselbe Anmerkung noch einmal vor.
 */
function alsNachrichten(verlauf: Eintrag[]): KiNachricht[] {
  const nachrichten: KiNachricht[] = [];
  for (const e of verlauf) {
    if (e.rolle === "nutzer") {
      nachrichten.push({ rolle: "nutzer", text: e.text.slice(0, 4000) });
      continue;
    }
    const teile = [e.text.trim()];
    if (e.vorschlag) {
      const was =
        e.vorschlag.werkzeug === "stelle_markieren"
          ? `Anmerkung einkreisen: „${e.vorschlag.eingabe.notiz}“`
          : `Idee an Lenny: „${e.vorschlag.eingabe.titel}“`;
      const stand =
        e.vorschlag.stand === "erledigt"
          ? "Die Person hat bestätigt, es ist gespeichert."
          : e.vorschlag.stand === "verworfen"
            ? "Die Person hat abgelehnt."
            : e.vorschlag.stand === "fehler"
              ? "Speichern ist gescheitert."
              : "Noch nicht entschieden.";
      teile.push(`(Vorgeschlagen — ${was}. ${stand})`);
    }
    const text = teile.filter(Boolean).join("\n\n").slice(0, 4000);
    if (text) nachrichten.push({ rolle: "ki", text });
  }
  return nachrichten.slice(-30);
}

type KiHilfeProps = {
  projekt: string;
  ziele: ZielKatalog;
  vorschlaege: string[];
  /** „du“ (Standard seit 0.14.0) oder „Sie“ — wie `anrede` in `KiWissen`. */
  anrede?: "du" | "Sie";
  /**
   * Erste Nachricht der KI (0.10.0). Muss sagen, dass hier eine KI antwortet
   * (Art. 50 KI-VO).
   */
  begruessung?: string;
  /** Seiten mit Personendaten: Stellen nur aus `data-review-anker` (0.12.0). */
  datensparsam?: boolean;
};

/**
 * Sichtbar nur mit offener Leiste (0.13.0, Lenny 2026-10-15): Das `?` in der
 * Navigation holt Leiste UND KI-Knopf, ein zweiter Klick räumt beides weg. Wer
 * normal arbeitet, sieht nichts vom Werkzeug. Das Gespräch bleibt im
 * sessionStorage und ist beim nächsten Öffnen wieder da.
 */
export function KiHilfe(props: KiHilfeProps) {
  const mounted = useMounted();
  const werkzeugAn = useWerkzeugAn();
  const { assistent } = useFaehigkeiten();
  const [leisteOffen] = useLeisteOffen();
  if (!mounted || !werkzeugAn || !assistent || !leisteOffen) return null;
  return createPortal(<KiHilfeInnen {...props} />, document.body);
}

function KiHilfeInnen({
  ziele,
  vorschlaege,
  anrede = "du",
  begruessung: eigeneBegruessung,
  datensparsam = false,
}: KiHilfeProps) {
  const seite = normPfad(usePathname());
  const du = anrede === "du";
  const [offen, setOffen] = useState(false);
  const [verlauf, setVerlauf] = useState<Eintrag[]>(leseVerlauf);
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fuehrt, setFuehrt] = useState(false);
  const [einwilligung, setEinwilligung] = useLocalStorageState<string | null>(EINWILLIGUNG, null);
  const [, setLeisteOffen] = useLeisteOffen();

  const knopfRef = useRef<HTMLButtonElement>(null);
  const feldRef = useRef<HTMLTextAreaElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const abbruchRef = useRef<AbortController | null>(null);
  /** Die Elemente zu den Stellen der letzten Frage — nur der Browser kennt sie. */
  const stellenRef = useRef(new Map<string, Element>());
  const bekannt = (id: string) => id in ziele;
  const zugestimmt = einwilligung === EINWILLIGUNG_STAND;

  // Kurz (Lenny, 2026-10-15). Was nicht fehlen darf: dass hier eine KI antwortet.
  const begruessung =
    eigeneBegruessung ??
    (du
      ? "Hi! Ich bin eine KI, kein Mensch. Frag mich zur Seite oder zum Projekt – oder sag mir, was du ändern willst."
      : "Guten Tag! Ich bin eine KI, kein Mensch. Fragen Sie mich zur Seite oder zum Projekt – oder sagen Sie mir, was Sie ändern möchten.");

  useEffect(() => {
    try {
      sessionStorage.setItem(VERLAUF, JSON.stringify(verlauf.slice(-30)));
    } catch {
      // Blockierter Speicher: Der Verlauf lebt dann nur, solange die Seite lebt.
    }
    listeRef.current?.scrollTo({ top: listeRef.current.scrollHeight });
  }, [verlauf, status]);

  useEffect(() => {
    if (!offen) return;
    feldRef.current?.focus();
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOffen(false);
        knopfRef.current?.focus();
      }
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [offen, zugestimmt]);

  useEffect(() => () => abbruchRef.current?.abort(), []);

  /** Ändert den letzten Eintrag der KI (die Antwort, die gerade hereinkommt). */
  const aendereLetzte = (f: (e: Extract<Eintrag, { rolle: "ki" }>) => Extract<Eintrag, { rolle: "ki" }>) =>
    setVerlauf((alt) => {
      const letzte = alt[alt.length - 1];
      if (!letzte || letzte.rolle !== "ki") return alt;
      return [...alt.slice(0, -1), f(letzte)];
    });

  const fragen = async (text: string) => {
    const frage = text.trim();
    if (!frage || laeuft || !zugestimmt) return;
    setFehler(null);
    setEingabe("");
    // Offene Vorschläge gelten als übergangen, sobald weitergefragt wird.
    const vorher = verlauf.map((e) =>
      e.rolle === "ki" && e.vorschlag?.stand === "offen"
        ? { ...e, vorschlag: { ...e.vorschlag, stand: "verworfen" as const } }
        : e,
    );
    const neu: Eintrag[] = [...vorher, { rolle: "nutzer" as const, text: frage }].slice(-30);
    setVerlauf([...neu, { rolle: "ki", text: "" }]);
    setLaeuft(true);

    const { liste, elemente } = sammleStellen(datensparsam);
    stellenRef.current = elemente;

    const abbruch = new AbortController();
    abbruchRef.current = abbruch;
    try {
      const antwort = await fetch("/api/feedback/assistent", {
        method: "POST",
        headers: kopfzeilen(true),
        body: JSON.stringify({ seite, nachrichten: alsNachrichten(neu), stellen: liste }),
        signal: abbruch.signal,
        cache: "no-store",
      });
      if (!antwort.ok || !antwort.body) {
        const daten = (await antwort.json().catch(() => ({}))) as { fehler?: string };
        throw new Error(daten.fehler || "Der Assistent ist gerade nicht erreichbar.");
      }
      const leser = antwort.body.pipeThrough(new TextDecoderStream()).getReader();
      let rest = "";
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        rest += value;
        const zeilen = rest.split("\n");
        rest = zeilen.pop() ?? "";
        for (const zeile of zeilen) {
          const ereignis = zeile.trim() ? leseEreignis(zeile) : null;
          if (!ereignis) continue;
          if (ereignis.typ === "text") {
            setStatus(null);
            aendereLetzte((e) => ({ ...e, text: e.text + ereignis.text }));
          } else if (ereignis.typ === "werkzeug") {
            setStatus(`Sieht nach: ${ereignis.label} …`);
            aendereLetzte((e) => ({ ...e, quellen: [...new Set([...(e.quellen ?? []), ereignis.label])] }));
          } else if (ereignis.typ === "vorschlag") {
            const vorschlag = { werkzeug: ereignis.werkzeug, eingabe: ereignis.eingabe } as Vorschlag;
            aendereLetzte((e) => ({ ...e, vorschlag: { ...vorschlag, stand: "offen" } }));
          } else if (ereignis.typ === "fehler") {
            setFehler(ereignis.text);
          }
        }
      }
      // Leere Antwort ohne Vorschlag: lieber ein ehrlicher Satz als eine leere Blase.
      aendereLetzte((e) => (e.text.trim() || e.vorschlag ? e : { ...e, text: "Dazu habe ich gerade keine Antwort." }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // Die Frage bleibt stehen, die leere Antwort nicht.
      setVerlauf(neu);
      setFehler(e instanceof Error ? e.message : "Der Assistent ist gerade nicht erreichbar.");
    } finally {
      setLaeuft(false);
      setStatus(null);
      abbruchRef.current = null;
    }
  };

  const entscheide = async (index: number, ja: boolean) => {
    const eintrag = verlauf[index];
    if (!eintrag || eintrag.rolle !== "ki" || !eintrag.vorschlag || eintrag.vorschlag.stand !== "offen") return;
    const v = eintrag.vorschlag;
    const setze = (stand: VorschlagStand, meldung?: string) =>
      setVerlauf((alt) =>
        alt.map((e, i) =>
          i === index && e.rolle === "ki" && e.vorschlag ? { ...e, vorschlag: { ...e.vorschlag, stand, meldung } } : e,
        ),
      );
    if (!ja) {
      setze("verworfen");
      return;
    }

    if (v.werkzeug === "stelle_markieren") {
      const el = stellenRef.current.get(v.eingabe.stelle);
      if (!el || !el.isConnected) {
        setze("fehler", "Die Stelle ist nicht mehr auf der Seite. Bitte noch einmal fragen.");
        return;
      }
      const { global, ...markierung } = markierungFuer(el, datensparsam);
      const antwort = await feedbackApi.anlegen({
        ...markierung,
        path: global ? ALLE_SEITEN : seite,
        shape: "stroke",
        body: v.eingabe.notiz,
        color: v.eingabe.farbe,
      });
      if (!antwort.ok) {
        setze("fehler", antwort.fehler);
        return;
      }
      setze("erledigt", "Eingekreist und notiert. Sie steht jetzt in den Anmerkungen.");
      // Die Leiste auf, damit man den Kreis auch sieht; das Overlay lädt nach.
      setLeisteOffen(true);
      anmerkungenGeaendert();
      return;
    }

    const antwort = await feedbackApi.idee({
      titel: v.eingabe.titel,
      beschreibung: v.eingabe.beschreibung ?? null,
      seite,
    });
    if (!antwort.ok) setze("fehler", antwort.fehler);
    else setze("erledigt", "An Lenny geschickt. Er entscheidet, ob daraus eine Aufgabe wird.");
  };

  // Das Fenster bleibt offen: Wer „Zeigen" drückt, will danach weiterlesen
  // oder nachfragen. Auf dem Handy schrumpft es während der Führung (CSS).
  const fuehren = (schritte: Schritt[], ab: number) => {
    starteFuehrung(schritte, ab);
  };

  // Ein offener Vorschlag zum Einkreisen zeigt seine Stelle schon vor dem Klick.
  const letzte = verlauf[verlauf.length - 1];
  const vorschau =
    !laeuft && letzte?.rolle === "ki" && letzte.vorschlag?.werkzeug === "stelle_markieren" && letzte.vorschlag.stand === "offen"
      ? (stellenRef.current.get(letzte.vorschlag.eingabe.stelle) ?? null)
      : null;

  return (
    <>
      <Fuehrung ziele={ziele} onZurKiHilfe={() => setOffen(true)} onLaeuft={setFuehrt} anrede={anrede} />
      {offen && vorschau && <Vorschau el={vorschau} />}
      {!offen && (
        <button
          ref={knopfRef}
          {...{ [KI_UI_ATTR]: "" }}
          type="button"
          onClick={() => setOffen(true)}
          aria-expanded={false}
          aria-controls="gcf-ki-fenster"
          className="gcf-ki-knopf"
        >
          <Funken />
          KI-Assistent
          <Hoch size={14} />
        </button>
      )}

      {offen && (
        <div
          id="gcf-ki-fenster"
          {...{ [KI_UI_ATTR]: "" }}
          role="dialog"
          aria-labelledby="gcf-ki-titel"
          className="gcf-ki-fenster"
          {...(fuehrt ? { "data-fuehrung": "" } : {})}
        >
          <div className="gcf-ki-kopf">
            <span className="gcf-ki-zeichen">
              <Funken />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id="gcf-ki-titel" className="gcf-ki-titel">
                KI-Assistent
              </h2>
              <p className="gcf-klein">Antworten erzeugt eine KI (Claude von Anthropic). Sie kann sich irren.</p>
            </div>
            {/* Einklappen, nicht Schließen: Das Gespräch bleibt, der Knopf holt es zurück. */}
            <button
              type="button"
              className="gcf-icon-knopf gcf-ki-einklappen"
              aria-expanded
              aria-controls="gcf-ki-fenster"
              title="KI-Assistent einklappen — das Gespräch bleibt erhalten"
              onClick={() => {
                setOffen(false);
                knopfRef.current?.focus();
              }}
            >
              <Runter size={16} />
              Einklappen
            </button>
          </div>

          {!zugestimmt ? (
            <Einwilligung du={du} onJa={() => setEinwilligung(EINWILLIGUNG_STAND)} />
          ) : (
            <>
              <div ref={listeRef} role="log" aria-live="polite" aria-busy={laeuft} className="gcf-ki-liste">
                <Blase rolle="ki" text={begruessung} bekannt={bekannt} anrede={anrede} />
                {verlauf.map((n, i) => (
                  <Blase
                    key={i}
                    rolle={n.rolle}
                    text={n.text}
                    quellen={n.rolle === "ki" ? n.quellen : undefined}
                    wartet={laeuft && i === verlauf.length - 1}
                    status={laeuft && i === verlauf.length - 1 ? status : null}
                    bekannt={bekannt}
                    anrede={anrede}
                    onFuehren={fuehren}
                    vorschlag={n.rolle === "ki" ? n.vorschlag : undefined}
                    onEntscheiden={(ja) => void entscheide(i, ja)}
                  />
                ))}
                {verlauf.length === 0 && vorschlaege.length > 0 && (
                  <div className="gcf-vorschlaege">
                    {vorschlaege.map((v) => (
                      <button key={v} type="button" className="gcf-vorschlag" onClick={() => void fragen(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {fehler && (
                  <p role="alert" className="gcf-fehler">
                    {fehler}
                  </p>
                )}
              </div>

              <div className="gcf-ki-fuss">
                <form
                  className="gcf-ki-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void fragen(eingabe);
                  }}
                >
                  <label htmlFor="gcf-ki-frage" className="gcf-sr">
                    Nachricht an den KI-Assistenten
                  </label>
                  <textarea
                    id="gcf-ki-frage"
                    ref={feldRef}
                    value={eingabe}
                    onChange={(e) => setEingabe(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void fragen(eingabe);
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder={du ? "Frag etwas oder beschreib eine Änderung …" : "Fragen Sie etwas oder beschreiben Sie eine Änderung …"}
                    className="gcf-ki-feld"
                  />
                  <button
                    type="submit"
                    className="gcf-icon-knopf gcf-primaer"
                    disabled={laeuft || !eingabe.trim()}
                    aria-label="Nachricht senden"
                  >
                    <Pfeil />
                  </button>
                </form>
                {verlauf.length > 0 && (
                  <button
                    type="button"
                    className="gcf-leise-knopf"
                    onClick={() => {
                      abbruchRef.current?.abort();
                      setVerlauf([]);
                      setFehler(null);
                    }}
                  >
                    Neues Gespräch
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Vor der ersten Frage: wohin die Fragen gehen, und unter welchem Namen
 * Anmerkungen und Ideen ankommen. Der Name ist derselbe wie im Overlay.
 */
function Einwilligung({ du, onJa }: { du: boolean; onJa: () => void }) {
  const [personen, setPersonen] = useState<string[] | null>(null);
  const [name, setName] = useState(gespeicherterName);

  useEffect(() => {
    let aktiv = true;
    void feedbackApi.personen().then((liste) => {
      if (aktiv) setPersonen(liste);
    });
    return () => {
      aktiv = false;
    };
  }, []);

  const mitAuswahl = (personen?.length ?? 0) > 0;
  const darf = !mitAuswahl || Boolean(name.trim());

  return (
    <div className="gcf-ki-liste">
      <div className="gcf-einwilligung">
        <p className="gcf-absatz">
          {du ? "Bevor du fragst: " : "Bevor Sie fragen: "}
          Der KI-Assistent ist eine künstliche Intelligenz (Claude von Anthropic). {du ? "Deine" : "Ihre"} Nachrichten, die aktuelle Seite und die
          Beschriftungen auf der Seite gehen dafür an den Projektraum von Lenny Helps und von dort an Anthropic in den USA. Die
          Frage wird 30 Tage aufbewahrt, die Antwort nicht.
        </p>
        <p className="gcf-klein">
          {du ? "Bitte gib keine persönlichen Angaben über andere ein." : "Bitte geben Sie keine persönlichen Angaben über andere ein."}
        </p>
        {mitAuswahl ? (
          <>
            <label htmlFor="gcf-ki-person" className="gcf-klein" style={{ display: "block", marginTop: 10 }}>
              {du ? "Wer bist du?" : "Wer sind Sie?"} (steht an Anmerkungen und Ideen)
            </label>
            <select
              id="gcf-ki-person"
              className="gcf-ki-feld"
              value={personen?.includes(name) ? name : ""}
              onChange={(e) => setName(e.target.value)}
            >
              <option value="" disabled>
                Bitte auswählen
              </option>
              {personen?.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor="gcf-ki-name" className="gcf-klein" style={{ display: "block", marginTop: 10 }}>
              {du ? "Dein Name" : "Ihr Name"} (optional, steht an Anmerkungen und Ideen)
            </label>
            <input
              id="gcf-ki-name"
              className="gcf-ki-feld"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        )}
        <button
          type="button"
          className="gcf-knopf gcf-primaer gcf-breit"
          style={{ marginTop: 12 }}
          disabled={!darf}
          onClick={() => {
            nameMerken(name);
            onJa();
          }}
        >
          Einverstanden
        </button>
      </div>
    </div>
  );
}

/** Rahmen um die Stelle, die der Assistent einkreisen will — positioniert per rAF wie die Führung. */
function Vorschau({ el }: { el: Element }) {
  const rahmenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Liegt das KI-Fenster quer über dem unteren Bildschirm (Handy), zählt nur
    // der freie Teil darüber — sonst säße die Stelle hinter dem Fenster.
    const fenster = document.getElementById("gcf-ki-fenster")?.getBoundingClientRect();
    const frei = fenster && fenster.width > window.innerWidth * 0.6 ? Math.max(160, fenster.top - 12) : window.innerHeight;
    const box = el.getBoundingClientRect();
    if (box.top < 60 || box.top > frei - 40) {
      const ziel = Math.max(70, (frei - Math.min(box.height, frei - 80)) / 2);
      window.scrollBy({ top: box.top - ziel, behavior: ruhig ? "auto" : "smooth" });
    }
    let id = 0;
    const setzen = () => {
      const r = el.getBoundingClientRect();
      const rahmen = rahmenRef.current;
      if (rahmen) {
        rahmen.style.transform = `translate(${r.left - 8}px, ${r.top - 8}px)`;
        rahmen.style.width = `${r.width + 16}px`;
        rahmen.style.height = `${r.height + 16}px`;
      }
      id = requestAnimationFrame(setzen);
    };
    setzen();
    return () => cancelAnimationFrame(id);
  }, [el]);

  return (
    <div
      ref={rahmenRef}
      {...{ [KI_UI_ATTR]: "" }}
      aria-hidden
      className="gcf-rahmen gcf-vorschau"
    />
  );
}

function VorschlagKarte({
  vorschlag,
  du,
  onEntscheiden,
}: {
  vorschlag: Vorschlag & { stand: VorschlagStand; meldung?: string };
  du: boolean;
  onEntscheiden: (ja: boolean) => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const markieren = vorschlag.werkzeug === "stelle_markieren";
  const titel = markieren ? "Stelle einkreisen und notieren" : "Idee an Lenny schicken";
  const text = markieren ? vorschlag.eingabe.notiz : vorschlag.eingabe.titel;
  const zusatz = !markieren ? vorschlag.eingabe.beschreibung : undefined;

  return (
    <div className="gcf-vorschlag-karte" data-stand={vorschlag.stand}>
      <p className="gcf-eyebrow">{titel}</p>
      <p className="gcf-absatz" style={{ fontWeight: 600 }}>
        {text}
      </p>
      {zusatz && <p className="gcf-klein">{zusatz}</p>}
      {markieren && vorschlag.stand === "offen" && (
        <p className="gcf-klein">
          Die Stelle ist auf der Seite umrandet.
          {vorschlag.eingabe.farbe === "rot" ? " Farbe: Rot (muss geändert werden)." : " Farbe: Grün."}
        </p>
      )}
      {vorschlag.stand === "offen" ? (
        <div className="gcf-karte-leiste">
          <button
            type="button"
            className="gcf-knopf gcf-primaer"
            disabled={laeuft}
            onClick={() => {
              setLaeuft(true);
              onEntscheiden(true);
            }}
          >
            <Haken size={12} />
            {laeuft ? "Speichert …" : markieren ? "Einkreisen" : "Abschicken"}
          </button>
          <button type="button" className="gcf-knopf" disabled={laeuft} onClick={() => onEntscheiden(false)}>
            Nein, danke
          </button>
        </div>
      ) : (
        <p className={vorschlag.stand === "fehler" ? "gcf-fehler" : "gcf-klein"} role={vorschlag.stand === "fehler" ? "alert" : undefined}>
          {vorschlag.stand === "verworfen" ? "Nicht gespeichert." : vorschlag.meldung}
        </p>
      )}
    </div>
  );
}

function Blase({
  rolle,
  text,
  quellen,
  wartet,
  status,
  bekannt,
  anrede,
  onFuehren,
  vorschlag,
  onEntscheiden,
}: {
  rolle: KiNachricht["rolle"];
  anrede: "du" | "Sie";
  text: string;
  quellen?: string[];
  wartet?: boolean;
  status?: string | null;
  bekannt: (id: string) => boolean;
  onFuehren?: (schritte: Schritt[], ab: number) => void;
  vorschlag?: Vorschlag & { stand: VorschlagStand; meldung?: string };
  onEntscheiden?: (ja: boolean) => void;
}) {
  if (rolle === "nutzer") {
    return (
      <div className="gcf-blase-rechts">
        <p className="gcf-blase gcf-blase-nutzer">
          <span className="gcf-sr">{anrede === "du" ? "Du" : "Sie"}: </span>
          {text}
        </p>
      </div>
    );
  }

  const antwort = leseAntwort(text, bekannt);
  const mitZiel = antwort.schritte.some((s) => s.ziel);
  // „Fertig" erst, wenn der Strom steht — sonst spränge der Knopf unter dem Finger weg.
  const fertig = !wartet;

  return (
    <div className="gcf-blase-links">
      <p className="gcf-ki-marke">
        <Funken size={12} />
        KI
      </p>
      <div className="gcf-blase gcf-blase-ki">
        {!text && wartet && <span className="gcf-leise">{status ?? "denkt nach …"}</span>}
        {antwort.einleitung && <p className="gcf-absatz">{antwort.einleitung}</p>}

        {antwort.schritte.length > 0 && (
          <ol className="gcf-schritte" aria-label="Schritte">
            {antwort.schritte.map((s, i) => (
              <li key={i} className="gcf-schritt" style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}>
                <span aria-hidden className="gcf-schritt-nr">
                  {s.nr}
                </span>
                <span className="gcf-sr">Schritt {s.nr}: </span>
                <span style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>{s.text}</span>
                {s.ziel && fertig && onFuehren && (
                  <button
                    type="button"
                    onClick={() => onFuehren(antwort.schritte, i)}
                    aria-label={`Schritt ${s.nr} auf der Seite zeigen`}
                    className="gcf-zeigen"
                  >
                    <Fadenkreuz size={14} />
                    Zeigen
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}

        {antwort.hinweis && (
          <p className="gcf-hinweis">
            <Info size={14} />
            <span>{antwort.hinweis}</span>
          </p>
        )}

        {text && wartet && status && <span className="gcf-leise gcf-klein">{status}</span>}

        {mitZiel && fertig && onFuehren && (
          <button type="button" onClick={() => onFuehren(antwort.schritte, 0)} className="gcf-knopf gcf-primaer gcf-breit">
            <Start size={14} />
            Schritt für Schritt zeigen
          </button>
        )}

        {vorschlag && fertig && onEntscheiden && (
          <VorschlagKarte vorschlag={vorschlag} du={anrede === "du"} onEntscheiden={onEntscheiden} />
        )}

        {quellen && quellen.length > 0 && fertig && (
          <p className="gcf-quellen">Nachgesehen im Projektraum: {quellen.join(", ")}</p>
        )}
      </div>
    </div>
  );
}
