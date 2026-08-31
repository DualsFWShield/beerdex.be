$ErrorActionPreference = "Stop"

$VARIANTS = @(
    @{ Path = "bd-mobile\github-offline"; IsOffline = $true },
    @{ Path = "bd-mobile\play-store-offline"; IsOffline = $true },
    @{ Path = "bd-mobile\github-online"; IsOffline = $false },
    @{ Path = "bd-mobile\play-store-online"; IsOffline = $false }
)

$FILES = @(
    "index.html", "style.css", "style-museum.css", "js", "css", 
    "data", "icons", "event", "manifest.webmanifest", "sw.js", 
    "offline.html", "poster-classic.html", "poster-museum.html"
)

Write-Host "🚀 Starting Beerdex Mobile Sync (PowerShell)..."

foreach ($variant in $VARIANTS) {
    $wwwDir = Join-Path $variant.Path "www"
    Write-Host "📦 Syncing to $wwwDir (offline=$($variant.IsOffline))..."

    # Clean the www directory
    Write-Host "🧹 Cleaning $wwwDir..."
    if (Test-Path $wwwDir) {
        Remove-Item -Recurse -Force $wwwDir
    }
    New-Item -ItemType Directory -Path $wwwDir | Out-Null

    # Copy common files
    foreach ($item in $FILES) {
        if (Test-Path $item) {
            Copy-Item -Path $item -Destination $wwwDir -Recurse -Force
        } else {
            Write-Host "⚠️ Warning: $item not found, skipping." -ForegroundColor Yellow
        }
    }

    # Copy images
    if ($variant.IsOffline) {
        Copy-Item -Path "images" -Destination $wwwDir -Recurse -Force
        Write-Host "  📸 Copied ALL images (offline mode)"
    } else {
        $imagesDest = Join-Path $wwwDir "images"
        New-Item -ItemType Directory -Path $imagesDest | Out-Null
        $beerDest = Join-Path $imagesDest "beer"
        New-Item -ItemType Directory -Path $beerDest | Out-Null

        # Copy top-level files except foam.png
        Get-ChildItem -Path "images" -File | Where-Object { $_.Name -ne "foam.png" } | Copy-Item -Destination $imagesDest -Force

        # Copy fallback beer images
        foreach ($fallback in @("default.png", "FUT.jpg")) {
            $fallbackPath = Join-Path "images\beer" $fallback
            if (Test-Path $fallbackPath) {
                Copy-Item -Path $fallbackPath -Destination $beerDest -Force
            }
        }
        Write-Host "  🌐 Copied UI images (no foam.png) + beer fallbacks (online mode)"
    }

    Write-Host "✅ Sync complete for $($variant.Path)"
}

Write-Host "🎉 All variants synced successfully!"
Write-Host "💡 Reminder: Run 'npx cap copy android' or your build command in each variant folder."
