# Octo Agent — Additional Assets Needed

This rebrand was completed using the two source files you dropped in this folder:

- `octoagentlogo.png` — 1254×1254 square mascot mark (became every app icon, the
  boot splash, the installer sidebar, and the in-app updater logo).
- `octoagentsplash.png` — 1448×1086 wordmark composition (became the README hero).

Everything below is what those two files **couldn't** cover. Items under
**Required** will leave something visibly wrong (or off-brand) until supplied.
Items under **Recommended** are quality/polish upgrades — the build ships fine
without them, but a real release should have them.

Anything that could be deterministically derived from `octoagentlogo.png`
(the `.ico`, `.icns`, `512x512.png`, installer sidebar, preload splash,
`ide-logo.png`) has already been generated and committed — those are **not**
listed here.

---

## Required

### 1. Application screenshot
- **Path:** `static/screenshot.png` (overwrite existing)
- **Format:** PNG, 24/32-bit
- **Dimensions:** match the current file's aspect (roughly 1200–1600 px wide);
  no hard constraint, README scales it.
- **Why:** The current `static/screenshot.png` still shows the old
  Arduino-branded UI. It's the main image in `README.md`, so it advertises the
  wrong product until replaced.
- **How to produce:** Build and launch Octo Agent, open a representative sketch,
  then capture the main window (title bar should read "Octo Agent", the boot
  splash and window icon should be the octopus). Crop to the window.
- **Note:** Can't be auto-generated — it requires a running build, which needs
  `node_modules` installed and a successful `yarn build`.

---

## Recommended

### 2. Vector master of the logo
- **Path:** `newassets/octoagentlogo.svg`
- **Format:** SVG, square viewBox, transparent background.
- **Why:** Every platform icon was rasterized from a 1254 px PNG. That's fine
  down-scaling, but a vector master lets you regenerate crisp icons at *any*
  size (including the macOS 1024 px slot, which is currently an upscale of the
  source) and is the proper source of truth going forward.
- **Note:** If you produce this, the `.ico` / `.icns` / `512x512.png` can be
  re-rendered from it for maximum sharpness.

### 3. Dark-mode splash / wordmark variant
- **Path:** `newassets/octoagentsplash-dark.png`
- **Format:** PNG with transparent background (preferred) or a dark-surface
  background matching `#1f272a`.
- **Dimensions:** same as `octoagentsplash.png` (1448×1086 or proportional).
- **Why:** The supplied splash has a solid white background. The boot splash
  currently sidesteps this by using the transparent **logo mark** (works on both
  themes), but any place that shows the full wordmark on a dark surface (docs,
  marketing, a future dedicated splash window) will show a white card. A
  transparent or dark variant fixes that.

### 4. Designed installer sidebar (Windows NSIS)
- **Path:** `electron-app/resources/installerSidebar.bmp` (overwrite the
  auto-generated one)
- **Format:** BMP, 24-bit, **no alpha channel** (NSIS chokes on alpha here).
- **Dimensions:** 164×314 (165×314 also accepted).
- **Why:** The committed sidebar is a functional auto-composite — the octopus
  centered on white. A purpose-designed vertical banner (brand gradient,
  wordmark, tagline) looks far more finished in the Windows installer welcome/
  finish pages.

### 5. GitHub social preview
- **Path:** `newassets/social-preview.png`
- **Format:** PNG
- **Dimensions:** 1280×640 (GitHub crops to ~1280×640; keep content centered
  with safe margins).
- **Why:** Controls the card shown when the repo is linked on social media /
  chat. Purely presentational, set under repo Settings → Social preview.

### 6. macOS DMG background (only if you want a custom installer window)
- **Path:** `electron-app/resources/dmg-background.png` (+ `@2x` retina version)
- **Format:** PNG
- **Dimensions:** 540×380 @1x and 1080×760 @2x (match the icon positions in the
  `dmg.contents` block of `electron-app/package.json`).
- **Why:** Currently no custom DMG background is configured — macOS uses the
  plain default. A branded backdrop (with an arrow from the app icon to the
  Applications folder) is the expected polish for a Mac release. If you add it,
  wire it up via `build.dmg.background` in `electron-app/package.json`.

---

## Intentionally NOT rebranded (for the record)

These reference real Arduino products/services and were left alone on purpose —
changing them would misrepresent third-party things, not our fork:

- `arduino-ide-extension/src/browser/style/icons/arduino-cloud*.svg` — icons for
  the **Arduino Cloud** service the IDE talks to.
- `fa fa-arduino-folder` and the other small UI glyph classes — generic editor
  iconography, not brand identity.
- `LICENSE.txt` — verbatim GNU AGPL-3.0 text; must stay byte-for-byte.
- Arduino's copyright line in the About dialog — AGPL requires preserving it.
