import * as vscode from "vscode";
import { getFormattingConfig, resetFormatting } from "./formatting";
import { notifySettingsWriteError } from "./extension";

const CONFIG_SECTION = "inkChecker";

/**
 * SettingsPanel — รวมการตั้งค่าทั้งหมดของ INK CHECKER ไว้ในที่เดียว
 * โครงสร้าง: sidebar nav (ซ้าย) + content (ขวา)
 * ใช้ TH Sarabun ทั่วทั้ง UI
 */
export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.command) {
          case "ready":
          case "getAll":
            this._sendAll();
            break;
          case "updateChecker":
            await this._updateChecker(msg.values);
            break;
          case "updateFormatting":
            await this._updateFormatting(msg.values);
            break;
          case "updateColors":
            await this._updateColors(msg.values);
            break;
          case "updateWords":
            await this._update("customWords", msg.words);
            break;
          case "updateWordGroups":
            await this._update("wordGroups", msg.groups);
            break;
          case "applyPreset":
            await this._applyPreset(msg.preset);
            break;
          case "resetFormatting":
            await this._runWrite(() => resetFormatting());
            break;
          case "openVscodeSettings":
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              `@ext:${vscode.extensions.getExtension("kunpeng-dev.kunpeng-checker")?.id ?? "inkrealm.ink-checker"}`
            );
            break;
          case "exportSettings":
            await this._exportSettings();
            break;
          case "importSettings":
            await this._importSettings();
            break;
          case "copySettings":
            await this._copySettings();
            break;
        }
      },
      null,
      this._disposables
    );

    const watcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        this._sendAll();
      }
    });
    this._disposables.push(watcher);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow() {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "inkCheckerSettings",
      "INK CHECKER — ตั้งค่า",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    SettingsPanel.currentPanel = new SettingsPanel(panel);
  }

  public static showTab(tabId: string) {
    SettingsPanel.createOrShow();
    SettingsPanel.currentPanel?._panel.webview.postMessage({
      command: "showTab",
      tabId,
    });
  }

  private _sendAll() {
    const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const fmt = getFormattingConfig();
    this._panel.webview.postMessage({
      command: "allLoaded",
      data: {
        checker: {
          enabled: c.get<boolean>("enabled", true),
          checkEnglish: c.get<boolean>("checkEnglish", false),
          checkNumbers: c.get<boolean>("checkNumbers", false),
          checkForeignLanguages: c.get<boolean>("checkForeignLanguages", false),
          checkUnclosedFancyQuotes: c.get<boolean>("checkUnclosedFancyQuotes", true),
          checkUnclosedDoubleQuotes: c.get<boolean>("checkUnclosedDoubleQuotes", false),
          checkUnclosedSingleQuotes: c.get<boolean>("checkUnclosedSingleQuotes", false),
          checkUnclosedParentheses: c.get<boolean>("checkUnclosedParentheses", false),
          checkUnclosedBrackets: c.get<boolean>("checkUnclosedBrackets", false),
        },
        words: c.get<string[]>("customWords", []),
        wordGroups: c.get<string[]>("wordGroups", []),
        formatting: fmt,
        colors: {
          customWordsColor: c.get<string>("customWordsColor", "rgba(255, 229, 100, 0.6)"),
          languageAndNumberColor: c.get<string>("languageAndNumberColor", "rgba(173, 216, 230, 0.5)"),
          unbalancedCharactersColor: c.get<string>("unbalancedCharactersColor", "rgba(255, 100, 100, 0.4)"),
        },
      },
    });
  }

  // ทุกการเขียน config ห่อด้วยตัวนี้ — ถ้า settings.json พัง (ลูกน้ำลอย,
  // วงเล็บไม่ปิด ฯลฯ) VS Code จะ throw `Unable to write into user settings`.
  // เราจะ: (1) แจ้งผู้ใช้, (2) ส่ง state จริงกลับ webview เพื่อให้ toggle
  // เด้งกลับตำแหน่งที่แท้จริง — ไม่ใช่ค้างอยู่ใน optimistic UI
  private async _runWrite(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      console.error("[INK CHECKER] settings panel write failed:", err);
      void notifySettingsWriteError(err);
      this._sendAll();
    }
  }

  private async _update(key: string, value: unknown) {
    await this._runWrite(async () => {
      const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
      await c.update(key, value, vscode.ConfigurationTarget.Global);
      vscode.commands.executeCommand("ink-checker.refresh");
    });
  }

  private async _updateChecker(values: Record<string, unknown>) {
    await this._runWrite(async () => {
      const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
      for (const [k, v] of Object.entries(values)) {
        await c.update(k, v, vscode.ConfigurationTarget.Global);
      }
      vscode.commands.executeCommand("ink-checker.refresh");
    });
  }

  private async _updateFormatting(values: Record<string, unknown>) {
    await this._runWrite(async () => {
      const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
      for (const [k, v] of Object.entries(values)) {
        await c.update(`formatting.${k}`, v, vscode.ConfigurationTarget.Global);
      }
    });
  }

  private async _updateColors(values: Record<string, string>) {
    await this._runWrite(async () => {
      const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
      for (const [k, v] of Object.entries(values)) {
        await c.update(k, v, vscode.ConfigurationTarget.Global);
      }
      vscode.commands.executeCommand("ink-checker.refresh");
    });
  }

  private async _applyPreset(presetId: string) {
    // ปุ่ม "ล้างกลับเป็น VS Code ปกติ" — ทาง escape สุดท้ายถ้า snapshot
    // เพี้ยน / settings.json พัง / preset อื่นใช้ไม่ได้: ลบ inkChecker.formatting.*
    // + editor.* ใน [plaintext]/[markdown] ทุก target จนหมด แล้วปิด formatting
    if (presetId === "vscode-default") {
      await this._runWrite(() => resetFormatting());
      return;
    }

    const presets: Record<string, Record<string, unknown>> = {
      "tahoma-14": {
        fontFamily: "Tahoma, 'Noto Sans Thai', sans-serif",
        fontSize: 14, lineHeight: 1.4, paragraphIndent: 0, wordWrap: true, wordWrapColumn: 90,
      },
      "sarabun-14": {
        fontFamily: "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 14, lineHeight: 1.5, paragraphIndent: 24, wordWrap: true, wordWrapColumn: 100,
      },
      "sarabun-16": {
        fontFamily: "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 16, lineHeight: 1.6, paragraphIndent: 32, wordWrap: true, wordWrapColumn: 90,
      },
      "sarabun-18": {
        fontFamily: "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 18, lineHeight: 1.7, paragraphIndent: 36, wordWrap: true, wordWrapColumn: 90,
      },
      "sarabun-20": {
        fontFamily: "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 20, lineHeight: 1.8, paragraphIndent: 40, wordWrap: true, wordWrapColumn: 80,
      },
    };
    const v = presets[presetId];
    if (!v) return;
    await this._runWrite(async () => {
      const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
      for (const [k, val] of Object.entries(v)) {
        await c.update(`formatting.${k}`, val, vscode.ConfigurationTarget.Global);
      }
      await c.update("formatting.enabled", true, vscode.ConfigurationTarget.Global);
    });
  }

  // ─── Import / Export ───
  private _collectAllSettings(): Record<string, unknown> {
    const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const keys = [
      "enabled",
      "customWords",
      "wordGroups",
      "checkEnglish",
      "checkNumbers",
      "checkForeignLanguages",
      "checkUnclosedFancyQuotes",
      "checkUnclosedDoubleQuotes",
      "checkUnclosedSingleQuotes",
      "checkUnclosedParentheses",
      "checkUnclosedBrackets",
      "customWordsColor",
      "languageAndNumberColor",
      "unbalancedCharactersColor",
      "formatting.enabled",
      "formatting.fontFamily",
      "formatting.fontSize",
      "formatting.lineHeight",
      "formatting.paragraphIndent",
      "formatting.wordWrap",
      "formatting.wordWrapColumn",
      "formatting.applyToPlaintext",
      "formatting.applyToMarkdown",
      "formatting.configurationTarget",
    ];
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = c.get(k);
    }
    return {
      _meta: {
        app: "INK CHECKER",
        version: 1,
        exportedAt: new Date().toISOString(),
      },
      settings: out,
    };
  }

  private async _exportSettings() {
    const data = this._collectAllSettings();
    const json = JSON.stringify(data, null, 2);
    const uri = await vscode.window.showSaveDialog({
      title: "ส่งออกตั้งค่า INK CHECKER",
      saveLabel: "บันทึก",
      defaultUri: vscode.Uri.file(`ink-checker-settings-${new Date().toISOString().slice(0, 10)}.json`),
      filters: { JSON: ["json"] },
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, "utf8"));
    vscode.window.showInformationMessage(`✓ ส่งออกตั้งค่าไปที่ ${uri.fsPath}`);
  }

  private async _importSettings() {
    const uris = await vscode.window.showOpenDialog({
      title: "นำเข้าตั้งค่า INK CHECKER",
      openLabel: "นำเข้า",
      canSelectMany: false,
      filters: { JSON: ["json"] },
    });
    if (!uris || !uris[0]) return;

    let parsed: any;
    try {
      const buf = await vscode.workspace.fs.readFile(uris[0]);
      parsed = JSON.parse(Buffer.from(buf).toString("utf8"));
    } catch (e) {
      vscode.window.showErrorMessage("ไฟล์ไม่ใช่ JSON ที่ถูกต้อง");
      return;
    }

    // รองรับทั้งรูปแบบ {settings: {...}} (ของเรา) และ {...} ตรง ๆ
    const settings = parsed?.settings ?? parsed;
    if (!settings || typeof settings !== "object") {
      vscode.window.showErrorMessage("ไม่พบข้อมูลการตั้งค่าในไฟล์");
      return;
    }

    const ok = await vscode.window.showWarningMessage(
      "นำเข้าตั้งค่าจากไฟล์นี้? — ค่าปัจจุบันจะถูกเขียนทับ",
      { modal: true },
      "นำเข้า"
    );
    if (ok !== "นำเข้า") return;

    const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
    let count = 0;
    for (const [k, v] of Object.entries(settings)) {
      if (k.startsWith("_")) continue;
      try {
        await c.update(k, v, vscode.ConfigurationTarget.Global);
        count++;
      } catch (e) {
        // ข้ามตัวที่ตั้งไม่ได้
      }
    }
    vscode.commands.executeCommand("ink-checker.refresh");
    vscode.window.showInformationMessage(`✓ นำเข้าตั้งค่า ${count} รายการ`);
  }

  private async _copySettings() {
    const data = this._collectAllSettings();
    const json = JSON.stringify(data, null, 2);
    await vscode.env.clipboard.writeText(json);
    vscode.window.showInformationMessage("✓ คัดลอก JSON ไปที่คลิปบอร์ดแล้ว");
  }

  public dispose() {
    SettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  private _getWebviewContent(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>INK CHECKER — ตั้งค่า</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --th-font: 'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', system-ui, sans-serif;
    --gap: 12px;
    --radius: 10px;
    --radius-sm: 6px;
    --accent: var(--vscode-button-background);
    --accent-fg: var(--vscode-button-foreground);
    --hover: var(--vscode-list-hoverBackground);
    --border: var(--vscode-panel-border);
    --muted: var(--vscode-descriptionForeground);
    --card-bg: var(--vscode-sideBar-background, var(--vscode-editor-inactiveSelectionBackground));
    --shadow: 0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.08);
  }
  html, body {
    height: 100%;
    font-family: var(--th-font);
    font-size: 16px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.55;
  }

  /* ─── Icon utility ─── */
  .icon { width: 1.1em; height: 1.1em; flex-shrink: 0; vertical-align: -0.18em; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .icon-lg { width: 22px; height: 22px; }
  .icon-xl { width: 28px; height: 28px; }

  /* ─── Layout ─── */
  .layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    height: 100vh;
  }
  .sidebar {
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border-right: 1px solid var(--border);
    padding: 22px 14px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 0;
    margin-bottom: 4px;
  }
  .brand-mark {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, transparent));
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-fg);
    flex-shrink: 0;
  }
  .brand-text {
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.3px;
  }
  .brand-sub {
    font-size: 12px;
    color: var(--muted);
    padding: 0 10px 0 52px;
    margin-bottom: 20px;
  }
  .nav-section {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--muted);
    padding: 14px 12px 6px;
    font-weight: 600;
  }
  nav { display: flex; flex-direction: column; gap: 1px; }
  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 16px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: 15px;
    cursor: pointer;
    text-align: left;
    transition: background .15s, color .15s;
  }
  .nav-item:hover {
    background: var(--hover);
  }
  .nav-item.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
    font-weight: 600;
  }
  .nav-item.active::before {
    content: "";
    position: absolute;
    left: 0; top: 8px; bottom: 8px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .nav-item .icon { color: var(--muted); transition: color .15s; }
  .nav-item:hover .icon, .nav-item.active .icon { color: var(--accent); }

  .content {
    overflow-y: auto;
    padding: 32px 40px 80px;
  }

  /* ─── Section ─── */
  section { display: none; max-width: 800px; }
  section.active { display: block; animation: fadeIn .2s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .section-h {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .section-h .h-row {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 6px;
  }
  .section-h .h-icon {
    width: 36px; height: 36px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .section-h h1 {
    font-size: 24px;
    font-weight: 700;
  }
  .section-h p {
    font-size: 14px;
    color: var(--muted);
    margin-left: 48px;
  }

  /* ─── Card ─── */
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 22px;
    margin-bottom: 14px;
    transition: border-color .15s;
  }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
  .card-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 14px;
    color: var(--vscode-foreground);
  }
  .card-title .icon { color: var(--accent); }

  /* ─── Row ─── */
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    gap: 16px;
    border-bottom: 1px dashed var(--vscode-panel-border);
  }
  .row:last-child { border-bottom: none; }
  .row .label-group { flex: 1; }
  .row .label { font-size: 16px; }
  .row .hint { font-size: 13px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

  /* ─── Toggle ─── */
  .toggle {
    position: relative; display: inline-block;
    width: 50px; height: 26px; flex-shrink: 0;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    transition: .2s; border-radius: 26px;
  }
  .slider:before {
    position: absolute; content: "";
    height: 18px; width: 18px;
    left: 3px; bottom: 3px;
    background: var(--vscode-descriptionForeground);
    transition: .2s; border-radius: 50%;
  }
  input:checked + .slider {
    background: var(--vscode-button-background);
    border-color: var(--vscode-button-background);
  }
  input:checked + .slider:before {
    transform: translateX(24px);
    background: var(--vscode-button-foreground);
  }

  /* ─── Inputs ─── */
  select, input[type="text"], input[type="number"], textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 7px 10px;
    border-radius: 4px;
    font-size: 15px;
    font-family: inherit;
    outline: none;
  }
  select:focus, input:focus, textarea:focus {
    border-color: var(--vscode-focusBorder);
  }
  select { min-width: 220px; }
  input[type="number"] { width: 80px; text-align: center; }

  /* ─── Stepper ─── */
  .stepper { display: inline-flex; align-items: center; gap: 6px; }
  .stepper button {
    width: 30px; height: 30px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-border, var(--vscode-button-background));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 18px; font-weight: 600;
    font-family: inherit;
  }
  .stepper button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .unit { color: var(--vscode-descriptionForeground); font-size: 14px; margin-left: 4px; }

  /* ─── Buttons ─── */
  .btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    font-size: 15px;
    font-family: inherit;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn-danger {
    background: transparent;
    color: var(--vscode-errorForeground);
    border-color: var(--vscode-errorForeground);
  }
  .btn-danger:hover {
    background: var(--vscode-errorForeground);
    color: var(--vscode-editor-background);
  }

  /* ─── Word list ─── */
  .word-add {
    display: flex; gap: 8px; margin-bottom: 14px;
  }
  .word-add input { flex: 1; }
  .word-tags {
    display: flex; flex-wrap: wrap; gap: 8px;
  }
  .word-tag {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 10px 6px 14px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 20px;
    font-size: 15px;
  }
  .word-tag .x {
    cursor: pointer; opacity: .6;
    width: 18px; height: 18px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%;
  }
  .word-tag .x:hover { opacity: 1; background: rgba(255,255,255,.2); }

  /* ─── Word groups ─── */
  .group-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .group-item {
    display: flex; gap: 8px; align-items: center;
  }
  .group-item input { flex: 1; }
  .group-item .x {
    width: 32px; height: 32px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 4px;
    border: 1px solid var(--vscode-panel-border);
    background: transparent;
    color: var(--vscode-errorForeground);
    cursor: pointer;
    font-family: inherit;
  }
  .group-item .x:hover { background: var(--vscode-list-hoverBackground); }

  /* ─── Presets ─── */
  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }
  .preset {
    padding: 14px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius);
    cursor: pointer; text-align: left;
    background: transparent; color: inherit;
    font-family: inherit;
    transition: .15s;
  }
  .preset:hover {
    border-color: var(--vscode-button-background);
    background: var(--vscode-list-hoverBackground);
  }
  .preset .pn { font-weight: 600; font-size: 16px; margin-bottom: 4px; }
  .preset .pd { font-size: 13px; color: var(--vscode-descriptionForeground); }

  /* ─── Color row ─── */
  .color-row {
    display: flex; align-items: center; gap: 12px;
  }
  .color-row input[type="color"] {
    width: 40px; height: 40px;
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    cursor: pointer; padding: 0;
  }
  .color-row .swatch {
    width: 80px; height: 32px; border-radius: 4px;
    border: 1px solid var(--vscode-panel-border);
  }

  /* ─── Overview cards ─── */
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .stat-card {
    padding: 16px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius);
  }
  .stat-card .stat-label { font-size: 13px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  .stat-card .stat-value { font-size: 18px; font-weight: 600; }

  /* ─── Sync badge (เตือนว่าเป็น toggle ที่ผูกอยู่กับอีก tab) ─── */
  .sync-badge {
    display: inline-flex; align-items: center; gap: 4px;
    margin-top: 6px;
    padding: 2px 9px;
    font-size: 11.5px;
    font-family: inherit;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
    border-radius: 999px;
    cursor: pointer;
    transition: background .15s, border-color .15s;
  }
  .sync-badge:hover {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .sync-badge .icon { width: 11px; height: 11px; stroke-width: 2; }

  /* ─── Disabled ─── */
  .disabled-area { opacity: .55; pointer-events: none; }

  /* ─── Mobile (narrow window) ─── */
  @media (max-width: 700px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { display: none; }
  }
</style>
</head>
<body>
<!-- ════════ SVG ICON LIBRARY ════════ -->
<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
  <symbol id="i-pen" viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></symbol>
  <symbol id="i-gauge" viewBox="0 0 24 24"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></symbol>
  <symbol id="i-list" viewBox="0 0 24 24"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><circle cx="3.5" cy="6" r="0.6"/><circle cx="3.5" cy="12" r="0.6"/><circle cx="3.5" cy="18" r="0.6"/></symbol>
  <symbol id="i-swap" viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></symbol>
  <symbol id="i-file" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></symbol>
  <symbol id="i-palette" viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 22a10 10 0 1 1 9.99-10.97c-.04 1-.71 1.97-1.99 1.97h-2a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 16 19c0 .9-.6 1.7-1.5 1.95-.43.13-1 .05-1.5.05Z"/></symbol>
  <symbol id="i-cog" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
  <symbol id="i-bolt" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></symbol>
  <symbol id="i-type" viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></symbol>
  <symbol id="i-rows" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/></symbol>
  <symbol id="i-corner" viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></symbol>
  <symbol id="i-folder" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></symbol>
  <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></symbol>
  <symbol id="i-quote" viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></symbol>
  <symbol id="i-power" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" x2="12" y1="2" y2="12"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></symbol>
  <symbol id="i-save" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" x2="23" y1="1" y2="23"/></symbol>
  <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></symbol>
  <symbol id="i-bracket" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/></symbol>
  <symbol id="i-paren" viewBox="0 0 24 24"><path d="M8 21s-4-3-4-9 4-9 4-9"/><path d="M16 3s4 3 4 9-4 9-4 9"/></symbol>
  <symbol id="i-hash" viewBox="0 0 24 24"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></symbol>
  <symbol id="i-text" viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></symbol>
</svg>

<div class="layout">
  <!-- ════════ SIDEBAR ════════ -->
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark"><svg class="icon icon-lg"><use href="#i-pen"/></svg></div>
      <div class="brand-text">INK CHECKER</div>
    </div>
    <div class="brand-sub">ตั้งค่าทั้งหมด</div>

    <div class="nav-section">การตรวจสอบ</div>
    <nav>
      <button class="nav-item active" data-tab="overview"><svg class="icon icon-lg"><use href="#i-gauge"/></svg> ภาพรวม</button>
      <button class="nav-item" data-tab="checker"><svg class="icon icon-lg"><use href="#i-search"/></svg> ตรวจสอบคำ</button>
      <button class="nav-item" data-tab="words"><svg class="icon icon-lg"><use href="#i-list"/></svg> รายการคำ</button>
      <button class="nav-item" data-tab="groups"><svg class="icon icon-lg"><use href="#i-swap"/></svg> กลุ่มคำสลับ</button>
    </nav>

    <div class="nav-section">การแสดงผล</div>
    <nav>
      <button class="nav-item" data-tab="formatting"><svg class="icon icon-lg"><use href="#i-file"/></svg> หน้ากระดาษ</button>
      <button class="nav-item" data-tab="colors"><svg class="icon icon-lg"><use href="#i-palette"/></svg> สีไฮไลต์</button>
    </nav>

    <div class="nav-section">อื่น ๆ</div>
    <nav>
      <button class="nav-item" data-tab="advanced"><svg class="icon icon-lg"><use href="#i-cog"/></svg> ขั้นสูง</button>
    </nav>
  </aside>

  <!-- ════════ CONTENT ════════ -->
  <main class="content">

    <!-- ─── ภาพรวม ─── -->
    <section id="tab-overview" class="active">
      <div class="section-h">
        <div class="h-row">
          <div class="h-icon"><svg class="icon icon-xl"><use href="#i-gauge"/></svg></div>
          <h1>ภาพรวม</h1>
        </div>
        <p>สถานะปัจจุบันและการตั้งค่าหลัก</p>
      </div>

      <div class="overview-grid">
        <div class="stat-card">
          <div class="stat-label">การตรวจสอบ</div>
          <div class="stat-value" id="ovChecker">–</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">รายการคำ</div>
          <div class="stat-value" id="ovWords">–</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">หน้ากระดาษ</div>
          <div class="stat-value" id="ovFormatting">–</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-power"/></svg> เปิด/ปิด เร็ว</div>
        <div class="row">
          <div class="label-group">
            <div class="label">ตรวจสอบคำ</div>
            <div class="hint">เปิด/ปิดการตรวจสอบทั้งหมด</div>
            <button class="sync-badge" data-jump="checker" title="ผูกกับ switch ใน tab ตรวจสอบคำ — คลิกเพื่อข้ามไป"><svg class="icon"><use href="#i-link"/></svg> sync กับ tab “ตรวจสอบคำ”</button>
          </div>
          <label class="toggle"><input type="checkbox" id="quickChecker"/><span class="slider"></span></label>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">หน้ากระดาษ</div>
            <div class="hint">ใช้ฟอนต์ TH Sarabun + ย่อหน้า + ตัดบรรทัด</div>
            <button class="sync-badge" data-jump="formatting" title="ผูกกับ switch ใน tab หน้ากระดาษ — คลิกเพื่อข้ามไป"><svg class="icon"><use href="#i-link"/></svg> sync กับ tab “หน้ากระดาษ”</button>
          </div>
          <label class="toggle"><input type="checkbox" id="quickFormatting"/><span class="slider"></span></label>
        </div>
      </div>
    </section>

    <!-- ─── ตรวจสอบคำ ─── -->
    <section id="tab-checker">
      <div class="section-h">
        <div class="h-row">
          <div class="h-icon"><svg class="icon icon-xl"><use href="#i-search"/></svg></div>
          <h1>ตรวจสอบคำ</h1>
        </div>
        <p>เลือกประเภทของคำหรืออักขระที่ต้องการให้ตรวจหา</p>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-power"/></svg> เปิด/ปิด หลัก</div>
        <div class="row">
          <div class="label-group">
            <div class="label">เปิดการตรวจสอบทั้งหมด</div>
            <div class="hint">ปิดเมื่อต้องการพักการตรวจชั่วคราว</div>
            <button class="sync-badge" data-jump="overview" title="ผูกกับ switch ใน tab ภาพรวม — คลิกเพื่อข้ามไป"><svg class="icon"><use href="#i-link"/></svg> sync กับ tab “ภาพรวม”</button>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_enabled"/><span class="slider"></span></label>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-globe"/></svg> ภาษาและตัวเลข</div>
        <div class="row">
          <div class="label-group">
            <div class="label">ตรวจหาภาษาอังกฤษ</div>
            <div class="hint">ไฮไลต์ตัวอักษร a-z A-Z ที่ปนในข้อความไทย</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkEnglish"/><span class="slider"></span></label>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">ตรวจหาตัวเลข</div>
            <div class="hint">ไฮไลต์ 0-9</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkNumbers"/><span class="slider"></span></label>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">ตรวจหาภาษาต่างประเทศอื่น</div>
            <div class="hint">เช่น จีน ญี่ปุ่น เกาหลี รัสเซีย</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkForeignLanguages"/><span class="slider"></span></label>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-quote"/></svg> เครื่องหมายเปิด/ปิดไม่ครบ</div>
        <div class="row">
          <div class="label-group">
            <div class="label">อัญประกาศโค้ง “ ”</div>
            <div class="hint">ตรวจหาที่เปิดแล้วไม่ปิด</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkUnclosedFancyQuotes"/><span class="slider"></span></label>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">อัญประกาศคู่ "</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkUnclosedDoubleQuotes"/><span class="slider"></span></label>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">อัญประกาศเดี่ยว '</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkUnclosedSingleQuotes"/><span class="slider"></span></label>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">วงเล็บ ( )</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkUnclosedParentheses"/><span class="slider"></span></label>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">วงเล็บเหลี่ยม [ ]</div>
          </div>
          <label class="toggle"><input type="checkbox" id="chk_checkUnclosedBrackets"/><span class="slider"></span></label>
        </div>
      </div>
    </section>

    <!-- ─── รายการคำ ─── -->
    <section id="tab-words">
      <div class="section-h">
        <div class="h-row">
          <div class="h-icon"><svg class="icon icon-xl"><use href="#i-list"/></svg></div>
          <h1>รายการคำ</h1>
        </div>
        <p>คำที่ต้องการให้ตรวจและไฮไลต์ในข้อความ</p>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-plus"/></svg> เพิ่มคำใหม่</div>
        <div class="word-add">
          <input type="text" id="wordInput" placeholder="พิมพ์คำที่ต้องการตรวจ แล้วกด Enter หรือปุ่มเพิ่ม"/>
          <button class="btn" id="addWordBtn">+ เพิ่ม</button>
        </div>
        <div class="word-tags" id="wordTags"></div>
        <div class="hint" style="margin-top: 12px;">
          <span id="wordCount">0</span> คำในรายการ
        </div>
      </div>
    </section>

    <!-- ─── กลุ่มคำสลับ ─── -->
    <section id="tab-groups">
      <div class="section-h">
        <div class="h-row">
          <div class="h-icon"><svg class="icon icon-xl"><use href="#i-swap"/></svg></div>
          <h1>กลุ่มคำสลับ</h1>
        </div>
        <p>กลุ่มคำที่สามารถสลับกันได้ — เมื่อ hover คำในกลุ่ม จะเสนอคำอื่นในกลุ่มเดียวกันแทน</p>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-swap"/></svg> กลุ่มคำ</div>
        <div class="hint" style="margin-bottom: 12px;">
          แต่ละบรรทัด = 1 กลุ่ม คั่นคำในกลุ่มด้วยจุลภาค (,)<br/>
          ตัวอย่าง: <code>ข้า, ฉัน, เธอ, คุณ, เจ้า</code>
        </div>
        <div class="group-list" id="groupList"></div>
        <button class="btn btn-secondary" id="addGroupBtn">+ เพิ่มกลุ่มใหม่</button>
      </div>
    </section>

    <!-- ─── หน้ากระดาษ ─── -->
    <section id="tab-formatting">
      <div class="section-h">
        <div class="h-row">
          <div class="h-icon"><svg class="icon icon-xl"><use href="#i-file"/></svg></div>
          <h1>หน้ากระดาษ</h1>
        </div>
        <p>ฟอนต์ ขนาด ระยะห่าง ย่อหน้า ตัดบรรทัด สำหรับ .txt และ .md</p>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-power"/></svg> เปิด/ปิด</div>
        <div class="row">
          <div class="label-group">
            <div class="label">เปิดการจัดหน้ากระดาษ</div>
            <div class="hint" id="fmtMasterDesc">ปิดอยู่</div>
            <button class="sync-badge" data-jump="overview" title="ผูกกับ switch ใน tab ภาพรวม — คลิกเพื่อข้ามไป"><svg class="icon"><use href="#i-link"/></svg> sync กับ tab “ภาพรวม”</button>
          </div>
          <label class="toggle"><input type="checkbox" id="fmt_enabled"/><span class="slider"></span></label>
        </div>
      </div>

      <div id="fmtArea">
        <div class="card">
          <div class="card-title"><svg class="icon"><use href="#i-bolt"/></svg> เลือกแบบสำเร็จ (กดทีเดียวจบ)</div>
          <div class="presets">
            <button class="preset" data-preset="sarabun-14">
              <div class="pn">TH Sarabun 14</div>
              <div class="pd">กระชับ</div>
            </button>
            <button class="preset" data-preset="sarabun-16">
              <div class="pn">TH Sarabun 16</div>
              <div class="pd">มาตรฐาน — แนะนำ</div>
            </button>
            <button class="preset" data-preset="sarabun-18">
              <div class="pn">TH Sarabun 18</div>
              <div class="pd">ใหญ่ สบายตา</div>
            </button>
            <button class="preset" data-preset="sarabun-20">
              <div class="pn">TH Sarabun 20</div>
              <div class="pd">ใหญ่มาก</div>
            </button>
            <button class="preset" data-preset="tahoma-14" title="ฟอนต์ระบบ Windows สำรองไว้ใช้ถ้า Sarabun เพี้ยน">
              <div class="pn">Tahoma 14</div>
              <div class="pd">Windows ดั้งเดิม — สำรอง</div>
            </button>
            <button class="preset" data-preset="vscode-default" title="ล้างการจัดหน้ากระดาษทุกอย่าง — ใช้เมื่อทุกอย่างเพี้ยน">
              <div class="pn">ค่า VS Code ปกติ</div>
              <div class="pd">กลับสู่ดั้งเดิม (ล้างทุกอย่าง)</div>
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><svg class="icon"><use href="#i-text"/></svg> ฟอนต์</div>
          <div class="row">
            <div class="label-group">
              <div class="label">ฟอนต์</div>
              <div class="hint">ค่าเริ่มต้น: TH Sarabun (ฟอนต์ราชการไทย)</div>
            </div>
            <select id="fmt_fontFamily">
              <option value="'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif">TH Sarabun (แนะนำ)</option>
              <option value="'Sarabun', 'Noto Sans Thai', sans-serif">Sarabun</option>
              <option value="'Noto Sans Thai', sans-serif">Noto Sans Thai</option>
              <option value="'Kanit', sans-serif">Kanit</option>
              <option value="'Prompt', sans-serif">Prompt</option>
              <option value="'Cordia New', 'CordiaUPC', sans-serif">Cordia New</option>
              <option value="'Angsana New', 'AngsanaUPC', serif">Angsana New (มีหัว)</option>
              <option value="'Mali', cursive">Mali (ลายมือ)</option>
            </select>
          </div>
          <div class="row">
            <div class="label-group">
              <div class="label">ขนาดตัวอักษร</div>
              <div class="hint">เล็ก 12 → ใหญ่ 28</div>
            </div>
            <div class="stepper">
              <button data-step="fmt_fontSize" data-delta="-1">−</button>
              <input type="number" id="fmt_fontSize" min="8" max="72"/>
              <button data-step="fmt_fontSize" data-delta="1">+</button>
              <span class="unit">px</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><svg class="icon"><use href="#i-rows"/></svg> การจัดวาง</div>
          <div class="row">
            <div class="label-group">
              <div class="label">ระยะห่างบรรทัด</div>
              <div class="hint">1.4 = แน่น, 1.6 = มาตรฐาน, 1.8 = โปร่ง</div>
            </div>
            <div class="stepper">
              <button data-step="fmt_lineHeight" data-delta="-0.1">−</button>
              <input type="number" id="fmt_lineHeight" step="0.1" min="1" max="3"/>
              <button data-step="fmt_lineHeight" data-delta="0.1">+</button>
              <span class="unit">x</span>
            </div>
          </div>
          <div class="row">
            <div class="label-group">
              <div class="label">ระยะย่อหน้า (ทุกบรรทัด)</div>
              <div class="hint">เว้นช่องว่างซ้ายของย่อหน้า เหมือน Word</div>
            </div>
            <div class="stepper">
              <button data-step="fmt_paragraphIndent" data-delta="-4">−</button>
              <input type="number" id="fmt_paragraphIndent" min="0" max="200"/>
              <button data-step="fmt_paragraphIndent" data-delta="4">+</button>
              <span class="unit">px</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><svg class="icon"><use href="#i-corner"/></svg> ตัดบรรทัด</div>
          <div class="row">
            <div class="label-group">
              <div class="label">ตัดบรรทัดอัตโนมัติ</div>
              <div class="hint">บรรทัดยาวจะพับลงมา ไม่ต้องเลื่อนแนวนอน</div>
            </div>
            <label class="toggle"><input type="checkbox" id="fmt_wordWrap"/><span class="slider"></span></label>
          </div>
          <div class="row" id="wrapColRow">
            <div class="label-group">
              <div class="label">ความกว้าง (ตัวอักษร)</div>
              <div class="hint">60 = แคบ, 90 = สบายตา (แนะนำ), 120 = กว้าง</div>
            </div>
            <div class="stepper">
              <button data-step="fmt_wordWrapColumn" data-delta="-10">−</button>
              <input type="number" id="fmt_wordWrapColumn" min="40" max="200"/>
              <button data-step="fmt_wordWrapColumn" data-delta="10">+</button>
              <span class="unit">ตัวอักษร</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><svg class="icon"><use href="#i-folder"/></svg> ใช้กับไฟล์</div>
          <div class="row">
            <div class="label-group">
              <div class="label">.txt (ข้อความปกติ)</div>
            </div>
            <label class="toggle"><input type="checkbox" id="fmt_applyToPlaintext"/><span class="slider"></span></label>
          </div>
          <div class="row">
            <div class="label-group">
              <div class="label">.md (Markdown)</div>
            </div>
            <label class="toggle"><input type="checkbox" id="fmt_applyToMarkdown"/><span class="slider"></span></label>
          </div>
        </div>

        <div class="card">
          <div class="card-title"><svg class="icon"><use href="#i-refresh"/></svg> รีเซ็ต</div>
          <div class="row">
            <div class="label-group">
              <div class="label">คืนค่าเริ่มต้นของหน้ากระดาษ</div>
              <div class="hint">ลบค่าทั้งหมดและคืนค่า editor เดิมของคุณ</div>
            </div>
            <button class="btn btn-danger" id="resetFmtBtn">รีเซ็ต</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── สี ─── -->
    <section id="tab-colors">
      <div class="section-h">
        <div class="h-row">
          <div class="h-icon"><svg class="icon icon-xl"><use href="#i-palette"/></svg></div>
          <h1>สีไฮไลต์</h1>
        </div>
        <p>สีพื้นหลังของคำหรือเครื่องหมายที่ตรวจพบ</p>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-list"/></svg> รายการคำกำหนดเอง</div>
        <div class="row">
          <div class="label-group">
            <div class="label">สี</div>
            <div class="hint">ใช้กับคำใน "รายการคำ" ที่ตั้งไว้</div>
          </div>
          <div class="color-row">
            <input type="color" id="col_customWordsColor"/>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-globe"/></svg> ภาษาต่างประเทศ / ตัวเลข</div>
        <div class="row">
          <div class="label-group">
            <div class="label">สี</div>
            <div class="hint">ใช้กับภาษาอังกฤษ ตัวเลข และภาษาต่างประเทศอื่น</div>
          </div>
          <div class="color-row">
            <input type="color" id="col_languageAndNumberColor"/>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-paren"/></svg> เครื่องหมาย/วงเล็บไม่ครบ</div>
        <div class="row">
          <div class="label-group">
            <div class="label">สี</div>
            <div class="hint">ใช้กับวงเล็บหรือคำพูดที่เปิดแล้วไม่ปิด</div>
          </div>
          <div class="color-row">
            <input type="color" id="col_unbalancedCharactersColor"/>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── ขั้นสูง ─── -->
    <section id="tab-advanced">
      <div class="section-h">
        <div class="h-row">
          <div class="h-icon"><svg class="icon icon-xl"><use href="#i-cog"/></svg></div>
          <h1>ขั้นสูง</h1>
        </div>
        <p>นำเข้า/ส่งออก ตั้งค่า และทางลัด</p>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-save"/></svg> นำเข้า / ส่งออก ตั้งค่า</div>
        <div class="row">
          <div class="label-group">
            <div class="label">ส่งออกตั้งค่าเป็นไฟล์ JSON</div>
            <div class="hint">บันทึกค่าทั้งหมด (รายการคำ, กลุ่ม, หน้ากระดาษ, สี) เพื่อสำรองหรือแชร์</div>
          </div>
          <button class="btn" id="exportBtn"><svg class="icon"><use href="#i-download"/></svg> ส่งออก...</button>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">นำเข้าตั้งค่าจากไฟล์ JSON</div>
            <div class="hint">โหลดไฟล์ที่เคยส่งออก (จะเขียนทับค่าปัจจุบัน)</div>
          </div>
          <button class="btn btn-secondary" id="importBtn"><svg class="icon"><use href="#i-upload"/></svg> นำเข้า...</button>
        </div>
        <div class="row">
          <div class="label-group">
            <div class="label">คัดลอกตั้งค่าไปที่คลิปบอร์ด</div>
            <div class="hint">สำหรับแชร์เร็ว ๆ ผ่าน chat / email</div>
          </div>
          <button class="btn btn-secondary" id="copyBtn"><svg class="icon"><use href="#i-link"/></svg> คัดลอก JSON</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-cog"/></svg> เปิดหน้า Settings ของ VS Code</div>
        <div class="row">
          <div class="label-group">
            <div class="label">@ext:inkrealm.ink-checker</div>
            <div class="hint">หน้า settings ดิบของ VS Code — สำหรับการแก้ไขละเอียด</div>
          </div>
          <button class="btn btn-secondary" id="openVscodeSettings">เปิด Settings</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><svg class="icon"><use href="#i-info"/></svg> ข้อมูล</div>
        <div class="row">
          <div class="label-group">
            <div class="label">INK CHECKER</div>
            <div class="hint">Word and writing consistency checker for Thai text</div>
          </div>
        </div>
      </div>
    </section>

  </main>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let state = null;
  let suppress = false;

  // ─── nav ───
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.addEventListener("click", () => activateTab(b.dataset.tab));
  });
  function activateTab(id) {
    document.querySelectorAll(".nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === id);
    });
    document.querySelectorAll("section").forEach((s) => {
      s.classList.toggle("active", s.id === "tab-" + id);
    });
  }

  // ป้าย sync — คลิกเพื่อกระโดดไป tab ที่ผูกอยู่
  document.querySelectorAll(".sync-badge").forEach((b) => {
    b.addEventListener("click", () => {
      const target = b.dataset.jump;
      if (target) activateTab(target);
    });
  });

  // ─── load state ───
  function load(data) {
    suppress = true;
    state = data;

    // overview
    $("ovChecker").textContent = data.checker.enabled ? "เปิดอยู่" : "ปิดอยู่";
    $("ovWords").textContent = (data.words || []).length + " คำ";
    const fm = data.formatting;
    const fontShort = (fm.fontFamily.split(",")[0] || "").replace(/['"]/g, "").trim();
    $("ovFormatting").textContent = fm.enabled ? fontShort + " " + fm.fontSize + "px" : "ปิดอยู่";
    $("quickChecker").checked = data.checker.enabled;
    $("quickFormatting").checked = fm.enabled;

    // checker tab
    $("chk_enabled").checked = data.checker.enabled;
    $("chk_checkEnglish").checked = data.checker.checkEnglish;
    $("chk_checkNumbers").checked = data.checker.checkNumbers;
    $("chk_checkForeignLanguages").checked = data.checker.checkForeignLanguages;
    $("chk_checkUnclosedFancyQuotes").checked = data.checker.checkUnclosedFancyQuotes;
    $("chk_checkUnclosedDoubleQuotes").checked = data.checker.checkUnclosedDoubleQuotes;
    $("chk_checkUnclosedSingleQuotes").checked = data.checker.checkUnclosedSingleQuotes;
    $("chk_checkUnclosedParentheses").checked = data.checker.checkUnclosedParentheses;
    $("chk_checkUnclosedBrackets").checked = data.checker.checkUnclosedBrackets;

    // words tab
    renderWords(data.words || []);

    // groups tab
    renderGroups(data.wordGroups || []);

    // formatting tab
    $("fmt_enabled").checked = fm.enabled;
    $("fmtMasterDesc").textContent = fm.enabled
      ? "เปิดอยู่ — ใช้ค่าด้านล่าง"
      : "ปิดอยู่ — ใช้ค่าเริ่มต้นของ VS Code";
    $("fmtArea").classList.toggle("disabled-area", !fm.enabled);

    const ff = $("fmt_fontFamily");
    ff.value = fm.fontFamily;
    if (ff.value !== fm.fontFamily) {
      const opt = document.createElement("option");
      opt.value = fm.fontFamily;
      opt.textContent = "(กำหนดเอง) " + ((fm.fontFamily.split(",")[0] || "").replace(/['"]/g, "").trim());
      ff.appendChild(opt);
      ff.value = fm.fontFamily;
    }
    $("fmt_fontSize").value = fm.fontSize;
    $("fmt_lineHeight").value = fm.lineHeight;
    $("fmt_paragraphIndent").value = fm.paragraphIndent;
    $("fmt_wordWrap").checked = fm.wordWrap;
    $("fmt_wordWrapColumn").value = fm.wordWrapColumn;
    $("fmt_applyToPlaintext").checked = fm.applyToPlaintext;
    $("fmt_applyToMarkdown").checked = fm.applyToMarkdown;
    $("wrapColRow").style.display = fm.wordWrap ? "" : "none";

    // colors
    $("col_customWordsColor").value = toHex(data.colors.customWordsColor, "#FFE564");
    $("col_languageAndNumberColor").value = toHex(data.colors.languageAndNumberColor, "#ADD8E6");
    $("col_unbalancedCharactersColor").value = toHex(data.colors.unbalancedCharactersColor, "#FF6464");

    suppress = false;
  }

  function toHex(s, fallback) {
    if (!s) return fallback;
    const t = s.trim();
    if (t.startsWith("#")) {
      let h = t.toUpperCase();
      if (/^#[0-9A-F]{3}$/.test(h)) {
        h = "#" + h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
      }
      if (/^#[0-9A-F]{6}$/.test(h)) return h;
    }
    const m = t.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
    if (m) {
      return "#" + [m[1],m[2],m[3]].map((x) => {
        return parseInt(x,10).toString(16).padStart(2,"0").toUpperCase();
      }).join("");
    }
    return fallback;
  }

  // ─── words rendering ───
  function renderWords(words) {
    const c = $("wordTags");
    c.innerHTML = "";
    words.forEach((w, i) => {
      const tag = document.createElement("span");
      tag.className = "word-tag";
      tag.innerHTML = "<span></span><span class='x'>×</span>";
      tag.firstChild.textContent = w;
      tag.querySelector(".x").addEventListener("click", () => {
        const next = words.slice();
        next.splice(i, 1);
        vscode.postMessage({ command: "updateWords", words: next });
      });
      c.appendChild(tag);
    });
    $("wordCount").textContent = words.length;
  }
  function addWord() {
    const v = $("wordInput").value.trim();
    if (!v) return;
    const next = (state?.words || []).slice();
    if (!next.includes(v)) next.push(v);
    vscode.postMessage({ command: "updateWords", words: next });
    $("wordInput").value = "";
  }
  $("addWordBtn").addEventListener("click", addWord);
  $("wordInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addWord();
  });

  // ─── groups rendering ───
  function renderGroups(groups) {
    const c = $("groupList");
    c.innerHTML = "";
    groups.forEach((g, i) => {
      const row = document.createElement("div");
      row.className = "group-item";
      row.innerHTML = "<input type='text'/><button class='x' title='ลบ'>×</button>";
      const inp = row.querySelector("input");
      inp.value = g;
      inp.addEventListener("change", () => {
        const next = groups.slice();
        next[i] = inp.value;
        vscode.postMessage({ command: "updateWordGroups", groups: next });
      });
      row.querySelector(".x").addEventListener("click", () => {
        const next = groups.slice();
        next.splice(i, 1);
        vscode.postMessage({ command: "updateWordGroups", groups: next });
      });
      c.appendChild(row);
    });
  }
  $("addGroupBtn").addEventListener("click", () => {
    const next = (state?.wordGroups || []).slice();
    next.push("");
    vscode.postMessage({ command: "updateWordGroups", groups: next });
  });

  // ─── checker bindings ───
  const checkerKeys = ["enabled","checkEnglish","checkNumbers","checkForeignLanguages",
    "checkUnclosedFancyQuotes","checkUnclosedDoubleQuotes","checkUnclosedSingleQuotes",
    "checkUnclosedParentheses","checkUnclosedBrackets"];
  function saveCheckerOne(key) {
    if (suppress) return;
    const values = {};
    values[key] = $("chk_" + key).checked;
    vscode.postMessage({ command: "updateChecker", values });
  }
  checkerKeys.forEach((k) => {
    $("chk_" + k).addEventListener("change", () => saveCheckerOne(k));
  });
  // overview quick toggles
  $("quickChecker").addEventListener("change", () => {
    if (suppress) return;
    vscode.postMessage({ command: "updateChecker", values: { enabled: $("quickChecker").checked } });
  });
  $("quickFormatting").addEventListener("change", () => {
    if (suppress) return;
    vscode.postMessage({ command: "updateFormatting", values: { enabled: $("quickFormatting").checked } });
  });

  // ─── formatting bindings ───
  const fmtKeys = ["enabled","fontFamily","fontSize","lineHeight","paragraphIndent","wordWrap","wordWrapColumn","applyToPlaintext","applyToMarkdown"];
  function saveFmtOne(key) {
    if (suppress) return;
    const el = $("fmt_" + key);
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "number") v = Number(el.value);
    else v = el.value;
    const values = {};
    values[key] = v;
    vscode.postMessage({ command: "updateFormatting", values });
  }
  fmtKeys.forEach((k) => {
    const el = $("fmt_" + k);
    if (!el) return;
    const ev = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, () => saveFmtOne(k));
  });
  // stepper
  document.querySelectorAll(".stepper button").forEach((b) => {
    b.addEventListener("click", () => {
      const target = b.dataset.step;
      const delta = parseFloat(b.dataset.delta);
      const el = $(target);
      let v = parseFloat(el.value) || 0;
      v = +(v + delta).toFixed(2);
      const min = parseFloat(el.min); const max = parseFloat(el.max);
      if (!isNaN(min) && v < min) v = min;
      if (!isNaN(max) && v > max) v = max;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  // presets
  document.querySelectorAll(".preset").forEach((p) => {
    p.addEventListener("click", () => {
      vscode.postMessage({ command: "applyPreset", preset: p.dataset.preset });
    });
  });
  $("resetFmtBtn").addEventListener("click", () => {
    if (confirm("ต้องการรีเซ็ตการจัดหน้ากระดาษทั้งหมด?")) {
      vscode.postMessage({ command: "resetFormatting" });
    }
  });

  // ─── colors ───
  ["customWordsColor","languageAndNumberColor","unbalancedCharactersColor"].forEach((k) => {
    $("col_" + k).addEventListener("change", () => {
      if (suppress) return;
      const hex = $("col_" + k).value;
      const r = parseInt(hex.slice(1,3),16);
      const g = parseInt(hex.slice(3,5),16);
      const b = parseInt(hex.slice(5,7),16);
      const alpha = k === "customWordsColor" ? 0.6 : (k === "languageAndNumberColor" ? 0.5 : 0.4);
      const rgba = "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
      const values = {};
      values[k] = rgba;
      vscode.postMessage({ command: "updateColors", values });
    });
  });

  // ─── advanced (import/export) ───
  $("openVscodeSettings").addEventListener("click", () => {
    vscode.postMessage({ command: "openVscodeSettings" });
  });
  $("exportBtn").addEventListener("click", () => {
    vscode.postMessage({ command: "exportSettings" });
  });
  $("importBtn").addEventListener("click", () => {
    vscode.postMessage({ command: "importSettings" });
  });
  $("copyBtn").addEventListener("click", () => {
    vscode.postMessage({ command: "copySettings" });
  });

  // ─── messages from extension ───
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.command === "allLoaded") load(msg.data);
    if (msg.command === "showTab") activateTab(msg.tabId);
  });

  // init
  vscode.postMessage({ command: "ready" });
</script>
</body>
</html>`;
  }
}
