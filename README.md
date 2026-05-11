# INKCHECKER

ปลั๊กอิน VS Code สำหรับ **นักเขียนไทย** — ช่วยตรวจคำซ้ำ คำต้องห้าม สัญลักษณ์ค้าง และจัดหน้ากระดาษไฟล์ `.txt` / `.md` ให้อ่านสบายตาด้วย **TH Sarabun**

---

## ทำอะไรได้บ้าง

### ตรวจสอบงานเขียน
- ไฮไลต์คำที่คุณกำหนดเอง (เช่น คำซ้ำที่ใช้บ่อย, คำต้องห้าม)
- ตรวจ **ภาษาอังกฤษ / ตัวเลข / ภาษาต่างประเทศ** ที่ปนมาในข้อความไทย
- ตรวจ **อัญประกาศ `"..."` `'...'` วงเล็บ `()` `[]`** ที่เปิดแล้วลืมปิด
- คลิกขวาคำ → สลับเป็นคำในกลุ่มเดียวกันได้ทันที (เช่น `ข้า ↔ ฉัน ↔ เจ้า`)

### จัดหน้ากระดาษ (เฉพาะ `.txt` และ `.md`)
- ฟอนต์ **TH Sarabun** ขนาด ระยะห่างบรรทัด ย่อหน้า — แบบ Word
- **ย่อหน้าทุกบรรทัด** ในย่อหน้าเดียวกัน (ไม่ใช่แค่บรรทัดแรก)
- **ตัดบรรทัดที่ความกว้างคงที่** — ไม่ลากยาวเต็มจอจนเมื่อยตา + ไม่ตัดกลางคำไทย
- **Preset 1 คลิก:** TH Sarabun 14 / 16 / 18 / 20
- เปิด/ปิดได้ทุกเมื่อ — ปิดแล้ว ค่าเดิมของคุณกลับมา (มี snapshot สำรองให้)

### ใช้งานง่าย
- **หน้าตั้งค่าเดียวจบ** มี sidebar นำทาง (ภาพรวม / ตรวจสอบคำ / รายการคำ / กลุ่มคำสลับ / หน้ากระดาษ / สีไฮไลต์ / ขั้นสูง)
- **Import / Export** การตั้งค่าเป็น JSON — ย้ายเครื่อง / แชร์กับเพื่อนได้

---

## ติดตั้ง

**VS Code Marketplace** (แนะนำสำหรับ VS Code ปกติ)
```
code --install-extension kunpeng-dev.kunpeng-checker
```

**Open VSX** (สำหรับ Cursor, VSCodium, Windsurf ฯลฯ)
```
code --install-extension inkrealm.ink-checker
```

---

## เริ่มใช้งาน

1. ติดตั้งเสร็จ → มองที่ **มุมขวาล่าง** ของ VS Code → เจอปุ่ม `$(edit) INK: N คำ`
2. **คลิก** → หน้าตั้งค่าหลักเปิดขึ้นมา → ตั้งทุกอย่างได้จากที่เดียว
3. ลองเลือก preset **TH Sarabun 16** ในแถบ "หน้ากระดาษ" เพื่อเริ่มแบบเร็ว

**ทางลัด:** `Ctrl+Alt+I` (macOS: `Cmd+Alt+I`) → เปิดหน้าตั้งค่าตรงไปที่แท็บ "รายการคำ"

---

## ปัญหาที่พบบ่อย

### กด command แล้วขึ้น `command 'ink-checker.X' not found` + ไม่เห็น icon ที่ status bar
→ มักเป็นเพราะ `settings.json` ของคุณมี **syntax error** (ลูกน้ำลอย, วงเล็บไม่ปิด, key ซ้ำ) — VS Code reject ทุกการเขียน config ทำให้ extension start ไม่สำเร็จ

**วิธีแก้:**
1. `Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`
2. แก้ syntax (VS Code จะขีดเส้นแดงให้ดู)
3. `Ctrl+Shift+P` → `Developer: Reload Window`

ตั้งแต่ **v1.0.3** เป็นต้นไป extension จะไม่ตายเงียบอีก — มีแจ้งเตือนพร้อมปุ่มลัด "เปิด settings.json" / "Reload Window" ให้

### ปิดจัดหน้ากระดาษแล้วฟอนต์ไม่กลับ
→ อัปเดตเป็น **v1.0.2** ขึ้นไป — มี migration เคลียร์ snapshot ที่ปนเปื้อนจากเวอร์ชันเก่าให้อัตโนมัติครั้งเดียว

### คำไทยถูกตัดกลางคำเวลา wrap
→ อัปเดตเป็น **v1.0.2** ขึ้นไป — ตั้ง `editor.wrappingStrategy: "advanced"` ให้แล้ว เคารพ grapheme cluster ของภาษาไทย (เช่น "ครั้ง" ไม่ถูกแยกพยัญชนะกับสระ)

---

## คำสั่งทั้งหมด (Command Palette: `Ctrl+Shift+P`)

- `INK CHECKER: เปิดหน้าตั้งค่า`
- `INK CHECKER: เปิดจัดการรายการคำ`
- `INK CHECKER: เปิดหน้าจัดหน้ากระดาษ`
- `INK CHECKER: เปิด/ปิดการตรวจสอบ`
- `INK CHECKER: เปิด/ปิดการจัดหน้ากระดาษ`
- `INK CHECKER: เมนูจัดหน้ากระดาษแบบเร็ว (QuickPick)`
- `INK CHECKER: ใช้ Preset หน้ากระดาษ`
- `INK CHECKER: รีเซ็ตการจัดหน้ากระดาษ`

---

## สำหรับนักพัฒนา

```bash
npm install
npm run compile
```

กด `F5` ใน VS Code → Extension Development Host

รายละเอียดการ publish แบบ dual (Marketplace + Open VSX) อยู่ใน [`.claude/CLAUDE.md`](.claude/CLAUDE.md)

---

## License

MIT — ดู [`LICENSE.md`](LICENSE.md)

[Repository on GitHub](https://github.com/snibzyz/ink-checker)
