# Power-Automate-Flow „Umfrage-Annahme"

Der Flow ist das einzige Bindeglied zwischen der öffentlichen Teilnahmeseite und
SharePoint. Er nimmt anonyme Antworten entgegen und schreibt sie mit **seinem**
Verbindungskonto in die Listen. Genau daher kommt die Anonymität: Die Person, die
antwortet, meldet sich nirgends an – in SharePoint steht bei jeder Antwort dasselbe
technische Konto, nicht der Absender.

```
Handy / PC im Werk          Power Automate                    SharePoint
─────────────────────       ─────────────────────────         ────────────────────
index.html                  „Wenn eine HTTP-Anforderung
  │  POST (JSON als            empfangen wird"                Umfragen
  │  text/plain)          ──►   ├─ aktion = definition ──────► (FragenJson lesen)
  │                             └─ aktion = antwort  ────────► Umfrage_Antworten
  ◄── Antwort mit CORS-Kopf                        └─ Kontakt ► Umfrage_Kontakte
```

---

## 0. Voraussetzungen

| Punkt | Bemerkung |
|---|---|
| **Lizenz** | Der Trigger „Wenn eine HTTP-Anforderung empfangen wird" (Connector „Anforderung") ist **Premium**. Ohne passende Power-Automate-Lizenz lässt sich der Flow zwar bauen, aber nicht dauerhaft betreiben. Falls keine Lizenz vorhanden ist: siehe „Alternative ohne Premium" ganz unten. |
| **Verbindungskonto** | Ein Konto, das in die drei Listen schreiben darf – sinnvollerweise `administrator@dihag.com` wie beim ZAPP-Cron. Dieses Konto erscheint später bei **jeder** Antwort als „Erstellt von". |
| **Listen** | `Umfragen`, `Umfrage_Antworten`, `Umfrage_Kontakte` auf `https://dihag.sharepoint.com/sites/IT` (siehe `provision-umfragen-listen.ps1` oder Verwaltung → „Listen jetzt anlegen"). |
| **Umgebung** | Am besten eine Lösung („Solution") in der Standardumgebung, damit der Flow nicht an einem persönlichen Konto hängt. |

---

## 1. Trigger anlegen

Der Trigger heißt **„Wenn eine HTTP-Anforderung empfangen wird"** und steckt im
eingebauten Connector **„Anforderung"** (englisch: *Request*).

**So kommt man hin:**

1. https://make.powerautomate.com öffnen, links **Erstellen**.
2. **Sofortiger Cloud-Flow** wählen – *nicht* „Automatisierter Cloud-Flow".
   Dort taucht der Trigger nämlich gar nicht auf, weil er nicht auf ein Ereignis
   in einem Dienst reagiert, sondern auf einen Aufruf von außen.
3. Namen vergeben (z. B. „Umfrage-Annahme"), dann im Suchfeld
   **„Anforderung"** eingeben (oder englisch „Request", je nach Spracheinstellung)
   und **„Wenn eine HTTP-Anforderung empfangen wird"** auswählen.
   *Notfalls:* leeren Flow erstellen und im Trigger-Suchfeld „HTTP" eingeben.

Einstellungen:

* Methode: **POST**
* Anforderungstext-JSON-Schema: **leer lassen**

> ### Trigger nicht auffindbar?
> Dann fehlt fast immer die **Premium-Lizenz** – der Connector „Anforderung" ist
> ein Premium-Connector. Erkennbar am blauen Rautezeichen („Premium") neben dem
> Namen; ohne Lizenz lässt sich der Flow entweder nicht speichern oder wird gar
> nicht erst angeboten.
>
> Prüfen: in Power Automate rechts oben aufs Konto-Symbol → **Meine Lizenzen**,
> oder im Microsoft-365-Admin-Center unter *Abrechnung → Ihre Produkte* nach
> **Power Automate Premium** (früher „per user plan") suchen.
>
> Wenn keine Lizenz da ist: **Abschnitt „Alternative ohne Premium" ganz unten** –
> die Teilnahmeseite und die Auswertung bleiben dabei unverändert, es wird nur
> die Annahmestelle ausgetauscht.

> Warum kein Schema? Die Teilnahmeseite schickt den Rumpf bewusst als
> `Content-Type: text/plain`. Damit gilt die Anfrage im Browser als „einfache"
> CORS-Anfrage und es entfällt die OPTIONS-Vorabanfrage, die Power Automate nicht
> brauchbar beantwortet. Der Rumpf ist trotzdem JSON – er wird im nächsten Schritt
> selbst geparst.

---

## 2. Nutzlast parsen

**Aktion „Verfassen" (Compose)** einfügen und **umbenennen in `Nutzlast`**
(drei Punkte am Kopf der Aktion → *Umbenennen*):

```
json(triggerBody())
```

> ### Namen sind hier keine Kosmetik
> Alle folgenden Ausdrücke sprechen die Aktion über ihren Namen an. Heißt sie
> weiter „Verfassen", muss überall `outputs('Verfassen')` statt
> `outputs('Nutzlast')` stehen – sonst liefert der Ausdruck nichts, und zwar
> ohne Fehlermeldung. **Leerzeichen werden im Ausdruck zu Unterstrichen:**
> aus der Aktion „Elemente abrufen" wird `body('Elemente_abrufen')`.
>
> Am einfachsten: gleich beim Einfügen umbenennen, dann passen die Ausdrücke
> aus dieser Anleitung wortwörtlich.

*Klemmt es hier?* Wenn `triggerBody()` nicht als Text ankommt, hilft
`json(string(triggerBody()))`. In der Flow-Historie sieht man unter „Rohe Eingaben"
sofort, was tatsächlich angekommen ist.

Ab jetzt sind die Felder so erreichbar (Beispiel):

```
outputs('Nutzlast')?['aktion']
outputs('Nutzlast')?['umfrage']
outputs('Nutzlast')?['standort']
outputs('Nutzlast')?['bereich']
outputs('Nutzlast')?['kontakt']
outputs('Nutzlast')?['antworten']
outputs('Nutzlast')?['meta']?['hp']
outputs('Nutzlast')?['meta']?['dauerSek']
```

---

## 3. Umfrage nachschlagen

**SharePoint → „Elemente abrufen"** (Mehrzahl!)

> ⚠️ Nicht „**Element** abrufen" nehmen. Das ist eine andere Aktion (*Get item*),
> die eine Element-**ID** verlangt – die kennen wir hier nicht, wir suchen ja
> erst über `UmfrageId`. Richtig ist „**Elemente** abrufen" (*Get items*), nur
> die hat das Feld **Filterabfrage**.

* Websiteadresse: `https://dihag.sharepoint.com/sites/IT`
* Liste: `Umfragen`
* Filterabfrage:
  ```
  UmfrageId eq '@{outputs('Nutzlast')?['umfrage']}'
  ```
* Anzahl der Elemente: `1`

Danach **Verfassen** `Umfrage` mit

```
first(body('Elemente_abrufen')?['value'])
```

und **Verfassen** `Status` mit

```
coalesce(outputs('Umfrage')?['Status'], 'Fehlt')
```

---

## 4. Verzweigen nach Aktion

**Steuerung → Umschalten (Switch)** auf

```
outputs('Nutzlast')?['aktion']
```

So sieht der fertige Flow aus – zum Abgleichen, welche Aktion wohin gehört:

```
manual  (Wenn eine HTTP-Anforderung empfangen wird)
└─ Nutzlast          Verfassen: json(triggerBody())
└─ Elemente abrufen  SharePoint, Liste Umfragen, Filterabfrage
└─ Umfrage           Verfassen: first(body('Elemente_abrufen')?['value'])
└─ Status            Verfassen: coalesce(outputs('Umfrage')?['Status'],'Fehlt')
└─ Wechseln  auf  outputs('Nutzlast')?['aktion']
   ├─ Fall "definition"
   │   └─ Bedingung „ist aktiv"
   │       ├─ Wahr   → Antwort  (Fragebogen)
   │       └─ Falsch → Antwort  (ok:false + Status)
   ├─ Fall "antwort"
   │   └─ Bedingung „darf gespeichert werden"
   │       ├─ Wahr   → Element erstellen (Umfrage_Antworten)
   │       │           └─ Bedingung „Kontakt vorhanden"
   │       │               ├─ Wahr   → Element erstellen (Umfrage_Kontakte)
   │       │               └─ Falsch → (nichts)
   │       │           → Antwort  { "ok": true }
   │       └─ Falsch → Antwort  (ok:false)
   └─ Standard
       └─ Antwort  (ok:false, "Unbekannte Aktion")
```

Die beiden **Element erstellen** und die Kontakt-Bedingung gehören also in den
Fall **antwort**, nicht in „definition" – im Fall „definition" wird nur gelesen
und geantwortet. Jeder Zweig endet mit genau einer **Antwort**-Aktion.

### Fall `definition`

Bedingung: `outputs('Status')` **ist gleich** `Aktiv`

* **Ja →** Antwort (siehe Schritt 6) mit Rumpf
  ```
  {
    "ok": true,
    "status": "Aktiv",
    "umfrage": "@{outputs('Umfrage')?['FragenJson']}"
  }
  ```

  > **Die Anführungszeichen um `@{…}` sind wichtig.** Ohne sie steht dort
  > `"umfrage": @{…}` – und das ist kein gültiges JSON mehr, weshalb der
  > Entwurf die Aktion mit **„Ungültige Parameter"** ablehnt. Der Fragebogen
  > geht deshalb als Zeichenkette raus; die Teilnahmeseite packt ihn selbst
  > aus (`js/api.js`, `JSON.parse`). Power Automate maskiert beim Einsetzen
  > in eine JSON-Vorlage korrekt, Anführungszeichen und Umbrüche im Fragebogen
  > machen also keinen Ärger.
  >
  > *Wer es lieber typisiert mag:* Body-Feld leeren, auf **fx** klicken und als
  > einzigen Ausdruck eintragen –
  > `addProperty(json('{"ok":true,"status":"Aktiv"}'), 'umfrage', json(outputs('Umfrage')?['FragenJson']))`.
  > Die Seite versteht beide Varianten.
* **Nein →** Antwort mit
  ```
  {
    "ok": false,
    "status": "@{outputs('Status')}",
    "fehler": "Diese Umfrage ist nicht freigeschaltet."
  }
  ```
  Die Teilnahmeseite zeigt dann „noch nicht freigegeben" bzw. „abgeschlossen" –
  und fällt **nicht** auf die Vorlage im Repository zurück.

### Fall `antwort`

**1. Bedingung „darf gespeichert werden"** – alle drei Punkte müssen zutreffen:

| Prüfung | Ausdruck | Sinn |
|---|---|---|
| Umfrage aktiv | `outputs('Status')` ist gleich `Aktiv` | keine Antworten auf Entwürfe oder beendete Umfragen |
| Honigtopf leer | `empty(coalesce(outputs('Nutzlast')?['meta']?['hp'], ''))` ist gleich `true` | ein unsichtbares Feld, das nur Automaten ausfüllen |
| lange genug gebraucht | `greaterOrEquals(int(coalesce(outputs('Nutzlast')?['meta']?['dauerSek'], 0)), 10)` ist gleich `true` | fünfzehn Fragen in unter zehn Sekunden füllt kein Mensch aus |

**2. Bei „Ja": SharePoint → „Element erstellen"** in `Umfrage_Antworten`

| Spalte | Wert |
|---|---|
| Title | `@{outputs('Nutzlast')?['umfrage']}` |
| UmfrageId | `@{outputs('Nutzlast')?['umfrage']}` |
| AntwortJson | `@{string(outputs('Nutzlast')?['antworten'])}` |
| Standort | `@{coalesce(outputs('Nutzlast')?['standort'], '')}` |
| Bereich | `@{coalesce(outputs('Nutzlast')?['bereich'], '')}` |
| Eingereicht | `@{utcNow()}` |
| DauerSek | `@{coalesce(outputs('Nutzlast')?['meta']?['dauerSek'], 0)}` |
| Quelle | `Web` |

**3. Bedingung „Kontakt vorhanden"**:
`empty(trim(coalesce(outputs('Nutzlast')?['kontakt'], '')))` ist gleich `false`

Bei „Ja": **SharePoint → „Element erstellen"** in `Umfrage_Kontakte`

| Spalte | Wert |
|---|---|
| Title | `@{outputs('Nutzlast')?['umfrage']}` |
| UmfrageId | `@{outputs('Nutzlast')?['umfrage']}` |
| Kontakt | `@{outputs('Nutzlast')?['kontakt']}` |
| Eingereicht | `@{utcNow()}` |

> **Wichtig für die Anonymität:** Es darf **kein** Feld geben, das den Kontakt mit
> dem Antwortsatz verbindet – keine gemeinsame Vorgangsnummer, kein Zeitstempel auf
> die Sekunde genau in beiden Listen. Sonst ließe sich über die Uhrzeit zuordnen,
> wer was geantwortet hat. Deshalb steht in beiden Listen nur `utcNow()` und
> die Kontaktliste wird von Hand nach Bedarf geleert.

**4. Antwort** (siehe Schritt 6): `{ "ok": true }`
Bei „Nein" der Prüfbedingung: `{ "ok": false, "fehler": "Die Antwort wurde nicht angenommen." }`

### Standardfall (unbekannte Aktion)

Antwort `{ "ok": false, "fehler": "Unbekannte Aktion." }`

---

## 5. Aufräumen: Antwort IMMER senden

Jeder Zweig muss mit einer **Antwort**-Aktion enden. Fehlt sie, wartet der Browser
bis zum Zeitüberschreiten und die teilnehmende Person sieht eine Fehlermeldung,
obwohl gespeichert wurde.

---

## 6. Die Antwort-Aktion (in jedem Zweig gleich aufgebaut)

**Anforderung → Antwort**

* Statuscode: **200** – auch bei Ablehnung. Der Rumpf sagt mit `ok: false`, was los
  ist. Ein 4xx ohne CORS-Kopf kann der Browser gar nicht lesen und meldet nur
  „Netzwerkfehler".
* **Kopfzeilen** (unverzichtbar, sonst blockiert der Browser die Antwort):

  | Schlüssel | Wert |
  |---|---|
  | `Access-Control-Allow-Origin` | `*` |
  | `Content-Type` | `application/json` |

  Statt `*` kann auch die konkrete Herkunft stehen – dann aber **beide** pflegen,
  weil die Seite unter zwei Adressen erreichbar ist: `https://umfrage.dihag.de`
  und `https://dfedorov12.github.io`. Das ist sauberer, muss aber bei jedem Umzug
  nachgezogen werden; `*` ist hier vertretbar, weil der Endpunkt ohnehin nur
  entgegennimmt und nichts herausgibt außer dem Fragebogen.

---

## 7. URL eintragen

Nach dem **Speichern** zeigt der Trigger die „HTTP-POST-URL". Diese Adresse in
`js/config.js` eintragen:

```js
endpunkt: "https://prod-xx.westeurope.logic.azure.com:443/workflows/…&sig=…",
```

Danach verschwindet auf der Teilnahmeseite der Hinweis „Probelauf" und Antworten
werden wirklich gespeichert.

> Die URL enthält die Signatur `sig=…` und ist damit faktisch öffentlich – sie steht
> ja im Quelltext der Seite. Das ist beim Trigger „HTTP-Anforderung" nicht zu
> vermeiden und der Preis dafür, dass niemand sich anmelden muss. Wer die URL kennt,
> kann Antworten einsenden – aber nichts lesen und nichts löschen. Bei Missbrauch:
> im Trigger die Signatur neu erzeugen („Regenerate key") und die neue URL in
> `config.js` eintragen.

---

## 8. Test ohne Browser

```bash
curl -s -X POST "<HTTP-POST-URL>" -H "Content-Type: text/plain" --data '{"aktion":"definition","umfrage":"newsletter-2026"}'
```

```bash
curl -s -X POST "<HTTP-POST-URL>" -H "Content-Type: text/plain" --data '{"aktion":"antwort","umfrage":"newsletter-2026","antworten":{"gefallen":4,"standort":"Coswig Guss"},"standort":"Coswig Guss","bereich":"In der Verwaltung / im Büro","kontakt":"","meta":{"dauerSek":95,"hp":"","sprache":"de-DE"}}'
```

Erwartet: `{"ok":true}` und ein neues Element in `Umfrage_Antworten`.

---

## 9. Häufige Stolpersteine

| Symptom | Ursache | Abhilfe |
|---|---|---|
| Aktion zeigt **„Ungültige Parameter"** | Der Rumpf der Antwort ist kein gültiges JSON – meist `"umfrage": @{…}` ohne Anführungszeichen | Ausdruck in Anführungszeichen setzen (Schritt 4) oder das ganze Body-Feld als **fx**-Ausdruck schreiben |
| Ausdruck bleibt leer, kein Fehler | Aktionsname stimmt nicht (`Verfassen` statt `Nutzlast`) oder Leerzeichen nicht als `_` geschrieben | Aktion umbenennen bzw. `outputs('Elemente_abrufen')`-Schreibweise prüfen |
| „Element abrufen" verlangt eine ID | falsche Aktion erwischt | „**Elemente** abrufen" (*Get items*) mit Filterabfrage nehmen |
| Browser meldet „CORS-Fehler" / „Failed to fetch" | Antwort ohne `Access-Control-Allow-Origin` | Kopfzeile in **allen** Antwort-Aktionen ergänzen |
| `outputs('Nutzlast')` ist leer | Rumpf kam nicht als Text an | `json(string(triggerBody()))` verwenden; Rohe Eingaben in der Flow-Historie ansehen |
| Antwort landet nicht in SharePoint | Spalte fehlt oder heißt intern anders | Interne Spaltennamen prüfen (Listeneinstellungen → Spalte anklicken → `Field=` in der Adresse) |
| Flow läuft, Seite zeigt trotzdem Fehler | Antwort-Aktion fehlt in diesem Zweig | Schritt 5 |
| Alles funktioniert, aber `Status` ist `Fehlt` | Es gibt keine Zeile in `Umfragen` mit dieser `UmfrageId` | Umfrage in der Verwaltung anlegen („Aus Vorlage anlegen") |

---

## Alternative ohne Premium-Lizenz

Falls der Request-Trigger lizenzrechtlich nicht geht, ändert sich **nur** dieser
Baustein – Teilnahmeseite und Auswertung bleiben unverändert. Nötig ist irgendein
Endpunkt, der ein Geheimnis halten kann:

1. **Azure Function (Verbrauchsplan)** oder **Logic App (Consumption)** – App-only
   per Client Credentials gegen Microsoft Graph, Client-Secret in den App-Settings.
   Die vorhandene Registrierung „DIHAG Cron-Job" (`089bf9ad-…`) hat mit
   `Sites.Selected` bereits das passende Muster; Kosten liegen bei einer
   Mitarbeiterbefragung im Cent-Bereich.
2. **Microsoft Forms** als reine Erfassung (anonym, kostenfrei) und diese Anwendung
   nur als Auswertung auf der Antwort-Excel. Dann kommt allerdings das Aussehen des
   Fragebogens von Forms und nicht aus dem DIHAG-Design.

Der Vertrag zwischen Seite und Endpunkt (Abschnitt 2–6) bleibt in beiden Fällen
derselbe: JSON rein, `{ok:…}` raus, CORS-Kopf dran.
