# Changelog

All notable changes to this project will be documented in this file.

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
