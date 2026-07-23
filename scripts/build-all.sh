#!/bin/bash

# --- BEERDEX MASTER BUILD AUTOMATION ---
# This script synchronizes web assets to all mobile variants,
# builds them, and collects the artifacts into the 'release/' folder.

# Exit on error
set -e

# --- Configuration ---
ROOT_DIR=$(pwd)
RELEASE_DIR="$ROOT_DIR/release"
SYNC_SCRIPT="./scripts/sync-mobile.sh"

# Ensure release directory exists
mkdir -p "$RELEASE_DIR"

# --- Dependency Check ---
echo "🔍 Checking dependencies..."

# Force Java 17 if available (fixes 'Unsupported class file major version 69' for Gradle 8.2.1)
if [ -d "/var/home/linuxbrew/.linuxbrew/opt/openjdk@17" ]; then
    export JAVA_HOME="/var/home/linuxbrew/.linuxbrew/opt/openjdk@17"
    export PATH="$JAVA_HOME/bin:$PATH"
    echo "☕ Using forced Java 17 at: $JAVA_HOME"
fi

# Auto-detect Android SDK if not set
if [ -z "$ANDROID_HOME" ]; then
    COMMON_SDK_PATHS=(
        "/var/home/linuxbrew/.linuxbrew/share/android-commandlinetools"
        "$HOME/Android/Sdk"
        "$HOME/.android-sdk"
        "/usr/lib/android-sdk"
    )
    for path in "${COMMON_SDK_PATHS[@]}"; do
        if [ -d "$path" ]; then
            export ANDROID_HOME="$path"
            echo "📍 Auto-detected Android SDK at: $ANDROID_HOME"
            break
        fi
    done
fi

if [ -z "$ANDROID_HOME" ] && [ ! -f "bd-mobile/play-store-online/android/local.properties" ]; then
    echo "❌ Error: Android SDK not found. Please set ANDROID_HOME or create local.properties."
    exit 1
fi

if ! command -v java >/dev/null 2>&1; then
    # Fallback check: gradlew might still find it if it's in the specific shell
    echo "⚠️ Warning: 'java' not found in PATH, but Gradle might find it."
fi

if ! command -v npx >/dev/null 2>&1; then
    echo "❌ Error: Node.js (npx) is not installed."
    exit 1
fi

echo "✅ Dependencies verified."

# --- Step 1: Sync Assets ---
echo "🔄 Synchronizing web assets..."
chmod +x "$SYNC_SCRIPT"
"$SYNC_SCRIPT"

# --- Step 2: Build Variants ---

# Function to build and collect
build_variant() {
    local folder=$1
    local name=$2
    local build_aab=$3
    local build_apk=$4

    echo "--------------------------------------------------"
    echo "🔨 Building Variant: $name ($folder)"
    echo "--------------------------------------------------"

    cd "$ROOT_DIR/bd-mobile/$folder"
    
    echo "📦 Installing npm packages for $name..."
    npm install --no-fund --no-audit --legacy-peer-deps

    echo "📦 Running Capacitor Sync..."
    npx cap sync android

    cd android
    
    # Build AAB
    if [ "$build_aab" = true ]; then
        echo "💎 Building AAB..."
        chmod +x ./gradlew
        ./gradlew bundleRelease
        cp "app/build/outputs/bundle/release/app-release.aab" "$RELEASE_DIR/beerdex-$name.aab"
        echo "✅ AAB Collected: release/beerdex-$name.aab"
    fi

    # Build APK
    if [ "$build_apk" = true ]; then
        echo "📱 Building APK..."
        chmod +x ./gradlew
        ./gradlew assembleRelease
        cp "app/build/outputs/apk/release/app-release.apk" "$RELEASE_DIR/beerdex-$name.apk"
        echo "✅ APK Collected: release/beerdex-$name.apk"
    fi

    cd "$ROOT_DIR"
}

# --- Execution Matrix ---

# 1. Play Store Online (AAB + APK)
build_variant "play-store-online" "playstore-online" true true

# 2. Play Store Offline (AAB + APK)
build_variant "play-store-offline" "playstore-offline" true true

# 3. GitHub Online (APK Only)
build_variant "github-online" "github-online" false true

# 4. GitHub Offline (APK Only)
build_variant "github-offline" "github-offline" false true

echo "=================================================="
echo "🎉 ALL BUILDS COMPLETED SUCCESSFULLY!"
echo "📂 Check the 'release/' folder for your artifacts."
echo "=================================================="
ls -lh "$RELEASE_DIR"
