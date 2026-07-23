#!/bin/bash
set -x
export PATH="/home/linuxbrew/.linuxbrew/bin:$PATH"
export JAVA_HOME="/home/linuxbrew/.linuxbrew/opt/openjdk@17"
export ANDROID_HOME="/home/linuxbrew/.linuxbrew/share/android-commandlinetools"
export CI=1

# --- RELEASE CONFIGURATION ---
RELEASE_DIR="/home/noah/Documents/beerdex.be/release"
KEYSTORE="/home/noah/Documents/beerdex.be/bd-mobile/beerdex.keystore"

mkdir -p "$RELEASE_DIR"

# 0. Setup Environment
echo "Checking Android SDK components..."
yes | sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# 0.1 Version Management
VCODE_FILE="/home/noah/Documents/beerdex.be/bd-mobile/play-store/android/app/build.gradle"
CURRENT_VCODE=$(grep "versionCode " "$VCODE_FILE" | head -1 | awk '{print $2}')
NEW_VCODE=$((CURRENT_VCODE + 1))
sed -i "s/versionCode $CURRENT_VCODE/versionCode $NEW_VCODE/" "$VCODE_FILE"
echo "--- NEW VERSION CODE: $NEW_VCODE ---"

# 1. Main Version (OTA) - be.beerdex.app.online
# This version loads beerdex.be directly, allowing for Over-The-Air updates.
# It includes the Service Worker for offline fallback once primary load is done.
cd /home/noah/Documents/beerdex.be/bd-mobile/online
echo "Building Main Version (OTA)..."
npm install --no-fund --no-audit
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleRelease bundleRelease
cp app/build/outputs/apk/release/app-release.apk "$RELEASE_DIR/be.beerdex-main.apk"
cp app/build/outputs/bundle/release/app-release.aab "$RELEASE_DIR/be.beerdex-main.aab"

# 2. Play Store Submission (Production) - co.median.android.yeenpjz
# This is the official production build intended for Google Play Store.
# It includes specific encryption keys and metadata required by the Play Console.
cd /home/noah/Documents/beerdex.be/bd-mobile/play-store
echo "Building Play Store Production Assets..."
npm install --no-fund --no-audit
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleRelease bundleRelease
cp app/build/outputs/apk/release/app-release.apk "$RELEASE_DIR/beerdex-playstore-production.apk"
cp app/build/outputs/bundle/release/app-release.aab "$RELEASE_DIR/beerdex-playstore-production.aab"

# 3. Preview Version (Offline APK) - be.beerdex.app.offline
# This version bundles all assets locally. No internet required for operation.
# Ideal for testing and distribution in environments without connectivity.
cd /home/noah/Documents/beerdex.be/bd-mobile/offline
echo "Preparing Preview files..."
mkdir -p www
rsync -a --exclude='.git' --exclude='bd-mobile' --exclude='node_modules' --exclude='release' /home/noah/Documents/beerdex.be/ /home/noah/Documents/beerdex.be/bd-mobile/offline/www/
echo "Building Preview Version (Offline APK)..."
npm install --no-fund --no-audit
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleRelease bundleRelease
cp app/build/outputs/apk/release/app-release.apk "$RELEASE_DIR/be.beerdex-preview.apk"
cp app/build/outputs/bundle/release/app-release.aab "$RELEASE_DIR/be.beerdex-preview.aab"

echo "SUCCESS - All editions (Main, Production, Preview) are ready in /release"
