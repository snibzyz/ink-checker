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

const ORPHAN_COMMA_RE =
  /"(\[(?:markdown|plaintext)\])"\s*:\s*\{\s*(?:,\s*)+\}/g;

export type RepairResult =
  | { kind: "ok"; path: string; backupPath: string; matches: number }
  | { kind: "no-file"; tried: string[] }
  | { kind: "not-applicable"; path: string; reason: string }
  | { kind: "file-ok-likely-race"; path: string }
  | { kind: "error"; path?: string; message: string };

/**
 * เช็คว่า settings.json parse ได้เป็น JSONC ที่ valid หรือไม่ — ใช้ตัดสินใจ
 * ว่าบัค "เขียนการตั้งค่าไม่ได้" เกิดจาก syntax error จริง หรือเป็น race
 * ระหว่าง VS Code หลาย instance ที่เขียนพร้อมกัน
 *
 * VS Code's settings.json รองรับ trailing commas + // comments → ใช้ regex
 * ลบทั้ง 2 ก่อน parse ด้วย JSON.parse มาตรฐาน
 */
export function looksLikeValidJsonc(content: string): boolean {
  try {
    // ลบ /* block comments */
    let stripped = content.replace(/\/\*[\s\S]*?\*\//g, "");
    // ลบ // line comments
    stripped = stripped.replace(/(^|[^\\])\/\/[^\n]*/g, "$1");
    // ลบ trailing commas ก่อน } หรือ ]
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
export function getCandidateSettingsPaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;

  // ชุด folder name ที่ใช้กันจริง (Code = stable, Code - Insiders, etc.)
  const variants = [
    "Code",
    "Code - Insiders",
    "Code - OSS",
    "VSCodium",
    "Cursor",
    "Windsurf",
  ];

  const roots: string[] = [];
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    for (const v of variants) roots.push(path.join(appData, v, "User"));
  } else if (platform === "darwin") {
    for (const v of variants)
      roots.push(path.join(home, "Library", "Application Support", v, "User"));
  } else {
    // linux / others
    const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    for (const v of variants) roots.push(path.join(xdg, v, "User"));
  }

  return roots.map((r) => path.join(r, "settings.json"));
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findFirstMatchingSettingsPath(): Promise<{
  path: string | undefined;
  tried: string[];
}> {
  const candidates = getCandidateSettingsPaths();
  const tried: string[] = [];
  let firstExisting: string | undefined;

  for (const p of candidates) {
    tried.push(p);
    if (await fileExists(p)) {
      // เปิดอ่านดูว่า pattern อยู่ในนั้นไหม → preferred
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

  // ไม่เจอไฟล์ที่มี pattern — คืนตัวแรกที่มีอยู่ (caller จะเช็คอีกที)
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
export async function attemptRepair(): Promise<RepairResult> {
  const { path: settingsPath, tried } = await findFirstMatchingSettingsPath();

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
