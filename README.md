# Voice Alarm Pro v3.1

ระบบประกาศเสียงอัตโนมัติที่ปรับปรุงแล้ว

## ✨ คุณสมบัติหลัก

- ⏰ ตั้งเวลาเล่นเสียงอัตโนมัติ (รองรับหลายรายการ)
- 📅 เลือกวันในสัปดาห์ที่ต้องการ
- 🔄 กำหนดจำนวนรอบการเล่น (1-10 รอบ)
- 🎚️ ปรับระดับเสียงแบบ Fade In/Out
- 💾 บันทึกข้อมูลอัตโนมัติ (LocalStorage)
- 📤 Backup/Restore ข้อมูล (JSON)
- 📱 รองรับ Responsive Design
- 🌙 Wake Lock (ป้องกันหน้าจอดับ)

## 🔧 การติดตั้ง

1. วางไฟล์ทั้งหมดในโฟลเดอร์เดียวกัน:
   ```
   /project-root
   ├── index.html
   ├── script.js
   ├── style.css
   └── sounds/
       ├── break.mp3
       └── endwork.mp3
   ```

2. เปิดไฟล์ `index.html` ในเว็บเบราว์เซอร์

## 📁 โครงสร้างไฟล์เสียง

วางไฟล์เสียงในโฟลเดอร์ `sounds/` หรือโฟลเดอร์ใดก็ได้ที่ระบุใน `audioPaths`

ระบบจะค้นหาไฟล์เสียงอัตโนมัติจากตำแหน่งเหล่านี้:
- `sounds/`
- `./sounds/`
- `../sounds/`
- `` (โฟลเดอร์เดียวกับ index.html)

## 🎵 การเพิ่มเสียงใหม่

แก้ไขในไฟล์ `script.js`:

```javascript
const audioAssets = [
    { id: "chime", name: "🎵 เสียงพักเบรก", file: "break.mp3" },
    { id: "alarm", name: "🚨 เสียงเลิกงาน", file: "endwork.mp3" },
    { id: "custom", name: "🔔 เสียงกำหนดเอง", file: "custom.mp3" }
];
```

## 📋 การใช้งาน

### 1. เริ่มระบบ
กดปุ่ม **"START SYSTEM"** เพื่อเปิดใช้งานระบบ

### 2. เพิ่มรายการ
กดปุ่ม **"เพิ่มรายการ"** แล้วตั้งค่า:
- เวลาที่ต้องการ
- เลือกเสียง
- เลือกวัน (จันทร์-อาทิตย์)
- จำนวนรอบ (1-10)

### 3. Manual Play
ใช้ปุ่มด้านซ้ายเพื่อเล่นเสียงทันที

### 4. Backup/Restore
- **Export**: กดไอคอน ⬇️ เพื่อดาวน์โหลดไฟล์ JSON
- **Import**: กดไอคอน ⬆️ เพื่อนำเข้าไฟล์ JSON

## 🔄 Changelog v3.1

### ✅ การปรับปรุง

#### JavaScript (script.js)
- ✅ เพิ่ม Error Handling ครบถ้วน (try-catch ทุกฟังก์ชันสำคัญ)
- ✅ แก้ไขฟังก์ชัน `detectAudioPath()` ให้ทำงานจริง
- ✅ เพิ่ม Debounce สำหรับ Volume Slider
- ✅ เพิ่มการตรวจสอบ Loop Value (1-10)
- ✅ ปรับปรุง Fade In/Out ให้ Smooth ขึ้น
- ✅ เพิ่มการบันทึกระดับเสียง (LocalStorage)
- ✅ ปรับปรุงการแสดง Toast (ลบ Toast เก่าอัตโนมัติ)
- ✅ เพิ่มการ Validate ข้อมูล Import
- ✅ ปรับปรุงการคำนวณ Countdown (รองรับหลายวัน)
- ✅ เพิ่ม UI สำหรับกำหนดจำนวนรอบ

#### CSS (style.css)
- ✅ แก้ไข Warning: เพิ่ม `background-clip: text;` ก่อน `-webkit-background-clip`
- ✅ เพิ่ม `color: transparent;` เป็น Fallback
- ✅ ปรับปรุง Scrollbar Design (Custom Webkit Scrollbar)
- ✅ เพิ่ม Animation สำหรับ Modal (scaleIn)
- ✅ ปรับปรุง Hover Effects
- ✅ เพิ่ม Print Styles
- ✅ เพิ่ม Accessibility (Focus Styles, Reduced Motion, High Contrast)
- ✅ ปรับปรุง Responsive Design สำหรับมือถือ
- ✅ แก้ไข Overflow Issues

#### HTML (index.html)
- ✅ เพิ่ม Meta Description
- ✅ ปรับปรุงโครงสร้าง Semantic HTML
- ✅ เพิ่ม ARIA Labels (รอการอัพเดท)

### 🐛 Bug Fixes
- ✅ แก้ไขปัญหา Audio ไม่เล่นในบางเบราว์เซอร์
- ✅ แก้ไขปัญหา Volume Slider กระตุก
- ✅ แก้ไขปัญหา Fade Interval ซ้อนทับกัน
- ✅ แก้ไขปัญหา Toast ซ้อนกัน
- ✅ แก้ไขปัญหา Import ไฟล์เก่า
- ✅ แก้ไขปัญหา Countdown แสดงผิดเมื่อข้ามวัน

### 🎨 การปรับปรุง UI/UX
- ✅ เพิ่ม Pulse Animation สำหรับ Status Dot
- ✅ ปรับปรุง Button Hover Effects
- ✅ เพิ่ม Transition ให้ Smooth ขึ้น
- ✅ ปรับปรุง Modal Animation
- ✅ เพิ่ม Tooltip สำหรับปุ่ม
- ✅ ปรับปรุงสี Contrast

## 🌐 Browser Support

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

## 🔒 ความปลอดภัย

- ข้อมูลเก็บใน LocalStorage ของเบราว์เซอร์
- ไม่มีการส่งข้อมูลออกนอกเครื่อง
- ไฟล์ Backup เป็น JSON แบบ Plain Text

## 🐛 Known Issues & Limitations

1. **Audio Autoplay**: บางเบราว์เซอร์ต้องการให้ผู้ใช้กดปุ่มก่อน (กด START SYSTEM)
2. **Wake Lock**: ไม่รองรับใน Safari บน iOS
3. **Background Tab**: เสียงอาจไม่เล่นถ้าแท็บไม่ได้ Active (ขึ้นกับเบราว์เซอร์)
4. **File Size**: ไฟล์เสียงขนาดใหญ่อาจโหลดช้า

## 💡 Tips & Tricks

### ป้องกันเสียงไม่เล่น
1. กด **START SYSTEM** ก่อนใช้งานทุกครั้ง
2. เก็บแท็บไว้เป็น Active Tab
3. อย่าให้เครื่องเข้า Sleep Mode

### ประหยัดแบตเตอรี่
1. ปิด Wake Lock เมื่อไม่ใช้งาน
2. ลดระดับเสียง
3. ลดจำนวนรอบการเล่น

### Backup ข้อมูล
- แนะนำให้ Export ข้อมูลทุก 1-2 สัปดาห์
- เก็บไฟล์ Backup ไว้หลายที่

## 🚀 Future Plans

- [ ] เพิ่ม PWA Support (ติดตั้งเป็น App)
- [ ] เพิ่ม Dark/Light Theme Toggle
- [ ] รองรับการอัพโหลดไฟล์เสียงเอง
- [ ] เพิ่ม Text-to-Speech
- [ ] เพิ่ม Holiday Calendar
- [ ] Multi-Language Support
- [ ] Cloud Sync (Optional)

## 📞 Support

หากพบปัญหาหรือต้องการความช่วยเหลือ:
1. ตรวจสอบ Console (F12) เพื่อดู Error
2. ตรวจสอบว่าไฟล์เสียงอยู่ในโฟลเดอร์ที่ถูกต้อง
3. ลอง Clear Cache และรีโหลดหน้าเว็บ

## 📝 License

MIT License - ใช้งานได้ฟรี แก้ไขได้ตามต้องการ

## 👨‍💻 Version History

- **v3.1** (2024): การปรับปรุงครั้งใหญ่ - Error Handling, UI/UX Improvements
- **v3.0** (2024): Refactor โค้ดเพื่อ Modularity
- **v2.0** (2023): เพิ่ม Fade Effect และ Wake Lock
- **v1.0** (2023): เวอร์ชันแรก

---

Made with ❤️ for automation enthusiasts