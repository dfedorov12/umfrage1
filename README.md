# DIHAG Umfragen

Anonyme Mitarbeiterbefragungen im DIHAG-Design – Erfassung ohne Anmeldung,
Speicherung in SharePoint, Auswertung nur für ausgewählte M365-Konten.

| | |
|---|---|
| **Teilnahme** | https://dfedorov12.github.io/umfrage1/ (offen, ohne Anmeldung) |
| **Auswertung** | https://dfedorov12.github.io/umfrage1/auswertung.html (M365-Anmeldung + Rolle) |
| **Erste Umfrage** | „Ihr Newsletter – machen Sie mit!" (`?u=newsletter-2026`) |
| **App-Registrierung** | „Dihag Umfragen", Client `f7474539-80e1-4bbb-b1ed-5536068581cb` |
| **Daten** | `dihag.sharepoint.com/sites/IT` → `Umfragen`, `Umfrage_Antworten`, `Umfrage_Kontakte` |

---

## Wie die Anonymität zustande kommt

Das ist die eine Entscheidung, an der alles hängt: **Wer antwortet, meldet sich
nirgends an.** Die Teilnahmeseite spricht deshalb nie mit Microsoft Graph, sondern
schickt die Antworten an einen Power-Automate-Flow. Der schreibt sie mit *seinem*
Konto nach SharePoint. In der Liste steht bei jeder Antwort dasselbe technische
Konto – nicht die Person.

```
Handy/PC im Werk ──POST──► Power-Automate-Flow ──schreibt──► SharePoint-Listen
  (keine Anmeldung)          (hält das Geheimnis)              │
                                                               ▼
                                       auswertung.html ◄──Graph── M365-Anmeldung
                                       (Rolle aus AppPermissions)
```

Der umgekehrte Weg – Teilnahme mit M365-Anmeldung – wäre einfacher gewesen,
scheidet aber aus zwei Gründen aus:

1. SharePoint schreibt bei jedem Element „Erstellt von" mit. Die Umfrage wäre
   höchstens pseudonym, und das merkt die Belegschaft.
2. Ein großer Teil der Zielgruppe arbeitet in der Produktion und hat gar kein
   M365-Konto zur Hand. Ohne offenen Link (Aushang, QR-Code) fehlen genau die
   Stimmen, um die es in dieser Befragung geht.

**Freiwillige Kontaktangaben** („Möchten Sie beim Weiterentwickeln mitmachen?")
landen in einer eigenen Liste `Umfrage_Kontakte`, ohne jeden Bezug zum Antwortsatz.
Wer sich meldet, gibt damit nicht preis, was er geantwortet hat.

---

## Einrichtung (Reihenfolge)

1. **Listen anlegen** – `provision-umfragen-listen.ps1` (PnP.PowerShell) oder in der
   Anwendung unter *Verwaltung → Listen jetzt anlegen*.
   Mit `-RechteSetzen` werden die Antwortlisten zusätzlich für alle außer dem
   Flow-Konto und den Auswertern gesperrt – ohne das kann jeder, der die Site
   `/sites/IT` lesen darf, die Rohantworten direkt in SharePoint öffnen.
2. **Flow bauen** – `flow/ANLEITUNG-FLOW.md`, Schritt für Schritt.
3. **HTTP-POST-URL** des Triggers in `js/config.js` bei `endpunkt` eintragen.
   Solange das Feld leer ist, läuft die Teilnahmeseite im *Probelauf*: alles
   bedienbar, nichts wird gespeichert.
4. **Redirect-URI** `https://dfedorov12.github.io/umfrage1/` in der App-Registrierung
   „Dihag Umfragen" unter *Authentifizierung → Single-Page-Anwendung* eintragen,
   sonst scheitert die Anmeldung zur Auswertung mit AADSTS50011.
   Graph-Berechtigungen (delegiert): `User.Read`, `Sites.ReadWrite.All`.
5. **Umfrage anlegen** – *Verwaltung → „newsletter-2026 übernehmen"*, danach
   Status auf **Aktiv** setzen.
6. **Auswerter freischalten** – in der Liste `AppPermissions` auf `/sites/IT`:
   `UserEmail` = Person, `App` = `umfrage1`, `Role` = `viewer` (nur lesen),
   `editor` (Umfragen pflegen) oder `admin` (zusätzlich Listen/Antworten verwalten).
   Ohne Eintrag: kein Zugriff. `administrator@dihag.com` ist immer Admin.

---

## Dateien

```
index.html            Teilnahme – ohne Anmeldung, mobil zuerst
auswertung.html       Auswertung + Verwaltung – mit Anmeldung
js/config.js          IDs, Adressen, Listennamen, Endpunkt      ← einzige Stellschraube
js/fragebogen.js      Renderer für die Fragetypen (auch Vorschau)
js/api.js             Weg zum Flow (Probelauf, wenn kein Endpunkt gesetzt)
js/teilnahme.js       Ablauf der Teilnahmeseite (Schritte, Zwischenstand)
js/auth.js            Anmeldung per PKCE (aus „Rund um den Job")
js/graph.js           Graph-/SharePoint-Helfer inkl. Spaltennamen-Toleranz
js/rechte.js          Rolle aus AppPermissions
js/daten.js           Lesen/Schreiben der drei Listen
js/analyse.js         Rechnen und Zeichnen der Ergebnisse, CSV
js/auswertung.js      Oberfläche der Auswertung
js/verwaltung.js      Umfragen anlegen, bearbeiten, freischalten
umfragen/*.json       mitgelieferte Fragebogen-Vorlagen
flow/ANLEITUNG-FLOW.md  Bauanleitung für den Power-Automate-Flow
provision-umfragen-listen.ps1  Listen + Rechte
tests/test-analyse.mjs  Rechenkerne ohne Browser prüfen
```

## Aufbau einer Fragebogen-Definition

```jsonc
{
  "id": "newsletter-2026",          // steht im Link: ?u=newsletter-2026
  "titel": "…", "untertitel": "…",
  "einleitung": "…",                // Text auf der Startseite
  "abschluss": "…",                 // Text auf der Dankeseite
  "proSchritt": 4,                  // optional: Fragen je Bildschirm
  "fragen": [
    { "id": "a1", "typ": "abschnitt", "text": "Kurz zu Ihnen", "hilfe": "…" },
    { "id": "standort", "typ": "dropdown", "optionen": ["…"], "auswertung": "standort" },
    { "id": "gefallen", "typ": "skala", "min": 1, "max": 5, "pflicht": true,
      "minLabel": "…", "maxLabel": "…" },
    { "id": "themen", "typ": "checkbox", "optionen": ["…"], "sonstiges": true },
    { "id": "idee", "typ": "text", "zeilen": 3 },
    { "id": "mitmachen", "typ": "text", "kontakt": true }
  ]
}
```

* `typ`: `abschnitt`, `kurztext`, `text`, `radio`, `dropdown`, `checkbox`, `skala`, `matrix`
* `auswertung: "standort" | "bereich"` – Wert wandert zusätzlich in eine eigene
  SharePoint-Spalte und wird damit zum Filter der Auswertung
* `kontakt: true` – Antwort wird **getrennt** gespeichert (siehe oben)
* `matrix` – je Option eine eigene Skala (z. B. „Wie sehr interessieren Sie
  folgende Themen?" von 1 bis 5)

## Entwicklung

```bash
node tests/test-analyse.mjs
```

Lokal ausprobieren: `python -m http.server 8772 --directory umfrage1`
(Eintrag `umfrage1` in `.claude/launch.json`).
`_test.html` ist eine Testkulisse mit Attrappen für Anmeldung und SharePoint
(`?rolle=viewer|editor|admin`, `?leer`, `?ohnelisten`) – sie steht bewusst nicht
im Repository.

## Grenzen

* Der Trigger „Wenn eine HTTP-Anforderung eingeht" ist ein **Premium**-Connector.
  Ohne Lizenz siehe „Alternative ohne Premium" in `flow/ANLEITUNG-FLOW.md`.
* Die Endpunkt-URL steht im Quelltext der Seite. Wer sie kennt, kann Antworten
  einsenden (nicht lesen, nicht löschen). Gegen Automaten helfen Honigtopf-Feld,
  Mindestdauer und der Statuscheck im Flow; bei Missbrauch die Signatur des
  Triggers neu erzeugen.
* Mehrfachteilnahme lässt sich ohne Anmeldung nicht verhindern – der Browser merkt
  sich lediglich, dass schon teilgenommen wurde, und weist darauf hin.
* Die Auswertung lädt alle Antworten der Umfrage in den Browser. Bis in den
  vierstelligen Bereich unproblematisch; darüber hinaus wäre ein serverseitiges
  Vorverdichten sinnvoll.
