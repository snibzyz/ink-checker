# Contributing

Thanks for your interest in improving `INK CHECKER`.

## Development Setup

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Compile the extension:

```bash
npm run compile
```

4. Open the project in VS Code and press `F5` to launch an Extension Development Host.

## Project Structure

- `src/extension.ts` - extension activation, decorations, and diagnostics logic
- `src/wordListPanel.ts` - webview-based settings and word list management UI
- `package.json` - extension manifest, commands, and settings schema

## Contribution Guidelines

- Keep changes focused and easy to review
- Update docs when behavior or setup changes
- Do not commit secrets, tokens, or local user settings
- Keep user-facing labels and descriptions clear in both commands and settings

## Before Opening a Pull Request

- Run `npm run compile`
- Verify the extension starts correctly in the development host
- Check that settings still render properly in the VS Code Settings UI
- Confirm no local files such as `tokens.env` or `user.json` are included
