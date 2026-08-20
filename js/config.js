"use strict";

/* Zentrale Konfiguration – DIHAG Umfragen
   ───────────────────────────────────────
   Einzige Stelle, an der IDs, Adressen und Listennamen angepasst werden.

   Die Anwendung hat zwei Hälften mit bewusst unterschiedlichen Anforderungen:

   • index.html      – Teilnahme. KEINE Anmeldung, echt anonym. Spricht nur
                       den Power-Automate-Endpunkt an (`endpunkt`), niemals
                       Graph. Deshalb steht hier auch kein Geheimnis, das
                       nicht ohnehin öffentlich wäre.
   • auswertung.html – Auswertung und Verwaltung. Anmeldung über Entra
                       (`clientId`), liest die Antworten per Graph aus
                       SharePoint. Wer sie sehen darf, steht in der Liste
                       AppPermissions (`permList`, App = `appKey`).          */

const UMFRAGE_CONFIG = {

  /* ── Anmeldung (nur Auswertung/Verwaltung) ────────────────────────── */
  tenantId: "fdb70646-023a-403b-a4b9-1f474a935123",

  // App-Registrierung „Dihag Umfragen“ (Objekt-ID ef5776e1-0f5a-4d69-89d8-b8b7605bb2c9).
  // Unter „Authentifizierung → Single-Page-Anwendung“ müssen BEIDE Redirect-URIs
  // eingetragen sein – js/auth.js leitet sie aus der aufgerufenen Adresse ab und
  // die Anwendung ist unter beiden erreichbar (setup-umfragen-app.ps1 trägt sie ein):
  //   https://umfrage.dihag.de/              (eigene Domäne, produktiv)
  //   https://dfedorov12.github.io/umfrage1/ (Ausweichadresse, leitet dorthin um)
  clientId: "f7474539-80e1-4bbb-b1ed-5536068581cb",

  scopes: [
    "User.Read",
    "Sites.ReadWrite.All"   // Antworten lesen, Umfragen anlegen/ändern
  ],

  /* ── SharePoint ───────────────────────────────────────────────────── */
  // Site, auf der die drei Listen liegen (siehe provision-umfragen-listen.ps1).
  site: "dihag.sharepoint.com:/sites/IT",
  lists: {
    umfragen:  "Umfragen",            // Fragebogen-Definitionen (FragenJson)
    antworten: "Umfrage_Antworten",   // anonyme Antworten
    kontakte:  "Umfrage_Kontakte"     // freiwillige Kontaktangaben, GETRENNT
  },

  /* ── Rechte ───────────────────────────────────────────────────────
     Dieselbe zentrale Liste wie Ticketsystem, Orgchart und „Rund um den
     Job“ – hier mit App-Schlüssel „umfrage1“.
       Role = viewer  → Auswertung ansehen
       Role = editor  → zusätzlich Umfragen anlegen/bearbeiten
       Role = admin   → alles, inklusive Löschen von Antworten
     Ohne Eintrag gilt `defaultRole` = none: die Auswertung bleibt zu.
     Das ist der Unterschied zu „Rund um den Job“ (dort darf jeder lesen) –
     Umfrageergebnisse sollen ausdrücklich nur ein kleiner Kreis sehen.    */
  permSite: "dihag.sharepoint.com:/sites/IT",
  permList: "AppPermissions",
  appKey:   "umfrage1",
  defaultRole: "none",

  // Hat immer die Rolle „admin“, damit die Anwendung administrierbar bleibt,
  // solange in AppPermissions noch kein Eintrag für „umfrage1“ existiert.
  // Erstinbetriebnahme deshalb als administrator@dihag.com (wie ZAPP/RUDJ).
  hauptAdmins: ["administrator@dihag.com"],

  /* ── Annahmestelle für anonyme Antworten ──────────────────────────
     Adresse des Power-Automate-Flows („Wenn eine HTTP-Anforderung
     eingeht“, siehe flow/ANLEITUNG-FLOW.md). Sie enthält eine Signatur
     und ist damit öffentlich – das ist bei diesem Trigger unvermeidbar
     und der Preis für „Teilnahme ohne Anmeldung“.

     Solange das Feld leer ist, läuft die Teilnahmeseite im Probelauf:
     Der Fragebogen funktioniert vollständig, die Antworten werden aber
     NICHT gespeichert, sondern nur angezeigt. So lässt sich alles testen,
     bevor der Flow steht.                                                */
  endpunkt: "https://defaultfdb70646023a403ba4b91f474a9351.23.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/30/workflows/f4d32fedc5c644b1a9ee0469e321382f/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=MdTVNfVyDy_dOe16D90s0ab1rhLPlVeCRvMQhGbV54E",

  /* ── Fragebögen ───────────────────────────────────────────────────
     Welche Umfrage die Teilnahmeseite ohne Parameter zeigt. Über
     ?u=<id> lässt sich jede andere aufrufen.                            */
  standardUmfrage: "newsletter-2026",

  // Mitgelieferte Vorlagen unter umfragen/<id>.json. Sie dienen als
  // Startpunkt („Aus Vorlage anlegen“ in der Verwaltung) und als Notnagel:
  // Ist der Endpunkt nicht erreichbar, zeigt die Teilnahmeseite die Vorlage.
  vorlagen: ["newsletter-2026"],

  /* ── Verhalten der Teilnahmeseite ─────────────────────────────────── */
  // Merkt sich im Browser, dass bereits teilgenommen wurde (nur ein Hinweis,
  // keine Sperre – ohne Anmeldung ist eine echte Sperre nicht möglich, und
  // eine erzwungene wäre mit der Anonymität auch nicht vereinbar).
  teilnahmeMerken: true,

  // Mindestdauer in Sekunden, unter der eine Einsendung als maschinell gilt.
  // Der Flow verwirft solche Einsendungen (siehe ANLEITUNG-FLOW.md).
  mindestDauerSek: 10,

  // Höchstzahl Fragen je Bildschirm. Lange Abschnitte werden automatisch
  // auf mehrere Schritte verteilt (0 = nie teilen). Eine einzelne Umfrage
  // kann das mit "proSchritt" in ihrer Definition überschreiben.
  maxFragenProSchritt: 4
};
