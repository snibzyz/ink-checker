import * as vscode from "vscode";

// ======================================================================
// File Conversion — แปลงนามสกุลไฟล์ .txt ↔ .md
// ======================================================================
// เหตุผล: ผู้ใช้บางคนการตั้งค่า [plaintext] ไม่ทำงาน (อาจเพราะ files.associations
// หรือไฟล์ถูก auto-detect เป็น language ID อื่น) → workaround โดยเปลี่ยน
// นามสกุลเป็น .md ให้ใช้ [markdown] override แทน + การจัดหน้ากระดาษทำงานทันที
//
// API ที่ใช้: vscode.workspace.fs.rename — VS Code จะอัปเดต open editors
// ให้อัตโนมัติ ไม่ต้องปิด/เปิดไฟล์เอง

export type ConvertDirection = "txt-to-md" | "md-to-txt";
export type ConvertScope = "workspace" | "selection" | "uris";

type Result = { success: number; skipped: number; failed: number };

export async function convertFiles(
  direction: ConvertDirection,
  scope: ConvertScope,
  preselectedUris?: vscode.Uri[]
): Promise<void> {
  const fromExt = direction === "txt-to-md" ? ".txt" : ".md";
  const toExt = direction === "txt-to-md" ? ".md" : ".txt";

  let files: vscode.Uri[] = [];

  if (scope === "uris" && preselectedUris && preselectedUris.length > 0) {
    files = preselectedUris;
  } else if (scope === "workspace") {
    if (!vscode.workspace.workspaceFolders?.length) {
      vscode.window.showWarningMessage("INK CHECKER: ไม่มีโฟลเดอร์งานที่เปิดอยู่");
      return;
    }
    const pattern = `**/*${fromExt}`;
    files = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
  } else {
    // selection: ให้ผู้ใช้เลือกผ่าน Open Dialog
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: true,
      title: `เลือกไฟล์ ${fromExt} ที่จะแปลงเป็น ${toExt}`,
      filters: { [`${fromExt} files`]: [fromExt.slice(1)] },
    });
    if (!picked || picked.length === 0) return;
    files = picked;
  }

  // กรองเฉพาะนามสกุล fromExt — กันเคสที่ผู้ใช้ลากไฟล์อื่นเข้ามา
  files = files.filter((f) => f.fsPath.toLowerCase().endsWith(fromExt));

  if (files.length === 0) {
    vscode.window.showInformationMessage(
      `INK CHECKER: ไม่พบไฟล์ ${fromExt} ที่จะแปลง`
    );
    return;
  }

  // เซฟไฟล์ที่ dirty ก่อน — ไม่งั้น rename อาจทิ้ง unsaved buffer
  await saveDirtyDocs(files);

  // ขอ confirm — เฉพาะกรณี mass (>1) หรือ workspace
  if (files.length > 1 || scope === "workspace") {
    const ok = await vscode.window.showWarningMessage(
      `จะเปลี่ยนนามสกุล ${files.length} ไฟล์: ${fromExt} → ${toExt}\n\nไฟล์ต้นฉบับจะถูกเปลี่ยนชื่อ (ไม่ใช่ก๊อปปี้) — ไม่สามารถ undo ได้`,
      { modal: true },
      "แปลง"
    );
    if (ok !== "แปลง") return;
  }

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `INK CHECKER: กำลังแปลง ${files.length} ไฟล์`,
      cancellable: false,
    },
    async (progress) => {
      const r: Result = { success: 0, skipped: 0, failed: 0 };
      const step = 100 / files.length;
      for (const file of files) {
        const newPath =
          file.fsPath.slice(0, -fromExt.length) + toExt;
        const newUri = vscode.Uri.file(newPath);
        try {
          // เช็คก่อนว่าปลายทางมีอยู่หรือไม่ — ถ้ามี → ข้าม (ไม่ overwrite)
          let exists = false;
          try {
            await vscode.workspace.fs.stat(newUri);
            exists = true;
          } catch {
            exists = false;
          }
          if (exists) {
            r.skipped++;
          } else {
            await vscode.workspace.fs.rename(file, newUri, { overwrite: false });
            r.success++;
          }
        } catch {
          r.failed++;
        }
        progress.report({ increment: step });
      }
      return r;
    }
  );

  const parts: string[] = [`✓ แปลงสำเร็จ ${result.success} ไฟล์`];
  if (result.skipped) parts.push(`ข้าม ${result.skipped} (ปลายทางมีอยู่แล้ว)`);
  if (result.failed) parts.push(`ล้มเหลว ${result.failed}`);
  vscode.window.showInformationMessage(parts.join(" · "));
}

async function saveDirtyDocs(files: vscode.Uri[]): Promise<void> {
  const targets = new Set(files.map((u) => u.fsPath.toLowerCase()));
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.isDirty && targets.has(doc.uri.fsPath.toLowerCase())) {
      try {
        await doc.save();
      } catch {
        /* ไม่บล็อกการแปลง — ถ้า save ไม่ได้ ก็ปล่อย rename ตามปกติ */
      }
    }
  }
}

// ----------------------------------------------------------------------
// Entry points — เรียกจาก commands
// ----------------------------------------------------------------------

/**
 * เปิด QuickPick ให้ผู้ใช้เลือกทิศทาง + ขอบเขต
 * (เรียกจาก command palette / settings panel)
 */
export async function openConvertMenu(): Promise<void> {
  type Item = vscode.QuickPickItem & {
    direction: ConvertDirection;
    scope: ConvertScope;
  };
  const items: Item[] = [
    {
      label: "$(arrow-right)  .txt → .md (ทั้งโฟลเดอร์งาน)",
      description: "แปลงทุกไฟล์ .txt ใน workspace เป็น .md",
      direction: "txt-to-md",
      scope: "workspace",
    },
    {
      label: "$(arrow-right)  .txt → .md (เลือกไฟล์เอง)",
      description: "เปิด file picker ให้เลือกไฟล์ที่จะแปลง",
      direction: "txt-to-md",
      scope: "selection",
    },
    {
      label: "$(arrow-left)  .md → .txt (ทั้งโฟลเดอร์งาน)",
      description: "แปลงทุกไฟล์ .md ใน workspace เป็น .txt",
      direction: "md-to-txt",
      scope: "workspace",
    },
    {
      label: "$(arrow-left)  .md → .txt (เลือกไฟล์เอง)",
      description: "เปิด file picker ให้เลือกไฟล์ที่จะแปลง",
      direction: "md-to-txt",
      scope: "selection",
    },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: "INK CHECKER — แปลงนามสกุลไฟล์ .txt ↔ .md",
    placeHolder: "เลือกทิศทางและขอบเขต",
  });
  if (!pick) return;
  await convertFiles(pick.direction, pick.scope);
}

/**
 * เรียกจาก Explorer context menu — VS Code จะส่ง uri ของไฟล์ที่คลิกขวา
 * และถ้าเลือกหลายไฟล์ จะส่ง array ใน arg ที่ 2
 */
export async function convertFromExplorer(
  direction: ConvertDirection,
  primary: vscode.Uri | undefined,
  selected: vscode.Uri[] | undefined
): Promise<void> {
  const fromExt = direction === "txt-to-md" ? ".txt" : ".md";
  const uris = (selected && selected.length > 0 ? selected : primary ? [primary] : []).filter(
    (u) => u.fsPath.toLowerCase().endsWith(fromExt)
  );
  if (uris.length === 0) {
    vscode.window.showWarningMessage(
      `INK CHECKER: เลือกไฟล์ ${fromExt} ก่อนแปลง`
    );
    return;
  }
  await convertFiles(direction, "uris", uris);
}
