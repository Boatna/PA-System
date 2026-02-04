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
    volumeChangeTimeout: null,
    clockInterval: null,
    lastCheckMinute: -1, // Prevent duplicate alarm triggers
    isAudioUnlocked: false
};

// --- DOM Elements Cache ---
const DOM = {
    audioPlayer: null,
    clockEl: null,
    dateEl: null,
    volumeSlider: null,
    volText: null,
    powerBtn: null,
    statusBadge: null,
    statusText: null,
    scheduleContainer: null,
    manualBoard: null,
    importFile: null
};

// --- Initialization ---
window.onload = async () => {
    try {
        cacheDOMElements();
        await initializeApp();
    } catch (error) {
        console.error('Critical initialization error:', error);
        showToast('เกิดข้อผิดพลาดร้ายแรง กรุณารีโหลดหน้าเว็บ', 'error');
    }
};

function cacheDOMElements() {
    DOM.audioPlayer = document.getElementById('mainAudioPlayer');
    DOM.clockEl = document.getElementById('clock');
    DOM.dateEl = document.getElementById('date');
    DOM.volumeSlider = document.getElementById('volumeSlider');
    DOM.volText = document.getElementById('volText');
    DOM.powerBtn = document.getElementById('powerBtn');
    DOM.statusBadge = document.getElementById('statusBadge');
    DOM.statusText = document.getElementById('statusText');
    DOM.scheduleContainer = document.getElementById('scheduleContainer');
    DOM.manualBoard = document.getElementById('manualBoard');
    DOM.importFile = document.getElementById('importFile');
}

async function initializeApp() {
    try {
        // Load settings first
        loadSettings();
        
        // Detect audio path (critical - must await)
        await detectAudioPath();
        
        // Setup UI
        renderManualBoard();
        renderSchedule();
        updateUI();
        
        // Setup event listeners
        setupEventListeners();
        
        // Load and apply saved volume
        loadSavedVolume();
        
        // Start clock
        startClock();
        
        // Setup visibility change handler
        setupVisibilityHandler();
        
        console.log('✅ Voice Alarm Pro initialized successfully');
        console.log('📁 Audio base path:', state.audioBasePath || '(root)');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('เกิดข้อผิดพลาดในการเริ่มต้นระบบ', 'error');
    }
}

function setupEventListeners() {
    if (DOM.importFile) {
        DOM.importFile.addEventListener('change', handleImport);
    }
    
    // Prevent accidental page close when system is running
    window.addEventListener('beforeunload', (e) => {
        if (state.isRunning) {
            e.preventDefault();
            e.returnValue = 'ระบบกำลังทำงานอยู่ ต้องการออกหรือไม่?';
        }
    });
    
    // Handle audio errors globally
    if (DOM.audioPlayer) {
        DOM.audioPlayer.addEventListener('error', handleAudioError);
        DOM.audioPlayer.addEventListener('ended', handleAudioEnded);
    }
}

function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.isRunning) {
            // Resync when tab becomes visible
            updateClock();
        }
    });
}

function handleAudioError(e) {
    console.error('Audio playback error:', e);
    const errorMsg = {
        1: 'การโหลดถูกยกเลิก',
        2: 'เกิดข้อผิดพลาดเครือข่าย',
        3: 'ไม่สามารถ decode ไฟล์เสียงได้',
        4: 'ไฟล์เสียงไม่รองรับ'
    };
    showToast(errorMsg[e.target.error?.code] || 'ไม่สามารถเล่นเสียงได้', 'error');
}

function handleAudioEnded() {
    // Cleanup after audio ends naturally
    updateUI();
}

function loadSavedVolume() {
    try {
        const savedVolume = localStorage.getItem('PA_VOLUME');
        if (savedVolume !== null) {
            const vol = Math.max(0, Math.min(1, parseFloat(savedVolume)));
            DOM.volumeSlider.value = vol;
            DOM.audioPlayer.volume = vol;
            DOM.volText.innerText = Math.round(vol * 100) + '%';
        }
    } catch (error) {
        console.error('Failed to load volume:', error);
    }
}

// --- Audio Path Detection (FIXED) ---
async function detectAudioPath() {
    console.log('🔍 Detecting audio path...');
    
    for (const path of audioPaths) {
        const testUrl = path + audioAssets[0].file;
        
        try {
            const response = await fetch(testUrl, { 
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            if (response.ok) {
                state.audioBasePath = path;
                console.log('✅ Audio path found:', path);
                return true;
            }
        } catch (e) {
            // Continue to next path
            continue;
        }
    }
    
    // No valid path found - use empty string (same directory)
    state.audioBasePath = '';
    console.warn('⚠️ Could not detect audio path, using root directory');
    return false;
}

// --- Audio Logic with Improved Fade Effect ---
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
        
        // Prepare new audio
        DOM.audioPlayer.src = url;
        DOM.audioPlayer.loop = false;
        DOM.audioPlayer.volume = 0;
        
        let playedCount = 0;
        const targetVolume = parseFloat(DOM.volumeSlider.value);

        const onEnded = async () => {
            playedCount++;
            if (playedCount < loops) {
                DOM.audioPlayer.currentTime = 0;
                try {
                    await DOM.audioPlayer.play();
                } catch (err) {
                    console.error('Replay error:', err);
                    DOM.audioPlayer.onended = null;
                    updateUI();
                }
            } else {
                // Last loop finished
                DOM.audioPlayer.onended = null;
                await fadeOutAndStop();
                updateUI();
            }
        };

        DOM.audioPlayer.onended = onEnded;

        // Play and fade in
        await DOM.audioPlayer.play();
        state.isAudioUnlocked = true;
        fadeIn(targetVolume);
        
        const loopText = loops > 1 ? ` (${loops} รอบ)` : '';
        showToast(`🔊 ${asset.name}${loopText}`);
        updateUI();
        
    } catch (err) {
        console.error('Play error:', err);
        
        if (err.name === 'NotAllowedError') {
            showToast('กรุณากด START SYSTEM อีกครั้ง', 'error');
            toggleSystem(false);
        } else if (err.name === 'NotSupportedError') {
            showToast('รูปแบบไฟล์เสียงไม่รองรับ', 'error');
        } else {
            showToast('ไม่สามารถเล่นเสียงได้: ' + (err.message || 'Unknown error'), 'error');
        }
    }
}

function fadeIn(targetVolume) {
    // Clear any existing fade
    clearFadeInterval();

    if (targetVolume === 0) {
        DOM.audioPlayer.volume = 0;
        return;
    }

    let currentVol = 0;
    DOM.audioPlayer.volume = 0;
    const step = targetVolume / 20; // 20 steps for smooth fade
    
    state.currentFadeInterval = setInterval(() => {
        if (DOM.audioPlayer.paused) {
            clearFadeInterval();
            return;
        }
        
        currentVol += step;
        if (currentVol >= targetVolume) {
            DOM.audioPlayer.volume = targetVolume;
            clearFadeInterval();
        } else {
            DOM.audioPlayer.volume = currentVol;
        }
    }, 50);
}

async function fadeOutAndStop() {
    return new Promise((resolve) => {
        clearFadeInterval();

        if (DOM.audioPlayer.paused || DOM.audioPlayer.volume === 0) {
            DOM.audioPlayer.pause();
            DOM.audioPlayer.currentTime = 0;
            DOM.audioPlayer.volume = 0;
            resolve();
            return;
        }

        let currentVol = DOM.audioPlayer.volume;
        const step = currentVol / 15; // 15 steps for fade out
        
        state.currentFadeInterval = setInterval(() => {
            currentVol -= step;
            
            if (currentVol <= 0.05) {
                clearFadeInterval();
                DOM.audioPlayer.pause();
                DOM.audioPlayer.currentTime = 0;
                DOM.audioPlayer.volume = 0;
                resolve();
            } else {
                DOM.audioPlayer.volume = currentVol;
            }
        }, 30);
    });
}

function clearFadeInterval() {
    if (state.currentFadeInterval) {
        clearInterval(state.currentFadeInterval);
        state.currentFadeInterval = null;
    }
}

function handleVolumeChange(val) {
    // Clear previous timeout
    if (state.volumeChangeTimeout) {
        clearTimeout(state.volumeChangeTimeout);
    }

    const volume = Math.max(0, Math.min(1, parseFloat(val)));
    DOM.volText.innerText = Math.round(volume * 100) + '%';
    
    // Apply volume immediately if audio is playing
    if (!DOM.audioPlayer.paused && !state.currentFadeInterval) {
        DOM.audioPlayer.volume = volume;
    }

    // Debounced save to localStorage
    state.volumeChangeTimeout = setTimeout(() => {
        try {
            localStorage.setItem('PA_VOLUME', volume);
        } catch (error) {
            console.error('Failed to save volume:', error);
        }
    }, 500);
}

// Legacy compatibility
function setVolume(val) {
    handleVolumeChange(val);
}

// --- System Control ---
async function toggleSystem(forceState) {
    try {
        const newState = forceState !== undefined ? forceState : !state.isRunning;
        state.isRunning = newState;

        if (state.isRunning) {
            await startSystem();
        } else {
            await stopSystem();
        }
    } catch (error) {
        console.error('Toggle system error:', error);
        showToast('เกิดข้อผิดพลาดในการสลับระบบ', 'error');
        state.isRunning = false;
        updateSystemUI(false);
    }
}

async function startSystem() {
    try {
        // Unlock audio context (required by browsers)
        if (!state.isAudioUnlocked) {
            const silentAudio = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
            DOM.audioPlayer.src = silentAudio;
            
            try {
                await DOM.audioPlayer.play();
                await DOM.audioPlayer.pause();
                state.isAudioUnlocked = true;
            } catch (e) {
                console.warn('Audio unlock failed, will retry on first sound:', e);
            }
        }

        // Update UI
        updateSystemUI(true);
        
        // Acquire Wake Lock
        await acquireWakeLock();
        
        showToast('✅ ระบบทำงานแล้ว');
    } catch (error) {
        throw new Error('Failed to start system: ' + error.message);
    }
}

async function stopSystem() {
    try {
        // Update UI
        updateSystemUI(false);
        
        // Stop any playing audio
        await fadeOutAndStop();
        
        // Release Wake Lock
        await releaseWakeLock();
        
        showToast('⏸️ ระบบหยุดทำงาน');
    } catch (error) {
        throw new Error('Failed to stop system: ' + error.message);
    }
}

function updateSystemUI(isActive) {
    if (isActive) {
        DOM.powerBtn.classList.add('active');
        DOM.powerBtn.innerHTML = '<i class="fas fa-power-off"></i> <span id="powerText">STOP SYSTEM</span>';
        DOM.statusBadge.classList.add('active');
        DOM.statusText.innerText = "ONLINE";
    } else {
        DOM.powerBtn.classList.remove('active');
        DOM.powerBtn.innerHTML = '<i class="fas fa-power-off"></i> <span id="powerText">START SYSTEM</span>';
        DOM.statusBadge.classList.remove('active');
        DOM.statusText.innerText = "STANDBY";
    }
}

async function acquireWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            state.wakeLock = await navigator.wakeLock.request('screen');
            
            state.wakeLock.addEventListener('release', () => {
                console.log('⚠️ Wake Lock released');
            });
            
            console.log('🔒 Wake Lock acquired');
        } catch (err) {
            console.warn('Wake Lock failed:', err);
            // Not critical - continue without wake lock
        }
    }
}

async function releaseWakeLock() {
    if (state.wakeLock) {
        try {
            await state.wakeLock.release();
            state.wakeLock = null;
            console.log('🔓 Wake Lock released');
        } catch (err) {
            console.error('Failed to release wake lock:', err);
        }
    }
}

// --- Clock & Alarm System (IMPROVED) ---
function startClock() {
    updateClock(); // Initial update
    
    // Clear any existing interval
    if (state.clockInterval) {
        clearInterval(state.clockInterval);
    }
    
    state.clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
    try {
        const now = new Date();
        
        // Update display
        DOM.clockEl.innerText = now.toLocaleTimeString('th-TH', { hour12: false });
        DOM.dateEl.innerText = now.toLocaleDateString('th-TH', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });

        // Check alarms only once per minute when seconds === 0
        const currentMinute = now.getHours() * 60 + now.getMinutes();
        
        if (state.isRunning && now.getSeconds() === 0 && currentMinute !== state.lastCheckMinute) {
            state.lastCheckMinute = currentMinute;
            checkAlarm(now);
        }

        // Update countdown every second
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

        const matchingSchedules = state.schedules.filter(sch => 
            sch.enabled && 
            sch.time === timeStr && 
            sch.days.includes(day)
        );

        if (matchingSchedules.length > 0) {
            // Play the first matching schedule
            const sch = matchingSchedules[0];
            const loops = Math.max(1, Math.min(10, sch.loop || 1));
            playSound(sch.soundId, loops);
            
            if (matchingSchedules.length > 1) {
                console.warn(`⚠️ Multiple schedules at ${timeStr}, playing first one only`);
            }
        }
    } catch (error) {
        console.error('Check alarm error:', error);
    }
}

function updateNextEventCountdown(now) {
    try {
        const nextEl = document.getElementById('nextSchedule');
        const countEl = document.getElementById('nextCountdown');
        
        if (!nextEl || !countEl) return;
        
        const activeSchedules = state.schedules.filter(s => s.enabled);
        
        if (activeSchedules.length === 0) {
            nextEl.innerText = "--:--";
            countEl.innerText = "ไม่มีรายการที่เปิดใช้งาน";
            countEl.style.color = 'var(--text-muted)';
            return;
        }

        let minDiff = Infinity;
        let nextSch = null;
        const currentDay = now.getDay();
        const currentSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        activeSchedules.forEach(sch => {
            const [h, m] = sch.time.split(':').map(Number);
            const schSecs = h * 3600 + m * 60;
            
            sch.days.forEach(d => {
                let dayDiff = (d - currentDay + 7) % 7;
                
                // If same day but time already passed, schedule for next week
                if (dayDiff === 0 && schSecs <= currentSecs) {
                    dayDiff = 7;
                }

                // Calculate difference in seconds
                const diff = (dayDiff * 86400) + schSecs - currentSecs;

                if (diff > 0 && diff < minDiff) {
                    minDiff = diff;
                    nextSch = sch;
                }
            });
        });

        if (nextSch) {
            nextEl.innerText = nextSch.time;
            
            // Format Countdown
            const days = Math.floor(minDiff / 86400);
            const hrs = Math.floor((minDiff % 86400) / 3600);
            const mins = Math.floor((minDiff % 3600) / 60);
            const secs = Math.floor(minDiff % 60);
            
            let countdownText = '';
            if (days > 0) {
                countdownText = `อีก ${days} วัน ${hrs} ชม. ${mins} นาที`;
            } else if (hrs > 0) {
                countdownText = `อีก ${hrs} ชม. ${mins} นาที`;
            } else if (mins > 0) {
                countdownText = `อีก ${mins} นาที ${secs} วินาที`;
            } else {
                countdownText = `อีก ${secs} วินาที`;
            }
            
            countEl.innerText = countdownText;
            countEl.style.color = minDiff < 300 ? 'var(--warning)' : 'var(--accent)'; // Orange if < 5 min
        } else {
            nextEl.innerText = "--:--";
            countEl.innerText = "ไม่มีรายการในอนาคตใกล้";
            countEl.style.color = 'var(--text-muted)';
        }
    } catch (error) {
        console.error('Update countdown error:', error);
    }
}

// --- Schedule Management (OPTIMIZED) ---
function renderSchedule() {
    try {
        if (!DOM.scheduleContainer) return;
        
        DOM.scheduleContainer.innerHTML = '';
        
        // Sort by time for better UX
        const sortedSchedules = [...state.schedules].sort((a, b) => 
            a.time.localeCompare(b.time)
        );

        if (sortedSchedules.length === 0) {
            DOM.scheduleContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-calendar-plus" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>ยังไม่มีรายการ</p>
                    <p style="font-size: 0.9rem; margin-top: 0.5rem;">กดปุ่ม "เพิ่มรายการ" เพื่อเริ่มต้น</p>
                </div>
            `;
            updateStats();
            return;
        }

        const fragment = document.createDocumentFragment();
        
        sortedSchedules.forEach((sch, i) => {
            const actualIndex = state.schedules.indexOf(sch);
            const scheduleElement = createScheduleElement(sch, actualIndex);
            fragment.appendChild(scheduleElement);
        });
        
        DOM.scheduleContainer.appendChild(fragment);
        updateStats();
        
    } catch (error) {
        console.error('Render schedule error:', error);
        showToast('เกิดข้อผิดพลาดในการแสดงผล', 'error');
    }
}

function createScheduleElement(sch, index) {
    const div = document.createElement('div');
    div.className = `sch-item ${sch.enabled ? '' : 'disabled'}`;
    div.dataset.index = index;
    
    // Sound Options
    const soundOpts = audioAssets.map(a => 
        `<option value="${a.id}" ${a.id === sch.soundId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
    ).join('');

    // Days
    const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const dayPills = dayNames.map((d, idx) => 
        `<div class="day-pill ${sch.days.includes(idx) ? 'active' : ''}" 
              onclick="toggleDay(${index}, ${idx})"
              role="button"
              tabindex="0"
              aria-label="${d}"
              aria-pressed="${sch.days.includes(idx)}">${d}</div>`
    ).join('');

    // Loop value (validated)
    const loopValue = Math.max(1, Math.min(10, sch.loop || 1));

    div.innerHTML = `
        <div class="sch-time">
            <input type="time" 
                   value="${escapeHtml(sch.time)}" 
                   onchange="updateSch(${index}, 'time', this.value)"
                   aria-label="เวลา">
        </div>
        <div class="sch-details">
            <select onchange="updateSch(${index}, 'soundId', this.value)" 
                    aria-label="เลือกเสียง">
                ${soundOpts}
            </select>
            <div class="sch-days" role="group" aria-label="เลือกวัน">
                ${dayPills}
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
                <label for="loop-${index}">เล่น:</label>
                <input type="number" 
                       id="loop-${index}"
                       min="1" 
                       max="10" 
                       value="${loopValue}" 
                       onchange="updateSch(${index}, 'loop', parseInt(this.value))"
                       style="width: 50px; background: #1e293b; border: 1px solid var(--border); color: var(--text-main); padding: 0.2rem; border-radius: 4px; text-align: center;"
                       aria-label="จำนวนรอบ">
                <span>รอบ</span>
            </div>
        </div>
        <div class="sch-actions">
            <button class="btn-icon" 
                    onclick="toggleEnable(${index})" 
                    title="${sch.enabled ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}"
                    aria-label="${sch.enabled ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}">
                <i class="fas fa-${sch.enabled ? 'toggle-on' : 'toggle-off'}" 
                   style="color: ${sch.enabled ? 'var(--success)' : 'var(--text-muted)'}"></i>
            </button>
            <button class="btn-icon danger" 
                    onclick="askDelete(${index})" 
                    title="ลบ"
                    aria-label="ลบรายการ">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    return div;
}

function updateStats() {
    const scheduleCount = document.getElementById('scheduleCount');
    const enabledCount = document.getElementById('enabledCount');
    
    if (scheduleCount) {
        scheduleCount.innerText = state.schedules.length;
    }
    if (enabledCount) {
        enabledCount.innerText = state.schedules.filter(s => s.enabled).length;
    }
}

function updateUI() {
    updateStats();
    // Could add more UI updates here if needed
}

// --- Schedule CRUD Operations ---
function addSchedule() {
    try {
        const newSchedule = {
            time: "08:00",
            soundId: audioAssets[0].id,
            days: [1, 2, 3, 4, 5], // Mon-Fri
            enabled: true,
            loop: 1
        };
        
        state.schedules.push(newSchedule);
        saveAndRender();
        showToast('✅ เพิ่มรายการสำเร็จ');
        
        // Scroll to bottom to show new item
        setTimeout(() => {
            if (DOM.scheduleContainer) {
                DOM.scheduleContainer.scrollTop = DOM.scheduleContainer.scrollHeight;
            }
        }, 100);
    } catch (error) {
        console.error('Add schedule error:', error);
        showToast('ไม่สามารถเพิ่มรายการได้', 'error');
    }
}

function updateSch(index, key, value) {
    try {
        if (index < 0 || index >= state.schedules.length) {
            throw new Error('Invalid schedule index');
        }
        
        if (key === 'loop') {
            // Validate and clamp loop value
            value = Math.max(1, Math.min(10, parseInt(value) || 1));
        } else if (key === 'time') {
            // Validate time format
            if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                throw new Error('Invalid time format');
            }
        } else if (key === 'soundId') {
            // Validate soundId exists
            if (!audioAssets.find(a => a.id === value)) {
                throw new Error('Invalid sound ID');
            }
        }
        
        state.schedules[index][key] = value;
        saveAndRender();
    } catch (error) {
        console.error('Update schedule error:', error);
        showToast('ไม่สามารถอัพเดทได้: ' + error.message, 'error');
        // Reload to reset invalid state
        renderSchedule();
    }
}

function toggleDay(index, dayIdx) {
    try {
        if (index < 0 || index >= state.schedules.length) {
            throw new Error('Invalid schedule index');
        }
        
        const days = state.schedules[index].days;
        const pos = days.indexOf(dayIdx);
        
        if (pos > -1) {
            // Don't allow removing last day
            if (days.length === 1) {
                showToast('ต้องเลือกอย่างน้อย 1 วัน', 'error');
                return;
            }
            days.splice(pos, 1);
        } else {
            days.push(dayIdx);
        }
        
        days.sort((a, b) => a - b);
        saveAndRender();
    } catch (error) {
        console.error('Toggle day error:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function toggleEnable(index) {
    try {
        if (index < 0 || index >= state.schedules.length) {
            throw new Error('Invalid schedule index');
        }
        
        state.schedules[index].enabled = !state.schedules[index].enabled;
        saveAndRender();
        
        const status = state.schedules[index].enabled ? 'เปิด' : 'ปิด';
        showToast(`${status}การใช้งานแล้ว`);
    } catch (error) {
        console.error('Toggle enable error:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

// --- Modal System ---
let pendingAction = null;

function askDelete(index) {
    if (index < 0 || index >= state.schedules.length) {
        return;
    }
    
    const schedule = state.schedules[index];
    const asset = audioAssets.find(a => a.id === schedule.soundId);
    const soundName = asset ? asset.name : schedule.soundId;
    
    pendingAction = () => {
        state.schedules.splice(index, 1);
        saveAndRender();
        showToast('🗑️ ลบรายการแล้ว');
    };
    
    showModal(
        'ลบรายการนี้?', 
        `ต้องการลบเวลา ${schedule.time} (${soundName}) ใช่หรือไม่?`
    );
}

function confirmReset() {
    pendingAction = () => {
        try {
            localStorage.removeItem('PA_DATA_V3');
            localStorage.removeItem('PA_VOLUME');
            showToast('🔄 กำลังรีเซ็ตระบบ...');
            
            // Stop system first
            if (state.isRunning) {
                toggleSystem(false);
            }
            
            setTimeout(() => {
                location.reload();
            }, 800);
        } catch (error) {
            console.error('Reset error:', error);
            showToast('ไม่สามารถรีเซ็ตได้', 'error');
        }
    };
    
    showModal(
        '⚠️ ล้างข้อมูลทั้งหมด', 
        'ข้อมูลทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้ ต้องการดำเนินการต่อหรือไม่?'
    );
}

function showModal(title, msg) {
    const modal = document.getElementById('confirmModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    
    if (!modal || !modalTitle || !modalMessage || !confirmBtn) return;
    
    modalTitle.innerText = title;
    modalMessage.innerText = msg;
    modal.classList.add('show');
    
    // Remove old event listener and add new one
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.onclick = () => {
        if (pendingAction) {
            pendingAction();
        }
        closeModal();
    };
    
    // ESC to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.classList.remove('show');
    }
    pendingAction = null;
}

// --- Data Persistence ---
function saveAndRender() {
    try {
        const dataStr = JSON.stringify(state.schedules);
        localStorage.setItem('PA_DATA_V3', dataStr);
        renderSchedule();
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            showToast('พื้นที่จัดเก็บเต็ม กรุณาลบรายการบางอัน', 'error');
        } else {
            console.error('Save error:', error);
            showToast('ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    }
}

function loadSettings() {
    try {
        const data = localStorage.getItem('PA_DATA_V3');
        
        if (data) {
            const parsed = JSON.parse(data);
            
            // Validate and sanitize each schedule
            state.schedules = parsed
                .filter(sch => sch && typeof sch === 'object')
                .map(sch => ({
                    time: validateTime(sch.time) ? sch.time : "08:00",
                    soundId: validateSoundId(sch.soundId) ? sch.soundId : audioAssets[0].id,
                    days: validateDays(sch.days) ? sch.days : [1, 2, 3, 4, 5],
                    enabled: typeof sch.enabled === 'boolean' ? sch.enabled : true,
                    loop: validateLoop(sch.loop) ? sch.loop : 1
                }));
        } else {
            // Default schedules for first-time users
            state.schedules = [
                { time: "08:00", soundId: "chime", days: [1, 2, 3, 4, 5], enabled: true, loop: 1 },
                { time: "12:00", soundId: "chime", days: [1, 2, 3, 4, 5], enabled: true, loop: 1 },
                { time: "17:00", soundId: "alarm", days: [1, 2, 3, 4, 5], enabled: true, loop: 1 }
            ];
        }
    } catch (error) {
        console.error('Load settings error:', error);
        showToast('ไม่สามารถโหลดข้อมูลได้ ใช้ค่าเริ่มต้น', 'error');
        state.schedules = [];
    }
}

// Validation helpers
function validateTime(time) {
    return typeof time === 'string' && /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function validateSoundId(id) {
    return typeof id === 'string' && audioAssets.some(a => a.id === id);
}

function validateDays(days) {
    return Array.isArray(days) && 
           days.length > 0 && 
           days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
}

function validateLoop(loop) {
    return Number.isInteger(loop) && loop >= 1 && loop <= 10;
}

function renderManualBoard() {
    try {
        if (!DOM.manualBoard) return;
        
        DOM.manualBoard.innerHTML = audioAssets.map(a => `
            <button class="btn btn-manual" 
                    onclick="playSound('${escapeHtml(a.id)}', 1)"
                    aria-label="เล่น ${escapeHtml(a.name)}">
                <i class="fas fa-play"></i> ${escapeHtml(a.name)}
            </button>
        `).join('');
    } catch (error) {
        console.error('Render manual board error:', error);
    }
}

// --- Toast Notifications (IMPROVED) ---
let toastTimeout = null;

function showToast(msg, type = 'normal') {
    try {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(t => t.remove());
        
        // Clear existing timeout
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        
        const iconMap = {
            'error': 'fa-exclamation-circle',
            'warning': 'fa-exclamation-triangle',
            'success': 'fa-check-circle',
            'normal': 'fa-info-circle'
        };
        
        const icon = iconMap[type] || iconMap['normal'];
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(msg)}</span>`;
        
        if (type === 'error') {
            toast.style.borderLeftColor = 'var(--danger)';
        } else if (type === 'warning') {
            toast.style.borderLeftColor = 'var(--warning)';
        } else if (type === 'success') {
            toast.style.borderLeftColor = 'var(--success)';
        }
        
        document.body.appendChild(toast);
        
        // Auto remove after 3 seconds
        toastTimeout = setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }
        }, 3000);
        
        // Click to dismiss
        toast.addEventListener('click', () => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        });
        
    } catch (error) {
        console.error('Toast error:', error);
    }
}

// --- Export/Import (SECURED) ---
function exportData() {
    try {
        const data = {
            version: '3.2',
            exportDate: new Date().toISOString(),
            schedules: state.schedules,
            settings: {
                volume: parseFloat(DOM.volumeSlider.value)
            }
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `voice-alarm-backup-${Date.now()}.json`;
        a.click();
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        showToast('📥 ส่งออกข้อมูลสำเร็จ', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('ไม่สามารถส่งออกข้อมูลได้', 'error');
    }
}

function triggerImport() {
    if (DOM.importFile) {
        DOM.importFile.click();
    }
}

function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
        showToast('ไฟล์ใหญ่เกินไป (สูงสุด 1MB)', 'error');
        e.target.value = '';
        return;
    }
    
    // Validate file type
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        showToast('กรุณาเลือกไฟล์ .json เท่านั้น', 'error');
        e.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            // Handle different import formats
            let schedulesToImport = [];
            
            if (Array.isArray(imported)) {
                // Old format: direct array
                schedulesToImport = imported;
            } else if (imported.schedules && Array.isArray(imported.schedules)) {
                // New format: object with schedules property
                schedulesToImport = imported.schedules;
                
                // Also import volume if available
                if (imported.settings?.volume !== undefined) {
                    const vol = Math.max(0, Math.min(1, parseFloat(imported.settings.volume)));
                    DOM.volumeSlider.value = vol;
                    DOM.audioPlayer.volume = vol;
                    DOM.volText.innerText = Math.round(vol * 100) + '%';
                    localStorage.setItem('PA_VOLUME', vol);
                }
            } else {
                throw new Error('Invalid file format');
            }
            
            // Validate and sanitize imported schedules
            state.schedules = schedulesToImport
                .filter(sch => sch && typeof sch === 'object')
                .map(sch => ({
                    time: validateTime(sch.time) ? sch.time : "08:00",
                    soundId: validateSoundId(sch.soundId) ? sch.soundId : audioAssets[0].id,
                    days: validateDays(sch.days) ? sch.days : [1, 2, 3, 4, 5],
                    enabled: typeof sch.enabled === 'boolean' ? sch.enabled : true,
                    loop: validateLoop(sch.loop) ? sch.loop : 1
                }));
            
            if (state.schedules.length === 0) {
                throw new Error('No valid schedules found in file');
            }
            
            saveAndRender();
            showToast(`📤 นำเข้าสำเร็จ (${state.schedules.length} รายการ)`, 'success');
            
        } catch (parseError) {
            console.error('Import parse error:', parseError);
            showToast('ไฟล์ไม่ถูกต้องหรือเสียหาย', 'error');
        }
    };
    
    reader.onerror = () => {
        showToast('ไม่สามารถอ่านไฟล์ได้', 'error');
    };
    
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
}

// --- Security Helper ---
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Cleanup on page unload ---
window.addEventListener('beforeunload', () => {
    // Clear intervals
    if (state.clockInterval) {
        clearInterval(state.clockInterval);
    }
    clearFadeInterval();
    
    // Stop audio
    if (DOM.audioPlayer) {
        DOM.audioPlayer.pause();
        DOM.audioPlayer.src = '';
    }
    
    // Release wake lock
    if (state.wakeLock) {
        state.wakeLock.release().catch(() => {});
    }
});

// --- Service Worker (Optional - commented out) ---
/*
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.log('❌ Service Worker registration failed:', err));
    });
}
*/
