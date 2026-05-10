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

- `src/extension.ts` — activation, decorations, commands. **Calls `runMigrations(context)` before the first `formatting.refresh()`** — never skip this.
- `src/settingsPanel.ts` — unified webview (sidebar nav + tabs). All UI is here.
- `src/formatting.ts` — page-formatting logic, including the `editor.*` snapshot/restore for `.txt` and `.md`. Notes:
  - The disable path **must** always loop over `ALL_FORMATTABLE_LANGS × EDITOR_KEYS`, even when no snapshot exists, otherwise turning the toggle off won't actually clear the font.
  - The set of managed `EDITOR_KEYS` includes `wrappingStrategy: "advanced"` — required so Thai wrap doesn't split graphemes mid-word.
- `src/wordListPanel.ts`, `src/formattingPanel.ts` — older standalone panels, kept for legacy command paths but most users land in the unified `settingsPanel`.

## Migration system

Anything that changes which `editor.*` keys we write, or how we write them, **must** add a migration step. The pattern lives in [src/formatting.ts](../src/formatting.ts):

```ts
const MIGRATION_VERSION_KEY = "inkChecker.formatting.migrationVersion";
const CURRENT_MIGRATION_VERSION = 2;

export async function runMigrations(context) {
  const current = context.globalState.get(MIGRATION_VERSION_KEY, 0);
  if (current >= CURRENT_MIGRATION_VERSION) return;
  if (current < 2) await migrateToV2(context);
  // if (current < 3) await migrateToV3(context);  ← add new steps here
  await context.globalState.update(MIGRATION_VERSION_KEY, CURRENT_MIGRATION_VERSION);
}
```

Why this matters: v1.0.0 wrote `[plaintext]/[markdown].editor.*` without snapshotting. v1.0.1 added a snapshot system but captured *after* v1.0.0's pollution, so the snapshot stored TH Sarabun as the user's "original" — toggle on/off was a visual no-op. v1.0.2 migrated it (cleared the keys, dropped the snapshot, re-applied cleanly).

**Rule:** If you add or change any item in `EDITOR_KEYS`, or change what we write into one, bump `CURRENT_MIGRATION_VERSION` and add a `migrateToV<N>` that clears the affected keys at both Global and Workspace targets and discards the snapshot. `applyFormattingToVSCode` runs after `runMigrations` so it'll re-write whatever should be active.

## UI principles

- All UI text is **Thai**. Default font in webviews is `TH Sarabun New`.
- Master toggles (`enabled`, `formatting.enabled`) appear in **both** the Overview and the detail tab — this is intentional. Each carries a click-to-jump "sync" badge so users see they mirror the same setting.
