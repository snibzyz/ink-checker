# INK CHECKER

`INK CHECKER` is a VS Code extension for reviewing Thai writing consistency.

It helps flag words or patterns you want to watch for while editing, including:
- custom word lists
- English text
- numbers
- non-Thai foreign-language text
- unclosed quotes, parentheses, and brackets

It also includes a built-in management panel for editing watch lists and checker settings without manually editing `settings.json`.

## Features

- Highlight custom words from your own watch list
- Detect English text, numeric sequences, and other foreign-language characters
- Detect unclosed curly quotes, double quotes, single quotes, parentheses, and brackets
- Manage custom words and word groups from the extension UI
- Customize highlight colors for different rule groups
- Toggle the checker on or off quickly

## Install

### Open VSX

Install from Open VSX:

- [INK CHECKER on Open VSX](https://open-vsx.org/extension/inkrealm/ink-checker)

Or install with the command line:

```bash
code --install-extension inkrealm.ink-checker
```

### VSIX

If you have a packaged `.vsix` file:

```bash
code --install-extension ink-checker-0.0.5.vsix
```

You can also drag the `.vsix` file into VS Code.

## Usage

After installation:

1. Open Command Palette.
2. Run `INK CHECKER: เปิดจัดการรายการคำ`.
3. Add words, configure rules, and save.

You can also search for `INK CHECKER` in the VS Code Settings UI.

## Commands

- `INK CHECKER: เปิดจัดการรายการคำ`
- `INK CHECKER: เปิด/ปิดการตรวจสอบ`

## Main Settings

- `kunpengChecker.enabled`
- `kunpengChecker.customWords`
- `kunpengChecker.wordGroups`
- `kunpengChecker.checkEnglish`
- `kunpengChecker.checkNumbers`
- `kunpengChecker.checkForeignLanguages`
- `kunpengChecker.checkUnclosedFancyQuotes`
- `kunpengChecker.checkUnclosedDoubleQuotes`
- `kunpengChecker.checkUnclosedSingleQuotes`
- `kunpengChecker.checkUnclosedParentheses`
- `kunpengChecker.checkUnclosedBrackets`
- `kunpengChecker.customWordsColor`
- `kunpengChecker.languageAndNumberColor`
- `kunpengChecker.unbalancedCharactersColor`

## Development

```bash
npm install
npm run compile
```

To run the extension locally, open the project in VS Code and press `F5`.

## Repository

- [GitHub repository](https://github.com/snibzyz/ink-checker)

## License

MIT. See `LICENSE.md`.
