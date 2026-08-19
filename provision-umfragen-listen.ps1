# DIHAG Umfragen – Provisionierung der SharePoint-Listen
# ======================================================
# Legt die drei Listen an und schließt die Antwortlisten für die Allgemeinheit.
#
# Voraussetzung: Install-Module PnP.PowerShell -Scope CurrentUser
# PnP braucht eine registrierte Entra-App (ClientId):
#   https://pnp.github.io/powershell/articles/registerapplication.html
#
# Aufruf (als Konto mit Websitesammlungs-Adminrechten, z. B. administrator@dihag.com):
#
#   .\provision-umfragen-listen.ps1 `
#       -SiteUrl  "https://dihag.sharepoint.com/sites/IT" `
#       -ClientId "<entra-app-guid>" `
#       -FlowKonto "administrator@dihag.com" `
#       -Auswerter "kommunikation@dihag.com","fedorov@dihag.com"
#
# Die Rechte in der Anwendung selbst (wer die Auswertung öffnen darf) stehen
# davon getrennt in der Liste AppPermissions, App = "umfrage1".

param(
    [Parameter(Mandatory)] [string]  $SiteUrl,
    [Parameter(Mandatory)] [string]  $ClientId,
    # Konto, mit dem der Power-Automate-Flow schreibt. Es braucht als einziges
    # Schreibrechte auf den Antwortlisten.
    [Parameter(Mandatory)] [string]  $FlowKonto,
    # Personen, die die Antworten lesen dürfen (zusätzlich zu den Websiteadmins).
    [string[]] $Auswerter = @(),
    # Ohne diesen Schalter bleiben die Listenrechte, wie sie sind.
    [switch]   $RechteSetzen
)

$ErrorActionPreference = "Stop"
Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

function Neue-Liste($Titel, $Beschreibung) {
    if (Get-PnPList -Identity $Titel -ErrorAction SilentlyContinue) {
        Write-Host "Liste '$Titel' existiert bereits." -ForegroundColor DarkGray
        return
    }
    New-PnPList -Title $Titel -Template GenericList -EnableVersioning | Out-Null
    Set-PnPList -Identity $Titel -Description $Beschreibung | Out-Null
    Write-Host "Liste '$Titel' angelegt." -ForegroundColor Green
}

function Neue-Felder($Liste, $Felder) {
    foreach ($f in $Felder) {
        if (Get-PnPField -List $Liste -Identity $f.N -ErrorAction SilentlyContinue) { continue }
        $p = @{ List = $Liste; InternalName = $f.N; DisplayName = $f.D; Type = $f.T; AddToDefaultView = $true }
        if ($f.C) { $p.Choices = $f.C }
        Add-PnPField @p | Out-Null
        Write-Host "  + $($f.N) ($($f.T))"
    }
}

# ---------------------------------------------------------------------------
# 1. Umfragen – die Fragebögen
# ---------------------------------------------------------------------------
Neue-Liste "Umfragen" "Fragebogen-Definitionen der Anwendung 'DIHAG Umfragen'."
Neue-Felder "Umfragen" @(
    @{ N = "UmfrageId";  D = "Umfrage-ID";  T = "Text" },
    @{ N = "Status";     D = "Status";      T = "Choice"; C = @("Entwurf", "Aktiv", "Beendet") },
    @{ N = "Start";      D = "Start";       T = "DateTime" },
    @{ N = "Ende";       D = "Ende";        T = "DateTime" },
    @{ N = "FragenJson"; D = "Fragen (JSON)"; T = "Note" }
)

# ---------------------------------------------------------------------------
# 2. Umfrage_Antworten – die anonymen Antworten
#    AntwortJson enthält den kompletten Antwortsatz; Standort und Bereich
#    stehen zusätzlich als eigene Spalten, damit man in SharePoint selbst
#    filtern und gruppieren kann.
# ---------------------------------------------------------------------------
Neue-Liste "Umfrage_Antworten" "Anonyme Antworten. Erstellt vom Power-Automate-Flow – die Spalte 'Erstellt von' zeigt deshalb immer das Flow-Konto, NICHT die antwortende Person."
Neue-Felder "Umfrage_Antworten" @(
    @{ N = "UmfrageId";   D = "Umfrage-ID";        T = "Text" },
    @{ N = "AntwortJson"; D = "Antworten (JSON)";  T = "Note" },
    @{ N = "Standort";    D = "Standort";          T = "Text" },
    @{ N = "Bereich";     D = "Bereich";           T = "Text" },
    @{ N = "Eingereicht"; D = "Eingereicht";       T = "DateTime" },
    @{ N = "DauerSek";    D = "Dauer (Sekunden)";  T = "Number" },
    @{ N = "Quelle";      D = "Quelle";            T = "Text" }
)

# ---------------------------------------------------------------------------
# 3. Umfrage_Kontakte – freiwillige Kontaktangaben, GETRENNT von den Antworten
#    Bewusst keine Spalte, die auf einen Antwortsatz zeigt.
# ---------------------------------------------------------------------------
Neue-Liste "Umfrage_Kontakte" "Freiwillige Kontaktangaben aus Umfragen. Absichtlich OHNE Bezug zum jeweiligen Antwortsatz – sonst waere die Umfrage nicht mehr anonym."
Neue-Felder "Umfrage_Kontakte" @(
    @{ N = "UmfrageId";   D = "Umfrage-ID";  T = "Text" },
    @{ N = "Kontakt";     D = "Kontakt";     T = "Text" },
    @{ N = "Eingereicht"; D = "Eingereicht"; T = "DateTime" }
)

# ---------------------------------------------------------------------------
# 4. Rechte auf den Antwortlisten einschränken
#    Ohne diesen Schritt darf jeder, der die Site /sites/IT lesen darf, auch
#    die Rohantworten sehen – die Zugriffssteuerung der Anwendung hilft dann
#    nichts, weil die Liste direkt in SharePoint erreichbar bleibt.
# ---------------------------------------------------------------------------
if ($RechteSetzen) {
    foreach ($liste in @("Umfrage_Antworten", "Umfrage_Kontakte")) {
        Write-Host "Rechte fuer '$liste' werden gesetzt ..." -ForegroundColor Cyan
        Set-PnPList -Identity $liste -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubscopes
        Set-PnPListPermission -Identity $liste -User $FlowKonto -AddRole "Mitwirken"
        foreach ($p in $Auswerter) {
            Set-PnPListPermission -Identity $liste -User $p -AddRole "Lesen"
            Write-Host "  Lesen: $p"
        }
        Write-Host "  Mitwirken: $FlowKonto"
    }
    Write-Host "Websitesammlungs-Administratoren behalten den Vollzugriff." -ForegroundColor DarkGray
} else {
    Write-Host ""
    Write-Host "HINWEIS: Ohne -RechteSetzen bleiben die Listen fuer alle Site-Mitglieder lesbar." -ForegroundColor Yellow
    Write-Host "         Fuer eine vertrauliche Auswertung das Skript mit -RechteSetzen erneut aufrufen." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Fertig. Naechste Schritte:" -ForegroundColor Green
Write-Host "  1. Flow bauen (flow/ANLEITUNG-FLOW.md) und die HTTP-POST-URL in js/config.js eintragen."
Write-Host "  2. In der Anwendung unter Verwaltung die Vorlage 'newsletter-2026' uebernehmen."
Write-Host "  3. Status der Umfrage auf 'Aktiv' setzen."
Write-Host "  4. In AppPermissions (App = umfrage1) die Auswerter mit Role = viewer eintragen."
