"use strict";

/* QR-Code – eigener Erzeuger
   ──────────────────────────
   Erzeugt aus einem Text (hier: dem Teilnahme-Link) ein QR-Symbol als SVG.

   Warum selbst geschrieben und kein fertiger Dienst?
   • Ein Online-Generator würde die Adresse an einen Fremdanbieter schicken und
     wäre im Werk womöglich gesperrt.
   • Eine Bibliothek vom CDN scheidet aus demselben Grund aus wie bei den
     Diagrammen: Die Seite soll ohne fremde Skripte auskommen.
   • Der Aushang muss auch dann noch druckbar sein, wenn in drei Jahren niemand
     mehr weiß, wo der Generator herkam.

   Umfang bewusst begrenzt: Byte-Modus, Fehlerkorrektur L oder M, Versionen 1–10.
   Das reicht für Adressen bis rund 200 Zeichen – ein Teilnahme-Link hat 45.

   Geprüft wird der Erzeuger Modul für Modul gegen die Referenzbibliothek
   „segno" (tests/test-qr.mjs, Vergleichsdaten in tests/qr-referenz.json).      */

const QR = (() => {

  /* ── Rechnen im Galois-Feld GF(256) ───────────────────────────────
     Die Fehlerkorrektur nach Reed-Solomon rechnet nicht mit gewöhnlichen
     Zahlen, sondern in einem endlichen Körper. Multiplizieren wird dort
     zum Addieren von Logarithmen – deshalb die beiden Tabellen.        */

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;      // Generatorpolynom des Feldes
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  /** Generatorpolynom für n Fehlerkorrektur-Codewörter. */
  function generator(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const q = [];
      for (let j = 0; j <= p.length; j++) {
        q[j] = (j < p.length ? p[j] : 0) ^ (j > 0 ? mul(p[j - 1], EXP[i]) : 0);
      }
      p = q;
    }
    return p;
  }

  /** Reed-Solomon-Rest: die eigentlichen Korrekturdaten. */
  function korrektur(daten, n) {
    const gen = generator(n);
    const rest = new Uint8Array(daten.length + n);
    rest.set(daten);
    for (let i = 0; i < daten.length; i++) {
      const f = rest[i];
      if (!f) continue;
      for (let j = 0; j < gen.length; j++) rest[i + j] ^= mul(gen[j], f);
    }
    return rest.slice(daten.length);
  }

  /* ── Tabellen aus der Norm (ISO/IEC 18004) ────────────────────────
     Je Version und Fehlerkorrekturgrad: wie viele Korrektur-Codewörter je
     Block, und wie sich die Daten auf Blöcke verteilen.                */

  const GESAMT = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];   // Codewörter je Version

  //                 [Korrektur je Block, Bloecke1, Daten1, Bloecke2, Daten2]
  const BLOCKPLAN = {
    L: [null,
      [7, 1, 19], [10, 1, 34], [15, 1, 55], [20, 1, 80], [26, 1, 108],
      [18, 2, 68], [20, 2, 78], [24, 2, 97], [30, 2, 116], [18, 2, 68, 2, 69]],
    M: [null,
      [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43],
      [16, 4, 27], [18, 4, 31], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]]
  };

  // Mittelpunkte der Ausrichtungsmuster je Version (ab Version 2)
  const AUSRICHTUNG = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // Restbits nach den Codewörtern (Versionen 2–6: sieben, danach keine)
  const RESTBITS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

  const EC_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

  /* ── Nutzdaten aufbereiten ─────────────────────────────────────── */

  const utf8 = text => new TextEncoder().encode(text);

  /** Kleinste Version, in die der Text passt. */
  function version(bytes, ecc) {
    for (let v = 1; v <= 10; v++) {
      const plan = BLOCKPLAN[ecc][v];
      const datenCodewoerter = GESAMT[v] - plan[0] * (plan[1] + (plan[3] || 0));
      const zaehlBits = v <= 9 ? 8 : 16;
      if (4 + zaehlBits + bytes.length * 8 <= datenCodewoerter * 8) return v;
    }
    throw new Error("Text zu lang für ein QR-Symbol der Versionen 1–10.");
  }

  /** Bitfolge nach Norm: Modus, Länge, Daten, Abschluss, Füllmuster. */
  function bitfolge(bytes, v, ecc) {
    const plan = BLOCKPLAN[ecc][v];
    const datenCodewoerter = GESAMT[v] - plan[0] * (plan[1] + (plan[3] || 0));
    const bits = [];
    const schreibe = (wert, anzahl) => {
      for (let i = anzahl - 1; i >= 0; i--) bits.push((wert >> i) & 1);
    };

    schreibe(0b0100, 4);                       // Byte-Modus
    schreibe(bytes.length, v <= 9 ? 8 : 16);   // Anzahl Zeichen
    for (const b of bytes) schreibe(b, 8);

    const platz = datenCodewoerter * 8;
    schreibe(0, Math.min(4, platz - bits.length));         // Abschlusszeichen
    while (bits.length % 8) bits.push(0);                  // auf volle Bytes
    const woerter = [];
    for (let i = 0; i < bits.length; i += 8) {
      woerter.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    }
    // Füllmuster 236/17 im Wechsel, bis der Platz voll ist
    for (let i = 0; woerter.length < datenCodewoerter; i++) woerter.push(i % 2 ? 0x11 : 0xec);
    return woerter;
  }

  /** Daten- und Korrekturblöcke bilden und verschränken. */
  function codewoerter(daten, v, ecc) {
    const [ecAnzahl, b1, d1, b2 = 0, d2 = 0] = BLOCKPLAN[ecc][v];
    const bloecke = [];
    let p = 0;
    for (let i = 0; i < b1; i++) { bloecke.push(daten.slice(p, p + d1)); p += d1; }
    for (let i = 0; i < b2; i++) { bloecke.push(daten.slice(p, p + d2)); p += d2; }

    const ecBloecke = bloecke.map(b => korrektur(Uint8Array.from(b), ecAnzahl));

    const out = [];
    const maxDaten = Math.max(d1, d2);
    for (let i = 0; i < maxDaten; i++) {
      for (const b of bloecke) if (i < b.length) out.push(b[i]);
    }
    for (let i = 0; i < ecAnzahl; i++) {
      for (const b of ecBloecke) out.push(b[i]);
    }
    return out;
  }

  /* ── Symbol aufbauen ───────────────────────────────────────────── */

  function leeresRaster(size) {
    return { m: Array.from({ length: size }, () => new Int8Array(size).fill(-1)), size };
  }

  function setze(r, x, y, wert) { r.m[y][x] = wert; }
  const frei = (r, x, y) => r.m[y][x] === -1;

  function funktionsmuster(r, v) {
    const s = r.size;

    // Suchmuster in drei Ecken, samt Trennlinie
    for (const [ox, oy] of [[0, 0], [s - 7, 0], [0, s - 7]]) {
      for (let y = -1; y <= 7; y++) {
        for (let x = -1; x <= 7; x++) {
          const px = ox + x, py = oy + y;
          if (px < 0 || py < 0 || px >= s || py >= s) continue;
          const rand = x === 0 || x === 6 || y === 0 || y === 6;
          const kern = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          const innen = x >= 0 && x <= 6 && y >= 0 && y <= 6;
          setze(r, px, py, innen && (rand || kern) ? 1 : 0);
        }
      }
    }

    // Taktmuster
    for (let i = 8; i < s - 8; i++) {
      setze(r, i, 6, i % 2 === 0 ? 1 : 0);
      setze(r, 6, i, i % 2 === 0 ? 1 : 0);
    }

    // Ausrichtungsmuster
    const mitten = AUSRICHTUNG[v];
    for (const cy of mitten) {
      for (const cx of mitten) {
        const eckeOben = (cx <= 8 && cy <= 8);
        const eckeRechts = (cx >= s - 9 && cy <= 8);
        const eckeUnten = (cx <= 8 && cy >= s - 9);
        if (eckeOben || eckeRechts || eckeUnten) continue;
        for (let y = -2; y <= 2; y++) {
          for (let x = -2; x <= 2; x++) {
            const aussen = Math.max(Math.abs(x), Math.abs(y));
            setze(r, cx + x, cy + y, aussen === 1 ? 0 : 1);
          }
        }
      }
    }

    // dunkles Modul und Platz für die Formatangaben
    setze(r, 8, s - 8, 1);
    for (let i = 0; i < 9; i++) {
      if (frei(r, i, 8)) setze(r, i, 8, 0);
      if (frei(r, 8, i)) setze(r, 8, i, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (frei(r, s - 1 - i, 8)) setze(r, s - 1 - i, 8, 0);
      if (frei(r, 8, s - 1 - i)) setze(r, 8, s - 1 - i, 0);
    }

    // Versionsangabe ab Version 7
    if (v >= 7) {
      let rest = v << 12;
      for (let i = 5; i >= 0; i--) {
        if (rest & (1 << (i + 12))) rest ^= 0x1f25 << i;
      }
      const bits = (v << 12) | (rest & 0xfff);
      for (let i = 0; i < 18; i++) {
        const bit = (bits >> i) & 1;
        const a = Math.floor(i / 3), b = i % 3;
        setze(r, a, s - 11 + b, bit);
        setze(r, s - 11 + b, a, bit);
      }
    }
  }

  /** Datenbits im Zickzack von unten rechts nach oben links einfügen. */
  function datenEinfuegen(r, woerter, restbits) {
    const bits = [];
    for (const w of woerter) for (let i = 7; i >= 0; i--) bits.push((w >> i) & 1);
    for (let i = 0; i < restbits; i++) bits.push(0);

    const s = r.size;
    let i = 0, aufwaerts = true;
    for (let rechts = s - 1; rechts > 0; rechts -= 2) {
      if (rechts === 6) rechts--;              // Spalte des Taktmusters überspringen
      for (let k = 0; k < s; k++) {
        const y = aufwaerts ? s - 1 - k : k;
        for (const x of [rechts, rechts - 1]) {
          if (!frei(r, x, y)) continue;
          setze(r, x, y, i < bits.length ? bits[i] : 0);
          i++;
        }
      }
      aufwaerts = !aufwaerts;
    }
  }

  const MASKEN = [
    (y, x) => (y + x) % 2 === 0,
    (y) => y % 2 === 0,
    (y, x) => x % 3 === 0,
    (y, x) => (y + x) % 3 === 0,
    (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
    (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
    (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0
  ];

  /** Bewertung nach den vier Regeln der Norm – je weniger, desto lesbarer. */
  function strafe(m, s) {
    let p = 0;

    // Regel 1: Ketten gleicher Farbe
    for (const zeilenweise of [true, false]) {
      for (let a = 0; a < s; a++) {
        let lauf = 1;
        for (let b = 1; b < s; b++) {
          const jetzt = zeilenweise ? m[a][b] : m[b][a];
          const vorher = zeilenweise ? m[a][b - 1] : m[b - 1][a];
          if (jetzt === vorher) { lauf++; }
          else { if (lauf >= 5) p += lauf - 2; lauf = 1; }
        }
        if (lauf >= 5) p += lauf - 2;
      }
    }

    // Regel 2: gleichfarbige 2×2-Blöcke
    for (let y = 0; y < s - 1; y++) {
      for (let x = 0; x < s - 1; x++) {
        const v = m[y][x];
        if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) p += 3;
      }
    }

    // Regel 3: Muster, das mit dem Suchmuster verwechselbar ist
    const muster1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const muster2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (const zeilenweise of [true, false]) {
      for (let a = 0; a < s; a++) {
        for (let b = 0; b <= s - 11; b++) {
          const passt = (muster) => muster.every((w, k) =>
            (zeilenweise ? m[a][b + k] : m[b + k][a]) === w);
          if (passt(muster1) || passt(muster2)) p += 40;
        }
      }
    }

    // Regel 4: Abweichung vom hälftigen Schwarzanteil
    let dunkel = 0;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) dunkel += m[y][x];
    const anteil = (dunkel * 100) / (s * s);
    p += Math.floor(Math.abs(anteil - 50) / 5) * 10;

    return p;
  }

  function formatEinfuegen(m, s, ecc, maske) {
    const wert = (EC_BITS[ecc] << 3) | maske;
    let rest = wert << 10;
    for (let i = 4; i >= 0; i--) {
      if (rest & (1 << (i + 10))) rest ^= 0x537 << i;
    }
    const bits = ((wert << 10) | (rest & 0x3ff)) ^ 0x5412;

    // Reihenfolge beachten: Die Norm legt das höchstwertige Bit zuerst ab.
    // Mit „(bits >> i)“ statt „(bits >> (14 - i))“ steht die Formatinformation
    // spiegelverkehrt im Symbol – und dann liest KEIN Scanner den Code mehr,
    // egal wie richtig die Daten sind.
    for (let i = 0; i < 15; i++) {
      const bit = (bits >> (14 - i)) & 1;
      // erste Kopie rund um das linke obere Suchmuster
      if (i < 6)        m[8][i] = bit;
      else if (i === 6) m[8][7] = bit;
      else if (i === 7) m[8][8] = bit;
      else if (i === 8) m[7][8] = bit;
      else              m[14 - i][8] = bit;
      // zweite Kopie, damit das Symbol auch bei Beschädigung lesbar bleibt
      if (i < 7) m[s - 1 - i][8] = bit;
      else       m[8][s - 15 + i] = bit;
    }
  }

  /** @returns {{size:number, matrix:number[][], version:number, ecc:string, maske:number}} */
  function erzeuge(text, { ecc = "M", maskeErzwingen = null } = {}) {
    if (!BLOCKPLAN[ecc]) throw new Error("Fehlerkorrektur muss L oder M sein.");
    const bytes = utf8(String(text));
    const v = version(bytes, ecc);
    const woerter = codewoerter(bitfolge(bytes, v, ecc), v, ecc);

    const s = 17 + 4 * v;
    const roh = leeresRaster(s);
    funktionsmuster(roh, v);
    const reserviert = roh.m.map(z => Array.from(z, w => w !== -1));
    datenEinfuegen(roh, woerter, RESTBITS[v]);

    let beste = null;
    for (let maske = 0; maske < 8; maske++) {
      if (maskeErzwingen !== null && maske !== maskeErzwingen) continue;
      const m = roh.m.map((z, y) => Array.from(z, (w, x) =>
        reserviert[y][x] ? w : (MASKEN[maske](y, x) ? w ^ 1 : w)));
      formatEinfuegen(m, s, ecc, maske);
      const p = strafe(m, s);
      if (!beste || p < beste.p) beste = { p, m, maske };
    }
    return { size: s, matrix: beste.m, version: v, ecc, maske: beste.maske };
  }

  /** QR-Symbol als SVG. `rand` ist die Ruhezone in Modulen (Norm: 4). */
  function svg(text, { ecc = "M", rand = 4, farbe = "#000", groesse = 0 } = {}) {
    const q = erzeuge(text, { ecc });
    const gesamt = q.size + rand * 2;
    let pfad = "";
    for (let y = 0; y < q.size; y++) {
      for (let x = 0; x < q.size; x++) {
        if (q.matrix[y][x]) pfad += `M${x + rand} ${y + rand}h1v1h-1z`;
      }
    }
    const masse = groesse ? ` width="${groesse}" height="${groesse}"` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gesamt} ${gesamt}"${masse}`
      + ` shape-rendering="crispEdges" role="img" aria-label="QR-Code zur Umfrage">`
      + `<rect width="${gesamt}" height="${gesamt}" fill="#fff"/>`
      + `<path d="${pfad}" fill="${farbe}"/></svg>`;
  }

  // Für die Fehlersuche und die Tests: die Zwischenschritte einzeln greifbar.
  const intern = { version, bitfolge, codewoerter, funktionsmuster, leeresRaster, MASKEN, RESTBITS };

  return { erzeuge, svg, intern };
})();

if (typeof module !== "undefined") module.exports = QR;   // für die Tests
