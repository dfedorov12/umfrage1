/* Prüft den eigenen QR-Erzeuger:  node tests/test-qr.mjs

   Wie dieser Test entstanden ist – das gehört dazu, sonst wirkt er wie eine
   Selbstbestätigung:

   1. Zuerst wurde jedes Symbol Modul für Modul gegen die Bibliothek „segno"
      verglichen. Dabei kam ein Fehler heraus, der jeden Code unlesbar machte:
      die 15 Bit der Formatinformation standen spiegelverkehrt im Symbol.
   2. Danach wurden alle Symbole mit einem echten Decoder gelesen (OpenCV,
      siehe tests/qr-lesetest.py) – neun von neun korrekt. Das ist die
      Prüfung, auf die es ankommt: Ein QR-Code wird gescannt oder nicht.
   3. Die so geprüften Symbole liegen als Sollwerte in qr-referenz.json.
      Dieser Test hält sie fest und schlägt an, sobald sich am Erzeuger etwas
      ändert – ohne Python, ohne Netz, in einer Sekunde.

   Bleibt der Unterschied zu segno bei der Auffüllung nach dem Endezeichen
   (segno setzt dort ein Null-Byte mehr). Beide Varianten sind gültig, weil
   Decoder alles nach dem Endezeichen ignorieren – nachgewiesen dadurch, dass
   beide Fassungen gelesen werden.                                            */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const hier = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const QR = require(join(hier, "..", "js", "qr.js"));
const soll = JSON.parse(readFileSync(join(hier, "qr-referenz.json"), "utf-8"));

let fehler = 0;
const kurz = t => (t.length > 32 ? t.slice(0, 29) + "…" : t).padEnd(33);
const melde = (ok, text) => { console.log(`  ${ok ? "ok  " : "FEHL"} ${text}`); if (!ok) fehler++; };

for (const f of soll.faelle) {
  const q = QR.erzeuge(f.text, { ecc: f.ecc });
  const mangel = [];
  if (q.version !== f.version) mangel.push(`Version ${q.version} statt ${f.version}`);
  if (q.size !== f.groesse)    mangel.push(`Größe ${q.size} statt ${f.groesse}`);
  if (q.maske !== f.maske)     mangel.push(`Maske ${q.maske} statt ${f.maske}`);
  if (!mangel.length) {
    const meins = q.matrix.map(z => z.join(""));
    let ab = 0, erste = null;
    for (let y = 0; y < f.groesse; y++) {
      for (let x = 0; x < f.groesse; x++) {
        if (meins[y][x] !== f.matrix[y][x]) { ab++; if (!erste) erste = `Zeile ${y}, Spalte ${x}`; }
      }
    }
    if (ab) mangel.push(`${ab} Module abweichend (erste: ${erste})`);
  }
  melde(!mangel.length, `${f.ecc} ${kurz(f.text)} ${mangel.length ? mangel.join(" · ")
    : `V${f.version} Maske ${f.maske} ${f.groesse}×${f.groesse}`}`);
}

/* Aufbau-Prüfungen, die unabhängig von den Sollwerten gelten müssen. */

const q = QR.erzeuge("https://umfrage.dihag.de/?u=newsletter-2026", { ecc: "M" });
const m = q.matrix, s = q.size;

const sucherOk = ([oy, ox]) => {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const rand = x === 0 || x === 6 || y === 0 || y === 6;
      const kern = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (m[oy + y][ox + x] !== (rand || kern ? 1 : 0)) return false;
    }
  }
  return true;
};
melde(sucherOk([0, 0]) && sucherOk([0, s - 7]) && sucherOk([s - 7, 0]), "drei Suchmuster korrekt");

let taktOk = true;
for (let i = 8; i < s - 8; i++) {
  if (m[6][i] !== (i % 2 === 0 ? 1 : 0)) taktOk = false;
  if (m[i][6] !== (i % 2 === 0 ? 1 : 0)) taktOk = false;
}
melde(taktOk, "Taktmuster durchgehend abwechselnd");
melde(m[s - 8][8] === 1, "dunkles Modul gesetzt");

const dunkel = m.flat().reduce((a, b) => a + b, 0);
const anteil = (dunkel / (s * s)) * 100;
melde(anteil > 35 && anteil < 65, `Schwarzanteil ausgewogen (${anteil.toFixed(1)} %)`);

melde(QR.erzeuge("A", { ecc: "M" }).size === 21, "kürzester Text ergibt Version 1 (21×21)");

let zuLang = false;
try { QR.erzeuge("w".repeat(400), { ecc: "M" }); } catch { zuLang = true; }
melde(zuLang, "zu langer Text wird mit klarer Meldung abgewiesen");

/* SVG: Ruhezone, weißer Grund, keine fremde Quelle. */
const bild = QR.svg("https://umfrage.dihag.de/?u=newsletter-2026", { rand: 4 });
melde(new RegExp(`viewBox="0 0 ${s + 8} ${s + 8}"`).test(bild), "SVG hat die vorgeschriebene Ruhezone");
melde(bild.includes('fill="#fff"'), "SVG hat weißen Grund");
melde(!/https?:\/\/(?!www\.w3\.org)/.test(bild), "SVG bindet nichts Fremdes ein");

console.log(fehler ? `\n${fehler} Test(s) fehlgeschlagen.` : "\nAlle Tests bestanden.");
process.exit(fehler ? 1 : 0);
