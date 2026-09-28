"use client";

import { useEffect } from "react";

import { knopfAnmelden, useEinstieg, useLeisteOffen } from "./einstieg.ts";
import { Frage } from "./icons.tsx";

/**
 * Der Einstieg ins Anmerkungs-Werkzeug: ein kleines `?` in der Navigation.
 *
 * Vorbild ist Aghasadeh-Garage: klein, an derselben Stelle auf jeder Seite,
 * und nichts schwebt über dem Inhalt, solange niemand anmerken will. Erst ein
 * Klick holt die Leiste; ein zweiter (oder „Einklappen" in der Leiste) räumt
 * sie wieder weg.
 *
 * `className` übernimmt den Stil der Navigation des Projekts, z. B. die
 * Icon-Variante des eigenen Buttons. Ohne `className` gilt `.gcf-frage-standard`.
 *
 * ⚠️ Der Knopf muss auf jeder Breite sichtbar sein — also NICHT in ein
 * Handy-Menü, das erst aufgeklappt werden muss. Ist kein Knopf eingebunden,
 * erscheint unten links der Stift als Notnagel.
 */
export function AnmerkungsKnopf({ className }: { className?: string }) {
  const [offen, setOffen] = useLeisteOffen();
  const { offeneAnzahl } = useEinstieg();

  useEffect(() => knopfAnmelden(), []);

  const zahl = offeneAnzahl > 99 ? "99+" : String(offeneAnzahl);
  const beschriftung = offen
    ? "Anmerkungen schließen"
    : `Anmerkungen öffnen${offeneAnzahl > 0 ? `, ${offeneAnzahl} offen auf dieser Seite` : ""}`;

  return (
    <button
      type="button"
      className={`gcf-frage ${className ?? "gcf-frage-standard"}`}
      aria-expanded={offen}
      aria-label={beschriftung}
      title={beschriftung}
      onClick={() => setOffen(!offen)}
    >
      <Frage size={16} />
      {offeneAnzahl > 0 && (
        <span aria-hidden className="gcf-frage-zahl">
          {zahl}
        </span>
      )}
    </button>
  );
}
