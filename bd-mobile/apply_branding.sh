#!/bin/bash
set -x
PROJECT_ROOT="/home/noah/Documents/beerdex.be"
ICON_SRC="$PROJECT_ROOT/icons/512x512.png"
SPLASH_SRC="$PROJECT_ROOT/icons/512x512.png"

for APP in online offline; do
    RES_DIR="$PROJECT_ROOT/bd-mobile/$APP/android/app/src/main/res"
    
    # 1. Icons
    # Replace mipmap icons
    find "$RES_DIR" -name "ic_launcher.png" -exec cp "$ICON_SRC" {} \;
    find "$RES_DIR" -name "ic_launcher_round.png" -exec cp "$ICON_SRC" {} \;
    find "$RES_DIR" -name "ic_launcher_foreground.png" -exec cp "$ICON_SRC" {} \;
    
    # 2. Splash Screen
    # Android 12+ uses Splash Screen API, but older ones use drawable/splash.png
    # Capacitor usually puts it in drawable or drawable-v24
    find "$RES_DIR" -name "splash.png" -exec cp "$SPLASH_SRC" {} \;
done

echo "Branding applied."
