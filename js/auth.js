"use strict";

/* Anmeldung – OAuth2 Authorization Code Flow mit PKCE (ohne MSAL-Bibliothek).
   Übernommen aus „Rund um den Job“/Orgchart, dort seit Monaten im Einsatz.

   NUR für auswertung.html. Die Teilnahmeseite (index.html) lädt diese Datei
   bewusst nicht – wer an der Umfrage teilnimmt, meldet sich nirgends an.

   Ablauf:
   1. Token im sessionStorage?            → sofort weiter
   2. Sonst stiller SSO-Versuch (prompt=none) über einen Redirect.
      Da alle Nutzer bereits am M365-Tenant angemeldet sind, kommt der
      Browser ohne jede Interaktion mit einem Code zurück.
   3. Schlägt das fehl (login_required / interaction_required / mehrere
      Konten), wird automatisch die interaktive Anmeldung gestartet.
   4. Erst wenn auch die fehlschlägt, erscheint ein Button.                */

const AUTH = (() => {

  const TID  = UMFRAGE_CONFIG.tenantId;
  const CID  = UMFRAGE_CONFIG.clientId;

  /** Redirect-URI aus der aufgerufenen Adresse ableiten, damit dieselbe
   *  Auslieferung unter mehreren Hosts funktioniert (eigene Domäne
   *  https://umfrage.dihag.de/ und Ausweichadresse github.io/umfrage1/).
   *
   *  ACHTUNG, hier steckte ein Fehler: Die Fassung aus „Rund um den Job“ hat
   *  nur „index.html“ abgeschnitten und danach IMMER einen Schrägstrich
   *  angehängt. Dort lief die Anmeldung nur auf der Startseite, hier läuft sie
   *  auf `auswertung.html` – daraus wurde `…/auswertung.html/`, und genau diese
   *  Adresse gibt es auf GitHub Pages nicht: Nach dem Anmelden landete man auf
   *  einer 404-Seite, der Code wurde nie eingelöst.
   *
   *  Jetzt gilt: Endet der Pfad auf eine .html-Datei, ist die Seite selbst die
   *  Rückkehradresse (nur „index.html“ wird auf das Verzeichnis gekürzt).
   *  Jede so entstehende Adresse muss in Entra als Redirect-URI der
   *  Single-Page-Anwendung stehen, sonst bricht der Login mit AADSTS50011 ab.
   *
   *    /auswertung.html  →  https://host/auswertung.html
   *    /index.html       →  https://host/
   *    /                 →  https://host/                                   */
  const RURI = (() => {
    let p = location.pathname;
    if (/\.html?$/i.test(p)) {
      p = p.replace(/index\.html?$/i, "");
    } else if (!p.endsWith("/")) {
      p += "/";
    }
    return location.origin + p;
  })();

  const SC   = UMFRAGE_CONFIG.scopes.join(" ");
  const AU   = `https://login.microsoftonline.com/${TID}/oauth2/v2.0/authorize`;
  const TU   = `https://login.microsoftonline.com/${TID}/oauth2/v2.0/token`;

  let _tok = null;
  let _exp = 0;

  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  async function mkPKCE() {
    const v = b64(crypto.getRandomValues(new Uint8Array(32)));
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
    return { v, c: b64(d) };
  }

  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: k => { try { sessionStorage.removeItem(k); } catch {} }
  };

  function saveTok(t, exp) { _tok = t; _exp = exp; ss.set("umfr_t", t); ss.set("umfr_e", String(exp)); }

  function loadTok() {
    const t = ss.get("umfr_t"), e = +ss.get("umfr_e");
    // 60 s Sicherheitspuffer vor Ablauf
    if (t && Date.now() < e - 60000) { _tok = t; _exp = e; return t; }
    return null;
  }

  /** Access-Token für Graph. Wirft, wenn nicht (mehr) angemeldet. */
  async function getToken() {
    if (_tok && Date.now() < _exp - 60000) return _tok;
    const c = loadTok();
    if (c) return c;
    throw new Error("Nicht angemeldet");
  }

  /** Liest die Nutzlast des Access-Tokens aus (nur zur Diagnose – die
   *  Signatur wird bewusst nicht geprüft, das macht Graph).
   *  @returns {{scopes:string[], upn:string, appId:string, exp:Date|null}|null} */
  function tokenInfo() {
    const t = _tok || loadTok();
    if (!t) return null;
    try {
      const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(atob(p + "=".repeat((4 - p.length % 4) % 4))
        .split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
      const d = JSON.parse(json);
      return {
        scopes: String(d.scp || "").split(" ").filter(Boolean),
        upn: d.upn || d.preferred_username || "",
        appId: d.appid || d.azp || "",
        exp: d.exp ? new Date(d.exp * 1000) : null
      };
    } catch { return null; }
  }

  /** Startet den Redirect zur Anmeldeseite.
   *  @param {"none"|"select_account"|"consent"} promptMode
   *  @param {string[]} [extraScopes] Zusätzliche Berechtigungen, die nur bei
   *    Bedarf angefordert werden (z. B. Schreibrechte für den Import). Sie
   *    stehen bewusst NICHT in UMFRAGE_CONFIG.scopes – sonst müsste jede
   *    Anmeldung im Tenant dafür zustimmen. */
  async function startLogin(promptMode, extraScopes = []) {
    const { v, c } = await mkPKCE();
    const state = b64(crypto.getRandomValues(new Uint8Array(16)));
    ss.set("umfr_pv", v);
    ss.set("umfr_ps", state);
    ss.set("umfr_pm", promptMode);
    // Zusatz-Scopes über den Redirect hinweg merken: scheitert der stille
    // Versuch, muss der interaktive Nachschlag dieselben anfordern.
    ss.set("umfr_px", JSON.stringify(extraScopes));
    const scope = [...new Set([...UMFRAGE_CONFIG.scopes, ...extraScopes])].join(" ");
    const p = new URLSearchParams({
      client_id: CID,
      response_type: "code",
      redirect_uri: RURI,
      scope: scope + " offline_access",
      state,
      code_challenge: c,
      code_challenge_method: "S256",
      prompt: promptMode
    });
    location.href = AU + "?" + p.toString();
  }

  /** Wertet die Rückkehr vom Anmelde-Redirect aus.
   *  @returns {"ok"|"none"|{error:string}} */
  async function handleRedirect() {
    const p = new URLSearchParams(location.search);
    const code = p.get("code");
    const err  = p.get("error");
    const wasSilent = ss.get("umfr_pm") === "none";

    let extra = [];
    try { extra = JSON.parse(ss.get("umfr_px") || "[]"); } catch {}

    if (err) {
      history.replaceState({}, document.title, location.pathname);
      ss.del("umfr_pm");
      // Stiller Versuch gescheitert → interaktiv nachlegen, mit denselben
      // Zusatz-Scopes (sonst käme ein Token ohne die angeforderten Rechte).
      if (wasSilent) { await startLogin("select_account", extra); return "redirecting"; }
      return { error: p.get("error_description") || err };
    }

    if (!code) return "none";

    if (p.get("state") !== ss.get("umfr_ps")) {
      history.replaceState({}, document.title, location.pathname);
      return { error: "Ungültiger State – bitte Seite neu laden." };
    }
    const v = ss.get("umfr_pv");
    if (!v) {
      history.replaceState({}, document.title, location.pathname);
      return { error: "PKCE-Verifier fehlt – bitte Seite neu laden." };
    }

    history.replaceState({}, document.title, location.pathname);

    const r = await fetch(TU, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CID,
        grant_type: "authorization_code",
        code,
        redirect_uri: RURI,
        code_verifier: v
      }).toString()
    });
    const d = await r.json().catch(() => ({ error: "Antwort nicht lesbar" }));

    ss.del("umfr_pv"); ss.del("umfr_ps"); ss.del("umfr_pm"); ss.del("umfr_px");

    if (d.error) {
      if (wasSilent) { await startLogin("select_account"); return "redirecting"; }
      return { error: d.error_description || d.error };
    }
    saveTok(d.access_token, Date.now() + (d.expires_in || 3600) * 1000);
    return "ok";
  }

  /** Kompletter Anmelde-Ablauf beim Seitenstart.
   *  @returns {"ok"|"redirecting"|{error:string}} */
  async function signIn() {
    if (location.search.includes("code=") || location.search.includes("error=")) {
      const r = await handleRedirect();
      if (r !== "none") return r;
    }
    if (loadTok()) return "ok";
    // Noch kein stiller Versuch in dieser Sitzung? → automatisch anmelden.
    await startLogin("none");
    return "redirecting";
  }

  function logout() {
    try { sessionStorage.clear(); } catch {}
    _tok = null; _exp = 0;
    location.href = `https://login.microsoftonline.com/${TID}/oauth2/v2.0/logout`
      + `?post_logout_redirect_uri=${encodeURIComponent(RURI)}`;
  }

  return { signIn, startLogin, getToken, tokenInfo, logout };
})();
