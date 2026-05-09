# INK CHECKER

`INK CHECKER` is a VS Code extension for reviewing and formatting Thai writing.

It helps flag words or patterns you want to watch for while editing, and includes a one-click "page formatting" mode that turns plain `.txt` and `.md` files into a comfortable Thai reading experience using **TH Sarabun**.

## Features

### Writing checker
- Highlight custom words from your own watch list
- Detect English text, numeric sequences, and other foreign-language characters
- Detect unclosed curly quotes, double quotes, single quotes, parentheses, and brackets
- Hover-replace using configurable word groups (e.g. swap between `ข้า / ฉัน / เธอ / คุณ / เจ้า`)
- Customize highlight colors per rule group

### Page formatting (new in 1.0)
- Apply **TH Sarabun** (or any other font) plus size, line-height, paragraph indent, and word-wrap to `.txt` and `.md` files only
- Paragraph indent applies to **every line** in a paragraph — matches Microsoft Word
- Word-wrap is **bounded** to a configurable column width (default 90 characters) so lines stay readable
- One-click presets: TH Sarabun 14 / 16 / 18 / 20
- Original `editor.*` settings are snapshotted before changes — turning the feature off restores them

### Settings panel
- A single unified panel with a sidebar (overview / checker / words / word groups / page formatting / colors / advanced)
- TH Sarabun font and SVG icons throughout
- **Import / Export** settings as JSON, or copy to clipboard for sharing between machines

## Install

### VS Code Marketplace

```bash
code --install-extension kunpeng-dev.kunpeng-checker
```

### Open VSX

- [INK CHECKER on Open VSX](https://open-vsx.org/extension/inkrealm/ink-checker)

```bash
code --install-extension inkrealm.ink-checker
```

### VSIX

Drag a packaged `.vsix` into VS Code, or:

```bash
code --install-extension kunpeng-checker-1.0.0.vsix
```

## Usage

After installation:

1. Click the **`INK: N คำ`** button in the status bar (bottom right) to open the settings panel.
2. Sidebar navigation: switch between **ภาพรวม / ตรวจสอบคำ / รายการคำ / กลุ่มคำสลับ / หน้ากระดาษ / สีไฮไลต์ / ขั้นสูง**.
3. For page formatting, go to **หน้ากระดาษ** and pick a preset (TH Sarabun 16 is the recommended default).

Keyboard shortcut: **Ctrl+Alt+I** (macOS **Cmd+Alt+I**) opens the settings panel on the words tab.

## Commands

- `INK CHECKER: เปิดหน้าตั้งค่า`
- `INK CHECKER: เปิดจัดการรายการคำ`
- `INK CHECKER: เปิดหน้าจัดหน้ากระดาษ`
- `INK CHECKER: เปิด/ปิดการตรวจสอบ`
- `INK CHECKER: เปิด/ปิดการจัดหน้ากระดาษ`
- `INK CHECKER: เมนูจัดหน้ากระดาษแบบเร็ว (QuickPick)`
- `INK CHECKER: ใช้ Preset หน้ากระดาษ`
- `INK CHECKER: รีเซ็ตการจัดหน้ากระดาษ`

## Settings

### Checker
- `inkChecker.enabled`
- `inkChecker.customWords`
- `inkChecker.wordGroups`
- `inkChecker.checkEnglish`
- `inkChecker.checkNumbers`
- `inkChecker.checkForeignLanguages`
- `inkChecker.checkUnclosedFancyQuotes`
- `inkChecker.checkUnclosedDoubleQuotes`
- `inkChecker.checkUnclosedSingleQuotes`
- `inkChecker.checkUnclosedParentheses`
- `inkChecker.checkUnclosedBrackets`

### Highlight colors
- `inkChecker.customWordsColor`
- `inkChecker.languageAndNumberColor`
- `inkChecker.unbalancedCharactersColor`

### Page formatting
- `inkChecker.formatting.enabled`
- `inkChecker.formatting.fontFamily`
- `inkChecker.formatting.fontSize`
- `inkChecker.formatting.lineHeight`
- `inkChecker.formatting.paragraphIndent`
- `inkChecker.formatting.wordWrap`
- `inkChecker.formatting.wordWrapColumn`
- `inkChecker.formatting.applyToPlaintext`
- `inkChecker.formatting.applyToMarkdown`
- `inkChecker.formatting.configurationTarget`

## Development

```bash
npm install
npm run compile
```

To run the extension locally, open the project in VS Code and press `F5`.

## Release Targets

This repository supports two publish targets:

- `package.marketplace.json` for `kunpeng-dev.kunpeng-checker` (VS Code Marketplace)
- `package.openvsx.json` for `inkrealm.ink-checker` (Open VSX)

```bash
npm run use:marketplace   # then: npx vsce publish -p $vsce_token
npm run use:openvsx       # then: npx ovsx publish  -p $ovsx_token
```

## Repository

- [GitHub](https://github.com/snibzyz/ink-checker)

## License

MIT. See `LICENSE.md`.
