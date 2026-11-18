#!/usr/bin/env bash
set -euo pipefail

gradle -p android --no-daemon connectedDebugAndroidTest
adb exec-out run-as cool.atlas.library tar -C files -cf - interop-backup > android/interop-backup.tar
tar -xf android/interop-backup.tar -C android
node --import tsx scripts/transfer-fixture.ts verify
adb uninstall cool.atlas.library
new_apk=android/app/build/outputs/apk/debug/app-debug.apk
if [[ "${GITHUB_REF_TYPE:-}" == tag ]]; then
  curl --fail --location --retry 2 --max-time 90 -o "$RUNNER_TEMP/atlas-previous.apk" \
    https://github.com/Kalyan0540/Asset-Management/releases/download/android-v0.3.0-preview/Atlas-0.3.0-android-preview.apk
  adb install "$RUNNER_TEMP/atlas-previous.apk"
  adb shell am start -W -n cool.atlas.library/.MainActivity
  adb shell run-as cool.atlas.library touch files/upgrade-check
  if result=$(adb install -r "$new_apk" 2>&1); then
    adb shell run-as cool.atlas.library test -f files/upgrade-check
    echo 'ATLAS_ANDROID_UPDATE=in-place data retained'
  else
    echo "$result"
    if [[ "$result" != *INSTALL_FAILED_UPDATE_INCOMPATIBLE* ]]; then exit 1; fi
    echo 'ATLAS_ANDROID_UPDATE=signature changed; backup and restore required'
    adb uninstall cool.atlas.library
    adb install "$new_apk"
  fi
else
  adb install "$new_apk"
fi
adb shell am start -W -n cool.atlas.library/.MainActivity
adb shell screencap -p /sdcard/atlas-android.png
adb pull /sdcard/atlas-android.png android/atlas-android.png
