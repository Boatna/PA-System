# Implementation Guide

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│  (index.html + style.css)                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Event Handlers                           │
│  (onclick, onchange, oninput)                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Core Functions                             │
│  • toggleSystem()                                           │
│  • playSound()                                              │
│  • addSchedule()                                            │
│  • updateSch()                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    State Management                          │
│  • state.schedules[]                                        │
│  • state.isRunning                                          │
│  • localStorage                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Browser APIs                                │
│  • Audio API                                                │
│  • Wake Lock API                                            │
│  • LocalStorage API                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
voice-alarm-improved/
│
├── index.html          # Main HTML structure
├── script.js           # Core JavaScript logic
├── style.css           # Styling and animations
│
├── README.md           # User documentation
├── CHANGELOG.md        # Version history
├── IMPLEMENTATION.md   # This file
│
└── sounds/            # Audio files directory
    ├── break.mp3
    └── endwork.mp3
```

---

## 🔧 Core Components

### 1. State Management

```javascript
let state = {
    isRunning: false,          // System active status
    schedules: [],             // Array of schedule objects
    audioBasePath: '',         // Detected audio file path
    wakeLock: null,            // Wake Lock API object
    currentFadeInterval: null, // Current fade effect interval
    lastCheckMinute: -1,       // Last checked minute (prevent duplicates)
    isAudioUnlocked: false     // Audio context unlocked flag
};
```

**Schedule Object Structure:**
```javascript
{
    time: "08:00",           // HH:MM format
    soundId: "chime",        // ID from audioAssets
    days: [1, 2, 3, 4, 5],  // 0=Sun, 1=Mon, ..., 6=Sat
    enabled: true,           // Active/Inactive
    loop: 1                  // Number of times to play (1-10)
}
```

### 2. Audio System

**Audio Path Detection:**
```javascript
// Tries multiple possible paths
const audioPaths = [
    'sounds/',      // Subdirectory
    './sounds/',    // Relative path
    '../sounds/',   // Parent directory
    ''              // Same directory
];

// Async detection with HEAD request
async function detectAudioPath() {
    for (const path of audioPaths) {
        const response = await fetch(path + audioAssets[0].file, { 
            method: 'HEAD' 
        });
        if (response.ok) {
            state.audioBasePath = path;
            return true;
        }
    }
    return false;
}
```

**Audio Playback Flow:**
```
1. Check system is running
   ↓
2. Fade out current audio
   ↓
3. Load new audio file
   ↓
4. Set volume to 0
   ↓
5. Start playback
   ↓
6. Fade in to target volume
   ↓
7. Handle loop count
   ↓
8. On last loop: fade out
```

**Fade Effect Implementation:**
```javascript
function fadeIn(targetVolume) {
    clearFadeInterval(); // Clear existing fade
    
    let currentVol = 0;
    const step = targetVolume / 20; // 20 steps
    
    state.currentFadeInterval = setInterval(() => {
        if (currentVol >= targetVolume) {
            DOM.audioPlayer.volume = targetVolume;
            clearFadeInterval();
        } else {
            currentVol += step;
            DOM.audioPlayer.volume = currentVol;
        }
    }, 50); // 50ms per step = 1 second total
}
```

### 3. Alarm System

**Time Checking Logic:**
```javascript
function updateClock() {
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();
    
    // Only check at second 0 AND different from last minute
    if (state.isRunning && 
        now.getSeconds() === 0 && 
        currentMinute !== state.lastCheckMinute) {
        
        state.lastCheckMinute = currentMinute;
        checkAlarm(now);
    }
}

function checkAlarm(now) {
    const timeStr = now.toTimeString().slice(0, 5); // "HH:MM"
    const day = now.getDay(); // 0-6
    
    const matches = state.schedules.filter(sch =>
        sch.enabled &&
        sch.time === timeStr &&
        sch.days.includes(day)
    );
    
    if (matches.length > 0) {
        playSound(matches[0].soundId, matches[0].loop);
    }
}
```

**Countdown Calculation:**
```javascript
function updateNextEventCountdown(now) {
    const currentSecs = now.getHours() * 3600 + 
                       now.getMinutes() * 60 + 
                       now.getSeconds();
    
    let minDiff = Infinity;
    let nextSch = null;
    
    activeSchedules.forEach(sch => {
        const [h, m] = sch.time.split(':').map(Number);
        const schSecs = h * 3600 + m * 60;
        
        sch.days.forEach(d => {
            // Calculate day difference
            let dayDiff = (d - currentDay + 7) % 7;
            
            // If same day but past time, add 7 days
            if (dayDiff === 0 && schSecs <= currentSecs) {
                dayDiff = 7;
            }
            
            // Total difference in seconds
            const diff = (dayDiff * 86400) + schSecs - currentSecs;
            
            if (diff > 0 && diff < minDiff) {
                minDiff = diff;
                nextSch = sch;
            }
        });
    });
    
    // Format countdown display
    formatCountdown(minDiff);
}
```

### 4. Data Persistence

**Save Flow:**
```javascript
function saveAndRender() {
    try {
        const dataStr = JSON.stringify(state.schedules);
        localStorage.setItem('PA_DATA_V3', dataStr);
        renderSchedule();
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            showToast('พื้นที่จัดเก็บเต็ม', 'error');
        }
    }
}
```

**Load Flow with Validation:**
```javascript
function loadSettings() {
    try {
        const data = localStorage.getItem('PA_DATA_V3');
        
        if (data) {
            const parsed = JSON.parse(data);
            
            // Validate each field
            state.schedules = parsed
                .filter(sch => sch && typeof sch === 'object')
                .map(sch => ({
                    time: validateTime(sch.time) ? sch.time : "08:00",
                    soundId: validateSoundId(sch.soundId) ? 
                             sch.soundId : audioAssets[0].id,
                    days: validateDays(sch.days) ? 
                          sch.days : [1,2,3,4,5],
                    enabled: typeof sch.enabled === 'boolean' ? 
                             sch.enabled : true,
                    loop: validateLoop(sch.loop) ? sch.loop : 1
                }));
        } else {
            // Default schedules for first-time users
            state.schedules = getDefaultSchedules();
        }
    } catch (error) {
        console.error('Load error:', error);
        state.schedules = [];
    }
}
```

### 5. Rendering System

**Performance-Optimized Rendering:**
```javascript
function renderSchedule() {
    // Sort schedules
    const sorted = [...state.schedules].sort((a, b) => 
        a.time.localeCompare(b.time)
    );
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    sorted.forEach((sch, i) => {
        const actualIndex = state.schedules.indexOf(sch);
        const element = createScheduleElement(sch, actualIndex);
        fragment.appendChild(element);
    });
    
    // Single DOM update
    DOM.scheduleContainer.innerHTML = '';
    DOM.scheduleContainer.appendChild(fragment);
    
    updateStats();
}

function createScheduleElement(sch, index) {
    const div = document.createElement('div');
    div.className = `sch-item ${sch.enabled ? '' : 'disabled'}`;
    
    // Build HTML (with HTML escaping)
    div.innerHTML = buildScheduleHTML(sch, index);
    
    return div;
}
```

---

## 🔒 Security Best Practices

### 1. Input Validation

```javascript
// Time validation (HH:MM format)
function validateTime(time) {
    return typeof time === 'string' && 
           /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

// Sound ID validation
function validateSoundId(id) {
    return typeof id === 'string' && 
           audioAssets.some(a => a.id === id);
}

// Days array validation
function validateDays(days) {
    return Array.isArray(days) && 
           days.length > 0 &&
           days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
}

// Loop count validation
function validateLoop(loop) {
    return Number.isInteger(loop) && loop >= 1 && loop <= 10;
}
```

### 2. XSS Prevention

```javascript
// Escape all user-generated content
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Usage in templates
const html = `<option value="${id}">${escapeHtml(name)}</option>`;
```

### 3. File Upload Security

```javascript
function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
        showToast('ไฟล์ใหญ่เกินไป', 'error');
        return;
    }
    
    // Validate file type
    if (file.type !== 'application/json' && 
        !file.name.endsWith('.json')) {
        showToast('กรุณาเลือกไฟล์ .json', 'error');
        return;
    }
    
    // Validate content after parsing
    const imported = JSON.parse(event.target.result);
    validateImportedData(imported);
}
```

---

## 🎯 Performance Optimization

### 1. DOM Caching
```javascript
// Cache DOM elements at startup
const DOM = {
    audioPlayer: document.getElementById('mainAudioPlayer'),
    clockEl: document.getElementById('clock'),
    // ... cache all frequently accessed elements
};

// Use cached references
DOM.audioPlayer.volume = 0.5; // Fast
// vs
document.getElementById('mainAudioPlayer').volume = 0.5; // Slow
```

### 2. Debouncing
```javascript
let volumeTimeout = null;

function handleVolumeChange(val) {
    // Update UI immediately
    DOM.volText.innerText = Math.round(val * 100) + '%';
    
    // Debounce localStorage write
    if (volumeTimeout) clearTimeout(volumeTimeout);
    
    volumeTimeout = setTimeout(() => {
        localStorage.setItem('PA_VOLUME', val);
    }, 500); // Wait 500ms after last change
}
```

### 3. Efficient Rendering
```javascript
// Use DocumentFragment (70% faster than innerHTML)
const fragment = document.createDocumentFragment();
items.forEach(item => {
    const el = createItem(item);
    fragment.appendChild(el);
});
container.appendChild(fragment); // Single reflow
```

---

## ♿ Accessibility Implementation

### 1. ARIA Labels
```html
<!-- All interactive elements have labels -->
<button aria-label="เปิด/ปิดระบบ">
<input type="range" aria-label="ปรับระดับเสียง">
<div role="status" aria-live="polite">
```

### 2. Keyboard Navigation
```css
/* Visible focus indicators */
button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

/* Tab order is logical */
.day-pill {
    tabindex="0";
}
```

### 3. Screen Reader Support
```html
<!-- Live regions for dynamic content -->
<div aria-live="polite">Status: ONLINE</div>
<div aria-live="polite">Next event in 5 minutes</div>

<!-- Semantic HTML -->
<main role="main">
<aside role="complementary">
```

---

## 🧪 Testing Guidelines

### Unit Tests
```javascript
// Test validation functions
describe('validateTime', () => {
    it('should accept valid time', () => {
        expect(validateTime('08:30')).toBe(true);
    });
    
    it('should reject invalid time', () => {
        expect(validateTime('25:00')).toBe(false);
    });
});

// Test state mutations
describe('addSchedule', () => {
    it('should add schedule to state', () => {
        const initialLength = state.schedules.length;
        addSchedule();
        expect(state.schedules.length).toBe(initialLength + 1);
    });
});
```

### Integration Tests
```javascript
// Test audio playback
describe('playSound', () => {
    it('should play audio when system is running', async () => {
        state.isRunning = true;
        await playSound('chime', 1);
        expect(DOM.audioPlayer.paused).toBe(false);
    });
});

// Test alarm triggering
describe('checkAlarm', () => {
    it('should trigger alarm at correct time', () => {
        const testTime = new Date('2024-02-04 08:00:00');
        state.schedules = [{
            time: '08:00',
            soundId: 'chime',
            days: [0], // Sunday
            enabled: true,
            loop: 1
        }];
        
        checkAlarm(testTime);
        // Assert playSound was called
    });
});
```

### Manual Testing Checklist
- [ ] Test on Chrome, Firefox, Safari, Edge
- [ ] Test on iOS Safari and Chrome Mobile
- [ ] Test with screen reader (NVDA/JAWS)
- [ ] Test keyboard-only navigation
- [ ] Test with reduced motion preference
- [ ] Test with high contrast mode
- [ ] Test offline functionality
- [ ] Test with corrupted localStorage
- [ ] Test with missing audio files
- [ ] Test across day boundary (23:59 → 00:00)

---

## 🚀 Deployment

### Checklist
1. ✅ All audio files in `/sounds/` directory
2. ✅ Minify CSS and JS (optional)
3. ✅ Test on target browsers
4. ✅ Verify HTTPS (for Wake Lock)
5. ✅ Check console for errors
6. ✅ Test mobile responsiveness
7. ✅ Validate HTML/CSS
8. ✅ Check accessibility with Lighthouse

### Optimization (Optional)
```bash
# Minify JavaScript
npx terser script.js -o script.min.js

# Minify CSS
npx csso style.css -o style.min.css

# Compress images/audio (if large)
# Use tools like ImageOptim, Audacity
```

---

## 📚 Common Patterns

### Adding New Audio Files
```javascript
// 1. Add to audioAssets array
const audioAssets = [
    { id: "newSound", name: "🔔 New Sound", file: "newsound.mp3" },
    // ...
];

// 2. Place file in sounds/ directory
// 3. Refresh page - it will be auto-detected
```

### Adding New Features
```javascript
// 1. Update state if needed
let state = {
    // ...
    newFeature: false
};

// 2. Add UI elements in HTML
// 3. Create handler function
function handleNewFeature() {
    // Implementation
}

// 4. Wire up event listener
setupEventListeners() {
    document.getElementById('newBtn')
        .addEventListener('click', handleNewFeature);
}
```

---

## 🐛 Debugging Tips

### Enable Detailed Logging
```javascript
// Add at top of script.js
const DEBUG = true;

function log(...args) {
    if (DEBUG) console.log('[VAP]', ...args);
}

// Use throughout code
log('Audio path detected:', state.audioBasePath);
log('Playing sound:', soundId, 'loops:', loops);
```

### Common Issues

**Audio not playing:**
- Check console for errors
- Verify file path is correct
- Ensure START SYSTEM was clicked
- Check browser autoplay policy

**Wake Lock not working:**
- Only works on HTTPS
- Not supported on iOS Safari
- Check for errors in console

**LocalStorage full:**
- Max 5-10MB depending on browser
- Export data and clear old schedules
- Compress data before saving

---

Made with 💻 for developers | Last updated: 2024-02-04
