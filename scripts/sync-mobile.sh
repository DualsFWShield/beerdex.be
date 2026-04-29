#!/bin/bash

# --- Beerdex Mobile Sync Script ---
# This script copies the latest web files into the 'www' directories 
# of all mobile variants.
# ONLINE variants exclude images/beer/ (loaded from server at runtime).
# OFFLINE variants include everything for fully autonomous operation.

# Variants: name | is_offline
VARIANTS=(
    "bd-mobile/github-offline|true"
    "bd-mobile/play-store-offline|true"
    "bd-mobile/github-online|false"
    "bd-mobile/play-store-online|false"
)

# Source files and directories to copy (images handled separately)
FILES=(
    "index.html"
    "style.css"
    "style-museum.css"
    "js"
    "css"
    "data"
    "icons"
    "event"
    "manifest.webmanifest"
    "sw.js"
    "offline.html"
    "poster-classic.html"
    "poster-museum.html"
)

echo "🚀 Starting Beerdex Mobile Sync..."

for entry in "${VARIANTS[@]}"; do
    IFS='|' read -r variant is_offline <<< "$entry"
    WWW_DIR="$variant/www"
    echo "📦 Syncing to $WWW_DIR (offline=$is_offline)..."
    
    # Clear the www directory to ensure a clean sync
    echo "🧹 Cleaning $WWW_DIR..."
    rm -rf "$WWW_DIR"
    mkdir -p "$WWW_DIR"
    
    # Copy common files
    for item in "${FILES[@]}"; do
        if [ -e "$item" ]; then
            cp -r "$item" "$WWW_DIR/"
        else
            echo "⚠️ Warning: $item not found, skipping."
        fi
    done
    
    # Copy images with online/offline distinction
    if [ "$is_offline" = "true" ]; then
        # OFFLINE: copy everything (beer images bundled locally)
        cp -r "images" "$WWW_DIR/"
        echo "  📸 Copied ALL images (offline mode)"
    else
        # ONLINE: copy UI assets (SVGs only, NOT foam.png) + beer fallback images
        mkdir -p "$WWW_DIR/images/beer"
        # Copy top-level files EXCEPT foam.png (84MB — loaded from server when needed)
        find images/ -maxdepth 1 -type f ! -name "foam.png" -exec cp {} "$WWW_DIR/images/" \;
        # Copy only the fallback/placeholder images for graceful degradation without WiFi
        for fallback in default.png FUT.jpg; do
            [ -f "images/beer/$fallback" ] && cp "images/beer/$fallback" "$WWW_DIR/images/beer/"
        done
        echo "  🌐 Copied UI images (no foam.png) + beer fallbacks (online mode)"
    fi
    
    echo "✅ Sync complete for $variant"
done

echo "🎉 All variants synced successfully!"
echo "💡 Reminder: Run 'npx cap copy' or your build command in each variant folder."
