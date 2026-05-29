// app.js — shared utilities (include after config.js)
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:    true,
    storageKey:        'kmt-auth',
    storage:           window.localStorage,
    autoRefreshToken:  true,
    detectSessionInUrl: false
  }
});

// ── Auth ──────────────────────────────────────────────────────

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function getProfile(userId) {
  const { data } = await db.from('profiles').select('*').eq('id', userId).single();
  return data;
}

async function requireAuth(redirect = 'login.html') {
  const session = await getSession();
  if (!session) { window.location.href = redirect; return null; }
  return session;
}

async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  const profile = await getProfile(session.user.id);
  if (!profile || profile.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return null;
  }
  return { session, profile };
}

async function logout() {
  await db.auth.signOut();
  window.location.href = 'index.html';
}

// ── Date / schedule helpers ───────────────────────────────────

const DAYS       = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatTime(t) {
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`;
}

function toDateString(d) {
  // Use local date parts — toISOString() returns UTC which shifts dates back
  // by 1 day for UTC+2 timezones (e.g. SAST) causing wrong day assignments
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Returns the date (YYYY-MM-DD) for a given day-of-week in the current week
// weekOffset 0 = this week, 1 = next week
// Always anchors to THIS week's Monday so past days still show (as "Session passed")
function dateForDow(dow, weekOffset = 0) {
  const now = new Date();
  // Find this week's Monday (ISO week: Mon=start)
  const todayDow = now.getDay(); // 0=Sun,1=Mon,...6=Sat
  const daysToMonday = todayDow === 0 ? -6 : 1 - todayDow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  // Offset from Monday: Sun(0)=6, Mon(1)=0, Tue(2)=1 ... Sat(6)=5
  const offset = dow === 0 ? 6 : dow - 1;
  const d = new Date(monday);
  d.setDate(monday.getDate() + offset);
  return toDateString(d);
}

// Can the user still cancel this booking?
function canCancel(classDate, startTime) {
  const now  = new Date();
  const hour = parseInt(startTime.split(':')[0]);
  let cutoff;
  if (hour < 12) {
    // Morning → cutoff 22:00 the night before
    cutoff = new Date(classDate + 'T22:00:00');
    cutoff.setDate(cutoff.getDate() - 1);
  } else {
    // Afternoon → cutoff 09:00 same day
    cutoff = new Date(classDate + 'T09:00:00');
  }
  return now < cutoff;
}

// ── UI helpers ────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--show'));
  setTimeout(() => {
    t.classList.remove('toast--show');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function setBtn(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn.dataset.orig = btn.textContent; btn.textContent = 'Please wait…'; }
  else btn.textContent = btn.dataset.orig || btn.textContent;
}

function renderNav(profile) {
  const nav = document.getElementById('nav-user');
  if (!nav) return;
  if (profile) {
    nav.innerHTML = `
      <span class="nav-name">${profile.full_name.split(' ')[0]}</span>
      ${profile.role === 'admin' ? '<a href="admin.html" class="nav-link">Admin</a>' : ''}
      <a href="dashboard.html" class="nav-link">My Classes</a>
      <button class="btn btn-outline btn-sm" onclick="logout()">Log out</button>`;
  } else {
    nav.innerHTML = `
      <a href="login.html"    class="nav-link">Log in</a>
      <a href="register.html" class="btn btn-primary btn-sm">Join</a>`;
  }
}

// ── PWA Install Prompt ────────────────────────────────────
// Shows on every session where the app is not already installed.
// Dismissal is stored in sessionStorage only — resets each browser session.
// On iOS: shows manual Add to Home Screen instructions (no native API).
// On Android: uses beforeinstallprompt for one-tap native install.

(function () {
  // Already running as installed PWA — do nothing
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) return;

  // Dismissed earlier this session — do nothing
  if (sessionStorage.getItem('kmt-pwa-dismissed')) return;

  const isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
                    !/crios/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);

  if (!isIOS && !isAndroid) return;

  let deferredPrompt = null;

  // Android: capture the native install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(showSheet, 1500);
  });

  // Fallback: if beforeinstallprompt hasn't fired after 3s, show sheet anyway
  // (handles cases where Chrome delays the event or user hasn't met engagement threshold)
  let sheetShown = false;
  function showSheet() {
    if (sheetShown) return;
    sheetShown = true;
    buildSheet();
  }

  // iOS always needs manual instructions
  if (isIOS) {
    setTimeout(showSheet, 1500);
  } else {
    // Android fallback — show after 3s even if beforeinstallprompt hasn't fired
    setTimeout(showSheet, 3000);
  }

  function buildSheet() {
    document.getElementById('pwa-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'pwa-backdrop';
    backdrop.className = 'pwa-backdrop';
    backdrop.addEventListener('click', dismissSheet);

    const sheet = document.createElement('div');
    sheet.className = 'pwa-sheet';
    sheet.addEventListener('click', e => e.stopPropagation());

    if (isIOS) {
      sheet.innerHTML = `
        <div class="pwa-sheet__handle"></div>
        <div class="pwa-sheet__top">
          <div class="pwa-sheet__icon"><img src="icons/icon-192.png" alt="KMT"/></div>
          <div class="pwa-sheet__info">
            <div class="pwa-sheet__title">Install KMT App</div>
            <div class="pwa-sheet__sub">kommetjiemuaythai.co.za</div>
          </div>
        </div>
        <p class="pwa-sheet__desc">Add this app to your home screen for instant access to your classes — no App Store needed.</p>
        <div class="ios-steps">
          <div class="ios-step"><span class="step-icon">1️⃣</span>Tap the <strong>Share</strong> button at the bottom of Safari</div>
          <div class="ios-step"><span class="step-icon">2️⃣</span>Scroll down and tap <strong>Add to Home Screen</strong></div>
          <div class="ios-step"><span class="step-icon">3️⃣</span>Tap <strong>Add</strong> in the top right corner</div>
        </div>
        <div class="pwa-sheet__actions">
          <button class="btn btn-outline btn-full" id="pwa-dismiss">Maybe later</button>
        </div>`;
    } else {
      // Android — show native button if prompt captured, otherwise show manual instructions
      if (deferredPrompt) {
        sheet.innerHTML = `
          <div class="pwa-sheet__handle"></div>
          <div class="pwa-sheet__top">
            <div class="pwa-sheet__icon"><img src="icons/icon-192.png" alt="KMT"/></div>
            <div class="pwa-sheet__info">
              <div class="pwa-sheet__title">Install KMT App</div>
              <div class="pwa-sheet__sub">kommetjiemuaythai.co.za</div>
            </div>
          </div>
          <p class="pwa-sheet__desc">Install the app for instant access to your classes — no Play Store needed.</p>
          <div class="pwa-sheet__actions">
            <button class="btn btn-primary btn-full" id="pwa-install">📲 Add to Home Screen</button>
            <button class="btn btn-outline btn-full" id="pwa-dismiss">Maybe later</button>
          </div>`;
      } else {
        // Chrome hasn't fired beforeinstallprompt yet — show manual instructions
        sheet.innerHTML = `
          <div class="pwa-sheet__handle"></div>
          <div class="pwa-sheet__top">
            <div class="pwa-sheet__icon"><img src="icons/icon-192.png" alt="KMT"/></div>
            <div class="pwa-sheet__info">
              <div class="pwa-sheet__title">Install KMT App</div>
              <div class="pwa-sheet__sub">kommetjiemuaythai.co.za</div>
            </div>
          </div>
          <p class="pwa-sheet__desc">Add this app to your home screen for instant access to your classes.</p>
          <div class="ios-steps">
            <div class="ios-step"><span class="step-icon">1️⃣</span>Tap the <strong>⋮ menu</strong> in the top right of Chrome</div>
            <div class="ios-step"><span class="step-icon">2️⃣</span>Tap <strong>Add to Home screen</strong></div>
            <div class="ios-step"><span class="step-icon">3️⃣</span>Tap <strong>Add</strong> to confirm</div>
          </div>
          <div class="pwa-sheet__actions">
            <button class="btn btn-outline btn-full" id="pwa-dismiss">Maybe later</button>
          </div>`;
      }
    }

    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);

    document.getElementById('pwa-dismiss')?.addEventListener('click', dismissSheet);
    document.getElementById('pwa-install')?.addEventListener('click', installApp);

    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      requestAnimationFrame(() => sheet.classList.add('show'));
    });
  }

  function dismissSheet() {
    const backdrop = document.getElementById('pwa-backdrop');
    const sheet    = backdrop?.querySelector('.pwa-sheet');
    if (sheet)    sheet.classList.remove('show');
    if (backdrop) {
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 350);
    }
    sessionStorage.setItem('kmt-pwa-dismissed', '1');
  }

  async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    dismissSheet();
  }
})();
