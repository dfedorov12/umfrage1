/* Prüft die ASCII-Absicherung der Nutzlast:  node tests/test-ascii.mjs
   Hintergrund: Power Automate liest den Rumpf einer text/plain-Anfrage nicht
   zuverlässig als UTF-8. Deshalb schickt js/api.js alles jenseits von ASCII als
   \uXXXX. Dieser Test stellt sicher, dass dabei (a) wirklich nur ASCII übrig
   bleibt und (b) beim Gegenparsen exakt dieselben Daten herauskommen.        */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = readFileSync(join(hier, "..", "js", "api.js"), "utf-8");

// Die Funktion aus der ausgelieferten Datei holen, statt sie hier nachzubauen –
// sonst prüft der Test eine Kopie und nicht den echten Code.
const treffer = quelle.match(/const nurAscii = ([\s\S]*?);\r?\n/);
if (!treffer) { console.log("FEHL: nurAscii in js/api.js nicht gefunden"); process.exit(1); }
const nurAscii = eval("(" + treffer[1] + ")");

let fehler = 0;
const pruefe = (name, ist, soll) => {
  if (JSON.stringify(ist) === JSON.stringify(soll)) { console.log(`  ok   ${name}`); return; }
  console.log(`  FEHL ${name}\n       ist:  ${JSON.stringify(ist)}\n       soll: ${JSON.stringify(soll)}`);
  fehler++;
};

// Echte Inhalte aus dem Fragebogen und typische Freitextantworten
const nutzlast = {
  aktion: "antwort",
  umfrage: "newsletter-2026",
  antworten: {
    standort: "Schmiedeberg Guss",
    bereich: "In der Produktion / Werkstatt / Gießerei",
    themen: ["Nachhaltigkeit & Umwelt (\"Grüner Guss\")", "Termine, Jubiläen, offene Stellen"],
    themen_sonstiges: "Schichtplanung für die Gießerei",
    stoert: "Zu viele Fachbegriffe – und „Anführungszeichen“ sowie Größenangaben in m³.",
    gefallen: 4
  },
  standort: "Schmiedeberg Guss",
  bereich: "In der Produktion / Werkstatt / Gießerei",
  kontakt: "Jörg Müller, Gießerei",
  meta: { dauerSek: 214, hp: "", sprache: "de-DE" }
};

const draht = nurAscii(JSON.stringify(nutzlast));

pruefe("auf der Leitung nur ASCII", /^[\x00-\x7F]*$/.test(draht), true);
pruefe("kein ß, ä, ö, ü, – oder „ mehr im Rumpf", /[ßäöüÄÖÜ–„“³&]/.test(draht.replace(/&/g, "")), false);
pruefe("Rückweg identisch", JSON.parse(draht), nutzlast);

const zurueck = JSON.parse(draht);
pruefe("Gießerei überlebt", zurueck.bereich, "In der Produktion / Werkstatt / Gießerei");
pruefe("Jubiläen überlebt", zurueck.antworten.themen[1], "Termine, Jubiläen, offene Stellen");
pruefe("Anführungszeichen überleben", zurueck.antworten.stoert.includes("„Anführungszeichen“"), true);
pruefe("Name mit Umlaut überlebt", zurueck.kontakt, "Jörg Müller, Gießerei");

// Emoji sind zwei UTF-16-Einheiten – auch die müssen unverändert zurückkommen
const mitEmoji = { text: "Daumen hoch 👍 für die Gießerei" };
pruefe("Emoji überlebt", JSON.parse(nurAscii(JSON.stringify(mitEmoji))).text, mitEmoji.text);

console.log(fehler ? `\n${fehler} Test(s) fehlgeschlagen.` : "\nAlle Tests bestanden.");
process.exit(fehler ? 1 : 0);
