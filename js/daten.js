"use strict";

/* SharePoint-Zugriff der Auswertung
   ─────────────────────────────────
   Drei Listen auf `UMFRAGE_CONFIG.site` (anzulegen mit
   provision-umfragen-listen.ps1 oder in der Verwaltung per Knopfdruck):

   Umfragen           Title · UmfrageId · Status · Start · Ende · FragenJson
   Umfrage_Antworten  Title · UmfrageId · AntwortJson · Standort · Bereich
                      · Eingereicht · DauerSek · Quelle
   Umfrage_Kontakte   Title · UmfrageId · Kontakt · Eingereicht

   Warum die Antworten als JSON in einer Spalte liegen und nicht je Frage
   eine eigene Spalte bekommen: Jede Umfrage hat andere Fragen. Mit einer
   Spalte je Frage müsste für jede neue Umfrage die Liste umgebaut werden –
   genau das soll die Plattform ja vermeiden. Ausgewertet wird im Browser;
   bei der Größenordnung einer Mitarbeiterbefragung (einige hundert bis
   wenige tausend Zeilen) ist das unkritisch. Standort und Bereich stehen
   zusätzlich in eigenen Spalten, damit man in SharePoint selbst filtern
   und gruppieren kann, ohne JSON zu lesen.                                */

const DATEN = (() => {

  const C = UMFRAGE_CONFIG;
  const L = C.lists;

  const F_UMFRAGEN  = ["Title", "UmfrageId", "Status", "Start", "Ende", "FragenJson"];
  const F_ANTWORTEN = ["Title", "UmfrageId", "AntwortJson", "Standort", "Bereich",
                       "Eingereicht", "DauerSek", "Quelle"];
  const F_KONTAKTE  = ["Title", "UmfrageId", "Kontakt", "Eingereicht"];

  const jsonOderNull = s => { try { return JSON.parse(s); } catch { return null; } };

  /* ── Umfragen ──────────────────────────────────────────────────── */

  /** Alle Umfragen. `null`, wenn die Liste noch nicht existiert. */
  async function umfragen() {
    const rows = await GRAPH.listItems(C.site, L.umfragen, F_UMFRAGEN);
    if (!rows) return null;
    return rows.map(r => ({
      itemId: r.id,
      id:     r.UmfrageId || "",
      titel:  r.Title || r.UmfrageId || "(ohne Titel)",
      status: r.Status || "Entwurf",
      start:  r.Start || "",
      ende:   r.Ende || "",
      def:    jsonOderNull(r.FragenJson) || null,
      json:   r.FragenJson || ""
    })).filter(u => u.id);
  }

  /** Anlegen oder aktualisieren. Schlüssel ist UmfrageId, nicht die Item-ID. */
  async function speichereUmfrage(def, status, itemId) {
    const felder = {
      Title:      def.titel || def.id,
      UmfrageId:  def.id,
      Status:     status || "Entwurf",
      FragenJson: JSON.stringify(def, null, 1)
    };
    if (def.start) felder.Start = def.start;
    if (def.ende)  felder.Ende  = def.ende;
    return itemId
      ? GRAPH.updateItem(C.site, L.umfragen, itemId, felder)
      : GRAPH.addItem(C.site, L.umfragen, felder);
  }

  async function setzeStatus(itemId, status) {
    return GRAPH.updateItem(C.site, L.umfragen, itemId, { Status: status });
  }

  /* ── Antworten ─────────────────────────────────────────────────── */

  /** Antworten einer Umfrage, neueste zuerst.
   *  Gefiltert wird bewusst im Browser: Ein $filter auf ein Textfeld
   *  verlangt in SharePoint einen Index, sonst scheitert die Abfrage bei
   *  über 5.000 Elementen – und zwar unzuverlässig, was die Auswertung
   *  gelegentlich leer aussehen ließe. */
  async function antworten(umfrageId) {
    const rows = await GRAPH.listItems(C.site, L.antworten, F_ANTWORTEN);
    if (!rows) return null;
    return rows
      .filter(r => !umfrageId || r.UmfrageId === umfrageId)
      .map(r => ({
        itemId:     r.id,
        umfrage:    r.UmfrageId || "",
        antworten:  jsonOderNull(r.AntwortJson) || {},
        standort:   r.Standort || "",
        bereich:    r.Bereich || "",
        dauerSek:   Number(r.DauerSek || 0),
        quelle:     r.Quelle || "",
        eingereicht: r.Eingereicht || r.Created || ""
      }))
      .sort((a, b) => String(b.eingereicht).localeCompare(String(a.eingereicht)));
  }

  const loescheAntwort = itemId => GRAPH.deleteItem(C.site, L.antworten, itemId);

  /* ── Kontakte (freiwillige Angaben, getrennt gespeichert) ──────── */

  async function kontakte(umfrageId) {
    const rows = await GRAPH.listItems(C.site, L.kontakte, F_KONTAKTE);
    if (!rows) return null;
    return rows
      .filter(r => !umfrageId || r.UmfrageId === umfrageId)
      .map(r => ({
        itemId: r.id,
        umfrage: r.UmfrageId || "",
        kontakt: r.Kontakt || "",
        eingereicht: r.Eingereicht || r.Created || ""
      }));
  }

  /* ── Einrichtung ───────────────────────────────────────────────── */

  /** Legt fehlende Listen an. Braucht Schreibrechte auf der Site.
   *  @returns {Promise<string[]>} Namen der neu angelegten Listen */
  async function listenAnlegen() {
    const g = GRAPH;
    const neu = [];
    // GRAPH.colDate liefert ein reines Datum; hier wird die Uhrzeit gebraucht,
    // damit sich der Eingang später nach Tagesverlauf auswerten lässt.
    const colZeitpunkt = n => ({ name: n, dateTime: { format: "dateTime" } });
    const anlegen = async (name, spalten) => {
      if (await g.listId(C.site, name)) return;
      await g.ensureList(C.site, name, spalten);
      neu.push(name);
    };
    await anlegen(L.umfragen, [
      g.colText("UmfrageId"),
      // Auswahlspalte wie im Provisionierungsskript, damit beide Wege
      // dieselbe Liste ergeben.
      { name: "Status", choice: { choices: ["Entwurf", "Aktiv", "Beendet"],
                                  displayAs: "dropDownMenu" } },
      g.colDate("Start"), g.colDate("Ende"), g.colNote("FragenJson")
    ]);
    await anlegen(L.antworten, [
      g.colText("UmfrageId"), g.colNote("AntwortJson"),
      g.colText("Standort"), g.colText("Bereich"),
      colZeitpunkt("Eingereicht"), g.colNum("DauerSek"), g.colText("Quelle")
    ]);
    await anlegen(L.kontakte, [
      g.colText("UmfrageId"), g.colText("Kontakt"), colZeitpunkt("Eingereicht")
    ]);
    g.clearColumnCache();
    return neu;
  }

  /** Welche Listen fehlen noch? */
  async function pruefeListen() {
    const out = {};
    for (const [schluessel, name] of Object.entries(L)) {
      out[schluessel] = { name, da: !!(await GRAPH.listId(C.site, name)) };
    }
    return out;
  }

  /** Vorlage aus dem Repository laden (umfragen/<id>.json). */
  async function vorlage(id) {
    const r = await fetch(`umfragen/${encodeURIComponent(id)}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`Vorlage „${id}“ nicht gefunden.`);
    return r.json();
  }

  return {
    umfragen, speichereUmfrage, setzeStatus,
    antworten, loescheAntwort, kontakte,
    listenAnlegen, pruefeListen, vorlage
  };
})();
