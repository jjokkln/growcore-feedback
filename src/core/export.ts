/** Anmerkungen als Markdown — die Arbeitsliste nach einem Durchgang. */
import { ART_LABEL } from "./konstanten.ts";
import type { Anmerkung } from "./typen.ts";

function datum(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export function alsMarkdown(notizen: Anmerkung[], titel = "Anmerkungen"): string {
  const ohneRundgang = notizen;
  const offen = ohneRundgang.filter((n) => !n.done).length;
  const zeilen: string[] = [
    `# ${titel}`,
    "",
    `Stand: ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · ${offen} offen, ${ohneRundgang.length - offen} erledigt`,
    "",
  ];

  const seiten = [...new Set(ohneRundgang.map((n) => n.path))].sort();

  for (const pfad of seiten) {
    zeilen.push(`## ${pfad}`, "");
    for (const n of ohneRundgang.filter((x) => x.path === pfad)) {
      const haken = n.done ? "x" : " ";
      const wortlaut =
        n.body?.trim().replace(/\n/g, " ") ||
        (n.shape === "stroke" ? "_(nur eingekreist — ohne Text)_" : "");
      const wer = n.from_agency ? ART_LABEL[n.kind] : `${ART_LABEL[n.kind]} von ${n.author_label ?? "Gast"}`;
      zeilen.push(`- [${haken}] **${n.anchor_label}** · ${wer} — ${wortlaut}  `);
      zeilen.push(
        `      _${datum(n.created_at)}${n.viewport_width ? `, ${n.viewport_width} px breit` : ""} · id ${n.id}_`,
      );
      // Die Antworten gehören unter ihre Anmerkung: Was entschieden wurde,
      // liest man dort, wo die Frage steht.
      for (const a of n.replies ?? []) {
        zeilen.push(`    - ↳ ${a.from_agency ? "GrowCore" : (a.author_label ?? "Gast")}: ${a.body.replace(/\n/g, " ")}  `);
        zeilen.push(`          _${datum(a.created_at)}_`);
      }
    }
    zeilen.push("");
  }

  if (ohneRundgang.length === 0) zeilen.push("_Keine Anmerkungen._", "");
  return zeilen.join("\n");
}
