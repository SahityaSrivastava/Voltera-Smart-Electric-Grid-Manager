/**
 * ==============================================================================
 * Voltera - Grid Operations
 * Clean, High-Performance Control System
 * ==============================================================================
 */

// Web Audio Feedback Engine (Louder, Richer, Master Gain Controlled)
const sound = {
    ctx: null,
    masterGain: null,
    enabled: localStorage.getItem('voltera_audio') !== 'false',
    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.masterGain = this.ctx.createGain();
                this.masterGain.connect(this.ctx.destination);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.enabled ? 1.0 : 0.0, this.ctx.currentTime);
        }
    },
    syncLabels() {
        const labels = document.querySelectorAll('.audio-toggle-label');
        labels.forEach(el => {
            el.textContent = this.enabled ? 'Audio: On' : 'Audio: Off';
        });
        const textEl = document.getElementById('audio-state-text');
        if (textEl) textEl.textContent = this.enabled ? 'Audio: On' : 'Audio: Off';

        const cornerBtn = document.getElementById('btn-corner-mute');
        const cornerText = document.getElementById('corner-mute-text');
        if (cornerBtn) {
            if (this.enabled) cornerBtn.classList.remove('muted');
            else cornerBtn.classList.add('muted');
        }
        if (cornerText) cornerText.textContent = this.enabled ? 'Sound: On' : 'Sound: Muted';
    },
    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('voltera_audio', this.enabled ? 'true' : 'false');
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.enabled ? 1.0 : 0.0, this.ctx.currentTime);
        }
        this.syncLabels();
        if (this.enabled) this.play('click');
    },
    play(type) {
        if (!this.enabled) return;
        try {
            this.init();
            if (!this.ctx || !this.masterGain) return;
            const now = this.ctx.currentTime;

            if (type === 'click') {
                // Louder punchy modern mechanical UI click
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(750, now);
                osc.frequency.exponentialRampToValueAtTime(1050, now + 0.04);
                gain.gain.setValueAtTime(0.26, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.05);
            } else if (type === 'dispatch') {
                // Resonant tactical dispatcher confirmation (C5 -> E5 -> G5)
                const notes = [523.25, 659.25, 783.99];
                notes.forEach((freq, idx) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                    gain.gain.setValueAtTime(0.38, now + idx * 0.07);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.16);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
                    osc.start(now + idx * 0.07);
                    osc.stop(now + idx * 0.07 + 0.16);
                });
            } else if (type === 'alert') {
                // Dual-tone warning chime (420Hz -> 310Hz)
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(420, now);
                osc.frequency.setValueAtTime(310, now + 0.09);
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.22);
            } else if (type === 'success') {
                // 4-tone rich ascending triad (C5 -> E5 -> G5 -> C6)
                const chords = [523.25, 659.25, 783.99, 1046.50];
                chords.forEach((freq, idx) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.06);
                    gain.gain.setValueAtTime(0.34, now + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.20);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
                    osc.start(now + idx * 0.06);
                    osc.stop(now + idx * 0.06 + 0.20);
                });
            }
        } catch (e) {}
    }
};

// Theme Controller (Light / Dark Mode)
const theme = {
    current: localStorage.getItem('voltera_theme') || 'dark',
    init() {
        this.apply(this.current);
    },
    syncLabels() {
        const labels = document.querySelectorAll('.theme-toggle-label');
        const text = this.current === 'light' ? 'Theme: Light' : 'Theme: Dark';
        labels.forEach(el => el.textContent = text);
    },
    apply(mode) {
        this.current = mode;
        localStorage.setItem('voltera_theme', mode);
        if (mode === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        this.syncLabels();
        if (state.map && state.map.ctx) {
            renderGISMap();
        }
    },
    toggle() {
        sound.play('click');
        const next = this.current === 'dark' ? 'light' : 'dark';
        this.apply(next);
        showToast(next === 'light' ? 'Light mode enabled' : 'Dark mode enabled', 'info');
    }
};

const state = {
    user: null,
    selectedRegionId: 'ALL',
    searchQuery: '',
    selectedIncidentForDispatch: null,
    isDispatching: false,
    regions: [],
    substations: [],
    incidents: [],
    crews: [],
    facilities: [],
    messages: [],
    users: [],
    crewAccounts: [],
    activeCrewDispatch: null,
    activeRouteWaypoints: [],
    activeRouteSimulation: null,
    unreadAlerts: [],
    activeStatusFilter: 'ACTIVE',
    refreshTimer: null,
    // GIS Map Canvas State
    map: {
        canvas: null,
        ctx: null,
        width: 800,
        height: 440,
        centerLat: 26.8467,
        centerLng: 80.9462,
        zoom: 1.0,
        panX: 0,
        panY: 0,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        hoveredSubstation: null,
        pulseAngle: 0,
        viewMode: '2d',
        layout: localStorage.getItem('voltera_map_layout') || 'full',
        isCompact: localStorage.getItem('voltera_map_compact') === 'true'
    }
};

// Lucknow Locality Geocodes for Citizen Reports
const LOCALITY_COORDS = {
    'Singar Nagar': [26.8165, 80.9020],
    'Charbagh': [26.8285, 80.9200],
    'Krishna Nagar': [26.8040, 80.8920],
    'Hazratganj': [26.8480, 80.9440],
    'Martinpurwa': [26.8500, 80.9499],
    'Aishbagh': [26.8370, 80.9150],
    'Vibhuti Khand': [26.8623, 80.9992],
    'Patrakarpuram': [26.8520, 81.0060],
    'Indira Nagar': [26.8850, 80.9850],
    'Kursi Road': [26.8920, 80.9420],
    'Jankipuram': [26.9180, 80.9380],
    'Mahanagar': [26.8780, 80.9540],
    'Chowk': [26.8680, 80.9100],
    'Thakurganj': [26.8710, 80.8990],
    'Rajajipuram': [26.8410, 80.8850],
    'Amausi': [26.7606, 80.8893],
    'Rae Bareli Road': [26.7450, 80.9380],
    'Chinhat': [26.8870, 81.0340]
};

// Region Coordinates
const REGION_CENTERS = {
    '1': { name: 'Alambagh', lat: 26.8150, lng: 80.9050, zoom: 1.4 },
    '2': { name: 'Hazratganj', lat: 26.8500, lng: 80.9499, zoom: 1.4 },
    '3': { name: 'Gomti Nagar', lat: 26.8623, lng: 80.9992, zoom: 1.4 },
    '4': { name: 'Aliganj', lat: 26.8920, lng: 80.9420, zoom: 1.4 },
    '5': { name: 'Chowk', lat: 26.8680, lng: 80.9100, zoom: 1.4 },
    '6': { name: 'Amausi & SGPGI', lat: 26.7550, lng: 80.9100, zoom: 1.3 },
    'ALL': { name: 'All Regions', lat: 26.8467, lng: 80.9462, zoom: 1.0 }
};

// UI Toast Notification
function showToast(message, type = 'normal') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}

// Quick login credential helper
window.setLogin = function(email, password, btn) {
    sound.play('click');
    clearLoginError();
    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    if (emailInput) emailInput.value = email;
    if (pwdInput) pwdInput.value = password;
    if (btn) {
        document.querySelectorAll('.roster-btn, .demo-btn, .role-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
    }
};

function showLoginError(msg) {
    const alertBox = document.getElementById('login-error-alert');
    if (alertBox) {
        alertBox.textContent = msg;
        alertBox.classList.remove('hidden');
    }
}

function clearLoginError() {
    const alertBox = document.getElementById('login-error-alert');
    if (alertBox) {
        alertBox.textContent = '';
        alertBox.classList.add('hidden');
    }
}

// Password Visibility Toggle
function setupPasswordToggle() {
    const toggleBtn = document.getElementById('btn-toggle-pwd');
    const pwdInput = document.getElementById('login-password');
    if (toggleBtn && pwdInput) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sound.play('click');
            const isPassword = pwdInput.type === 'password';
            pwdInput.type = isPassword ? 'text' : 'password';
            toggleBtn.textContent = isPassword ? 'Hide' : 'Show';
            toggleBtn.classList.toggle('visible', isPassword);
            toggleBtn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
        });
    }
}

// ==============================================================================
// 1c. ROLE-BASED ACCESS CONTROL (RBAC) CONFIGURATION
// Admin: 100% | Operator: 85% | Crew: 50% | Citizen/Guest: 25%
// ==============================================================================
const ROLE_CONFIG = {
    ADMIN: {
        role: 'ADMIN',
        title: 'Admin',
        badgeClass: 'tag-admin',
        defaultView: 'view-overview',
        allowedViews: [
            'view-overview',
            'view-incidents',
            'view-substations',
            'view-fleet',
            'view-facilities',
            'view-citizen',
            'view-crew-terminal',
            'view-users'
        ],
        bannerIcon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
        bannerHeadline: 'System Administrator Console - Full Grid Control',
        bannerMessage: 'Unrestricted administrative authority across 33/11kV telemetry, SCADA grid controls, emergency crew dispatching, and user security administration.'
    },
    OPERATOR: {
        role: 'OPERATOR',
        title: 'Operator',
        badgeClass: 'tag-operator',
        defaultView: 'view-overview',
        allowedViews: [
            'view-overview',
            'view-incidents',
            'view-substations',
            'view-fleet',
            'view-facilities',
            'view-citizen',
            'view-crew-terminal'
        ],
        bannerIcon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
        bannerHeadline: 'Grid Operations Center - Operational Access',
        bannerMessage: 'Full operational monitoring of substation feeder telemetry, fault isolation, and emergency squad dispatching. (System user account administration is restricted to Administrators).'
    },
    CREW: {
        role: 'CREW',
        title: 'Crew',
        badgeClass: 'tag-crew',
        defaultView: 'view-crew-terminal',
        allowedViews: [
            'view-crew-terminal',
            'view-fleet',
            'view-incidents',
            'view-overview'
        ],
        bannerIcon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>',
        bannerHeadline: 'Field Response Operations - Tactical Work Orders',
        bannerMessage: 'Direct tactical access to your assigned dispatch orders, turn-by-turn road route navigation, GPS telemetry, squad roster, and assigned work orders. (Substation high-voltage busbar switching and administrative settings are restricted).'
    },
    CONSUMER: {
        role: 'CONSUMER',
        title: 'Citizen',
        badgeClass: 'tag-consumer',
        defaultView: 'view-citizen',
        allowedViews: [
            'view-citizen',
            'view-overview'
        ],
        bannerIcon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        bannerHeadline: 'Citizen Public Grid Portal - Public Information',
        bannerMessage: 'Public outage docket reporting desk, token tracking, and Lucknow district supply overview map. (Internal substation switching telemetry, engineering dispatch consoles, and technician radios are restricted).'
    }
};

// View Switcher Helper (Role-Enforced)
window.switchView = function(viewId) {
    sound.play('click');
    const role = (state.user && state.user.role) ? state.user.role.toUpperCase() : 'CONSUMER';
    const config = (typeof ROLE_CONFIG !== 'undefined' && ROLE_CONFIG[role]) ? ROLE_CONFIG[role] : null;
    if (config && !config.allowedViews.includes(viewId)) {
        sound.play('alert');
        showToast(`Access Restricted: This module requires elevated permissions.`, 'warning');
        viewId = config.defaultView;
    }

    // Synchronize both desktop buttons and mobile bottom tabs
    document.querySelectorAll('.nav-btn, .mobile-tab-btn:not(.mob-menu-trigger)').forEach(b => {
        if (b.getAttribute('data-view') === viewId) {
            b.classList.add('active');
        } else if (b.getAttribute('data-view')) {
            b.classList.remove('active');
        }
    });

    // Toggle panels
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(viewId);
    if (panel) {
        panel.classList.add('active');
    }

    // Scroll to top of workspace
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (viewId === 'view-overview') {
        resizeCanvas();
        renderGISMap();
    }

    if (viewId === 'view-crew-terminal') {
        reloadCrewDispatchDetails(false);
    }

    if (viewId === 'view-users' && state.user && state.user.role === 'ADMIN') {
        loadUsersList();
    }
};

// ==============================================================================
// 1. INITIALIZATION & LOGIN PAGE AT START
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    theme.init();
    setupThemeToggle();
    setupPasswordToggle();
    setupAuthListeners();
    setupNavigation();
    setupForms();
    setupModals();
    setupAudioToggle();
    setupUserProfileMenu();
    setupMapSizeControls();
    initQuickOperationsTracker();
    loadCrewAccounts();
    setupNotificationCenter();

    // Check if previously authenticated session exists
    checkCurrentUser();

    // Disciplined background sync
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
        if (!document.hidden && state.user) {
            loadAllData(true);
        }
    }, 25000);
});

// ==============================================================================
// 1b. STANDARD 60 FPS RENDER GOVERNOR
// ==============================================================================
let mapRenderScheduled = false;
let lastRenderTime = 0;
const FRAME_INTERVAL_60FPS = 1000 / 60; // 16.667ms (Standard 60 FPS)

window.scheduleMapRender = function() {
    if (mapRenderScheduled) return;
    mapRenderScheduled = true;
    requestAnimationFrame((timestamp) => {
        mapRenderScheduled = false;
        const elapsed = timestamp - lastRenderTime;
        if (elapsed < FRAME_INTERVAL_60FPS * 0.85 && lastRenderTime !== 0) {
            return;
        }
        lastRenderTime = timestamp;
        renderGISMap();
    });
};



function initQuickOperationsTracker() {
    const quickInput = document.getElementById('quick-track-input');
    const quickBtn = document.getElementById('btn-quick-track');
    const closeBtn = document.getElementById('btn-close-quick-tracker');
    const quickCard = document.getElementById('quick-tracker-result');
    const globalSearchInput = document.getElementById('global-search');

    // Keyboard Shortcuts: '/' to focus quick input, Esc to dismiss
    window.addEventListener('keydown', (e) => {
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            if (quickInput && !document.getElementById('view-overview').classList.contains('hidden')) {
                quickInput.focus();
                quickInput.select();
            } else if (globalSearchInput) {
                globalSearchInput.focus();
                globalSearchInput.select();
            }
        } else if (e.key === 'Escape') {
            if (quickCard && !quickCard.classList.contains('hidden')) {
                quickCard.classList.add('hidden');
            }
        }
    });

    if (closeBtn && quickCard) {
        closeBtn.addEventListener('click', () => {
            quickCard.classList.add('hidden');
        });
    }

    async function executeQuickSearch() {
        const val = (quickInput ? quickInput.value : '').trim();
        if (!val) {
            showToast('Enter an outage docket (e.g. LKO-OUT-9482) or substation name', 'info');
            return;
        }

        sound.play('click');

        // Check if query looks like an Outage Docket Token
        if (/^LKO-OUT/i.test(val) || /^LKO-[A-Z0-9\-_]{3,}/i.test(val)) {
            await trackOutageQuick(val);
        } else {
            // Check if matches a known substation
            const match = state.substations.find(s => 
                (s.substation_name && s.substation_name.toLowerCase().includes(val.toLowerCase())) ||
                (s.code && s.code.toLowerCase().includes(val.toLowerCase())) ||
                (s.zone && s.zone.toLowerCase().includes(val.toLowerCase()))
            );
            if (match) {
                showToast(`Located ${match.substation_name || match.code} (${match.zone})`, 'info');
                state.map.panX = 0;
                state.map.panY = 0;
                state.map.zoom = 1.35;
                state.map.hoveredSubstation = match;
                renderGISMap();
            } else {
                await trackOutageQuick(val);
            }
        }
    }

    if (quickBtn) {
        quickBtn.addEventListener('click', (e) => {
            e.preventDefault();
            executeQuickSearch();
        });
    }
    if (quickInput) {
        quickInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeQuickSearch();
            }
        });
    }
}

async function trackOutageQuick(token) {
    const card = document.getElementById('quick-tracker-result');
    if (!card) return;

    try {
        const res = await fetch(`/api/outages/track/${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.success) {
            const tokenEl = document.getElementById('quick-res-token');
            const statusEl = document.getElementById('quick-res-status');
            const locEl = document.getElementById('quick-res-locality');
            const etaEl = document.getElementById('quick-res-eta');

            if (tokenEl) tokenEl.textContent = data.tracking_token;
            if (statusEl) {
                statusEl.textContent = data.status_label || 'Logged';
                statusEl.className = data.status_label === 'Power Restored' ? 'tag tag-normal' :
                                     data.status_label === 'Repair Crew On Site' ? 'tag tag-warning' : 'tag tag-critical';
            }
            if (locEl) locEl.textContent = data.locality || 'Lucknow Urban';
            if (etaEl) etaEl.textContent = (data.status_label === 'Power Restored' || data.eta_minutes === 0) ? 'Restored (0m)' : `${data.eta_minutes} mins`;

            // Update 4-Stage Railway Stepper
            updateRailStepper('quick-', data);

            card.classList.remove('hidden');
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            showToast(`Tracking Docket: ${data.tracking_token} [${data.status_label}]`, 'info');
        } else {
            showToast(data.error || 'Outage Docket token not found', 'error');
            card.classList.add('hidden');
        }
    } catch (err) {
        showToast('Docket tracking request failed', 'error');
    }
}

function updateRailStepper(prefix, data) {
    const stepLogged = document.getElementById(`${prefix}step-logged`);
    const stepVerified = document.getElementById(`${prefix}step-verified`);
    const stepDispatched = document.getElementById(`${prefix}step-dispatched`);
    const stepRestored = document.getElementById(`${prefix}step-restored`);

    const line1 = document.getElementById(`${prefix}line-1`);
    const line2 = document.getElementById(`${prefix}line-2`);
    const line3 = document.getElementById(`${prefix}line-3`);

    [stepLogged, stepVerified, stepDispatched, stepRestored].forEach(s => {
        if (s) s.classList.remove('step-done', 'step-active');
    });
    [line1, line2, line3].forEach(l => {
        if (l) l.classList.remove('line-active');
    });

    if (stepLogged) stepLogged.classList.add('step-done');

    const status = (data.status_label || '').toLowerCase();
    const isVerified = data.verified || status.includes('scada') || status.includes('crew') || status.includes('restored') || status.includes('site') || status.includes('investigation');

    if (isVerified && stepVerified) {
        stepVerified.classList.add('step-done');
        if (line1) line1.classList.add('line-active');
    }

    if (status.includes('dispatched') || status.includes('route') || status.includes('site') || status.includes('restored')) {
        if (stepDispatched) {
            stepDispatched.classList.add(status.includes('restored') ? 'step-done' : 'step-active');
        }
        if (line2) line2.classList.add('line-active');
    }

    if (status.includes('restored') || data.eta_minutes === 0) {
        if (stepRestored) stepRestored.classList.add('step-done');
        if (line3) line3.classList.add('line-active');
    }
}

function setupThemeToggle() {
    theme.syncLabels();
    const themeBtns = document.querySelectorAll('.theme-toggle-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            theme.toggle();
        });
    });
}

function setupAudioToggle() {
    sound.syncLabels();
    const audioBtns = document.querySelectorAll('.audio-toggle-btn');
    audioBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            sound.toggle();
        });
    });

    const cornerMuteBtn = document.getElementById('btn-corner-mute');
    if (cornerMuteBtn) {
        cornerMuteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sound.toggle();
        });
    }
}

// User Profile Popup Menu Controller
function setupUserProfileMenu() {
    const trigger = document.getElementById('user-profile-btn');
    const menu = document.getElementById('user-profile-menu');
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
            openProfileMenu();
        } else {
            closeProfileMenu();
        }
    });

    // Close when clicking anywhere outside
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            closeProfileMenu();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeProfileMenu();
        }
    });
}

function openProfileMenu() {
    const trigger = document.getElementById('user-profile-btn');
    const menu = document.getElementById('user-profile-menu');
    if (menu) {
        menu.classList.remove('hidden');
        sound.play('click');
    }
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
}

function closeProfileMenu() {
    const trigger = document.getElementById('user-profile-btn');
    const menu = document.getElementById('user-profile-menu');
    if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

window.toggleUserProfileMenu = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const menu = document.getElementById('user-profile-menu');
    if (!menu) return;
    if (menu.classList.contains('hidden')) {
        openProfileMenu();
    } else {
        closeProfileMenu();
    }
};
window.closeProfileMenu = closeProfileMenu;

// Map Mode, Layout & Sizing Controllers
function setupMapSizeControls() {
    // 1. Initial State from localStorage
    const savedLayout = localStorage.getItem('voltera_map_layout') || 'full';
    const isCompact = localStorage.getItem('voltera_map_compact') === 'true';

    applyMapLayout(savedLayout, false);
    applyMapSize(isCompact, false);

    // 2. Layout Selector: Full, Dock Left, Dock Right
    const layoutSelector = document.getElementById('map-layout-selector');
    if (layoutSelector) {
        layoutSelector.querySelectorAll('.seg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                sound.play('click');
                const layout = btn.getAttribute('data-layout');
                if (layout && layout !== state.map.layout) {
                    applyMapLayout(layout, true);
                }
            });
        });
    }

    // 3. Map Height Controls
    const toolbarBtn = document.getElementById('btn-toggle-map-size');
    if (toolbarBtn) {
        toolbarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMapSize();
        });
    }

    const menuSizeBtn = document.getElementById('btn-menu-map-size');
    if (menuSizeBtn) {
        menuSizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMapSize();
        });
    }

    // 4. Data Refresh Button
    const refreshBtn = document.getElementById('btn-refresh-data');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sound.play('click');
            loadAllData(false);
            showToast('Live telemetry refreshed', 'info');
        });
    }
}

function applyMapLayout(layout, notify = true) {
    state.map.layout = layout;
    localStorage.setItem('voltera_map_layout', layout);

    const deck = document.getElementById('overview-deck');
    if (deck) {
        deck.classList.remove('layout-full', 'layout-dock-left', 'layout-dock-right');
        if (layout === 'left') deck.classList.add('layout-dock-left');
        else if (layout === 'right') deck.classList.add('layout-dock-right');
        else deck.classList.add('layout-full');
    }

    const selector = document.getElementById('map-layout-selector');
    if (selector) {
        selector.querySelectorAll('.seg-btn').forEach(btn => {
            if (btn.getAttribute('data-layout') === layout) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    setTimeout(() => {
        resizeCanvas();
        renderGISMap();
    }, 60);

    if (notify) {
        const layoutLabels = {
            'full': 'Full Width Map View',
            'left': 'Map Docked to Left Side',
            'right': 'Map Docked to Right Side'
        };
        showToast(layoutLabels[layout] || 'Map layout updated', 'info');
    }
}

function toggleMapSize() {
    sound.play('click');
    const container = document.getElementById('map-container');
    const currentlyCompact = container ? container.classList.contains('compact-map') : false;
    applyMapSize(!currentlyCompact, true);
}

function applyMapSize(isCompact, notify = false) {
    state.map.isCompact = isCompact;
    localStorage.setItem('voltera_map_compact', isCompact ? 'true' : 'false');

    const container = document.getElementById('map-container');
    const toolbarBtn = document.getElementById('btn-toggle-map-size');
    const menuText = document.getElementById('menu-map-size-text');

    if (container) {
        if (isCompact) container.classList.add('compact-map');
        else container.classList.remove('compact-map');
    }

    if (toolbarBtn) {
        toolbarBtn.textContent = isCompact ? 'Normal Map' : 'Compact';
        toolbarBtn.title = isCompact ? 'Expand to normal height' : 'Reduce map height';
    }
    if (menuText) {
        menuText.textContent = isCompact ? 'Size: Compact' : 'Size: Normal';
    }

    setTimeout(() => {
        resizeCanvas();
        renderGISMap();
    }, 60);

    if (notify) {
        showToast(isCompact ? 'Map size reduced to compact' : 'Map expanded to normal height', 'info');
    }
}

function setupAuthListeners() {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    if (emailInput) emailInput.addEventListener('input', clearLoginError);
    if (pwdInput) pwdInput.addEventListener('input', clearLoginError);

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            sound.play('click');
            clearLoginError();
            const email = (document.getElementById('login-email').value || '').trim();
            const password = (document.getElementById('login-password').value || '').trim();
            const submitBtn = document.getElementById('btn-login-submit');

            if (!email || !password) {
                sound.play('alert');
                showLoginError('Please enter both your Username/Email and Password.');
                return;
            }

            try {
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Verifying credentials...';
                }
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (data.success) {
                    clearLoginError();
                    sound.play('success');
                    onLoginSuccess(data.user);
                    showToast(`Signed in as ${data.user.name}`, 'success');
                } else {
                    sound.play('alert');
                    showLoginError(data.error || 'Authentication failed. Please verify credentials.');
                    showToast(data.error || 'Authentication failed', 'error');
                }
            } catch (err) {
                showLoginError('Unable to connect to the authentication server.');
                showToast('Unable to connect to server', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign In to Control Console';
                }
            }
        });
    }

    // Continue as Guest Button
    const guestBtn = document.getElementById('btn-guest-explore');
    const openCrewBtn = document.getElementById('btn-login-open-crew');
    if (openCrewBtn) {
        openCrewBtn.addEventListener('click', () => {
            openSelectedCrewLogin();
        });
    }
    if (guestBtn) {
        guestBtn.addEventListener('click', async () => {
            sound.play('click');
            clearLoginError();
            try {
                guestBtn.disabled = true;
                const res = await fetch('/api/auth/guest', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    sound.play('success');
                    onLoginSuccess(data.user);
                    showToast('Connected as Public Consumer (Guest)');
                } else {
                    showLoginError(data.error || 'Guest access unavailable.');
                    showToast('Guest access unavailable', 'error');
                }
            } catch (err) {
                showLoginError('Unable to connect to server.');
                showToast('Unable to connect to server', 'error');
            } finally {
                guestBtn.disabled = false;
            }
        });
    }

function setLoginScreenVisible(visible) {
    const loginScreen = document.getElementById('login-screen');
    const appWorkspace = document.getElementById('app-workspace');
    if (visible) {
        if (loginScreen) {
            loginScreen.classList.remove('hidden');
            loginScreen.style.setProperty('display', 'flex', 'important');
        }
        if (appWorkspace) {
            appWorkspace.classList.add('hidden');
            appWorkspace.style.setProperty('display', 'none', 'important');
        }
    } else {
        if (loginScreen) {
            loginScreen.classList.add('hidden');
            loginScreen.style.setProperty('display', 'none', 'important');
        }
        if (appWorkspace) {
            appWorkspace.classList.remove('hidden');
            appWorkspace.style.setProperty('display', 'flex', 'important');
        }
    }
}

    // Sign Out Button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            sound.play('click');
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
            } catch (err) {}
            sessionStorage.removeItem('voltera_active_session');
            state.user = null;
            setLoginScreenVisible(true);
            showToast('Signed out');
        });
    }

    // Toolbar Refresh Button
    const refreshBtn = document.getElementById('btn-refresh-data');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            sound.play('click');
            loadAllData(false);
            showToast('Grid data refreshed', 'success');
        });
    }
}

async function checkCurrentUser() {
    // If no active session in current tab, always show login page at start
    const hasActiveSession = sessionStorage.getItem('voltera_active_session') === 'true';
    if (!hasActiveSession) {
        setLoginScreenVisible(true);
        return;
    }

    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated && data.user) {
            onLoginSuccess(data.user);
        } else {
            sessionStorage.removeItem('voltera_active_session');
            setLoginScreenVisible(true);
        }
    } catch (err) {
        sessionStorage.removeItem('voltera_active_session');
        setLoginScreenVisible(true);
    }
}

function renderRoleContextBanner(config) {
    const container = document.getElementById('role-context-banner-container');
    if (!container) return;

    let actionBtnHtml = '';
    if (config.role === 'CONSUMER') {
        actionBtnHtml = `<button type="button" class="btn btn-secondary btn-xs" onclick="switchView('view-citizen')">Open Citizen Outage Desk &rarr;</button>`;
    } else if (config.role === 'CREW') {
        actionBtnHtml = `<button type="button" class="btn btn-primary btn-xs" onclick="switchView('view-crew-terminal')">Open My Dispatch Terminal &rarr;</button>`;
    }

    container.innerHTML = `
        <div class="role-scope-banner banner-${config.role.toLowerCase()}">
            <div class="scope-icon-wrap">${config.bannerIcon}</div>
            <div class="scope-text-wrap">
                <div class="scope-title">${config.bannerHeadline}</div>
                <div class="scope-desc">${config.bannerMessage}</div>
            </div>
            ${actionBtnHtml ? `<div class="scope-action-wrap">${actionBtnHtml}</div>` : ''}
        </div>
    `;
}

function applyRoleBasedAccess(user) {
    const role = (user && user.role) ? user.role.toUpperCase() : 'CONSUMER';
    const config = ROLE_CONFIG[role] || ROLE_CONFIG.CONSUMER;
    state.activeRoleConfig = config;

    // 1. Navigation items visibility (desktop & mobile)
    document.querySelectorAll('.nav-btn, .mobile-tab-btn:not(.mob-menu-trigger)').forEach(btn => {
        const viewId = btn.getAttribute('data-view');
        if (!viewId) return;
        if (config.allowedViews.includes(viewId)) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });

    // Mobile tabs specific role differentiation (Route vs Fleet)
    const mobCrewBtn = document.getElementById('mob-nav-crew');
    const mobFleetBtn = document.getElementById('mob-nav-fleet');
    if (mobCrewBtn && mobFleetBtn) {
        if (role === 'CREW') {
            mobCrewBtn.classList.remove('hidden');
            mobFleetBtn.classList.add('hidden');
        } else if (config.allowedViews.includes('view-fleet')) {
            mobCrewBtn.classList.add('hidden');
            mobFleetBtn.classList.remove('hidden');
        } else {
            mobCrewBtn.classList.add('hidden');
            mobFleetBtn.classList.add('hidden');
        }
    }

    // 2. Profile dropdown navigation shortcuts visibility
    const shortcuts = document.querySelectorAll('#dropdown-nav-shortcuts button[data-target-view]');
    shortcuts.forEach(btn => {
        const targetView = btn.getAttribute('data-target-view');
        if (config.allowedViews.includes(targetView)) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });

    // 3. Header badges and profile menu role info
    const roleBadge = document.getElementById('user-role-badge');
    const dropRole = document.getElementById('dropdown-user-role');
    const tierBadge = document.getElementById('dropdown-tier-badge');
    if (roleBadge) {
        roleBadge.textContent = config.title;
        roleBadge.className = `role-badge tag ${config.badgeClass}`;
    }
    if (dropRole) {
        dropRole.textContent = config.title;
        dropRole.className = `tag ${config.badgeClass}`;
    }
    if (tierBadge) {
        tierBadge.remove();
    }

    // 4. Render Dynamic Role Context Banner
    renderRoleContextBanner(config);

    // 5. Update slider buttons for visible module list
    setTimeout(updateNavSliderButtons, 120);
}

function onLoginSuccess(user) {
    state.user = user;
    sessionStorage.setItem('voltera_active_session', 'true');
    setLoginScreenVisible(false);

    const nameLabel = document.getElementById('user-display-name');
    const userAvatar = document.getElementById('user-avatar');
    const dropAvatar = document.getElementById('dropdown-avatar');
    const dropName = document.getElementById('dropdown-user-name');
    const dropEmail = document.getElementById('dropdown-user-email');

    const rawName = user.name || user.email || 'User';
    const initials = rawName.split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U';

    if (userAvatar) userAvatar.textContent = initials;
    if (dropAvatar) dropAvatar.textContent = initials;
    if (nameLabel) nameLabel.textContent = rawName;
    if (dropName) dropName.textContent = rawName;
    if (dropEmail) dropEmail.textContent = user.email_masked || user.email || '--';

    // Apply strict Role-Based Access Control
    applyRoleBasedAccess(user);

    // Apply map preferences
    const isCompact = localStorage.getItem('voltera_map_compact') === 'true';
    applyMapSize(isCompact, false);
    applyMapLayout(state.map.layout, false);

    // Initialize GIS Canvas map and load grid data
    initGISMap();
    requestAnimationFrame(() => {
        resizeCanvas();
        renderGISMap();
    });
    loadAllData();
    checkActiveCrewAlerts();

    const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.CONSUMER;
    if (user.role === 'CREW') {
        reloadCrewDispatchDetails(false, user.crew_id);
    }
    switchView(roleConfig.defaultView);
}

// ==============================================================================
// 2. NAVIGATION & TABS
// ==============================================================================
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn, .mobile-tab-btn:not(.mob-menu-trigger)');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = btn.getAttribute('data-view');
            if (viewId) {
                switchView(viewId);
            }
        });
    });

    const navScroller = document.getElementById('main-nav-links');
    if (navScroller) {
        navScroller.addEventListener('scroll', updateNavSliderButtons);
        window.addEventListener('resize', updateNavSliderButtons);
        setTimeout(updateNavSliderButtons, 150);
    }

    const globalSearch = document.getElementById('global-search');
    if (globalSearch) {
        let searchDebounceTimer = null;
        globalSearch.addEventListener('input', (e) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                state.searchQuery = e.target.value.trim().toLowerCase();
                renderSubstations();
                renderOverviewTelemetry();
                renderIncidents();
                renderOverviewIncidents();
                renderFleet();
                renderGISMap();
            }, 120);
        });
    }

    const incFilter = document.getElementById('incidents-status-filter');
    if (incFilter) {
        incFilter.querySelectorAll('.pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sound.play('click');
                incFilter.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.activeStatusFilter = btn.getAttribute('data-status');
                renderIncidents();
            });
        });
    }
}

// Menu Scroller Slider Controls
window.slideNav = function(delta) {
    const nav = document.getElementById('main-nav-links');
    if (nav) {
        nav.scrollBy({ left: delta, behavior: 'smooth' });
        setTimeout(updateNavSliderButtons, 150);
    }
};

window.updateNavSliderButtons = function() {
    const nav = document.getElementById('main-nav-links');
    const btnLeft = document.getElementById('btn-nav-slide-left');
    const btnRight = document.getElementById('btn-nav-slide-right');
    if (!nav || !btnLeft || !btnRight) return;
    const canScrollLeft = nav.scrollLeft > 4;
    const canScrollRight = (nav.scrollWidth - nav.clientWidth - nav.scrollLeft) > 4;
    btnLeft.classList.toggle('disabled', !canScrollLeft);
    btnRight.classList.toggle('disabled', !canScrollRight);
};

// ==============================================================================
// 3. INTERACTIVE GIS VECTOR MAP (100% RELIABLE, ZERO EXTERNAL TILE BLOCKING)
// ==============================================================================
function initGISMap() {
    const canvas = document.getElementById('gis-canvas');
    if (!canvas) return;

    state.map.canvas = canvas;
    state.map.ctx = canvas.getContext('2d');
    resizeCanvas();

    if (state.map.initialized) {
        renderGISMap();
        return;
    }
    state.map.initialized = true;

    let resizeRafId = null;
    window.addEventListener('resize', () => {
        if (resizeRafId) cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
            resizeCanvas();
            renderGISMap();
        });
    });

    // Map Controls
    const zoomInBtn = document.getElementById('map-zoom-in');
    const zoomOutBtn = document.getElementById('map-zoom-out');
    const resetBtn = document.getElementById('map-reset');

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            sound.play('click');
            state.map.zoom = Math.min(3.0, state.map.zoom * 1.25);
            renderGISMap();
        });
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            sound.play('click');
            state.map.zoom = Math.max(0.6, state.map.zoom / 1.25);
            renderGISMap();
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            sound.play('click');
            state.map.zoom = 1.0;
            state.map.panX = 0;
            state.map.panY = 0;
            state.selectedRegionId = 'ALL';
            const group = document.getElementById('region-filter-group');
            if (group) {
                group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
                const allBtn = group.querySelector('[data-region="ALL"]');
                if (allBtn) allBtn.classList.add('active');
            }
            renderOverviewTelemetry();
            renderOverviewIncidents();
            renderSubstations();
            renderGISMap();
        });
    }

    // Drag / Pan Events (Desktop Mouse)
    canvas.addEventListener('mousedown', (e) => {
        state.map.isDragging = true;
        state.map.dragStartX = e.clientX - state.map.panX;
        state.map.dragStartY = e.clientY - state.map.panY;
    });

    window.addEventListener('mouseup', () => {
        state.map.isDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (state.map.isDragging) {
            state.map.panX = e.clientX - state.map.dragStartX;
            state.map.panY = e.clientY - state.map.dragStartY;
            scheduleMapRender();
            return;
        }

        // Hover Detection
        const hovered = findSubstationAtPos(mouseX, mouseY);
        const tooltip = document.getElementById('map-tooltip');

        if (hovered) {
            canvas.style.cursor = 'pointer';
            if (tooltip) {
                let tagClass = 'tag-normal';
                if (hovered.status === 'CRITICAL') tagClass = 'tag-critical';
                else if (hovered.status === 'WARNING') tagClass = 'tag-warning';

                tooltip.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 3px;">${escapeHtml(hovered.substation_name || hovered.code)}</div>
                    <div style="color: var(--text-secondary); font-size: 11px;">Zone: ${escapeHtml(hovered.zone)} &bull; <span class="tag ${tagClass}">${hovered.status}</span></div>
                    <div style="color: var(--text-secondary); font-size: 11px; margin-top: 2px;">Load: ${Math.round(hovered.load_pct || 0)}% &bull; Voltage: ${Math.round(hovered.voltage_v || 230)} V</div>
                `;
                tooltip.style.left = `${mouseX}px`;
                tooltip.style.top = `${mouseY}px`;
                tooltip.classList.remove('hidden');
            }
        } else {
            canvas.style.cursor = 'grab';
            if (tooltip) tooltip.classList.add('hidden');
        }
    });

    // Mobile & Tablet Touch Support (1-Finger Pan, 2-Finger Pinch Zoom)
    let touchStartX = 0;
    let touchStartY = 0;
    let initialPinchDist = null;
    let initialPinchZoom = 1.0;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            state.map.isDragging = true;
            touchStartX = e.touches[0].clientX - state.map.panX;
            touchStartY = e.touches[0].clientY - state.map.panY;
        } else if (e.touches.length === 2) {
            state.map.isDragging = false;
            initialPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialPinchZoom = state.map.zoom;
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && state.map.isDragging) {
            state.map.panX = e.touches[0].clientX - touchStartX;
            state.map.panY = e.touches[0].clientY - touchStartY;
            scheduleMapRender();
        } else if (e.touches.length === 2 && initialPinchDist) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scaleFactor = currentDist / initialPinchDist;
            state.map.zoom = Math.min(3.5, Math.max(0.6, initialPinchZoom * scaleFactor));
            scheduleMapRender();
        }
    }, { passive: true });

    const resetTouchDrag = () => {
        state.map.isDragging = false;
        initialPinchDist = null;
    };
    canvas.addEventListener('touchend', resetTouchDrag, { passive: true });
    window.addEventListener('touchend', resetTouchDrag, { passive: true });
    window.addEventListener('touchcancel', resetTouchDrag, { passive: true });

    // Substation click selection
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const clicked = findSubstationAtPos(mouseX, mouseY);
        if (clicked) {
            sound.play(clicked.status === 'CRITICAL' ? 'alert' : 'click');
            showToast(`${clicked.substation_name}: ${clicked.status} (${Math.round(clicked.load_pct)}% Load)`);
        }
    });

    // Mouse Wheel Zoom
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;
        state.map.zoom = Math.max(0.6, Math.min(3.5, state.map.zoom * zoomDelta));
        scheduleMapRender();
    }, { passive: false });
}

function resizeCanvas() {
    const container = document.getElementById('map-container');
    if (!container || !state.map.canvas) return;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = (rect.width && rect.width > 50) ? rect.width : (container.clientWidth || 800);
    const h = (rect.height && rect.height > 50) ? rect.height : (container.clientHeight || 440);
    state.map.width = w;
    state.map.height = h;
    state.map.canvas.width = Math.floor(w * dpr);
    state.map.canvas.height = Math.floor(h * dpr);
    if (state.map.ctx) {
        state.map.ctx.setTransform(1, 0, 0, 1, 0, 0);
        state.map.ctx.scale(dpr, dpr);
    }
}

// ==============================================================================
// 3b. GIS MAP PROJECTION & 2D SINGLE-LINE SCHEMATIC RENDERING
// ==============================================================================

const GOMTI_RIVER_WAYPOINTS = [
    [26.892, 80.880],
    [26.881, 80.898],
    [26.872, 80.916],
    [26.862, 80.938],
    [26.855, 80.955],
    [26.853, 80.976],
    [26.860, 80.998],
    [26.852, 81.025],
    [26.848, 81.050]
];

const GRID_CONNECTIONS = [
    ['LKO-AL-TF01', 'LKO-HZ-TF01'], // Kursi Road -> Martinpurwa
    ['LKO-HZ-TF01', 'LKO-HZ-TF02'], // Martinpurwa -> Hazratganj Central
    ['LKO-HZ-TF02', 'LKO-AB-TF01'], // Hazratganj -> Singar Nagar
    ['LKO-AB-TF01', 'LKO-AB-TF02'], // Singar Nagar -> Charbagh
    ['LKO-AB-TF01', 'LKO-AB-TF03'], // Singar Nagar -> Krishna Nagar
    ['LKO-HZ-TF01', 'LKO-GN-TF01'], // Martinpurwa -> Vibhuti Khand
    ['LKO-GN-TF01', 'LKO-GN-TF02'], // Vibhuti Khand -> Patrakarpuram
    ['LKO-GN-TF01', 'LKO-GN-TF03'], // Vibhuti Khand -> Indira Nagar
    ['LKO-AL-TF01', 'LKO-AL-TF02'], // Kursi Road -> Jankipuram
    ['LKO-AL-TF01', 'LKO-AL-TF03'], // Kursi Road -> Mahanagar
    ['LKO-CK-TF01', 'LKO-CK-TF02'], // Chowk -> Thakurganj
    ['LKO-CK-TF01', 'LKO-CK-TF03'], // Chowk -> Rajajipuram
    ['LKO-AM-TF01', 'LKO-AM-TF02'], // Amausi -> SGPGI
    ['LKO-AM-TF02', 'LKO-AM-TF03'], // SGPGI -> Chinhat
];

function projectToMap(lat, lng) {
    const minLat = 26.720, maxLat = 26.940;
    const minLng = 80.860, maxLng = 81.060;

    const normX = (lng - minLng) / (maxLng - minLng);
    const normY = 1.0 - (lat - minLat) / (maxLat - minLat);

    const w = state.map.width;
    const h = state.map.height;
    const cx = w / 2;
    const cy = h / 2;

    const baseScale = Math.min(w, h) * 0.94;
    return {
        x: cx + (normX - 0.5) * baseScale * state.map.zoom + state.map.panX,
        y: cy + (normY - 0.5) * baseScale * state.map.zoom + state.map.panY
    };
}

function findSubstationAtPos(px, py) {
    const substations = getFilteredSubstations();

    for (let i = substations.length - 1; i >= 0; i--) {
        const tf = substations[i];
        if (!tf.latitude || !tf.longitude) continue;
        const pos = projectToMap(tf.latitude, tf.longitude);
        const dist = Math.hypot(px - pos.x, py - pos.y);
        if (dist <= 15) return tf;
    }
    return null;
}

// Master Render Router (2D Single-Line Schematic Vector Map)
function renderGISMap() {
    const ctx = state.map.ctx;
    if (!ctx) return;

    const w = state.map.width;
    const h = state.map.height;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    render2DGrid(ctx, w, h, isLight);
}

// ------------------------------------------------------------------------------
// 2D GRID SCHEMATIC - Crisp single-line schematic
// ------------------------------------------------------------------------------
function render2DGrid(ctx, w, h, isLight) {
    // 1. Background
    ctx.fillStyle = isLight ? '#F3F4F6' : '#000000';
    ctx.fillRect(0, 0, w, h);

    // 2. Solid Orthogonal Coordinate Grid (Zero blur/glow)
    ctx.strokeStyle = isLight ? '#E5E7EB' : '#171717';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // 3. Gomti River (Solid Clean Flow)
    ctx.beginPath();
    ctx.strokeStyle = isLight ? '#93C5FD' : '#1E3A8A';
    ctx.lineWidth = Math.max(6, 9 * state.map.zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    GOMTI_RIVER_WAYPOINTS.forEach((pt, idx) => {
        const p = projectToMap(pt[0], pt[1], '2d');
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // River Label
    const midRiver = projectToMap(26.856, 80.965, '2d');
    ctx.fillStyle = isLight ? '#1D4ED8' : '#60A5FA';
    ctx.font = '600 11px Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillText('Gomti River', midRiver.x - 26, midRiver.y - 12);

    // 4. Regional Boundaries (Solid Dashed Rings)
    Object.keys(REGION_CENTERS).forEach(key => {
        if (key === 'ALL') return;
        const reg = REGION_CENTERS[key];
        const p = projectToMap(reg.lat, reg.lng, '2d');
        const radius = 65 * state.map.zoom;

        ctx.beginPath();
        ctx.fillStyle = isLight ? '#FFFFFF' : '#0A0A0A';
        ctx.strokeStyle = isLight ? '#D1D5DB' : '#262626';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Region Label
        const zoneLabel = reg.name;
        ctx.font = '600 11px Segoe UI, Roboto, Arial, sans-serif';
        const lx = p.x - (zoneLabel.length * 3);
        const ly = p.y + radius + 14;
        ctx.strokeStyle = isLight ? '#FFFFFF' : '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(zoneLabel, lx, ly);
        ctx.fillStyle = isLight ? '#374151' : '#9CA3AF';
        ctx.fillText(zoneLabel, lx, ly);
    });

    // 5. High-Voltage Grid Lines (Solid Crisp Connections)
    ctx.strokeStyle = isLight ? '#2563EB' : '#3B82F6';
    ctx.lineWidth = 1.5;
    GRID_CONNECTIONS.forEach(([codeA, codeB]) => {
        const tfA = state.substations.find(t => t.code === codeA);
        const tfB = state.substations.find(t => t.code === codeB);
        if (tfA && tfB) {
            const pA = projectToMap(tfA.latitude, tfA.longitude, '2d');
            const pB = projectToMap(tfB.latitude, tfB.longitude, '2d');
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.stroke();
        }
    });

    // 5b. Active Crew Dispatch Route (Highlighted Emergency Transit Vector)
    if (state.activeRouteWaypoints && state.activeRouteWaypoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -(Date.now() / 80) % 14;
        ctx.beginPath();
        state.activeRouteWaypoints.forEach((wp, idx) => {
            const pt = projectToMap(wp[0], wp[1], '2d');
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.restore();

        // Draw start crew truck pin
        const startWp = state.activeRouteWaypoints[0];
        const startPt = projectToMap(startWp[0], startWp[1], '2d');
        ctx.fillStyle = '#10B981';
        ctx.beginPath();
        ctx.arc(startPt.x, startPt.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '700 10.5px Segoe UI, Roboto, sans-serif';
        ctx.fillStyle = isLight ? '#065F46' : '#34D399';
        ctx.fillText('ACTIVE CREW', startPt.x + 10, startPt.y + 4);
    }

    // 6. Substation Nodes (Solid High-Contrast Colors, Zero Halos)
    const filteredTfs = getFilteredSubstations();
    filteredTfs.forEach(tf => {
        if (!tf.latitude || !tf.longitude) return;
        const pos = projectToMap(tf.latitude, tf.longitude, '2d');

        let color = isLight ? '#15803D' : '#16A34A';
        let radius = 5.5;

        if (tf.status === 'CRITICAL') {
            color = isLight ? '#B91C1C' : '#DC2626';
            radius = 7;

            // Solid crisp square target indicator
            const sqSize = 20;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(pos.x - sqSize / 2, pos.y - sqSize / 2, sqSize, sqSize);
        } else if (tf.status === 'WARNING') {
            color = isLight ? '#B45309' : '#D97706';
            radius = 6;
        }

        // Solid outer ring (100% solid, no alpha glow)
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.arc(pos.x, pos.y, radius + 3, 0, Math.PI * 2);
        ctx.stroke();

        // Core solid dot
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Substation label with solid background box for maximum clarity
        const shortName = (tf.substation_name || tf.code).replace(/Power House|Substation|33\/11kV|132\/33kV|220kV/g, '').trim();
        const labelText = `${shortName} (${Math.round(tf.load_pct || 0)}%)`;
        const lx = pos.x + radius + 7;
        const ly = pos.y + 4;

        ctx.font = '600 11px Segoe UI, Roboto, Arial, sans-serif';
        ctx.strokeStyle = isLight ? '#FFFFFF' : '#000000';
        ctx.lineWidth = 3.5;
        ctx.strokeText(labelText, lx, ly);

        ctx.fillStyle = isLight ? '#111827' : '#FFFFFF';
        ctx.fillText(labelText, lx, ly);
    });

    // 7. Mode Badge
    drawMapHUD(ctx, 'VOLTERA POWER GRID', 'Lucknow Central 33/11kV Network', isLight);
}

function drawMapHUD(ctx, title, sub, isLight) {
    ctx.fillStyle = isLight ? '#FFFFFF' : '#08132B';
    ctx.fillRect(12, 12, 235, 44);
    ctx.strokeStyle = isLight ? '#BFDBFE' : '#1E3A8A';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, 235, 44);

    // Left blue accent strip
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(12, 12, 4, 44);

    ctx.font = '700 10.5px Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillStyle = isLight ? '#1D4ED8' : '#60A5FA';
    ctx.fillText(title, 24, 29);

    ctx.font = '500 9.5px Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillStyle = isLight ? '#4B5563' : '#94A3B8';
    ctx.fillText(sub, 24, 44);
}

// ==============================================================================
// 4. DATA LOADING & STATE
// ==============================================================================
let isLoadingData = false;
let _lastDataSignature = '';

function computeDataSignature(regions, tfs, incs, crews, facs, msgs) {
    const regSig = (regions || []).map(r => `${r.id}-${r.name}`).join(';');
    const tfSig = (tfs || []).map(t => `${t.id}-${t.status}-${Math.round(t.load_pct || 0)}`).join(';');
    const incSig = (incs || []).map(i => `${i.id}-${i.status}-${(i.dispatches || []).length}`).join(';');
    const crewSig = (crews || []).map(c => `${c.id}-${c.status}`).join(';');
    const facSig = (facs || []).length;
    const msgSig = (msgs || []).length;
    return `${regSig}|${tfSig}|${incSig}|${crewSig}|${facSig}|${msgSig}`;
}

async function loadAllData(isBackground = false) {
    if (isLoadingData) return;
    isLoadingData = true;
    try {
        const [regionsRes, tfsRes, incsRes, crewsRes, facsRes, msgsRes] = await Promise.all([
            fetch('/api/regions').then(r => r.json()).catch(() => ({ regions: [] })),
            fetch('/api/transformers').then(r => r.json()).catch(() => ({ transformers: [] })),
            fetch('/api/incidents').then(r => r.json()).catch(() => ({ incidents: [] })),
            fetch('/api/crews').then(r => r.json()).catch(() => ({ crews: [] })),
            fetch('/api/critical-facilities').then(r => r.json()).catch(() => ({ facilities: [] })),
            fetch('/api/messages').then(r => r.json()).catch(() => ({ messages: [] }))
        ]);

        const nextSig = computeDataSignature(
            regionsRes.regions,
            tfsRes.transformers,
            incsRes.incidents,
            crewsRes.crews,
            facsRes.facilities,
            msgsRes.messages
        );

        // If background sync and telemetry data hasn't changed, avoid expensive DOM reflows
        if (isBackground && nextSig === _lastDataSignature) {
            return;
        }
        _lastDataSignature = nextSig;

        if (regionsRes.regions) state.regions = regionsRes.regions;
        if (tfsRes.transformers) state.substations = tfsRes.transformers;
        if (incsRes.incidents) state.incidents = incsRes.incidents;
        if (crewsRes.crews) state.crews = crewsRes.crews;
        if (facsRes.facilities) state.facilities = facsRes.facilities;
        if (msgsRes.messages) state.messages = msgsRes.messages;

        // Render UI panels
        renderRegionFilters();
        renderStats();
        renderOverviewTelemetry();
        renderOverviewIncidents();
        renderSubstations();
        renderIncidents();
        renderFleet();
        renderFacilities();
        renderMessages();
        renderGISMap();

        // Update nav badges
        const badgeInc = document.getElementById('badge-incidents');
        const badgeFleet = document.getElementById('badge-fleet');
        const activeIncs = state.incidents.filter(i => i.status !== 'RESOLVED');
        if (badgeInc) badgeInc.textContent = activeIncs.length;
        const mobBadgeInc = document.getElementById('mob-badge-incidents');
        if (mobBadgeInc) mobBadgeInc.textContent = activeIncs.length;
        if (badgeFleet) badgeFleet.textContent = state.crews.filter(c => c.status === 'AVAILABLE').length;

        // Refresh dynamic notifications & slider status
        renderNotificationCenter();
        updateNavSliderButtons();

    } catch (err) {
        if (!isBackground) {
            showToast('Failed to load grid data', 'error');
        }
    } finally {
        isLoadingData = false;
    }
}

function getFilteredSubstations() {
    return state.substations.filter(tf => {
        const matchRegion = (state.selectedRegionId === 'ALL') || (String(tf.grid_region_id) === String(state.selectedRegionId));
        const matchSearch = !state.searchQuery || 
            (tf.substation_name && tf.substation_name.toLowerCase().includes(state.searchQuery)) ||
            (tf.zone && tf.zone.toLowerCase().includes(state.searchQuery)) ||
            (tf.code && tf.code.toLowerCase().includes(state.searchQuery));
        return matchRegion && matchSearch;
    });
}

function renderRegionFilters() {
    const container = document.getElementById('region-filter-group');
    if (!container || !state.regions || state.regions.length === 0) return;

    const existingPills = container.querySelectorAll('.pill-btn');
    if (existingPills.length > 1) return;

    state.regions.forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'pill-btn';
        btn.textContent = r.name;
        btn.setAttribute('data-region', String(r.id));
        btn.addEventListener('click', () => {
            sound.play('click');
            container.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.selectedRegionId = String(r.id);

            // Center GIS Map on region
            if (REGION_CENTERS[r.id]) {
                const reg = REGION_CENTERS[r.id];
                state.map.zoom = reg.zoom || 1.3;
                const p = projectToMap(reg.lat, reg.lng);
                const cx = state.map.width / 2;
                const cy = state.map.height / 2;
                state.map.panX += cx - p.x;
                state.map.panY += cy - p.y;
            }

            renderOverviewTelemetry();
            renderOverviewIncidents();
            renderSubstations();
            renderIncidents();
            renderFleet();
            renderGISMap();
        });
        container.appendChild(btn);
    });

    const allBtn = container.querySelector('[data-region="ALL"]');
    if (allBtn) {
        allBtn.addEventListener('click', () => {
            sound.play('click');
            container.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            state.selectedRegionId = 'ALL';
            state.map.zoom = 1.0;
            state.map.panX = 0;
            state.map.panY = 0;

            renderOverviewTelemetry();
            renderOverviewIncidents();
            renderSubstations();
            renderIncidents();
            renderFleet();
            renderGISMap();
        });
    }
}

// ==============================================================================
// 5. VIEW RENDERING MODULES
// ==============================================================================

function renderStats() {
    const filteredTfs = getFilteredSubstations();
    const activeIncs = state.incidents.filter(i => i.status !== 'RESOLVED');
    const availCrews = state.crews.filter(c => c.status === 'AVAILABLE');

    const statSubs = document.getElementById('stat-substations');
    const statIncs = document.getElementById('stat-incidents');
    const statCrews = document.getElementById('stat-crews');
    const statFacs = document.getElementById('stat-facilities');

    if (statSubs) statSubs.textContent = filteredTfs.length;
    if (statIncs) statIncs.textContent = activeIncs.length;
    if (statCrews) statCrews.textContent = availCrews.length;
    if (statFacs) statFacs.textContent = state.facilities.length;

    // Quick chip counter & Pill updates
    const quickChipFaults = document.getElementById('quick-chip-faults');
    if (quickChipFaults) {
        if (activeIncs.length === 0) {
            quickChipFaults.className = 'pill-chip chip-green';
            quickChipFaults.innerHTML = '<span class="chip-dot"></span> 0 Active Faults';
        } else {
            quickChipFaults.className = 'pill-chip chip-red';
            quickChipFaults.innerHTML = `<span class="chip-dot"></span> <span id="quick-fault-count">${activeIncs.length}</span> Active Fault${activeIncs.length > 1 ? 's' : ''}`;
        }
    } else {
        const quickFaultCount = document.getElementById('quick-fault-count');
        if (quickFaultCount) quickFaultCount.textContent = activeIncs.length;
    }

    const incidentsPill = document.getElementById('stat-incidents-pill');
    if (incidentsPill) {
        if (activeIncs.length === 0) {
            incidentsPill.innerHTML = '<span class="stat-pill-dot green"></span> ZERO FAULTS';
        } else {
            incidentsPill.innerHTML = `<span class="stat-pill-dot amber"></span> ${activeIncs.length} FAULT${activeIncs.length > 1 ? 'S' : ''} DETECTED`;
        }
    }
}

// 5a. Overview Telemetry Table (Max 8 rows)
function renderOverviewTelemetry() {
    const tbody = document.getElementById('overview-tfs-tbody');
    if (!tbody) return;

    const list = getFilteredSubstations().slice(0, 8);
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">No substations found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(tf => {
        let tagClass = 'tag-normal';
        let loadFillClass = 'norm';
        if (tf.status === 'CRITICAL') {
            tagClass = 'tag-critical';
            loadFillClass = 'crit';
        } else if (tf.status === 'WARNING') {
            tagClass = 'tag-warning';
            loadFillClass = 'warn';
        }

        const loadPct = Math.round(tf.load_pct || 0);

        return `
            <tr>
                <td><strong>${escapeHtml(tf.substation_name || tf.code)}</strong></td>
                <td>${escapeHtml(tf.zone)}</td>
                <td>
                    <span class="mono-code">${loadPct}%</span>
                    <div class="mini-bar">
                        <div class="mini-bar-fill ${loadFillClass}" style="width: ${Math.min(100, loadPct)}%;"></div>
                    </div>
                </td>
                <td><span class="mono-code">${Math.round(tf.voltage_v || 230)} V</span></td>
                <td><span class="tag ${tagClass}">${escapeHtml(tf.status)}</span></td>
            </tr>
        `;
    }).join('');
}

function getIncidentActionHtml(inc, isOverview) {
    if (!state.user) {
        return `<span class="tag tag-normal">Monitored</span>`;
    }

    const role = state.user.role ? state.user.role.toUpperCase() : 'CONSUMER';

    if (inc.status === 'RESOLVED') {
        return `<span class="tag tag-normal" style="color: var(--status-normal); font-weight: 600;">&#10003; Restored</span>`;
    }

    // 1. Admin or Operator ASSIGNS squads (control room dispatchers, does not resolve field repairs)
    if (role === 'ADMIN' || role === 'OPERATOR') {
        if (!inc.assigned_crew_id) {
            return `<button type="button" class="btn btn-primary btn-sm" onclick="openDispatchModal(${inc.id})" title="Assign an emergency response field squad">Assign Squad</button>`;
        } else {
            return `
                <div style="display: inline-flex; align-items: center; gap: 5px;">
                    <span class="tag tag-admin" title="Field squad deployed to substation site">Squad Assigned</span>
                    ${!isOverview ? `<button type="button" class="btn btn-secondary btn-xs" onclick="openDispatchModal(${inc.id})" title="Reassign to another squad">Reassign</button>` : ''}
                </div>
            `;
        }
    }

    // 2. Field Crew RESOLVES incidents (the field squad performs the physical repair and clears the docket)
    if (role === 'CREW') {
        const isMyCrew = inc.assigned_crew_id && (inc.assigned_crew_id === state.user.crew_id || (state.activeCrewDispatch && state.activeCrewDispatch.incident && state.activeCrewDispatch.incident.id === inc.id));
        if (isMyCrew) {
            return `<button type="button" class="btn btn-success btn-sm" onclick="resolveIncident(${inc.id})" title="Confirm repair complete and restore power">&#10003; Resolve Work Order</button>`;
        } else if (inc.assigned_crew_id) {
            return `<span class="tag tag-normal">Assigned: Squad #${inc.assigned_crew_id}</span>`;
        } else {
            return `<span class="tag tag-warning">Awaiting Assignment</span>`;
        }
    }

    // 3. Citizen / Guest ONLY SEES (public monitoring, no dispatch or resolve actions)
    return `<span class="tag tag-normal">Monitored</span>`;
}

// 5b. Overview Active Incidents (Max 6 rows)
function renderOverviewIncidents() {
    const listEl = document.getElementById('overview-incidents-list');
    if (!listEl) return;

    let list = state.incidents.filter(i => i.status !== 'RESOLVED');
    if (state.selectedRegionId !== 'ALL') {
        list = list.filter(i => {
            const tf = state.substations.find(t => t.id === i.transformer_id);
            return tf && String(tf.grid_region_id) === String(state.selectedRegionId);
        });
    }

    const displayList = list.slice(0, 6);
    if (displayList.length === 0) {
        listEl.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 16px; text-align: center;">All substations operating nominally. Zero active faults.</div>`;
        return;
    }

    listEl.innerHTML = displayList.map(inc => {
        const tf = state.substations.find(t => t.id === inc.transformer_id);
        const subName = tf ? tf.substation_name : `Substation #${inc.transformer_id || '--'}`;

        let sevClass = 'tag-normal';
        let itemClass = 'incident-item';
        if (inc.severity_score >= 70) {
            sevClass = 'tag-critical';
            itemClass += ' crit';
        } else if (inc.severity_score >= 40) {
            sevClass = 'tag-warning';
            itemClass += ' warn';
        }

        const actionBtn = getIncidentActionHtml(inc, true);

        return `
            <div class="simple-list-item ${itemClass}">
                <div>
                    <div><strong>${escapeHtml(inc.incident_code || `#${inc.id}`)}</strong> &mdash; ${escapeHtml(subName)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                        ${escapeHtml(inc.root_cause_prediction || 'Grid Outage')} &bull; <span class="tag ${sevClass}">${Math.round(inc.severity_score || 0)}/100</span>
                    </div>
                </div>
                <div>${actionBtn}</div>
            </div>
        `;
    }).join('');
}

// 5c. Dedicated Incidents Table (Max 10 rows)
function renderIncidents() {
    const tbody = document.getElementById('incidents-tbody');
    if (!tbody) return;

    let list = state.incidents;
    if (state.activeStatusFilter === 'ACTIVE') {
        list = list.filter(i => i.status !== 'RESOLVED');
    }
    if (state.searchQuery) {
        list = list.filter(i => 
            (i.incident_code && i.incident_code.toLowerCase().includes(state.searchQuery)) ||
            (i.root_cause_prediction && i.root_cause_prediction.toLowerCase().includes(state.searchQuery))
        );
    }

    const displayList = list.slice(0, 10);
    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No incidents matching query.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayList.map(inc => {
        const tf = state.substations.find(t => t.id === inc.transformer_id);
        const subName = tf ? tf.substation_name : `Substation #${inc.transformer_id || '--'}`;
        const assignedTeam = inc.active_crew || (inc.assigned_crew ? (inc.assigned_crew.team_name || inc.assigned_crew.name) : null);
        const assignedLead = inc.active_crew_leader || (inc.assigned_crew ? inc.assigned_crew.leader_name : null);

        let crewHtml = `<span class="tag tag-warning">Unassigned</span>`;
        if (assignedTeam) {
            crewHtml = `
                <div class="crew-team-cell">
                    <span class="crew-team-badge"></span>
                    <div>
                        <strong>${escapeHtml(assignedTeam)}</strong>
                        ${assignedLead ? `<div style="font-size: 11px; color: var(--text-muted);">Lead: ${escapeHtml(assignedLead)}</div>` : ''}
                    </div>
                </div>
            `;
        }

        let sevClass = 'tag-normal';
        if (inc.severity_score >= 70) sevClass = 'tag-critical';
        else if (inc.severity_score >= 40) sevClass = 'tag-warning';

        const actionHtml = getIncidentActionHtml(inc, false);

        let statusTagClass = 'tag-critical';
        if (inc.status === 'RESOLVED') statusTagClass = 'tag-normal';
        else if (inc.status === 'DISPATCHED') statusTagClass = 'tag-admin';
        else if (inc.status === 'INVESTIGATING') statusTagClass = 'tag-warning';

        return `
            <tr>
                <td><strong>${escapeHtml(inc.incident_code || `#${inc.id}`)}</strong></td>
                <td>${escapeHtml(subName)}</td>
                <td><span class="tag ${sevClass}">${Math.round(inc.severity_score || 0)}/100</span></td>
                <td>${escapeHtml(inc.root_cause_prediction || 'Grid Telemetry Alert')}</td>
                <td><span class="tag ${statusTagClass}">${escapeHtml(inc.status)}</span></td>
                <td>${crewHtml}</td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');
}

// 5d. Substations Catalog Grid (Max 10 cards)
function renderSubstations() {
    const grid = document.getElementById('substations-grid');
    if (!grid) return;

    const filtered = getFilteredSubstations().slice(0, 10);
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 32px;">No substations found.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(tf => {
        let tagClass = 'tag-normal';
        let cardStatusClass = 'status-normal';
        if (tf.status === 'CRITICAL') {
            tagClass = 'tag-critical';
            cardStatusClass = 'status-crit';
        } else if (tf.status === 'WARNING') {
            tagClass = 'tag-warning';
            cardStatusClass = 'status-warn';
        }

        return `
            <div class="item-card ${cardStatusClass}">
                <div class="item-card-head">
                    <h4>${escapeHtml(tf.substation_name || tf.code)}</h4>
                    <span class="tag ${tagClass}">${escapeHtml(tf.status)}</span>
                </div>
                <div class="item-card-body">
                    <div class="item-row">
                        <span>Zone:</span>
                        <strong>${escapeHtml(tf.zone)}</strong>
                    </div>
                    <div class="item-row">
                        <span>Load:</span>
                        <strong class="mono-code">${Math.round(tf.load_pct || 0)}%</strong>
                    </div>
                    <div class="item-row">
                        <span>Voltage:</span>
                        <strong class="mono-code">${Math.round(tf.voltage_v || 230)} V</strong>
                    </div>
                    <div class="item-row">
                        <span>Temperature:</span>
                        <strong class="mono-code">${Math.round(tf.temperature_c || 65)}&deg;C</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 5e. Fleet Roster Table (Max 10 rows)
function renderFleet() {
    const tbody = document.getElementById('fleet-tbody');
    if (!tbody) return;

    let list = state.crews;
    if (state.selectedRegionId !== 'ALL') {
        list = list.filter(c => String(c.grid_region_id) === String(state.selectedRegionId));
    }
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        list = list.filter(c =>
            (c.team_name && c.team_name.toLowerCase().includes(q)) ||
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.leader_name && c.leader_name.toLowerCase().includes(q)) ||
            (c.base_substation && c.base_substation.toLowerCase().includes(q)) ||
            (c.power_house_name && c.power_house_name.toLowerCase().includes(q))
        );
    }

    const displayList = list.slice(0, 10);
    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No crews available.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayList.map(c => {
        const isAvail = c.status === 'AVAILABLE';
        const tagClass = isAvail ? 'tag-normal' : 'tag-warning';
        const teamName = c.team_name || c.name || 'Field Crew';
        const leaderName = c.leader_name || 'Team Lead';
        const leaderTitle = c.leader_title || 'Lead Technician';
        const subName = c.power_house_name || c.base_substation || 'Metro Base';
        const spec = (c.skill_specialization || c.specialization || 'TRANSFORMER_REPAIR').replace(/_/g, ' ');

        return `
            <tr>
                <td>
                    <div class="crew-team-cell">
                        <span class="crew-team-badge ${isAvail ? 'crew-avail' : 'crew-busy'}"></span>
                        <strong>${escapeHtml(teamName)}</strong>
                    </div>
                </td>
                <td>
                    <div class="crew-lead-info">
                        <strong>${escapeHtml(leaderName)}</strong>
                        <span class="crew-subtext">${escapeHtml(leaderTitle)}</span>
                    </div>
                </td>
                <td>${escapeHtml(c.leader_phone || '--')}</td>
                <td>${escapeHtml(subName)}</td>
                <td><span class="pill-spec">${escapeHtml(spec)}</span></td>
                <td>${c.active_workload || 0} active</td>
                <td><span class="tag ${tagClass}">${escapeHtml(c.status)}</span></td>
                <td>
                    ${state.user && (state.user.role === 'ADMIN' || state.user.role === 'OPERATOR') ? `
                        <button type="button" class="btn btn-secondary btn-xs btn-open-crew-portal" onclick="openCrewAccountAndTerminal(${c.id})" title="Open this Crew's live dispatch terminal and route">
                            Open Account
                        </button>
                    ` : (state.user && state.user.crew_id === c.id ? `
                        <button type="button" class="btn btn-primary btn-xs" onclick="switchView('view-crew-terminal')">My Terminal</button>
                    ` : `<span style="color: var(--text-muted); font-size: 11px;">Field Squad</span>`)}
                </td>
            </tr>
        `;
    }).join('');

    const woList = document.getElementById('work-orders-list');
    if (woList) {
        const activeIncs = state.incidents.filter(i => i.status !== 'RESOLVED' && (i.assigned_crew || i.active_crew)).slice(0, 5);
        if (activeIncs.length === 0) {
            woList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 12px;">No active field work orders.</div>`;
        } else {
            woList.innerHTML = activeIncs.map(i => {
                const crewTeam = i.active_crew || (i.assigned_crew ? (i.assigned_crew.team_name || i.assigned_crew.name) : 'Field Crew');
                const leader = i.active_crew_leader || (i.assigned_crew ? i.assigned_crew.leader_name : null);
                const leadLabel = leader ? ` &bull; Lead: ${leader}` : '';
                let woStatusClass = 'tag-admin';
                if (i.status === 'INVESTIGATING') woStatusClass = 'tag-warning';
                else if (i.status === 'RESOLVED') woStatusClass = 'tag-normal';
                return `
                    <div class="simple-list-item incident-item">
                        <div>
                            <strong>${escapeHtml(i.incident_code)}</strong> &mdash; ${escapeHtml(crewTeam)}<span style="color: var(--text-muted); font-size: 11px;">${escapeHtml(leadLabel)}</span>
                        </div>
                        <span class="tag ${woStatusClass}">${escapeHtml(i.status)}</span>
                    </div>
                `;
            }).join('');
        }
    }
}

// 5f. Critical Facilities Grid (Max 6)
function renderFacilities() {
    const grid = document.getElementById('facilities-grid');
    if (!grid) return;

    const list = state.facilities.slice(0, 6);
    grid.innerHTML = list.map(f => `
        <div class="item-card">
            <div class="item-card-head">
                <h4>${escapeHtml(f.name)}</h4>
                <span class="tag tag-normal">Online</span>
            </div>
            <div class="item-card-body">
                <div class="item-row">
                    <span>Category:</span>
                    <strong>${escapeHtml(f.category)}</strong>
                </div>
                <div class="item-row">
                    <span>Priority:</span>
                    <strong>${f.priority_weight}/10</strong>
                </div>
                <div class="item-row">
                    <span>Backup Generator:</span>
                    <strong>${f.backup_generator_pct || 100}%</strong>
                </div>
            </div>
        </div>
    `).join('');
}

// 5g. Team Communications (Max 8)
function renderMessages() {
    const listEl = document.getElementById('messages-list');
    if (!listEl) return;

    const recent = state.messages.slice(-8);
    if (recent.length === 0) {
        listEl.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 12px;">No recent messages.</div>`;
        return;
    }

    listEl.innerHTML = recent.map(m => `
        <div class="msg-item">
            <div class="msg-meta">
                <span>${escapeHtml(m.sender_name || m.sender_role || 'System')}</span>
                <span>${m.timestamp ? m.timestamp.substring(11, 16) : ''}</span>
            </div>
            <div class="msg-text">${escapeHtml(m.message_text)}</div>
        </div>
    `).join('');

    listEl.scrollTop = listEl.scrollHeight;
}

// ==============================================================================
// 6. DISPATCH & STATUS WORKFLOWS
// ==============================================================================
window.openDispatchModal = async function(incidentId) {
    sound.play('alert');
    if (!state.user || (state.user.role !== 'ADMIN' && state.user.role !== 'OPERATOR')) {
        showToast('Operator authorization required', 'error');
        return;
    }

    state.selectedIncidentForDispatch = incidentId;
    const modal = document.getElementById('dispatch-modal');
    const optionsContainer = document.getElementById('modal-crew-options');
    if (!modal || !optionsContainer) return;

    modal.classList.remove('hidden');
    optionsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-secondary);">
            <div style="font-weight: 600; margin-bottom: 6px;">Calculating GPS Haversine Proximity...</div>
            <span style="font-size: 12px; color: var(--text-muted);">Finding closest available emergency response crew to fault site</span>
        </div>`;

    try {
        const res = await fetch(`/api/incidents/${incidentId}/dispatch-recommendations`);
        const data = await res.json();
        const allRecs = data.recommendations || [];
        const availableRecs = allRecs.filter(c => c.current_status === 'AVAILABLE');

        if (availableRecs.length === 0) {
            optionsContainer.innerHTML = `
                <div style="color: var(--text-secondary); background-color: var(--bg-surface-elevated); border: 1px dashed var(--border-medium); border-radius: var(--radius-sm); padding: 18px 16px; text-align: center; font-size: 13px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: var(--status-warning);">All Field Crews Deployed</div>
                    All repair crews are currently assigned to active field work orders. Once an active crew completes site restoration, they will appear here for dispatch.
                </div>`;
            return;
        }

        // USER REQUIREMENT: "also only recommend the crew closest"
        const topCrew = availableRecs[0]; // Proximity-sorted: strictly closest available crew!
        const incident = state.incidents.find(i => i.id === incidentId);
        const subName = incident && incident.transformer ? incident.transformer.substation_name : 'Target Substation';

        optionsContainer.innerHTML = `
            <div class="closest-recommendation-hero">
                <div class="closest-hero-badge">
                    ONLY RECOMMENDED UNIT (CLOSEST PROXIMITY)
                </div>
                <div class="closest-hero-body">
                    <div class="closest-hero-left">
                        <div class="closest-hero-team">
                            <h4>${escapeHtml(topCrew.team_name)}</h4>
                            <span class="closest-dist-tag">${topCrew.distance_km} km away &bull; ~${topCrew.eta_minutes} min ETA</span>
                        </div>
                        <div class="closest-hero-meta">
                            <div><strong>Lead:</strong> ${escapeHtml(topCrew.leader_name)} &bull; <strong>Contact:</strong> ${escapeHtml(topCrew.leader_phone || '+91 94150 30000')}</div>
                            <div><strong>Base:</strong> ${escapeHtml(topCrew.base_substation || 'Metro Base')} &bull; <strong>Skill:</strong> ${escapeHtml((topCrew.skill_specialization || '').replace(/_/g, ' '))}</div>
                            <div class="closest-route-preview">Direct corridor route to <strong>${escapeHtml(subName)}</strong></div>
                        </div>
                    </div>
                    <div class="closest-hero-action">
                        <button type="button" class="btn btn-primary btn-lg" onclick="executeDispatch(${topCrew.crew_id})">
                            Dispatch Closest Crew
                        </button>
                    </div>
                </div>
            </div>

            <!-- Optional Collapsible Secondary List for District Standby Units -->
            ${availableRecs.length > 1 ? `
                <details class="other-crews-details">
                    <summary class="other-crews-toggle">View other available units in district (${availableRecs.length - 1} standby units)</summary>
                    <div class="other-crews-list">
                        ${availableRecs.slice(1, 6).map(c => `
                            <div class="crew-select-item" onclick="executeDispatch(${c.crew_id})">
                                <div class="crew-select-details">
                                    <div class="crew-select-name">
                                        <strong>${escapeHtml(c.team_name)}</strong>
                                        <span class="crew-dist-sub">${c.distance_km} km away (~${c.eta_minutes} mins)</span>
                                    </div>
                                    <div class="crew-select-meta">Base: ${escapeHtml(c.base_substation || 'Base')} &bull; Lead: ${escapeHtml(c.leader_name)}</div>
                                </div>
                                <button type="button" class="btn btn-secondary btn-sm">Dispatch</button>
                            </div>
                        `).join('')}
                    </div>
                </details>
            ` : ''}
        `;
    } catch (err) {
        optionsContainer.innerHTML = `<div style="color: var(--status-critical); padding: 16px; text-align: center;">Unable to load recommendations. Please verify network connection.</div>`;
    }
};

window.executeDispatch = async function(crewId) {
    if (state.isDispatching) return;
    const incidentId = state.selectedIncidentForDispatch;
    if (!incidentId) return;

    try {
        state.isDispatching = true;
        const res = await fetch(`/api/incidents/${incidentId}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ crew_id: crewId, operator_id: state.user ? state.user.id : 1 })
        });
        const data = await res.json();
        if (data.success) {
            sound.play('dispatch');
            showToast('Crew dispatched successfully', 'success');
            const modal = document.getElementById('dispatch-modal');
            if (modal) modal.classList.add('hidden');
            await loadAllData(true);
        } else {
            sound.play('alert');
            showToast(data.error || 'Dispatch rejected by server', 'error');
        }
    } catch (err) {
        showToast('Network error during dispatch', 'error');
    } finally {
        state.isDispatching = false;
    }
};

window.resolveIncident = async function(incidentId) {
    sound.play('click');
    if (!state.user || (state.user.role !== 'CREW' && state.user.role !== 'OPERATOR' && state.user.role !== 'ADMIN')) {
        showToast('Field crew authorization required to resolve work orders', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/incidents/${incidentId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'RESOLVED' })
        });
        const data = await res.json();
        if (data.success) {
            sound.play('success');
            showToast('Incident marked as resolved', 'success');
            await loadAllData(true);
        } else {
            showToast(data.error || 'Resolution update failed', 'error');
        }
    } catch (err) {
        showToast('Network error updating status', 'error');
    }
};

// ==============================================================================
// 7. MODALS & FORMS
// ==============================================================================
function setupModals() {
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                sound.play('click');
                modal.classList.add('hidden');
            }
        });
    });

    const closeDispatchBtn = document.getElementById('btn-close-dispatch');
    if (closeDispatchBtn) {
        closeDispatchBtn.addEventListener('click', () => {
            sound.play('click');
            const modal = document.getElementById('dispatch-modal');
            if (modal) modal.classList.add('hidden');
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
        }
    });
}

function setupForms() {
    const citForm = document.getElementById('citizen-form');
    if (citForm) {
        citForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            sound.play('click');
            const locality = document.getElementById('cit-zone').value;
            const phone = document.getElementById('cit-phone').value.trim();
            const desc = document.getElementById('cit-desc').value.trim();

            const coords = LOCALITY_COORDS[locality] || [26.8467, 80.9462];

            try {
                const res = await fetch('/api/outages/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locality: locality,
                        phone: phone,
                        description: desc,
                        latitude: coords[0],
                        longitude: coords[1]
                    })
                });
                const data = await res.json();
                if (data.success) {
                    sound.play('success');
                    showToast(`Outage reported. Token: ${data.tracking_token}`, 'success');
                    const trackInput = document.getElementById('track-id-input');
                    if (trackInput) trackInput.value = data.tracking_token;
                    citForm.reset();
                    trackOutage(data.tracking_token);
                    await loadAllData(true);
                } else {
                    sound.play('alert');
                    showToast(data.error || 'Failed to submit report', 'error');
                }
            } catch (err) {
                showToast('Unable to submit outage report', 'error');
            }
        });
    }

    const trackBtn = document.getElementById('btn-search-ticket');
    const trackInput = document.getElementById('track-id-input');
    if (trackInput && trackBtn) {
        trackInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                trackBtn.click();
            }
        });
    }
    if (trackBtn) {
        trackBtn.addEventListener('click', () => {
            sound.play('click');
            const token = document.getElementById('track-id-input').value.trim();
            if (token) trackOutage(token);
        });
    }

    const msgForm = document.getElementById('msg-form');
    if (msgForm) {
        msgForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            sound.play('click');
            const input = document.getElementById('msg-input');
            const text = input.value.trim();
            if (!text) return;

            try {
                const res = await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sender_role: state.user ? state.user.role : 'OPERATOR',
                        sender_name: state.user ? state.user.name : 'Grid Operator',
                        recipient_role: 'ALL',
                        message_text: text
                    })
                });
                const data = await res.json();
                if (data.success) {
                    sound.play('click');
                    input.value = '';
                    const msgsRes = await fetch('/api/messages').then(r => r.json());
                    if (msgsRes.messages) {
                        state.messages = msgsRes.messages;
                        renderMessages();
                    }
                }
            } catch (err) {
                showToast('Message delivery failed', 'error');
            }
        });
    }

    const createUserForm = document.getElementById('create-user-form');
    if (createUserForm) {
        createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            sound.play('click');
            const name = document.getElementById('new-name').value.trim();
            const email = document.getElementById('new-email').value.trim();
            const password = document.getElementById('new-password').value.trim();
            const role = document.getElementById('new-role').value;
            const zone = document.getElementById('new-zone').value.trim();
            const phone = document.getElementById('new-phone').value.trim();

            try {
                const res = await fetch('/api/auth/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, role, zone, phone })
                });
                const data = await res.json();
                if (data.success) {
                    sound.play('success');
                    showToast(`User ${name} created`, 'success');
                    createUserForm.reset();
                    loadUsersList();
                } else {
                    sound.play('alert');
                    showToast(data.error || 'Failed to create user', 'error');
                }
            } catch (err) {
                showToast('Unable to connect to user service', 'error');
            }
        });
    }
}

async function trackOutage(token) {
    try {
        const res = await fetch(`/api/outages/track/${encodeURIComponent(token)}`);
        const data = await res.json();
        const resultCard = document.getElementById('ticket-result');
        if (!resultCard) return;

        if (data.success) {
            document.getElementById('res-ticket-code').textContent = data.tracking_token;
            const statusEl = document.getElementById('res-ticket-status');
            if (statusEl) {
                statusEl.textContent = data.status_label || 'Logged';
                statusEl.className = data.status_label === 'Power Restored' ? 'tag tag-normal' :
                                     data.status_label === 'Repair Crew On Site' ? 'tag tag-warning' : 'tag tag-critical';
            }
            document.getElementById('res-ticket-loc').textContent = data.locality || 'Lucknow Urban';
            document.getElementById('res-ticket-eta').textContent = (data.status_label === 'Power Restored' || data.eta_minutes === 0) ? 'Restored (0m)' : `${data.eta_minutes} minutes`;

            const zoneEl = document.getElementById('res-ticket-zone');
            if (zoneEl) zoneEl.textContent = 'Lucknow Central (Voltera Grid)';

            // Update 4-Stage Railway Stepper in Citizen View
            updateRailStepper('cit-', data);

            resultCard.classList.remove('hidden');
        } else {
            showToast(data.error || 'Ticket not found', 'error');
            resultCard.classList.add('hidden');
        }
    } catch (err) {
        showToast('Tracking query failed', 'error');
    }
}

async function loadUsersList() {
    if (!state.user || state.user.role !== 'ADMIN') return;
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    try {
        const res = await fetch('/api/auth/users');
        const data = await res.json();
        if (data.success && data.users) {
            state.users = data.users;
            const list = state.users.slice(0, 10);
            tbody.innerHTML = list.map(u => {
                const uRoleClass = u.role === 'ADMIN' ? 'tag-admin' :
                                   u.role === 'OPERATOR' ? 'tag-operator' :
                                   u.role === 'COORDINATOR' ? 'tag-coordinator' :
                                   u.role === 'CREW' ? 'tag-crew' : 'tag-consumer';
                return `
                    <tr>
                        <td><strong>${escapeHtml(u.name)}</strong></td>
                        <td>${escapeHtml(u.email)}</td>
                        <td><span class="tag ${uRoleClass}">${escapeHtml(u.role)}</span></td>
                        <td>
                            ${u.id !== state.user.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>` : `<span style="color: var(--text-muted); font-size: 11px;">Current</span>`}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {}
}

window.deleteUser = async function(userId) {
    sound.play('alert');
    if (!confirm('Are you sure you want to delete this user account?')) return;
    try {
        const res = await fetch(`/api/auth/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            sound.play('success');
            showToast('User account removed', 'success');
            loadUsersList();
        } else {
            showToast(data.error || 'Delete failed', 'error');
        }
    } catch (err) {
        showToast('Server error deleting user', 'error');
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==============================================================================
// 7. CREW OPERATIONS, ROUTE NAVIGATION & CROSS-DEVICE ALERTS
// ==============================================================================

async function loadCrewAccounts() {
    try {
        const res = await fetch('/api/crews/accounts');
        const data = await res.json();
        if (data.success && data.accounts) {
            state.crewAccounts = data.accounts;
            populateCrewSelectors(data.accounts);
        }
    } catch (err) {}
}

function populateCrewSelectors(accounts) {
    const loginSelect = document.getElementById('login-crew-select');
    const menuSelect = document.getElementById('menu-crew-select');

    const optionsHtml = accounts.map(a => {
        const statusBadge = a.has_active_dispatch ? 'DISPATCHED' : (a.status === 'AVAILABLE' ? 'Standby' : a.status);
        const activeSub = a.active_substation_name ? ` -> ${a.active_substation_name}` : '';
        return `<option value="${a.crew_id}">${escapeHtml(a.team_name)} (${statusBadge}${escapeHtml(activeSub)})</option>`;
    }).join('');

    if (loginSelect) {
        loginSelect.innerHTML = `<option value="">-- Choose Field Crew (30 Units) --</option>` + optionsHtml;
    }
    if (menuSelect) {
        menuSelect.innerHTML = `<option value="">-- Select Field Crew Unit --</option>` + optionsHtml;
    }
}

window.openSelectedCrewLogin = function() {
    sound.play('click');
    const select = document.getElementById('login-crew-select');
    if (!select || !select.value) {
        showToast('Please select a crew unit first', 'warning');
        return;
    }
    const crewId = parseInt(select.value);
    const crew = state.crewAccounts.find(a => a.crew_id === crewId);
    if (!crew || !crew.leader_email) {
        showToast('Crew account details unavailable', 'error');
        return;
    }

    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    if (emailInput && pwdInput) {
        emailInput.value = crew.leader_email;
        pwdInput.value = 'LucknowGrid@2026';
        const form = document.getElementById('login-form');
        if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
};

window.quickSwitchAccount = async function(role) {
    sound.play('click');
    try {
        const res = await fetch('/api/auth/quick-switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
        });
        const data = await res.json();
        if (data.success && data.user) {
            sound.play('success');
            onLoginSuccess(data.user);
            showToast(`Switched account: ${data.user.name} (${data.user.role})`, 'success');
        } else {
            showToast(data.error || 'Failed to switch account', 'error');
        }
    } catch (err) {
        showToast('Server error during account switch', 'error');
    }
};

window.quickSwitchCrew = async function(crewId) {
    sound.play('click');
    const cid = parseInt(crewId);
    try {
        const res = await fetch('/api/auth/quick-switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ crew_id: cid })
        });
        const data = await res.json();
        if (data.success && data.user) {
            sound.play('success');
            onLoginSuccess(data.user);
            await reloadCrewDispatchDetails(false, cid);
            switchView('view-crew-terminal');
            showToast(`Opened crew portal: ${data.user.name}`, 'success');
        } else {
            showToast(data.error || 'Unable to open crew account', 'error');
        }
    } catch (err) {
        showToast('Server error switching crew account', 'error');
    }
};

window.openCrewAccountAndTerminal = function(crewId) {
    window.quickSwitchCrew(crewId);
};

// ==============================================================================
// 9. CROSS-DEVICE NOTIFICATION CENTER ENGINE
// ==============================================================================
window.toggleNotificationCenter = function(e) {
    if (e) e.stopPropagation();
    sound.play('click');
    const menu = document.getElementById('notification-center-menu');
    const trigger = document.getElementById('btn-notification-trigger');
    if (!menu) return;

    closeProfileMenu();
    const willOpen = menu.classList.contains('hidden');
    if (willOpen) {
        menu.classList.remove('hidden');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        renderNotificationCenter();
    } else {
        menu.classList.add('hidden');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
};

window.closeNotificationCenter = function() {
    const menu = document.getElementById('notification-center-menu');
    const trigger = document.getElementById('btn-notification-trigger');
    if (menu) menu.classList.add('hidden');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
};

window.refreshNotifications = function(e) {
    if (e) e.stopPropagation();
    sound.play('click');
    renderNotificationCenter();
    showToast('Notifications refreshed', 'success');
};

function renderNotificationCenter() {
    const listEl = document.getElementById('notif-items-list');
    const badgeEl = document.getElementById('header-alert-count');
    const summaryEl = document.getElementById('notif-summary-text');
    const footerWrap = document.getElementById('notif-footer-action-wrap');
    if (!listEl) return;

    const user = state.user;
    const role = (user && user.role) ? user.role.toUpperCase() : 'CONSUMER';

    let notifItems = [];
    let badgeCount = 0;

    if (role === 'CREW') {
        const activeDisp = state.activeCrewDispatch;
        if (activeDisp && activeDisp.has_active_dispatch && activeDisp.incident) {
            badgeCount = 1;
            const subName = activeDisp.transformer ? activeDisp.transformer.substation_name : 'Assigned Substation';
            const dist = activeDisp.route ? `${activeDisp.route.distance_km} km` : '1.4 km';
            const eta = activeDisp.route ? `${activeDisp.route.eta_minutes} min` : '10 min';
            notifItems.push(`
                <div class="notif-card card-crit" onclick="switchView('view-crew-terminal'); closeNotificationCenter();">
                    <div class="notif-card-top">
                        <span class="notif-card-tag" style="color: var(--status-critical);">ACTIVE DIRECTIVE</span>
                        <span class="notif-card-time">LIVE</span>
                    </div>
                    <div class="notif-card-title">${escapeHtml(activeDisp.incident.incident_code || 'INC-ORDER')} &mdash; ${escapeHtml(subName)}</div>
                    <div class="notif-card-desc">Transit Distance: ${dist} &bull; Estimated ETA: ${eta}. Turn-by-turn route ready.</div>
                </div>
            `);
        } else {
            notifItems.push(`
                <div class="notif-card card-info" onclick="switchView('view-crew-terminal'); closeNotificationCenter();">
                    <div class="notif-card-top">
                        <span class="notif-card-tag" style="color: var(--status-normal);">STATUS: STANDBY</span>
                        <span class="notif-card-time">Active</span>
                    </div>
                    <div class="notif-card-title">Squad Ready for Dispatch</div>
                    <div class="notif-card-desc">No active emergency work order assigned. Stationed at base depot on standby.</div>
                </div>
            `);
        }
        if (footerWrap) {
            footerWrap.innerHTML = `<button type="button" class="btn btn-primary btn-xs btn-full" onclick="switchView('view-crew-terminal'); closeNotificationCenter();">Open My Dispatch Terminal &rarr;</button>`;
        }
    } else if (role === 'ADMIN' || role === 'OPERATOR') {
        const activeIncidents = (state.incidents || []).filter(i => i.status !== 'RESOLVED');
        badgeCount = activeIncidents.length;

        if (activeIncidents.length > 0) {
            activeIncidents.slice(0, 4).forEach(inc => {
                const tf = (state.substations || []).find(t => t.id === inc.transformer_id);
                const subName = tf ? tf.substation_name : `Substation #${inc.transformer_id}`;
                const sev = Math.round(inc.severity_score || 0);
                const isCrit = sev >= 70;
                notifItems.push(`
                    <div class="notif-card ${isCrit ? 'card-crit' : 'card-warn'}" onclick="switchView('view-incidents'); closeNotificationCenter();">
                        <div class="notif-card-top">
                            <span class="notif-card-tag" style="color: ${isCrit ? 'var(--status-critical)' : 'var(--status-warning)'};">${isCrit ? 'CRITICAL OUTAGE' : 'GRID ALERT'}</span>
                            <span class="notif-card-time">Score ${sev}/100</span>
                        </div>
                        <div class="notif-card-title">${escapeHtml(inc.incident_code || 'ALERT')} &bull; ${escapeHtml(subName)}</div>
                        <div class="notif-card-desc">${escapeHtml(inc.root_cause_prediction || 'Feeder Trip')} &bull; Status: ${escapeHtml(inc.status)}</div>
                    </div>
                `);
            });
        }

        const deployedCrews = (state.crews || []).filter(c => c.status !== 'AVAILABLE');
        if (deployedCrews.length > 0) {
            notifItems.push(`
                <div class="notif-card card-info" onclick="switchView('view-fleet'); closeNotificationCenter();">
                    <div class="notif-card-top">
                        <span class="notif-card-tag" style="color: var(--accent);">FIELD RESPONSE FLEET</span>
                        <span class="notif-card-time">${deployedCrews.length} Units</span>
                    </div>
                    <div class="notif-card-title">${deployedCrews.length} Field Squads Currently Active</div>
                    <div class="notif-card-desc">Field repair units actively deployed across Lucknow districts.</div>
                </div>
            `);
        }

        if (notifItems.length === 0) {
            notifItems.push(`<div class="notif-empty">All 30 substations operating nominally. Zero active faults.</div>`);
        }

        if (footerWrap) {
            footerWrap.innerHTML = `<button type="button" class="btn btn-secondary btn-xs btn-full" onclick="switchView('view-incidents'); closeNotificationCenter();">Review All Outages (${activeIncidents.length}) &rarr;</button>`;
        }
    } else {
        // Consumer / Guest
        badgeCount = 1;
        const activeCount = (state.incidents || []).filter(i => i.status !== 'RESOLVED').length;
        notifItems.push(`
            <div class="notif-card card-info" onclick="switchView('view-citizen'); closeNotificationCenter();">
                <div class="notif-card-top">
                    <span class="notif-card-tag" style="color: var(--status-normal);">PUBLIC GRID ADVISORY</span>
                    <span class="notif-card-time">LIVE</span>
                </div>
                <div class="notif-card-title">Lucknow Central Supply Network</div>
                <div class="notif-card-desc">${activeCount > 0 ? `${activeCount} localized outage(s) currently being restored by field squads.` : 'All major feeder circuits in Lucknow operating normally.'}</div>
            </div>
            <div class="notif-card card-info" onclick="switchView('view-citizen'); closeNotificationCenter();">
                <div class="notif-card-top">
                    <span class="notif-card-tag" style="color: #34D399;">CITIZEN DESK</span>
                    <span class="notif-card-time">24/7 Helpline</span>
                </div>
                <div class="notif-card-title">Report Local Power Outages</div>
                <div class="notif-card-desc">Submit neighborhood outage reports and track resolution status with your token.</div>
            </div>
        `);
        if (footerWrap) {
            footerWrap.innerHTML = `<button type="button" class="btn btn-secondary btn-xs btn-full" onclick="switchView('view-citizen'); closeNotificationCenter();">Open Citizen Outage Desk &rarr;</button>`;
        }
    }

    listEl.innerHTML = notifItems.join('');
    if (badgeEl) {
        badgeEl.textContent = String(badgeCount);
        if (badgeCount > 0) badgeEl.classList.remove('hidden');
        else badgeEl.classList.add('hidden');
    }
    if (summaryEl) {
        summaryEl.textContent = `${badgeCount} active item${badgeCount === 1 ? '' : 's'}`;
    }
}

function setupNotificationCenter() {
    const trigger = document.getElementById('btn-notification-trigger');
    const menu = document.getElementById('notification-center-menu');
    if (!trigger || !menu) return;

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            closeNotificationCenter();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeNotificationCenter();
        }
    });
}

async function checkActiveCrewAlerts() {
    try {
        const res = await fetch('/api/crews/my-dispatch');
        const data = await res.json();
        if (data.success) {
            state.activeCrewDispatch = data;
            if (data.route && data.route.waypoints) {
                state.activeRouteWaypoints = data.route.waypoints;
            }

            const alertDock = document.getElementById('crew-dispatch-top-alert');
            const headlineEl = document.getElementById('top-alert-headline');
            const detailEl = document.getElementById('top-alert-detail');

            if (data.has_active_dispatch && data.incident) {
                if (alertDock && state.user && state.user.role === 'CREW') {
                    alertDock.classList.remove('hidden');
                    if (headlineEl) headlineEl.textContent = `ACTIVE DISPATCH ORDER #${data.incident.incident_code || 'INC'}`;
                    const distText = data.route ? `${data.route.distance_km} km` : '1.4 km';
                    const etaText = data.route ? `${data.route.eta_minutes} min ETA` : '10 min ETA';
                    const subName = data.transformer ? data.transformer.substation_name : 'Substation';
                    if (detailEl) detailEl.textContent = `Deployed to ${subName} &bull; ${distText} &bull; ${etaText}`;
                }
            } else {
                if (alertDock) alertDock.classList.add('hidden');
            }
        }
    } catch (err) {}
    renderNotificationCenter();
}

window.reloadCrewDispatchDetails = async function(showFeedback = false, targetCrewId = null) {
    if (showFeedback) sound.play('click');
    const endpoint = targetCrewId ? `/api/crews/${targetCrewId}/active-dispatch` : `/api/crews/my-dispatch`;

    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        if (data.success) {
            state.activeCrewDispatch = data;
            if (data.route && data.route.waypoints) {
                state.activeRouteWaypoints = data.route.waypoints;
            }
            renderCrewTerminal(data);
            if (showFeedback) showToast('Telemetry & dispatch data refreshed', 'success');
        } else {
            if (showFeedback) showToast(data.error || 'Failed to load dispatch details', 'error');
        }
    } catch (err) {
        if (showFeedback) showToast('Network error loading crew details', 'error');
    }
};

function renderCrewTerminal(data) {
    const crew = data.crew || {};
    const inc = data.incident || {};
    const tf = data.transformer || {};
    const route = data.route || { distance_km: 1.4, eta_minutes: 10, corridor: 'Primary Radial Corridor', turn_by_turn: [] };

    // Header info
    const nameEl = document.getElementById('terminal-crew-name');
    const statusEl = document.getElementById('terminal-crew-status');
    const metaEl = document.getElementById('terminal-crew-meta');
    const accountLabel = document.getElementById('terminal-account-label');

    if (nameEl) nameEl.textContent = crew.team_name || 'Field Repair Crew';
    if (statusEl) {
        statusEl.textContent = crew.status || (data.has_active_dispatch ? 'DISPATCHED' : 'STANDBY');
        statusEl.className = `tag ${crew.status === 'AVAILABLE' ? 'tag-normal' : (crew.status === 'BUSY' ? 'tag-critical' : 'tag-warning')}`;
    }
    if (metaEl) {
        const lead = crew.leader_name || 'Field Supervisor';
        const phone = crew.leader_phone || '+91 94150 30000';
        const base = crew.power_house_name || 'Metro Central Base';
        const lat = crew.current_lat ? crew.current_lat.toFixed(4) : '26.7480';
        const lng = crew.current_lng ? crew.current_lng.toFixed(4) : '80.9350';
        metaEl.innerHTML = `Lead: <strong>${escapeHtml(lead)}</strong> (${escapeHtml(phone)}) &bull; Base: <strong>${escapeHtml(base)}</strong> &bull; GPS: <code>${lat}&deg;N, ${lng}&deg;E</code>`;
    }
    if (accountLabel && state.user) {
        accountLabel.textContent = `Signed in as ${state.user.name} (${state.user.role})`;
    }

    // Directive Card
    const incRefEl = document.getElementById('terminal-inc-ref');
    const msgEl = document.getElementById('terminal-disp-message');
    const targetSubEl = document.getElementById('terminal-target-sub');
    const targetCoordsEl = document.getElementById('terminal-target-coords');
    const targetCauseEl = document.getElementById('terminal-target-cause');
    const targetSevEl = document.getElementById('terminal-target-sev');
    const corridorEl = document.getElementById('terminal-route-corridor');

    if (incRefEl) incRefEl.textContent = inc.incident_code || 'STANDBY MONITORING';
    if (msgEl) msgEl.textContent = data.primary_dispatch_message || 'Unit ready for deployment.';
    if (targetSubEl) targetSubEl.textContent = tf.substation_name || 'Nearest Grid Transformer';
    if (targetCoordsEl) {
        const tLat = tf.latitude ? tf.latitude.toFixed(4) : '26.7450';
        const tLng = tf.longitude ? tf.longitude.toFixed(4) : '80.9380';
        targetCoordsEl.textContent = `${tLat}°N, ${tLng}°E`;
    }
    if (targetCauseEl) targetCauseEl.textContent = inc.root_cause_prediction || 'System Standby / Periodic Maintenance';
    if (targetSevEl) {
        const score = inc.severity_score !== undefined ? `${inc.severity_score}/100` : 'Normal';
        targetSevEl.textContent = score;
    }
    if (corridorEl) corridorEl.textContent = route.corridor || 'Primary Radial Corridor';

    // HUD metrics
    const hudDist = document.getElementById('hud-route-dist');
    const hudEta = document.getElementById('hud-route-eta');
    if (hudDist) hudDist.textContent = `${route.distance_km} km`;
    if (hudEta) hudEta.textContent = `${route.eta_minutes} mins`;

    // Messages feed
    const msgsEl = document.getElementById('crew-terminal-messages');
    if (msgsEl) {
        const msgs = data.messages || [];
        if (msgs.length === 0) {
            msgsEl.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 12px;">No incoming radio broadcasts for this sector.</div>`;
        } else {
            msgsEl.innerHTML = msgs.map(m => `
                <div class="msg-item">
                    <div class="msg-meta">
                        <span>${escapeHtml(m.sender_name)} (${escapeHtml(m.channel)})</span>
                        <span>${escapeHtml(m.created_at || '')}</span>
                    </div>
                    <div class="msg-text">${escapeHtml(m.message_body)}</div>
                </div>
            `).join('');
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }
    }

    // Turn by turn steps
    const stepsEl = document.getElementById('terminal-turn-steps');
    if (stepsEl) {
        const steps = route.turn_by_turn || [];
        if (steps.length === 0) {
            stepsEl.innerHTML = `<div style="color: var(--text-muted); font-size: 12px;">Direct corridor connection available.</div>`;
        } else {
            stepsEl.innerHTML = steps.map((s, idx) => `
                <div class="turn-step-item ${idx === 0 ? 'step-active' : ''}" id="turn-step-${idx}">
                    <span class="turn-step-icon font-mono">[${s.step}]</span>
                    <span class="turn-step-text"><strong>Step ${s.step}:</strong> ${escapeHtml(s.instruction)}</span>
                    <span class="turn-step-dist">${s.distance_km} km</span>
                </div>
            `).join('');
        }
    }

    // Draw Tactical Route Canvas
    drawCrewRouteCanvas(route, crew, inc, tf, 0);
}

function drawCrewRouteCanvas(route, crew, incident, transformer, progress = 0) {
    const canvas = document.getElementById('crew-route-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Dark Tactical Background & Grid Lines
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1;
    const gridSize = 24;
    for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    const waypoints = route.waypoints || [];
    if (waypoints.length < 2) return;

    // Bounds calculation
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    waypoints.forEach(([lat, lng]) => {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
    });

    const padLat = Math.max(0.005, (maxLat - minLat) * 0.28);
    const padLng = Math.max(0.005, (maxLng - minLng) * 0.28);
    minLat -= padLat; maxLat += padLat;
    minLng -= padLng; maxLng += padLng;

    function toCanvas(lat, lng) {
        const nx = (lng - minLng) / (maxLng - minLng || 0.01);
        const ny = 1.0 - (lat - minLat) / (maxLat - minLat || 0.01);
        return {
            x: 40 + nx * (w - 80),
            y: 35 + ny * (h - 70)
        };
    }

    // 2. Thick Outer Route Base Line
    ctx.beginPath();
    ctx.strokeStyle = '#1E3A8A';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    waypoints.forEach(([lat, lng], idx) => {
        const pt = toCanvas(lat, lng);
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // 3. Glowing Inner Active Route Line with Moving Pulse
    ctx.beginPath();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -(Date.now() / 70) % 16;
    waypoints.forEach(([lat, lng], idx) => {
        const pt = toCanvas(lat, lng);
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Target Substation Destination Beacon (End)
    const endWp = waypoints[waypoints.length - 1];
    const endPt = toCanvas(endWp[0], endWp[1]);

    // Outer pulsing ring
    const pulseRad = 12 + Math.sin(Date.now() / 250) * 4;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, pulseRad, 0, Math.PI * 2);
    ctx.stroke();

    // Substation core circle
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Destination Substation Label
    const subLabel = transformer.substation_name ? transformer.substation_name.replace(/33\/11kV|132kV|Power House/g, '').trim() : 'Fault Target';
    ctx.font = '700 11px Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#F87171';
    ctx.fillText(subLabel, endPt.x - 25, endPt.y - 14);

    // 5. Current Vehicle Position (Start / Interpolated along route)
    // Find point at progress
    const totalSegments = waypoints.length - 1;
    const curSeg = Math.min(totalSegments - 1, Math.floor(progress * totalSegments));
    const segT = (progress * totalSegments) - curSeg;

    const pA = waypoints[curSeg];
    const pB = waypoints[curSeg + 1];
    const curLat = pA[0] + (pB[0] - pA[0]) * segT;
    const curLng = pA[1] + (pB[1] - pA[1]) * segT;
    const truckPt = toCanvas(curLat, curLng);

    // Radar circle for truck
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(truckPt.x, truckPt.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Solid truck icon
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(truckPt.x, truckPt.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '700 11px Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#34D399';
    ctx.fillText('CREW UNIT', truckPt.x - 20, truckPt.y + 20);
}

window.simulateVehicleTransit = function() {
    sound.play('click');
    if (!state.activeCrewDispatch || !state.activeCrewDispatch.route) {
        showToast('No active route loaded to simulate', 'error');
        return;
    }

    const simBtn = document.getElementById('btn-sim-route');
    if (simBtn) {
        simBtn.disabled = true;
        simBtn.textContent = 'Transit in progress...';
    }

    const route = state.activeCrewDispatch.route;
    const crew = state.activeCrewDispatch.crew || {};
    const inc = state.activeCrewDispatch.incident || {};
    const tf = state.activeCrewDispatch.transformer || {};

    const hudDist = document.getElementById('hud-route-dist');
    const hudEta = document.getElementById('hud-route-eta');

    let startTime = null;
    const duration = 9000; // 9 seconds smooth simulation

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(1.0, elapsed / duration);

        drawCrewRouteCanvas(route, crew, inc, tf, progress);

        // Update live countdown
        const curDist = Math.max(0.1, (route.distance_km * (1.0 - progress))).toFixed(1);
        const curEta = Math.max(1, Math.round(route.eta_minutes * (1.0 - progress)));

        if (hudDist) hudDist.textContent = `${curDist} km`;
        if (hudEta) hudEta.textContent = `${curEta} mins`;

        // Highlight turn-by-turn steps
        const totalSteps = route.turn_by_turn ? route.turn_by_turn.length : 1;
        const activeIdx = Math.min(totalSteps - 1, Math.floor(progress * totalSteps));
        document.querySelectorAll('.turn-step-item').forEach((el, idx) => {
            el.classList.toggle('step-active', idx === activeIdx);
        });

        if (progress < 1.0) {
            requestAnimationFrame(step);
        } else {
            sound.play('success');
            showToast('Field Crew arrived at substation entrance!', 'success');
            if (simBtn) {
                simBtn.disabled = false;
                simBtn.textContent = 'Re-simulate Vehicle Transit';
            }
            if (hudDist) hudDist.textContent = '0.0 km';
            if (hudEta) hudEta.textContent = 'On Site';
            window.updateCrewIncidentStatus('ON_SITE');
        }
    }

    requestAnimationFrame(step);
};

window.updateCrewIncidentStatus = async function(status) {
    sound.play('click');
    if (!state.activeCrewDispatch || !state.activeCrewDispatch.incident) {
        showToast('No active incident to update', 'error');
        return;
    }
    const incidentId = state.activeCrewDispatch.incident.id;

    try {
        const res = await fetch(`/api/incidents/${incidentId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.success) {
            sound.play('success');
            showToast(`Incident status updated: ${status}`, 'success');
            await reloadCrewDispatchDetails(false);
            await loadAllData(true);
        } else {
            sound.play('alert');
            showToast(data.error || 'Status update failed', 'error');
        }
    } catch (err) {
        showToast('Network error during status transition', 'error');
    }
};

window.quickUpdateStatus = function(status) {
    return window.updateCrewIncidentStatus(status);
};

window.sendCrewMessage = async function(e) {
    if (e) e.preventDefault();
    sound.play('click');
    const input = document.getElementById('crew-msg-input');
    if (!input || !input.value.trim()) return;
    const body = input.value.trim();

    const incidentId = state.activeCrewDispatch && state.activeCrewDispatch.incident ? state.activeCrewDispatch.incident.id : null;

    try {
        const res = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                incident_id: incidentId,
                message_body: body,
                target_role: 'OPERATOR',
                channel: 'IN_APP'
            })
        });
        const data = await res.json();
        if (data.success) {
            sound.play('success');
            input.value = '';
            showToast('Message transmitted to Grid Control', 'success');
            await reloadCrewDispatchDetails(false);
        } else {
            showToast(data.error || 'Failed to transmit message', 'error');
        }
    } catch (err) {
        showToast('Network error sending message', 'error');
    }
};

window.openActiveRouteTerminal = function() {
    switchView('view-crew-terminal');
};

window.centerMapOnIncidentRoute = function() {
    sound.play('click');
    switchView('view-overview');
    if (state.activeRouteWaypoints && state.activeRouteWaypoints.length > 0) {
        const firstWp = state.activeRouteWaypoints[0];
        state.map.panX = 0;
        state.map.panY = 0;
        state.map.zoom = 1.35;
        scheduleMapRender();
        showToast('GIS map focused on emergency route vector', 'info');
    }
};

