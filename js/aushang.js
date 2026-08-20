"use strict";

/* Aushang fürs Schwarze Brett
   ───────────────────────────
   Erzeugt aus einer Umfrage ein druckfertiges A4-Blatt mit QR-Code.
   Aufruf: aushang.html?u=<umfrage-id>[&bis=JJJJ-MM-TT]

   Die Seite verlangt keine Anmeldung – sie zeigt nur, was ohnehin öffentlich
   ist (Titel und Link der Umfrage). Wer den Aushang macht, sitzt selten am
   eigenen Rechner; ein Anmeldezwang wäre hier reine Hürde.

   Fehlerkorrektur bewusst „M": Ein Aushang im Werk bekommt Fingerabdrücke,
   Kaffeeflecken und Reißzwecken ab. „M" verkraftet rund 15 Prozent Schaden
   und macht den Code trotzdem nicht wesentlich größer.                      */

(() => {

  const C = UMFRAGE_CONFIG;
  const $ = id => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const umfrageId = params.get("u") || C.standardUmfrage;

  const link = location.href.replace(/aushang\.html.*$/, "") + "?u=" + encodeURIComponent(umfrageId);

  let letztesSvg = "";

  /* ── Aufbau ────────────────────────────────────────────────────── */

  function zeichneQr() {
    const mm = Number($("fGroesse").value) || 110;
    // 1 mm ≈ 3.7795 px; die Größe steht im SVG, damit der Ausdruck stimmt.
    letztesSvg = QR.svg(link, { ecc: "M", rand: 4, groesse: Math.round(mm * 3.7795) });
    $("qr").innerHTML = letztesSvg;
    $("qr").querySelector("svg").style.width = mm + "mm";
    $("qr").querySelector("svg").style.height = mm + "mm";
  }

  function zeichneFrist() {
    const wert = $("fFrist").value;
    if (!wert) { $("frist").hidden = true; return; }
    const d = new Date(wert + "T00:00:00");
    $("frist").textContent = "Bitte bis " + d.toLocaleDateString("de-DE",
      { day: "2-digit", month: "long", year: "numeric" }) + " mitmachen";
    $("frist").hidden = false;
  }

  $("fUeberschrift").addEventListener("input", e => { $("ueberschrift").textContent = e.target.value; });
  $("fZusatz").addEventListener("input", e => { $("zusatz").textContent = e.target.value; });
  $("fFrist").addEventListener("change", zeichneFrist);
  $("fGroesse").addEventListener("change", zeichneQr);
  $("bDrucken").addEventListener("click", () => window.print());

  $("bSvg").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([letztesSvg], { type: "image/svg+xml" }));
    a.download = `qr-${umfrageId}.svg`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  /* ── Start ─────────────────────────────────────────────────────── */

  (async function start() {
    $("adresse").textContent = link.replace(/^https?:\/\//, "");
    zeichneQr();

    // Überschrift aus der Umfrage holen – klappt es nicht (Umfrage noch nicht
    // freigeschaltet, Flow gerade stumm), bleibt der Aushang trotzdem brauchbar.
    let titel = "Ihre Meinung zählt";
    let zusatz = "Anonyme Umfrage – 5 Minuten, ohne Anmeldung";
    try {
      const r = await API.definition(umfrageId);
      if (r.def) {
        titel = r.def.titel || titel;
        zusatz = r.def.untertitel
          ? `${r.def.untertitel} – ${r.def.dauerMinuten || 5} Minuten, anonym, ohne Anmeldung`
          : zusatz;
      }
    } catch (e) {
      console.warn("[Aushang] Umfrage nicht abrufbar:", e.message || e);
    }

    $("ueberschrift").textContent = titel;
    $("zusatz").textContent = zusatz;
    $("fUeberschrift").value = titel;
    $("fZusatz").value = zusatz;

    const bis = params.get("bis");
    if (bis && /^\d{4}-\d{2}-\d{2}$/.test(bis)) { $("fFrist").value = bis; zeichneFrist(); }

    document.title = `Aushang · ${titel}`;
  })();

})();
