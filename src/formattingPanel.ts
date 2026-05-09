import * as vscode from "vscode";
import { getFormattingConfig, resetFormatting } from "./formatting";

const CONFIG_SECTION = "inkChecker";

/**
 * FormattingPanel — webview สำหรับจัดหน้ากระดาษ (UI/UX แบบเข้าใจง่าย)
 */
export class FormattingPanel {
  public static currentPanel: FormattingPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _configWatcher: vscode.Disposable;

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "ready":
          case "getConfig":
            this._sendConfigToWebview();
            break;
          case "saveConfig":
            await this._saveConfig(message.config);
            break;
          case "applyPreset":
            await this._applyPreset(message.preset);
            break;
          case "reset":
            await this._reset();
            break;
        }
      },
      null,
      this._disposables
    );

    // ฟังการเปลี่ยนแปลง config จากภายนอก แล้วซิงก์กลับมา UI
    this._configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${CONFIG_SECTION}.formatting`)) {
        this._sendConfigToWebview();
      }
    });
    this._disposables.push(this._configWatcher);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow() {
    if (FormattingPanel.currentPanel) {
      FormattingPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "inkCheckerFormatting",
      "จัดหน้ากระดาษ — INK CHECKER",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    FormattingPanel.currentPanel = new FormattingPanel(panel);
  }

  private _sendConfigToWebview() {
    const cfg = getFormattingConfig();
    this._panel.webview.postMessage({
      command: "configLoaded",
      config: cfg,
    });
  }

  private async _saveConfig(config: any) {
    const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const target = vscode.ConfigurationTarget.Global;
    await c.update("formatting.enabled", !!config.enabled, target);
    if (config.fontFamily !== undefined)
      await c.update("formatting.fontFamily", String(config.fontFamily), target);
    if (config.fontSize !== undefined)
      await c.update("formatting.fontSize", Number(config.fontSize), target);
    if (config.lineHeight !== undefined)
      await c.update("formatting.lineHeight", Number(config.lineHeight), target);
    if (config.paragraphIndent !== undefined)
      await c.update(
        "formatting.paragraphIndent",
        Number(config.paragraphIndent),
        target
      );
    if (config.wordWrap !== undefined)
      await c.update("formatting.wordWrap", !!config.wordWrap, target);
    if (config.wordWrapColumn !== undefined)
      await c.update(
        "formatting.wordWrapColumn",
        Number(config.wordWrapColumn),
        target
      );
    if (config.applyToPlaintext !== undefined)
      await c.update(
        "formatting.applyToPlaintext",
        !!config.applyToPlaintext,
        target
      );
    if (config.applyToMarkdown !== undefined)
      await c.update(
        "formatting.applyToMarkdown",
        !!config.applyToMarkdown,
        target
      );
  }

  private async _applyPreset(presetId: string) {
    const presets: Record<string, Partial<ReturnType<typeof getFormattingConfig>>> = {
      "sarabun-14": {
        fontFamily:
          "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
        paragraphIndent: 24,
        wordWrap: true,
        wordWrapColumn: 100,
      },
      "sarabun-16": {
        fontFamily:
          "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 16,
        lineHeight: 1.6,
        paragraphIndent: 32,
        wordWrap: true,
        wordWrapColumn: 90,
      },
      "sarabun-18": {
        fontFamily:
          "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 18,
        lineHeight: 1.7,
        paragraphIndent: 36,
        wordWrap: true,
        wordWrapColumn: 90,
      },
      "sarabun-20": {
        fontFamily:
          "'TH Sarabun New', 'TH Sarabun PSK', Sarabun, 'Noto Sans Thai', sans-serif",
        fontSize: 20,
        lineHeight: 1.8,
        paragraphIndent: 40,
        wordWrap: true,
        wordWrapColumn: 80,
      },
    };
    const values = presets[presetId];
    if (!values) return;
    const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const target = vscode.ConfigurationTarget.Global;
    for (const [k, v] of Object.entries(values)) {
      await c.update(`formatting.${k}`, v, target);
    }
    await c.update("formatting.enabled", true, target);
  }

  private async _reset() {
    await resetFormatting();
  }

  public dispose() {
    FormattingPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  private _getWebviewContent(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>จัดหน้ากระดาษ</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Sarabun', 'TH Sarabun New', 'Noto Sans Thai', system-ui, sans-serif;
    margin: 0;
    padding: 24px 32px 64px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.5;
  }
  h1 {
    font-size: 24px;
    margin: 0 0 4px;
    font-weight: 600;
  }
  .subtitle {
    color: var(--vscode-descriptionForeground);
    margin-bottom: 24px;
    font-size: 13px;
  }
  .container {
    max-width: 720px;
  }

  /* Master switch (toggle ใหญ่ที่สุด) */
  .master-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 8px;
    margin-bottom: 24px;
    border: 1px solid var(--vscode-panel-border);
  }
  .master-switch .label-group {
    display: flex;
    flex-direction: column;
  }
  .master-switch .title {
    font-size: 16px;
    font-weight: 600;
  }
  .master-switch .desc {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
  }

  /* Toggle switch */
  .toggle {
    position: relative;
    display: inline-block;
    width: 52px;
    height: 28px;
    flex-shrink: 0;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    transition: .2s;
    border-radius: 28px;
  }
  .slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background-color: var(--vscode-descriptionForeground);
    transition: .2s;
    border-radius: 50%;
  }
  input:checked + .slider {
    background-color: var(--vscode-button-background);
    border-color: var(--vscode-button-background);
  }
  input:checked + .slider:before {
    transform: translateX(24px);
    background-color: var(--vscode-button-foreground);
  }

  /* Sections */
  .section {
    margin-bottom: 28px;
    padding: 18px 20px;
    background: var(--vscode-textBlockQuote-background, transparent);
    border-radius: 8px;
    border: 1px solid var(--vscode-panel-border);
  }
  .section-title {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title .icon { font-size: 18px; }

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
  .row .label { font-size: 14px; }
  .row .hint {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
  }

  /* Inputs */
  select, input[type="number"] {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
  }
  select { min-width: 200px; }
  input[type="number"] { width: 80px; text-align: center; }

  /* Stepper */
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .stepper button {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-border, var(--vscode-button-background));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
  }
  .stepper button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .unit {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    margin-left: 4px;
  }

  /* Checkbox */
  .check-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .check-row label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px 14px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    user-select: none;
  }
  .check-row label:has(input:checked) {
    border-color: var(--vscode-button-background);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .check-row input { margin: 0; }

  /* Presets */
  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }
  .preset {
    padding: 14px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    background: transparent;
    color: inherit;
    font-family: inherit;
    transition: .15s;
  }
  .preset:hover {
    border-color: var(--vscode-button-background);
    background: var(--vscode-list-hoverBackground);
  }
  .preset .preset-name {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 4px;
  }
  .preset .preset-desc {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  /* Reset button */
  .reset-btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid var(--vscode-errorForeground);
    background: transparent;
    color: var(--vscode-errorForeground);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
  }
  .reset-btn:hover {
    background: var(--vscode-errorForeground);
    color: var(--vscode-editor-background);
  }

  .disabled-area { opacity: 0.5; pointer-events: none; }
</style>
</head>
<body>
<div class="container">
  <h1>📝 จัดหน้ากระดาษ</h1>
  <div class="subtitle">ตั้งค่าฟอนต์ ขนาด ระยะห่างบรรทัด ย่อหน้า และความกว้างของบรรทัด สำหรับไฟล์ <code>.txt</code> และ <code>.md</code></div>

  <!-- Master switch -->
  <div class="master-switch">
    <div class="label-group">
      <div class="title">เปิด/ปิด การจัดหน้ากระดาษ</div>
      <div class="desc" id="masterDesc">ปิดอยู่ — ไฟล์จะแสดงด้วยค่าเริ่มต้นของ VS Code</div>
    </div>
    <label class="toggle">
      <input type="checkbox" id="enabled" />
      <span class="slider"></span>
    </label>
  </div>

  <div id="settingsArea">

    <!-- Preset buttons (ก่อนเลย — กดทีเดียวจบ) -->
    <div class="section">
      <div class="section-title"><span class="icon">⚡</span> เลือกแบบสำเร็จ (กดทีเดียวจบ)</div>
      <div class="presets">
        <button class="preset" data-preset="sarabun-14">
          <div class="preset-name">TH Sarabun 14</div>
          <div class="preset-desc">กระชับ — ดูภาพรวม</div>
        </button>
        <button class="preset" data-preset="sarabun-16">
          <div class="preset-name">TH Sarabun 16</div>
          <div class="preset-desc">มาตรฐาน — แนะนำ</div>
        </button>
        <button class="preset" data-preset="sarabun-18">
          <div class="preset-name">TH Sarabun 18</div>
          <div class="preset-desc">ใหญ่ — สบายตา</div>
        </button>
        <button class="preset" data-preset="sarabun-20">
          <div class="preset-name">TH Sarabun 20</div>
          <div class="preset-desc">ใหญ่มาก — เหมาะสายตา</div>
        </button>
      </div>
    </div>

    <!-- Font -->
    <div class="section">
      <div class="section-title"><span class="icon">🅰</span> ฟอนต์</div>
      <div class="row">
        <div class="label-group">
          <div class="label">ฟอนต์ตัวอักษร</div>
          <div class="hint">ค่าเริ่มต้น: TH Sarabun (ฟอนต์ราชการไทย)</div>
        </div>
        <select id="fontFamily">
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
          <button data-step="fontSize" data-delta="-1">−</button>
          <input type="number" id="fontSize" min="8" max="72" />
          <button data-step="fontSize" data-delta="1">+</button>
          <span class="unit">px</span>
        </div>
      </div>
    </div>

    <!-- Layout -->
    <div class="section">
      <div class="section-title"><span class="icon">📐</span> การจัดวาง</div>
      <div class="row">
        <div class="label-group">
          <div class="label">ระยะห่างบรรทัด</div>
          <div class="hint">1.4 = แน่น, 1.6 = มาตรฐาน, 1.8 = โปร่ง</div>
        </div>
        <div class="stepper">
          <button data-step="lineHeight" data-delta="-0.1">−</button>
          <input type="number" id="lineHeight" step="0.1" min="1" max="3" />
          <button data-step="lineHeight" data-delta="0.1">+</button>
          <span class="unit">x</span>
        </div>
      </div>
      <div class="row">
        <div class="label-group">
          <div class="label">ระยะย่อหน้า (ทุกบรรทัด)</div>
          <div class="hint">เว้นช่องว่างซ้ายของย่อหน้า เหมือน Word</div>
        </div>
        <div class="stepper">
          <button data-step="paragraphIndent" data-delta="-4">−</button>
          <input type="number" id="paragraphIndent" min="0" max="200" />
          <button data-step="paragraphIndent" data-delta="4">+</button>
          <span class="unit">px</span>
        </div>
      </div>
    </div>

    <!-- Word wrap -->
    <div class="section">
      <div class="section-title"><span class="icon">↩</span> ตัดบรรทัด</div>
      <div class="row">
        <div class="label-group">
          <div class="label">ตัดบรรทัดอัตโนมัติ</div>
          <div class="hint">บรรทัดยาวจะพับลงมา ไม่ต้องเลื่อนแนวนอน</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="wordWrap" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="row" id="wrapColRow">
        <div class="label-group">
          <div class="label">ความกว้าง (ตัวอักษร)</div>
          <div class="hint">60 = แคบ, 90 = สบายตา (แนะนำ), 120 = กว้าง</div>
        </div>
        <div class="stepper">
          <button data-step="wordWrapColumn" data-delta="-10">−</button>
          <input type="number" id="wordWrapColumn" min="40" max="200" />
          <button data-step="wordWrapColumn" data-delta="10">+</button>
          <span class="unit">ตัวอักษร</span>
        </div>
      </div>
    </div>

    <!-- Apply to -->
    <div class="section">
      <div class="section-title"><span class="icon">📁</span> ใช้กับไฟล์ประเภท</div>
      <div class="check-row">
        <label>
          <input type="checkbox" id="applyToPlaintext" />
          <span>📄 .txt (ข้อความปกติ)</span>
        </label>
        <label>
          <input type="checkbox" id="applyToMarkdown" />
          <span>📝 .md (Markdown)</span>
        </label>
      </div>
    </div>

    <!-- Reset -->
    <div class="section">
      <div class="section-title"><span class="icon">🔄</span> รีเซ็ต</div>
      <div class="row">
        <div class="label-group">
          <div class="label">คืนค่าเริ่มต้นทุกอย่าง</div>
          <div class="hint">ลบค่าทั้งหมดที่ตั้งไว้ และคืนการตั้งค่า editor เดิมของคุณ</div>
        </div>
        <button class="reset-btn" id="resetBtn">รีเซ็ต</button>
      </div>
    </div>

  </div><!-- /#settingsArea -->
</div>

<script>
  const vscode = acquireVsCodeApi();

  const $ = (id) => document.getElementById(id);
  const fields = ["enabled","fontFamily","fontSize","lineHeight","paragraphIndent","wordWrap","wordWrapColumn","applyToPlaintext","applyToMarkdown"];
  let currentConfig = {};
  let suppressEvents = false;

  function loadIntoUI(cfg) {
    suppressEvents = true;
    currentConfig = { ...cfg };
    $("enabled").checked = !!cfg.enabled;
    $("fontFamily").value = cfg.fontFamily;
    // ถ้าค่าไม่ตรงกับ option ใด ๆ ให้เพิ่ม option ชั่วคราว
    if ($("fontFamily").value !== cfg.fontFamily) {
      const opt = document.createElement('option');
      opt.value = cfg.fontFamily;
      opt.textContent = "(กำหนดเอง) " + (cfg.fontFamily.split(',')[0] || '').replace(/['\"]/g,'').trim();
      $("fontFamily").appendChild(opt);
      $("fontFamily").value = cfg.fontFamily;
    }
    $("fontSize").value = cfg.fontSize;
    $("lineHeight").value = cfg.lineHeight;
    $("paragraphIndent").value = cfg.paragraphIndent;
    $("wordWrap").checked = !!cfg.wordWrap;
    $("wordWrapColumn").value = cfg.wordWrapColumn;
    $("applyToPlaintext").checked = !!cfg.applyToPlaintext;
    $("applyToMarkdown").checked = !!cfg.applyToMarkdown;
    updateMasterDesc();
    updateDisabled();
    updateWrapColRow();
    suppressEvents = false;
  }

  function readUI() {
    return {
      enabled: $("enabled").checked,
      fontFamily: $("fontFamily").value,
      fontSize: Number($("fontSize").value) || 16,
      lineHeight: Number($("lineHeight").value) || 1.6,
      paragraphIndent: Number($("paragraphIndent").value) || 0,
      wordWrap: $("wordWrap").checked,
      wordWrapColumn: Number($("wordWrapColumn").value) || 90,
      applyToPlaintext: $("applyToPlaintext").checked,
      applyToMarkdown: $("applyToMarkdown").checked,
    };
  }

  function updateMasterDesc() {
    const on = $("enabled").checked;
    $("masterDesc").textContent = on
      ? "เปิดอยู่ — ไฟล์ .txt และ .md จะใช้ค่าด้านล่าง"
      : "ปิดอยู่ — ไฟล์จะแสดงด้วยค่าเริ่มต้นของ VS Code";
  }
  function updateDisabled() {
    const on = $("enabled").checked;
    $("settingsArea").classList.toggle("disabled-area", !on);
  }
  function updateWrapColRow() {
    $("wrapColRow").style.display = $("wordWrap").checked ? "" : "none";
  }

  function save() {
    if (suppressEvents) return;
    const cfg = readUI();
    currentConfig = cfg;
    vscode.postMessage({ command: "saveConfig", config: cfg });
  }

  // bind events
  fields.forEach((id) => {
    const el = $(id);
    if (!el) return;
    const ev = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, () => {
      if (id === "enabled") { updateMasterDesc(); updateDisabled(); }
      if (id === "wordWrap") { updateWrapColRow(); }
      save();
    });
  });

  // stepper buttons
  document.querySelectorAll(".stepper button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.step;
      const delta = parseFloat(btn.dataset.delta);
      const el = $(target);
      let v = parseFloat(el.value) || 0;
      v = +(v + delta).toFixed(2);
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      if (!isNaN(min) && v < min) v = min;
      if (!isNaN(max) && v > max) v = max;
      el.value = v;
      save();
    });
  });

  // preset buttons
  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      vscode.postMessage({ command: "applyPreset", preset: btn.dataset.preset });
    });
  });

  // reset
  $("resetBtn").addEventListener("click", () => {
    if (confirm("ต้องการรีเซ็ตการจัดหน้ากระดาษทั้งหมด?")) {
      vscode.postMessage({ command: "reset" });
    }
  });

  // Receive
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.command === "configLoaded" && msg.config) {
      loadIntoUI(msg.config);
    }
  });

  // Init
  vscode.postMessage({ command: "ready" });
</script>
</body>
</html>`;
  }
}
