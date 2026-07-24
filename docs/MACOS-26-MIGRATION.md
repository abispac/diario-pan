# macOS 26 clean-migration checklist

Last audited: July 23, 2026

This guide is for moving this MacBook from the macOS 27 beta back to the
stable macOS Tahoe 26 release without losing source code, signing credentials,
server secrets, or the ability to build Diario Pan, MiuXik, and the
PlumbersDash projects.

## Do not erase the Mac until these are all true

- [ ] The Apple Account password has been reset and sign-in works at both
      [Apple Developer](https://developer.apple.com/account/) and
      [App Store Connect](https://appstoreconnect.apple.com/).
- [ ] Two-factor authentication works and the trusted phone number/recovery
      information is current.
- [ ] Every repository with work in progress has either been committed and
      pushed or copied to a second physical disk.
- [ ] The entire `~/AppDev` folder exists on a second disk and several files
      have been opened from that copy.
- [ ] The App Store Connect `.p8` key, server `.env` files, Google/Firebase
      configuration, and any `.p12`/keystore files have an encrypted backup.
- [ ] A complete Time Machine backup finishes successfully, or there are two
      independently verified manual backups.
- [ ] A bootable macOS Tahoe installer has been created and the Mac can see it
      in Startup Options.
- [ ] Passwords/recovery codes for Apple, Expo, GitHub, Google/Firebase, MEGA,
      hosting, the VPS, and RevenueCat are stored outside this Mac.

Do not treat iCloud Drive, an unverified Time Machine disk, or an unpushed Git
working tree as the only backup.

## What the audit found on this Mac

- Hardware: Apple silicon MacBook Neo (`Mac17,5`, A18 Pro, 8 GB RAM).
- Current OS: macOS 27.0 beta.
- Current Xcode: Xcode 27 beta.
- Source tree: `~/AppDev`, approximately 18 GB.
- Xcode archives: approximately 2.4 GB.
- Free disk space reported during the audit: approximately 32 GiB.
- No Java runtime is installed, which is why local Android Gradle builds fail.
- `security find-identity -p codesigning` reports zero valid local signing
  identities.
- Time Machine's last-backup check failed because `backupd` was unavailable.
- GitHub CLI authentication for `abispac` is currently invalid.
- Expo authentication could not be verified during the audit because the Expo
  endpoint was unavailable.

Repositories with uncommitted changes at the time of the audit:

| Repository | Branch | Changed files |
| --- | --- | ---: |
| `~/AppDev/diario-pan` | `main` | 15 |
| `~/AppDev/Plumbersdash/techdash` | `main` | 2 |
| `~/AppDev/Plumbersdash/PlomeroApp` | `main` | 13 |
| `~/AppDev/Plumbersdash/webdashboard` | `main` | 24 |
| `~/AppDev/Plumbersdash/TecnicoApp` | `main` | 2 |
| `~/AppDev/Plumbersdash/SoloEmergencias4` | `main` | 1 |
| `~/AppDev/UltraSpin` | `master` | 95 |
| `~/AppDev/Music repo/MiuXik` | `main` | 32 |
| `~/AppDev/Music repo/Jukebox` | `main` | 10 |

The counts are a snapshot, not proof that everything should be committed.
Review generated files and secrets before staging.

## 1. Fix account access before touching the disk

Reset the Apple Account password now. Afterward:

1. Sign in to Apple Developer and App Store Connect in a private browser
   window.
2. Confirm that team `Q35D4RG84X` and all apps are visible.
3. Confirm access to Certificates, Identifiers & Profiles.
4. Confirm the trusted phone and recovery method.
5. Check for pending agreements in both Apple Developer and App Store Connect.
6. Save the new password and recovery information in a password manager.

There is no valid Apple signing identity in the current Keychain. Do not spend
time creating a new local certificate immediately before erasing the Mac.
Create it after installing macOS 26, or let EAS create and retain it remotely.
If a certificate is created before the migration, export the identity and its
private key as a password-protected `.p12` and verify that it imports on another
Mac/user account before erasing.

Do not revoke every certificate or push key blindly. Existing App Store apps
continue working after a distribution certificate expires or is revoked, but
active build systems may depend on the current credential. Inspect each app
with `eas credentials` first.

## 2. Preserve source code

Re-authenticate GitHub:

```bash
gh auth login -h github.com
gh auth status
```

Review and commit the Diario Pan work from this repair:

```bash
cd /Users/abispac/AppDev/diario-pan
git status --short
git diff --check
git add -u app server
git add docs/MACOS-26-MIGRATION.md
git commit -m "Fix reminders, add iPad layout, and target Android 16"
git push origin main
```

Then inspect every repository listed above:

```bash
git status --short
git diff
git remote -v
```

Commit and push intentional source changes one repository at a time. Never use
`git add -A` without reviewing the output, because several projects contain
generated native folders, builds, videos, and credential files.

### Make an independent filesystem copy

Use an encrypted APFS external disk. Replace `DEV-BACKUP` with its real volume
name:

```bash
mkdir -p "/Volumes/DEV-BACKUP/Mac-migration"

rsync -aE --progress \
  "/Users/abispac/AppDev/" \
  "/Volumes/DEV-BACKUP/Mac-migration/AppDev/"
```

Verify the copy. A dry run should report no unexpected source differences:

```bash
rsync -aEcn \
  "/Users/abispac/AppDev/" \
  "/Volumes/DEV-BACKUP/Mac-migration/AppDev/"
```

Open several source files, the Diario Pan SQLite database, and at least one
video directly from the backup disk. Do not erase merely because `rsync`
finished without displaying an error.

## 3. Back up credentials and non-Git data

These files were found and need special attention:

- `/Users/abispac/Downloads/AuthKey_T2F933H8TA.p8`
  - This is an App Store Connect API private key.
  - Apple does not let you download the same `.p8` file again.
  - Store it in an encrypted password-manager attachment or encrypted disk.
  - Record its Key ID and Issuer ID from App Store Connect.
- `/Users/abispac/AppDev/diario-pan/server/.env`
  - Contains the production server/Google Drive configuration.
- `/Users/abispac/AppDev/Plumbersdash/TecnicoApp/credentials.json`
- `/Users/abispac/AppDev/Plumbersdash/TecnicoApp/credentials/ios/dist-cert.p12`
- Every `GoogleService-Info.plist` and `google-services.json` below
  `~/AppDev/Plumbersdash`.
- Firebase `.firebaserc` and `firebase.json` files.
- `~/.gitconfig`, `~/.zprofile`, `~/.expo`, and `~/.app-store`.
- `~/Library/Developer/Xcode/Archives` if old archives/dSYMs are important for
  crash symbolication or re-exporting builds.

Example encrypted-disk copy:

```bash
mkdir -p "/Volumes/DEV-BACKUP/Mac-migration/private"

cp -p "/Users/abispac/Downloads/AuthKey_T2F933H8TA.p8" \
  "/Volumes/DEV-BACKUP/Mac-migration/private/"

cp -p "/Users/abispac/.gitconfig" \
  "/Users/abispac/.zprofile" \
  "/Volumes/DEV-BACKUP/Mac-migration/private/"
```

The whole `AppDev` copy already contains project-level `.env` and credential
files, but keep the most important keys in a second encrypted location too.
Never commit `.p8`, `.p12`, `.env`, `credentials.json`, or release keystores.

### EAS-managed credentials

EAS can retain iOS and Android signing credentials remotely. For each Expo
project, run:

```bash
cd /path/to/project
eas credentials
```

Confirm that the expected bundle identifier/package and team are shown. When
offered, download an encrypted local backup of credentials, or confirm that
remote credentials are healthy and that the Expo account can be recovered.

The local `android/app/debug.keystore` files are disposable debug keys. The
Play Store upload/release keystore is not disposable. Verify whether EAS or a
local `credentials.json` owns it before erasing.

### Hosting and VPS access

There is no normal SSH private key in `~/.ssh` right now. Before erasing, confirm
how the production VPS is accessed and save one of:

- a working SSH private key in an encrypted backup;
- the VPS/root password and hosting recovery access; or
- a newly created SSH key added to the VPS.

Also save the Namecheap/hosting login and two-factor recovery codes. Losing the
laptop and the only VPS login at the same time would prevent deploying Diario
Pan's server notification migration.

## 4. Repair and verify backups

Time Machine did not report a usable latest backup during the audit. Connect
the backup disk directly, unlock the Mac, disable VPN/security filters
temporarily if necessary, and start a manual backup:

```bash
tmutil startbackup --auto
tmutil status
tmutil latestbackup
```

Do not continue until `tmutil latestbackup` returns a real path. If Time
Machine remains broken, use a different disk and keep two verified manual
copies. Apple recommends checking the disk connection, free space, and Disk
Utility when Time Machine cannot complete.

Create a record of the currently installed development tools:

```bash
brew bundle dump \
  --file "/Volumes/DEV-BACKUP/Mac-migration/Brewfile-before-erase" \
  --force

npm list -g --depth=0 \
  > "/Volumes/DEV-BACKUP/Mac-migration/npm-global-before-erase.txt"
```

## 5. Prepare a macOS Tahoe 26 installer

This Mac is Apple silicon. Apple says that erasing a Mac which was running a
beta can offer the previous release in Recovery, but a bootable installer is a
valuable fallback.

Connect a directly attached 32 GB or larger USB drive. It will be erased.

List the Tahoe installers Apple currently offers:

```bash
softwareupdate --list-full-installers
```

At the time of this audit, Apple's latest stable Tahoe release is `26.5.2`.
Download that version if it is still listed; otherwise substitute the newest
stable `26.x` version shown by the previous command:

```bash
sudo softwareupdate \
  --fetch-full-installer \
  --full-installer-version 26.5.2
```

Quit the installer if it opens. Rename the USB volume to `MyVolume`, then run:

```bash
sudo /Applications/Install\ macOS\ Tahoe.app/Contents/Resources/createinstallmedia \
  --volume /Volumes/MyVolume
```

Shut down, keep the USB connected, hold the power button until Startup Options
appears, and verify that `Install macOS Tahoe` is selectable. Do not begin the
erase during this test.

## 6. Erase and install macOS 26

Recommended approach: clean installation, then restore projects and documents
manually. Avoid restoring the complete macOS 27 system/library state over
macOS 26; that can reintroduce beta settings, caches, and incompatible tool
state.

1. Shut down the Mac.
2. Hold the power button until Startup Options appears.
3. Start from the Tahoe USB installer, or choose Options for Recovery.
4. Open Disk Utility and choose **View → Show All Devices**.
5. Select `Macintosh HD`, choose **Erase Volume Group**, and use APFS.
6. Quit Disk Utility and install macOS Tahoe.
7. Keep the Mac connected to power and the internet for activation/firmware.
8. Finish Setup Assistant without restoring the entire macOS 27 system.
9. Disable Beta Updates in System Settings.
10. Update to the latest stable macOS Tahoe 26.x release.

Apple's current compatibility table says Xcode 26.6 requires macOS Tahoe 26.2
or later. Install at least Tahoe 26.2 before installing Xcode 26.6.

## 7. Install Xcode and command-line tooling

Install the latest stable Xcode 26 release compatible with Tahoe from the Mac
App Store or Apple's Developer Downloads page. Do not install Xcode 27 beta.

After Xcode is installed:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
xcodebuild -version
```

Open Xcode once, install the iOS simulator/runtime it offers, then add the Apple
Account under **Xcode → Settings → Accounts**.

## 8. Install the development packages

Install Homebrew:

```bash
/bin/bash -c "$(curl -fsSL \
  https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Core tools used by these projects

```bash
brew update

brew install \
  git \
  node@22 \
  watchman \
  cocoapods \
  fastlane \
  gh \
  ccache \
  cloudflared \
  cmake \
  ffmpeg \
  ninja \
  wget \
  xcodegen \
  yt-dlp

echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zprofile
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

npm install -g \
  eas-cli \
  firebase-tools \
  @anthropic-ai/claude-code
```

Node 22 LTS is preferable to restoring the current Node 24 installation. It
works with Expo SDK 54 and avoids relying on a non-LTS toolchain.

### Local Android development

The current Mac has no Java runtime. Install Android Studio and JDK 17:

```bash
brew install --cask android-studio
brew install --cask temurin@17
```

Add this to `~/.zprofile`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/emulator"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

Restart Terminal. In Android Studio's SDK Manager install:

- Android SDK Platform 36
- Android SDK Build-Tools 36.x
- Android SDK Platform-Tools
- Android Emulator
- Android SDK Command-line Tools (latest)
- One ARM64 Google APIs emulator image

Then verify:

```bash
java -version
adb version
```

EAS cloud builds already include Java and the Android SDK. These packages are
needed only for reliable local Android builds and emulators.

### Optional desktop/Windows packaging tools

PlumbersDash's Electron project builds macOS DMGs and Windows NSIS installers.
Install these if that work will continue:

```bash
brew install mono
brew install --cask wine-stable
brew install --cask gstreamer-runtime
```

The previous Mac also had `qt@5`, `sdl2_ttf`, `unar`, and `rom-tools`. Restore
those from `Brewfile-before-erase` only if the Jukebox/ROM projects still need
them.

## 9. Restore accounts and source

Authenticate again instead of copying stale login cookies:

```bash
gh auth login -h github.com
eas login
firebase login

gh auth status
eas whoami
firebase projects:list
```

Restore `~/AppDev` from the verified disk copy. Do not restore `node_modules`,
`Pods`, Gradle caches, DerivedData, or old simulators as authoritative state;
regenerate them on macOS 26.

For each Node project:

```bash
cd /path/to/project
npm ci
```

For an Expo project with ignored/generated native folders:

```bash
npx expo-doctor
npx expo export --platform all
npx expo prebuild --clean
npx pod-install
```

If local iOS signing is needed, select team `Q35D4RG84X` in Xcode or run
`eas credentials` and let EAS generate the new distribution certificate and
profiles. Once a local certificate is working, export a password-protected
`.p12` to the encrypted backup disk.

## 10. Resume Diario Pan

The pending Diario Pan changes require a new binary; they cannot be delivered
only by OTA because they change Expo SDK/native dependencies, target Android
API 36, exact-alarm permission, custom notification sound, and iPad native
configuration.

Validate after restoring:

```bash
cd /Users/abispac/AppDev/diario-pan/app
npm ci
npx expo-doctor
npx expo export --platform all
```

Build Android first:

```bash
eas build \
  --platform android \
  --profile production

eas submit \
  --platform android \
  --profile production \
  --latest
```

Build iOS after Apple credentials are healthy:

```bash
EXPO_NO_CAPABILITY_SYNC=1 eas build \
  --platform ios \
  --profile production \
  --non-interactive

eas submit \
  --platform ios \
  --profile production \
  --latest
```

Deploy the Diario Pan server migration after the source is pushed:

```bash
cd /opt/diario-pan
git pull --ff-only
cd server
npm ci --omit=dev
pm2 restart diario-pan
pm2 logs diario-pan --lines 50
```

On a physical Android phone and an iPhone/iPad:

1. Open **Ajustes** in Diario Pan.
2. Confirm `✓ Recordatorio diario programado`.
3. Tap **Probar en 5 segundos**.
4. Lock the device and verify the sound.
5. Set the daily time two minutes ahead, force-close the app, and verify it.
6. Rotate an iPad in Home, Player, Welcome, and Settings.

## Official references

- [Apple: Xcode version and macOS compatibility](https://developer.apple.com/support/xcode/)
- [Apple: download macOS installers](https://support.apple.com/en-us/102662)
- [Apple: create a bootable installer](https://support.apple.com/en-ca/101578)
- [Apple: erase an Apple-silicon Mac](https://support.apple.com/en-ca/102506)
- [Apple: Time Machine troubleshooting](https://support.apple.com/en-us/102220)
- [Expo: app credentials](https://docs.expo.dev/app-signing/app-credentials/)
- [Expo: using existing credentials](https://docs.expo.dev/app-signing/existing-credentials/)
- [Expo: Android Studio/emulator setup](https://docs.expo.dev/workflow/android-studio-emulator/)
