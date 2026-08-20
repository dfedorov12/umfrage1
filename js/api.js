"use strict";

/* Annahmestelle für anonyme Antworten
   ───────────────────────────────────
   Einziger Weg der Teilnahmeseite nach draußen. Sie spricht ausschließlich
   den Power-Automate-Flow an, niemals Microsoft Graph – genau darin liegt
   die Anonymität: Der Flow schreibt mit SEINER Verbindung nach SharePoint,
   die teilnehmende Person meldet sich nirgends an und hinterlässt deshalb
   auch kein „Erstellt von“.

   Zwei Feinheiten, die beim Nachbauen leicht Ärger machen:

   1. Inhaltstyp „text/plain“. Damit gilt die Anfrage als „einfach“ im Sinne
      von CORS und der Browser schickt KEINE OPTIONS-Vorabanfrage. Der
      Power-Automate-Trigger beantwortet OPTIONS nämlich nicht brauchbar.
      Der Rumpf ist trotzdem JSON – der Flow liest ihn mit json(triggerBody()).
   2. Die Antwort des Flows muss den Kopf „Access-Control-Allow-Origin: *“
      tragen, sonst darf der Browser sie nicht lesen (siehe ANLEITUNG-FLOW.md).

   Fehlt der Endpunkt in js/config.js, läuft alles im Probelauf: Der
   Fragebogen funktioniert vollständig, gespeichert wird nichts.            */

const API = (() => {

  const C = UMFRAGE_CONFIG;

  const scharf = () => !!(C.endpunkt || "").trim();

  async function ruf(nutzlast, timeoutMs = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(C.endpunkt, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(nutzlast),
        signal: ctrl.signal
      });
      const roh = await r.text();
      let d = null;
      try { d = roh ? JSON.parse(roh) : null; } catch { /* kein JSON */ }
      if (!r.ok) {
        const msg = d?.fehler || d?.message || roh || `HTTP ${r.status}`;
        const e = new Error(msg);
        e.status = r.status;
        throw e;
      }
      return d ?? {};
    } finally {
      clearTimeout(t);
    }
  }

  /** Fragebogen laden – erst aus SharePoint (über den Flow), sonst aus der
   *  mitgelieferten Vorlage. Der Rückfall ist Absicht: Die Seite bleibt
   *  benutzbar, solange der Flow noch nicht steht oder gerade klemmt.
   *  @returns {Promise<{def:object, quelle:"flow"|"vorlage", status:string, warnung:string}>} */
  async function definition(id) {
    let warnung = "";
    if (scharf()) {
      try {
        const d = await ruf({ aktion: "definition", umfrage: id });
        if (d && d.umfrage) {
          // Der Fragebogen darf als Objekt ODER als Zeichenkette kommen.
          // Grund: Im Power-Automate-Entwurf lässt sich ein Ausdruck, der ein
          // Objekt liefert, nicht mitten in eine JSON-Vorlage schreiben – das
          // ist dort schlicht kein gültiges JSON. Als Zeichenkette
          // ("@{outputs('Umfrage')?['FragenJson']}") ist die Vorlage gültig,
          // und das Auspacken übernimmt diese Zeile.
          let def = d.umfrage;
          if (typeof def === "string") {
            try { def = JSON.parse(def); }
            catch { throw new Error("Der Fragebogen ist beschädigt (kein gültiges JSON)."); }
          }
          return { def, quelle: "flow", status: d.status || "Aktiv", warnung: "" };
        }
        // Der Flow hat geantwortet, liefert aber bewusst keinen Fragebogen:
        // Die Umfrage ist noch Entwurf, bereits beendet oder gar nicht
        // angelegt. Das ist eine klare Absage – dann darf NICHT auf die
        // Vorlage im Repository zurückgefallen werden, sonst wäre ein Entwurf
        // für alle sichtbar oder eine beendete Umfrage wieder offen.
        // Auf die Vorlage wird nur zurückgegriffen, wenn der Flow gar nicht
        // erreichbar ist (siehe catch).
        if (d && d.ok === false) {
          return { def: null, quelle: "flow", status: d.status || "Unbekannt",
                   warnung: d.fehler || "" };
        }
        warnung = d?.fehler || "Der Server kennt diese Umfrage nicht.";
      } catch (e) {
        warnung = e.message || String(e);
        console.warn("[API] Fragebogen konnte nicht geladen werden:", warnung);
      }
    }
    const r = await fetch(`umfragen/${encodeURIComponent(id)}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`Der Fragebogen „${id}“ wurde nicht gefunden.`);
    return { def: await r.json(), quelle: "vorlage", status: "Aktiv", warnung };
  }

  /** Antworten absenden.
   *  @param {string} umfrageId
   *  @param {object} antworten  anonyme Antworten (ohne Kontaktangabe!)
   *  @param {object} kennzahlen {standort, bereich} für eigene Spalten
   *  @param {string} kontakt    freiwillige Kontaktangabe, getrennt gespeichert
   *  @param {object} meta       {dauerSek, hp, sprache} – Schutz vor Maschinen */
  async function senden(umfrageId, antworten, kennzahlen, kontakt, meta) {
    if (!scharf()) {
      // Probelauf: nichts speichern, aber ehrlich zurückmelden.
      console.info("[API] Probelauf – es wurde nichts gespeichert:",
        { umfrageId, antworten, kennzahlen, kontakt, meta });
      await new Promise(r => setTimeout(r, 400));
      return { ok: true, probelauf: true };
    }
    const d = await ruf({
      aktion: "antwort",
      umfrage: umfrageId,
      antworten,
      standort: kennzahlen.standort || "",
      bereich: kennzahlen.bereich || "",
      kontakt: kontakt || "",
      meta: meta || {}
    });
    if (d && d.ok === false) throw new Error(d.fehler || "Die Antwort wurde abgelehnt.");
    return { ok: true, probelauf: false };
  }

  return { scharf, definition, senden };
})();
