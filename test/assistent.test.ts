import assert from "node:assert/strict";
import { test } from "node:test";

import { leseEreignis } from "../src/core/assistent.ts";

test("Ereignisse: Text, Werkzeug, Ende werden gelesen", () => {
  assert.deepEqual(leseEreignis('{"typ":"text","text":"Hallo"}'), { typ: "text", text: "Hallo" });
  assert.deepEqual(leseEreignis('{"typ":"werkzeug","name":"projektstand","label":"Projektstand"}'), {
    typ: "werkzeug",
    name: "projektstand",
    label: "Projektstand",
  });
  assert.deepEqual(leseEreignis('{"typ":"ende","text":"x"}'), { typ: "ende", text: "x" });
});

test("Vorschläge: nur vollständige, unbekannte Farbe wird rot, Rest fällt weg", () => {
  assert.deepEqual(
    leseEreignis('{"typ":"vorschlag","werkzeug":"stelle_markieren","eingabe":{"stelle":"s3","notiz":"Bild zu dunkel","farbe":"blau"}}'),
    { typ: "vorschlag", werkzeug: "stelle_markieren", eingabe: { stelle: "s3", notiz: "Bild zu dunkel", farbe: "rot" } },
  );
  assert.equal(leseEreignis('{"typ":"vorschlag","werkzeug":"stelle_markieren","eingabe":{"notiz":"ohne Stelle"}}'), null);
  assert.deepEqual(leseEreignis('{"typ":"vorschlag","werkzeug":"idee_vorschlagen","eingabe":{"titel":"Newsletter"}}'), {
    typ: "vorschlag",
    werkzeug: "idee_vorschlagen",
    eingabe: { titel: "Newsletter" },
  });
  assert.equal(leseEreignis('{"typ":"vorschlag","werkzeug":"loeschen","eingabe":{}}'), null);
  assert.equal(leseEreignis("kein json"), null);
  assert.equal(leseEreignis('{"typ":"unbekannt"}'), null);
});
