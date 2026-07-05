# AI HR Interview Assistant

ระบบฝึกสัมภาษณ์งานสาย IT ด้วย AI พร้อมวิเคราะห์คำตอบและสรุปคะแนน

## Quick Start

### 1. สร้าง Gemini API Key

1. ไปที่ [Google AI Studio](https://aistudio.google.com/apikey)
2. ล็อกอินด้วยบัญชี Google
3. คลิก **Create API Key** → เลือก project
4. คัดลอก API Key ที่ได้ (ขึ้นต้นด้วย `AIza...`)

### 2. ตั้งค่า API Key

เปิดไฟล์ `.env` แล้วใส่ key:

```
GEMINI_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ **อย่า commit ไฟล์ `.env`** — ไฟล์นี้อยู่ใน `.gitignore` แล้ว

### 3. เริ่ม Server

```bash
node server.js
```

จากนั้นเปิด **http://localhost:3000** ในเบราว์เซอร์

> ❌ **ห้ามใช้ `live-server`** — จะไม่สามารถโหลด API Key ได้

### 4. เปลี่ยน API Key

แก้ไขไฟล์ `.env` แล้ว refresh หน้าเว็บ (ไม่ต้อง restart server)

## โครงสร้างไฟล์

```
demo-01/
├── .env            ← API Key (ไม่ commit)
├── .gitignore      ← ป้องกัน .env ไม่ให้ commit
├── server.js       ← Node.js server (port 3000)
├── index.html      ← หน้าเว็บหลัก
├── script.js       ← Logic ทั้งหมด
├── style.css       ← Styling
└── README.md       ← ไฟล์นี้
```