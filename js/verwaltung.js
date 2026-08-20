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
  let rechte = null;        // {eigene:[], fremd:[]} aus AppPermissions

  const teilnahmeLink = id =>
    location.href.replace(/auswertung\.html.*$/, "") + "?u=" + encodeURIComponent(id);

  async function zeichne(container, zustand, reload) {
    box = container; S = zustand; neuLaden = reload;

    let listen = {};
    try { listen = await DATEN.pruefeListen(); } catch { listen = {}; }
    const fehlen = Object.values(listen).filter(l => !l.da).map(l => l.name);

    let rechteFehler = "";
    try { rechte = await DATEN.auswerter(); }
    catch (e) { rechte = null; rechteFehler = e.detail || e.message || String(e); }

    box.innerHTML = `
      ${endpunktBlock()}
      ${einrichtungBlock(fehlen)}
      ${umfragenBlock()}
      ${antwortenBlock()}
      ${auswerterBlock(rechteFehler)}
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

  /** Einzelne Antworten ansehen und löschen, ohne den Umweg über SharePoint.
   *  Gedacht fürs Aufräumen: Probeeinsendungen aus der Einrichtung, versehentlich
   *  doppelt abgeschickte Bögen, offensichtlicher Unsinn. Beim Löschen bleibt es
   *  anonym – es gibt schlicht nichts zu einer Person zurückzuverfolgen.        */
  function antwortenBlock() {
    if (!RECHTE.darfLoeschen()) return "";
    const zeilen = S.alleAntworten || [];
    const grenze = 50;
    const kurz = a => {
      const t = Object.entries(a.antworten || {})
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : (v && typeof v === "object" ? "…" : v)}`)
        .join(" · ");
      return t.length > 110 ? t.slice(0, 110) + " …" : t || "(leer)";
    };

    return `<div class="block">
      <h3>Antworten von „${esc(S.aktuell?.titel || "–")}“</h3>
      <div class="frageinfo">${zeilen.length} Einsendung(en). Löschen ist endgültig –
        SharePoint legt hier keine Fassung ab, die man zurückholen könnte.</div>
      ${zeilen.length ? `<div class="wrap-x"><table class="tab">
        <thead><tr><th>Eingegangen</th><th>Standort</th><th>Bereich</th><th>Antwort</th><th class="keinDruck"></th></tr></thead>
        <tbody>${zeilen.slice(0, grenze).map(a => `<tr>
          <td>${a.eingereicht ? new Date(a.eingereicht).toLocaleString("de-DE") : "–"}</td>
          <td>${esc(a.standort || "–")}</td>
          <td>${esc(a.bereich || "–")}</td>
          <td class="leer">${esc(kurz(a))}</td>
          <td class="keinDruck"><button class="btn sec mini" data-antwortweg="${esc(a.itemId)}">Löschen</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
      ${zeilen.length > grenze ? `<p class="leer">Es werden die neuesten ${grenze} gezeigt.</p>` : ""}`
      : `<p class="leer">Für diese Umfrage liegen keine Antworten vor.</p>`}
      <div id="antwortenMeldung"></div>
    </div>`;
  }

  /** Wer die Auswertung sehen darf – direkt aus der Anwendung heraus pflegbar.
   *  Vorher ging das nur in der SharePoint-Liste oder per PowerShell; für den
   *  laufenden Betrieb ist das zu umständlich, weil Auswerter dazukommen und
   *  wieder wegfallen. Geändert werden ausschließlich Zeilen mit App =
   *  „umfrage1" – Rechte anderer Anwendungen bleiben unberührt. */
  function auswerterBlock(fehler) {
    const darf = RECHTE.darfLoeschen();          // ändern nur als Admin
    const rollen = ["viewer", "editor", "admin"];
    const erklaerung = {
      viewer: "Ergebnisse ansehen und exportieren",
      editor: "zusätzlich Umfragen anlegen und freischalten",
      admin:  "zusätzlich Listen einrichten und Auswerter pflegen"
    };

    if (!rechte) {
      return `<div class="block"><h3>Auswerter</h3>
        <p>⚠️ Die Rechteliste <code>${esc(C.permList)}</code> auf
           <code>${esc(C.permSite)}</code> ist nicht lesbar.</p>
        ${fehler ? `<p class="leer">${esc(fehler)}</p>` : ""}</div>`;
    }

    const zeilen = rechte.eigene.map(e => `<tr>
      <td>${esc(e.email)}${e.email === RECHTE.ctx.email
            ? ` <span class="pille entwurf">Sie</span>` : ""}</td>
      <td>${darf
        ? `<select data-rolle="${esc(e.itemId)}" data-mail="${esc(e.email)}">
             ${rollen.map(r => `<option value="${r}"${r === e.rolle ? " selected" : ""}>${r}</option>`).join("")}
           </select>`
        : esc(e.rolle)}</td>
      <td class="leer">${esc(erklaerung[e.rolle] || "")}</td>
      <td class="keinDruck">${darf
        ? `<button class="btn sec mini" data-weg="${esc(e.itemId)}" data-wegmail="${esc(e.email)}">Entfernen</button>`
        : ""}</td>
    </tr>`).join("");

    return `<div class="block">
      <h3>Auswerter</h3>
      <div class="frageinfo">Nur diese Konten kommen in die Auswertung – alle anderen
        sehen ein Schloss. Gepflegt wird die zentrale Liste
        <code>${esc(C.permList)}</code> (App <code>${esc(C.appKey)}</code>).</div>
      <div class="wrap-x"><table class="tab">
        <thead><tr><th>Konto</th><th>Rolle</th><th>darf</th><th class="keinDruck"></th></tr></thead>
        <tbody>${zeilen || `<tr><td colspan="4" class="leer">Noch niemand eingetragen.</td></tr>`}</tbody>
      </table></div>

      ${darf ? `<div class="filter keinDruck" style="margin:14px 0 0">
        <div class="feld" style="min-width:280px">
          <label for="neuMail">E-Mail-Adresse</label>
          <input type="text" id="neuMail" placeholder="vorname.nachname@dihag.com"
                 autocomplete="off" spellcheck="false">
        </div>
        <div class="feld" style="min-width:140px">
          <label for="neuRolle">Rolle</label>
          <select id="neuRolle">${rollen.map(r => `<option value="${r}">${r}</option>`).join("")}</select>
        </div>
        <div class="schub"><button class="btn" id="bAuswerterNeu">Hinzufügen</button></div>
      </div>` : `<p class="leer">Ändern darf nur die Rolle „admin".</p>`}

      <div id="auswerterMeldung"></div>

      ${rechte.fremd.length ? `<p class="leer" style="margin-top:12px">
        Zusätzlich gelten ${rechte.fremd.length} Sammeleintrag/-einträge mit App „*"
        (${rechte.fremd.map(f => esc(f.email) + " → " + esc(f.rolle)).join(", ")}).
        Sie stammen aus anderen Anwendungen und werden hier nicht verändert.</p>` : ""}
      <p class="leer">${esc((C.hauptAdmins || []).join(", "))} ist laut Konfiguration
        immer Administrator – auch ohne Eintrag in der Liste.</p>
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

    /* ── Antworten löschen ────────────────────────────────────────── */

    box.querySelectorAll("[data-antwortweg]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Diese Antwort endgültig löschen?")) return;
      try {
        await DATEN.loescheAntwort(b.dataset.antwortweg);
        await neuLaden();                    // Antworten neu holen (auch für die Diagramme)
        await zeichne(box, S, neuLaden);     // und danach diesen Block sicher neu aufbauen
        $("antwortenMeldung").innerHTML = `<div class="meldung ok">Antwort gelöscht.</div>`;
      } catch (err) {
        const m = $("antwortenMeldung");
        if (m) m.innerHTML = `<div class="meldung err">Fehlgeschlagen: ${esc(err.detail || err.message)}</div>`;
      }
    }));

    /* ── Auswerter ────────────────────────────────────────────────── */

    const auswerterMeldung = (art, text) => {
      const m = $("auswerterMeldung");
      if (m) m.innerHTML = text ? `<div class="meldung ${art}">${esc(text)}</div>` : "";
    };

    $("bAuswerterNeu")?.addEventListener("click", async () => {
      const mail = $("neuMail").value.trim().toLowerCase();
      const rolle = $("neuRolle").value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
        return auswerterMeldung("err", "Bitte eine vollständige E-Mail-Adresse eingeben.");
      }
      if (rechte.eigene.some(e => e.email === mail)) {
        return auswerterMeldung("info", `${mail} steht bereits in der Liste – `
          + "die Rolle lässt sich oben in der Tabelle ändern.");
      }
      auswerterMeldung("info", "Wird eingetragen …");
      try {
        await DATEN.setzeAuswerter(mail, rolle, null);
        await zeichne(box, S, neuLaden);
        auswerterMeldung("ok", `${mail} darf jetzt als „${rolle}" auswerten.`);
      } catch (err) {
        auswerterMeldung("err", "Fehlgeschlagen: " + (err.detail || err.message));
      }
    });

    box.querySelectorAll("[data-rolle]").forEach(sel => sel.addEventListener("change", async () => {
      const mail = sel.dataset.mail, neu = sel.value;
      // Sich selbst herabzustufen ist der klassische Weg, sich auszusperren.
      if (mail === RECHTE.ctx.email && neu !== "admin"
          && !confirm("Sie ändern Ihre EIGENE Rolle. Danach können Sie die Auswerter "
                    + "möglicherweise nicht mehr pflegen. Fortfahren?")) {
        return zeichne(box, S, neuLaden);
      }
      try {
        await DATEN.setzeAuswerter(mail, neu, sel.dataset.rolle);
        await zeichne(box, S, neuLaden);
        auswerterMeldung("ok", `${mail} ist jetzt „${neu}".`);
      } catch (err) {
        auswerterMeldung("err", "Fehlgeschlagen: " + (err.detail || err.message));
      }
    }));

    box.querySelectorAll("[data-weg]").forEach(b => b.addEventListener("click", async () => {
      const mail = b.dataset.wegmail;
      if (!confirm(`${mail} den Zugriff auf die Auswertung entziehen?`)) return;
      try {
        await DATEN.loescheAuswerter(b.dataset.weg);
        await zeichne(box, S, neuLaden);
        auswerterMeldung("ok", `${mail} wurde entfernt.`);
      } catch (err) {
        auswerterMeldung("err", "Fehlgeschlagen: " + (err.detail || err.message));
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
