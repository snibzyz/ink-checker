import * as vscode from "vscode";
import { WordListPanel } from "./wordListPanel";

// ======================================================================
// ส่วนที่ 1: ตัวแปรสำหรับจัดการ Extension
// ======================================================================

let activeEditor = vscode.window.activeTextEditor;
let statusBarItem: vscode.StatusBarItem;
let customWordsDecorationType: vscode.TextEditorDecorationType;
let languageAndNumberDecorationType: vscode.TextEditorDecorationType;
let unbalancedCharsDecorationType: vscode.TextEditorDecorationType;
let timeout: NodeJS.Timeout | undefined = undefined;
const CONFIG_SECTION = "inkChecker";
const LEGACY_CONFIG_SECTION = "kunpengChecker";
const CONFIG_KEYS = [
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
] as const;
type ConfigKey = (typeof CONFIG_KEYS)[number];

// ======================================================================
// ส่วนที่ 2: ฟังก์ชันตรวจจับภาษาต่างประเทศ
// ======================================================================

/**
 * ตรวจสอบว่าเป็นตัวอักษรภาษาอังกฤษหรือไม่
 */
function isEnglishChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * ตรวจสอบว่าเป็นตัวเลขหรือไม่
 */
function isNumberChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

/**
 * ตรวจสอบว่าเป็นภาษาไทยหรือไม่
 */
function isThaiChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x0e00 && code <= 0x0e7f;
}

/**
 * ตรวจสอบว่าเป็นภาษาต่างประเทศอื่นๆ หรือไม่ (ตัวอักษรใดๆ ที่ไม่ใช่ไทยและอังกฤษ)
 */
function isForeignLanguageChar(char: string): boolean {
  // ใช้ Unicode property escapes (\p{L}) เพื่อตรวจสอบว่าเป็น "ตัวอักษร" ในภาษาใดๆ หรือไม่
  const isLetter = /\p{L}/u.test(char);

  // ถ้าไม่ใช่ตัวอักษร (เช่น ตัวเลข, สัญลักษณ์, เว้นวรรค) ให้ return false ทันที
  if (!isLetter) {
    return false;
  }

  // ถ้าเป็นตัวอักษร ให้ตรวจสอบว่าไม่ใช่ทั้งภาษาไทยและภาษาอังกฤษ
  return !isThaiChar(char) && !isEnglishChar(char);
}

/**
 * หาตำแหน่งของภาษาต่างประเทศที่ติดต่อกัน
 */
function findLanguageSequences(
  text: string,
  checkFunc: (char: string) => boolean
): Array<{ start: number; end: number; text: string }> {
  const sequences: Array<{ start: number; end: number; text: string }> = [];
  let inSequence = false;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isMatch = checkFunc(char);

    if (isMatch && !inSequence) {
      // เริ่มต้น sequence ใหม่
      start = i;
      inSequence = true;
    } else if (!isMatch && inSequence) {
      // จบ sequence
      sequences.push({
        start: start,
        end: i,
        text: text.substring(start, i),
      });
      inSequence = false;
    }
  }

  // ถ้ายังอยู่ใน sequence เมื่อจบไฟล์
  if (inSequence) {
    sequences.push({
      start: start,
      end: text.length,
      text: text.substring(start),
    });
  }

  return sequences;
}

// ======================================================================
// ส่วนที่ 3: ฟังก์ชันหลักสำหรับการตรวจสอบและไฮไลต์
// ======================================================================

/**
 * ฟังก์ชันหลักที่จะค้นหาและแสดงไฮไลต์
 */
function updateDecorations() {
  if (!activeEditor) {
    return;
  }

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const enabled = config.get<boolean>("enabled", true);

  if (!enabled) {
    activeEditor.setDecorations(customWordsDecorationType, []);
    activeEditor.setDecorations(languageAndNumberDecorationType, []);
    activeEditor.setDecorations(unbalancedCharsDecorationType, []);
    updateStatusBar(0);
    return;
  }

  const text = activeEditor.document.getText();
  const customWordsDecorations: vscode.DecorationOptions[] = [];
  const languageAndNumberDecorations: vscode.DecorationOptions[] = [];
  const unbalancedCharsDecorations: vscode.DecorationOptions[] = [];

  // 1. ตรวจสอบคำที่กำหนดเอง
  const customWords = config.get<string[]>("customWords", []);
  if (customWords.length > 0) {
    // Escape special regex characters
    const escapedWords = customWords.map((word) =>
      word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const regEx = new RegExp(escapedWords.join("|"), "g");

    let match;
    while ((match = regEx.exec(text))) {
      const startPos = activeEditor.document.positionAt(match.index);
      const endPos = activeEditor.document.positionAt(
        match.index + match[0].length
      );

      customWordsDecorations.push({
        range: new vscode.Range(startPos, endPos),
        hoverMessage: `ตรวจพบคำ: **${match[0]}**`,
      });
    }
  }

  // 2. ตรวจสอบภาษาอังกฤษ
  const checkEnglish = config.get<boolean>("checkEnglish", false);
  if (checkEnglish) {
    const sequences = findLanguageSequences(text, isEnglishChar);
    for (const seq of sequences) {
      const startPos = activeEditor.document.positionAt(seq.start);
      const endPos = activeEditor.document.positionAt(seq.end);

      languageAndNumberDecorations.push({
        range: new vscode.Range(startPos, endPos),
        hoverMessage: `ตรวจพบภาษาอังกฤษ: **${seq.text}**`,
      });
    }
  }

  // 3. ตรวจสอบตัวเลข
  const checkNumbers = config.get<boolean>("checkNumbers", false);
  if (checkNumbers) {
    const sequences = findLanguageSequences(text, isNumberChar);
    for (const seq of sequences) {
      const startPos = activeEditor.document.positionAt(seq.start);
      const endPos = activeEditor.document.positionAt(seq.end);

      languageAndNumberDecorations.push({
        range: new vscode.Range(startPos, endPos),
        hoverMessage: `ตรวจพบตัวเลข: **${seq.text}**`,
      });
    }
  }

  // 4. ตรวจสอบภาษาต่างประเทศอื่นๆ
  const checkForeignLanguages = config.get<boolean>(
    "checkForeignLanguages",
    false
  );
  if (checkForeignLanguages) {
    const sequences = findLanguageSequences(text, isForeignLanguageChar);
    for (const seq of sequences) {
      const startPos = activeEditor.document.positionAt(seq.start);
      const endPos = activeEditor.document.positionAt(seq.end);

      languageAndNumberDecorations.push({
        range: new vscode.Range(startPos, endPos),
        hoverMessage: `ตรวจพบภาษาต่างประเทศ: **${seq.text}**`,
      });
    }
  }

  // 5. ตรวจสอบเครื่องหมายและวงเล็บที่ไม่ปิด (Document-wide check)
  const checkFancy = config.get<boolean>("checkUnclosedFancyQuotes", true);
  const checkDouble = config.get<boolean>("checkUnclosedDoubleQuotes", false);
  const checkSingle = config.get<boolean>("checkUnclosedSingleQuotes", false);
  const checkParen = config.get<boolean>("checkUnclosedParentheses", false);
  const checkBracket = config.get<boolean>("checkUnclosedBrackets", false);

  if (checkFancy || checkDouble || checkSingle || checkParen || checkBracket) {
    const lineErrors = new Map<number, Set<string>>();

    const addErrorToLine = (index: number, message: string) => {
      if (!activeEditor || index < 0) {
        return;
      }
      const position = activeEditor.document.positionAt(index);
      const lineNum = position.line;
      if (!lineErrors.has(lineNum)) {
        lineErrors.set(lineNum, new Set());
      }
      lineErrors.get(lineNum)!.add(message);
    };

    // 5.1: Directional characters (stack-based check)
    const directionalPairs = [];
    if (checkFancy) {
      directionalPairs.push(["\u201C", "\u201D"]); // " and "
    }
    if (checkParen) {
      directionalPairs.push(["(", ")"]);
    }
    if (checkBracket) {
      directionalPairs.push(["[", "]"]);
    }

    if (directionalPairs.length > 0) {
      const openChars = new Map(directionalPairs.map((p) => [p[0], p[1]]));
      const closeChars = new Map(directionalPairs.map((p) => [p[1], p[0]]));
      const stack: { char: string; index: number }[] = [];
      const unmatchedIndices = new Set<number>();

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (openChars.has(char)) {
          stack.push({ char, index: i });
        } else if (closeChars.has(char)) {
          if (
            stack.length > 0 &&
            stack[stack.length - 1].char === closeChars.get(char)
          ) {
            stack.pop(); // Matched pair
          } else {
            unmatchedIndices.add(i); // Unmatched closer
          }
        }
      }

      stack.forEach((unclosed) => unmatchedIndices.add(unclosed.index)); // Unmatched openers

      unmatchedIndices.forEach((index) => {
        const char = text[index];
        const message = openChars.has(char)
          ? `ตรวจพบ ${char} ที่ยังไม่ปิดในเอกสาร`
          : `ตรวจพบ ${char} ที่ไม่มีตัวเปิดในเอกสาร`;
        addErrorToLine(index, message);
      });
    }

    // 5.2: Toggle-based check for straight quotes (better detection)
    const checkToggleBased = (
      char: string,
      openMsg: string,
      closeMsg: string
    ) => {
      const indices: number[] = [];
      for (
        let i = text.indexOf(char);
        i !== -1;
        i = text.indexOf(char, i + 1)
      ) {
        indices.push(i);
      }

      // Check if total count is odd (unbalanced)
      if (indices.length % 2 !== 0) {
        // The last quote is an unclosed opener
        const lastIndex = indices[indices.length - 1];
        addErrorToLine(lastIndex, openMsg);
      }
    };

    // checkFancy also includes straight double quotes
    if (checkDouble || checkFancy) {
      checkToggleBased(
        '"',
        'ตรวจพบเครื่องหมาย " ที่เปิดแต่ไม่ปิดในเอกสาร',
        'ตรวจพบเครื่องหมาย " ที่ปิดเกินในเอกสาร'
      );
    }
    if (checkSingle) {
      checkToggleBased(
        "'",
        "ตรวจพบเครื่องหมาย ' ที่เปิดแต่ไม่ปิดในเอกสาร",
        "ตรวจพบเครื่องหมาย ' ที่ปิดเกินในเอกสาร"
      );
    }

    // 5.3: Create decorations from the collected errors
    for (const [lineNum, messages] of lineErrors.entries()) {
      const line = activeEditor.document.lineAt(lineNum);
      unbalancedCharsDecorations.push({
        range: line.range,
        hoverMessage: [...messages].join("\\n"),
      });
    }
  }

  // แสดงไฮไลต์
  activeEditor.setDecorations(
    customWordsDecorationType,
    customWordsDecorations
  );
  activeEditor.setDecorations(
    languageAndNumberDecorationType,
    languageAndNumberDecorations
  );
  activeEditor.setDecorations(
    unbalancedCharsDecorationType,
    unbalancedCharsDecorations
  );

  // อัพเดท Status Bar
  const totalCount =
    customWordsDecorations.length +
    languageAndNumberDecorations.length +
    unbalancedCharsDecorations.length;
  updateStatusBar(totalCount);
}

/**
 * ฟังก์ชันช่วยหน่วงเวลา
 */
function triggerUpdateDecorations() {
  if (timeout) {
    clearTimeout(timeout);
    timeout = undefined;
  }
  timeout = setTimeout(updateDecorations, 500);
}

/**
 * อัพเดท Status Bar
 */
function updateStatusBar(count: number) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const enabled = config.get<boolean>("enabled", true);

  if (enabled) {
    statusBarItem.text = `$(search) INK: ${count} คำ`;
    statusBarItem.tooltip = `พบคำที่ตรวจสอบ ${count} คำ\nคลิกเพื่อเปิดจัดการรายการคำ`;
    statusBarItem.command = "ink-checker.openWordList";
  } else {
    statusBarItem.text = `$(eye-closed) INK: ปิด`;
    statusBarItem.tooltip = "การตรวจสอบถูกปิด\nคลิกเพื่อเปิด";
    statusBarItem.command = "ink-checker.toggleChecker";
  }
  statusBarItem.show();
}

/**
 * สร้าง decoration type ใหม่ตามสีที่กำหนด
 */
function createDecorationTypes() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  // Normalize config colors: accept either rgba() or #RRGGBB
  const toRgba = (value: string | undefined, alphaFallback: number) => {
    if (!value) {
      return `rgba(255, 229, 100, ${alphaFallback})`;
    }
    const trimmed = value.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.replace('#', '');
      const isShort = hex.length === 3;
      const r = parseInt(isShort ? hex[0] + hex[0] : hex.slice(0, 2), 16);
      const g = parseInt(isShort ? hex[1] + hex[1] : hex.slice(2, 4), 16);
      const b = parseInt(isShort ? hex[2] + hex[2] : hex.slice(4, 6), 16);
      const a = alphaFallback;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return trimmed; // assume already rgba()
  };

  const customWordsColor = toRgba(
    config.get<string>("customWordsColor", "rgba(255, 229, 100, 0.6)"),
    0.6
  );
  const langNumColor = toRgba(
    config.get<string>("languageAndNumberColor", "rgba(173, 216, 230, 0.5)"),
    0.5
  );
  const unbalancedColor = toRgba(
    config.get<string>(
    "unbalancedCharactersColor",
    "rgba(255, 100, 100, 0.4)"
    ),
    0.4
  );

  console.log("[Kunpeng] Creating decorations with colors:", {
    customWordsColor,
    langNumColor,
    unbalancedColor,
  });

  if (customWordsDecorationType) {
    customWordsDecorationType.dispose();
  }
  customWordsDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: customWordsColor,
    borderRadius: "2px",
  });

  if (languageAndNumberDecorationType) {
    languageAndNumberDecorationType.dispose();
  }
  languageAndNumberDecorationType =
    vscode.window.createTextEditorDecorationType({
      backgroundColor: langNumColor,
      borderRadius: "2px",
    });

  if (unbalancedCharsDecorationType) {
    unbalancedCharsDecorationType.dispose();
  }
  unbalancedCharsDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: unbalancedColor,
    isWholeLine: true
  });
}

/**
 * Build a word map from word groups.
 * Input: ["A, B, C", "X, Y"]
 * Output: { "A": ["B", "C"], "B": ["A", "C"], "C": ["A", "B"], "X": ["Y"], "Y": ["X"] }
 */
function buildWordMap(wordGroups: string[]): Record<string, string[]> {
  const wordMap: Record<string, string[]> = {};

  if (!wordGroups || !Array.isArray(wordGroups)) {
    return wordMap;
  }

  wordGroups.forEach((groupStr) => {
    // Split by common separators (comma, chinese comma, etc)
    const words = groupStr.split(/[,،、]+/).map((w) => w.trim()).filter((w) => w.length > 0);
    
    if (words.length < 2) return; // Need at least 2 words to swap

    words.forEach((word) => {
      // For each word, the options are all OTHER words in the same group
      const options = words.filter((w) => w !== word);
      
      // If word already exists in map (from another group?), merge options
      // But typically a word should only belong to one group for clarity. 
      // If it's in multiple, we just union the options.
      if (wordMap[word]) {
        const existing = new Set(wordMap[word]);
        options.forEach(o => existing.add(o));
        wordMap[word] = Array.from(existing);
      } else {
        wordMap[word] = options;
      }
    });
  });

  return wordMap;
}

async function migrateLegacyConfigValue(
  key: ConfigKey,
  target: vscode.ConfigurationTarget,
  scopeUri?: vscode.Uri
): Promise<boolean> {
  const legacyConfig = vscode.workspace.getConfiguration(
    LEGACY_CONFIG_SECTION,
    scopeUri
  );
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION, scopeUri);
  const legacyInspect = legacyConfig.inspect(key);
  const currentInspect = config.inspect(key);

  let legacyValue: unknown;
  let currentValue: unknown;

  switch (target) {
    case vscode.ConfigurationTarget.Global:
      legacyValue = legacyInspect?.globalValue;
      currentValue = currentInspect?.globalValue;
      break;
    case vscode.ConfigurationTarget.Workspace:
      legacyValue = legacyInspect?.workspaceValue;
      currentValue = currentInspect?.workspaceValue;
      break;
    case vscode.ConfigurationTarget.WorkspaceFolder:
      legacyValue = legacyInspect?.workspaceFolderValue;
      currentValue = currentInspect?.workspaceFolderValue;
      break;
  }

  if (legacyValue === undefined) {
    return false;
  }

  if (currentValue === undefined) {
    await config.update(key, legacyValue, target);
  }

  await legacyConfig.update(key, undefined, target);
  return true;
}

async function migrateLegacySettings() {
  let migrated = false;

  for (const key of CONFIG_KEYS) {
    migrated =
      (await migrateLegacyConfigValue(key, vscode.ConfigurationTarget.Global)) ||
      migrated;
    migrated =
      (await migrateLegacyConfigValue(
        key,
        vscode.ConfigurationTarget.Workspace
      )) || migrated;
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    for (const key of CONFIG_KEYS) {
      migrated =
        (await migrateLegacyConfigValue(
          key,
          vscode.ConfigurationTarget.WorkspaceFolder,
          folder.uri
        )) || migrated;
    }
  }

  if (migrated) {
    void vscode.window.showInformationMessage(
      "ย้ายการตั้งค่าจาก kunpengChecker ไปเป็น inkChecker เรียบร้อยแล้ว"
    );
  }
}

// ======================================================================
// ส่วนที่ 4: Activation และ Commands
// ======================================================================

export async function activate(context: vscode.ExtensionContext) {
  console.log("INK CHECKER is now active!");
  await migrateLegacySettings();

  // สร้าง Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(statusBarItem);

  // สร้าง Decoration Type
  createDecorationTypes();

  // ลงทะเบียน Completion Provider สำหรับ " และ '
  const quoteCompletionProvider =
    vscode.languages.registerCompletionItemProvider(
      { scheme: "file", pattern: "**/*" },
      {
        provideCompletionItems(
          document: vscode.TextDocument,
          position: vscode.Position
        ) {
          const linePrefix = document
            .lineAt(position)
            .text.substring(0, position.character);

          const items: vscode.CompletionItem[] = [];

          // เช็คว่ามี " ตรงหน้า cursor หรือไม่
          if (linePrefix.endsWith('"')) {
            // Range ของ " ที่เพิ่งพิมพ์ (จะแทนที่ตัวนี้)
            const replaceRange = new vscode.Range(
              position.translate(0, -1),
              position
            );

            // " (fancy open)
            const fancyOpen = new vscode.CompletionItem(
              '" (เปิด)',
              vscode.CompletionItemKind.Text
            );
            fancyOpen.insertText = "\u201C"; // "
            fancyOpen.range = replaceRange;
            fancyOpen.detail = "เครื่องหมายคำพูดแบบเว้า (เปิด)";
            fancyOpen.documentation = new vscode.MarkdownString(
              'ใช้สำหรับเปิดคำพูด เช่น "สวัสดี"'
            );
            fancyOpen.sortText = "1"; // แสดงก่อน
            items.push(fancyOpen);

            // " (fancy close)
            const fancyClose = new vscode.CompletionItem(
              '" (ปิด)',
              vscode.CompletionItemKind.Text
            );
            fancyClose.insertText = "\u201D"; // "
            fancyClose.range = replaceRange;
            fancyClose.detail = "เครื่องหมายคำพูดแบบเว้า (ปิด)";
            fancyClose.documentation = new vscode.MarkdownString(
              'ใช้สำหรับปิดคำพูด เช่น "สวัสดี"'
            );
            fancyClose.sortText = "2";
            items.push(fancyClose);

            // " (straight)
            const straight = new vscode.CompletionItem(
              '" (ตรง)',
              vscode.CompletionItemKind.Text
            );
            straight.insertText = '"';
            straight.range = replaceRange;
            straight.detail = "เครื่องหมายคำพูดแบบตรง";
            straight.documentation = new vscode.MarkdownString(
              'เครื่องหมายคำพูดปกติ "'
            );
            straight.sortText = "3";
            items.push(straight);
          }

          // เช็คว่ามี ' ตรงหน้า cursor หรือไม่
          if (linePrefix.endsWith("'")) {
            // Range ของ ' ที่เพิ่งพิมพ์ (จะแทนที่ตัวนี้)
            const replaceRange = new vscode.Range(
              position.translate(0, -1),
              position
            );

            // ' (fancy open)
            const fancyOpen = new vscode.CompletionItem(
              "' (เปิด)",
              vscode.CompletionItemKind.Text
            );
            fancyOpen.insertText = "\u2018"; // '
            fancyOpen.range = replaceRange;
            fancyOpen.detail = "เครื่องหมายคำพูดเดี่ยวแบบเว้า (เปิด)";
            fancyOpen.documentation = new vscode.MarkdownString(
              "ใช้สำหรับเปิดคำพูด เช่น 'สวัสดี'"
            );
            fancyOpen.sortText = "1";
            items.push(fancyOpen);

            // ' (fancy close)
            const fancyClose = new vscode.CompletionItem(
              "' (ปิด)",
              vscode.CompletionItemKind.Text
            );
            fancyClose.insertText = "\u2019"; // '
            fancyClose.range = replaceRange;
            fancyClose.detail = "เครื่องหมายคำพูดเดี่ยวแบบเว้า (ปิด)";
            fancyClose.documentation = new vscode.MarkdownString(
              "ใช้สำหรับปิดคำพูด เช่น 'สวัสดี'"
            );
            fancyClose.sortText = "2";
            items.push(fancyClose);

            // ' (straight)
            const straight = new vscode.CompletionItem(
              "' (ตรง)",
              vscode.CompletionItemKind.Text
            );
            straight.insertText = "'";
            straight.range = replaceRange;
            straight.detail = "เครื่องหมายคำพูดเดี่ยวแบบตรง";
            straight.documentation = new vscode.MarkdownString(
              "เครื่องหมายคำพูดเดี่ยวปกติ '"
            );
            straight.sortText = "3";
            items.push(straight);
          }

          return items.length > 0 ? items : undefined;
        },
      },
      '"',
      "'" // trigger characters
    );

  context.subscriptions.push(quoteCompletionProvider);

  // ลงทะเบียน Hover Provider สำหรับ Autocorrect
  const autocorrectHoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file", pattern: "**/*" },
    {
      provideHover(document, position, token) {
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        const wordGroups = config.get<string[]>("wordGroups", []);
        const wordMap = buildWordMap(wordGroups);

        // หาคำที่ cursor อยู่ - ใช้ regex เพื่อหาคำเดี่ยว
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // หาคำเดี่ยวรอบๆ cursor โดยใช้ regex
        const wordRegex = /[\u0E00-\u0E7F]+|[""''""''""]/g; // ตัวอักษรไทย + เครื่องหมายคำพูด
        let match;
        let wordRange: vscode.Range | null = null;
        let word = "";

        while ((match = wordRegex.exec(lineText)) !== null) {
          const start = match.index;
          const end = match.index + match[0].length;

          // เช็คว่า cursor อยู่ในคำนี้หรือไม่
          if (position.character >= start && position.character <= end) {
            wordRange = new vscode.Range(
              position.line,
              start,
              position.line,
              end
            );
            word = match[0];
            break;
          }
        }

        if (!wordRange || !word) {
          return null;
        }

        // ถ้าคำยาวเกินไป ให้หาคำสั้นๆ ที่มีใน wordMap
        if (word.length > 3 && !wordMap[word]) {
          // หาคำสั้นๆ ที่มีใน wordMap
          const knownWords = Object.keys(wordMap);
          for (const key of knownWords) {
            const regex = new RegExp(key, "g");
            let keyMatch;

            while ((keyMatch = regex.exec(word)) !== null) {
              const keyStart: number =
                wordRange.start.character + keyMatch.index;
              const keyEnd: number = keyStart + key.length;

              // เช็คว่า cursor อยู่ในคำนี้หรือไม่
              if (
                position.character >= keyStart &&
                position.character <= keyEnd
              ) {
                wordRange = new vscode.Range(
                  position.line,
                  keyStart,
                  position.line,
                  keyEnd
                );
                word = key;
                break;
              }
            }

            if (word === key) break; // ถ้าเจอแล้วหยุดค้นหา
          }
        }

        // เช็คว่าคำนี้มี replacements หรือไม่
        if (wordMap[word] && wordMap[word].length > 0) {
          const options = wordMap[word];

          // สร้าง markdown content สำหรับ hover
          const markdown = new vscode.MarkdownString();
          markdown.appendMarkdown(`**เปลี่ยนคำ "${word}" เป็น:**\n\n`);

          options.forEach((option, index) => {
              // สร้าง command link ที่คลิกได้
              const commandUri = vscode.Uri.parse(
                `command:ink-checker.replaceWord?${encodeURIComponent(
                  JSON.stringify({
                    word: word,
                    replacement: option,
                    range: {
                    start: wordRange!.start,
                    end: wordRange!.end,
                    },
                  })
                )}`
              );
              markdown.appendMarkdown(
                `[${index + 1}. **${option}**](${commandUri})  \n`
              );
          });

          markdown.appendMarkdown(`\n*คลิกที่ตัวเลือกเพื่อแทนที่คำ*`);
          markdown.isTrusted = true;

          return new vscode.Hover(markdown, wordRange);
        }

        return null;
      },
    }
  );

  context.subscriptions.push(autocorrectHoverProvider);

  // ลงทะเบียน Code Action Provider สำหรับการแทนคำ
  const autocorrectCodeActionProvider =
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file", pattern: "**/*" },
      {
        provideCodeActions(document, range, context, token) {
          const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
          const wordGroups = config.get<string[]>("wordGroups", []);
          const wordMap = buildWordMap(wordGroups);

          const actions: vscode.CodeAction[] = [];

          // ตรวจสอบแต่ละ diagnostic
          context.diagnostics.forEach((diagnostic) => {
            if (diagnostic.message.includes("ตรวจพบคำ:")) {
              const word = diagnostic.message
                .replace("ตรวจพบคำ: ", "")
                .replace(/\*\*/g, "");

              if (wordMap[word] && wordMap[word].length > 0) {
                // สร้าง action สำหรับแต่ละตัวเลือก
                wordMap[word].forEach((option) => {
                    const action = new vscode.CodeAction(
                      `แทนที่ด้วย "${option}"`,
                      vscode.CodeActionKind.QuickFix
                    );

                    action.edit = new vscode.WorkspaceEdit();
                    action.edit.replace(document.uri, diagnostic.range, option);

                    action.diagnostics = [diagnostic];
                    actions.push(action);
                });
              }
            }
          });

          return actions;
        },
      }
    );

  context.subscriptions.push(autocorrectCodeActionProvider);

  // คำสั่งสำหรับแทนที่คำจาก hover
  const replaceWordCommand = vscode.commands.registerCommand(
    "ink-checker.replaceWord",
    async (args: any) => {
      if (!activeEditor) {
        return;
      }

      try {
        const { word, replacement, range } = args;
        const startPos = new vscode.Position(
          range.start.line,
          range.start.character
        );
        const endPos = new vscode.Position(range.end.line, range.end.character);
        const replaceRange = new vscode.Range(startPos, endPos);

        await activeEditor.edit((editBuilder) => {
          editBuilder.replace(replaceRange, replacement);
        });

        console.log(`[Kunpeng] Replaced "${word}" with "${replacement}"`);
      } catch (error) {
        console.error("[Kunpeng] Error replacing word:", error);
        vscode.window.showErrorMessage("เกิดข้อผิดพลาดในการแทนที่คำ");
      }
    }
  );

  context.subscriptions.push(replaceWordCommand);

  // คำสั่งเปิดหน้าต่างจัดการคำ
  const openWordListCommand = vscode.commands.registerCommand(
    "ink-checker.openWordList",
    () => {
      WordListPanel.createOrShow(context.extensionUri);
    }
  );

  const openSettingsCommand = vscode.commands.registerCommand(
    "ink-checker.openSettings",
    async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        `@ext:${context.extension.id}`
      );
    }
  );

  // คำสั่งเปิด/ปิดการตรวจสอบ
  const toggleCheckerCommand = vscode.commands.registerCommand(
    "ink-checker.toggleChecker",
    async () => {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const currentState = config.get<boolean>("enabled", true);
      await config.update(
        "enabled",
        !currentState,
        vscode.ConfigurationTarget.Global
      );

      const newState = !currentState;
      vscode.window.showInformationMessage(
        newState ? "✓ เปิดการตรวจสอบแล้ว" : "✗ ปิดการตรวจสอบแล้ว"
      );
    }
  );

  // คำสั่ง refresh (เรียกจาก WordListPanel)
  const refreshCommand = vscode.commands.registerCommand(
    "ink-checker.refresh",
    () => {
      createDecorationTypes();
      triggerUpdateDecorations();
    }
  );

  context.subscriptions.push(
    openWordListCommand,
    openSettingsCommand,
    toggleCheckerCommand,
    refreshCommand
  );

  // เริ่มต้นการทำงาน
  if (activeEditor) {
    triggerUpdateDecorations();
  }

  // Event Listener: เปลี่ยนไฟล์
  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      activeEditor = editor;
      if (editor) {
        triggerUpdateDecorations();
      }
    },
    null,
    context.subscriptions
  );

  // Event Listener: แก้ไขข้อความ
  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (activeEditor && event.document === activeEditor.document) {
        triggerUpdateDecorations();
      }
    },
    null,
    context.subscriptions
  );

  // Event Listener: เปลี่ยนการตั้งค่า
  vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (
        event.affectsConfiguration(CONFIG_SECTION) ||
        event.affectsConfiguration(LEGACY_CONFIG_SECTION)
      ) {
        createDecorationTypes();
        triggerUpdateDecorations();
      }
    },
    null,
    context.subscriptions
  );
}

export function deactivate() {
  if (customWordsDecorationType) {
    customWordsDecorationType.dispose();
  }
  if (languageAndNumberDecorationType) {
    languageAndNumberDecorationType.dispose();
  }
  if (unbalancedCharsDecorationType) {
    unbalancedCharsDecorationType.dispose();
  }
}
