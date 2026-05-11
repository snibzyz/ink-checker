# Changelog

All notable changes to this project will be documented in this file.

## 1.0.6

### Fixed
- **Root cause of "เขียนการตั้งค่าไม่ได้" loop**: when the formatting toggle cleared every `editor.*` key inside `"[markdown]"` / `"[plaintext]"`, VS Code emptied the contents but left the container behind — sometimes as a parsable `"[markdown]": {}`, but in at least one observed case as `"[markdown]": { , }` with a stray comma that made the entire `settings.json` unparseable. Once the file was unparseable, every subsequent `config.update` from any extension threw `Unable to write into user settings`, so toggling INK CHECKER's master switches looked like it did nothing and the warning kept resurfacing. v1.0.6 now calls `clearLanguageContainerIfEmpty()` after every clear path (`restoreSnapshotIfExists`, `restoreLangFromSnapshot`, `resetFormatting`) — if the container has zero keys at the target scope, the `[lang]` entry itself is removed via `getConfiguration().update("[markdown]", undefined, target)` so VS Code can't leave a stray container with a dangling comma.
- **Migration v3** sweeps the same cleanup over existing installs: any user who already has an empty `"[markdown]": {}` or `"[plaintext]": {}` from v1.0.0–v1.0.5 gets the container removed on first launch, without touching the keys they put there themselves.

### Added
- **"ซ่อมให้อัตโนมัติ" button** in the settings-write-error notification (new module `src/settingsRepair.ts`). When clicked, INK CHECKER locates `settings.json` across known VS Code / Insiders / Cursor / VSCodium / Windsurf install paths, scans only for the specific orphan-comma pattern `"[markdown|plaintext]": { , }` that this extension is known to cause, shows a modal preview of every match with the line number, and — on confirm — writes a timestamped backup (`settings.inkchecker-backup-<ts>.json`) before replacing the broken blocks with `"[markdown|plaintext]": {}`. If no recognised pattern is found, it falls back to the existing "เปิด settings.json" path and refuses to touch the file. The repair never edits any key other than the orphan-comma block, so it cannot make a different kind of breakage worse.

## 1.0.5

### Fixed
- **Settings panel toggles now handle a broken `settings.json` like activation does.** v1.0.3 made `activate()` survive a malformed user settings file, but the runtime write paths in the unified settings webview (`_updateChecker`, `_updateFormatting`, `_updateColors`, `_update`, `_applyPreset`, `resetFormatting`) still did bare `await config.update(...)` with no try/catch. When the user toggled (e.g.) page formatting off with a syntax error in `settings.json` — a stray comma in an empty `"[plaintext]": { , }` block was the trigger this time — the optimistic toggle in the webview *looked* flipped but VS Code silently rejected the write, no `onDidChangeConfiguration` event fired, `formatting.refresh()` never ran, and the font was never restored. v1.0.5 routes every panel write through a `_runWrite` helper that catches the throw, calls the same `notifySettingsWriteError` shown at activation (linking to **Open settings.json** / **Reload Window**), and re-broadcasts the real state to the webview so the toggle visibly bounces back to its actual position instead of lying.

### Added
- **"Tahoma 14 (Windows ดั้งเดิม)" preset** — Windows-native Thai backup font, for the case where Sarabun renders wrong or isn't installed.
- **"ค่า VS Code ปกติ" preset** — one-click escape hatch that runs the full `resetFormatting()` path: clears `inkChecker.formatting.*` at Global + Workspace, restores the snapshot (or clears the keys outright if the snapshot is gone), and clears any workspace-level `editor.*` overrides we wrote in `[plaintext]`/`[markdown]`. Use this if both the snapshot and the regular toggle-off have failed.

## 1.0.4

### Fixed
- **Status bar icon now appears immediately after activation**, even when no editor is open. Previously the icon was only shown the first time `updateDecorations` ran end-to-end, and that path returned early without calling `statusBarItem.show()` when there was no active editor — so opening VS Code on the welcome page left the INKCHECKER footer button missing until the user opened a file.

### Changed
- Display name shortened from `INK CHECKER` to `INKCHECKER` (no space) in both Marketplace and Open VSX listings.

## 1.0.3

### Fixed
- **Activation now survives a broken user `settings.json`.** Previously, if your user settings file had any syntax error (a stray comma, an unclosed brace, a duplicate key, etc.), VS Code rejected every `config.update` call our extension made during startup with `Unable to write into user settings`. That uncaught throw killed `activate()` before any command was registered, leaving the status bar icon missing and every `ink-checker.*` command reporting `command not found`. v1.0.3 reorders `activate()` so commands, providers, and the status bar register **before** any settings I/O, and wraps each of the three I/O steps (`migrateLegacySettings`, `runMigrations`, `formatting.refresh`) in its own try/catch. If a write fails, the extension stays alive, shows a single non-modal warning with quick links to **Open settings.json** / **Reload Window**, and retries the migration on the next activation — no settings are modified or deleted.
- Same fix also covers the common multi-window case: opening a second or third VS Code window after corrupting `settings.json` no longer leaves those windows with a dead extension.

### Changed
- Status bar item is now created and given its click target (`ink-checker.openSettingsPanel`) up front, instead of pointing to the non-existent `ink-checker.openMainMenu` placeholder.

## 1.0.2

### Fixed
- **Smart Thai word wrap** — set `editor.wrappingStrategy: "advanced"` for `.txt` and `.md` so wrap respects Thai grapheme clusters (no more breaking "ครั้ง" between the consonant and the combining vowel/tone marks).
- **v1.0.0 → v1.0.2 upgrade migration** — clears the language-scoped `editor.*` settings the older versions wrote without snapshotting. The polluted snapshot captured by v1.0.1 caused toggle on/off to no-op visually; the migration scrubs it once on first activation.

### Added
- Versioned migration system (`MIGRATION_VERSION_KEY` + `runMigrations`) so future releases that need to clean up `editor.*` state can add a single migration step instead of one-off cleanup hacks.
- `wrappingStrategy` to the managed `EDITOR_KEYS` set — enable writes it, disable/migration clears it.

## 1.0.1

### Fixed
- Page Formatting: turning the master toggle off now reliably reverts editor font for `.txt` / `.md` even when the original-settings snapshot is missing or partial — the disable path always clears the language-scoped editor keys (`fontFamily`, `fontSize`, `lineHeight`, `wordWrap`, `wordWrapColumn`).

### Changed
- Settings panel: each of the four master toggles (Overview vs detail tab) now shows a small click-to-jump "sync" badge so it's obvious they mirror the same setting rather than being two independent switches.

## 1.0.0

Major release — UI overhaul and new "Page Formatting" feature.

### Added
- **Unified Settings Panel** with sidebar navigation — one place to configure everything (overview, checker, words, word groups, page formatting, colors, advanced).
- **Page Formatting** for `.txt` and `.md` files: font family (defaults to TH Sarabun), font size, line height, paragraph indent (every line, like Word), and bounded word-wrap with adjustable column width.
- **Presets** for one-click setup: TH Sarabun 14 / 16 / 18 / 20.
- **Import / Export settings** as JSON (file save/open + clipboard copy) for backup or sharing across machines.
- **Snapshot / restore** of original `editor.fontFamily` / `fontSize` / `lineHeight` / `wordWrap` per language — turning page formatting off restores user's original values rather than wiping them.
- **Single status-bar button** in the footer that opens the unified settings panel directly.
- **TH Sarabun** font is used throughout the settings UI.
- **SVG icons** (Lucide-style) replace emoji decorations across the panel.

### Changed
- Status bar is now a single icon (was three) — click opens the settings panel.
- "เปิดจัดการรายการคำ" right-click entry on the extension page now opens the unified panel scrolled to the words tab.
- All previous commands still work but route into the new panel where applicable.

### Fixed
- Word-wrap is now `bounded` with a configurable column (default 90), so lines don't run to the full editor width.
- Paragraph indent now applies to every line in a paragraph (matches Word), not only the first line.

## 0.0.9

- Added **Extensions** view context menu entry to open **จัดการรายการคำ** (right‑click INK CHECKER → command appears in the configure group).
- Default keybinding **Ctrl+Alt+I** (macOS **Cmd+Alt+I**) for **INK CHECKER: เปิดจัดการรายการคำ** (change in Keyboard Shortcuts if it conflicts).

## 0.0.5

- Rebranded the extension to `INK CHECKER`
- Added `inkrealm-logo.png` as the extension icon
- Improved VS Code Settings UI metadata for extension configuration
- Added public project documentation for repository and release usage
- Updated packaging metadata and repository links

## 0.0.7

- Switched published extension identity to `inkrealm.ink-checker`
- Rebranded settings keys from `kunpengChecker.*` to `inkChecker.*`
- Added automatic migration for legacy settings across user, workspace, and folder scopes

## 0.0.4

- Added extension configuration support for custom words, rule toggles, and highlight colors
- Added management UI for editing custom words and settings
- Added detection rules for English text, numbers, foreign languages, and unclosed characters
