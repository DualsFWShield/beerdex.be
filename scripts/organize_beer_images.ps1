# Script pour renommer et placer les images de bières ajoutées dans leur dossier cible
$ErrorActionPreference = "Stop"

$workspaceRoot = $PSScriptRoot + "\.."
Set-Location $workspaceRoot

$notAddedDir = "images\beer\notadded"
$beDir = "images\beer\be"
$worldDir = "images\beer\world"

# S'assurer que les répertoires cibles existent
if (-not (Test-Path $beDir)) { New-Item -ItemType Directory -Path $beDir -Force }
if (-not (Test-Path $worldDir)) { New-Item -ItemType Directory -Path $worldDir -Force }

$operations = @(
    # Houppe (Belgique -> images/beer/be)
    @{ Source = "houppe-classic-33-cl-.jpg"; DestDir = $beDir; NewName = "houppe-classic-33cl.jpg" },
    @{ Source = "houppe baden.png"; DestDir = $beDir; NewName = "houppe-baden-skiffle-ipa-33cl.png" },
    @{ Source = "houppe zero.png"; DestDir = $beDir; NewName = "houla-houppe-sans-alcool-33cl.png" },
    @{ Source = "houppe pils-canette.avif"; DestDir = $beDir; NewName = "houppe-slip-pils-canette-33cl.avif" },
    @{ Source = "Jambes en l'air - carton de 24 x 33cl.png"; DestDir = $beDir; NewName = "houppe-jambes-en-lair-blonde-33cl.png" },

    # Soultrip / Good Souls Club (Belgique -> images/beer/be)
    @{ Source = "Soultrip-triple-blonde.png"; DestDir = $beDir; NewName = "soultrip-triple-blonde-33cl.png" },
    @{ Source = "Soultrip-pale-IPA.png"; DestDir = $beDir; NewName = "soultrip-soulflower-pale-ipa-33cl.png" },
    @{ Source = "Soultrip-wheat-beer.png"; DestDir = $beDir; NewName = "soultrip-soulshine-wheat-beer-33cl.png" },

    # Mythos (Grèce -> images/beer/world)
    @{ Source = "mythos_lager.png"; DestDir = $worldDir; NewName = "mythos-hellenic-lager-33cl.png" },
    @{ Source = "mythos0_0_bottle_front.png"; DestDir = $worldDir; NewName = "mythos-0-0-sans-alcool-33cl.png" },
    @{ Source = "mythos_ice_bottle_new.png"; DestDir = $worldDir; NewName = "mythos-ice-lager-33cl.png" },
    @{ Source = "mythos_radler_bottle_new.png"; DestDir = $worldDir; NewName = "mythos-radler-lemon-33cl.png" }
)

Write-Host "Traitement des images de bieres..."
foreach ($op in $operations) {
    $srcPath = Join-Path $notAddedDir $op.Source
    $destPath = Join-Path $op.DestDir $op.NewName

    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination $destPath -Force
        Write-Host "COPIE ET RENOMME : $($op.Source) -> $destPath"
    } else {
        # Verifier si l'image est deja presente dans le dossier destination
        if (Test-Path $destPath) {
            Write-Host "DEJA PRESENT : $destPath"
        } else {
            Write-Warning "Fichier source introuvable : $srcPath"
        }
    }
}

Write-Host "`nRenommage et deplacement des images termines avec succes !"
