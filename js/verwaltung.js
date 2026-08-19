"use strict";

/* Verwaltung (ab Rolle „editor“)
   ──────────────────────────────
   Hier entsteht eine neue Umfrage, ohne dass jemand Code anfassen muss:
   Fragebogen als JSON in der Liste „Umfragen“, Status steuert, ob die
   Teilnahmeseite ihn ausliefert.

   Der Fragebogen wird bewusst als JSON bearbeitet und nicht mit einem
   grafischen Baukasten. Das ist ehrlich zum Aufwand: Ein Baukasten wäre ein
   eigenes Projekt, während eine Umfrage im Jahr vielleicht zweimal entsteht –
   und die Vorlage im Repository nimmt einem den Anfang ohnehin ab.         */

const VERWALTUNG = (() => {

  const C = UMFRAGE_CONFIG;
  const esc = ANALYSE.esc;
  const $ = id => document.getElementById(id);

  let box = null, S = null, neuLaden = null;
  let bearbeitet = null;    // {itemId, id, json}

  const teilnahmeLink = id =>
    location.href.replace(/auswertung\.html.*$/, "") + "?u=" + encodeURIComponent(id);

  async function zeichne(container, zustand, reload) {
    box = container; S = zustand; neuLaden = reload;

    let listen = {};
    try { listen = await DATEN.pruefeListen(); } catch { listen = {}; }
    const fehlen = Object.values(listen).filter(l => !l.da).map(l => l.name);

    box.innerHTML = `
      ${endpunktBlock()}
      ${einrichtungBlock(fehlen)}
      ${umfragenBlock()}
      ${editorBlock()}`;

    verdrahten();
  }

  /* ── Blöcke ────────────────────────────────────────────────────── */

  function endpunktBlock() {
    const scharf = !!(C.endpunkt || "").trim();
    return `<div class="block">
      <h3>Annahmestelle für Antworten</h3>
      ${scharf
        ? `<p>✅ Eingetragen. Antworten der Teilnahmeseite gehen an den Power-Automate-Flow
             und werden in <code>${esc(C.lists.antworten)}</code> gespeichert.</p>
           <div class="linkbox"><code>${esc(C.endpunkt.replace(/(sig=)[^&]+/, "$1…"))}</code></div>`
        : `<p>⚠️ <b>Noch nicht eingerichtet.</b> In <code>js/config.js</code> steht bei
             <code>endpunkt</code> nichts. Die Teilnahmeseite funktioniert, speichert aber
             nichts („Probelauf“). Anleitung: <code>flow/ANLEITUNG-FLOW.md</code> im Repository.</p>`}
    </div>`;
  }

  function einrichtungBlock(fehlen) {
    if (!fehlen.length) {
      return `<div class="block"><h3>SharePoint-Listen</h3>
        <p>✅ Alle drei Listen sind auf <code>${esc(C.site)}</code> vorhanden.</p></div>`;
    }
    return `<div class="block"><h3>SharePoint-Listen</h3>
      <p>⚠️ Es fehlen: <b>${fehlen.map(esc).join(", ")}</b> auf <code>${esc(C.site)}</code>.</p>
      ${RECHTE.darfLoeschen()
        ? `<p><button class="btn" id="bListen">Listen jetzt anlegen</button></p>
           <p class="leer">Legt die Listen mit allen Spalten an (wie
             provision-umfragen-listen.ps1). Erfordert Schreibrechte auf der Site.</p>`
        : `<p class="leer">Zum Anlegen wird die Rolle „admin“ benötigt.</p>`}
      <div id="listenMeldung"></div>
    </div>`;
  }

  function umfragenBlock() {
    const zeilen = (S.umfragen || []).map(u => {
      const pille = u.status === "Aktiv" ? "aktiv" : u.status === "Beendet" ? "beendet" : "entwurf";
      return `<tr>
        <td><b>${esc(u.titel)}</b><div class="leer">${esc(u.id)}</div></td>
        <td><span class="pille ${pille}">${esc(u.status)}</span></td>
        <td>${u.def ? (u.def.fragen || []).filter(f => f.typ !== "abschnitt").length + " Fragen" : "–"}</td>
        <td class="keinDruck">
          ${u.itemId ? `<button class="btn sec mini" data-bearbeiten="${esc(u.id)}">Bearbeiten</button>
             <button class="btn sec mini" data-status="${esc(u.id)}">Status …</button>`
            : `<button class="btn sec mini" data-uebernehmen="${esc(u.id)}">Aus Vorlage anlegen</button>`}
          <button class="btn sec mini" data-link="${esc(u.id)}">Link</button>
          <a class="btn sec mini" href="${esc(teilnahmeLink(u.id))}&vorschau" target="_blank"
             style="text-decoration:none;display:inline-block">Vorschau</a>
        </td>
      </tr>`;
    }).join("");

    const vorlagen = (C.vorlagen || []).filter(v => !(S.umfragen || []).some(u => u.id === v && u.itemId));

    return `<div class="block">
      <h3>Umfragen</h3>
      <div class="wrap-x"><table class="tab">
        <thead><tr><th>Umfrage</th><th>Status</th><th>Umfang</th><th class="keinDruck">Aktionen</th></tr></thead>
        <tbody>${zeilen || `<tr><td colspan="4" class="leer">Noch keine Umfrage angelegt.</td></tr>`}</tbody>
      </table></div>
      <div id="linkAusgabe"></div>
      ${vorlagen.length ? `<p style="margin-top:14px" class="leer">
        Mitgelieferte Vorlagen: ${vorlagen.map(v => `<button class="btn sec mini" data-uebernehmen="${esc(v)}">${esc(v)} übernehmen</button>`).join(" ")}
      </p>` : ""}
      <div id="umfrageMeldung"></div>
    </div>`;
  }

  function editorBlock() {
    if (!bearbeitet) return "";
    return `<div class="block editor">
      <h3>Fragebogen bearbeiten: ${esc(bearbeitet.id)}</h3>
      <div class="frageinfo">JSON-Definition. Nach dem Speichern liefert die
        Teilnahmeseite diese Fassung aus – die Datei im Repository bleibt Vorlage.</div>
      <textarea id="jsonEditor" spellcheck="false">${esc(bearbeitet.json)}</textarea>
      <div id="editorMeldung"></div>
      <p style="margin-top:12px">
        <button class="btn" id="bSpeichern">Speichern</button>
        <button class="btn sec" id="bPruefen">Nur prüfen</button>
        <button class="btn sec" id="bAbbrechen">Schließen</button>
      </p>
    </div>`;
  }

  /* ── Bedienung ─────────────────────────────────────────────────── */

  function verdrahten() {
    $("bListen")?.addEventListener("click", async e => {
      e.target.disabled = true;
      const m = $("listenMeldung");
      m.innerHTML = `<div class="meldung info">Listen werden angelegt …</div>`;
      try {
        const neu = await DATEN.listenAnlegen();
        m.innerHTML = `<div class="meldung ok">Angelegt: ${neu.map(esc).join(", ") || "nichts (waren schon da)"}.</div>`;
        await neuLaden();
      } catch (err) {
        m.innerHTML = `<div class="meldung err">Fehlgeschlagen: ${esc(err.detail || err.message)}</div>`;
        e.target.disabled = false;
      }
    });

    box.querySelectorAll("[data-link]").forEach(b => b.addEventListener("click", () => {
      const link = teilnahmeLink(b.dataset.link);
      navigator.clipboard?.writeText(link).catch(() => {});
      $("linkAusgabe").innerHTML = `<div class="linkbox"><code>${esc(link)}</code>
        <span class="leer">in die Zwischenablage kopiert</span></div>`;
    }));

    box.querySelectorAll("[data-bearbeiten]").forEach(b => b.addEventListener("click", () => {
      const u = S.umfragen.find(x => x.id === b.dataset.bearbeiten);
      bearbeitet = { itemId: u.itemId, id: u.id, json: u.json || JSON.stringify(u.def, null, 1) };
      zeichne(box, S, neuLaden);
    }));

    box.querySelectorAll("[data-uebernehmen]").forEach(b => b.addEventListener("click", async () => {
      const id = b.dataset.uebernehmen;
      const m = $("umfrageMeldung");
      m.innerHTML = `<div class="meldung info">Vorlage „${esc(id)}“ wird angelegt …</div>`;
      try {
        const def = await DATEN.vorlage(id);
        await DATEN.speichereUmfrage(def, "Entwurf", null);
        m.innerHTML = `<div class="meldung ok">Angelegt als Entwurf. Zum Freischalten `
          + `den Status auf „Aktiv“ setzen.</div>`;
        await neuLaden();
      } catch (err) {
        m.innerHTML = `<div class="meldung err">Fehlgeschlagen: ${esc(err.detail || err.message)}</div>`;
      }
    }));

    box.querySelectorAll("[data-status]").forEach(b => b.addEventListener("click", async () => {
      const u = S.umfragen.find(x => x.id === b.dataset.status);
      const reihe = ["Entwurf", "Aktiv", "Beendet"];
      const neu = reihe[(reihe.indexOf(u.status) + 1) % reihe.length];
      if (!confirm(`Status von „${u.titel}“ auf „${neu}“ setzen?`
        + (neu === "Aktiv" ? "\n\nDamit ist die Umfrage für alle erreichbar." : ""))) return;
      try {
        await DATEN.setzeStatus(u.itemId, neu);
        await neuLaden();
      } catch (err) {
        $("umfrageMeldung").innerHTML = `<div class="meldung err">${esc(err.detail || err.message)}</div>`;
      }
    }));

    $("bAbbrechen")?.addEventListener("click", () => { bearbeitet = null; zeichne(box, S, neuLaden); });
    $("bPruefen")?.addEventListener("click", () => pruefe());
    $("bSpeichern")?.addEventListener("click", async () => {
      const def = pruefe();
      if (!def) return;
      const m = $("editorMeldung");
      try {
        const u = S.umfragen.find(x => x.id === bearbeitet.id);
        await DATEN.speichereUmfrage(def, u?.status || "Entwurf", bearbeitet.itemId);
        m.innerHTML = `<div class="meldung ok">Gespeichert.</div>`;
        bearbeitet = null;
        await neuLaden();
      } catch (err) {
        m.innerHTML = `<div class="meldung err">Fehlgeschlagen: ${esc(err.detail || err.message)}</div>`;
      }
    });
  }

  /** Prüft das JSON im Editor und meldet verständlich, was fehlt.
   *  @returns {object|null} die Definition, wenn sie brauchbar ist */
  function pruefe() {
    const m = $("editorMeldung");
    let def;
    try {
      def = JSON.parse($("jsonEditor").value);
    } catch (e) {
      m.innerHTML = `<div class="meldung err">Kein gültiges JSON: ${esc(e.message)}</div>`;
      return null;
    }
    const mangel = [];
    if (!def.id) mangel.push("„id“ fehlt (Kennung für den Link ?u=…)");
    if (!def.titel) mangel.push("„titel“ fehlt");
    if (!Array.isArray(def.fragen) || !def.fragen.length) mangel.push("„fragen“ ist leer");
    const erlaubt = ["abschnitt", "kurztext", "text", "radio", "dropdown", "checkbox", "skala", "matrix"];
    const ids = new Set();
    for (const [i, f] of (def.fragen || []).entries()) {
      if (!f.id) mangel.push(`Frage ${i + 1}: „id“ fehlt`);
      else if (ids.has(f.id)) mangel.push(`Frage ${i + 1}: id „${f.id}“ kommt doppelt vor`);
      else ids.add(f.id);
      if (!erlaubt.includes(f.typ)) mangel.push(`Frage ${i + 1} (${f.id}): unbekannter Typ „${f.typ}“`);
      if (["radio", "dropdown", "checkbox", "matrix"].includes(f.typ) && !(f.optionen || []).length) {
        mangel.push(`Frage ${i + 1} (${f.id}): „optionen“ fehlen`);
      }
    }
    if (mangel.length) {
      m.innerHTML = `<div class="meldung err"><b>Bitte noch beheben:</b><ul>`
        + mangel.map(x => `<li>${esc(x)}</li>`).join("") + `</ul></div>`;
      return null;
    }
    const anzahl = def.fragen.filter(f => f.typ !== "abschnitt").length;
    m.innerHTML = `<div class="meldung ok">In Ordnung: ${anzahl} Fragen in `
      + `${FRAGEBOGEN.schritte(def).length} Schritten.</div>`;
    return def;
  }

  return { zeichne };
})();
