import * as vscode from "vscode";

const CONFIG_SECTION = "inkChecker";

/**
 * WordListPanel: หน้าต่างสำหรับจัดการรายการคำที่ต้องการตรวจสอบ
 */
export class WordListPanel {
  public static currentPanel: WordListPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent();

    // ฟังข้อความจาก Webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "getWords":
            this._sendWordsToWebview();
            break;
          case "saveWords":
            this._saveWords(message.words);
            break;
          case "getSettings":
            this._sendSettingsToWebview();
            break;
          case "saveSettings":
            this._saveSettings(message.settings);
            break;
          case "getWordGroups":
            this._sendWordGroupsToWebview();
            break;
          case "saveWordGroups":
            this._saveWordGroups(message.wordGroups);
            break;
          case "saveAllData":
            this._saveAllData(message);
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    // ถ้ามี panel อยู่แล้ว ให้โชว์ขึ้นมา
    if (WordListPanel.currentPanel) {
      WordListPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // สร้าง panel ใหม่
    const panel = vscode.window.createWebviewPanel(
      "kunpengWordList",
      "จัดการรายการคำ - INK CHECKER",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    WordListPanel.currentPanel = new WordListPanel(panel, extensionUri);
  }

  private _sendWordsToWebview() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    // .get() will automatically fall back to the default value in package.json
    const words = config.get<string[]>("customWords");

    this._panel.webview.postMessage({
      command: "wordsLoaded",
      words: words,
    });
  }

  private _sendSettingsToWebview() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    this._panel.webview.postMessage({
      command: "settingsLoaded",
      settings: {
        checkEnglish: config.get("checkEnglish", false),
        checkNumbers: config.get("checkNumbers", false),
        checkForeignLanguages: config.get("checkForeignLanguages", false),
        checkUnclosedFancyQuotes: config.get("checkUnclosedFancyQuotes", true),
        checkUnclosedDoubleQuotes: config.get(
          "checkUnclosedDoubleQuotes",
          false
        ),
        checkUnclosedSingleQuotes: config.get(
          "checkUnclosedSingleQuotes",
          false
        ),
        checkUnclosedParentheses: config.get("checkUnclosedParentheses", false),
        checkUnclosedBrackets: config.get("checkUnclosedBrackets", false),
        customWordsColor: config.get(
          "customWordsColor",
          "rgba(255, 229, 100, 0.6)"
        ),
        languageAndNumberColor: config.get(
          "languageAndNumberColor",
          "rgba(173, 216, 230, 0.5)"
        ),
        unbalancedCharactersColor: config.get(
          "unbalancedCharactersColor",
          "rgba(255, 100, 100, 0.4)"
        ),
      },
    });
  }

  private async _saveWords(words: string[]) {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(
      "customWords",
      words,
      vscode.ConfigurationTarget.Global
    );

    // ส่งคำสั่งให้ refresh การตรวจสอบ
    vscode.commands.executeCommand("ink-checker.refresh");
  }

  private async _saveSettings(settings: any) {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    await config.update(
      "checkEnglish",
      settings.checkEnglish,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "checkNumbers",
      settings.checkNumbers,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "checkForeignLanguages",
      settings.checkForeignLanguages,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "checkUnclosedFancyQuotes",
      settings.checkUnclosedFancyQuotes,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "checkUnclosedDoubleQuotes",
      settings.checkUnclosedDoubleQuotes,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "checkUnclosedSingleQuotes",
      settings.checkUnclosedSingleQuotes,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "checkUnclosedParentheses",
      settings.checkUnclosedParentheses,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "checkUnclosedBrackets",
      settings.checkUnclosedBrackets,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "customWordsColor",
      settings.customWordsColor,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "languageAndNumberColor",
      settings.languageAndNumberColor,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "unbalancedCharactersColor",
      settings.unbalancedCharactersColor,
      vscode.ConfigurationTarget.Global
    );

    // Removed separate notification
    // vscode.window.showInformationMessage("✓ บันทึกการตั้งค่าและรายการคำเรียบร้อยแล้ว");

    // ส่งคำสั่งให้ refresh การตรวจสอบ
    vscode.commands.executeCommand("ink-checker.refresh");
  }

  private _sendWordGroupsToWebview() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const wordGroups = config.get<string[]>("wordGroups", []);

    this._panel.webview.postMessage({
      command: "wordGroupsLoaded",
      wordGroups: wordGroups,
    });
  }

  private async _saveWordGroups(wordGroups: string[]) {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(
      "wordGroups",
      wordGroups,
      vscode.ConfigurationTarget.Global
    );

    console.log("Updated wordGroups:", wordGroups);
    // Removed separate notification
    // vscode.window.showInformationMessage("✓ บันทึกกลุ่มคำเรียบร้อยแล้ว");

    // ส่งคำสั่งให้ refresh การตรวจสอบ
    vscode.commands.executeCommand("ink-checker.refresh");
  }

  private async _saveAllData(message: any) {
    // Wait for all saves to complete
    await Promise.all([
      this._saveWords(message.words),
      this._saveSettings(message.settings),
      this._saveWordGroups(message.wordGroups)
    ]);

    // Show a notification that disappears after 0.5 seconds
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "✓ บันทึกข้อมูลทั้งหมดเรียบร้อยแล้ว",
        cancellable: false
      },
      async (progress) => {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    );
  }

  public dispose() {
    WordListPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _getWebviewContent(): string {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const toHex = (value: string, fallback: string) => {
      if (!value) return fallback;
      const trimmed = value.trim();
      if (trimmed.startsWith('#')) {
        let hex = trimmed.toUpperCase();
        if (/^#([0-9A-F]{3})$/i.test(hex)) {
          const r = hex[1];
          const g = hex[2];
          const b = hex[3];
          hex = ('#' + r + r + g + g + b + b).toUpperCase();
        }
        if (/^#([0-9A-F]{6})$/i.test(hex)) return hex;
      }
      const m = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (m) {
        const r = parseInt(m[1], 10);
        const g = parseInt(m[2], 10);
        const b = parseInt(m[3], 10);
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
      return fallback;
    };

    const initialCustomHex = toHex(
      config.get<string>("customWordsColor", "rgba(255, 229, 100, 0.6)"),
      "#FFE564"
    );
    const initialLangHex = toHex(
      config.get<string>("languageAndNumberColor", "rgba(173, 216, 230, 0.5)"),
      "#ADD8E6"
    );
    const initialUnbalancedHex = toHex(
      config.get<string>("unbalancedCharactersColor", "rgba(255, 100, 100, 0.4)"),
      "#FF6464"
    );

    return `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>จัดการรายการคำ</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }

        h1 {
            color: var(--vscode-editor-foreground);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        h2 {
            color: var(--vscode-editor-foreground);
            margin-top: 30px;
            margin-bottom: 15px;
            font-size: 18px;
        }

        .section {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .checkbox-group {
            margin-bottom: 15px;
        }

        .checkbox-group label {
            display: flex;
            align-items: center;
            cursor: pointer;
            padding: 8px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }

        .checkbox-group label:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .checkbox-group input[type="checkbox"] {
            margin-right: 10px;
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        .word-list-container {
            margin-top: 15px;
        }

        #wordList {
            width: 100%;
            min-height: 300px;
            padding: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 14px;
            resize: vertical;
        }

        #wordList::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .info-box {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }

        .info-box p {
            margin: 5px 0;
            line-height: 1.6;
        }

        .stats {
            margin-top: 10px;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }

        .color-group {
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .color-group label {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            padding: 8px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }

        .color-group label:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .color-group input[type="color"] {
            width: 40px;
            height: 30px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        /* Word Groups Styles */
        .word-group-entry {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 15px;
            transition: transform 0.1s, box-shadow 0.1s;
        }

        .word-group-entry:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .word-group-content {
            flex: 1;
        }

        .word-group-input {
            width: 100%;
            padding: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 14px;
            font-family: 'Segoe UI', sans-serif;
        }

        .word-group-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }

        .word-chip {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        .word-group-actions {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .btn-icon {
            background: none;
            border: none;
            cursor: pointer;
            padding: 5px;
            color: var(--vscode-foreground);
            opacity: 0.7;
            transition: opacity 0.2s;
            font-size: 16px;
        }

        .btn-icon:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
            border-radius: 4px;
        }

        .btn-delete {
            color: var(--vscode-errorForeground);
        }

    </style>
</head>
<body>
    <h1>🔍 จัดการรายการคำ - INK CHECKER</h1>

    <div class="info-box">
        <p><strong>วิธีใช้:</strong></p>
        <p>• ใส่คำที่ต้องการตรวจสอบทีละคำต่อบรรทัด</p>
        <p>• ระบบจะไฮไลต์คำเหล่านี้ในไฟล์ที่คุณเปิดอยู่</p>
        <p>• เลือกตัวเลือกด้านล่างเพื่อตรวจจับภาษาต่างประเทศ</p>
    </div>

    <div class="section">
        <h2>⚙️ ตัวเลือกการตรวจสอบ</h2>
        
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkEnglish">
                <span>ตรวจจับภาษาอังกฤษ (A-Z, a-z)</span>
            </label>
        </div>
        
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkNumbers">
                <span>ตรวจจับตัวเลข (0-9)</span>
            </label>
        </div>
        
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkForeignLanguages">
                <span>ตรวจจับภาษาต่างประเทศอื่นๆ (ทุกภาษาที่ไม่ใช่ภาษาไทยและอังกฤษ)</span>
            </label>
        </div>
    </div>

    <div class="section">
        <h2>⚖️ ตรวจสอบวงเล็บและเครื่องหมายคำพูด</h2>
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkUnclosedFancyQuotes">
                <span>ตรวจจับเครื่องหมาย “ ที่ยังไม่ปิด</span>
            </label>
        </div>
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkUnclosedDoubleQuotes">
                <span>ตรวจจับเครื่องหมาย " ที่ไม่ครบคู่</span>
            </label>
        </div>
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkUnclosedSingleQuotes">
                <span>ตรวจจับเครื่องหมาย ' ที่ไม่ครบคู่</span>
            </label>
        </div>
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkUnclosedParentheses">
                <span>ตรวจจับวงเล็บ ( ที่ยังไม่ปิด</span>
            </label>
        </div>
        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="checkUnclosedBrackets">
                <span>ตรวจจับวงเล็บ [ ที่ยังไม่ปิด</span>
            </label>
        </div>
    </div>

    <div class="section">
        <h2>🎨 ตั้งค่าสีไฮไลต์</h2>
        
        <div class="color-group">
            <label>
                <span>สีสำหรับคำในรายการ:</span>
                <input type="color" id="customWordsColor" value="${initialCustomHex}">
            </label>
        </div>
        
        <div class="color-group">
            <label>
                <span>สีสำหรับภาษา/ตัวเลข:</span>
                <input type="color" id="languageAndNumberColor" value="${initialLangHex}">
            </label>
        </div>
        
        <div class="color-group">
            <label>
                <span>สีสำหรับวงเล็บ/เครื่องหมาย:</span>
                <input type="color" id="unbalancedCharactersColor" value="${initialUnbalancedHex}">
            </label>
        </div>
    </div>

    <div class="section">
        <h2>📝 รายการคำที่ต้องการตรวจสอบ</h2>
        <div class="word-list-container">
            <textarea id="wordList" placeholder="ใส่คำที่ต้องการตรวจสอบทีละคำต่อบรรทัด...\n\nตัวอย่าง:\nนาย\nแก\nฉัน\nท่าน\nระดับ\nLV\n求鲜花"></textarea>
        </div>
        <div class="stats" id="stats">จำนวนคำ: 0</div>
    </div>

    <div class="section">
        <h2>🔗 กลุ่มคำที่สลับกันได้ (Word Groups)</h2>
        <div class="info-box">
            <p><strong>วิธีใช้:</strong></p>
            <p>• ใส่กลุ่มคำที่ความหมายเหมือนกันหรือใช้แทนกันได้ โดยคั่นด้วยเครื่องหมายจุลภาค (,)</p>
            <p>• เช่น: <code>ข้า, ฉัน, เธอ, คุณ</code></p>
            <p>• ระบบจะเสนอให้แทนที่ด้วยคำอื่นๆ ในกลุ่มเดียวกันโดยอัตโนมัติ</p>
        </div>
        
        <div id="wordGroupsContainer">
            <!-- จะถูกสร้างด้วย JavaScript -->
        </div>
        
        <div class="button-group">
            <button onclick="addWordGroupEntry()">➕ เพิ่มกลุ่มคำใหม่</button>
        </div>
    </div>

    <div class="button-group">
        <button onclick="saveAll()">💾 บันทึกทั้งหมด</button>
        <button class="secondary" onclick="resetToDefault()">🔄 คืนค่าเริ่มต้น</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // ตัวแปรสำหรับเก็บข้อมูล
        let wordGroupsData = [];

        // โหลดข้อมูลเมื่อเริ่มต้น
        window.addEventListener('load', () => {
            console.log('[Kunpeng] Loading data...');
            vscode.postMessage({ command: 'getWords' });
            vscode.postMessage({ command: 'getSettings' });
            vscode.postMessage({ command: 'getWordGroups' });
            updateStats();
        });

        // รับข้อความจาก Extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'wordsLoaded':
                    document.getElementById('wordList').value = message.words ? message.words.join('\\n') : '';
                    updateStats();
                    break;
                case 'settingsLoaded':
                    document.getElementById('checkEnglish').checked = message.settings.checkEnglish;
                    document.getElementById('checkNumbers').checked = message.settings.checkNumbers;
                    document.getElementById('checkForeignLanguages').checked = message.settings.checkForeignLanguages;
                    document.getElementById('checkUnclosedFancyQuotes').checked = message.settings.checkUnclosedFancyQuotes;
                    document.getElementById('checkUnclosedDoubleQuotes').checked = message.settings.checkUnclosedDoubleQuotes;
                    document.getElementById('checkUnclosedSingleQuotes').checked = message.settings.checkUnclosedSingleQuotes;
                    document.getElementById('checkUnclosedParentheses').checked = message.settings.checkUnclosedParentheses;
                    document.getElementById('checkUnclosedBrackets').checked = message.settings.checkUnclosedBrackets;
                    console.log('[Kunpeng] Settings loaded');
                    break;
                case 'wordGroupsLoaded':
                    console.log('[Kunpeng] Word groups loaded:', message.wordGroups);
                    wordGroupsData = message.wordGroups || [];
                    renderWordGroups();
                    break;
            }
        });

        // อัพเดทสถิติ
        const wordListTextarea = document.getElementById('wordList');
        wordListTextarea.addEventListener('input', updateStats);

        function updateStats() {
            const text = document.getElementById('wordList').value;
            const words = text.split('\\n').filter(w => w.trim() !== '');
            document.getElementById('stats').textContent = 'จำนวนคำ: ' + words.length;
        }

        function hexToRgba(hex, alpha = 0.6) {
            if (!hex.startsWith('#')) hex = '#' + hex;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(255, 229, 100, ' + alpha + ')';
            return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
        }

        function saveAll() {
            const text = document.getElementById('wordList').value;
            const words = text.split('\\n').map(w => w.trim()).filter(w => w !== '');

            const customWordsColor = hexToRgba(document.getElementById('customWordsColor').value, 0.6);
            const languageAndNumberColor = hexToRgba(document.getElementById('languageAndNumberColor').value, 0.5);
            const unbalancedCharactersColor = hexToRgba(document.getElementById('unbalancedCharactersColor').value, 0.4);

            const settings = {
                checkEnglish: document.getElementById('checkEnglish').checked,
                checkNumbers: document.getElementById('checkNumbers').checked,
                checkForeignLanguages: document.getElementById('checkForeignLanguages').checked,
                checkUnclosedFancyQuotes: document.getElementById('checkUnclosedFancyQuotes').checked,
                checkUnclosedDoubleQuotes: document.getElementById('checkUnclosedDoubleQuotes').checked,
                checkUnclosedSingleQuotes: document.getElementById('checkUnclosedSingleQuotes').checked,
                checkUnclosedParentheses: document.getElementById('checkUnclosedParentheses').checked,
                checkUnclosedBrackets: document.getElementById('checkUnclosedBrackets').checked,
                customWordsColor: customWordsColor,
                languageAndNumberColor: languageAndNumberColor,
                unbalancedCharactersColor: unbalancedCharactersColor
            };

            // Save word groups
            const groupInputs = document.querySelectorAll('.word-group-input');
            const newGroups = Array.from(groupInputs)
                .map(input => input.value.trim())
                .filter(val => val.length > 0);

            vscode.postMessage({ 
                command: 'saveAllData', 
                words: words, 
                settings: settings, 
                wordGroups: newGroups 
            });
        }

        function resetToDefault() {
            vscode.postMessage({ command: 'saveWords', words: undefined });
            vscode.postMessage({ command: 'getWords' });
        }

        // --- Word Groups Logic ---

        function renderWordGroups() {
            const container = document.getElementById('wordGroupsContainer');
            container.innerHTML = '';
            
            wordGroupsData.forEach((groupText, index) => {
                createWordGroupElement(groupText, index);
            });
        }

        function createWordGroupElement(groupText, index) {
            const container = document.getElementById('wordGroupsContainer');
            
            const entry = document.createElement('div');
            entry.className = 'word-group-entry';
            
            const content = document.createElement('div');
            content.className = 'word-group-content';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'word-group-input';
            input.value = groupText;
            input.placeholder = 'เช่น: ข้า, ฉัน, เธอ';
            
            // Update chips on input change
            input.addEventListener('input', () => updateChips(input, chipsContainer));
            
            const chipsContainer = document.createElement('div');
            chipsContainer.className = 'word-group-chips';
            
            content.appendChild(input);
            content.appendChild(chipsContainer);
            
            // Actions
            const actions = document.createElement('div');
            actions.className = 'word-group-actions';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon btn-delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'ลบกลุ่มคำนี้';
            deleteBtn.onclick = () => {
                entry.remove();
            };
            
            actions.appendChild(deleteBtn);
            
            entry.appendChild(content);
            entry.appendChild(actions);
            container.appendChild(entry);
            
            updateChips(input, chipsContainer);
        }

        function updateChips(input, container) {
            container.innerHTML = '';
            const text = input.value;
            const words = text.split(/[,،、]+/).map(w => w.trim()).filter(w => w.length > 0);
            
            words.forEach(word => {
                const chip = document.createElement('span');
                chip.className = 'word-chip';
                chip.textContent = word;
                container.appendChild(chip);
            });
        }

        function addWordGroupEntry() {
            createWordGroupElement('', -1);
        }

        window.addWordGroupEntry = addWordGroupEntry;
        window.saveAll = saveAll;
        window.resetToDefault = resetToDefault;

    </script>
</body>
</html>`;
  }
}
