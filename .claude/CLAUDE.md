# INK CHECKER — project notes for Claude

## Publishing

This extension publishes to **two registries** with different identities. Each has its own manifest:

- **VS Code Marketplace** — `kunpeng-dev.kunpeng-checker` → `package.marketplace.json`
- **Open VSX** — `inkrealm.ink-checker` → `package.openvsx.json`

`scripts/use-manifest.cjs <marketplace|openvsx>` copies the chosen manifest over `package.json`. Always switch back to **marketplace** when you're done so the working tree stays in the default state.

### Tokens

PATs live in **`tokens.env`** at the repo root (gitignored). Format:

```
vsce_token=<azure-devops-pat>
ovsx_token=<openvsx-pat>
```

**Always check `tokens.env` first** before asking the user for a PAT, before checking env vars, before checking cached vsce logins. Cached vsce logins for `kunpeng-dev` are likely expired.

### Release flow

When the user asks to publish:

1. Bump version in **all three** manifests: `package.json`, `package.marketplace.json`, `package.openvsx.json` (they must match).
2. Add a `## x.y.z` section to `CHANGELOG.md`.
3. Commit (`chore(release): x.y.z`) and push to `main`.
4. `npm run compile` to ensure clean build.
5. Source tokens from `tokens.env`, then:
   ```bash
   npm run use:marketplace && npx vsce publish -p "$VSCE_PAT"
   npm run use:openvsx     && npx ovsx publish -p "$OVSX_PAT"
   ```
6. `npm run use:marketplace` again so the working tree's `package.json` matches the marketplace identity (the default).
7. `git tag -a vX.Y.Z -m "..."` and `git push origin vX.Y.Z`.

### Conventions

- Patch (1.0.x) for bug fixes and small UX tweaks.
- Minor (1.x.0) for new user-facing features.
- Major (x.0.0) for breaking changes or large overhauls.

## Code shape

- `src/extension.ts` — activation, decorations, commands.
- `src/settingsPanel.ts` — unified webview (sidebar nav + tabs). All UI is here.
- `src/formatting.ts` — page-formatting logic, including the `editor.fontFamily` snapshot/restore for `.txt` and `.md`. Note: the disable path **must** always loop over `ALL_FORMATTABLE_LANGS × EDITOR_KEYS`, even when no snapshot exists, otherwise turning the toggle off won't actually clear the font.
- `src/wordListPanel.ts`, `src/formattingPanel.ts` — older standalone panels, kept for legacy command paths but most users land in the unified `settingsPanel`.

## UI principles

- All UI text is **Thai**. Default font in webviews is `TH Sarabun New`.
- Master toggles (`enabled`, `formatting.enabled`) appear in **both** the Overview and the detail tab — this is intentional. Each carries a click-to-jump "sync" badge so users see they mirror the same setting.
