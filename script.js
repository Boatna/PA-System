const audioAssets = [
    { id: "chime", name: "🎵 เสียงพักเบรก", file: "sounds/พักเบลกนะ.mp3" },
    { id: "alarm", name: "🚨 เสียงเลิกงาน", file: "sounds/เลิกงานนะ.mp3" }
];

// --- Global State ---
let state = {
    isRunning: false,
    schedules: [], 
    wakeLock: null
};

const audioPlayer = document.getElementById('mainAudioPlayer');
const DAYS_LABEL = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// --- Init ---
window.onload = () => {
    loadSettings(); // 1. โหลดข้อมูลเก่าก่อน
    setInterval(updateTime, 1000); // 2. เริ่มเดินนาฬิกา
    renderManualBoard(); // 3. สร้างปุ่มกดมือ
    
    // สร้าง Input สำหรับ Import ไฟล์ (ซ่อนไว้)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'importFile';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.onchange = handleImport;
    document.body.appendChild(fileInput);
};

// --- Clock Logic ---
function updateTime() {
    const now = new Date();
    document.getElementById('clock').innerText = now.toLocaleTimeString('th-TH', { hour12: false });
    document.getElementById('date').innerText = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // ตรวจสอบเวลาปลุก (เฉพาะวินาทีที่ 0)
    if (state.isRunning && now.getSeconds() === 0) {
        checkAlarm(now);
    }
}

function checkAlarm(now) {
    const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    const day = now.getDay();

    state.schedules.forEach(sch => {
        if (sch.enabled && sch.time === timeStr && sch.days.includes(day)) {
            console.log(`⏰ ถึงเวลา: ${sch.time} - เล่นเสียง: ${sch.soundId}`);
            playSound(sch.soundId, sch.loop || 1);
        }
    });
}

// --- Audio System (Loop Fix) ---
function playSound(soundId, loops = 1) {
    const asset = audioAssets.find(a => a.id === soundId);
    if (!asset) return;

    console.log(`▶️ กำลังเล่น: ${asset.file} (${loops} รอบ)`);
    
    // 1. หยุดเสียงเก่า
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    
    // 2. ตั้งค่า
    audioPlayer.src = asset.file;
    audioPlayer.loop = false;
    
    // 3. จัดการ Loop
    let playedCount = 0;
    
    // ล้าง Event เก่าทิ้งก่อนเสมอ
    audioPlayer.onended = null;
    
    audioPlayer.onended = function() {
        playedCount++;
        if (playedCount < loops) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        } else {
            // จบแล้ว
            audioPlayer.onended = null; 
        }
    };

    // 4. เริ่มเล่น
    audioPlayer.play().catch(err => {
        console.error("Play Error:", err);
        if (err.name === "NotAllowedError") {
            alert("ระบบเสียงถูกบล็อก! กรุณากดปุ่ม 'START SYSTEM' อีกครั้ง");
            // ปิดระบบเพื่อให้ผู้ใช้กดเปิดใหม่
            if(state.isRunning) toggleSystem();
        }
    });
}

function setVolume(val) {
    audioPlayer.volume = val;
    document.getElementById('volText').innerText = Math.round(val * 100) + "%";
}

// --- UI Rendering ---
function renderManualBoard() {
    const container = document.getElementById('manualBoard');
    container.innerHTML = audioAssets.map(asset => `
        <button class="btn-manual" onclick="playSound('${asset.id}', 1)">
            <i class="fas fa-music"></i> ${asset.name}
        </button>
    `).join('');
}

function renderSchedule() {
    const container = document.getElementById('scheduleContainer');
    const soundOptions = audioAssets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    container.innerHTML = state.schedules.map((sch, i) => `
        <div class="schedule-item ${sch.enabled ? 'enabled' : ''}">
            <div style="text-align:center; min-width: 80px;">
                <input type="time" value="${sch.time}" onchange="updateSch(${i}, 'time', this.value)">
                <div style="margin-top:5px; font-size:0.8rem; color:#aaa; display:flex; align-items:center; justify-content:center; gap:5px;">
                   <span>รอบ:</span>
                   <input type="number" min="1" max="10" value="${sch.loop || 1}" 
                       onchange="updateSch(${i}, 'loop', this.value)" 
                       style="width:40px; text-align:center;">
                </div>
            </div>

            <div style="flex:1">
                <select onchange="updateSch(${i}, 'soundId', this.value)" style="width:100%; margin-bottom:5px;">
                    ${soundOptions.replace(`value="${sch.soundId}"`, `value="${sch.soundId}" selected`)}
                </select>

                <div style="display:flex; gap:3px; flex-wrap:wrap;">
                    ${DAYS_LABEL.map((d, dIdx) => `
                        <div onclick="toggleDay(${i}, ${dIdx})" 
                             style="cursor:pointer; padding:2px 8px; border-radius:3px; font-size:0.8rem;
                             background:${sch.days.includes(dIdx) ? 'var(--primary)' : '#444'};
                             color:${sch.days.includes(dIdx) ? 'black' : '#888'};
                             border: 1px solid #555;">
                             ${d}
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
                <button onclick="toggleEn(${i})" title="เปิด/ปิด" style="background:none; border:none; color:${sch.enabled ? 'var(--success)' : '#666'}; cursor:pointer; font-size:1.2rem;">
                    <i class="fas fa-power-off"></i>
                </button>
                <button onclick="delSch(${i})" title="ลบรายการ" style="background:none; border:none; color:#ff4d4d; cursor:pointer; font-size:1rem;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Data Management (LocalStorage) ---
function loadSettings() {
    const saved = localStorage.getItem('OFFICE_PA_DATA');
    if (saved) {
        try {
            state.schedules = JSON.parse(saved);
        } catch (e) {
            console.error("Data corrupted");
            state.schedules = [];
        }
    } else {
        // ค่าเริ่มต้น
        state.schedules = [
            { time: "08:00", soundId: audioAssets[0].id, days: [1, 2, 3, 4, 5], loop: 1, enabled: true },
            { time: "17:00", soundId: audioAssets[0].id, days: [1, 2, 3, 4, 5], loop: 1, enabled: true }
        ];
        saveSettings();
    }
    renderSchedule();
}

function saveSettings() {
    localStorage.setItem('OFFICE_PA_DATA', JSON.stringify(state.schedules));
}

function hardReset() {
    if(confirm("⚠️ คำเตือน: ข้อมูลตารางเวลาทั้งหมดจะหายไปและกู้คืนไม่ได้\nยืนยันการล้างค่าหรือไม่?")) {
        localStorage.removeItem('OFFICE_PA_DATA');
        location.reload();
    }
}

// --- Actions (Auto Save) ---
function addSchedule() {
    state.schedules.push({ 
        time: "12:00", 
        soundId: audioAssets[0].id, 
        days: [1, 2, 3, 4, 5], 
        loop: 1,
        enabled: true 
    });
    saveSettings();
    renderSchedule();
}

function updateSch(i, key, val) {
    if(key === 'loop') val = parseInt(val);
    state.schedules[i][key] = val;
    saveSettings();
}

function toggleDay(i, dayIdx) {
    const days = state.schedules[i].days;
    const idx = days.indexOf(dayIdx);
    if (idx > -1) days.splice(idx, 1);
    else days.push(dayIdx);
    
    state.schedules[i].days.sort((a,b) => a-b);
    saveSettings();
    renderSchedule();
}

function toggleEn(i) {
    state.schedules[i].enabled = !state.schedules[i].enabled;
    saveSettings();
    renderSchedule();
}

function delSch(i) {
    if (confirm("ลบรายการนี้?")) {
        state.schedules.splice(i, 1);
        saveSettings();
        renderSchedule();
    }
}

// --- Backup & Restore ---
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.schedules));
    const dlAnchor = document.createElement('a');
    dlAnchor.href = dataStr;
    dlAnchor.download = "pa_schedule_backup.json";
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
}

function triggerImport() { document.getElementById('importFile').click(); }

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loaded = JSON.parse(e.target.result);
            if (Array.isArray(loaded)) {
                if(confirm("ข้อมูลเดิมจะถูกทับด้วยไฟล์ที่นำเข้า ยืนยันไหม?")) {
                    state.schedules = loaded;
                    saveSettings();
                    renderSchedule();
                    alert("นำเข้าข้อมูลสำเร็จ!");
                }
            }
        } catch (err) { alert("ไฟล์ไม่ถูกต้อง"); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- System Power ---
async function toggleSystem() {
    state.isRunning = !state.isRunning;
    const btn = document.getElementById('powerBtn');
    
    if (state.isRunning) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-power-off"></i> <span id="powerText">SYSTEM ON</span>';
        
        // Wake Lock
        if ('wakeLock' in navigator) {
            try { state.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
        }
        
        // Unlock Audio
        audioPlayer.src = ""; 
        audioPlayer.play().catch(() => {});
        
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-power-off"></i> <span id="powerText">START SYSTEM</span>';
        
        if (state.wakeLock) {
            state.wakeLock.release();
            state.wakeLock = null;
        }
    }
}