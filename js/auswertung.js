"use strict";

/* Auswertung – Ablauf der Seite
   ─────────────────────────────
   1. Anmelden (stiller SSO-Versuch, sonst interaktiv)
   2. Rolle aus AppPermissions holen; ohne Rolle endet es hier
   3. Umfragen und Antworten laden, filtern, darstellen

   Alle Ansichten arbeiten auf derselben gefilterten Datenmenge, damit
   „Ergebnisse“, „Vergleich“ und „Freitexte“ nie auseinanderlaufen.        */

(() => {

  const C = UMFRAGE_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = ANALYSE.esc;

  const S = {
    umfragen: [],       // aus SharePoint (oder Vorlagen)
    aktuell: null,      // gewählte Umfrage {id, titel, def, …}
    alleAntworten: [],  // ungefiltert
    antworten: [],      // gefiltert
    kontakte: null,
    ansicht: "ergebnisse"
  };

  /* ── Start ─────────────────────────────────────────────────────── */

  (async function start() {
    try {
      const r = await AUTH.signIn();
      if (r === "redirecting") return;
      if (r && r.error) return bootFehler(r.error);
    } catch (e) {
      return bootFehler(e.message || String(e));
    }

    try {
      await RECHTE.laden();
    } catch (e) {
      return bootFehler("Anmeldung ok, aber Microsoft Graph antwortet nicht: "
        + (e.detail || e.message));
    }

    $("pName").textContent = RECHTE.ctx.name || RECHTE.ctx.email;
    $("pRolle").textContent = RECHTE.ctx.rolle;

    if (!RECHTE.darfSehen()) {
      $("boot").hidden = true;
      $("kzText").textContent = `Angemeldet als ${RECHTE.ctx.email}. Für die Auswertung `
        + `dieser Umfragen braucht es einen Eintrag in der Liste „${C.permList}“ `
        + `(App „${C.appKey}“). Bitte bei der IT anfragen.`;
      $("kzGrund").textContent = RECHTE.ctx.erklaerung;
      $("keinZugriff").hidden = false;
      return;
    }

    if (RECHTE.darfVerwalten()) {
      document.querySelector('[data-ansicht="verwaltung"]').hidden = false;
    }
    hilfeFuellen();

    $("boot").hidden = true;
    $("app").hidden = false;

    try {
      await umfragenLaden();
      await antwortenLaden();
    } catch (e) {
      meldung("err", "Daten konnten nicht geladen werden: " + (e.detail || e.message));
    }
  })();

  function bootFehler(text) {
    $("bootSpin").hidden = true;
    $("bootTxt").textContent = "Anmeldung nicht möglich";
    $("bootFehler").textContent = text;
    $("bootFehler").hidden = false;
    $("bootBtn").hidden = false;
  }

  $("bootBtn").addEventListener("click", () => AUTH.startLogin("select_account"));
  $("abmelden").addEventListener("click", () => AUTH.logout());
  $("kzAbmelden").addEventListener("click", () => AUTH.logout());

  /* ── Laden ─────────────────────────────────────────────────────── */

  async function umfragenLaden() {
    let liste = null;
    try {
      liste = await DATEN.umfragen();
    } catch (e) {
      console.warn("[Auswertung] Liste „Umfragen“ nicht lesbar:", e.detail || e.message);
    }

    if (!liste || !liste.length) {
      // Noch nichts in SharePoint – mit den mitgelieferten Vorlagen arbeiten,
      // damit die Auswertung schon vor der Einrichtung etwas anzeigen kann.
      const vorlagen = [];
      for (const id of (C.vorlagen || [])) {
        try {
          const def = await DATEN.vorlage(id);
          vorlagen.push({ itemId: null, id, titel: def.titel || id, status: "Vorlage", def });
        } catch { /* Vorlage fehlt – nicht schlimm */ }
      }
      S.umfragen = vorlagen;
      meldung("info", liste
        ? "In SharePoint ist noch keine Umfrage angelegt – es werden die mitgelieferten "
          + "Vorlagen angezeigt. Unter „Verwaltung“ lässt sich daraus eine echte Umfrage machen."
        : `Die Liste „${C.lists.umfragen}“ existiert noch nicht.`
          + (RECHTE.darfVerwalten() ? " Unter „Verwaltung“ können Sie die Listen anlegen." : ""));
    } else {
      S.umfragen = liste;
    }

    const sel = $("fUmfrage");
    sel.innerHTML = S.umfragen.map(u =>
      `<option value="${esc(u.id)}">${esc(u.titel)}${u.status ? " · " + esc(u.status) : ""}</option>`).join("");

    const gewuenscht = new URLSearchParams(location.search).get("u");
    S.aktuell = S.umfragen.find(u => u.id === gewuenscht)
      || S.umfragen.find(u => u.id === C.standardUmfrage)
      || S.umfragen[0] || null;
    if (S.aktuell) sel.value = S.aktuell.id;
  }

  async function antwortenLaden() {
    if (!S.aktuell) return zeichne();
    let ergebnis = null;
    try {
      ergebnis = await DATEN.antworten(S.aktuell.id);
    } catch (e) {
      meldung("err", `Antworten nicht lesbar: ${e.detail || e.message}`);
    }
    if (ergebnis === null) {
      meldung("info", `Die Liste „${C.lists.antworten}“ existiert noch nicht – es liegen `
        + "also noch keine Antworten vor."
        + (RECHTE.darfVerwalten() ? " Unter „Verwaltung“ können Sie die Listen anlegen." : ""));
      ergebnis = { zeilen: [], gesamt: 0, kennungen: [] };
    }

    // Der Klassiker: Die Liste ist voll, aber keine Zeile trägt die Kennung der
    // gewählten Umfrage – dann schreibt der Flow die Spalte UmfrageId nicht.
    // Ohne diesen Hinweis sieht es aus, als wäre nie eine Antwort angekommen.
    if (!ergebnis.zeilen.length && ergebnis.gesamt) {
      const gefunden = ergebnis.kennungen.map(k => k || "(leer)").join(", ");
      meldung("info", `In „${C.lists.antworten}“ stehen ${ergebnis.gesamt} Antworten, `
        + `aber keine davon trägt die Kennung „${S.aktuell.id}“. Gefunden wurde: ${gefunden}. `
        + "Wenn dort „(leer)“ steht, füllt der Flow die Spalte UmfrageId nicht – "
        + "in der Aktion „Element erstellen“ nachtragen.");
    }
    S.alleAntworten = ergebnis.zeilen;
    filterFuellen();
    filtern();
  }

  function filterFuellen() {
    const werte = (feld) => [...new Set(S.alleAntworten.map(r => r[feld]).filter(Boolean))].sort();
    for (const [id, feld] of [["fStandort", "standort"], ["fBereich", "bereich"]]) {
      const sel = $(id), alt = sel.value;
      sel.innerHTML = `<option value="">alle</option>`
        + werte(feld).map(w => `<option${w === alt ? " selected" : ""}>${esc(w)}</option>`).join("");
    }
  }

  function filtern() {
    const st = $("fStandort").value, be = $("fBereich").value, von = $("fVon").value;
    S.antworten = S.alleAntworten.filter(r =>
      (!st || r.standort === st) &&
      (!be || r.bereich === be) &&
      (!von || String(r.eingereicht).slice(0, 10) >= von));
    zeichne();
  }

  /* ── Zeichnen ──────────────────────────────────────────────────── */

  function zeichne() {
    for (const a of ["ergebnisse", "vergleich", "freitexte", "kontakte", "verwaltung", "hilfe"]) {
      $("ansicht" + a[0].toUpperCase() + a.slice(1)).hidden = a !== S.ansicht;
    }
    $("filter").hidden = !["ergebnisse", "vergleich", "freitexte"].includes(S.ansicht);

    if (S.ansicht === "ergebnisse") zeichneErgebnisse();
    if (S.ansicht === "vergleich")  zeichneVergleich();
    if (S.ansicht === "freitexte")  zeichneFreitexte();
    if (S.ansicht === "kontakte")   zeichneKontakte();
    if (S.ansicht === "verwaltung") VERWALTUNG.zeichne($("ansichtVerwaltung"), S, neuLaden);
  }

  const def = () => S.aktuell?.def || { fragen: [] };

  function zeichneErgebnisse() {
    const box = $("ansichtErgebnisse");
    if (!S.aktuell) { box.innerHTML = `<div class="block"><p class="leer">Keine Umfrage gewählt.</p></div>`; return; }
    if (!def().fragen?.length) {
      box.innerHTML = `<div class="block"><p class="leer">Zu dieser Umfrage ist kein `
        + `Fragebogen hinterlegt (Spalte FragenJson ist leer oder fehlerhaft).</p></div>`;
      return;
    }

    const k = ANALYSE.kennzahlen(def(), S.antworten);
    const datum = s => s ? new Date(s).toLocaleDateString("de-DE") : "–";
    const gefiltert = S.antworten.length !== S.alleAntworten.length;

    let html = `<div class="kacheln">
      <div class="kachel akzent"><div class="zahl">${k.antworten}</div>
        <div class="txt">Antworten${gefiltert ? ` (von ${S.alleAntworten.length})` : ""}</div></div>
      <div class="kachel"><div class="zahl">${k.gesamtschnitt === null ? "–" : k.gesamtschnitt.toLocaleString("de-DE")}</div>
        <div class="txt">Durchschnitt aller Skalenfragen</div></div>
      <div class="kachel"><div class="zahl">${datum(k.erste)}</div>
        <div class="txt">erste Antwort</div></div>
      <div class="kachel"><div class="zahl">${datum(k.letzte)}</div>
        <div class="txt">letzte Antwort</div></div>
      <div class="kachel"><div class="zahl">${k.dauerMedian
        ? (Math.round(k.dauerMedian / 6) / 10).toLocaleString("de-DE") + " min" : "–"}</div>
        <div class="txt">übliche Ausfülldauer</div></div>
    </div>`;

    if (!S.antworten.length) {
      html += `<div class="block"><p class="leer">Für diese Auswahl liegen keine Antworten vor.</p></div>`;
    } else {
      const tage = ANALYSE.verlauf(S.antworten);
      if (tage.length > 1) {
        html += `<div class="block">
          <h3>Rücklauf pro Tag</h3>
          <div class="frageinfo">Zeigt, wann Antworten eingehen – hilfreich, um den
            Erfolg von Aushang, E-Mail oder Erinnerung zu erkennen.</div>
          ${ANALYSE.balkenHtml(tage, { farbe: "var(--lichtblau)" })}
        </div>`;
      }
      for (const { frage, ergebnis } of ANALYSE.alles(def(), S.antworten)) {
        if (ergebnis.typ === "text") continue;   // eigener Reiter
        html += `<div class="block">
          <h3>${esc(frage.text)}</h3>
          ${frage.hilfe ? `<div class="frageinfo">${esc(frage.hilfe)}</div>` : ""}
          ${ANALYSE.ergebnisHtml(frage, ergebnis)}
        </div>`;
      }
    }
    box.innerHTML = html;
  }

  function zeichneVergleich() {
    const box = $("ansichtVergleich");
    if (!S.antworten.length) {
      box.innerHTML = `<div class="block"><p class="leer">Keine Antworten für den Vergleich.</p></div>`;
      return;
    }
    let html = "";
    for (const feld of ["bereich", "standort"]) {
      const v = ANALYSE.vergleich(def(), S.antworten, feld);
      if (!v.zeilen.length) continue;
      html += `<div class="block">
        <h3>Durchschnitte nach ${feld === "bereich" ? "Bereich" : "Standort"}</h3>
        <div class="frageinfo">Skalenfragen 1–5. Zellen mit wenigen Antworten sind
          wenig aussagekräftig – die Anzahl steht in Klammern.</div>
        <div class="wrap-x"><table class="tab">
          <thead><tr><th>Frage</th>${v.gruppen.map(g => `<th class="zahl">${esc(g)}</th>`).join("")}</tr></thead>
          <tbody>${v.zeilen.map(z => `<tr>
            <td>${esc(z.frage.text)}</td>
            ${z.werte.map(w => `<td class="zahl">${w.schnitt === null ? "–"
              : `<b>${w.schnitt.toLocaleString("de-DE")}</b> <span class="leer">(${w.n})</span>`}</td>`).join("")}
          </tr>`).join("")}</tbody>
        </table></div>
      </div>`;
    }
    box.innerHTML = html || `<div class="block"><p class="leer">Diese Umfrage enthält keine Skalenfragen.</p></div>`;
  }

  function zeichneFreitexte() {
    const box = $("ansichtFreitexte");
    const bloecke = ANALYSE.alles(def(), S.antworten).filter(x => x.ergebnis.typ === "text");
    if (!bloecke.length) {
      box.innerHTML = `<div class="block"><p class="leer">Diese Umfrage enthält keine Freitextfragen.</p></div>`;
      return;
    }
    box.innerHTML = bloecke.map(({ frage, ergebnis }) => `<div class="block">
      <h3>${esc(frage.text)}</h3>
      <div class="frageinfo">${ergebnis.n} Antworten</div>
      ${ANALYSE.ergebnisHtml(frage, { ...ergebnis, texte: ergebnis.texte })}
    </div>`).join("");
  }

  async function zeichneKontakte() {
    const box = $("ansichtKontakte");
    box.innerHTML = `<div class="block"><p class="leer">Wird geladen …</p></div>`;
    let rows = null;
    try {
      rows = await DATEN.kontakte(S.aktuell?.id);
    } catch (e) {
      box.innerHTML = `<div class="block"><p class="leer">Nicht lesbar: ${esc(e.detail || e.message)}</p></div>`;
      return;
    }
    if (rows === null) {
      box.innerHTML = `<div class="block"><p class="leer">Die Liste „${esc(C.lists.kontakte)}“ existiert noch nicht.</p></div>`;
      return;
    }
    box.innerHTML = `<div class="block">
      <h3>Freiwillige Kontaktangaben (${rows.length})</h3>
      <div class="frageinfo">Diese Angaben stehen in einer eigenen Liste und lassen sich
        den Antworten <b>nicht</b> zuordnen – die Umfrage bleibt anonym.</div>
      ${rows.length ? `<div class="wrap-x"><table class="tab">
        <thead><tr><th>Kontakt</th><th>Eingegangen</th>${RECHTE.darfLoeschen() ? `<th class="keinDruck"></th>` : ""}</tr></thead>
        <tbody>${rows.map(r => `<tr><td>${esc(r.kontakt)}</td>
          <td>${r.eingereicht ? new Date(r.eingereicht).toLocaleString("de-DE") : "–"}</td>
          ${RECHTE.darfLoeschen()
            ? `<td class="keinDruck"><button class="btn sec mini" data-kontaktweg="${esc(r.itemId)}">Löschen</button></td>`
            : ""}</tr>`).join("")}</tbody>
      </table></div>
      <p style="margin-top:14px"><button class="btn sec keinDruck" id="bKontakteCsv">⬇ Als CSV</button></p>`
      : `<p class="leer">Bisher hat sich niemand gemeldet.</p>`}
    </div>`;
    box.querySelectorAll("[data-kontaktweg]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Diesen Eintrag endgültig löschen?")) return;
      try {
        await DATEN.loescheKontakt(b.dataset.kontaktweg);
        await zeichneKontakte();
      } catch (e) {
        alert("Fehlgeschlagen: " + (e.detail || e.message));
      }
    }));

    $("bKontakteCsv")?.addEventListener("click", () => {
      const csv = "﻿" + ["Kontakt;Eingegangen",
        ...rows.map(r => `${String(r.kontakt).replace(/;/g, ",")};${r.eingereicht}`)].join("\r\n");
      ANALYSE.download(`mitmacher-${S.aktuell?.id || "umfrage"}.csv`, csv);
    });
  }

  function hilfeFuellen() {
    $("hPermList").textContent = C.permList;
    $("hPermSite").textContent = C.permSite;
    $("hAppKey").textContent = C.appKey;
    $("hLink").textContent = location.href.replace(/auswertung\.html.*$/, "")
      + (C.standardUmfrage ? `?u=${C.standardUmfrage}` : "");
  }

  function meldung(art, text) {
    $("meldung").innerHTML = text ? `<div class="meldung ${art}">${esc(text)}</div>` : "";
  }

  /* ── Bedienung ─────────────────────────────────────────────────── */

  $("reiter").addEventListener("click", e => {
    const b = e.target.closest("button[data-ansicht]");
    if (!b) return;
    S.ansicht = b.dataset.ansicht;
    [...$("reiter").children].forEach(x => x.setAttribute("aria-selected", String(x === b)));
    zeichne();
  });

  $("fUmfrage").addEventListener("change", async () => {
    S.aktuell = S.umfragen.find(u => u.id === $("fUmfrage").value) || null;
    meldung("", "");
    await antwortenLaden();
  });

  for (const id of ["fStandort", "fBereich", "fVon"]) {
    $(id).addEventListener("change", filtern);
  }

  $("bAktualisieren").addEventListener("click", () => neuLaden());

  async function neuLaden() {
    GRAPH.clearColumnCache();
    meldung("", "");
    await umfragenLaden();
    await antwortenLaden();
  }

  $("bCsv").addEventListener("click", () => {
    if (!S.antworten.length) return meldung("info", "Keine Antworten zum Exportieren.");
    ANALYSE.download(`umfrage-${S.aktuell.id}-${new Date().toISOString().slice(0, 10)}.csv`,
      ANALYSE.csv(def(), S.antworten));
  });

  $("bDrucken").addEventListener("click", () => window.print());

})();
