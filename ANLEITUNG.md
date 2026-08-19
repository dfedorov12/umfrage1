# Eine Umfrage durchführen – Anleitung für das Kommunikationsteam

Diese Anleitung braucht keine IT-Kenntnisse. Technische Einrichtung: siehe README.md.

---

## 1. Umfrage freischalten

1. https://umfrage.dihag.de/auswertung.html öffnen und mit dem
   Firmenkonto anmelden.
2. Reiter **Verwaltung** → in der Tabelle die Umfrage suchen.
3. Auf **Status …** klicken, bis dort **Aktiv** steht.
   *Entwurf* = niemand kann teilnehmen, *Aktiv* = offen, *Beendet* = geschlossen
   (Teilnehmende sehen dann „Diese Umfrage ist abgeschlossen").
4. Auf **Vorschau** klicken und den Fragebogen einmal selbst durchgehen. In der
   Vorschau wird nichts gespeichert.

## 2. Link verteilen

**Link** (Knopf *Link* in der Verwaltung kopiert ihn):

```
https://umfrage.dihag.de/?u=newsletter-2026
```

Der Link funktioniert **ohne Anmeldung**, auf jedem Handy, auch von zu Hause.

Bewährte Wege in die Werke:

* **E-Mail** an alle mit Postfach – Link als großen Knopf, nicht als nackte Adresse.
* **Aushang am Schwarzen Brett** mit QR-Code. Einen QR-Code erzeugt man z. B. in
  Microsoft Edge (Adresszeile → Rechtsklick → *QR-Code für diese Seite erstellen*)
  oder in Word (*Einfügen → Add-Ins*).
* **Monitore im Werk**, falls vorhanden.
* **Über die Meister/Schichtführer** – erfahrungsgemäß der wirksamste Weg in der
  Produktion.

Textbaustein für die Ankündigung:

> Ihre Meinung zählt: In 5 Minuten sagen Sie uns anonym, was Sie vom Newsletter
> halten und was wir besser machen sollen. Keine Anmeldung, kein Name – auch nicht
> für die IT nachvollziehbar. Einfach den QR-Code scannen oder den Link öffnen.

## 3. Ergebnisse ansehen

Reiter **Ergebnisse**: Kennzahlen oben, darunter jede Frage einzeln.
Über die Filterleiste lassen sich Standort, Bereich und Zeitraum einschränken –
alle Ansichten rechnen dann mit derselben Auswahl.

* **Vergleich** – Durchschnitte der 1-bis-5-Fragen nach Bereich und Standort.
  Die eigentliche Kernfrage dieser Umfrage: Bewertet die Produktion anders als die
  Verwaltung?
* **Freitexte** – die Antworten in eigenen Worten, mit Standort und Bereich dabei.
* **Mitmacher** – wer sich freiwillig für die Mitarbeit gemeldet hat. Diese Angaben
  liegen getrennt und lassen sich den Antworten nicht zuordnen.
* **CSV** – alles für Excel (Semikolon, öffnet ohne Umwege).
* **Drucken** – ergibt einen sauberen Bericht ohne Bedienelemente; über
  „Als PDF speichern" wird daraus eine Anlage für die Geschäftsführung.

**Bitte beim Auswerten beachten:** Bei kleinen Standorten mit nur zwei oder drei
Antworten sind Durchschnitte wenig aussagekräftig – die Anzahl steht deshalb in
Klammern dabei. Und je kleiner die Gruppe, desto eher lässt sich erraten, wer
geantwortet hat. Ergebnisse nach Standort deshalb erst ab etwa fünf Antworten
weitergeben.

## 4. Auswerter selbst freischalten

Wer die Ergebnisse sehen darf, wird **in der Anwendung** gepflegt – dafür muss
niemand mehr in SharePoint oder in die IT-Skripte.

1. Als **administrator@dihag.com** anmelden (dieses Konto ist immer Administrator).
2. Reiter **Verwaltung** → Abschnitt **Auswerter**.
3. E-Mail-Adresse eintragen, Rolle wählen, **Hinzufügen**:

   | Rolle | darf |
   |---|---|
   | `viewer` | Ergebnisse ansehen, filtern, drucken, als CSV exportieren |
   | `editor` | zusätzlich Umfragen anlegen, bearbeiten und freischalten |
   | `admin`  | zusätzlich Listen einrichten und Auswerter pflegen |

4. Rolle ändern: einfach in der Zeile eine andere auswählen.
   Zugriff entziehen: **Entfernen**.

Die Änderung greift, sobald die betreffende Person die Seite neu lädt.
Wer nicht in der Liste steht, sieht ein Schloss – der Standard ist „kein Zugriff",
nicht „darf lesen".

## 5. Umfrage beenden

Status auf **Beendet** setzen. Die Daten bleiben in SharePoint, die Auswertung
funktioniert unverändert weiter.

---

## Häufige Fragen

**Ist das wirklich anonym?**
Ja. Es gibt keine Anmeldung, und gespeichert werden nur die Antworten selbst –
kein Name, keine E-Mail-Adresse, keine Personalnummer, keine IP-Adresse. Wer
freiwillig seinen Namen für die Mitarbeit hinterlässt, tut das in einem getrennten
Feld, das nicht mit den Antworten verknüpft wird.

**Kann jemand zweimal abstimmen?**
Technisch ja – ohne Anmeldung lässt sich das nicht verhindern, ohne die Anonymität
aufzugeben. Der Browser merkt sich die Teilnahme und weist beim zweiten Mal darauf
hin. Bei einer internen Befragung ist das erfahrungsgemäß ausreichend.

**Wer sieht die Ergebnisse?**
Nur die Konten, die unter *Verwaltung → Auswerter* eingetragen sind. Alle anderen
sehen beim Aufruf der Auswertung ein Schloss – auch dann, wenn sie den Link kennen.

**Wir wollen eine zweite Umfrage (z. B. zum neuen Intranet).**
Das geht ohne Programmierung: In der Verwaltung eine bestehende Umfrage öffnen,
den Fragebogen als Vorlage kopieren, `id` und `titel` ändern, Fragen anpassen,
speichern und auf *Aktiv* setzen. Der Link lautet dann `…/?u=<neue-id>`.
Die Fragetypen sind im README beschrieben; bei Bedarf hilft die IT beim Zuschnitt.

**Was sagt der Betriebsrat dazu?**
Eine anonyme Befragung ohne Personenbezug ist mitbestimmungsrechtlich der
einfachste Fall – trotzdem gehört sie vorher angekündigt. Hilfreich für das
Gespräch: Es werden keine Identitäten, keine IP-Adressen und keine
Gerätekennungen gespeichert, und die Auswertung nach Standort wird erst ab
fünf Antworten je Gruppe herausgegeben.
