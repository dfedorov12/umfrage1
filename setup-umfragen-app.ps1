# ══════════════════════════════════════════════════════════════════════
#  DIHAG Umfragen – Anbindung an die App-Registrierung „Dihag Umfragen"
#
#    1. Redirect-URIs als Single-Page-Anwendung eintragen
#       (eigene Domäne + github.io-Ausweichadresse)
#    2. Delegierte Graph-Berechtigungen an der Registrierung hinterlegen
#       (User.Read, Sites.ReadWrite.All) und den Zustimmungs-Link ausgeben
#    3. Optional: erste Person in AppPermissions eintragen (-Auswerter)
#
#  Betrifft NUR die Auswertungsseite. Die Teilnahmeseite kommt ohne
#  Anmeldung und damit ohne diese Registrierung aus.
#
#  Aufruf (Konto mit Anwendungsadministrator-Rechten):
#      Install-Module Microsoft.Graph -Scope CurrentUser
#      Connect-MgGraph -Scopes "Application.ReadWrite.All","Sites.ReadWrite.All"
#      ./setup-umfragen-app.ps1
#
#  Nur nachsehen, nichts ändern:
#      ./setup-umfragen-app.ps1 -WhatIfOnly
#
#  Die SharePoint-Listen legt provision-umfragen-listen.ps1 an – dort steckt
#  auch die Rechteeinschränkung der Antwortlisten.
# ══════════════════════════════════════════════════════════════════════

param(
    [string]   $ClientId  = "f7474539-80e1-4bbb-b1ed-5536068581cb",   # = js/config.js
    [string]   $TenantId  = "fdb70646-023a-403b-a4b9-1f474a935123",
    # Die Anmeldung laeuft auf auswertung.html, nicht auf der Startseite –
    # js/auth.js nimmt die aufgerufene Seite selbst als Rueckkehradresse.
    # Deshalb muss BEIDES eingetragen sein, Wurzel und Auswertungsseite.
    [string[]] $RedirectUris = @(
        "https://umfrage.dihag.de/",                             # eigene Domäne
        "https://umfrage.dihag.de/auswertung.html",              # dto., Anmeldeseite
        "https://dfedorov12.github.io/umfrage1/",                # Ausweichadresse
        "https://dfedorov12.github.io/umfrage1/auswertung.html"  # dto., Anmeldeseite
    ),
    [string[]] $Scopes    = @("User.Read", "Sites.ReadWrite.All"),
    [string]   $PermPath  = "dihag.sharepoint.com:/sites/IT",   # = js/config.js permSite
    [string]   $PermList  = "AppPermissions",
    [string]   $AppKey    = "umfrage1",
    # E-Mail-Adressen, die die Auswertung sehen dürfen (Rolle über -Rolle).
    [string[]] $Auswerter = @(),
    [ValidateSet("viewer", "editor", "admin")]
    [string]   $Rolle     = "viewer",
    [switch]   $WhatIfOnly
)

$ErrorActionPreference = "Stop"
$g = "https://graph.microsoft.com/v1.0"
$GRAPH_APP = "00000003-0000-0000-c000-000000000000"

function Gx {
    param([string]$Method = "GET", [string]$Uri, $Body)
    if ($null -ne $Body) {
        return Invoke-MgGraphRequest -Method $Method -Uri $Uri `
            -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
    }
    return Invoke-MgGraphRequest -Method $Method -Uri $Uri
}

Write-Host "=== DIHAG Umfragen – App-Registrierung anbinden ===" -ForegroundColor Cyan
if ($WhatIfOnly) { Write-Host "Nur Anzeige – es wird nichts geaendert." -ForegroundColor Yellow }

try { $null = Get-MgContext } catch {
    throw "Nicht angemeldet. Zuerst: Connect-MgGraph -Scopes 'Application.ReadWrite.All','Sites.ReadWrite.All'"
}

# ── 1 · Registrierung suchen ──────────────────────────────────────────
$apps = (Gx -Uri "$g/applications?`$filter=appId eq '$ClientId'").value
if (-not $apps) { throw "App-Registrierung $ClientId nicht gefunden (falscher Mandant?)." }
$app = $apps[0]
Write-Host "`n[1] Registrierung: $($app.displayName)  ($ClientId)" -ForegroundColor Yellow

# ── 2 · Redirect-URIs ─────────────────────────────────────────────────
$vorhanden = @()
if ($app.spa -and $app.spa.redirectUris) { $vorhanden = @($app.spa.redirectUris) }
$fehlend = $RedirectUris | Where-Object { $vorhanden -notcontains $_ }

if (-not $fehlend) {
    Write-Host "  Redirect-URIs bereits vollstaendig:" -ForegroundColor Green
    $vorhanden | ForEach-Object { Write-Host "    $_" }
} elseif ($WhatIfOnly) {
    Write-Host "  WUERDE ergaenzen:" -ForegroundColor Yellow
    $fehlend | ForEach-Object { Write-Host "    + $_" }
} else {
    $neu = @($vorhanden + $fehlend | Select-Object -Unique)
    Gx -Method PATCH -Uri "$g/applications/$($app.id)" -Body @{ spa = @{ redirectUris = $neu } } | Out-Null
    Write-Host "  Redirect-URIs ergaenzt:" -ForegroundColor Green
    $fehlend | ForEach-Object { Write-Host "    + $_" }
    Write-Host "  ACHTUNG: Die Adressen muessen unter 'Single-Page-Anwendung' stehen," -ForegroundColor DarkGray
    Write-Host "           nicht unter 'Web' – sonst schlaegt PKCE fehl." -ForegroundColor DarkGray
}

# ── 3 · Delegierte Graph-Berechtigungen ───────────────────────────────
Write-Host "`n[2] Delegierte Berechtigungen: $($Scopes -join ', ')" -ForegroundColor Yellow

$sp = (Gx -Uri "$g/servicePrincipals?`$filter=appId eq '$GRAPH_APP'&`$select=id,appId,oauth2PermissionScopes").value[0]
$ids = @()
foreach ($s in $Scopes) {
    $scope = $sp.oauth2PermissionScopes | Where-Object { $_.value -eq $s }
    if (-not $scope) { Write-Warning "  Scope '$s' bei Microsoft Graph nicht gefunden – uebersprungen."; continue }
    $ids += [pscustomobject]@{ id = $scope.id; type = "Scope"; value = $s }
}

$rra      = @($app.requiredResourceAccess)
$graphRra = $rra | Where-Object { $_.resourceAppId -eq $GRAPH_APP }
$schon    = @()
if ($graphRra) { $schon = @($graphRra.resourceAccess | ForEach-Object { $_.id }) }
$neuIds   = $ids | Where-Object { $schon -notcontains $_.id }

if (-not $neuIds) {
    Write-Host "  Alle Berechtigungen sind bereits eingetragen." -ForegroundColor Green
} elseif ($WhatIfOnly) {
    Write-Host "  WUERDE ergaenzen: $(($neuIds.value) -join ', ')" -ForegroundColor Yellow
} else {
    $zugriff = @()
    foreach ($id in ($schon + ($neuIds | ForEach-Object { $_.id }) | Select-Object -Unique)) {
        $zugriff += @{ id = $id; type = "Scope" }
    }
    $andere = $rra | Where-Object { $_.resourceAppId -ne $GRAPH_APP }
    $body = @{ requiredResourceAccess = @($andere) + @(@{ resourceAppId = $GRAPH_APP; resourceAccess = $zugriff }) }
    Gx -Method PATCH -Uri "$g/applications/$($app.id)" -Body $body | Out-Null
    Write-Host "  Ergaenzt: $(($neuIds.value) -join ', ')" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Zustimmung fuer den gesamten Mandanten (einmalig, als Administrator oeffnen):" -ForegroundColor Cyan
Write-Host "  https://login.microsoftonline.com/$TenantId/adminconsent?client_id=$ClientId"
Write-Host "  Ohne Zustimmung sehen normale Nutzer beim Anmelden AADSTS65001." -ForegroundColor DarkGray

# ── 4 · Auswerter in AppPermissions ───────────────────────────────────
if ($Auswerter) {
    Write-Host "`n[3] AppPermissions auf $PermPath (App '$AppKey', Rolle '$Rolle')" -ForegroundColor Yellow
    try {
        $site = Gx -Uri "$g/sites/$PermPath"
        $list = Gx -Uri "$g/sites/$($site.id)/lists/$PermList"
        $vorhandenePersonen = (Gx -Uri "$g/sites/$($site.id)/lists/$($list.id)/items?`$expand=fields&`$top=999").value

        foreach ($mail in $Auswerter) {
            $treffer = $vorhandenePersonen | Where-Object {
                $_.fields.UserEmail -eq $mail -and $_.fields.App -eq $AppKey
            }
            if ($treffer) { Write-Host "  $mail : Eintrag existiert bereits." -ForegroundColor Green; continue }
            if ($WhatIfOnly) { Write-Host "  WUERDE eintragen: $mail -> $Rolle" -ForegroundColor Yellow; continue }
            Gx -Method POST -Uri "$g/sites/$($site.id)/lists/$($list.id)/items" -Body @{
                fields = @{ Title = $mail; UserEmail = $mail; App = $AppKey; Role = $Rolle }
            } | Out-Null
            Write-Host "  $mail -> $Rolle eingetragen." -ForegroundColor Green
        }
    } catch {
        Write-Warning "  Schritt 3 fehlgeschlagen: $($_.Exception.Message)"
        Write-Warning "  Eintrag notfalls direkt in der Liste $PermList vornehmen:"
        Write-Warning "    UserEmail = <Person>, App = $AppKey, Role = viewer|editor|admin"
    }
}

Write-Host ""
Write-Host "Fertig. Weiter mit:" -ForegroundColor Green
Write-Host "  1. provision-umfragen-listen.ps1 (Listen + Rechte)"
Write-Host "  2. flow/ANLEITUNG-FLOW.md (Annahmestelle), URL in js/config.js eintragen"
Write-Host "  3. https://umfrage.dihag.de/auswertung.html -> Verwaltung -> Vorlage uebernehmen -> Status Aktiv"
