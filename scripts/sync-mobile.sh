#!/bin/bash

# --- Beerdex Mobile Sync Script ---
# This script copies the latest web files into the 'www' directories 
# of the Offline mobile variants.

# Directories for the 4 variants
VARIANTS=("bd-mobile/github-offline" "bd-mobile/play-store-offline")

# Source files and directories to copy
FILES=(
    "index.html"
    "style.css"
    "style-museum.css"
    "js"
    "css"
    "data"
    "icons"
    "images"
    "event"
    "manifest.webmanifest"
    "sw.js"
    "offline.html"
    "poster-classic.html"
    "poster-museum.html"
)

echo "🚀 Starting Beerdex Mobile Sync..."

for variant in "${VARIANTS[@]}"; do
    WWW_DIR="$variant/www"
    echo "📦 Syncing to $WWW_DIR..."
    
    # Clear the www directory to ensure a clean sync
    echo "🧹 Cleaning $WWW_DIR..."
    rm -rf "$WWW_DIR"
    mkdir -p "$WWW_DIR"
    
    # Copy files
    for item in "${FILES[@]}"; do
        if [ -e "$item" ]; then
            cp -r "$item" "$WWW_DIR/"
        else
            echo "⚠️ Warning: $item not found, skipping."
        fi
    done
    
    echo "✅ Sync complete for $variant"
done

echo "🎉 All variants synced successfully!"
echo "💡 Reminder: Run 'npx cap copy' or your build command in each variant folder."
