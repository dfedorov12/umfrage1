"use strict";

/* Wer darf die Auswertung sehen?
   ──────────────────────────────
   Quelle ist die zentrale Liste AppPermissions – dieselbe, die schon
   Ticketsystem, Orgchart und „Rund um den Job“ benutzen. Ein Eintrag gilt,
   wenn UserEmail zur angemeldeten Person passt und App entweder „umfrage1“
   oder „*“ ist.

     viewer  Auswertung ansehen und exportieren
     editor  zusätzlich Umfragen anlegen, ändern, veröffentlichen
     admin   zusätzlich Antworten löschen und Listen einrichten

   Anders als bei „Rund um den Job“ ist die Standardrolle „none“: Ohne
   Eintrag sieht man die Ergebnisse NICHT. Umfrageergebnisse sind
   Vertrauenssache – lieber einen Antrag zu viel als eine offene Auswertung.

   Wichtig für die Anonymität: Diese Prüfung entscheidet nur, WER auswerten
   darf. Sie hat nichts damit zu tun, wer geantwortet hat – das weiß auch
   diese Anwendung nicht, weil bei den Antworten keine Identität steht.     */

const RECHTE = (() => {

  const C = UMFRAGE_CONFIG;
  const RANG = { none: 0, viewer: 1, editor: 2, admin: 3 };

  const ctx = { email: "", name: "", rolle: C.defaultRole, erklaerung: "", fehler: "" };

  const istHauptAdmin = mail =>
    (C.hauptAdmins || []).some(m => m.toLowerCase() === String(mail).toLowerCase());

  /** Meldet die angemeldete Person an und ermittelt ihre Rolle. */
  async function laden() {
    const me = await GRAPH.call("/me?$select=displayName,mail,userPrincipalName");
    ctx.name  = me.displayName || "";
    ctx.email = String(me.mail || me.userPrincipalName || "").toLowerCase();

    if (istHauptAdmin(ctx.email)) {
      ctx.rolle = "admin";
      ctx.erklaerung = "Haupt-Administrator laut js/config.js.";
      return ctx;
    }

    try {
      const zeilen = await GRAPH.listItems(C.permSite, C.permList,
        ["Title", "UserEmail", "App", "Role"]);
      if (!zeilen) {
        ctx.fehler = `Liste „${C.permList}“ auf ${C.permSite} nicht gefunden oder für `
          + "dieses Konto nicht lesbar.";
        ctx.rolle = C.defaultRole;
        ctx.erklaerung = ctx.fehler;
        return ctx;
      }
      let best = RANG[C.defaultRole] ?? 0;
      let treffer = 0, passend = 0;
      for (const z of zeilen) {
        if (String(z.UserEmail || "").toLowerCase() !== ctx.email) continue;
        treffer++;
        if (z.App !== C.appKey && z.App !== "*") continue;
        passend++;
        best = Math.max(best, RANG[String(z.Role || "").toLowerCase()] ?? 0);
      }
      ctx.rolle = Object.keys(RANG).find(k => RANG[k] === best) || C.defaultRole;
      ctx.erklaerung = passend
        ? `Aus ${C.permList}: ${passend} Eintrag/Einträge für App „${C.appKey}“ (${zeilen.length} Zeilen gelesen).`
        : treffer
          ? `${treffer} Eintrag/Einträge auf ${ctx.email}, aber keiner für App „${C.appKey}“ oder „*“.`
          : `Kein Eintrag in ${C.permList} für ${ctx.email} (${zeilen.length} Zeilen gelesen).`;
    } catch (e) {
      ctx.fehler = e.detail || e.message || String(e);
      ctx.rolle = C.defaultRole;
      ctx.erklaerung = "Rechteliste nicht auswertbar: " + ctx.fehler;
    }
    return ctx;
  }

  const mindestens = r => (RANG[ctx.rolle] ?? 0) >= (RANG[r] ?? 99);

  return {
    ctx, laden, mindestens,
    darfSehen:     () => mindestens("viewer"),
    darfVerwalten: () => mindestens("editor"),
    darfLoeschen:  () => mindestens("admin")
  };
})();
