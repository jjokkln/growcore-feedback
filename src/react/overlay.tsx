"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import {
  OVERLAY_ATTR,
  aktuellePunkte,
  alsPfad,
  ausduennen,
  elementUnter,
  findeAnker,
  sektionsWurzel,
  selektorPfad,
  stellenLabel,
  zuAnkerAnteil,
  zuDokumentAnteil,
} from "../core/anker.ts";
import { alsMarkdown } from "../core/export.ts";
import {
  ART_LABEL,
  FARBNAME,
  FARBWERT,
  KUNDEN_FARBEN,
  type Anmerkung,
  type KundenFarbe,
  type NeueAnmerkung,
  type Punkt,
} from "../core/typen.ts";
import { feedbackApi, gespeicherterName, nameMerken } from "./client.ts";
import { useLocalStorageState, useMounted } from "./hooks.ts";

/**
 * Das Anmerkungs-Overlay: irgendwohin klicken → Kommentar, oder einkreisen.
 *
 * Katalog-Baustein „Abnahme-Overlay-mit-Freihand". Geändert für das Paket:
 *
 * 1. **Speicher ist der Eingang im Projektraum**, erreicht über die eigene
 *    Route (`./client.ts`), nicht über Server Actions.
 * 2. **Keine Konten.** Wer schreibt, nennt optional einen Namen; löschen darf
 *    man nur, was `eigen` ist (vom Server berechnet).
 * 3. **Farben aus `--gcf-*`** (`styles.css`), damit jedes Projekt sie an sein
 *    Design anpassen kann. Die vier Markenfarben bleiben fest.
 * 4. **Anmerkungen von GrowCore** stehen blau mit ihrer Art darüber; ohne
 *    gefundenen Anker nur in der Liste, „Stelle nicht gefunden".
 *
 * ⚠️ WARUM DIE POSITIONEN IMPERATIV GESETZT WERDEN (und nicht über State):
 * Die Marken hängen an Elementen der Seite, ihre Bildschirmposition ändert
 * sich bei JEDEM Scrollen. Ein State-Update pro Frame bei fünfzig Marken macht
 * das Scrollen zäh. Gerendert wird nur, wenn sich die Anmerkungen ändern; die
 * Position schreibt eine rAF-Schleife direkt ins `style`-Attribut.
 */

type Modus = "ansehen" | "kommentar" | "zeichnen";

/**
 * Was gerade entsteht, aber noch nicht gespeichert ist. `zug` ist gesetzt,
 * wenn gezeichnet wurde: Ein Strich ist kein eigenes Ding, sondern die Art,
 * einen BEREICH zu kommentieren (Katalognote, Entscheidung 5).
 */
type Entwurf = {
  x: number;
  y: number;
  anchor_selector: string;
  anchor_label: string;
  zug?: { points: Punkt[]; fallback: Punkt[] };
};

/** Über allem, aber unterhalb des Maximums — damit ein Dialog notfalls drüber kann. */
const EBENE = 2147482000;

const T = {
  flaeche: "var(--gcf-flaeche)",
  text: "var(--gcf-text)",
  leise: "var(--gcf-leise)",
  kante: "var(--gcf-kante)",
  leiste: "var(--gcf-leiste)",
  primaer: "var(--gcf-primaer)",
  primaerText: "var(--gcf-primaer-text)",
  gefahr: "var(--gcf-gefahr)",
  grund: "var(--gcf-grund)",
  schrift: "var(--gcf-schrift)",
};

/** Seitenpfad ohne abschließenden Schrägstrich — `/partner/` und `/partner` sind eine Seite. */
function normPfad(pfad: string | null): string {
  if (!pfad || pfad === "/") return "/";
  return pfad.replace(/\/+$/, "") || "/";
}

/** Was über einer Anmerkung steht — sagt, von wem sie ist. */
function wer(n: Anmerkung): string {
  if (n.from_agency) return ART_LABEL[n.kind];
  if (n.eigen) return "Ihre Anmerkung";
  return `Anmerkung von ${n.author_label ?? "Gast"}`;
}

export function AnmerkungsOverlay({ projekt }: { projekt: string }) {
  // Portal erst im Browser: Beim Server-Rendern gibt es kein `document.body`.
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(<Overlay projekt={projekt} />, document.body);
}

function Overlay({ projekt }: { projekt: string }) {
  const pfad = normPfad(usePathname());

  /** Alle Anmerkungen des Projekts; die Seite zeigt ihre, der Export alle. */
  const [alle, setAlle] = useState<Anmerkung[]>([]);
  const notizen = alle.filter((n) => normPfad(n.path) === pfad);
  const [modus, setModus] = useState<Modus>("ansehen");
  const [farbe, setFarbe] = useState<KundenFarbe>("rot");
  const [zeigeErledigte, setZeigeErledigte] = useState(false);
  const [zeigePins, setZeigePins] = useState(true);
  const [zeigeStriche, setZeigeStriche] = useState(true);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [listeAuf, setListeAuf] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  // Freihand: der Zug, der gerade entsteht (Viewport-Koordinaten).
  const zugRef = useRef<Punkt[]>([]);
  const [zeichnetGerade, setZeichnetGerade] = useState(false);
  const liveZugRef = useRef<SVGPathElement | null>(null);

  const markenRef = useRef(new Map<string, HTMLElement | SVGGElement>());
  /** Die Zettel an den eingekreisten Bereichen: Der Kommentar steht am Kringel. */
  const zettelRef = useRef(new Map<string, HTMLElement>());
  const offenRef = useRef<string | null>(null);
  const notizenRef = useRef<Anmerkung[]>([]);
  // Der noch nicht gespeicherte Zug wird von derselben rAF-Schleife
  // positioniert wie die gespeicherten — statisch bliebe er beim Scrollen
  // stehen, während die Seite darunter wegwandert.
  const entwurfRef = useRef<Entwurf | null>(null);
  const entwurfPfadRef = useRef<SVGPathElement | null>(null);

  const sichtbare = notizen.filter((n) => zeigeErledigte || !n.done);
  const offeneAnzahl = notizen.filter((n) => !n.done).length;

  // ── Laden ────────────────────────────────────────────────────────────────
  const neuLaden = useCallback(async () => {
    const antwort = await feedbackApi.laden();
    if (antwort.ok) setAlle(antwort.daten.anmerkungen);
  }, []);

  useEffect(() => {
    notizenRef.current = notizen;
  });
  useEffect(() => {
    entwurfRef.current = entwurf;
  }, [entwurf]);
  useEffect(() => {
    offenRef.current = offen;
  }, [offen]);

  useEffect(() => {
    let aktiv = true;
    const holen = () =>
      feedbackApi.laden().then((antwort) => {
        if (aktiv && antwort.ok) setAlle(antwort.daten.anmerkungen);
      });
    void holen();
    // Antworten von GrowCore kommen ohne Neuladen an, sobald der Reiter wieder im Blick ist.
    const beiSicht = () => {
      if (!document.hidden) void holen();
    };
    document.addEventListener("visibilitychange", beiSicht);
    return () => {
      aktiv = false;
      document.removeEventListener("visibilitychange", beiSicht);
    };
  }, [pfad]);

  // ── Positionierung ───────────────────────────────────────────────────────
  useEffect(() => {
    let id = 0;

    const verstecke = (el: HTMLElement | SVGGElement) => {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    };

    const setzen = () => {
      for (const notiz of notizenRef.current) {
        const knoten = markenRef.current.get(notiz.id);
        if (!knoten) continue;
        const lage = aktuellePunkte(notiz);
        const zettel = zettelRef.current.get(notiz.id);

        if (!lage) {
          // Kein Anker, kein Notnagel: nur in der Liste.
          verstecke(knoten);
          if (zettel) verstecke(zettel);
          continue;
        }
        const { punkte, verankert } = lage;

        if (notiz.shape === "pin") {
          const p = punkte[0];
          const el = knoten as HTMLElement;
          el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
          const drin = p.y > -40 && p.y < window.innerHeight + 40;
          el.style.opacity = drin ? "1" : "0";
          el.style.pointerEvents = drin ? "auto" : "none";
          el.dataset.lose = verankert ? "nein" : "ja";
        } else {
          const g = knoten as SVGGElement;
          g.style.opacity = "1";
          const d = alsPfad(punkte);
          for (const kind of Array.from(g.children)) {
            (kind as SVGPathElement).setAttribute("d", d);
          }
          g.dataset.lose = verankert ? "nein" : "ja";

          // Der Zettel sitzt am Absetzpunkt des Zuges — dort schaut man hin.
          if (zettel) {
            const p = punkte[punkte.length - 1];
            const drin = p.y > -60 && p.y < window.innerHeight + 60;
            zettel.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
            zettel.style.opacity = drin ? "1" : "0";
            zettel.style.pointerEvents = drin ? "auto" : "none";
          }
        }
      }

      // Das offene Fenster folgt seiner Marke. Am Rand kippt es nach innen.
      const offenId = offenRef.current;
      const fenster = document.querySelector<HTMLElement>("[data-anmerkung-fenster]");
      if (offenId && fenster) {
        const notiz = notizenRef.current.find((n) => n.id === offenId);
        const lage = notiz ? aktuellePunkte(notiz) : null;
        const box = fenster.getBoundingClientRect();
        if (lage) {
          const p = lage.punkte[lage.punkte.length - 1];
          const x = Math.min(Math.max(p.x - 24, 12), Math.max(12, window.innerWidth - box.width - 12));
          const untenPlatz = p.y + 24 + box.height <= window.innerHeight - 12;
          const y = untenPlatz ? p.y + 24 : Math.max(12, p.y - box.height - 16);
          fenster.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
        } else {
          // Ohne Stelle: in die Mitte, statt an einer geratenen Position.
          const x = Math.max(12, (window.innerWidth - box.width) / 2);
          const y = Math.max(12, (window.innerHeight - box.height) / 2);
          fenster.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
        }
      }

      const roh = entwurfRef.current;
      if (roh?.zug && entwurfPfadRef.current) {
        const lage = aktuellePunkte({
          anchor_selector: roh.anchor_selector,
          points: roh.zug.points,
          fallback: roh.zug.fallback,
        });
        if (lage) entwurfPfadRef.current.setAttribute("d", alsPfad(lage.punkte));
      }

      id = requestAnimationFrame(setzen);
    };

    id = requestAnimationFrame(setzen);
    return () => cancelAnimationFrame(id);
  }, []);

  // ── Tastatur ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (entwurf) setEntwurf(null);
      else if (offen) setOffen(null);
      else if (listeAuf) setListeAuf(false);
      else if (modus !== "ansehen") setModus("ansehen");
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [entwurf, offen, listeAuf, modus]);

  // ── Anlegen ──────────────────────────────────────────────────────────────

  /** Anker und beide Koordinatensätze für einen Zug in Viewport-Punkten. */
  const verankere = (punkte: Punkt[]) => {
    const start = punkte[0];
    const getroffen = elementUnter(start.x, start.y);
    const anker = sektionsWurzel(getroffen);
    const box = anker?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
    return {
      anchor_selector: selektorPfad(anker) || "body",
      anchor_label: stellenLabel(getroffen, anker),
      points: punkte.map((p) => zuAnkerAnteil(p.x, p.y, box)),
      fallback: punkte.map((p) => zuDokumentAnteil(p.x, p.y)),
    };
  };

  const speichere = async (eingabe: NeueAnmerkung) => {
    setLaeuft(true);
    const antwort = await feedbackApi.anlegen(eingabe);
    setLaeuft(false);
    if (!antwort.ok) {
      setMeldung(antwort.fehler);
      return false;
    }

    // ⚠️ Erst lokal anhängen, DANN nachladen — sonst erscheint die Marke erst
    // nach dem Roundtrip, und im Termin klickt jemand ein zweites Mal.
    const neu = antwort.daten.anmerkung;
    setAlle((alt) => (alt.some((n) => n.id === neu.id) ? alt : [...alt, neu]));
    await neuLaden();
    return true;
  };

  const beiKlick = (e: React.MouseEvent) => {
    if (modus !== "kommentar" || entwurf) return;
    const getroffen = elementUnter(e.clientX, e.clientY);
    const anker = sektionsWurzel(getroffen);
    setEntwurf({
      x: e.clientX,
      y: e.clientY,
      anchor_selector: selektorPfad(anker) || "body",
      anchor_label: stellenLabel(getroffen, anker),
    });
  };

  const entwurfAbschicken = async (text: string, name: string) => {
    if (!entwurf) return;
    nameMerken(name);

    const gemeinsam = {
      path: pfad,
      anchor_selector: entwurf.anchor_selector,
      anchor_label: entwurf.anchor_label,
      color: farbe,
      viewport_width: window.innerWidth,
    };

    // Gezeichnet: Der Zug IST die Marke, der Text hängt daran und darf fehlen.
    if (entwurf.zug) {
      const ok = await speichere({
        ...gemeinsam,
        shape: "stroke",
        body: text.trim() ? text.trim() : null,
        points: entwurf.zug.points,
        fallback: entwurf.zug.fallback,
      });
      if (ok) setEntwurf(null);
      return;
    }

    const box = findeAnker(entwurf.anchor_selector)?.getBoundingClientRect();
    const ok = await speichere({
      ...gemeinsam,
      shape: "pin",
      body: text,
      points: [box ? zuAnkerAnteil(entwurf.x, entwurf.y, box) : { x: 0, y: 0 }],
      fallback: [zuDokumentAnteil(entwurf.x, entwurf.y)],
    });
    if (ok) setEntwurf(null);
  };

  // ── Freihand ─────────────────────────────────────────────────────────────
  const beiZeigerAb = (e: React.PointerEvent) => {
    if (modus !== "zeichnen") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    zugRef.current = [{ x: e.clientX, y: e.clientY }];
    setZeichnetGerade(true);
  };

  const beiZeigerZug = (e: React.PointerEvent) => {
    if (modus !== "zeichnen" || zugRef.current.length === 0) return;
    const letzter = zugRef.current[zugRef.current.length - 1];
    if (Math.hypot(e.clientX - letzter.x, e.clientY - letzter.y) < 2) return;
    zugRef.current.push({ x: e.clientX, y: e.clientY });
    liveZugRef.current?.setAttribute("d", alsPfad(zugRef.current));
  };

  const beiZeigerAuf = () => {
    if (modus !== "zeichnen") return;
    const zug = ausduennen(zugRef.current);
    zugRef.current = [];
    setZeichnetGerade(false);
    liveZugRef.current?.setAttribute("d", "");
    // Ein einzelner Punkt ist ein Klick, kein Strich.
    if (zug.length < 2) return;

    const ende = zug[zug.length - 1];
    const { anchor_selector, anchor_label, points, fallback } = verankere(zug);
    setEntwurf({ x: ende.x, y: ende.y, anchor_selector, anchor_label, zug: { points, fallback } });
  };

  // ── Ändern ───────────────────────────────────────────────────────────────
  const mitMeldung = async (aufruf: Promise<{ ok: true } | { ok: false; fehler: string }>) => {
    setLaeuft(true);
    const antwort = await aufruf;
    setLaeuft(false);
    if (!antwort.ok) {
      setMeldung(antwort.fehler);
      return false;
    }
    await neuLaden();
    return true;
  };

  const exportieren = async () => {
    const text = alsMarkdown(alle, `Anmerkungen ${projekt}`);
    try {
      await navigator.clipboard.writeText(text);
      setMeldung(`${alle.length} Anmerkungen als Markdown kopiert.`);
    } catch {
      // Ohne Zwischenablage-Recht: als Datei. Ein Export, der still nichts
      // tut, ist schlimmer als einer, der einen Download auslöst.
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "anmerkungen.md";
      a.click();
      URL.revokeObjectURL(url);
      setMeldung(`${alle.length} Anmerkungen als Datei geladen.`);
    }
  };

  // ── Darstellung ──────────────────────────────────────────────────────────
  const pins = zeigePins ? sichtbare.filter((n) => n.shape === "pin") : [];
  const striche = zeigeStriche ? sichtbare.filter((n) => n.shape === "stroke") : [];
  const offeneNotiz = notizen.find((n) => n.id === offen) ?? null;
  const nummerVon = (n: Anmerkung) => pins.findIndex((p) => p.id === n.id) + 1;

  return (
    <>
      {/* Die Fläche, die Klicks und Striche annimmt.
          ⚠️ `aside` statt `div` (axe `region`), und KEIN aria-hidden: Die
          Marken darin sind Schaltflächen (Katalognote, Entscheidung 4). */}
      <aside
        aria-label="Anmerkungen auf der Seite"
        {...{ [OVERLAY_ATTR]: "" }}
        onClick={beiKlick}
        onPointerDown={beiZeigerAb}
        onPointerMove={beiZeigerZug}
        onPointerUp={beiZeigerAuf}
        onPointerCancel={beiZeigerAuf}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: EBENE,
          // Im Ansehen-Modus ist die Seite ganz normal bedienbar; die Marken
          // schalten `pointerEvents` einzeln an.
          pointerEvents: modus === "ansehen" ? "none" : "auto",
          // Zeichnen braucht die Geste; ohne `pan-y` ließe sich auf dem Handy
          // im Kommentarmodus nicht mehr scrollen.
          touchAction: modus === "zeichnen" ? "none" : "pan-y",
          cursor: modus === "ansehen" ? "auto" : "crosshair",
          background: modus === "ansehen" ? "transparent" : "rgba(18,18,18,0.03)",
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
        >
          {striche.map((n) => (
            <g
              key={n.id}
              ref={(el) => {
                if (el) markenRef.current.set(n.id, el);
                else markenRef.current.delete(n.id);
              }}
              style={{ pointerEvents: "stroke", cursor: "pointer", opacity: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                setOffen(n.id);
              }}
            >
              {/* Breiter, unsichtbarer Trefferpfad — eine 3-px-Linie zu treffen ist Glückssache. */}
              <path fill="none" stroke="transparent" strokeWidth={18} strokeLinecap="round" />
              <path
                fill="none"
                stroke={FARBWERT[n.color]}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={n.done ? 0.3 : 0.9}
                strokeDasharray={n.done ? "6 5" : n.from_agency ? "10 4" : undefined}
              />
            </g>
          ))}
          {entwurf?.zug && (
            <path
              ref={entwurfPfadRef}
              fill="none"
              stroke={FARBWERT[farbe]}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          )}
          {zeichnetGerade && (
            <path
              ref={liveZugRef}
              fill="none"
              stroke={FARBWERT[farbe]}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {/* Die Zettel an den eingekreisten Bereichen, zugleich die Trefferfläche. */}
        {striche.map((n) => (
          <button
            key={`zettel-${n.id}`}
            type="button"
            ref={(el) => {
              if (el) zettelRef.current.set(n.id, el);
              else zettelRef.current.delete(n.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setOffen(offen === n.id ? null : n.id);
            }}
            aria-label={`${wer(n)}, eingekreist: ${n.body ?? "ohne Text"}${n.done ? ", erledigt" : ""}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              opacity: 0,
              maxWidth: 240,
              textAlign: "left",
              margin: "6px 0 0 6px",
              padding: "5px 8px",
              borderRadius: 7,
              border: `1px solid ${FARBWERT[n.color]}`,
              borderLeftWidth: 3,
              background: T.flaeche,
              color: T.text,
              font: `400 12px/1.35 ${T.schrift}`,
              boxShadow: "0 2px 10px rgba(0,0,0,.18)",
              cursor: "pointer",
              display: offen === n.id ? "none" : "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textDecoration: n.done ? "line-through" : "none",
            }}
          >
            {n.from_agency && (
              // Text in Vordergrundfarbe, nicht in Blau: Blau auf dem dunklen
              // Grund fällt unter 4,5:1 (axe, 27.09.2026). Die Farbe trägt
              // der linke Rand.
              <strong style={{ fontWeight: 600 }}>{ART_LABEL[n.kind]}: </strong>
            )}
            {n.body ?? "✎ ohne Text"}
          </button>
        ))}

        {pins.map((n) => (
          <button
            key={n.id}
            type="button"
            ref={(el) => {
              if (el) markenRef.current.set(n.id, el);
              else markenRef.current.delete(n.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setOffen(offen === n.id ? null : n.id);
            }}
            aria-label={`${wer(n)} ${nummerVon(n)}${n.done ? ", erledigt" : ""}: ${n.body ?? ""}`}
            title={n.body ?? undefined}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              opacity: 0,
              width: 26,
              height: 26,
              marginLeft: -13,
              marginTop: -13,
              borderRadius: n.from_agency ? 7 : "50%",
              border: "2px solid #fff",
              background: n.done ? "#7c776d" : FARBWERT[n.color],
              color: "#fff",
              font: `600 12px/1 ${T.schrift}`,
              boxShadow: "0 1px 6px rgba(0,0,0,.35)",
              cursor: "pointer",
              textDecoration: n.done ? "line-through" : "none",
            }}
          >
            {nummerVon(n)}
          </button>
        ))}
      </aside>

      {entwurf && (
        <EntwurfsFeld
          entwurf={entwurf}
          farbe={farbe}
          laeuft={laeuft}
          onAbbruch={() => setEntwurf(null)}
          onSpeichern={entwurfAbschicken}
        />
      )}

      {offeneNotiz && (
        <NotizFenster
          notiz={offeneNotiz}
          nummer={nummerVon(offeneNotiz)}
          laeuft={laeuft}
          onSchliessen={() => setOffen(null)}
          onAbhaken={() => void mitMeldung(feedbackApi.erledigt(offeneNotiz.id, !offeneNotiz.done))}
          onLoeschen={async () => {
            if (await mitMeldung(feedbackApi.loeschen(offeneNotiz.id))) setOffen(null);
          }}
          onAntworten={(text) => mitMeldung(feedbackApi.antworten(offeneNotiz.id, text))}
        />
      )}

      <Leiste
        modus={modus}
        setModus={(m) => {
          setModus(m);
          setEntwurf(null);
          setOffen(null);
        }}
        farbe={farbe}
        setFarbe={setFarbe}
        zeigeErledigte={zeigeErledigte}
        setZeigeErledigte={setZeigeErledigte}
        zeigePins={zeigePins}
        setZeigePins={setZeigePins}
        zeigeStriche={zeigeStriche}
        setZeigeStriche={setZeigeStriche}
        offeneAnzahl={offeneAnzahl}
        listeAuf={listeAuf}
        setListeAuf={setListeAuf}
        onExport={() => void exportieren()}
      />

      {listeAuf && (
        <SeitenListe
          notizen={notizen}
          nummerVon={nummerVon}
          onSchliessen={() => setListeAuf(false)}
          onSpringen={(n) => {
            setOffen(n.id);
            findeAnker(n.anchor_selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}
          onAbhaken={(n) => void mitMeldung(feedbackApi.erledigt(n.id, !n.done))}
        />
      )}

      {meldung && (
        <div
          {...{ [OVERLAY_ATTR]: "" }}
          role="status"
          onClick={() => setMeldung(null)}
          style={{
            position: "fixed",
            bottom: 84,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: EBENE + 3,
            background: T.text,
            color: T.flaeche,
            padding: "8px 14px",
            borderRadius: 999,
            font: `500 13px/1.4 ${T.schrift}`,
            cursor: "pointer",
            maxWidth: "min(90vw, 420px)",
          }}
        >
          {meldung}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const knopfStil: React.CSSProperties = {
  font: `500 13px/1 ${T.schrift}`,
  padding: "7px 11px",
  borderRadius: 7,
  border: `1px solid ${T.kante}`,
  background: T.flaeche,
  color: T.text,
  cursor: "pointer",
};

const kleinStil: React.CSSProperties = {
  font: `400 11px/1.3 ${T.schrift}`,
  color: T.leise,
  margin: 0,
};

function Leiste(props: {
  modus: Modus;
  setModus: (m: Modus) => void;
  farbe: KundenFarbe;
  setFarbe: (f: KundenFarbe) => void;
  zeigeErledigte: boolean;
  setZeigeErledigte: (b: boolean) => void;
  zeigePins: boolean;
  setZeigePins: (b: boolean) => void;
  zeigeStriche: boolean;
  setZeigeStriche: (b: boolean) => void;
  offeneAnzahl: number;
  listeAuf: boolean;
  setListeAuf: (b: boolean) => void;
  onExport: () => void;
}) {
  // Gemerkt, weil die Leiste im Alltag stört und im Termin gebraucht wird —
  // beides soll man einmal einstellen, nicht auf jeder Seite.
  const [eingeklappt, setEingeklappt] = useLocalStorageState("gcf-leiste-eingeklappt", false);

  const modi: { wert: Modus; label: string; hinweis: string }[] = [
    { wert: "ansehen", label: "Ansehen", hinweis: "Seite normal bedienen" },
    { wert: "kommentar", label: "Kommentieren", hinweis: "Irgendwohin klicken und schreiben" },
    { wert: "zeichnen", label: "Einkreisen", hinweis: "Mit gedrückter Maus einen Bereich einkreisen" },
  ];

  // ⚠️ Landmark AUSSEN, Werkzeugleiste INNEN (Katalognote, Entscheidung 4).
  return (
    <aside
      {...{ [OVERLAY_ATTR]: "" }}
      aria-label="Anmerkungen"
      // Ab 768 px bleibt rechts Platz für den Knopf der KI-Hilfe (styles.css).
      className="gcf-leiste"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: EBENE + 2,
        minWidth: 0,
      }}
    >
      <div
        role="toolbar"
        aria-label="Werkzeuge für Anmerkungen"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          background: T.leiste,
          border: `1px solid ${T.kante}`,
          borderRadius: 12,
          padding: 8,
          boxShadow: "0 6px 24px rgba(0,0,0,.18)",
        }}
      >
        {eingeklappt ? (
          <button type="button" style={knopfStil} onClick={() => setEingeklappt(false)}>
            ✎ Anmerkungen · {props.offeneAnzahl} offen
          </button>
        ) : (
          <>
            <div role="radiogroup" aria-label="Werkzeug" style={{ display: "flex", gap: 4 }}>
              {modi.map((m) => (
                <button
                  key={m.wert}
                  type="button"
                  role="radio"
                  aria-checked={props.modus === m.wert}
                  title={m.hinweis}
                  onClick={() => props.setModus(m.wert)}
                  style={{
                    ...knopfStil,
                    background: props.modus === m.wert ? T.primaer : T.flaeche,
                    color: props.modus === m.wert ? T.primaerText : T.text,
                    fontWeight: props.modus === m.wert ? 600 : 500,
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div
              role="radiogroup"
              aria-label="Farbe"
              style={{ display: "flex", gap: 3, paddingLeft: 6, borderLeft: `1px solid ${T.kante}` }}
            >
              {KUNDEN_FARBEN.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={props.farbe === f}
                  aria-label={FARBNAME[f]}
                  title={f === "rot" ? "Rot: muss geändert werden" : "Grün: alles andere"}
                  onClick={() => props.setFarbe(f)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: FARBWERT[f],
                    border: props.farbe === f ? `3px solid ${T.text}` : `1px solid ${T.kante}`,
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>

            <div style={{ display: "flex", gap: 4, paddingLeft: 6, borderLeft: `1px solid ${T.kante}` }}>
              {(
                [
                  ["Punkte", props.zeigePins, props.setZeigePins],
                  ["Kreise", props.zeigeStriche, props.setZeigeStriche],
                ] as const
              ).map(([label, an, setzen]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={an}
                  title={an ? `${label} ausblenden` : `${label} einblenden`}
                  onClick={() => setzen(!an)}
                  style={{
                    ...knopfStil,
                    opacity: an ? 1 : 0.6,
                    textDecoration: an ? "none" : "line-through",
                    borderStyle: an ? "solid" : "dashed",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              style={knopfStil}
              aria-pressed={props.listeAuf}
              onClick={() => props.setListeAuf(!props.listeAuf)}
            >
              Liste · {props.offeneAnzahl} offen
            </button>

            <label
              style={{
                font: `500 12px/1 ${T.schrift}`,
                color: T.leise,
                display: "flex",
                alignItems: "center",
                gap: 5,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={props.zeigeErledigte}
                onChange={(e) => props.setZeigeErledigte(e.target.checked)}
              />
              Erledigte
            </label>

            <button type="button" style={knopfStil} onClick={props.onExport} title="Alle Seiten als Markdown">
              Export
            </button>

            <button
              type="button"
              style={{ ...knopfStil, border: "none", background: "transparent", padding: 6 }}
              onClick={() => {
                props.setModus("ansehen");
                setEingeklappt(true);
              }}
              aria-label="Leiste einklappen"
            >
              ✕
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

/** Das Textfeld für einen neuen Kommentar, direkt an der geklickten Stelle. */
function EntwurfsFeld(props: {
  entwurf: Entwurf;
  farbe: KundenFarbe;
  laeuft: boolean;
  onAbbruch: () => void;
  onSpeichern: (text: string, name: string) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState(gespeicherterName);
  const nameFehlt = !gespeicherterName();
  const feldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    feldRef.current?.focus();
  }, []);

  // Am Rand kippt das Feld nach innen, statt aus dem Fenster zu laufen.
  const breite = 290;
  const links = Math.min(Math.max(props.entwurf.x - 10, 12), window.innerWidth - breite - 12);
  const obenStatt = props.entwurf.y + 240 > window.innerHeight;
  const darf = Boolean(text.trim() || props.entwurf.zug);

  return (
    <aside
      {...{ [OVERLAY_ATTR]: "" }}
      role="dialog"
      aria-label="Neue Anmerkung"
      style={{
        position: "fixed",
        left: links,
        top: obenStatt ? undefined : props.entwurf.y + 14,
        bottom: obenStatt ? window.innerHeight - props.entwurf.y + 14 : undefined,
        width: breite,
        zIndex: EBENE + 3,
        background: T.flaeche,
        color: T.text,
        border: `1px solid ${T.kante}`,
        borderTop: `3px solid ${FARBWERT[props.farbe]}`,
        borderRadius: 10,
        padding: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,.2)",
      }}
    >
      <p style={{ ...kleinStil, fontWeight: 600, marginBottom: 6 }}>
        {props.entwurf.zug ? "Eingekreist · " : ""}
        {props.entwurf.anchor_label}
      </p>
      <label htmlFor="anmerkung-text" className="gcf-sr">
        Was fällt an dieser Stelle auf?
      </label>
      <textarea
        id="anmerkung-text"
        ref={feldRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={props.entwurf.zug ? "Was ist mit diesem Bereich?" : "Was fällt hier auf?"}
        rows={3}
        maxLength={4000}
        onKeyDown={(e) => {
          // Enter speichert, Umschalt+Enter macht einen Absatz.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (darf) void props.onSpeichern(text.trim(), name);
          }
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          font: `400 14px/1.45 ${T.schrift}`,
          color: T.text,
          background: T.grund,
          padding: 8,
          border: `1px solid ${T.kante}`,
          borderRadius: 6,
          resize: "vertical",
        }}
      />
      {nameFehlt && (
        <input
          aria-label="Ihr Name (optional)"
          placeholder="Ihr Name (optional)"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 6,
            font: `400 13px/1.4 ${T.schrift}`,
            color: T.text,
            background: T.grund,
            padding: "6px 8px",
            border: `1px solid ${T.kante}`,
            borderRadius: 6,
          }}
        />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        <button type="button" style={knopfStil} onClick={props.onAbbruch}>
          {props.entwurf.zug ? "Verwerfen" : "Abbrechen"}
        </button>
        <button
          type="button"
          disabled={!darf || props.laeuft}
          onClick={() => void props.onSpeichern(text.trim(), name)}
          style={{
            ...knopfStil,
            background: T.primaer,
            color: T.primaerText,
            border: "none",
            fontWeight: 600,
            opacity: darf ? 1 : 0.5,
            cursor: darf ? "pointer" : "not-allowed",
          }}
        >
          {props.laeuft ? "Speichert…" : props.entwurf.zug && !text.trim() ? "Nur einkreisen" : "Speichern"}
        </button>
      </div>
    </aside>
  );
}

function zeit(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Was an einer bestehenden Marke hängt: Text, Antworten, Haken, Löschen. */
function NotizFenster(props: {
  notiz: Anmerkung;
  nummer: number;
  laeuft: boolean;
  onSchliessen: () => void;
  onAbhaken: () => void;
  onLoeschen: () => void;
  onAntworten: (text: string) => Promise<boolean>;
}) {
  const { notiz } = props;
  const [entwurf, setEntwurf] = useState("");
  const gefunden = Boolean(findeAnker(notiz.anchor_selector)) || notiz.fallback.length > 0;

  const abschicken = async () => {
    if (!entwurf.trim()) return;
    if (await props.onAntworten(entwurf.trim())) setEntwurf("");
  };

  return (
    <aside
      {...{ [OVERLAY_ATTR]: "", "data-anmerkung-fenster": "" }}
      role="dialog"
      aria-label={`${wer(notiz)}${props.nummer ? ` ${props.nummer}` : ""}`}
      style={{
        // Position aus der rAF-Schleife: `top/left: 0` plus `transform`.
        position: "fixed",
        top: 0,
        left: 0,
        width: "min(340px, calc(100vw - 32px))",
        maxHeight: "calc(100vh - 110px)",
        overflowY: "auto",
        zIndex: EBENE + 3,
        background: T.flaeche,
        color: T.text,
        border: `1px solid ${T.kante}`,
        borderTop: `3px solid ${FARBWERT[notiz.color]}`,
        borderRadius: 10,
        padding: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,.2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <p style={{ ...kleinStil, fontWeight: 600 }}>
          <span style={{ color: notiz.from_agency ? T.text : T.leise }}>
            {wer(notiz)}
          </span>{" "}
          · {notiz.anchor_label}
        </p>
        <button
          type="button"
          onClick={props.onSchliessen}
          aria-label="Schließen"
          style={{ ...knopfStil, border: "none", background: "transparent", padding: 2 }}
        >
          ✕
        </button>
      </div>

      {!gefunden && (
        <p style={{ ...kleinStil, marginTop: 6 }}>
          Stelle auf dieser Fassung der Seite nicht gefunden — die Anmerkung gilt trotzdem.
        </p>
      )}

      <p
        style={{
          font: `400 14px/1.5 ${T.schrift}`,
          margin: "8px 0 4px",
          whiteSpace: "pre-wrap",
          textDecoration: notiz.done ? "line-through" : "none",
        }}
      >
        {notiz.body ?? <em style={{ color: T.leise }}>Ohne Text — nur eingekreist.</em>}
      </p>
      <p style={{ ...kleinStil, marginBottom: 12 }}>{zeit(notiz.created_at)}</p>

      {/* Der Rückkanal. Eine Anmerkung ist der Anfang eines Gesprächs. */}
      {notiz.replies?.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: "0 0 10px",
            padding: "0 0 0 10px",
            borderLeft: `2px solid ${T.kante}`,
            display: "grid",
            gap: 8,
          }}
        >
          {notiz.replies.map((a) => (
            <li key={a.id}>
              <p style={{ font: `400 13px/1.45 ${T.schrift}`, margin: 0, whiteSpace: "pre-wrap" }}>{a.body}</p>
              <span style={kleinStil}>
                {a.from_agency ? "GrowCore" : (a.author_label ?? "Gast")} · {zeit(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor={`antwort-${notiz.id}`} className="gcf-sr">
        Antwort auf diese Anmerkung
      </label>
      <textarea
        id={`antwort-${notiz.id}`}
        value={entwurf}
        onChange={(e) => setEntwurf(e.target.value)}
        placeholder={notiz.kind === "question" ? "Ihre Antwort…" : "Antworten…"}
        rows={2}
        maxLength={4000}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void abschicken();
          }
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          font: `400 13px/1.45 ${T.schrift}`,
          color: T.text,
          background: T.grund,
          padding: 7,
          border: `1px solid ${T.kante}`,
          borderRadius: 6,
          resize: "vertical",
        }}
      />
      {entwurf.trim() && (
        <button
          type="button"
          disabled={props.laeuft}
          onClick={() => void abschicken()}
          style={{
            ...knopfStil,
            width: "100%",
            marginTop: 6,
            background: T.primaer,
            color: T.primaerText,
            border: "none",
            fontWeight: 600,
          }}
        >
          {props.laeuft ? "Sendet…" : "Antwort speichern"}
        </button>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: `1px solid ${T.kante}`, paddingTop: 10 }}>
        <button
          type="button"
          disabled={props.laeuft}
          onClick={props.onAbhaken}
          style={{
            ...knopfStil,
            flex: 1,
            background: notiz.done ? T.flaeche : T.primaer,
            color: notiz.done ? T.text : T.primaerText,
            border: notiz.done ? `1px solid ${T.kante}` : "none",
            fontWeight: 600,
          }}
        >
          {notiz.done ? "Wieder öffnen" : "Erledigt"}
        </button>
        {/* Löschen nur, was man selbst geschrieben hat — der Eingang prüft es ein zweites Mal. */}
        {notiz.eigen && (
          <button
            type="button"
            disabled={props.laeuft}
            onClick={props.onLoeschen}
            style={{ ...knopfStil, color: T.gefahr }}
          >
            Löschen
          </button>
        )}
      </div>
    </aside>
  );
}

/** Alle Anmerkungen dieser Seite auf einen Blick. */
function SeitenListe(props: {
  notizen: Anmerkung[];
  nummerVon: (n: Anmerkung) => number;
  onSchliessen: () => void;
  onSpringen: (n: Anmerkung) => void;
  onAbhaken: (n: Anmerkung) => void;
}) {
  return (
    <aside
      {...{ [OVERLAY_ATTR]: "" }}
      aria-label="Anmerkungen dieser Seite"
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        bottom: 78,
        width: "min(340px, calc(100vw - 32px))",
        zIndex: EBENE + 2,
        background: T.leiste,
        color: T.text,
        border: `1px solid ${T.kante}`,
        borderRadius: 12,
        padding: 12,
        overflowY: "auto",
        boxShadow: "0 8px 30px rgba(0,0,0,.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ font: `600 13px/1.3 ${T.schrift}`, margin: 0 }}>Diese Seite · {props.notizen.length}</h2>
        <button
          type="button"
          onClick={props.onSchliessen}
          aria-label="Liste schließen"
          style={{ ...knopfStil, border: "none", background: "transparent", padding: 2 }}
        >
          ✕
        </button>
      </div>

      {props.notizen.length === 0 && (
        <p style={{ font: `400 13px/1.5 ${T.schrift}`, color: T.leise, marginTop: 10 }}>
          Noch nichts angemerkt. &bdquo;Kommentieren&ldquo; wählen und irgendwohin klicken.
        </p>
      )}

      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 6 }}>
        {props.notizen.map((n) => {
          const gefunden = Boolean(findeAnker(n.anchor_selector)) || n.fallback.length > 0;
          return (
            <li
              key={n.id}
              style={{
                background: T.flaeche,
                border: `1px solid ${T.kante}`,
                borderLeft: `3px solid ${FARBWERT[n.color]}`,
                borderRadius: 6,
                padding: 8,
                opacity: n.done ? 0.6 : 1,
              }}
            >
              <p style={{ ...kleinStil, fontWeight: 600, marginBottom: 2 }}>{wer(n)}</p>
              <button
                type="button"
                onClick={() => props.onSpringen(n)}
                style={{
                  font: `400 13px/1.45 ${T.schrift}`,
                  color: T.text,
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  textDecoration: n.done ? "line-through" : "none",
                }}
              >
                <strong style={{ color: T.leise, fontWeight: 600 }}>
                  {n.shape === "pin" ? `${props.nummerVon(n) || "–"}. ` : "✎ "}
                </strong>
                {n.body ?? <em style={{ color: T.leise }}>nur eingekreist</em>}
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                <span style={kleinStil}>
                  {n.anchor_label}
                  {gefunden ? "" : " · Stelle nicht gefunden"}
                  {n.replies.length > 0 ? ` · ${n.replies.length} Antwort${n.replies.length === 1 ? "" : "en"}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => props.onAbhaken(n)}
                  style={{
                    ...kleinStil,
                    fontWeight: 600,
                    color: n.done ? T.leise : T.primaer,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {n.done ? "wieder öffnen" : "erledigt"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
