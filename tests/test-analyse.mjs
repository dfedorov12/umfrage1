/* Prüft die Rechenkerne ohne Browser:  node tests/test-analyse.mjs
   (js/analyse.js und js/fragebogen.js exportieren sich am Dateiende, wenn
   „module“ existiert – im Browser passiert das nicht.)                     */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const hier = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ANALYSE    = require(join(hier, "..", "js", "analyse.js"));
const FRAGEBOGEN = require(join(hier, "..", "js", "fragebogen.js"));
const vorlage    = JSON.parse(readFileSync(join(hier, "..", "umfragen", "newsletter-2026.json"), "utf-8"));

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const a = JSON.stringify(ist), b = JSON.stringify(soll);
  if (a === b) { console.log(`  ok   ${name}`); return; }
  console.log(`  FEHL ${name}\n       ist:  ${a}\n       soll: ${b}`);
  fehler++;
};

/* ── Testdaten ──────────────────────────────────────────────────── */

const def = {
  id: "t", titel: "Test",
  fragen: [
    { id: "ort",   typ: "dropdown", optionen: ["A", "B"], auswertung: "standort" },
    { id: "ber",   typ: "radio",    optionen: ["Produktion", "Büro"], auswertung: "bereich" },
    { id: "note",  typ: "skala",    min: 1, max: 5, pflicht: true },
    { id: "themen", typ: "checkbox", optionen: ["X", "Y"], sonstiges: true },
    { id: "frei",  typ: "text" },
    { id: "kont",  typ: "text", kontakt: true }
  ]
};
const zeile = (a, standort, bereich) => ({
  antworten: a, standort, bereich, dauerSek: 120, eingereicht: "2026-08-10T08:00:00Z"
});
const rows = [
  zeile({ note: 5, themen: ["X"], frei: "toll" }, "A", "Büro"),
  zeile({ note: 3, themen: ["X", "Y"] }, "A", "Produktion"),
  zeile({ note: 1, themen: ["Y", "Sonstiges"], themen_sonstiges: "Z", frei: "geht so" }, "B", "Produktion"),
  zeile({ }, "B", "Produktion")   // hat nichts beantwortet
];

/* ── Skala ──────────────────────────────────────────────────────── */

console.log("Skala");
const skala = ANALYSE.frage(def.fragen[2], rows);
pruefe("Anzahl ohne leere Antwort", skala.n, 3);
pruefe("Durchschnitt (5+3+1)/3", skala.schnitt, 3);
pruefe("Verteilung 1er", skala.verteilung[0], { label: "1", anzahl: 1, anteil: 33.3 });

/* ── Mehrfachauswahl ────────────────────────────────────────────── */

console.log("Mehrfachauswahl");
const cb = ANALYSE.frage(def.fragen[3], rows);
pruefe("Antwortende", cb.n, 3);
pruefe("Nennungen", cb.nennungen, 5);
pruefe("X: 2 von 3 Antwortenden", cb.optionen[0], { label: "X", anzahl: 2, anteil: 66.7 });
pruefe("Sonstiges-Freitext", cb.freitexte, ["Z"]);

/* ── Freitext ───────────────────────────────────────────────────── */

console.log("Freitext");
const txt = ANALYSE.frage(def.fragen[4], rows);
pruefe("nur nicht-leere", txt.n, 2);
pruefe("Herkunft mitgeliefert", txt.texte[0].bereich, "Büro");

/* ── Vergleich Produktion / Büro ────────────────────────────────── */

console.log("Vergleich");
const v = ANALYSE.vergleich(def, rows, "bereich");
pruefe("Gruppen", v.gruppen, ["Büro", "Produktion"]);
pruefe("Büro-Schnitt", v.zeilen[0].werte[0], { gruppe: "Büro", schnitt: 5, n: 1 });
pruefe("Produktion-Schnitt (3+1)/2", v.zeilen[0].werte[1], { gruppe: "Produktion", schnitt: 2, n: 2 });

/* ── CSV ────────────────────────────────────────────────────────── */

console.log("CSV");
const csv = ANALYSE.csv(def, rows);
const kopf = csv.split("\r\n")[0];
pruefe("Kontaktfrage NICHT im Export", kopf.includes("kont"), false);
pruefe("Spaltenzahl 4 + 5 Fragen", kopf.split(";").length, 9);
pruefe("Mehrfachwerte in einer Zelle", csv.split("\r\n")[2].includes('"X; Y"'), true);
pruefe("BOM für Excel", csv.charCodeAt(0), 0xFEFF);

/* ── Fragebogen: Schritte und Trennung der Kontaktangabe ────────── */

console.log("Fragebogen");
pruefe("ohne Teilung: 1 Schritt", FRAGEBOGEN.schritte(def, 0).length, 1);
pruefe("mit Teilung à 2: 3 Schritte", FRAGEBOGEN.schritte(def, 2).length, 3);
pruefe("Vorlage: 15 Fragen", vorlage.fragen.filter(f => f.typ !== "abschnitt").length, 15);
pruefe("Vorlage: 5 Schritte à 4", FRAGEBOGEN.schritte(vorlage, 4).length, 5);
pruefe("Pflichtfragen erkannt",
  FRAGEBOGEN.fehlend(vorlage.fragen, {}), ["gefallen", "verstaendlich", "angesprochen"]);

const geteilt = FRAGEBOGEN.aufteilen(def,
  { ort: "A", note: 4, kont: "max@dihag.com", themen: ["X"], themen_sonstiges: "" });
pruefe("Kontakt getrennt", geteilt.kontakt, "max@dihag.com");
pruefe("Kontakt nicht in den Antworten", "kont" in geteilt.antworten, false);
pruefe("Kennzahlen", FRAGEBOGEN.kennzahlen(def, { ort: "A", ber: "Büro" }),
  { standort: "A", bereich: "Büro" });

console.log(fehler ? `\n${fehler} Test(s) fehlgeschlagen.` : "\nAlle Tests bestanden.");
process.exit(fehler ? 1 : 0);
