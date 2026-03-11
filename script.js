/**
 * Voice Alarm Pro v3.4 — Terminal Gold Edition
 *
 * Fixes applied vs v3.3:
 * - updateSystemUI now uses cached DOM.powerText (was querying DOM every call)
 * - checkAlarm: first.loop || 1 guard added (was passing raw undefined)
 * - state.nextSchedule removed (was declared but never read)
 * - fadeIn: volume capped with Math.min to prevent floating-point overshoot
 * - detectAudioPath: parallel Promise.all instead of sequential for-loop
 * - showModal: focus moves to confirm button on open (focus-trap)
 * - closeModal: focus returns to the element that triggered the modal
 * - powerBtn aria-pressed updated on toggle for screen readers
 */

// ─── Audio Assets ─────────────────────────────────────────────────────────────
const audioAssets = [
    { id: 'chime', name: '🎵 เสียงพักเบรก', file: 'break.mp3'   },
    { id: 'alarm', name: '🚨 เสียงเลิกงาน', file: 'endwork.mp3' }
];

const audioPaths = ['sounds/', './sounds/', '../sounds/', ''];

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
    isRunning:          false,
    schedules:          [],
    audioBasePath:      '',
    wakeLock:           null,
    // NOTE: removed unused `nextSchedule` field
    currentFadeInterval: null,
    volumeChangeTimeout: null,
    clockInterval:      null,
    lastCheckMinute:    -1,
    isAudioUnlocked:    false,
    alarmQueue:         []
};

// ─── DOM Cache ────────────────────────────────────────────────────────────────
const DOM = {
    audioPlayer:       null,
    clockEl:           null,
    dateEl:            null,
    volumeSlider:      null,
    volText:           null,
    powerBtn:          null,
    powerText:         null,   // cached span#powerText — used in updateSystemUI
    statusBadge:       null,
    statusText:        null,
    scheduleContainer: null,
    manualBoard:       null,
    importFile:        null,
    nextScheduleEl:    null,
    nextCountdownEl:   null
};

// Tracks which element opened the modal so focus can be restored on close
let _modalTriggerEl = null;

// ─── Initialization ───────────────────────────────────────────────────────────
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
    DOM.audioPlayer       = document.getElementById('mainAudioPlayer');
    DOM.clockEl           = document.getElementById('clock');
    DOM.dateEl            = document.getElementById('date');
    DOM.volumeSlider      = document.getElementById('volumeSlider');
    DOM.volText           = document.getElementById('volText');
    DOM.powerBtn          = document.getElementById('powerBtn');
    DOM.powerText         = document.getElementById('powerText');   // FIX: now used in updateSystemUI
    DOM.statusBadge       = document.getElementById('statusBadge');
    DOM.statusText        = document.getElementById('statusText');
    DOM.scheduleContainer = document.getElementById('scheduleContainer');
    DOM.manualBoard       = document.getElementById('manualBoard');
    DOM.importFile        = document.getElementById('importFile');
    DOM.nextScheduleEl    = document.getElementById('nextSchedule');
    DOM.nextCountdownEl   = document.getElementById('nextCountdown');
}

async function initializeApp() {
    try {
        loadSettings();
        await detectAudioPath();
        renderManualBoard();
        renderSchedule();
        updateUI();
        setupEventListeners();
        loadSavedVolume();
        startClock();
        setupVisibilityHandler();
        console.log('✅ Voice Alarm Pro v3.4 initialized');
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
    if (DOM.audioPlayer) {
        DOM.audioPlayer.addEventListener('error',  handleAudioError);
        DOM.audioPlayer.addEventListener('ended',  handleAudioEnded);
    }
    window.addEventListener('beforeunload', (e) => {
        if (state.clockInterval) clearInterval(state.clockInterval);
        clearFadeInterval();
        if (DOM.audioPlayer) { DOM.audioPlayer.pause(); DOM.audioPlayer.src = ''; }
        if (state.wakeLock) state.wakeLock.release().catch(() => {});
        if (state.isRunning) {
            e.preventDefault();
            e.returnValue = 'ระบบกำลังทำงานอยู่ ต้องการออกหรือไม่?';
        }
    });
}

function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.isRunning) updateClock();
    });
}

function handleAudioError(e) {
    const codes = {
        1: 'การโหลดถูกยกเลิก',
        2: 'เกิดข้อผิดพลาดเครือข่าย',
        3: 'ไม่สามารถ decode ไฟล์เสียงได้',
        4: 'รูปแบบไฟล์เสียงไม่รองรับ'
    };
    showToast(codes[e.target.error?.code] || 'ไม่สามารถเล่นเสียงได้', 'error');
    processAlarmQueue();
}

function handleAudioEnded() {
    updateUI();
}

function loadSavedVolume() {
    try {
        const saved = localStorage.getItem('PA_VOLUME');
        if (saved !== null) {
            const vol = Math.max(0, Math.min(1, parseFloat(saved)));
            if (!isNaN(vol)) {
                DOM.volumeSlider.value   = vol;
                DOM.audioPlayer.volume   = vol;
                DOM.volText.innerText    = Math.round(vol * 100) + '%';
            }
        }
    } catch (e) {
        console.error('Failed to load volume:', e);
    }
}

// ─── Audio Path Detection (FIX: parallel, not sequential) ────────────────────
async function detectAudioPath() {
    if (location.protocol === 'file:') {
        state.audioBasePath = 'sounds/';
        console.warn('⚠️ file:// detected — defaulting to sounds/');
        return;
    }

    const testFile = audioAssets[0].file;

    // FIX: run all checks concurrently with Promise.all instead of await in a loop
    const results = await Promise.all(
        audioPaths.map(path =>
            fetch(path + testFile, { method: 'HEAD', cache: 'no-cache' })
                .then(r => (r.ok ? path : null))
                .catch(() => null)
        )
    );

    // Pick the first valid path (preserving priority order)
    const found = results.find(r => r !== null);
    state.audioBasePath = (found !== undefined && found !== null) ? found : '';
    console.log('📁 Audio path:', state.audioBasePath || '(root)');
}

// ─── Audio Logic ──────────────────────────────────────────────────────────────
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

    const safeLoops = Math.max(1, Math.min(10, parseInt(loops) || 1));
    const url = state.audioBasePath + asset.file;

    try {
        await fadeOutAndStop();

        DOM.audioPlayer.src    = url;
        DOM.audioPlayer.loop   = false;
        DOM.audioPlayer.volume = 0;

        let playedCount = 0;
        const targetVolume = parseFloat(DOM.volumeSlider.value);

        const onEnded = async () => {
            playedCount++;
            if (playedCount < safeLoops) {
                DOM.audioPlayer.currentTime = 0;
                try {
                    await DOM.audioPlayer.play();
                } catch (err) {
                    console.error('Replay error:', err);
                    DOM.audioPlayer.onended = null;
                    updateUI();
                    processAlarmQueue();
                }
            } else {
                DOM.audioPlayer.onended = null;
                await fadeOutAndStop();
                updateUI();
                processAlarmQueue();
            }
        };

        DOM.audioPlayer.onended = onEnded;
        await DOM.audioPlayer.play();
        state.isAudioUnlocked = true;
        fadeIn(targetVolume);

        const loopLabel = safeLoops > 1 ? ` (${safeLoops} รอบ)` : '';
        showToast(`🔊 ${asset.name}${loopLabel}`);
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
        processAlarmQueue();
    }
}

function processAlarmQueue() {
    if (state.alarmQueue.length === 0) return;
    const next = state.alarmQueue.shift();
    playSound(next.soundId, next.loops);
}

function fadeIn(targetVolume) {
    clearFadeInterval();
    if (targetVolume === 0 || isNaN(targetVolume)) {
        DOM.audioPlayer.volume = 0;
        return;
    }

    let current = 0;
    DOM.audioPlayer.volume = 0;
    const step = targetVolume / 20;

    state.currentFadeInterval = setInterval(() => {
        if (DOM.audioPlayer.paused) { clearFadeInterval(); return; }
        current += step;
        // FIX: Math.min prevents floating-point overshoot past targetVolume
        DOM.audioPlayer.volume = Math.min(current, targetVolume);
        if (current >= targetVolume) clearFadeInterval();
    }, 50);
}

async function fadeOutAndStop() {
    return new Promise((resolve) => {
        clearFadeInterval();

        const vol = DOM.audioPlayer.volume;
        if (DOM.audioPlayer.paused || isNaN(vol) || vol === 0) {
            DOM.audioPlayer.pause();
            DOM.audioPlayer.currentTime = 0;
            DOM.audioPlayer.volume = 0;
            resolve();
            return;
        }

        let current = vol;
        const step  = current / 15;

        state.currentFadeInterval = setInterval(() => {
            current -= step;
            if (current <= 0.05) {
                clearFadeInterval();
                DOM.audioPlayer.pause();
                DOM.audioPlayer.currentTime = 0;
                DOM.audioPlayer.volume = 0;
                resolve();
            } else {
                DOM.audioPlayer.volume = current;
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
    if (state.volumeChangeTimeout) clearTimeout(state.volumeChangeTimeout);

    const volume = Math.max(0, Math.min(1, parseFloat(val)));
    DOM.volText.innerText = Math.round(volume * 100) + '%';

    if (!DOM.audioPlayer.paused && !state.currentFadeInterval) {
        DOM.audioPlayer.volume = volume;
    }

    state.volumeChangeTimeout = setTimeout(() => {
        try { localStorage.setItem('PA_VOLUME', volume); }
        catch (e) { console.error('Failed to save volume:', e); }
    }, 500);
}

// Legacy alias
function setVolume(val) { handleVolumeChange(val); }

// ─── System Control ───────────────────────────────────────────────────────────
async function toggleSystem(forceState) {
    try {
        const newState = forceState !== undefined ? forceState : !state.isRunning;
        state.isRunning = newState;

        if (state.isRunning) await startSystem();
        else                 await stopSystem();
    } catch (error) {
        console.error('Toggle system error:', error);
        showToast('เกิดข้อผิดพลาดในการสลับระบบ', 'error');
        state.isRunning = false;
        updateSystemUI(false);
    }
}

async function startSystem() {
    // Unlock audio context on first user gesture
    if (!state.isAudioUnlocked) {
        const silent = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        DOM.audioPlayer.src = silent;
        try {
            await DOM.audioPlayer.play();
            await DOM.audioPlayer.pause();
            state.isAudioUnlocked = true;
        } catch (e) {
            console.warn('Audio unlock failed, will retry on first sound:', e);
        }
    }

    updateSystemUI(true);
    await acquireWakeLock();
    showToast('✅ ระบบทำงานแล้ว', 'success');
}

async function stopSystem() {
    updateSystemUI(false);
    state.alarmQueue = [];
    await fadeOutAndStop();
    await releaseWakeLock();
    showToast('⏸️ ระบบหยุดทำงาน');
}

/**
 * FIX: Uses cached DOM.powerText instead of querying with .querySelector() each call.
 * Also updates aria-pressed for screen reader state announcement.
 */
function updateSystemUI(isActive) {
    if (!DOM.powerBtn || !DOM.statusBadge || !DOM.statusText || !DOM.powerText) return;

    if (isActive) {
        DOM.powerBtn.classList.add('active');
        DOM.powerBtn.setAttribute('aria-pressed', 'true');
        DOM.statusBadge.classList.add('active');
        DOM.statusText.innerText = 'ONLINE';
        DOM.powerText.innerText  = 'STOP SYSTEM';
    } else {
        DOM.powerBtn.classList.remove('active');
        DOM.powerBtn.setAttribute('aria-pressed', 'false');
        DOM.statusBadge.classList.remove('active');
        DOM.statusText.innerText = 'STANDBY';
        DOM.powerText.innerText  = 'START SYSTEM';
    }
}

async function acquireWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            state.wakeLock = await navigator.wakeLock.request('screen');
            state.wakeLock.addEventListener('release', () => console.log('⚠️ Wake Lock released'));
            console.log('🔒 Wake Lock acquired');
        } catch (err) {
            console.warn('Wake Lock not available:', err);
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

// ─── Clock & Alarm ────────────────────────────────────────────────────────────
function startClock() {
    updateClock();
    if (state.clockInterval) clearInterval(state.clockInterval);
    state.clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
    try {
        const now = new Date();

        DOM.clockEl.innerText = now.toLocaleTimeString('th-TH', { hour12: false });
        DOM.dateEl.innerText  = now.toLocaleDateString('th-TH', {
            weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'
        });

        const currentMinute = now.getHours() * 60 + now.getMinutes();

        if (state.isRunning && now.getSeconds() === 0 && currentMinute !== state.lastCheckMinute) {
            state.lastCheckMinute = currentMinute;
            checkAlarm(now);
        }

        updateNextEventCountdown(now);
    } catch (e) {
        console.error('Clock update error:', e);
    }
}

function checkAlarm(now) {
    try {
        const timeStr = String(now.getHours()).padStart(2, '0') + ':' +
                        String(now.getMinutes()).padStart(2, '0');
        const day = now.getDay();

        const matches = state.schedules.filter(s =>
            s.enabled && s.time === timeStr && s.days.includes(day)
        );
        if (!matches.length) return;

        const [first, ...rest] = matches;

        state.alarmQueue = rest.map(s => ({
            soundId: s.soundId,
            loops:   Math.max(1, Math.min(10, s.loop || 1))
        }));

        // FIX: guard against first.loop being undefined/null
        playSound(first.soundId, first.loop || 1);

        if (rest.length > 0) console.log(`ℹ️ ${rest.length} alarm(s) queued`);

    } catch (e) {
        console.error('Check alarm error:', e);
    }
}

function updateNextEventCountdown(now) {
    try {
        if (!DOM.nextScheduleEl || !DOM.nextCountdownEl) return;

        const active = state.schedules.filter(s => s.enabled);
        if (!active.length) {
            DOM.nextScheduleEl.innerText         = '--:--';
            DOM.nextCountdownEl.innerText        = 'ไม่มีรายการที่เปิดใช้งาน';
            DOM.nextCountdownEl.style.color      = 'var(--text-2)';
            return;
        }

        let minDiff = Infinity;
        let nextSch = null;
        const currentDay  = now.getDay();
        const currentSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        active.forEach(sch => {
            const [h, m] = sch.time.split(':').map(Number);
            const schSecs = h * 3600 + m * 60;

            sch.days.forEach(d => {
                let dayDiff = (d - currentDay + 7) % 7;
                if (dayDiff === 0 && schSecs <= currentSecs) dayDiff = 7;
                const diff = (dayDiff * 86400) + schSecs - currentSecs;
                if (diff > 0 && diff < minDiff) { minDiff = diff; nextSch = sch; }
            });
        });

        if (nextSch) {
            DOM.nextScheduleEl.innerText = nextSch.time;

            const days = Math.floor(minDiff / 86400);
            const hrs  = Math.floor((minDiff % 86400) / 3600);
            const mins = Math.floor((minDiff % 3600) / 60);
            const secs = Math.floor(minDiff % 60);

            let text;
            if      (days > 0) text = `อีก ${days} วัน ${hrs} ชม. ${mins} นาที`;
            else if (hrs  > 0) text = `อีก ${hrs} ชม. ${mins} นาที`;
            else if (mins > 0) text = `อีก ${mins} นาที ${secs} วินาที`;
            else               text = `อีก ${secs} วินาที`;

            DOM.nextCountdownEl.innerText   = text;
            DOM.nextCountdownEl.style.color = minDiff < 300 ? 'var(--gold)' : 'var(--text-2)';
        } else {
            DOM.nextScheduleEl.innerText    = '--:--';
            DOM.nextCountdownEl.innerText   = 'ไม่มีรายการในอนาคตใกล้';
            DOM.nextCountdownEl.style.color = 'var(--text-2)';
        }
    } catch (e) {
        console.error('Countdown error:', e);
    }
}

// ─── Schedule Rendering ───────────────────────────────────────────────────────
function renderSchedule() {
    try {
        if (!DOM.scheduleContainer) return;
        DOM.scheduleContainer.innerHTML = '';

        const sorted = [...state.schedules].sort((a, b) => a.time.localeCompare(b.time));

        if (!sorted.length) {
            DOM.scheduleContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-plus" aria-hidden="true"></i>
                    <p>ยังไม่มีรายการ</p>
                    <p style="font-size:0.8rem;color:var(--text-3)">กดปุ่ม "เพิ่มรายการ" เพื่อเริ่มต้น</p>
                </div>`;
            updateStats();
            return;
        }

        const frag = document.createDocumentFragment();
        sorted.forEach(sch => {
            const idx = state.schedules.findIndex(s => s.id === sch.id);
            if (idx === -1) return;
            frag.appendChild(createScheduleElement(sch, idx));
        });
        DOM.scheduleContainer.appendChild(frag);
        updateStats();

    } catch (e) {
        console.error('Render schedule error:', e);
        showToast('เกิดข้อผิดพลาดในการแสดงผล', 'error');
    }
}

function createScheduleElement(sch, index) {
    const div = document.createElement('div');
    div.className  = `sch-item${sch.enabled ? '' : ' disabled'}`;
    div.dataset.index = index;
    div.dataset.id    = sch.id;
    div.setAttribute('role', 'listitem');

    const soundOpts = audioAssets.map(a =>
        `<option value="${a.id}" ${a.id === sch.soundId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
    ).join('');

    const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const dayPills = dayNames.map((d, i) =>
        `<div class="day-pill ${sch.days.includes(i) ? 'active' : ''}"
              role="button"
              tabindex="0"
              aria-pressed="${sch.days.includes(i)}"
              aria-label="วัน${d}"
              onclick="toggleDay(${index},${i})"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleDay(${index},${i})}"
         >${d}</div>`
    ).join('');

    const loopVal = Math.max(1, Math.min(10, sch.loop || 1));

    div.innerHTML = `
        <div class="sch-time">
            <input type="time"
                   value="${escapeHtml(sch.time)}"
                   onchange="updateSch(${index},'time',this.value)"
                   aria-label="เวลาเล่นเสียง">
        </div>
        <div class="sch-details">
            <select onchange="updateSch(${index},'soundId',this.value)" aria-label="เลือกเสียง">
                ${soundOpts}
            </select>
            <div class="sch-days" role="group" aria-label="เลือกวันที่ใช้งาน">
                ${dayPills}
            </div>
            <div class="loop-row">
                <label for="loop-${index}">เล่น</label>
                <input type="number"
                       id="loop-${index}"
                       class="loop-input"
                       min="1" max="10"
                       value="${loopVal}"
                       onchange="updateSch(${index},'loop',parseInt(this.value))"
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
                   style="color:${sch.enabled ? 'var(--green)' : 'var(--text-3)'}"
                   aria-hidden="true"></i>
            </button>
            <button class="btn-icon danger"
                    onclick="askDelete(${index})"
                    title="ลบรายการนี้"
                    aria-label="ลบรายการ ${sch.time}">
                <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
        </div>`;
    return div;
}

function updateStats() {
    const sc = document.getElementById('scheduleCount');
    const ec = document.getElementById('enabledCount');
    if (sc) sc.innerText = state.schedules.length;
    if (ec) ec.innerText = state.schedules.filter(s => s.enabled).length;
}

function updateUI() {
    updateStats();
}

// ─── Schedule CRUD ────────────────────────────────────────────────────────────
function addSchedule() {
    try {
        state.schedules.push({
            id:      `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            time:    '08:00',
            soundId: audioAssets[0].id,
            days:    [1, 2, 3, 4, 5],
            enabled: true,
            loop:    1
        });
        saveAndRender();
        showToast('✅ เพิ่มรายการสำเร็จ', 'success');
        setTimeout(() => {
            if (DOM.scheduleContainer) DOM.scheduleContainer.scrollTop = DOM.scheduleContainer.scrollHeight;
        }, 100);
    } catch (e) {
        console.error('Add schedule error:', e);
        showToast('ไม่สามารถเพิ่มรายการได้', 'error');
    }
}

function updateSch(index, key, value) {
    try {
        if (index < 0 || index >= state.schedules.length) throw new Error('Invalid index');
        if (key === 'loop') {
            value = Math.max(1, Math.min(10, parseInt(value) || 1));
        } else if (key === 'time') {
            if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) throw new Error('Invalid time format');
        } else if (key === 'soundId') {
            if (!audioAssets.find(a => a.id === value)) throw new Error('Invalid sound ID');
        }
        state.schedules[index][key] = value;
        saveAndRender();
    } catch (e) {
        console.error('Update schedule error:', e);
        showToast('ไม่สามารถอัพเดทได้: ' + e.message, 'error');
        renderSchedule();
    }
}

function toggleDay(index, dayIdx) {
    try {
        if (index < 0 || index >= state.schedules.length) return;
        const days = state.schedules[index].days;
        const pos  = days.indexOf(dayIdx);
        if (pos > -1) {
            if (days.length === 1) { showToast('ต้องเลือกอย่างน้อย 1 วัน', 'error'); return; }
            days.splice(pos, 1);
        } else {
            days.push(dayIdx);
        }
        days.sort((a, b) => a - b);
        saveAndRender();
    } catch (e) {
        console.error('Toggle day error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function toggleEnable(index) {
    try {
        if (index < 0 || index >= state.schedules.length) return;
        state.schedules[index].enabled = !state.schedules[index].enabled;
        saveAndRender();
        showToast(`${state.schedules[index].enabled ? 'เปิด' : 'ปิด'}การใช้งานแล้ว`);
    } catch (e) {
        console.error('Toggle enable error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

// ─── Modal System ─────────────────────────────────────────────────────────────
let pendingAction = null;

function askDelete(index) {
    if (index < 0 || index >= state.schedules.length) return;
    const sch   = state.schedules[index];
    const asset = audioAssets.find(a => a.id === sch.soundId);
    pendingAction = () => {
        state.schedules.splice(index, 1);
        saveAndRender();
        showToast('🗑️ ลบรายการแล้ว');
    };
    // FIX: track trigger for focus restore
    _modalTriggerEl = document.activeElement;
    showModal('ลบรายการนี้?', `ต้องการลบเวลา ${sch.time} (${asset?.name || sch.soundId}) ใช่หรือไม่?`);
}

function confirmReset() {
    pendingAction = () => {
        try {
            localStorage.removeItem('PA_DATA_V3');
            localStorage.removeItem('PA_VOLUME');
            showToast('🔄 กำลังรีเซ็ตระบบ...');
            if (state.isRunning) toggleSystem(false);
            setTimeout(() => location.reload(), 800);
        } catch (e) {
            console.error('Reset error:', e);
            showToast('ไม่สามารถรีเซ็ตได้', 'error');
        }
    };
    _modalTriggerEl = document.activeElement;
    showModal('⚠️ ล้างข้อมูลทั้งหมด', 'ข้อมูลทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้ ต้องการดำเนินการต่อหรือไม่?');
}

/**
 * FIX: Moves focus to the confirm button when modal opens (focus-trap start).
 * ESC key also closes the modal.
 */
function showModal(title, msg) {
    const modal      = document.getElementById('confirmModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMsg   = document.getElementById('modalMessage');
    let   confirmBtn = document.getElementById('modalConfirmBtn');
    if (!modal || !modalTitle || !modalMsg || !confirmBtn) return;

    modalTitle.innerText = title;
    modalMsg.innerText   = msg;
    modal.classList.add('show');

    // Replace button to remove stale event listeners
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.onclick = () => { if (pendingAction) pendingAction(); closeModal(); };

    // FIX: Move focus to confirm button for keyboard/screen reader users
    setTimeout(() => newBtn.focus(), 50);

    // Close on ESC
    const escHandler = (e) => {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * FIX: Restores focus to the element that triggered the modal.
 */
function closeModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.remove('show');
    pendingAction = null;

    // FIX: Return focus to trigger element
    if (_modalTriggerEl && typeof _modalTriggerEl.focus === 'function') {
        _modalTriggerEl.focus();
    }
    _modalTriggerEl = null;
}

// ─── Data Persistence ─────────────────────────────────────────────────────────
function saveAndRender() {
    try {
        localStorage.setItem('PA_DATA_V3', JSON.stringify(state.schedules));
        renderSchedule();
    } catch (e) {
        if (e.name === 'QuotaExceededError') showToast('พื้นที่จัดเก็บเต็ม กรุณาลบรายการบางอัน', 'error');
        else showToast('ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('PA_DATA_V3');
        if (raw) {
            state.schedules = JSON.parse(raw)
                .filter(s => s && typeof s === 'object')
                .map(sanitizeSchedule);
        } else {
            state.schedules = [
                { id: 'sch_default_1', time: '08:00', soundId: 'chime', days: [1,2,3,4,5], enabled: true, loop: 1 },
                { id: 'sch_default_2', time: '12:00', soundId: 'chime', days: [1,2,3,4,5], enabled: true, loop: 1 },
                { id: 'sch_default_3', time: '17:00', soundId: 'alarm', days: [1,2,3,4,5], enabled: true, loop: 1 }
            ];
        }
    } catch (e) {
        console.error('Load settings error:', e);
        showToast('ไม่สามารถโหลดข้อมูลได้ ใช้ค่าเริ่มต้น', 'error');
        state.schedules = [];
    }
}

/** Shared sanitizer used by both loadSettings and handleImport */
function sanitizeSchedule(s) {
    return {
        id:      (typeof s.id === 'string' && s.id)
                    ? s.id
                    : `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        time:    validateTime(s.time)                   ? s.time         : '08:00',
        soundId: validateSoundId(s.soundId)             ? s.soundId      : audioAssets[0].id,
        days:    validateDays(s.days)                   ? s.days         : [1,2,3,4,5],
        enabled: typeof s.enabled === 'boolean'         ? s.enabled      : true,
        loop:    validateLoop(s.loop)                   ? s.loop         : 1
    };
}

// ─── Validation Helpers ───────────────────────────────────────────────────────
function validateTime(t)    { return typeof t === 'string' && /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(t); }
function validateSoundId(id){ return typeof id === 'string' && audioAssets.some(a => a.id === id); }
function validateDays(d)    { return Array.isArray(d) && d.length > 0 && d.every(x => Number.isInteger(x) && x >= 0 && x <= 6); }
function validateLoop(l)    { return Number.isInteger(l) && l >= 1 && l <= 10; }

// ─── Manual Play Board ────────────────────────────────────────────────────────
function renderManualBoard() {
    if (!DOM.manualBoard) return;
    DOM.manualBoard.innerHTML = audioAssets.map(a => `
        <button class="btn btn-manual"
                onclick="playSound('${escapeHtml(a.id)}', 1)"
                aria-label="เล่น ${escapeHtml(a.name)}">
            <i class="fas fa-play" aria-hidden="true"></i> ${escapeHtml(a.name)}
        </button>`).join('');
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
let toastTimeout = null;

function showToast(msg, type = 'normal') {
    try {
        document.querySelectorAll('.toast').forEach(t => t.remove());
        if (toastTimeout) clearTimeout(toastTimeout);

        const icons  = { error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', success: 'fa-check-circle', normal: 'fa-info-circle' };
        const colors = { error: 'var(--red)', warning: 'var(--gold)', success: 'var(--green)' };

        const toast = document.createElement('div');
        toast.className   = 'toast';
        toast.innerHTML   = `<i class="fas ${icons[type] || icons.normal}" aria-hidden="true"></i><span>${escapeHtml(msg)}</span>`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');

        if (colors[type]) {
            toast.style.borderLeftColor = colors[type];
            toast.querySelector('i').style.color = colors[type];
        }

        document.body.appendChild(toast);
        toastTimeout = setTimeout(() => dismissToast(toast), 3000);
        toast.addEventListener('click', () => dismissToast(toast));

    } catch (e) {
        console.error('Toast error:', e);
    }
}

function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
}

// ─── Export / Import ──────────────────────────────────────────────────────────
function exportData() {
    try {
        const payload = {
            version:    '3.4',
            exportDate: new Date().toISOString(),
            schedules:  state.schedules,
            settings:   { volume: parseFloat(DOM.volumeSlider.value) }
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `voice-alarm-backup-${Date.now()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        showToast('📥 ส่งออกข้อมูลสำเร็จ', 'success');
    } catch (e) {
        console.error('Export error:', e);
        showToast('ไม่สามารถส่งออกข้อมูลได้', 'error');
    }
}

function triggerImport() {
    if (DOM.importFile) DOM.importFile.click();
}

function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
        showToast('ไฟล์ใหญ่เกินไป (สูงสุด 1MB)', 'error');
        e.target.value = '';
        return;
    }
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        showToast('กรุณาเลือกไฟล์ .json เท่านั้น', 'error');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const imported = JSON.parse(ev.target.result);

            let list;
            if (Array.isArray(imported)) {
                list = imported;
            } else if (imported.schedules && Array.isArray(imported.schedules)) {
                list = imported.schedules;
                // Restore saved volume if present
                if (imported.settings?.volume !== undefined) {
                    const v = Math.max(0, Math.min(1, parseFloat(imported.settings.volume)));
                    if (!isNaN(v)) {
                        DOM.volumeSlider.value = v;
                        DOM.audioPlayer.volume = v;
                        DOM.volText.innerText  = Math.round(v * 100) + '%';
                        localStorage.setItem('PA_VOLUME', v);
                    }
                }
            } else {
                throw new Error('Invalid file format');
            }

            // FIX: reuse shared sanitizeSchedule helper
            state.schedules = list
                .filter(s => s && typeof s === 'object')
                .map(sanitizeSchedule);

            if (!state.schedules.length) throw new Error('No valid schedules found');

            saveAndRender();
            showToast(`📤 นำเข้าสำเร็จ (${state.schedules.length} รายการ)`, 'success');

        } catch (err) {
            console.error('Import parse error:', err);
            showToast('ไฟล์ไม่ถูกต้องหรือเสียหาย', 'error');
        }
    };
    reader.onerror = () => showToast('ไม่สามารถอ่านไฟล์ได้', 'error');
    reader.readAsText(file);
    e.target.value = '';
}

// ─── Security Helper ──────────────────────────────────────────────────────────
function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    return s
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
}