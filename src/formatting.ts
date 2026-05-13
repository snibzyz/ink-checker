import * as vscode from "vscode";

// ======================================================================
// Page Formatting Module — จัดหน้ากระดาษให้ .txt / .md
// ======================================================================
//
// หลักการ (อ้างอิงจาก INKIDEA ReadingPaperEditor):
//  - font / size / lineHeight / wordWrap → เขียนเป็น VS Code language-scoped
//    settings ([plaintext] / [markdown]) เพื่อให้ทำงานในตัว editor จริง
//  - paragraph indent → ใช้ TextEditorDecorationType "before" injection
//    (ภาพย่อหน้า — ไม่แก้ตัวไฟล์)

const ROOT = "inkChecker";
const FORMATTING_PREFIX = "formatting";
const EDITOR_KEYS = [
  "fontFamily",
  "fontSize",
  "lineHeight",
  "wordWrap",
  "wordWrapColumn",
  "wrappingStrategy",
] as const;

const DEFAULT_FONT_FAMILY =
  "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', 'Segoe UI', sans-serif";

export type FormattingConfig = {
  enabled: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphIndent: number;
  wordWrap: boolean;
  wordWrapColumn: number;
  applyToPlaintext: boolean;
  applyToMarkdown: boolean;
  configurationTarget: "global" | "workspace";
};

type Preset = {
  id: string;
  label: string;
  description: string;
  values: Partial<FormattingConfig>;
};

const PRESETS: Preset[] = [
  {
    id: "tahoma-14",
    label: "Tahoma 14 (Windows ดั้งเดิม)",
    description: "ฟอนต์ระบบ Windows สำรอง — ถ้า Sarabun เพี้ยน",
    values: {
      fontFamily: "Tahoma, 'Noto Sans Thai', sans-serif",
      fontSize: 14,
      lineHeight: 1.4,
      paragraphIndent: 0,
      wordWrap: true,
      wordWrapColumn: 90,
    },
  },
  {
    id: "sarabun-16",
    label: "TH Sarabun 16 (มาตรฐาน)",
    description: "font ราชการ ขนาดอ่านง่าย",
    values: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 16,
      lineHeight: 1.6,
      paragraphIndent: 32,
      wordWrap: true,
      wordWrapColumn: 90,
    },
  },
  {
    id: "sarabun-18",
    label: "TH Sarabun 18 (ใหญ่)",
    description: "อ่านสบายตา เหมาะกับการตรวจงาน",
    values: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 18,
      lineHeight: 1.7,
      paragraphIndent: 36,
      wordWrap: true,
      wordWrapColumn: 90,
    },
  },
  {
    id: "sarabun-20",
    label: "TH Sarabun 20 (ใหญ่มาก)",
    description: "เหมาะกับจอใหญ่ / สายตา",
    values: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 20,
      lineHeight: 1.8,
      paragraphIndent: 40,
      wordWrap: true,
      wordWrapColumn: 80,
    },
  },
  {
    id: "sarabun-compact",
    label: "TH Sarabun 14 (กระชับ)",
    description: "พื้นที่จำกัด หรือดูภาพรวมหลายบรรทัด",
    values: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 14,
      lineHeight: 1.5,
      paragraphIndent: 24,
      wordWrap: true,
      wordWrapColumn: 100,
    },
  },
];

let indentDecorationType: vscode.TextEditorDecorationType | undefined;
let lastAppliedIndentPx = -1;
let updateTimer: NodeJS.Timeout | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

const SNAPSHOT_KEY = "inkChecker.formatting.snapshot.v1";

// เก็บ languageId เพิ่มเติมที่เคยเขียน editor.* (นอกเหนือจาก plaintext/markdown)
// — สำหรับเคสที่ผู้ใช้เปิด .txt แต่ VS Code detect เป็น language อื่น
// (เช่น "log", "ascii", หรือถูก extension ยึดไป) → เราตามไปเขียน [<lang>]
// ด้วย เพื่อให้ฟอนต์ apply ได้จริง บัญชีนี้ persistent ใน globalState เพื่อ
// คืนค่าได้ครบเวลา disable แม้ session ถัดไป
const DYNAMIC_LANGS_KEY = "inkChecker.formatting.dynamicLangs.v1";

// ----------------------------------------------------------------------
// Migration — versioned, run-once. ทุก version bump ที่กระทบ editor.* settings
// ต้องเพิ่ม migration step ใหม่ที่นี่ + bump CURRENT_MIGRATION_VERSION
// ----------------------------------------------------------------------
const MIGRATION_VERSION_KEY = "inkChecker.formatting.migrationVersion";
const CURRENT_MIGRATION_VERSION = 3;

type SnapshotLang = Record<string, unknown | null>;
type Snapshot = Record<string, SnapshotLang>;

export async function runMigrations(context: vscode.ExtensionContext): Promise<void> {
  const current = context.globalState.get<number>(MIGRATION_VERSION_KEY, 0);
  if (current >= CURRENT_MIGRATION_VERSION) return;

  if (current < 2) {
    await migrateToV2(context);
  }
  if (current < 3) {
    await migrateToV3();
  }

  await context.globalState.update(MIGRATION_VERSION_KEY, CURRENT_MIGRATION_VERSION);
}

// v1.0.2 migration: ก่อนหน้านี้ (v1.0.0/v1.0.1) อาจเขียน [plaintext]/[markdown].editor.*
// ตกค้างไว้ + snapshot อาจปนเปื้อน (capture หลัง v1.0.0 set ค่าเรียบร้อยแล้ว)
// → เคลียร์ทุก lang/key ที่ extension อาจเคยเขียน + ทิ้ง snapshot เก่า
// applyFormattingToVSCode จะถูกเรียกหลัง migration เสร็จ จะเขียนค่าใหม่ให้เอง
async function migrateToV2(context: vscode.ExtensionContext): Promise<void> {
  for (const lang of ALL_FORMATTABLE_LANGS) {
    const config = vscode.workspace.getConfiguration("editor", { languageId: lang });
    for (const k of EDITOR_KEYS) {
      await config.update(k, undefined, vscode.ConfigurationTarget.Global, true);
      if (vscode.workspace.workspaceFolders?.length) {
        await config.update(k, undefined, vscode.ConfigurationTarget.Workspace, true);
      }
    }
  }
  await context.globalState.update(SNAPSHOT_KEY, undefined);
}

// v1.0.6 migration: รุ่นก่อน (v1.0.0–v1.0.5) เคลียร์ key รายตัวด้วย
// config.update(k, undefined) แต่ไม่ลบ container "[markdown]"/"[plaintext]"
// → ทิ้ง "[markdown]": {} (หรือเลวร้ายกว่า: "[markdown]": { , }) ค้างไว้
// ทำให้ settings.json รก / parse fail ในบาง edge case
// → migration นี้: ถ้า container ว่าง (ไม่มี key ของ user เอง) → ลบทิ้ง
async function migrateToV3(): Promise<void> {
  for (const lang of ALL_FORMATTABLE_LANGS) {
    await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Global);
    if (vscode.workspace.workspaceFolders?.length) {
      await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Workspace);
    }
  }
}

/**
 * ลบ container "[<lang>]" ถ้ามันว่าง (เพื่อไม่ทิ้ง {} ค้าง) — ที่ scope
 * ที่ระบุเท่านั้น (Global / Workspace) ตรวจผ่าน config.inspect() ถ้าค่า
 * ในนั้นมี user-managed keys อื่น (เช่น editor.formatOnSave) → ไม่ลบ
 *
 * เหตุที่จำเป็น: vscode.workspace.getConfiguration("editor", {languageId})
 * .update(key, undefined) ลบเฉพาะ key ในนั้น แต่ตัว container "[markdown]"
 * เอง VS Code ไม่เก็บกวาดให้ — ต้องเรียก root config.update("[markdown]",
 * undefined) แยก
 */
async function clearLanguageContainerIfEmpty(
  lang: string,
  target: vscode.ConfigurationTarget
): Promise<void> {
  const rootConfig = vscode.workspace.getConfiguration();
  const key = `[${lang}]`;
  const inspect = rootConfig.inspect<Record<string, unknown>>(key);
  if (!inspect) return;

  const valueAtTarget =
    target === vscode.ConfigurationTarget.Global
      ? inspect.globalValue
      : target === vscode.ConfigurationTarget.Workspace
      ? inspect.workspaceValue
      : inspect.workspaceFolderValue;

  if (!valueAtTarget) return; // ไม่มี container ที่ scope นี้ — ไม่ต้องทำอะไร

  // ลบเฉพาะกรณีว่างจริง — ถ้ามี key อื่น (เช่น formatOnSave ของ user) → ไม่แตะ
  if (
    typeof valueAtTarget === "object" &&
    Object.keys(valueAtTarget).length === 0
  ) {
    try {
      await rootConfig.update(key, undefined, target);
    } catch {
      // เขียนไม่ได้ก็ปล่อยไป — caller (activate) มี try/catch ห่อหุ้มอีกชั้น
    }
  }
}

// ----------------------------------------------------------------------
// Read config
// ----------------------------------------------------------------------

export function getFormattingConfig(): FormattingConfig {
  const c = vscode.workspace.getConfiguration(ROOT);
  return {
    enabled: c.get<boolean>(`${FORMATTING_PREFIX}.enabled`, false),
    fontFamily: c.get<string>(`${FORMATTING_PREFIX}.fontFamily`, DEFAULT_FONT_FAMILY),
    fontSize: c.get<number>(`${FORMATTING_PREFIX}.fontSize`, 16),
    lineHeight: c.get<number>(`${FORMATTING_PREFIX}.lineHeight`, 1.6),
    paragraphIndent: c.get<number>(`${FORMATTING_PREFIX}.paragraphIndent`, 32),
    wordWrap: c.get<boolean>(`${FORMATTING_PREFIX}.wordWrap`, true),
    wordWrapColumn: c.get<number>(`${FORMATTING_PREFIX}.wordWrapColumn`, 90),
    applyToPlaintext: c.get<boolean>(`${FORMATTING_PREFIX}.applyToPlaintext`, true),
    applyToMarkdown: c.get<boolean>(`${FORMATTING_PREFIX}.applyToMarkdown`, true),
    configurationTarget: c.get<"global" | "workspace">(
      `${FORMATTING_PREFIX}.configurationTarget`,
      "global"
    ),
  };
}

function getTargetLanguages(cfg: FormattingConfig): string[] {
  const langs: string[] = [];
  if (cfg.applyToPlaintext) langs.push("plaintext");
  if (cfg.applyToMarkdown) langs.push("markdown");
  return langs;
}

function getConfigTarget(cfg: FormattingConfig): vscode.ConfigurationTarget {
  if (cfg.configurationTarget === "workspace" && vscode.workspace.workspaceFolders?.length) {
    return vscode.ConfigurationTarget.Workspace;
  }
  return vscode.ConfigurationTarget.Global;
}

// ----------------------------------------------------------------------
// Apply settings to VS Code (language-scoped)
// ----------------------------------------------------------------------

function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function readCurrentLangValue(
  languageId: string,
  key: (typeof EDITOR_KEYS)[number],
  target: vscode.ConfigurationTarget
): unknown {
  const config = vscode.workspace.getConfiguration("editor", { languageId });
  const inspected = config.inspect(key);
  if (!inspected) return undefined;
  switch (target) {
    case vscode.ConfigurationTarget.Global:
      return inspected.globalLanguageValue;
    case vscode.ConfigurationTarget.Workspace:
      return inspected.workspaceLanguageValue;
    case vscode.ConfigurationTarget.WorkspaceFolder:
      return inspected.workspaceFolderLanguageValue;
  }
}

// เขียน editor.<key> แบบ idempotent + retry — แก้ race condition เวลา
// เปิด VS Code หลาย instance พร้อมกัน (ทุก instance activate และ
// applyFormattingToVSCode ในเวลาเดียวกัน แย่งเขียน settings.json
// → ตัวหนึ่งสำเร็จ ตัวอื่น throw "Unable to write into user settings")
//
// กลยุทธ์:
//   1) อ่านค่าปัจจุบันก่อน — ถ้าตรงกับที่จะเขียนอยู่แล้ว → skip (ไม่ชนเลย)
//   2) ถ้าเขียนแล้ว throw → backoff สั้น ๆ + retry สูงสุด 3 ครั้ง
//   3) ก่อน retry แต่ละครั้ง อ่านใหม่ — instance อื่นอาจเขียนค่าที่
//      ตรงกับของเราไปแล้ว → ไม่ต้องเขียนซ้ำ
async function writeEditorSettingIdempotent(
  languageId: string,
  key: (typeof EDITOR_KEYS)[number],
  desired: unknown,
  target: vscode.ConfigurationTarget
): Promise<{ skipped: boolean; error?: unknown }> {
  const ATTEMPTS = 3;
  let lastErr: unknown;
  for (let i = 0; i < ATTEMPTS; i++) {
    const current = readCurrentLangValue(languageId, key, target);
    // desired === undefined หมายถึง "ลบ key นี้"
    if (desired === undefined) {
      if (current === undefined) return { skipped: true };
    } else if (current !== undefined && deepEqualJson(current, desired)) {
      return { skipped: true };
    }
    try {
      const config = vscode.workspace.getConfiguration("editor", { languageId });
      await config.update(key, desired, target, /* overrideInLanguage */ true);
      return { skipped: false };
    } catch (err) {
      lastErr = err;
      if (i < ATTEMPTS - 1) {
        const delay = 50 + i * 100 + Math.floor(Math.random() * 50);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  return { skipped: false, error: lastErr };
}

async function writeEditorSetting(
  languageId: string,
  key: (typeof EDITOR_KEYS)[number],
  value: unknown,
  target: vscode.ConfigurationTarget
): Promise<unknown | undefined> {
  const r = await writeEditorSettingIdempotent(languageId, key, value, target);
  return r.error;
}

async function clearEditorSetting(
  languageId: string,
  key: (typeof EDITOR_KEYS)[number],
  target: vscode.ConfigurationTarget
): Promise<unknown | undefined> {
  const r = await writeEditorSettingIdempotent(languageId, key, undefined, target);
  return r.error;
}

const ALL_FORMATTABLE_LANGS = ["plaintext", "markdown"];

// สแกน open documents เพื่อหา languageId จริงของไฟล์ .txt และ .md ที่
// อาจไม่ใช่ "plaintext"/"markdown" — เคสที่พบ: file ถูก auto-detect เป็น
// language อื่น หรือมี extension/files.associations แมพไป รากของบั๊กที่
// ผู้ใช้รายงาน ".md ทำงาน .txt ไม่ทำงาน" คือ .txt มี langId อื่นนั่นเอง
function detectDynamicLangs(cfg: FormattingConfig): Set<string> {
  const langs = new Set<string>();
  for (const doc of vscode.workspace.textDocuments) {
    const p = doc.uri.fsPath.toLowerCase();
    const isTxt = p.endsWith(".txt");
    const isMd = p.endsWith(".md") || p.endsWith(".markdown");
    if (isTxt && cfg.applyToPlaintext && doc.languageId !== "plaintext") {
      langs.add(doc.languageId);
    }
    if (isMd && cfg.applyToMarkdown && doc.languageId !== "markdown") {
      langs.add(doc.languageId);
    }
  }
  return langs;
}

function getTrackedDynamicLangs(): string[] {
  if (!extensionContext) return [];
  return extensionContext.globalState.get<string[]>(DYNAMIC_LANGS_KEY, []) ?? [];
}

async function setTrackedDynamicLangs(langs: string[]): Promise<void> {
  if (!extensionContext) return;
  await extensionContext.globalState.update(DYNAMIC_LANGS_KEY, langs);
}

// ก่อนเขียน dynamic lang ครั้งแรก → snapshot ค่าเดิมของ lang นั้นไว้ใน
// SNAPSHOT_KEY (เก็บใน Record เดียวกับ plaintext/markdown) เพื่อให้ตอน
// disable / cleanup คืนค่าเดิมได้ ไม่ใช่ลบทิ้งล้วน ๆ จนค่าของผู้ใช้หาย
async function snapshotLangIfNeeded(lang: string): Promise<void> {
  if (!extensionContext) return;
  const snap = extensionContext.globalState.get<Snapshot>(SNAPSHOT_KEY) ?? {};
  if (snap[lang]) return; // เคย snapshot แล้ว
  const config = vscode.workspace.getConfiguration("editor", { languageId: lang });
  const ls: SnapshotLang = {};
  for (const k of EDITOR_KEYS) {
    const inspect = config.inspect(k);
    ls[k] = inspect?.globalLanguageValue ?? null;
  }
  snap[lang] = ls;
  await extensionContext.globalState.update(SNAPSHOT_KEY, snap);
}

// คืนค่าเดิมของ lang ที่เคย snapshot ไว้ (สำหรับ dynamic langs)
// — ถ้าค่าเดิมเป็น null/undefined ก็เขียน undefined (เคลียร์)
async function restoreLangFromAnySnapshot(lang: string): Promise<unknown | undefined> {
  if (!extensionContext) return;
  const snap = extensionContext.globalState.get<Snapshot>(SNAPSHOT_KEY);
  const ls = snap?.[lang];
  let firstErr: unknown;
  for (const k of EDITOR_KEYS) {
    const v = ls?.[k];
    const desired = v === null || v === undefined ? undefined : v;
    const r = await writeEditorSettingIdempotent(
      lang,
      k,
      desired,
      vscode.ConfigurationTarget.Global
    );
    if (r.error) firstErr ??= r.error;
  }
  await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Global);
  // ลบ entry ของ lang นี้ออกจาก snapshot (จะ snapshot ใหม่ถ้าเปิดใช้รอบหน้า)
  if (snap?.[lang]) {
    delete snap[lang];
    await extensionContext.globalState.update(SNAPSHOT_KEY, snap);
  }
  return firstErr;
}

// ----------------------------------------------------------------------
// Snapshot / restore — กันค่าตั้งค่าเดิมของผู้ใช้หาย
// ----------------------------------------------------------------------

async function captureSnapshotIfNeeded(): Promise<void> {
  if (!extensionContext) return;
  const existing = extensionContext.globalState.get<Snapshot>(SNAPSHOT_KEY);
  if (existing) return; // เคยถ่ายไว้แล้ว — ไม่ overwrite

  const snap: Snapshot = {};
  for (const lang of ALL_FORMATTABLE_LANGS) {
    const config = vscode.workspace.getConfiguration("editor", { languageId: lang });
    const ls: SnapshotLang = {};
    for (const k of EDITOR_KEYS) {
      const inspect = config.inspect(k);
      ls[k] = inspect?.globalLanguageValue ?? null;
    }
    snap[lang] = ls;
  }
  await extensionContext.globalState.update(SNAPSHOT_KEY, snap);
}

async function restoreSnapshotIfExists(): Promise<unknown | undefined> {
  if (!extensionContext) return;
  const snap = extensionContext.globalState.get<Snapshot>(SNAPSHOT_KEY);
  let firstErr: unknown;

  // วนทุก lang/key ที่ extension อาจเคยเขียนเสมอ แม้ snapshot ไม่มี/ไม่ครบ —
  // มิฉะนั้น toggle off จะไม่เคลียร์ฟอนต์ที่เราเซ็ตไว้
  for (const lang of ALL_FORMATTABLE_LANGS) {
    const ls = snap?.[lang];
    for (const k of EDITOR_KEYS) {
      const v = ls?.[k];
      const desired = v === null || v === undefined ? undefined : v;
      const r1 = await writeEditorSettingIdempotent(
        lang,
        k,
        desired,
        vscode.ConfigurationTarget.Global
      );
      if (r1.error) firstErr ??= r1.error;
      if (vscode.workspace.workspaceFolders?.length) {
        const r2 = await writeEditorSettingIdempotent(
          lang,
          k,
          undefined,
          vscode.ConfigurationTarget.Workspace
        );
        if (r2.error) firstErr ??= r2.error;
      }
    }
    // หลังเคลียร์ครบ — ลบ container ถ้าว่าง (กัน "[lang]": {} ค้างใน settings.json)
    await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Global);
    if (vscode.workspace.workspaceFolders?.length) {
      await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Workspace);
    }
  }

  if (snap && !firstErr) {
    await extensionContext.globalState.update(SNAPSHOT_KEY, undefined);
  }
  return firstErr;
}

// Single-flight + coalesce — กัน applyFormattingToVSCode ถูกเรียกซ้อนกัน
// (เช่น _updateFormatting เขียน 7 คีย์ → 7 config events → 7 refresh()
// ทำงานพร้อมกัน → idempotent read เห็นค่ากันเอง early-skip → toggle/font
// "เหมือนไม่ทำอะไร") กลยุทธ์: ถ้ามีรอบหนึ่งกำลังทำอยู่ → จองรอบถัดไปแบบ
// pending แค่ตัวเดียว ทุก call ที่เข้ามาระหว่างนั้น share รอบเดียวกัน
let applyInflight: Promise<void> | undefined;
let applyPending = false;

export async function applyFormattingToVSCode(): Promise<void> {
  if (applyInflight) {
    applyPending = true;
    await applyInflight;
    if (!applyPending) return;
  }
  applyInflight = (async () => {
    do {
      applyPending = false;
      await doApplyFormattingOnce();
    } while (applyPending);
  })();
  try {
    await applyInflight;
  } finally {
    applyInflight = undefined;
  }
}

async function doApplyFormattingOnce(): Promise<void> {
  const cfg = getFormattingConfig();
  const target = getConfigTarget(cfg);
  const enabledLangs = new Set(getTargetLanguages(cfg));

  let firstErr: unknown;

  if (cfg.enabled) {
    // ถ่าย snapshot ค่าเดิมก่อน — ทำครั้งเดียว ตอนเปิดใช้งานครั้งแรก
    try {
      await captureSnapshotIfNeeded();
    } catch (err) {
      firstErr ??= err;
    }

    const writes: Array<[(typeof EDITOR_KEYS)[number], unknown]> = [
      ["fontFamily", cfg.fontFamily],
      ["fontSize", cfg.fontSize],
      ["lineHeight", cfg.lineHeight],
      // ใช้ "bounded" เพื่อ wrap ที่ min(viewport, wordWrapColumn) — สั้นพอดีอ่าน
      ["wordWrap", cfg.wordWrap ? "bounded" : "off"],
      ["wordWrapColumn", cfg.wordWrapColumn],
      // "advanced" ใช้ Unicode line-break rules ของ browser engine — เคารพ
      // grapheme cluster ภาษาไทย ไม่ตัดกลางสระ/วรรณยุกต์
      ["wrappingStrategy", "advanced"],
    ];

    // เขียน per-key แบบ idempotent — error ใน key เดียวไม่ทำให้ key อื่นค้าง
    // (สำคัญสำหรับเคส multi-instance race ที่ก่อนหน้านี้ทำให้ [markdown]
    // ค้างค่าเก่าเพราะ [plaintext] เขียนสำเร็จแล้ว throw → loop หยุด)
    for (const lang of ALL_FORMATTABLE_LANGS) {
      if (enabledLangs.has(lang)) {
        for (const [k, v] of writes) {
          const r = await writeEditorSettingIdempotent(lang, k, v, target);
          if (r.error) firstErr ??= r.error;
        }
      } else {
        // ภาษานี้ถูกเอาออกจาก applyTo — คืนค่าเดิม (ถ้ามี snapshot)
        const err = await restoreLangFromSnapshot(lang);
        if (err) firstErr ??= err;
      }
    }

    // Dynamic langs — สแกน open documents เพื่อหา .txt/.md ที่ langId
    // ไม่ใช่ "plaintext"/"markdown" (เช่น auto-detect เป็น "log" หรืออื่น ๆ)
    // → snapshot ค่าเดิมก่อน แล้วเขียน [<langId>] ทับ
    const dynamicLangs = detectDynamicLangs(cfg);
    const prevDynamic = new Set(getTrackedDynamicLangs());

    for (const lang of dynamicLangs) {
      try {
        await snapshotLangIfNeeded(lang);
      } catch (err) {
        firstErr ??= err;
      }
      for (const [k, v] of writes) {
        const r = await writeEditorSettingIdempotent(lang, k, v, target);
        if (r.error) firstErr ??= r.error;
      }
    }

    // ลบ dynamic lang เก่าที่ไม่ได้อยู่ในเซ็ตปัจจุบันแล้ว (ไฟล์ถูกปิด /
    // langId เปลี่ยน) — คืนค่าจาก snapshot
    for (const oldLang of prevDynamic) {
      if (dynamicLangs.has(oldLang)) continue;
      const err = await restoreLangFromAnySnapshot(oldLang);
      if (err) firstErr ??= err;
    }

    await setTrackedDynamicLangs(Array.from(dynamicLangs));
  } else {
    // ปิด formatting — คืนค่าเดิมทุกภาษา แล้วลบ snapshot
    const err = await restoreSnapshotIfExists();
    if (err) firstErr ??= err;

    // เคลียร์ dynamic langs ที่เคยเขียนทั้งหมด — คืนค่าจาก snapshot
    // (snapshotLangIfNeeded เก็บค่าเดิมไว้ก่อนเขียน → เคารพ user setting)
    const tracked = getTrackedDynamicLangs();
    for (const lang of tracked) {
      const err2 = await restoreLangFromAnySnapshot(lang);
      if (err2) firstErr ??= err2;
    }
    if (!firstErr) await setTrackedDynamicLangs([]);
  }

  if (firstErr) throw firstErr;
}

async function restoreLangFromSnapshot(lang: string): Promise<unknown | undefined> {
  if (!extensionContext) return;
  const snap = extensionContext.globalState.get<Snapshot>(SNAPSHOT_KEY);
  const ls = snap?.[lang];
  let firstErr: unknown;
  for (const k of EDITOR_KEYS) {
    const v = ls?.[k];
    const desired = v === null || v === undefined ? undefined : v;
    const r = await writeEditorSettingIdempotent(
      lang,
      k,
      desired,
      vscode.ConfigurationTarget.Global
    );
    if (r.error) firstErr ??= r.error;
  }
  // ถ้าใน "[lang]" ไม่เหลือ key ของ user เอง → ลบ container ทิ้ง
  await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Global);
  return firstErr;
}

// ----------------------------------------------------------------------
// Indent decoration (paragraph first-line indent)
// ----------------------------------------------------------------------

function ensureIndentDecoration(indentPx: number): vscode.TextEditorDecorationType | undefined {
  if (indentPx <= 0) {
    if (indentDecorationType) {
      indentDecorationType.dispose();
      indentDecorationType = undefined;
      lastAppliedIndentPx = -1;
    }
    return undefined;
  }
  if (indentDecorationType && lastAppliedIndentPx === indentPx) {
    return indentDecorationType;
  }
  if (indentDecorationType) {
    indentDecorationType.dispose();
  }
  indentDecorationType = vscode.window.createTextEditorDecorationType({
    before: {
      contentText: "",
      margin: `0 0 0 ${indentPx}px`,
    },
  });
  lastAppliedIndentPx = indentPx;
  return indentDecorationType;
}

// เช็คว่า document ควรถูกจัดหน้ากระดาษหรือไม่ — อ้างอิงจาก langId เป็นหลัก
// แต่ fallback ไปดูนามสกุลไฟล์ ถ้า langId ไม่ใช่ plaintext/markdown (เช่นถูก
// auto-detect เป็น "log") เพื่อให้ indent + การจัดหน้าอื่น ๆ ทำงานบน .txt
// ที่ langId เพี้ยน
function isFormattableDoc(cfg: FormattingConfig, doc: vscode.TextDocument): boolean {
  const langId = doc.languageId;
  if (langId === "plaintext") return cfg.applyToPlaintext;
  if (langId === "markdown") return cfg.applyToMarkdown;
  const p = doc.uri.fsPath.toLowerCase();
  if (p.endsWith(".txt")) return cfg.applyToPlaintext;
  if (p.endsWith(".md") || p.endsWith(".markdown")) return cfg.applyToMarkdown;
  return false;
}

export function updateIndentDecorationsForEditor(editor: vscode.TextEditor | undefined): void {
  if (!editor) return;
  const cfg = getFormattingConfig();
  const langOk = isFormattableDoc(cfg, editor.document);

  if (!cfg.enabled || !langOk || cfg.paragraphIndent <= 0) {
    if (indentDecorationType) {
      editor.setDecorations(indentDecorationType, []);
    }
    return;
  }

  const deco = ensureIndentDecoration(cfg.paragraphIndent);
  if (!deco) return;

  // ย่อหน้าทุกบรรทัด แบบ Word — ใส่ decoration กับทุกบรรทัดที่ไม่ว่าง
  const ranges: vscode.Range[] = [];
  const doc = editor.document;
  for (let i = 0; i < doc.lineCount; i++) {
    const line = doc.lineAt(i);
    if (line.isEmptyOrWhitespace) continue;
    ranges.push(new vscode.Range(line.range.start, line.range.start));
  }
  editor.setDecorations(deco, ranges);
}

export function updateIndentDecorationsAll(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    updateIndentDecorationsForEditor(editor);
  }
}

function triggerIndentUpdate() {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(() => updateIndentDecorationsAll(), 200);
}

// ----------------------------------------------------------------------
// Toggle / Reset
// ----------------------------------------------------------------------

export async function toggleFormatting(): Promise<boolean> {
  const c = vscode.workspace.getConfiguration(ROOT);
  const current = c.get<boolean>(`${FORMATTING_PREFIX}.enabled`, false);
  await c.update(`${FORMATTING_PREFIX}.enabled`, !current, vscode.ConfigurationTarget.Global);
  return !current;
}

export async function resetFormatting(): Promise<void> {
  const c = vscode.workspace.getConfiguration(ROOT);
  const keys = [
    "enabled",
    "fontFamily",
    "fontSize",
    "lineHeight",
    "paragraphIndent",
    "wordWrap",
    "applyToPlaintext",
    "applyToMarkdown",
    "configurationTarget",
  ];
  for (const k of keys) {
    await c.update(`${FORMATTING_PREFIX}.${k}`, undefined, vscode.ConfigurationTarget.Global);
    if (vscode.workspace.workspaceFolders?.length) {
      await c.update(`${FORMATTING_PREFIX}.${k}`, undefined, vscode.ConfigurationTarget.Workspace);
    }
  }
  // คืนค่าเดิมจาก snapshot (ถ้ามี) แล้วล้าง snapshot
  await restoreSnapshotIfExists();
  // เผื่อมีตกค้างใน workspace
  for (const lang of ALL_FORMATTABLE_LANGS) {
    for (const k of EDITOR_KEYS) {
      if (vscode.workspace.workspaceFolders?.length) {
        await clearEditorSetting(lang, k, vscode.ConfigurationTarget.Workspace);
      }
    }
    // ลบ container "[lang]" ที่อาจเหลือว่างทั้งสอง scope
    await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Global);
    if (vscode.workspace.workspaceFolders?.length) {
      await clearLanguageContainerIfEmpty(lang, vscode.ConfigurationTarget.Workspace);
    }
  }
  updateIndentDecorationsAll();
}

// ----------------------------------------------------------------------
// QuickPick menu (เมนูจัดหน้ากระดาษ)
// ----------------------------------------------------------------------

type MenuAction =
  | "toggle"
  | "font"
  | "size"
  | "lineHeight"
  | "indent"
  | "wrap"
  | "applyTo"
  | "preset"
  | "reset"
  | "openSettings";

type MenuItem = vscode.QuickPickItem & { action?: MenuAction };

type SimpleMenuItem = vscode.QuickPickItem & {
  action?:
    | "toggle"
    | "preset"
    | "advanced"
    | "reset";
  presetId?: string;
};

export async function openFormattingMenu(): Promise<void> {
  const cfg = getFormattingConfig();
  const items: SimpleMenuItem[] = [];

  // ─── ปุ่มหลัก: เปิด/ปิด ───
  if (cfg.enabled) {
    const fontShort = cfg.fontFamily.split(",")[0].replace(/['\"]/g, "").trim();
    items.push({
      label: `$(circle-large-filled)  ปิดการจัดหน้ากระดาษ`,
      description: `กำลังใช้: ${fontShort} ${cfg.fontSize}px`,
      action: "toggle",
    });
  } else {
    items.push({
      label: `$(circle-large-outline)  เปิดการจัดหน้ากระดาษ`,
      description: "ใช้ค่ามาตรฐาน TH Sarabun 16",
      action: "toggle",
    });
  }

  // ─── เลือกแบบสำเร็จ (1 คลิก) ───
  items.push({ label: "เลือกขนาด (กดครั้งเดียวเสร็จ)", kind: vscode.QuickPickItemKind.Separator });
  for (const p of PRESETS) {
    const isCurrent =
      cfg.enabled &&
      p.values.fontSize === cfg.fontSize &&
      p.values.lineHeight === cfg.lineHeight;
    items.push({
      label: `$(symbol-color)  ${p.label}`,
      description: isCurrent ? "● ใช้อยู่" : p.description,
      action: "preset",
      presetId: p.id,
    });
  }

  // ─── ปรับเอง (สำหรับคนชอบจูน) ───
  items.push({ label: "อื่น ๆ", kind: vscode.QuickPickItemKind.Separator });
  items.push({
    label: "$(settings)  ปรับละเอียดเอง...",
    description: "เปลี่ยนฟอนต์ / ขนาด / ย่อหน้า / ตัดบรรทัด ทีละข้อ",
    action: "advanced",
  });
  items.push({
    label: "$(discard)  รีเซ็ตทุกอย่างกลับเป็นค่าเดิม",
    action: "reset",
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: "INK CHECKER — จัดหน้ากระดาษ",
    placeHolder: cfg.enabled ? "เปิดอยู่" : "ปิดอยู่",
    matchOnDescription: true,
  });
  if (!pick || !pick.action) return;

  switch (pick.action) {
    case "toggle": {
      const newState = await toggleFormatting();
      vscode.window.showInformationMessage(
        newState
          ? "✓ เปิดจัดหน้ากระดาษแล้ว — ใช้ TH Sarabun 16"
          : "✗ ปิดจัดหน้ากระดาษแล้ว — กลับไปใช้ค่าเดิม"
      );
      break;
    }
    case "preset":
      if (pick.presetId) {
        await applyPreset(pick.presetId);
      }
      break;
    case "advanced":
      await openAdvancedFormattingMenu();
      break;
    case "reset": {
      const ok = await vscode.window.showWarningMessage(
        "ต้องการรีเซ็ตการจัดหน้ากระดาษทั้งหมด?",
        { modal: true },
        "รีเซ็ต"
      );
      if (ok === "รีเซ็ต") {
        await resetFormatting();
        vscode.window.showInformationMessage("✓ รีเซ็ตการจัดหน้ากระดาษแล้ว");
      }
      break;
    }
  }
}

async function applyPreset(presetId: string) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  const c = vscode.workspace.getConfiguration(ROOT);
  for (const [k, v] of Object.entries(preset.values)) {
    await c.update(`${FORMATTING_PREFIX}.${k}`, v, vscode.ConfigurationTarget.Global);
  }
  await c.update(`${FORMATTING_PREFIX}.enabled`, true, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`✓ ใช้: ${preset.label}`);
}

// ─── เมนู "ปรับละเอียด" — สำหรับคนต้องการจูนเอง ───
async function openAdvancedFormattingMenu(): Promise<void> {
  const cfg = getFormattingConfig();
  const fontDisplay = cfg.fontFamily.split(",")[0].replace(/['\"]/g, "").trim();

  type Item = vscode.QuickPickItem & {
    action?: "font" | "size" | "lineHeight" | "indent" | "wrap" | "applyTo";
  };

  const items: Item[] = [
    {
      label: "$(text-size)  ฟอนต์",
      description: fontDisplay,
      action: "font",
    },
    {
      label: "$(symbol-numeric)  ขนาดตัวอักษร",
      description: `${cfg.fontSize} px`,
      action: "size",
    },
    {
      label: "$(arrow-both)  ระยะห่างบรรทัด",
      description: `${cfg.lineHeight}x`,
      action: "lineHeight",
    },
    {
      label: "$(indent)  ระยะย่อหน้า (ทุกบรรทัด)",
      description: cfg.paragraphIndent === 0 ? "ปิด" : `${cfg.paragraphIndent} px`,
      action: "indent",
    },
    {
      label: "$(word-wrap)  ตัดบรรทัด (ความกว้าง)",
      description: cfg.wordWrap ? `เปิด — ${cfg.wordWrapColumn} ตัวอักษร` : "ปิด",
      action: "wrap",
    },
    {
      label: "$(file)  ใช้กับไฟล์",
      description:
        [cfg.applyToPlaintext ? ".txt" : null, cfg.applyToMarkdown ? ".md" : null]
          .filter(Boolean)
          .join(" + ") || "(ไม่มี)",
      action: "applyTo",
    },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: "ปรับละเอียด — เลือกข้อที่ต้องการแก้",
    placeHolder: "กดเลือกแต่ละข้อเพื่อแก้ค่า",
  });
  if (!pick || !pick.action) return;

  switch (pick.action) {
    case "font":
      await pickFont();
      break;
    case "size":
      await pickFontSize();
      break;
    case "lineHeight":
      await pickLineHeight();
      break;
    case "indent":
      await pickIndent();
      break;
    case "wrap":
      await pickWordWrap();
      break;
    case "applyTo":
      await pickApplyTo();
      break;
  }
}

// ----------------------------------------------------------------------
// Sub-pickers
// ----------------------------------------------------------------------

async function pickFont() {
  const choices: (vscode.QuickPickItem & { value?: string })[] = [
    {
      label: "TH Sarabun (แนะนำ)",
      description: "ฟอนต์ราชการไทย",
      value: DEFAULT_FONT_FAMILY,
    },
    {
      label: "Sarabun",
      description: "Sarabun (Google Fonts)",
      value: "'Sarabun', 'Noto Sans Thai', sans-serif",
    },
    {
      label: "Noto Sans Thai",
      description: "ฟอนต์ Google สำหรับไทย",
      value: "'Noto Sans Thai', sans-serif",
    },
    {
      label: "Kanit",
      description: "ฟอนต์ทันสมัย",
      value: "'Kanit', sans-serif",
    },
    {
      label: "Prompt",
      description: "ฟอนต์ทันสมัย",
      value: "'Prompt', sans-serif",
    },
    {
      label: "Cordia New",
      description: "ฟอนต์ Office",
      value: "'Cordia New', 'CordiaUPC', sans-serif",
    },
    {
      label: "Angsana New",
      description: "ฟอนต์ Office",
      value: "'Angsana New', 'AngsanaUPC', serif",
    },
    {
      label: "$(edit) กำหนดเอง...",
      description: "ใส่ font-family CSS เอง",
    },
  ];

  const pick = await vscode.window.showQuickPick(choices, {
    title: "เลือก Font",
    placeHolder: "เลือกฟอนต์ที่ต้องการ",
  });
  if (!pick) return;

  let value = pick.value;
  if (!value) {
    value = await vscode.window.showInputBox({
      title: "กำหนด Font Family เอง",
      prompt: "ใส่ค่า font-family แบบ CSS (สามารถใส่หลายฟอนต์คั่นด้วย ,)",
      value: DEFAULT_FONT_FAMILY,
    });
    if (!value) return;
  }
  await vscode.workspace
    .getConfiguration(ROOT)
    .update(`${FORMATTING_PREFIX}.fontFamily`, value, vscode.ConfigurationTarget.Global);
  await ensureEnabled();
}

async function pickFontSize() {
  const presets = [12, 14, 16, 18, 20, 22, 24, 28];
  const items: (vscode.QuickPickItem & { value?: number })[] = presets.map((n) => ({
    label: `${n} px`,
    value: n,
  }));
  items.push({ label: "$(edit) กำหนดเอง...", description: "8 - 72 px" });

  const pick = await vscode.window.showQuickPick(items, {
    title: "ขนาดตัวอักษร",
  });
  if (!pick) return;

  let value = pick.value;
  if (value === undefined) {
    const input = await vscode.window.showInputBox({
      title: "ขนาดตัวอักษร (px)",
      prompt: "8 - 72",
      validateInput: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 8 || n > 72) return "ใส่เลข 8 - 72";
        return null;
      },
    });
    if (!input) return;
    value = Number(input);
  }
  await vscode.workspace
    .getConfiguration(ROOT)
    .update(`${FORMATTING_PREFIX}.fontSize`, value, vscode.ConfigurationTarget.Global);
  await ensureEnabled();
}

async function pickLineHeight() {
  const presets = [1.2, 1.4, 1.5, 1.6, 1.8, 2.0, 2.4];
  const items: (vscode.QuickPickItem & { value?: number })[] = presets.map((n) => ({
    label: `${n}x`,
    description:
      n <= 1.4 ? "แน่น" : n <= 1.6 ? "มาตรฐาน" : n <= 1.8 ? "โปร่ง" : "อ่านสบาย",
    value: n,
  }));
  items.push({ label: "$(edit) กำหนดเอง...", description: "1.0 - 3.0" });

  const pick = await vscode.window.showQuickPick(items, { title: "ระยะห่างบรรทัด" });
  if (!pick) return;

  let value = pick.value;
  if (value === undefined) {
    const input = await vscode.window.showInputBox({
      title: "ระยะห่างบรรทัด (multiplier)",
      prompt: "1.0 - 3.0",
      validateInput: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 1 || n > 3) return "ใส่เลข 1.0 - 3.0";
        return null;
      },
    });
    if (!input) return;
    value = Number(input);
  }
  await vscode.workspace
    .getConfiguration(ROOT)
    .update(`${FORMATTING_PREFIX}.lineHeight`, value, vscode.ConfigurationTarget.Global);
  await ensureEnabled();
}

async function pickIndent() {
  const presets = [0, 16, 24, 32, 40, 48, 64];
  const items: (vscode.QuickPickItem & { value?: number })[] = presets.map((n) => ({
    label: n === 0 ? "ปิด" : `${n} px`,
    description: n === 0 ? "ไม่ indent" : undefined,
    value: n,
  }));
  items.push({ label: "$(edit) กำหนดเอง...", description: "0 - 200 px" });

  const pick = await vscode.window.showQuickPick(items, {
    title: "ระยะ indent ย่อหน้า",
  });
  if (!pick) return;

  let value = pick.value;
  if (value === undefined) {
    const input = await vscode.window.showInputBox({
      title: "ระยะ indent ย่อหน้า (px)",
      prompt: "0 - 200",
      validateInput: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 200) return "ใส่เลข 0 - 200";
        return null;
      },
    });
    if (!input) return;
    value = Number(input);
  }
  await vscode.workspace
    .getConfiguration(ROOT)
    .update(`${FORMATTING_PREFIX}.paragraphIndent`, value, vscode.ConfigurationTarget.Global);
  await ensureEnabled();
}

async function pickWordWrap() {
  const cfg = getFormattingConfig();
  type Item = vscode.QuickPickItem & { value?: number; off?: boolean };
  const items: Item[] = [
    {
      label: cfg.wordWrap ? "$(check)  ปิดการตัดบรรทัด" : "$(circle-large-outline)  ปิดการตัดบรรทัด",
      description: "บรรทัดยาวจะลากออกข้าง ต้องเลื่อนแนวนอน",
      off: true,
    },
    { label: "ความกว้างที่จะตัดบรรทัด (พอดีอ่าน)", kind: vscode.QuickPickItemKind.Separator },
    { label: "60 ตัวอักษร", description: "สั้น (เหมือนหนังสือ)", value: 60 },
    { label: "80 ตัวอักษร", description: "มาตรฐาน (เหมือน Word)", value: 80 },
    { label: "90 ตัวอักษร", description: "สบายตา (แนะนำ)", value: 90 },
    { label: "100 ตัวอักษร", description: "กว้างหน่อย", value: 100 },
    { label: "120 ตัวอักษร", description: "กว้างมาก", value: 120 },
    { label: "200 ตัวอักษร", description: "เกือบเต็มจอ", value: 200 },
    { label: "$(edit) กำหนดเอง...", description: "40 - 200" },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: "ตัดบรรทัด — ความกว้าง",
    placeHolder: cfg.wordWrap ? `ปัจจุบัน: ${cfg.wordWrapColumn} ตัวอักษร` : "ปัจจุบัน: ปิด",
  });
  if (!pick) return;

  const c = vscode.workspace.getConfiguration(ROOT);
  if (pick.off) {
    await c.update(`${FORMATTING_PREFIX}.wordWrap`, false, vscode.ConfigurationTarget.Global);
  } else if (pick.value !== undefined) {
    await c.update(`${FORMATTING_PREFIX}.wordWrap`, true, vscode.ConfigurationTarget.Global);
    await c.update(`${FORMATTING_PREFIX}.wordWrapColumn`, pick.value, vscode.ConfigurationTarget.Global);
  } else {
    // กำหนดเอง
    const input = await vscode.window.showInputBox({
      title: "ความกว้างบรรทัด (ตัวอักษร)",
      prompt: "40 - 200",
      validateInput: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 40 || n > 200) return "ใส่เลข 40 - 200";
        return null;
      },
    });
    if (!input) return;
    await c.update(`${FORMATTING_PREFIX}.wordWrap`, true, vscode.ConfigurationTarget.Global);
    await c.update(
      `${FORMATTING_PREFIX}.wordWrapColumn`,
      Number(input),
      vscode.ConfigurationTarget.Global
    );
  }
  await ensureEnabled();
}

async function pickApplyTo() {
  const cfg = getFormattingConfig();
  const items: vscode.QuickPickItem[] = [
    {
      label: ".txt (Plain Text)",
      picked: cfg.applyToPlaintext,
    },
    {
      label: ".md (Markdown)",
      picked: cfg.applyToMarkdown,
    },
  ];
  const picks = await vscode.window.showQuickPick(items, {
    title: "ใช้กับไฟล์ประเภทใด",
    canPickMany: true,
  });
  if (!picks) return;

  const labels = picks.map((p) => p.label);
  const c = vscode.workspace.getConfiguration(ROOT);
  await c.update(
    `${FORMATTING_PREFIX}.applyToPlaintext`,
    labels.includes(".txt (Plain Text)"),
    vscode.ConfigurationTarget.Global
  );
  await c.update(
    `${FORMATTING_PREFIX}.applyToMarkdown`,
    labels.includes(".md (Markdown)"),
    vscode.ConfigurationTarget.Global
  );
  await ensureEnabled();
}

async function pickPreset() {
  const items: (vscode.QuickPickItem & { id?: string })[] = PRESETS.map((p) => ({
    label: p.label,
    description: p.description,
    id: p.id,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    title: "เลือก Preset",
    placeHolder: "ทุก preset ใช้ TH Sarabun เป็น default",
  });
  if (!pick || !pick.id) return;

  const preset = PRESETS.find((p) => p.id === pick.id);
  if (!preset) return;

  const c = vscode.workspace.getConfiguration(ROOT);
  for (const [k, v] of Object.entries(preset.values)) {
    await c.update(`${FORMATTING_PREFIX}.${k}`, v, vscode.ConfigurationTarget.Global);
  }
  await c.update(`${FORMATTING_PREFIX}.enabled`, true, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`✓ ใช้ preset: ${preset.label}`);
}

async function ensureEnabled() {
  // ถ้าผู้ใช้แก้ค่าจากเมนู แต่ยังไม่ได้เปิด — เปิดให้อัตโนมัติ
  const c = vscode.workspace.getConfiguration(ROOT);
  const enabled = c.get<boolean>(`${FORMATTING_PREFIX}.enabled`, false);
  if (!enabled) {
    await c.update(`${FORMATTING_PREFIX}.enabled`, true, vscode.ConfigurationTarget.Global);
  }
}

// ----------------------------------------------------------------------
// Setup (เรียกจาก extension.ts activate)
// ----------------------------------------------------------------------

export function setupFormatting(context: vscode.ExtensionContext): {
  refresh: () => Promise<void>;
  getSummary: () => string;
} {
  extensionContext = context;

  const refresh = async () => {
    await applyFormattingToVSCode();
    triggerIndentUpdate();
  };

  // คืนข้อความสรุปสถานะ ใช้ใน main menu / status bar รวม
  const getSummary = (): string => {
    const cfg = getFormattingConfig();
    if (!cfg.enabled) return "ปิดอยู่";
    const fontShort = cfg.fontFamily.split(",")[0].replace(/['\"]/g, "").trim();
    return `${fontShort} ${cfg.fontSize}px`;
  };

  // Listen for relevant editor events
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => updateIndentDecorationsForEditor(e)),
    vscode.window.onDidChangeVisibleTextEditors(() => triggerIndentUpdate()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && e.document === editor.document) {
        triggerIndentUpdate();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${ROOT}.${FORMATTING_PREFIX}`)) {
        void refresh();
      }
    }),
    // เปิดไฟล์ .txt/.md ใหม่ที่ langId อาจไม่ใช่ plaintext/markdown
    // → refresh เพื่อให้ detectDynamicLangs เก็บ langId ใหม่ + เขียน [<lang>]
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const cfg = getFormattingConfig();
      if (!cfg.enabled) return;
      const p = doc.uri.fsPath.toLowerCase();
      const isTxt = p.endsWith(".txt");
      const isMd = p.endsWith(".md") || p.endsWith(".markdown");
      if (!isTxt && !isMd) return;
      const lang = doc.languageId;
      // standard langs จัดการอยู่แล้ว — ไม่ต้อง refresh
      if (lang === "plaintext" || lang === "markdown") return;
      // langId แปลก → ต้อง refresh เพื่อเขียน [<lang>] ใหม่
      if (getTrackedDynamicLangs().includes(lang)) return; // เขียนไปแล้ว
      void refresh();
    })
  );

  return { refresh, getSummary };
}

export function disposeFormatting(): void {
  if (indentDecorationType) {
    indentDecorationType.dispose();
    indentDecorationType = undefined;
  }
}
