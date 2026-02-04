/**
 * Voice Alarm Pro v3.1
 * Improved with better error handling and performance
 */

// --- Configuration ---
const audioAssets = [
    { id: "chime", name: "🎵 เสียงพักเบรก", file: "break.mp3" },
    { id: "alarm", name: "🚨 เสียงเลิกงาน", file: "endwork.mp3" }
];

const audioPaths = ['sounds/', './sounds/', '../sounds/', ''];

// --- State ---
let state = {
    isRunning: false,
    schedules: [],
    audioBasePath: '',
    wakeLock: null,
    nextSchedule: null,
    currentFadeInterval: null,
    volumeChangeTimeout: null
};

// --- DOM Elements ---
const audioPlayer = document.getElementById('mainAudioPlayer');
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');

// --- Initialization ---
window.onload = () => {
    initializeApp();
    detectAudioPath();
    setInterval(updateClock, 1000);
    updateClock(); // Initial call
};

function initializeApp() {
    try {
        loadSettings();
        renderManualBoard();
        renderSchedule();
        updateUI();
        
        // Auto import setup
        const fileInput = document.getElementById('importFile');
        if (fileInput) {
            fileInput.onchange = handleImport;
        }

        // Load saved volume
        const savedVolume = localStorage.getItem('PA_VOLUME');
        if (savedVolume) {
            const vol = parseFloat(savedVolume);
            document.getElementById('volumeSlider').value = vol;
            audioPlayer.volume = vol;
            document.getElementById('volText').innerText = Math.round(vol * 100) + '%';
        }

        console.log('Voice Alarm Pro initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('เกิดข้อผิดพลาดในการเริ่มต้นระบบ', 'error');
    }
}

// --- Audio Path Detection ---
async function detectAudioPath() {
    try {
        // Try to find the correct audio path
        for (const path of audioPaths) {
            const testUrl = path + audioAssets[0].file;
            
            try {
                const response = await fetch(testUrl, { method: 'HEAD' });
                if (response.ok) {
                    state.audioBasePath = path;
                    console.log('Audio path detected:', path);
                    return;
                }
            } catch (e) {
                // Continue to next path
            }
        }
        
        // Default to empty if nothing works
        state.audioBasePath = '';
        console.warn('Could not detect audio path, using default');
    } catch (error) {
        console.error('Audio path detection error:', error);
        state.audioBasePath = '';
    }
}

// --- Audio Logic with Fade Effect ---
async function playSound(soundId, loops = 1) {
    if (!state.isRunning) {
        showToast('กรุณาเปิดระบบก่อน (กด START SYSTEM)', 'error');
        return;
    }

    const asset = audioAssets.find(a => a.id === soundId);
    if (!asset) {
        showToast('ไม่พบไฟล์เสียง', 'error');
        return;
    }

    const url = state.audioBasePath + asset.file;
    
    try {
        // Stop previous audio with fade out
        await fadeOutAndStop();
        
        // Start new audio
        audioPlayer.src = url;
        audioPlayer.loop = false;
        audioPlayer.volume = 0; // Start silent for fade-in
        
        let playedCount = 0;
        const targetVolume = parseFloat(document.getElementById('volumeSlider').value);

        const onEnded = () => {
            playedCount++;
            if (playedCount < loops) {
                audioPlayer.currentTime = 0;
                audioPlayer.play().catch(err => {
                    console.error('Replay error:', err);
                    updateUI();
                });
            } else {
                // Last loop finished
                audioPlayer.onended = null;
                updateUI();
            }
        };

        audioPlayer.onended = onEnded;

        await audioPlayer.play();
        fadeIn(targetVolume);
        showToast(`กำลังเล่น: ${asset.name} ${loops > 1 ? `(${loops} รอบ)` : ''}`);
        updateUI();
        
    } catch (err) {
        console.error('Play error:', err);
        
        if (err.name === 'NotAllowedError') {
            showToast('กรุณากด START SYSTEM ก่อนเล่นเสียง', 'error');
            toggleSystem(false);
        } else if (err.name === 'NotSupportedError') {
            showToast('ไม่สามารถโหลดไฟล์เสียงได้ กรุณาตรวจสอบไฟล์', 'error');
        } else {
            showToast('ไม่สามารถเล่นเสียงได้', 'error');
        }
    }
}

function fadeIn(targetVolume) {
    // Clear any existing fade
    if (state.currentFadeInterval) {
        clearInterval(state.currentFadeInterval);
    }

    let vol = 0;
    audioPlayer.volume = 0;
    
    state.currentFadeInterval = setInterval(() => {
        if (vol < targetVolume) {
            vol += 0.05;
            audioPlayer.volume = Math.min(vol, targetVolume);
        } else {
            clearInterval(state.currentFadeInterval);
            state.currentFadeInterval = null;
        }
    }, 50);
}

function fadeOutAndStop() {
    return new Promise((resolve) => {
        // Clear any existing fade
        if (state.currentFadeInterval) {
            clearInterval(state.currentFadeInterval);
            state.currentFadeInterval = null;
        }

        if (audioPlayer.paused || audioPlayer.volume === 0) {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            resolve();
            return;
        }

        let vol = audioPlayer.volume;
        
        state.currentFadeInterval = setInterval(() => {
            if (vol > 0.05) {
                vol -= 0.05;
                audioPlayer.volume = Math.max(vol, 0);
            } else {
                clearInterval(state.currentFadeInterval);
                state.currentFadeInterval = null;
                audioPlayer.pause();
                audioPlayer.currentTime = 0;
                audioPlayer.volume = 0;
                resolve();
            }
        }, 30);
    });
}

function handleVolumeChange(val) {
    // Debounce volume changes
    if (state.volumeChangeTimeout) {
        clearTimeout(state.volumeChangeTimeout);
    }

    const volume = parseFloat(val);
    document.getElementById('volText').innerText = Math.round(volume * 100) + '%';
    
    // Only update audio volume if currently playing
    if (!audioPlayer.paused) {
        audioPlayer.volume = volume;
    }

    // Save to localStorage after delay
    state.volumeChangeTimeout = setTimeout(() => {
        localStorage.setItem('PA_VOLUME', volume);
    }, 500);
}

function setVolume(val) {
    // Legacy function for compatibility
    handleVolumeChange(val);
}

// --- System & Clock ---
async function toggleSystem(forceState) {
    try {
        const newState = forceState !== undefined ? forceState : !state.isRunning;
        state.isRunning = newState;

        const btn = document.getElementById('powerBtn');
        const badge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');

        if (state.isRunning) {
            // Try to unlock audio context
            const silentAudio = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
            audioPlayer.src = silentAudio;
            
            try {
                await audioPlayer.play();
            } catch (e) {
                console.log('Audio unlock failed:', e);
            }

            btn.classList.add('active');
            btn.innerHTML = '<i class="fas fa-power-off"></i> STOP SYSTEM';
            badge.classList.add('active');
            statusText.innerText = "ONLINE";
            
            // Wake Lock
            if ('wakeLock' in navigator) {
                try {
                    state.wakeLock = await navigator.wakeLock.request('screen');
                    console.log('Wake Lock acquired');
                } catch(e) {
                    console.log('Wake Lock failed:', e);
                }
            }
            
            showToast('ระบบทำงานแล้ว ✓');
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fas fa-power-off"></i> START SYSTEM';
            badge.classList.remove('active');
            statusText.innerText = "STANDBY";
            
            await fadeOutAndStop();
            
            if (state.wakeLock) {
                await state.wakeLock.release();
                state.wakeLock = null;
                console.log('Wake Lock released');
            }
            
            showToast('ระบบหยุดทำงาน');
        }
    } catch (error) {
        console.error('Toggle system error:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function updateClock() {
    try {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString('th-TH', { hour12: false });
        dateEl.innerText = now.toLocaleDateString('th-TH', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });

        // Check Alarms (Only if seconds == 0 and running)
        if (state.isRunning && now.getSeconds() === 0) {
            checkAlarm(now);
        }

        updateNextEventCountdown(now);
    } catch (error) {
        console.error('Clock update error:', error);
    }
}

function checkAlarm(now) {
    try {
        const timeStr = String(now.getHours()).padStart(2, '0') + ":" + 
                       String(now.getMinutes()).padStart(2, '0');
        const day = now.getDay();

        state.schedules.forEach(sch => {
            if (sch.enabled && sch.time === timeStr && sch.days.includes(day)) {
                const loops = sch.loop || 1;
                playSound(sch.soundId, loops);
            }
        });
    } catch (error) {
        console.error('Check alarm error:', error);
    }
}

function updateNextEventCountdown(now) {
    try {
        const activeSchedules = state.schedules.filter(s => s.enabled);
        
        if (activeSchedules.length === 0) {
            document.getElementById('nextSchedule').innerText = "--:--";
            document.getElementById('nextCountdown').innerText = "ไม่มีรายการที่เปิดใช้งาน";
            document.getElementById('nextCountdown').style.color = 'var(--text-muted)';
            return;
        }

        let minDiff = Infinity;
        let nextSch = null;
        const currentDay = now.getDay();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const currentSecs = currentMins * 60 + now.getSeconds();

        activeSchedules.forEach(sch => {
            const [h, m] = sch.time.split(':').map(Number);
            const schMins = h * 60 + m;
            
            sch.days.forEach(d => {
                let dayDiff = (d - currentDay + 7) % 7;
                
                // If same day but time already passed, schedule for next week
                if (dayDiff === 0 && schMins <= currentMins) {
                    dayDiff = 7;
                }

                // Calculate difference in seconds
                const targetSecs = (dayDiff * 24 * 60 * 60) + (schMins * 60);
                const diff = targetSecs - currentSecs;

                if (diff > 0 && diff < minDiff) {
                    minDiff = diff;
                    nextSch = sch;
                }
            });
        });

        const nextEl = document.getElementById('nextSchedule');
        const countEl = document.getElementById('nextCountdown');

        if (nextSch) {
            nextEl.innerText = nextSch.time;
            
            // Format Countdown
            const days = Math.floor(minDiff / 86400);
            const hrs = Math.floor((minDiff % 86400) / 3600);
            const mins = Math.floor((minDiff % 3600) / 60);
            const secs = Math.floor(minDiff % 60);
            
            let countdownText = '';
            if (days > 0) {
                countdownText = `อีก ${days} วัน ${hrs} ชม.`;
            } else if (hrs > 0) {
                countdownText = `อีก ${hrs} ชม. ${mins} น.`;
            } else {
                countdownText = `อีก ${mins} น. ${secs} วิ`;
            }
            
            countEl.innerText = countdownText;
            countEl.style.color = 'var(--accent)';
        } else {
            nextEl.innerText = "--:--";
            countEl.innerText = "ไม่มีรายการเร็วๆ นี้";
            countEl.style.color = 'var(--text-muted)';
        }
    } catch (error) {
        console.error('Update countdown error:', error);
    }
}

// --- Scheduler UI ---
function renderSchedule() {
    try {
        const container = document.getElementById('scheduleContainer');
        container.innerHTML = '';
        
        // Sort by time
        state.schedules.sort((a, b) => a.time.localeCompare(b.time));

        if (state.schedules.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">ยังไม่มีรายการ กดปุ่ม "เพิ่มรายการ" เพื่อเริ่มต้น</div>';
            updateStats();
            return;
        }

        state.schedules.forEach((sch, i) => {
            const div = document.createElement('div');
            div.className = `sch-item ${sch.enabled ? '' : 'disabled'}`;
            
            // Sound Options
            const soundOpts = audioAssets.map(a => 
                `<option value="${a.id}" ${a.id === sch.soundId ? 'selected' : ''}>${a.name}</option>`
            ).join('');

            // Days
            const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
            const dayPills = dayNames.map((d, idx) => 
                `<div class="day-pill ${sch.days.includes(idx) ? 'active' : ''}" 
                      onclick="toggleDay(${i}, ${idx})">${d}</div>`
            ).join('');

            // Loop value
            const loopValue = sch.loop || 1;

            div.innerHTML = `
                <div class="sch-time">
                    <input type="time" value="${sch.time}" onchange="updateSch(${i}, 'time', this.value)">
                </div>
                <div class="sch-details">
                    <select onchange="updateSch(${i}, 'soundId', this.value)">${soundOpts}</select>
                    <div class="sch-days">${dayPills}</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
                        <span>เล่น:</span>
                        <input type="number" min="1" max="10" value="${loopValue}" 
                               onchange="updateSch(${i}, 'loop', parseInt(this.value))"
                               style="width: 50px; background: #1e293b; border: 1px solid var(--border); color: var(--text-main); padding: 0.2rem; border-radius: 4px; text-align: center;">
                        <span>รอบ</span>
                    </div>
                </div>
                <div class="sch-actions">
                    <button class="btn-icon" onclick="toggleEnable(${i})" title="${sch.enabled ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}">
                        <i class="fas fa-${sch.enabled ? 'toggle-on' : 'toggle-off'}" style="color: ${sch.enabled ? 'var(--success)' : 'var(--text-muted)'}"></i>
                    </button>
                    <button class="btn-icon danger" onclick="askDelete(${i})" title="ลบ">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
        
        updateStats();
    } catch (error) {
        console.error('Render schedule error:', error);
        showToast('เกิดข้อผิดพลาดในการแสดงผล', 'error');
    }
}

function updateStats() {
    document.getElementById('scheduleCount').innerText = state.schedules.length;
    document.getElementById('enabledCount').innerText = state.schedules.filter(s => s.enabled).length;
}

function updateUI() {
    updateStats();
}

// --- Data Management ---
function addSchedule() {
    try {
        state.schedules.push({
            time: "08:00",
            soundId: audioAssets[0].id,
            days: [1, 2, 3, 4, 5], // Mon-Fri
            enabled: true,
            loop: 1
        });
        saveAndRender();
        showToast('เพิ่มรายการสำเร็จ');
    } catch (error) {
        console.error('Add schedule error:', error);
        showToast('ไม่สามารถเพิ่มรายการได้', 'error');
    }
}

function updateSch(index, key, value) {
    try {
        if (key === 'loop') {
            // Validate loop value
            const loopValue = parseInt(value);
            if (isNaN(loopValue) || loopValue < 1) {
                value = 1;
            } else if (loopValue > 10) {
                value = 10;
            }
        }
        state.schedules[index][key] = value;
        saveAndRender();
    } catch (error) {
        console.error('Update schedule error:', error);
        showToast('ไม่สามารถอัพเดทได้', 'error');
    }
}

function toggleDay(index, dayIdx) {
    try {
        const days = state.schedules[index].days;
        const pos = days.indexOf(dayIdx);
        
        if (pos > -1) {
            days.splice(pos, 1);
        } else {
            days.push(dayIdx);
        }
        
        days.sort((a, b) => a - b);
        saveAndRender();
    } catch (error) {
        console.error('Toggle day error:', error);
    }
}

function toggleEnable(index) {
    try {
        state.schedules[index].enabled = !state.schedules[index].enabled;
        saveAndRender();
    } catch (error) {
        console.error('Toggle enable error:', error);
    }
}

// --- Modal Handling ---
let pendingAction = null;

function askDelete(index) {
    const schedule = state.schedules[index];
    pendingAction = () => {
        state.schedules.splice(index, 1);
        saveAndRender();
        showToast('ลบรายการแล้ว');
    };
    showModal('ลบรายการ?', `ต้องการลบเวลา ${schedule.time} ใช่หรือไม่?`);
}

function confirmReset() {
    pendingAction = () => {
        try {
            localStorage.removeItem('PA_DATA_V3');
            localStorage.removeItem('PA_VOLUME');
            showToast('กำลังรีเซ็ตระบบ...');
            setTimeout(() => location.reload(), 500);
        } catch (error) {
            console.error('Reset error:', error);
            showToast('ไม่สามารถรีเซ็ตได้', 'error');
        }
    };
    showModal('ล้างข้อมูลทั้งหมด', 'ข้อมูลทั้งหมดจะถูกลบ ต้องการดำเนินการต่อหรือไม่?');
}

function showModal(title, msg) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = msg;
    document.getElementById('confirmModal').classList.add('show');
    
    document.getElementById('modalConfirmBtn').onclick = () => {
        if (pendingAction) {
            pendingAction();
        }
        closeModal();
    };
}

function closeModal() {
    document.getElementById('confirmModal').classList.remove('show');
    pendingAction = null;
}

// --- Utility Functions ---
function saveAndRender() {
    try {
        localStorage.setItem('PA_DATA_V3', JSON.stringify(state.schedules));
        renderSchedule();
    } catch (error) {
        console.error('Save error:', error);
        showToast('ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
}

function loadSettings() {
    try {
        const data = localStorage.getItem('PA_DATA_V3');
        if (data) {
            state.schedules = JSON.parse(data);
            
            // Validate and fix data
            state.schedules = state.schedules.map(sch => ({
                time: sch.time || "08:00",
                soundId: sch.soundId || audioAssets[0].id,
                days: Array.isArray(sch.days) ? sch.days : [1, 2, 3, 4, 5],
                enabled: typeof sch.enabled === 'boolean' ? sch.enabled : true,
                loop: typeof sch.loop === 'number' ? sch.loop : 1
            }));
        } else {
            // Default schedules
            state.schedules = [
                { time: "08:00", soundId: "chime", days: [1, 2, 3, 4, 5], enabled: true, loop: 1 },
                { time: "17:00", soundId: "alarm", days: [1, 2, 3, 4, 5], enabled: true, loop: 1 }
            ];
        }
    } catch (error) {
        console.error('Load settings error:', error);
        state.schedules = [];
    }
}

function renderManualBoard() {
    try {
        const board = document.getElementById('manualBoard');
        board.innerHTML = audioAssets.map(a => `
            <button class="btn btn-manual" onclick="playSound('${a.id}', 1)">
                <i class="fas fa-play"></i> ${a.name}
            </button>
        `).join('');
    } catch (error) {
        console.error('Render manual board error:', error);
    }
}

function showToast(msg, type = 'normal') {
    try {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(t => t.remove());
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        
        const icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
        
        if (type === 'error') {
            toast.style.borderLeftColor = 'var(--danger)';
        }
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    } catch (error) {
        console.error('Toast error:', error);
    }
}

// --- Export/Import ---
function exportData() {
    try {
        const data = {
            version: '3.1',
            schedules: state.schedules,
            exportDate: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `voice-alarm-backup-${new Date().getTime()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showToast('ส่งออกข้อมูลสำเร็จ');
    } catch (error) {
        console.error('Export error:', error);
        showToast('ไม่สามารถส่งออกข้อมูลได้', 'error');
    }
}

function triggerImport() {
    document.getElementById('importFile').click();
}

function handleImport(e) {
    try {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                
                // Handle both old and new formats
                if (Array.isArray(imported)) {
                    state.schedules = imported;
                } else if (imported.schedules) {
                    state.schedules = imported.schedules;
                }
                
                // Validate imported data
                state.schedules = state.schedules.map(sch => ({
                    time: sch.time || "08:00",
                    soundId: sch.soundId || audioAssets[0].id,
                    days: Array.isArray(sch.days) ? sch.days : [1, 2, 3, 4, 5],
                    enabled: typeof sch.enabled === 'boolean' ? sch.enabled : true,
                    loop: typeof sch.loop === 'number' ? sch.loop : 1
                }));
                
                saveAndRender();
                showToast('นำเข้าข้อมูลสำเร็จ');
            } catch (parseError) {
                console.error('Parse error:', parseError);
                showToast('ไฟล์ไม่ถูกต้อง', 'error');
            }
        };
        
        reader.onerror = () => {
            showToast('ไม่สามารถอ่านไฟล์ได้', 'error');
        };
        
        reader.readAsText(file);
        
        // Reset file input
        e.target.value = '';
    } catch (error) {
        console.error('Import error:', error);
        showToast('เกิดข้อผิดพลาดในการนำเข้า', 'error');
    }
}

// --- Service Worker Registration (Optional) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Uncomment if you have a service worker
        // navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

// Add slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);