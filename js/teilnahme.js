"use strict";

/* Teilnahmeseite – Ablauf
   ───────────────────────
   Startseite → Schritt für Schritt durch die Abschnitte → Danke.

   Bewusste Entscheidungen:
   • Ein Abschnitt je Bildschirm statt aller 15 Fragen am Stück. Am Handy
     und zwischen zwei Schichten ist eine lange Rolle abschreckend; der
     Fortschrittsbalken zeigt, dass es nur wenige Schritte sind.
   • Zwischenstand im localStorage. Wer unterbricht (Schichtwechsel, Akku),
     verliert nichts. Der Stand ist rein lokal und enthält keine Identität.
   • Kein Zwang zur Einmaligkeit: ohne Anmeldung ist sie technisch nicht
     durchsetzbar, und eine echte Sperre wäre mit Anonymität ohnehin nicht
     vereinbar. Es bleibt bei einem Hinweis.                                */

(() => {

  const C = UMFRAGE_CONFIG;
  const $ = id => document.getElementById(id);

  const params    = new URLSearchParams(location.search);
  const umfrageId = params.get("u") || C.standardUmfrage;
  const vorschau  = params.has("vorschau");   // sendet nie, nur zum Ansehen

  const KEY_STAND  = "umfrage_stand_" + umfrageId;
  const KEY_FERTIG = "umfrage_fertig_" + KEY_STAND;

  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: k => { try { localStorage.removeItem(k); } catch {} }
  };

  let def = null;          // Fragebogen-Definition
  let steps = [];          // Schritte
  let i = 0;               // aktueller Schritt
  let state = {};          // Antworten
  let begonnen = 0;        // Zeitstempel Start (Maschinenerkennung)
  let sendet = false;

  /* ── Start ─────────────────────────────────────────────────────── */

  (async function start() {
    try {
      const r = await API.definition(umfrageId);

      const status = String(r.status || "").toLowerCase();
      if (status === "beendet") {
        return zeigeFehler("Diese Umfrage ist abgeschlossen. Vielen Dank für Ihr Interesse!");
      }
      if (!r.def || status === "entwurf") {
        return zeigeFehler("Diese Umfrage ist noch nicht freigegeben.");
      }

      def = r.def;
      steps = FRAGEBOGEN.schritte(def);
      if (!steps.length) throw new Error("Der Fragebogen enthält keine Fragen.");

      if (r.quelle === "vorlage" && r.warnung) {
        console.warn("[Umfrage] Vorlage statt SharePoint-Fassung:", r.warnung);
      }

      document.title = `${def.titel || "Umfrage"} · DIHAG Foundry Group`;
      $("kopfTitel").textContent = def.titel || "Umfrage";
      $("introTitel").textContent = def.titel || "Umfrage";
      $("introUnter").textContent = def.untertitel || "";
      $("introText").textContent = def.einleitung || "";
      if (!API.scharf() || vorschau) $("probelaufHinweis").hidden = false;
      if (C.teilnahmeMerken && ls.get(KEY_FERTIG)) $("wiederHinweis").hidden = false;

      standLaden();
      $("ladeBox").hidden = true;
      $("introBox").hidden = false;
    } catch (e) {
      zeigeFehler(e.message || String(e));
    }
  })();

  function zeigeFehler(text) {
    $("ladeBox").hidden = true;
    $("introBox").hidden = true;
    $("schrittBox").hidden = true;
    $("fehlerText").textContent = text;
    $("fehlerBox").hidden = false;
  }

  /* ── Zwischenstand ─────────────────────────────────────────────── */

  function standLaden() {
    try {
      const roh = ls.get(KEY_STAND);
      if (!roh) return;
      const d = JSON.parse(roh);
      // Nach zwei Wochen ist ein halb ausgefüllter Bogen wertlos.
      if (!d || Date.now() - (d.ts || 0) > 14 * 24 * 3600e3) return ls.del(KEY_STAND);
      state = d.state || {};
      i = Math.min(d.i || 0, steps.length - 1);
      if (Object.keys(state).length) $("startBtn").textContent = "Weiter ausfüllen";
    } catch { ls.del(KEY_STAND); }
  }

  const standSichern = () => ls.set(KEY_STAND, JSON.stringify({ ts: Date.now(), i, state }));

  /* ── Navigation ────────────────────────────────────────────────── */

  $("startBtn").addEventListener("click", () => {
    begonnen = Date.now();
    $("introBox").hidden = true;
    $("schrittBox").hidden = false;
    $("fortschritt").hidden = false;
    zeichne();
  });

  $("zurueckBtn").addEventListener("click", () => {
    if (i === 0) {
      $("schrittBox").hidden = true;
      $("fortschritt").hidden = true;
      $("introBox").hidden = false;
      return;
    }
    i--; standSichern(); zeichne();
  });

  $("weiterBtn").addEventListener("click", async () => {
    const schritt = steps[i];
    const fehlt = FRAGEBOGEN.fehlend(schritt.fragen, state);
    if (fehlt.length) return FRAGEBOGEN.markiere($("fragen"), fehlt);

    if (i < steps.length - 1) { i++; standSichern(); return zeichne(); }
    await absenden();
  });

  function zeichne() {
    const schritt = steps[i];
    const box = $("fragen");
    box.innerHTML = "";
    box.appendChild(FRAGEBOGEN.schrittEl(schritt, state, () => standSichern()));

    const letzter = i === steps.length - 1;
    $("weiterBtn").textContent = letzter ? "Antworten absenden" : "Weiter";
    $("weiterBtn").classList.toggle("senden", letzter);
    $("zurueckBtn").textContent = i === 0 ? "Zur Startseite" : "Zurück";
    $("sendeMeldung").innerHTML = "";

    const p = Math.round(((i + 1) / steps.length) * 100);
    $("balken").style.width = p + "%";
    $("fortschrittText").textContent = `Schritt ${i + 1} von ${steps.length}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Absenden ──────────────────────────────────────────────────── */

  async function absenden() {
    if (sendet) return;

    // Alle Pflichtfragen des gesamten Bogens prüfen – jemand könnte über
    // einen wiederhergestellten Zwischenstand mitten hineingesprungen sein.
    const offen = FRAGEBOGEN.fehlend(def.fragen, state);
    if (offen.length) {
      const s = steps.findIndex(s => s.fragen.some(f => offen.includes(f.id)));
      if (s >= 0 && s !== i) { i = s; zeichne(); }
      return FRAGEBOGEN.markiere($("fragen"), offen);
    }

    const { antworten, kontakt } = FRAGEBOGEN.aufteilen(def, state);
    const kennzahlen = FRAGEBOGEN.kennzahlen(def, state);
    const dauerSek = begonnen ? Math.round((Date.now() - begonnen) / 1000) : 0;

    if (vorschau) {
      meldung("info", "Vorschau – es wurde nichts gesendet. Die Antworten stehen in der Browser-Konsole.");
      console.info("[Vorschau] Antworten:", { antworten, kennzahlen, kontakt });
      return;
    }

    sendet = true;
    $("weiterBtn").disabled = true;
    $("zurueckBtn").disabled = true;
    $("weiterBtn").textContent = "Wird gesendet …";
    meldung("", "");

    try {
      const r = await API.senden(umfrageId, antworten, kennzahlen, kontakt, {
        dauerSek,
        hp: $("hp").value,
        sprache: navigator.language || ""
      });
      ls.del(KEY_STAND);
      if (C.teilnahmeMerken) ls.set(KEY_FERTIG, String(Date.now()));
      $("schrittBox").hidden = true;
      $("fortschritt").hidden = true;
      $("dankeText").textContent = def.abschluss || "Ihre Antworten wurden anonym gespeichert.";
      $("dankeProbelauf").hidden = !r.probelauf;
      $("dankeBox").hidden = false;
      window.scrollTo({ top: 0 });
    } catch (e) {
      sendet = false;
      $("weiterBtn").disabled = false;
      $("zurueckBtn").disabled = false;
      $("weiterBtn").textContent = "Antworten absenden";
      // Bewusst eine eigene, ruhige Formulierung statt der Meldung aus dem Flow:
      // Die ist für die Technik gedacht („Diese Umfrage ist nicht freigeschaltet")
      // und verwirrt jemanden, der gerade fünf Minuten investiert hat. Der genaue
      // Wortlaut steht in der Konsole, für die Fehlersuche.
      console.warn("[Umfrage] Absenden abgelehnt:", e.message || e);
      meldung("err", "Das Absenden hat leider nicht geklappt. Ihre Eingaben bleiben "
        + "erhalten – bitte versuchen Sie es in ein paar Minuten noch einmal. "
        + "Wenn es dann immer noch klemmt, sagen Sie bitte dem Kommunikationsteam Bescheid.");
    }
  }

  function meldung(art, text) {
    $("sendeMeldung").innerHTML = text
      ? `<div class="meldung ${art}">${FRAGEBOGEN.esc(text)}</div>` : "";
  }

})();
