"use client";

import type { ZielKatalog } from "../core/ziele.ts";
import { KiHilfe } from "./ki-hilfe.tsx";
import { AnmerkungsOverlay, type OverlayModus } from "./overlay.tsx";

/** Beide Teile des Werkzeugs. Im Layout über `FeedbackWerkzeug` (next) einbinden. */
export function GrowcoreFeedback(props: {
  projekt: string;
  kiHilfe: boolean;
  ziele: ZielKatalog;
  vorschlaege: string[];
  modus?: OverlayModus;
}) {
  return (
    <>
      <AnmerkungsOverlay projekt={props.projekt} modus={props.modus} />
      {props.kiHilfe && <KiHilfe projekt={props.projekt} ziele={props.ziele} vorschlaege={props.vorschlaege} />}
    </>
  );
}
