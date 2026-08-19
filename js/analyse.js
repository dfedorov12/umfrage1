"use strict";

/* Auswertung: Zahlen und Diagramme
   ────────────────────────────────
   Reine Funktionen über (Definition, Antwortzeilen). Keine Netzaufrufe,
   keine Abhängigkeit vom DOM außer beim Erzeugen der HTML-Schnipsel –
   dadurch lässt sich die Rechnerei einzeln prüfen (tests/test-analyse.mjs).

   Diagramme werden bewusst als schlichte HTML-Balken gezeichnet und nicht
   mit einer Diagrammbibliothek: Das Ergebnis druckt sauber, funktioniert
   ohne CDN und ohne Freigabe fremder Skripte im Firmennetz.               */

const ANALYSE = (() => {

  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const prozent = (teil, ganz) => ganz ? Math.round((teil / ganz) * 1000) / 10 : 0;
  const runde   = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

  /* ── Rechnen ───────────────────────────────────────────────────── */

  /** Wertet eine einzelne Frage über alle Antwortzeilen aus. */
  function frage(f, rows) {
    const werte = rows.map(r => r.antworten?.[f.id]).filter(
      v => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length));

    if (f.typ === "skala") {
      const zahlen = werte.map(Number).filter(n => !isNaN(n));
      const min = f.min ?? 1, max = f.max ?? 5;
      const verteilung = [];
      for (let i = min; i <= max; i++) {
        const anzahl = zahlen.filter(z => z === i).length;
        verteilung.push({ label: String(i), anzahl, anteil: prozent(anzahl, zahlen.length) });
      }
      const summe = zahlen.reduce((a, b) => a + b, 0);
      return { typ: "skala", n: zahlen.length, verteilung, min, max,
               schnitt: zahlen.length ? runde(summe / zahlen.length) : null };
    }

    if (f.typ === "matrix") {
      const zeilen = (f.optionen || []).map(z => {
        const zahlen = werte.map(v => Number(v?.[z])).filter(n => !isNaN(n));
        const summe = zahlen.reduce((a, b) => a + b, 0);
        return { label: z, n: zahlen.length,
                 schnitt: zahlen.length ? runde(summe / zahlen.length) : null };
      }).sort((a, b) => (b.schnitt ?? -1) - (a.schnitt ?? -1));
      return { typ: "matrix", n: werte.length, zeilen,
               min: f.matrixMin ?? 1, max: f.matrixMax ?? 5 };
    }

    if (f.typ === "radio" || f.typ === "dropdown" || f.typ === "checkbox") {
      const mehrfach = f.typ === "checkbox";
      const alle = mehrfach ? werte.flatMap(v => Array.isArray(v) ? v : [v]) : werte;
      const zaehler = new Map();
      for (const v of alle) zaehler.set(v, (zaehler.get(v) || 0) + 1);
      // Reihenfolge des Fragebogens beibehalten, Unbekanntes hinten anhängen
      const bekannt = f.optionen || [];
      const rest = [...zaehler.keys()].filter(k => !bekannt.includes(k));
      const optionen = [...bekannt, ...rest].map(o => ({
        label: o,
        anzahl: zaehler.get(o) || 0,
        anteil: prozent(zaehler.get(o) || 0, werte.length)   // % der Antwortenden
      }));
      const freitexte = rows.map(r => r.antworten?.[f.id + "_sonstiges"])
        .filter(t => t && String(t).trim());
      return { typ: mehrfach ? "checkbox" : "auswahl", n: werte.length,
               nennungen: alle.length, optionen, freitexte };
    }

    // text / kurztext
    const texte = rows
      .map(r => ({ text: String(r.antworten?.[f.id] || "").trim(),
                   standort: r.standort, bereich: r.bereich, datum: r.eingereicht }))
      .filter(t => t.text);
    return { typ: "text", n: texte.length, texte };
  }

  /** Alle Fragen einer Definition. */
  function alles(def, rows) {
    return (def.fragen || [])
      .filter(f => f.typ !== "abschnitt" && !f.kontakt)
      .map(f => ({ frage: f, ergebnis: frage(f, rows) }));
  }

  /** Mittelwerte der Skalenfragen je Gruppe (Standort oder Bereich).
   *  Genau das ist der Kern dieser Befragung: Fühlt sich die Produktion
   *  anders angesprochen als die Verwaltung? */
  function vergleich(def, rows, feld = "bereich") {
    const gruppen = [...new Set(rows.map(r => r[feld] || "(ohne Angabe)"))].sort();
    const skalen = (def.fragen || []).filter(f => f.typ === "skala");
    return {
      feld, gruppen,
      zeilen: skalen.map(f => ({
        frage: f,
        werte: gruppen.map(g => {
          const teil = rows.filter(r => (r[feld] || "(ohne Angabe)") === g);
          const e = frage(f, teil);
          return { gruppe: g, schnitt: e.schnitt, n: e.n };
        })
      }))
    };
  }

  /** Kennzahlen für den Kopf der Auswertung. */
  function kennzahlen(def, rows) {
    const skalen = (def.fragen || []).filter(f => f.typ === "skala");
    const schnitte = skalen.map(f => frage(f, rows).schnitt).filter(s => s !== null);
    const zeiten = rows.map(r => String(r.eingereicht)).filter(Boolean).sort();
    const dauer = rows.map(r => r.dauerSek).filter(d => d > 0);
    return {
      antworten: rows.length,
      gesamtschnitt: schnitte.length
        ? runde(schnitte.reduce((a, b) => a + b, 0) / schnitte.length) : null,
      erste: zeiten[0] || "",
      letzte: zeiten[zeiten.length - 1] || "",
      dauerMedian: dauer.length
        ? dauer.slice().sort((a, b) => a - b)[Math.floor(dauer.length / 2)] : 0
    };
  }

  /* ── Zeichnen ──────────────────────────────────────────────────── */

  /** Waagerechte Balken. `items` = [{label, anzahl, anteil}] */
  function balkenHtml(items, { farbe = "var(--azur)", maxAnteil = 0 } = {}) {
    const max = maxAnteil || Math.max(1, ...items.map(i => i.anteil));
    return `<div class="balken-liste">` + items.map(i => `
      <div class="bl-zeile">
        <div class="bl-label" title="${esc(i.label)}">${esc(i.label)}</div>
        <div class="bl-spur"><i style="width:${(i.anteil / max) * 100}%;background:${farbe}"></i></div>
        <div class="bl-wert">${i.anzahl}<span>${i.anteil.toLocaleString("de-DE")} %</span></div>
      </div>`).join("") + `</div>`;
  }

  function skalaHtml(e) {
    const farbe = e.schnitt >= 4 ? "var(--green)" : e.schnitt >= 3 ? "var(--azur)" : "var(--orange)";
    return `<div class="schnitt" style="color:${farbe}">
        <b>${e.schnitt === null ? "–" : e.schnitt.toLocaleString("de-DE")}</b>
        <span>Durchschnitt (${e.min}–${e.max}) · ${e.n} Antworten</span>
      </div>` + balkenHtml(e.verteilung, { farbe });
  }

  function matrixHtml(e) {
    const max = e.max || 5;
    return `<div class="balken-liste">` + e.zeilen.map(z => `
      <div class="bl-zeile">
        <div class="bl-label" title="${esc(z.label)}">${esc(z.label)}</div>
        <div class="bl-spur"><i style="width:${((z.schnitt || 0) / max) * 100}%"></i></div>
        <div class="bl-wert">${z.schnitt === null ? "–" : z.schnitt.toLocaleString("de-DE")}<span>${z.n}×</span></div>
      </div>`).join("") + `</div>`;
  }

  function texteHtml(e, grenze = 25) {
    if (!e.n) return `<p class="leer">Keine Freitexte.</p>`;
    const zeige = e.texte.slice(0, grenze);
    return `<ul class="texte">` + zeige.map(t => `<li>
        <div class="tx">${esc(t.text)}</div>
        <div class="tm">${esc([t.standort, t.bereich].filter(Boolean).join(" · "))}</div>
      </li>`).join("") + `</ul>`
      + (e.n > grenze ? `<p class="leer">… und ${e.n - grenze} weitere. Alle im CSV-Export.</p>` : "");
  }

  /** Ergebnis einer Frage als HTML-Block. */
  function ergebnisHtml(f, e) {
    if (!e.n) return `<p class="leer">Keine Antworten auf diese Frage.</p>`;
    if (e.typ === "skala")    return skalaHtml(e);
    if (e.typ === "matrix")   return matrixHtml(e);
    if (e.typ === "text")     return texteHtml(e);
    const kopf = e.typ === "checkbox"
      ? `<p class="leer">${e.n} Personen · ${e.nennungen} Nennungen (Mehrfachauswahl, Prozent bezogen auf Antwortende)</p>`
      : `<p class="leer">${e.n} Antworten</p>`;
    return kopf + balkenHtml(e.optionen)
      + (e.freitexte?.length
          ? `<details class="sonst"><summary>Freitexte zu „Sonstiges“ (${e.freitexte.length})</summary>
             <ul class="texte">${e.freitexte.map(t => `<li><div class="tx">${esc(t)}</div></li>`).join("")}</ul></details>`
          : "");
  }

  /* ── Export ────────────────────────────────────────────────────── */

  const csvFeld = v => {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[";\n]/.test(s) ? `"${s}"` : s;
  };

  /** Eine Zeile je Antwort, eine Spalte je Frage. Semikolon + BOM, damit
   *  Excel die Datei auf deutschen Rechnern ohne Nachfragen richtig öffnet. */
  function csv(def, rows) {
    const fragen = (def.fragen || []).filter(f => f.typ !== "abschnitt" && !f.kontakt);
    const kopf = ["Eingereicht", "Standort", "Bereich", "DauerSek", ...fragen.map(f => f.text)];
    const zeilen = rows.map(r => {
      const z = [r.eingereicht, r.standort, r.bereich, r.dauerSek];
      for (const f of fragen) {
        const v = r.antworten?.[f.id];
        let s = "";
        if (Array.isArray(v)) s = v.join("; ");
        else if (v && typeof v === "object") s = Object.entries(v).map(([k, w]) => `${k}: ${w}`).join("; ");
        else if (v !== undefined && v !== null) s = String(v);
        const extra = r.antworten?.[f.id + "_sonstiges"];
        if (extra) s += (s ? " | " : "") + "Sonstiges: " + extra;
        z.push(s);
      }
      return z;
    });
    return "﻿" + [kopf, ...zeilen].map(z => z.map(csvFeld).join(";")).join("\r\n");
  }

  function download(name, inhalt, typ = "text/csv;charset=utf-8") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([inhalt], { type: typ }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  return { esc, prozent, runde, frage, alles, vergleich, kennzahlen,
           balkenHtml, ergebnisHtml, csv, download };
})();

if (typeof module !== "undefined") module.exports = ANALYSE;   // für die Tests
