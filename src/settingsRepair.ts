import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// ======================================================================
// settings.json self-repair — เฉพาะ pattern ที่ extension นี้อาจทิ้งค้างไว้
// ======================================================================
//
// ปัญหา: เวลา VS Code config.update(<lang-scoped>.editor.X, undefined) ลบ key
// สุดท้ายใน "[markdown]" / "[plaintext]" → เคยพบว่าใน user ส่วนหนึ่ง parser
// ทิ้ง "[markdown]": { , } ไว้ (ลูกน้ำลอยใน object ว่าง) ทำให้ทั้งไฟล์
// settings.json invalid → VS Code อ่าน/เขียนค่าไม่ได้อีกเลย
//
// โมดูลนี้: detect orphan-comma pattern เฉพาะใน "[markdown]" / "[plaintext]"
// → backup + ซ่อม → reload window
//
// **ไม่แตะ key อื่น ๆ ของ user เลย** ถ้าหา pattern ไม่เจอ → return false
// ให้ผู้ใช้เปิดไฟล์แก้เองแบบเดิม

// orphan-comma pattern เฉพาะใน "[markdown]" / "[plaintext]" / "[txt]" — รูปแบบที่
// VS Code's JSON modifier ทิ้งค้างไว้เมื่อหลาย instance เขียน editor.* key พร้อมกัน
const ORPHAN_COMMA_RE =
  /"(\[(?:markdown|plaintext|txt|markdown_\w+|plain_?text_\w+)\])"\s*:\s*\{\s*(?:,\s*)+\}/g;

// orphan comma แบบทั่วไป — `{ , ... }` ที่ขึ้นต้นด้วยลูกน้ำ (ไม่ใช่ trailing)
// ใช้ตรวจใน looksLikeValidJsonc เพื่อไม่ให้ false positive ว่าไฟล์ valid
const LEADING_OR_DOUBLE_COMMA_RE = /[\{\[]\s*,|,\s*,/;

export type RepairResult =
  | { kind: "ok"; path: string; backupPath: string; matches: number }
  | { kind: "no-file"; tried: string[] }
  | { kind: "not-applicable"; path: string; reason: string }
  | { kind: "file-ok-likely-race"; path: string }
  | { kind: "error"; path?: string; message: string };

export type SilentRepairResult = {
  fixed: number;          // จำนวน pattern ที่ซ่อม
  path?: string;          // path ของ settings.json ที่ซ่อม
  backupPath?: string;    // path สำรองที่สร้าง (เมื่อ fixed > 0)
  skipped?: boolean;      // true = ไม่เจอไฟล์ / ไม่มี pattern
  error?: string;         // ถ้ามี error
};

/**
 * เช็คว่า settings.json parse ได้เป็น JSONC ที่ valid หรือไม่ — ใช้ตัดสินใจ
 * ว่าบัค "เขียนการตั้งค่าไม่ได้" เกิดจาก syntax error จริง หรือเป็น race
 * ระหว่าง VS Code หลาย instance ที่เขียนพร้อมกัน
 *
 * VS Code's settings.json รองรับ trailing commas + // comments → ใช้ regex
 * ลบทั้ง 2 ก่อน parse ด้วย JSON.parse มาตรฐาน
 */
export function looksLikeValidJsonc(content: string): boolean {
  // orphan comma `{ ,` หรือ `[ ,` หรือ `, ,` ไม่ valid ในทั้ง JSON และ JSONC
  // เช็คก่อน strip — มิฉะนั้น regex strip trailing-comma จะลบ `,` ใน `{ , }` ออก
  // → JSON.parse ผ่าน → คิดว่าไฟล์ valid (เคยทำให้ "ซ่อมเอง บอกปกติ" บั๊กที่จริงยังอยู่)
  if (LEADING_OR_DOUBLE_COMMA_RE.test(content)) return false;
  try {
    // ลบ /* block comments */
    let stripped = content.replace(/\/\*[\s\S]*?\*\//g, "");
    // ลบ // line comments
    stripped = stripped.replace(/(^|[^\\])\/\/[^\n]*/g, "$1");
    // ลบ trailing commas ก่อน } หรือ ] (JSONC อนุญาต)
    stripped = stripped.replace(/,(\s*[}\]])/g, "$1");
    JSON.parse(stripped);
    return true;
  } catch {
    return false;
  }
}

// ---------- path resolution -------------------------------------------

/**
 * ลำดับการค้นหา user settings.json:
 *  1) VS Code stable, Insiders, OSS, Cursor, VSCodium — ดู folder name จาก
 *     vscode.env.appName / appHost ไม่ค่อย reliable ข้าม fork → ใช้ list
 *     known dir names แทน
 *  2) ถ้าเจอหลายไฟล์ → คืนทั้งหมด แล้ว caller เลือก (โดย default
 *     เลือกตัวที่มี orphan-comma pattern ก่อน)
 */
const KNOWN_VARIANTS = [
  "Code",
  "Code - Insiders",
  "Code - OSS",
  "VSCodium",
  "Cursor",
  "Windsurf",
  "Trae",
  "Trae CN",
];

function settingsRootFor(variant: string): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, variant, "User");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", variant, "User");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdg, variant, "User");
}

export function getCandidateSettingsPaths(): string[] {
  return KNOWN_VARIANTS.map((v) => path.join(settingsRootFor(v), "settings.json"));
}

/**
 * คืน path settings.json ของ host app ที่กำลังรันอยู่ — ใช้ vscode.env.appName
 * เพื่อ map ไปยัง folder name ที่ถูกต้อง (เช่น Cursor → "Cursor", VS Code Stable
 * → "Code", Insiders → "Code - Insiders") รวมถึงเคารพ context.globalStorageUri
 * เพื่อ infer install variant ในเคสที่ appName mismatch
 *
 * เหตุที่จำเป็น: ก่อนนี้ findFirstMatchingSettingsPath() loop ผ่าน candidates
 * ทุกตัว ถ้าผู้ใช้มีทั้ง Code + Cursor และ Code's settings มี orphan comma
 * แต่ผู้ใช้รัน Cursor → จะไปแก้ Code's settings (ผิดเครื่อง) แล้วบ่นว่า
 * "ซ่อมแล้วไม่หาย" — Cursor's settings ที่จริงเป็นเป้ายังไม่ถูกแตะ
 */
export function getCurrentHostSettingsPath(
  context?: vscode.ExtensionContext
): string | undefined {
  // 1) ลอง infer จาก globalStorageUri ก่อน — แม่นกว่า appName เพราะเป็น
  //    real path ที่ host เขียนจริง (เช่น .../Cursor/User/globalStorage/...)
  if (context) {
    const fromContext = inferVariantFromPath(context.globalStorageUri.fsPath);
    if (fromContext) {
      return path.join(settingsRootFor(fromContext), "settings.json");
    }
  }

  // 2) fallback: ใช้ vscode.env.appName
  const appName = (vscode.env.appName || "").toLowerCase();
  let variant: string | undefined;
  if (appName.includes("insiders")) variant = "Code - Insiders";
  else if (appName.includes("cursor")) variant = "Cursor";
  else if (appName.includes("windsurf")) variant = "Windsurf";
  else if (appName.includes("codium")) variant = "VSCodium";
  else if (appName.includes("oss")) variant = "Code - OSS";
  else if (appName.includes("trae")) variant = "Trae";
  else if (appName.includes("visual studio code")) variant = "Code";

  if (!variant) return undefined;
  return path.join(settingsRootFor(variant), "settings.json");
}

function inferVariantFromPath(p: string): string | undefined {
  // หา segment ที่ตรงกับ variant ที่รู้จัก
  const segs = p.split(/[\\/]+/);
  for (const v of KNOWN_VARIANTS) {
    if (segs.includes(v)) return v;
  }
  return undefined;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findFirstMatchingSettingsPath(
  context?: vscode.ExtensionContext
): Promise<{
  path: string | undefined;
  tried: string[];
}> {
  // ลำดับ:
  //   1) settings.json ของ host ปัจจุบัน (Cursor / Code / Windsurf / ฯลฯ) — เสมอ
  //   2) ถ้าไม่เจอ host's settings.json → loop candidates เผื่อมีไฟล์อื่น
  const tried: string[] = [];
  const currentHost = getCurrentHostSettingsPath(context);
  if (currentHost) {
    tried.push(currentHost);
    if (await fileExists(currentHost)) {
      return { path: currentHost, tried };
    }
  }

  const candidates = getCandidateSettingsPaths();
  let firstExisting: string | undefined;
  for (const p of candidates) {
    if (p === currentHost) continue; // เช็คแล้ว
    tried.push(p);
    if (await fileExists(p)) {
      // เปิดอ่านดูว่ามี orphan-comma pattern ไหม → preferred (อาจจะมีปัญหา)
      try {
        const content = await fs.readFile(p, "utf8");
        if (ORPHAN_COMMA_RE.test(content)) {
          ORPHAN_COMMA_RE.lastIndex = 0;
          return { path: p, tried };
        }
      } catch {
        // อ่านไม่ได้ — ข้าม
      }
      if (!firstExisting) firstExisting = p;
    }
  }

  return { path: firstExisting, tried };
}

// ---------- detection -------------------------------------------------

export function detectOrphanComma(content: string): {
  matches: Array<{ start: number; end: number; lang: string }>;
} {
  ORPHAN_COMMA_RE.lastIndex = 0;
  const matches: Array<{ start: number; end: number; lang: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = ORPHAN_COMMA_RE.exec(content)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      lang: m[1],
    });
  }
  return { matches };
}

function applyRepair(content: string): { fixed: string; count: number } {
  ORPHAN_COMMA_RE.lastIndex = 0;
  let count = 0;
  const fixed = content.replace(ORPHAN_COMMA_RE, (_full, scope: string) => {
    count++;
    return `"${scope}": {}`;
  });
  return { fixed, count };
}

// ---------- diff preview ----------------------------------------------

function getLineCol(content: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

export function buildPreviewMessage(
  filePath: string,
  content: string,
  matches: Array<{ start: number; end: number; lang: string }>
): string {
  const lines: string[] = [];
  lines.push(`พบปัญหาใน: ${filePath}`);
  lines.push("");
  for (const m of matches) {
    const { line } = getLineCol(content, m.start);
    lines.push(`  • บรรทัด ${line}: "${m.lang}": { , }  →  "${m.lang}": {}`);
  }
  lines.push("");
  lines.push("INK CHECKER จะ:");
  lines.push("  1) สำรอง settings.json (ไฟล์ .inkchecker-backup-<เวลา>.json)");
  lines.push("  2) แก้ syntax error ที่พบ");
  lines.push("  3) Reload หน้าต่าง");
  lines.push("");
  lines.push("ไม่แตะ key อื่นของคุณ — ปลอดภัย");
  return lines.join("\n");
}

// ---------- main entry ------------------------------------------------

/**
 * พยายามซ่อม settings.json แบบ end-to-end:
 *   - หา path
 *   - ตรวจหา pattern
 *   - ขอ confirm จากผู้ใช้ (modal — แสดง diff ที่จะแก้)
 *   - backup
 *   - เขียนทับ
 *   - reload
 *
 * คืน RepairResult เพื่อ caller รายงานสถานะให้ผู้ใช้
 */
export async function attemptRepair(
  context?: vscode.ExtensionContext
): Promise<RepairResult> {
  const { path: settingsPath, tried } = await findFirstMatchingSettingsPath(context);

  if (!settingsPath) {
    return { kind: "no-file", tried };
  }

  let content: string;
  try {
    content = await fs.readFile(settingsPath, "utf8");
  } catch (err: any) {
    return {
      kind: "error",
      path: settingsPath,
      message: `อ่าน settings.json ไม่ได้: ${err?.message ?? String(err)}`,
    };
  }

  const { matches } = detectOrphanComma(content);
  if (matches.length === 0) {
    // ไม่เจอ pattern ที่รู้จัก — เช็คก่อนว่าไฟล์ valid JSONC ไหม
    // ถ้า valid → ปัญหาน่าจะมาจาก race condition (เปิด VS Code หลาย instance
    // พร้อมกัน แล้วแย่งเขียน settings.json) → แนะนำ Reload Window
    if (looksLikeValidJsonc(content)) {
      return { kind: "file-ok-likely-race", path: settingsPath };
    }
    return {
      kind: "not-applicable",
      path: settingsPath,
      reason:
        "ไม่พบ pattern ที่ INK CHECKER รู้จัก (\"[markdown]\": { , } / \"[plaintext]\": { , }) — ปัญหาอาจเป็น syntax error อื่น ต้องแก้เอง",
    };
  }

  // ขอ confirm — แสดง preview ในข้อความ
  const preview = buildPreviewMessage(settingsPath, content, matches);
  const PROCEED = "ซ่อมและ Reload";
  const CANCEL = "ยกเลิก";
  const pick = await vscode.window.showWarningMessage(
    preview,
    { modal: true },
    PROCEED,
    CANCEL
  );
  if (pick !== PROCEED) {
    return {
      kind: "not-applicable",
      path: settingsPath,
      reason: "ผู้ใช้ยกเลิกการซ่อม",
    };
  }

  // backup
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const backupPath = settingsPath.replace(
    /settings\.json$/,
    `settings.inkchecker-backup-${ts}.json`
  );
  try {
    await fs.writeFile(backupPath, content, "utf8");
  } catch (err: any) {
    return {
      kind: "error",
      path: settingsPath,
      message: `สำรองไฟล์ไม่ได้: ${err?.message ?? String(err)}`,
    };
  }

  // apply repair
  const { fixed, count } = applyRepair(content);
  try {
    await fs.writeFile(settingsPath, fixed, "utf8");
  } catch (err: any) {
    return {
      kind: "error",
      path: settingsPath,
      message: `เขียน settings.json ไม่ได้: ${err?.message ?? String(err)}`,
    };
  }

  return {
    kind: "ok",
    path: settingsPath,
    backupPath,
    matches: count,
  };
}

/**
 * ซ่อม settings.json แบบเงียบ ๆ — สำหรับเรียกตอน activate ก่อนทำอะไรอย่างอื่น
 * ไม่ขึ้น modal, ไม่ถาม user, แต่ backup ก่อนเสมอ
 *
 * ตรรกะ:
 *   1) หา settings.json ของ host ปัจจุบัน (Code / Cursor / Windsurf / ฯลฯ)
 *   2) อ่านไฟล์ → ถ้าไม่เจอ pattern → return { fixed: 0, skipped: true }
 *   3) ถ้าเจอ → สำรอง → เขียน fix
 *
 * ไม่ throw — error ถูกห่อใน return value เพื่อให้ activation flow ไม่พัง
 */
export async function silentRepair(
  context?: vscode.ExtensionContext
): Promise<SilentRepairResult> {
  const settingsPath = getCurrentHostSettingsPath(context);
  if (!settingsPath) {
    return { fixed: 0, skipped: true };
  }
  if (!(await fileExists(settingsPath))) {
    return { fixed: 0, skipped: true, path: settingsPath };
  }

  let content: string;
  try {
    content = await fs.readFile(settingsPath, "utf8");
  } catch (err: any) {
    return {
      fixed: 0,
      path: settingsPath,
      error: `อ่าน settings.json ไม่ได้: ${err?.message ?? String(err)}`,
    };
  }

  const { matches } = detectOrphanComma(content);
  if (matches.length === 0) {
    return { fixed: 0, skipped: true, path: settingsPath };
  }

  // backup
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const backupPath = settingsPath.replace(
    /settings\.json$/,
    `settings.inkchecker-backup-${ts}.json`
  );
  try {
    await fs.writeFile(backupPath, content, "utf8");
  } catch (err: any) {
    return {
      fixed: 0,
      path: settingsPath,
      error: `สำรองไฟล์ไม่ได้: ${err?.message ?? String(err)}`,
    };
  }

  const { fixed, count } = applyRepair(content);
  try {
    await fs.writeFile(settingsPath, fixed, "utf8");
  } catch (err: any) {
    return {
      fixed: 0,
      path: settingsPath,
      backupPath,
      error: `เขียน settings.json ไม่ได้: ${err?.message ?? String(err)}`,
    };
  }

  return { fixed: count, path: settingsPath, backupPath };
}
