"use strict";

/* Fragebogen-Renderer
   ───────────────────
   Kennt nur die Definition (JSON) und einen Antwort-Zustand. Er spricht
   weder mit Graph noch mit dem Flow – dadurch lässt er sich unverändert
   für die Teilnahme UND für die Vorschau in der Verwaltung benutzen.

   Fragetypen:
     abschnitt  Überschrift; beginnt zugleich einen neuen Schritt
     kurztext   einzeilige Eingabe
     text       mehrzeilige Eingabe   (zeilen: Anzahl)
     radio      Einfachauswahl        (optionen[])
     dropdown   Einfachauswahl als Liste
     checkbox   Mehrfachauswahl       (optionen[], sonstiges: true)
     skala      Skala min…max         (minLabel, maxLabel)
     matrix     je Zeile eine Skala   (optionen[] als Zeilen)

   Zusatzangaben je Frage:
     pflicht      muss beantwortet werden
     auswertung   "standort" | "bereich" – der Wert wird zusätzlich in eine
                  eigene SharePoint-Spalte geschrieben, damit man danach
                  filtern kann, ohne das JSON zu durchsuchen
     kontakt      Freiwillige Kontaktangabe. Wird NICHT beim Antwortsatz
                  gespeichert, sondern in einer getrennten Liste – sonst
                  wäre die Umfrage für diese Person nicht mehr anonym.     */

const FRAGEBOGEN = (() => {

  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const istFrage = f => f.typ !== "abschnitt";

  /** Zerlegt die flache Fragenliste in Schritte: jeder Abschnitt beginnt
   *  einen neuen. Fragen vor dem ersten Abschnitt bilden einen Schritt ohne
   *  Überschrift.
   *
   *  Lange Abschnitte werden zusätzlich geteilt: Der Newsletter-Bogen hat im
   *  ersten Abschnitt neun Fragen am Stück – am Handy eine abschreckende
   *  Rolle. Mehrere kurze Bildschirme mit sichtbarem Fortschritt werden
   *  erfahrungsgemäß eher zu Ende ausgefüllt. Die Überschrift wiederholt
   *  sich dabei, die Reihenfolge der Fragen bleibt unverändert.
   *
   *  @param {number} [maxProSchritt] 0 = nicht teilen */
  function schritte(def, maxProSchritt) {
    const max = maxProSchritt ?? def.proSchritt
      ?? (typeof UMFRAGE_CONFIG !== "undefined" ? UMFRAGE_CONFIG.maxFragenProSchritt : 0) ?? 0;
    const grob = [];
    for (const f of (def.fragen || [])) {
      if (f.typ === "abschnitt" || !grob.length) {
        grob.push({ kopf: f.typ === "abschnitt" ? f : null, fragen: [] });
        if (f.typ === "abschnitt") continue;
      }
      grob[grob.length - 1].fragen.push(f);
    }
    const out = [];
    for (const s of grob) {
      if (!s.fragen.length) { if (s.kopf) out.push(s); continue; }
      if (!max || s.fragen.length <= max) { out.push(s); continue; }
      // Gleichmäßig aufteilen statt „voll, voll, Rest“ – neun Fragen ergeben
      // 3+3+3 und keinen Schritt mit einer einzelnen Frage.
      const teile = Math.ceil(s.fragen.length / max);
      const proTeil = Math.ceil(s.fragen.length / teile);
      for (let i = 0; i < s.fragen.length; i += proTeil) {
        out.push({ kopf: s.kopf, fragen: s.fragen.slice(i, i + proTeil) });
      }
    }
    return out;
  }

  /** Ist die Frage beantwortet? */
  function beantwortet(f, state) {
    const v = state[f.id];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (f.typ === "matrix") return Object.keys(v).length >= (f.optionen || []).length;
    return true;
  }

  /** @returns {string[]} IDs der unbeantworteten Pflichtfragen */
  function fehlend(fragen, state) {
    return fragen.filter(f => istFrage(f) && f.pflicht && !beantwortet(f, state)).map(f => f.id);
  }

  /* ── Bausteine ─────────────────────────────────────────────────── */

  function optionZeile(name, typ, wert, gewaehlt) {
    const l = document.createElement("label");
    l.className = "opt" + (gewaehlt ? " gewaehlt" : "");
    l.innerHTML = `<input type="${typ}" name="${esc(name)}" value="${esc(wert)}"${gewaehlt ? " checked" : ""}>`
      + `<span>${esc(wert)}</span>`;
    return l;
  }

  function skalaBlock(f, wert, setzen) {
    const wrap = document.createElement("div");
    const min = f.min ?? 1, max = f.max ?? 5;
    const zeile = document.createElement("div");
    zeile.className = "skala";
    for (let i = min; i <= max; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = String(i);
      b.setAttribute("aria-pressed", String(wert === i));
      b.setAttribute("aria-label", `${i} von ${max}`);
      b.addEventListener("click", () => {
        setzen(i);
        [...zeile.children].forEach(c => c.setAttribute("aria-pressed", String(c === b)));
      });
      zeile.appendChild(b);
    }
    wrap.appendChild(zeile);
    if (f.minLabel || f.maxLabel) {
      const lb = document.createElement("div");
      lb.className = "skala-labels";
      lb.innerHTML = `<span>${esc(f.minLabel || "")}</span><span>${esc(f.maxLabel || "")}</span>`;
      wrap.appendChild(lb);
    }
    return wrap;
  }

  /* ── Eine Frage ────────────────────────────────────────────────── */

  /** @param {object} f Frage
   *  @param {object} state Antwort-Zustand (wird direkt beschrieben)
   *  @param {function} [onChange] nach jeder Eingabe
   *  @returns {HTMLElement} */
  function frageEl(f, state, onChange = () => {}) {
    const el = document.createElement("div");
    el.className = "frage";
    el.dataset.frage = f.id;

    if (f.typ === "abschnitt") {
      el.className = "abschnitt-titel";
      el.innerHTML = `<h2>${esc(f.text)}</h2>` + (f.hilfe ? `<p>${esc(f.hilfe)}</p>` : "");
      return el;
    }

    el.innerHTML = `<div class="text">${esc(f.text)}`
      + (f.pflicht ? `<span class="pflicht" title="Pflichtfrage">*</span>` : "")
      + `</div>` + (f.hilfe ? `<div class="hilfe">${esc(f.hilfe)}</div>` : "");

    const setzen = w => { state[f.id] = w; el.classList.remove("fehlt"); onChange(f, w); };

    if (f.typ === "skala") {
      el.appendChild(skalaBlock(f, state[f.id], setzen));

    } else if (f.typ === "matrix") {
      const box = document.createElement("div");
      state[f.id] = state[f.id] || {};
      for (const zeile of (f.optionen || [])) {
        const z = document.createElement("div");
        z.className = "matrix-zeile";
        z.innerHTML = `<div class="mz-text">${esc(zeile)}</div>`;
        z.appendChild(skalaBlock(
          { min: f.matrixMin ?? 1, max: f.matrixMax ?? 5,
            minLabel: f.matrixMinLabel, maxLabel: f.matrixMaxLabel },
          state[f.id][zeile],
          w => { state[f.id][zeile] = w; el.classList.remove("fehlt"); onChange(f, state[f.id]); }));
        box.appendChild(z);
      }
      el.appendChild(box);

    } else if (f.typ === "dropdown") {
      const s = document.createElement("select");
      s.innerHTML = `<option value="">– bitte auswählen –</option>`
        + (f.optionen || []).map(o => `<option${state[f.id] === o ? " selected" : ""}>${esc(o)}</option>`).join("");
      s.addEventListener("change", () => setzen(s.value));
      el.appendChild(s);

    } else if (f.typ === "radio") {
      const box = document.createElement("div");
      box.className = "optionen";
      for (const o of (f.optionen || [])) {
        const l = optionZeile(f.id, "radio", o, state[f.id] === o);
        l.addEventListener("change", () => {
          setzen(o);
          [...box.children].forEach(c => c.classList.toggle("gewaehlt", c === l));
        });
        box.appendChild(l);
      }
      el.appendChild(box);

    } else if (f.typ === "checkbox") {
      const box = document.createElement("div");
      box.className = "optionen";
      const gewaehlt = () => (state[f.id] = state[f.id] || []);
      for (const o of (f.optionen || [])) {
        const l = optionZeile(f.id, "checkbox", o, gewaehlt().includes(o));
        l.addEventListener("change", () => {
          const inp = l.querySelector("input");
          const arr = gewaehlt();
          const i = arr.indexOf(o);
          if (inp.checked && i < 0) arr.push(o);
          if (!inp.checked && i >= 0) arr.splice(i, 1);
          l.classList.toggle("gewaehlt", inp.checked);
          el.classList.remove("fehlt");
          onChange(f, arr);
        });
        box.appendChild(l);
      }
      el.appendChild(box);

      if (f.sonstiges) {
        const sk = f.id + "_sonstiges";
        const l = optionZeile(f.id, "checkbox", "Sonstiges", gewaehlt().includes("Sonstiges"));
        const inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = "Was noch?";
        inp.value = state[sk] || "";
        inp.hidden = !gewaehlt().includes("Sonstiges");
        l.addEventListener("change", () => {
          const cb = l.querySelector('input[type="checkbox"]');
          const arr = gewaehlt();
          const i = arr.indexOf("Sonstiges");
          if (cb.checked && i < 0) arr.push("Sonstiges");
          if (!cb.checked && i >= 0) { arr.splice(i, 1); state[sk] = ""; inp.value = ""; }
          l.classList.toggle("gewaehlt", cb.checked);
          inp.hidden = !cb.checked;
          if (cb.checked) inp.focus();
          onChange(f, arr);
        });
        // onChange auch hier auslösen, sonst geht der Freitext beim
        // Zwischenspeichern verloren (die Auswahl allein wird gesichert).
        inp.addEventListener("input", () => { state[sk] = inp.value; onChange(f, state[f.id]); });
        box.appendChild(l);
        box.appendChild(inp);
      }

    } else if (f.typ === "kurztext") {
      const i = document.createElement("input");
      i.type = "text";
      i.value = state[f.id] || "";
      if (f.platzhalter) i.placeholder = f.platzhalter;
      i.addEventListener("input", () => setzen(i.value));
      el.appendChild(i);

    } else {   // text
      const t = document.createElement("textarea");
      t.rows = f.zeilen || 3;
      t.value = state[f.id] || "";
      if (f.platzhalter) t.placeholder = f.platzhalter;
      t.addEventListener("input", () => setzen(t.value));
      el.appendChild(t);
    }

    if (f.kontakt) {
      const h = document.createElement("div");
      h.className = "meldung info";
      h.style.marginTop = "10px";
      h.innerHTML = "🔒 Freiwillig. Diese Angabe wird <b>getrennt</b> von Ihren Antworten "
        + "gespeichert und lässt sich ihnen nicht zuordnen.";
      el.appendChild(h);
    }

    return el;
  }

  /** Zeichnet einen kompletten Schritt in einen Container. */
  function schrittEl(schritt, state, onChange) {
    const frag = document.createDocumentFragment();
    if (schritt.kopf) frag.appendChild(frageEl(schritt.kopf, state, onChange));
    for (const f of schritt.fragen) frag.appendChild(frageEl(f, state, onChange));
    return frag;
  }

  /** Markiert fehlende Pflichtantworten und springt zur ersten. */
  function markiere(container, ids) {
    container.querySelectorAll(".frage.fehlt").forEach(e => {
      e.classList.remove("fehlt");
      e.querySelector(".fehler")?.remove();
    });
    for (const id of ids) {
      const e = container.querySelector(`[data-frage="${CSS.escape(id)}"]`);
      if (!e) continue;
      e.classList.add("fehlt");
      const m = document.createElement("div");
      m.className = "fehler";
      m.textContent = "Bitte beantworten Sie diese Frage.";
      e.appendChild(m);
    }
    if (ids.length) {
      container.querySelector(`[data-frage="${CSS.escape(ids[0])}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /** Trennt den Antwort-Zustand in „anonyme Antworten“ und „Kontakt“. */
  function aufteilen(def, state) {
    const antworten = {};
    let kontakt = "";
    for (const f of (def.fragen || [])) {
      if (!istFrage(f)) continue;
      if (f.kontakt) { kontakt = String(state[f.id] || "").trim(); continue; }
      const v = state[f.id];
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
      antworten[f.id] = v;
      const sk = f.id + "_sonstiges";
      if (state[sk]) antworten[sk] = state[sk];
    }
    return { antworten, kontakt };
  }

  /** Werte, die zusätzlich in eigene Spalten wandern (Filter der Auswertung). */
  function kennzahlen(def, state) {
    const out = { standort: "", bereich: "" };
    for (const f of (def.fragen || [])) {
      if (f.auswertung && out[f.auswertung] !== undefined) {
        out[f.auswertung] = String(state[f.id] || "");
      }
    }
    return out;
  }

  return { esc, istFrage, schritte, frageEl, schrittEl, fehlend, markiere,
           beantwortet, aufteilen, kennzahlen };
})();

if (typeof module !== "undefined") module.exports = FRAGEBOGEN;   // für die Tests
