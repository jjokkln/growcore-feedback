"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { leseAntwort, type Schritt } from "../core/ki-antwort.ts";
import type { KiNachricht } from "../core/typen.ts";
import type { ZielKatalog } from "../core/ziele.ts";
import { Fuehrung, starteFuehrung } from "./fuehrung.tsx";
import { useMounted } from "./hooks.ts";
import { Fadenkreuz, Funken, Info, Kreuz, Pfeil, Start } from "./icons.tsx";
import { KI_UI_ATTR } from "./ziel-finden.ts";

/**
 * Die KI-Hilfe: erklärt, was auf der Seite steht und wie man anmerkt.
 *
 * ─── Kennzeichnung (Pflichtkern 6, Art. 50 AI Act) ──────────────────────────
 *
 * Das Wort „KI" fällt, BEVOR jemand tippt: auf dem Knopf (sichtbar, nicht nur
 * im ARIA-Label), im Kopf des Fensters, in der ersten Nachricht und über jeder
 * Antwort. „Assistent" allein reicht nicht.
 *
 * ─── Was gespeichert wird ───────────────────────────────────────────────────
 *
 * Der Verlauf liegt im `sessionStorage` dieses Reiters. Der Server meldet nur
 * die FRAGE an den Eingang im Projektraum (30 Tage), keine Antwort. Deshalb
 * steht in der Begrüßung, dass keine persönlichen Angaben hineingehören.
 */

const VERLAUF = "gcf-ki-verlauf";

function leseVerlauf(): KiNachricht[] {
  try {
    const roh = sessionStorage.getItem(VERLAUF);
    const daten = roh ? (JSON.parse(roh) as KiNachricht[]) : [];
    return Array.isArray(daten) ? daten.slice(-20) : [];
  } catch {
    return [];
  }
}

function normPfad(pfad: string | null): string {
  if (!pfad || pfad === "/") return "/";
  return pfad.replace(/\/+$/, "") || "/";
}

export function KiHilfe(props: { projekt: string; ziele: ZielKatalog; vorschlaege: string[] }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(<KiHilfeInnen {...props} />, document.body);
}

function KiHilfeInnen({ projekt, ziele, vorschlaege }: { projekt: string; ziele: ZielKatalog; vorschlaege: string[] }) {
  const seite = normPfad(usePathname());
  const [offen, setOffen] = useState(false);
  const [verlauf, setVerlauf] = useState<KiNachricht[]>(leseVerlauf);
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const knopfRef = useRef<HTMLButtonElement>(null);
  const feldRef = useRef<HTMLTextAreaElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);
  const abbruchRef = useRef<AbortController | null>(null);
  const bekannt = (id: string) => id in ziele;

  const begruessung =
    `Guten Tag! Ich bin die KI-Hilfe zur ${projekt} – eine künstliche Intelligenz, kein Mensch. ` +
    "Ich erkläre, was wo auf der Seite steht und wie Sie Anmerkungen hinterlassen. " +
    "Ich kann mich irren. Bitte geben Sie keine persönlichen Angaben ein.";

  useEffect(() => {
    try {
      sessionStorage.setItem(VERLAUF, JSON.stringify(verlauf.slice(-20)));
    } catch {
      // Blockierter Speicher: Der Verlauf lebt dann nur, solange die Seite lebt.
    }
    listeRef.current?.scrollTo({ top: listeRef.current.scrollHeight });
  }, [verlauf]);

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
  }, [offen]);

  useEffect(() => () => abbruchRef.current?.abort(), []);

  const fragen = async (text: string) => {
    const frage = text.trim();
    if (!frage || laeuft) return;
    setFehler(null);
    setEingabe("");
    const neu: KiNachricht[] = [...verlauf, { rolle: "nutzer" as const, text: frage }].slice(-20);
    setVerlauf([...neu, { rolle: "ki", text: "" }]);
    setLaeuft(true);

    const abbruch = new AbortController();
    abbruchRef.current = abbruch;
    try {
      const antwort = await fetch("/api/feedback/ki-hilfe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seite, nachrichten: neu }),
        signal: abbruch.signal,
      });
      if (!antwort.ok || !antwort.body) {
        const roh = await antwort.text().catch(() => "");
        let meldung = roh;
        try {
          meldung = (JSON.parse(roh) as { fehler?: string }).fehler ?? roh;
        } catch {
          // Klartext
        }
        throw new Error(meldung || "Die Hilfe ist gerade nicht erreichbar.");
      }
      const leser = antwort.body.pipeThrough(new TextDecoderStream()).getReader();
      let gesamt = "";
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        gesamt += value;
        setVerlauf([...neu, { rolle: "ki", text: gesamt }]);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // Die Frage bleibt stehen, die leere Antwort nicht.
      setVerlauf(neu);
      setFehler(e instanceof Error ? e.message : "Die Hilfe ist gerade nicht erreichbar.");
    } finally {
      setLaeuft(false);
      abbruchRef.current = null;
    }
  };

  const fuehren = (schritte: Schritt[], ab: number) => {
    setOffen(false);
    starteFuehrung(schritte, ab);
  };

  return (
    <>
      <Fuehrung ziele={ziele} onZurKiHilfe={() => setOffen(true)} />
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
          KI-Hilfe
        </button>
      )}

      {offen && (
        <div
          id="gcf-ki-fenster"
          {...{ [KI_UI_ATTR]: "" }}
          role="dialog"
          aria-labelledby="gcf-ki-titel"
          className="gcf-ki-fenster"
        >
          <div className="gcf-ki-kopf">
            <span className="gcf-ki-zeichen">
              <Funken />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id="gcf-ki-titel" className="gcf-ki-titel">
                KI-Hilfe
              </h2>
              <p className="gcf-klein">Antworten erzeugt eine KI (Google Gemini, EU). Sie kann sich irren.</p>
            </div>
            <button
              type="button"
              className="gcf-icon-knopf"
              aria-label="KI-Hilfe schließen"
              onClick={() => {
                setOffen(false);
                knopfRef.current?.focus();
              }}
            >
              <Kreuz />
            </button>
          </div>

          <div ref={listeRef} role="log" aria-live="polite" aria-busy={laeuft} className="gcf-ki-liste">
            <Blase rolle="ki" text={begruessung} bekannt={bekannt} />
            {verlauf.map((n, i) => (
              <Blase
                key={i}
                rolle={n.rolle}
                text={n.text}
                wartet={laeuft && i === verlauf.length - 1}
                bekannt={bekannt}
                onFuehren={fuehren}
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
                Frage an die KI-Hilfe
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
                placeholder="Frage an die KI stellen …"
                className="gcf-ki-feld"
              />
              <button
                type="submit"
                className="gcf-icon-knopf gcf-primaer"
                disabled={laeuft || !eingabe.trim()}
                aria-label="Frage senden"
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
        </div>
      )}
    </>
  );
}

function Blase({
  rolle,
  text,
  wartet,
  bekannt,
  onFuehren,
}: {
  rolle: KiNachricht["rolle"];
  text: string;
  wartet?: boolean;
  bekannt: (id: string) => boolean;
  onFuehren?: (schritte: Schritt[], ab: number) => void;
}) {
  if (rolle === "nutzer") {
    return (
      <div className="gcf-blase-rechts">
        <p className="gcf-blase gcf-blase-nutzer">
          <span className="gcf-sr">Sie: </span>
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
        {!text && wartet && <span className="gcf-leise">denkt nach …</span>}
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

        {mitZiel && fertig && onFuehren && (
          <button type="button" onClick={() => onFuehren(antwort.schritte, 0)} className="gcf-knopf gcf-primaer gcf-breit">
            <Start size={14} />
            Schritt für Schritt zeigen
          </button>
        )}
      </div>
    </div>
  );
}
