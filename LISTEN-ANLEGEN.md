# SharePoint-Listen anlegen und berechtigen

Alle Listen liegen auf **https://dihag.sharepoint.com/sites/IT**.

## Der bequeme Weg

Die Listen müssen nicht von Hand entstehen:

* **Aus der Anwendung heraus:** als `administrator@dihag.com` anmelden →
  *Verwaltung → Listen jetzt anlegen*. Das legt alle drei Listen mit exakt den
  richtigen internen Spaltennamen an.
* **Per Skript:** `provision-umfragen-listen.ps1` (PnP.PowerShell) – legt
  zusätzlich mit `-RechteSetzen` die Berechtigungen wie unten beschrieben.

Beides erzeugt dasselbe Ergebnis. Der Rest dieser Seite ist für den Fall, dass
die Listen von Hand entstehen sollen – oder um nachzuprüfen, ob alles stimmt.

---

## Die zwei Fallen beim Anlegen von Hand

**1. Der interne Name zählt, nicht der Anzeigename.**
SharePoint merkt sich den Namen, den eine Spalte bei der *Erstellung* hatte, für
immer als internen Namen. Ein späteres Umbenennen ändert nur die Anzeige. Legen
Sie die Spalten deshalb **genau mit den Namen aus den Tabellen unten** an (keine
Leerzeichen, keine Umlaute, keine Bindestriche) und ändern Sie den Anzeigenamen
danach nach Belieben.

*Warum das wichtig ist:* Aus „Umfrage-ID" macht SharePoint intern
`Umfrage_x002d_ID`. Die Anwendung sucht `UmfrageId`, findet nichts – und
SharePoint verwirft geschriebene Werte für nicht existierende Spalten
**stillschweigend**. Es gibt keine Fehlermeldung, die Antworten sind einfach leer.

**2. Mehrzeilige Textfelder müssen „Nur Text" sein.**
Bei `FragenJson` und `AntwortJson` muss die Option *Erweiterten Rich-Text
verwenden* auf **Aus** stehen. Sonst verpackt SharePoint den Inhalt in
HTML (`<div>…</div>`), und das JSON lässt sich nicht mehr lesen.

---

## Liste 1: `Umfragen`

Enthält die Fragebögen. Ohne Personenbezug.

| Spaltenname (genau so anlegen) | Typ in SharePoint | Bemerkung |
|---|---|---|
| `Title` | vorhanden | Klartextname der Umfrage |
| `UmfrageId` | Einzelne Textzeile | Kennung aus dem Link `?u=…` |
| `Status` | Auswahl | Werte: `Entwurf`, `Aktiv`, `Beendet` |
| `Start` | Datum und Uhrzeit | optional |
| `Ende` | Datum und Uhrzeit | optional |
| `FragenJson` | Mehrere Textzeilen, **Nur Text** | der komplette Fragebogen |

## Liste 2: `Umfrage_Antworten`

Die anonymen Antworten.

| Spaltenname | Typ in SharePoint | Bemerkung |
|---|---|---|
| `Title` | vorhanden | wird mit der Umfrage-ID gefüllt |
| `UmfrageId` | Einzelne Textzeile | zu welcher Umfrage die Antwort gehört |
| `AntwortJson` | Mehrere Textzeilen, **Nur Text** | alle Antworten eines Bogens |
| `Standort` | Einzelne Textzeile | doppelt geführt, damit man in SharePoint filtern kann |
| `Bereich` | Einzelne Textzeile | dito |
| `Eingereicht` | Datum und Uhrzeit | Uhrzeit einschalten |
| `DauerSek` | Zahl | Ausfülldauer, dient der Automatenerkennung |
| `Quelle` | Einzelne Textzeile | derzeit immer `Web` |

Ab etwa 5.000 Antworten: auf `UmfrageId` einen **Index** setzen
(*Listeneinstellungen → Indizierte Spalten*).

## Liste 3: `Umfrage_Kontakte`

Freiwillige Kontaktangaben. Bewusst **ohne** jede Spalte, die auf einen
Antwortsatz zeigt – sonst wäre die Umfrage für diese Personen nicht mehr anonym.

| Spaltenname | Typ in SharePoint | Bemerkung |
|---|---|---|
| `Title` | vorhanden | Umfrage-ID |
| `UmfrageId` | Einzelne Textzeile | |
| `Kontakt` | Einzelne Textzeile | Name oder E-Mail, wie eingegeben |
| `Eingereicht` | Datum und Uhrzeit | |

## Liste 4: `AppPermissions` – existiert bereits

Die zentrale Rechteliste, die auch Ticketsystem, Orgchart und „Rund um den Job"
benutzen. Sie wird **nicht** neu angelegt, hier kommen nur Zeilen dazu:

| Spalte | Wert für diese Anwendung |
|---|---|
| `UserEmail` | E-Mail der Person, kleingeschrieben |
| `App` | `umfrage1` |
| `Role` | `viewer`, `editor` oder `admin` |

Gepflegt wird das in der Anwendung unter *Verwaltung → Auswerter*.

---

## Berechtigungen

Die Zugriffssteuerung der Anwendung (AppPermissions) regelt, wer die Auswertung
**in der Anwendung** öffnen darf. Sie ersetzt keine SharePoint-Berechtigung: Wer
die Liste in SharePoint direkt aufrufen darf, sieht die Rohantworten auch ohne
die Anwendung. Deshalb müssen beide Ebenen zusammenpassen.

**Erste Frage: Wer darf heute `/sites/IT` lesen?** Genau dieser Kreis käme sonst
an die Antworten. Ist das mehr als das Kommunikationsteam, sollten die beiden
Antwortlisten eigene Rechte bekommen.

### Empfehlung je Liste

| Liste | Vererbung | Wer | Berechtigung |
|---|---|---|---|
| `Umfragen` | kann geerbt bleiben | Auswerter mit Rolle `editor`/`admin` | **Bearbeiten** (sie speichern Fragebögen aus der Anwendung heraus) |
| | | alle übrigen Auswerter | **Lesen** (die Auswertung braucht den Fragebogen zum Rechnen) |
| `Umfrage_Antworten` | **unterbrechen** | Flow-Konto (`administrator@dihag.com`) | **Mitwirken** – schreibt die Antworten |
| | | Gruppe „Umfrage-Auswertung" | **Lesen** |
| | | alle anderen | kein Zugriff |
| `Umfrage_Kontakte` | **unterbrechen** | Flow-Konto | **Mitwirken** |
| | | Gruppe „Umfrage-Auswertung" | **Lesen** |
| `AppPermissions` | wie bisher | **jeder, der die Auswertung nutzen soll** | **Lesen** |
| | | wer Auswerter pflegt (`administrator@dihag.com`) | **Mitwirken** |

### Zwei Punkte, die erfahrungsgemäß Ärger machen

**`AppPermissions` muss für alle Auswerter lesbar sein.** Kann ein Konto die
Liste nicht lesen, sieht die Anwendung keine Rolle und stuft auf die Standardrolle
„kein Zugriff" zurück – die Person steht also vor dem Schloss, obwohl sie
eingetragen ist. In der Auswertung steht der Grund klein unter der Meldung
(„Liste nicht gefunden oder für dieses Konto nicht lesbar"). Genau daran ist
„Rund um den Job" anfangs gescheitert, als die Liste noch auf `/sites/ticket` lag.

**Eine Gruppe statt vieler Einzelrechte.** Legen Sie eine Sicherheits- oder
SharePoint-Gruppe „Umfrage-Auswertung" an und berechtigen Sie nur diese. Sonst
pflegen Sie jede Person doppelt: einmal in SharePoint, einmal in AppPermissions.
Mit Gruppe bleibt der Alltag in der Anwendung (*Verwaltung → Auswerter*), und die
SharePoint-Seite fasst man nur an, wenn jemand ganz neu dazukommt.

### Mit dem Skript

```powershell
./provision-umfragen-listen.ps1 `
    -SiteUrl "https://dihag.sharepoint.com/sites/IT" `
    -ClientId "<entra-app-guid>" `
    -FlowKonto "administrator@dihag.com" `
    -Auswerter "kommunikation@dihag.com" `
    -RechteSetzen
```

Das unterbricht die Vererbung auf beiden Antwortlisten, gibt dem Flow-Konto
*Mitwirken* und den genannten Konten *Lesen*. Websitesammlungs-Administratoren
behalten in jedem Fall Vollzugriff – das lässt sich in SharePoint nicht abschalten.

---

## Prüfen, ob alles stimmt

1. In der Anwendung *Verwaltung* öffnen: Der Abschnitt **SharePoint-Listen**
   meldet „Alle drei Listen sind vorhanden" oder nennt die fehlenden.
2. *Verwaltung → „newsletter-2026 übernehmen"* – klappt das, stimmen Schreibrecht
   und Spaltennamen der Liste `Umfragen`.
3. Nach der ersten Testantwort in `Umfrage_Antworten` nachsehen: Steht in
   `AntwortJson` sauberes JSON (beginnend mit `{`) und **kein** `<div>`, ist die
   Rich-Text-Falle vermieden.
4. Eine Person mit Rolle `viewer` die Auswertung öffnen lassen. Sieht sie ein
   Schloss, fehlt fast immer das Leserecht auf `AppPermissions`.
