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
 
function toDateString(d) { return d.toISOString().split('T')[0]; }
 
// Returns the date (YYYY-MM-DD) for a given day-of-week in the current week
// weekOffset 0 = this week, 1 = next week
function dateForDow(dow, weekOffset = 0) {
  // Use local date parts to avoid timezone issues
  const now        = new Date();
  const localYear  = now.getFullYear();
  const localMonth = now.getMonth();
  const localDate  = now.getDate();
  const dayOfWeek  = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
 
  // Find Monday of current week
  const diffToMonday = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
 
  // Build Monday as a pure local date (no time component)
  const monday = new Date(localYear, localMonth, localDate + diffToMonday + weekOffset * 7);
 
  // dow: 1=Mon, 2=Tue ... 6=Sat, 0=Sun
  const daysFromMonday = (dow === 0) ? 6 : dow - 1;
  const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + daysFromMonday);
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
 
function renderNav(profile, session) {
  const nav = document.getElementById('nav-user');
  if (!nav) return;
 
  // Remove any existing mobile menu
  document.getElementById('nav-mobile-menu')?.remove();
  document.getElementById('nav-hamburger')?.remove();
 
  if (profile || session) {
    const adminLink = profile?.role === 'admin' ? '<a href="admin.html" class="nav-link">Admin</a>' : '';
 
    // Desktop nav
    nav.innerHTML = `
      <a href="index.html"     class="nav-link">Home</a>
      <a href="dashboard.html" class="nav-link">My Classes</a>
      ${adminLink}
      <button class="btn btn-outline btn-sm" onclick="logout()">Log out</button>`;
 
    // Hamburger button
    const hamburger = document.createElement('button');
    hamburger.className = 'nav-hamburger';
    hamburger.id = 'nav-hamburger';
    hamburger.innerHTML = '<span></span><span></span><span></span>';
    hamburger.onclick = toggleMobileMenu;
    nav.parentElement.appendChild(hamburger);
 
    // Mobile dropdown menu
    const mobileMenu = document.createElement('div');
    mobileMenu.className = 'nav-mobile-menu';
    mobileMenu.id = 'nav-mobile-menu';
    mobileMenu.innerHTML = `
      <a href="index.html">Home</a>
      <a href="dashboard.html">My Classes</a>
      ${profile?.role === 'admin' ? '<a href="admin.html">Admin</a>' : ''}
      <button onclick="logout()">Log out</button>`;
    document.body.appendChild(mobileMenu);
 
  } else {
    nav.innerHTML = `
      <a href="login.html"    class="nav-link">Log in</a>
      <a href="register.html" class="btn btn-primary btn-sm">Join</a>`;
  }
}
 
function toggleMobileMenu() {
  const menu = document.getElementById('nav-mobile-menu');
  if (menu) menu.classList.toggle('open');
}
 
// Close mobile menu when clicking outside
document.addEventListener('click', function(e) {
  const menu = document.getElementById('nav-mobile-menu');
  const hamburger = document.getElementById('nav-hamburger');
  if (menu && hamburger && !menu.contains(e.target) && !hamburger.contains(e.target)) {
    menu.classList.remove('open');
  }
});
 
// ── PWA Install Prompt ────────────────────────────────────
 
(function () {
  // Don't show if already running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) return;
 
  // Don't show if user dismissed within the last 7 days
  const dismissed = localStorage.getItem('kmt-pwa-dismissed');
  if (dismissed && (Date.now() - parseInt(dismissed)) < 7 * 24 * 60 * 60 * 1000) return;
 
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
                !/crios/i.test(navigator.userAgent); // exclude Chrome on iOS
  const isAndroid = /android/i.test(navigator.userAgent);
 
  // Only show on mobile
  if (!isIOS && !isAndroid) return;
 
  let deferredPrompt = null;
 
  // Capture the Android install prompt event
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    // Show our custom sheet after a short delay
    setTimeout(showSheet, 2500);
  });
 
  function buildSheet() {
    // Remove any existing sheet
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
        <p class="pwa-sheet__desc">Add this app to your home screen for quick access to your classes.</p>
        <div class="ios-steps">
          <div class="ios-step"><span class="step-icon">1️⃣</span> Tap the <strong>&nbsp;Share&nbsp;</strong> button at the bottom of Safari</div>
          <div class="ios-step"><span class="step-icon">2️⃣</span> Scroll down and tap <strong>&nbsp;Add to Home Screen</strong></div>
          <div class="ios-step"><span class="step-icon">3️⃣</span> Tap <strong>&nbsp;Add</strong> in the top right corner</div>
        </div>
        <div class="pwa-sheet__actions">
          <button class="btn btn-outline btn-full" id="pwa-dismiss">Maybe later</button>
        </div>`;
    } else {
      sheet.innerHTML = `
        <div class="pwa-sheet__handle"></div>
        <div class="pwa-sheet__top">
          <div class="pwa-sheet__icon"><img src="icons/icon-192.png" alt="KMT"/></div>
          <div class="pwa-sheet__info">
            <div class="pwa-sheet__title">Install KMT App</div>
            <div class="pwa-sheet__sub">kommetjiemuaythai.co.za</div>
          </div>
        </div>
        <p class="pwa-sheet__desc">Install the app for quick access to your classes — no App Store needed.</p>
        <div class="pwa-sheet__actions">
          <button class="btn btn-primary btn-full" id="pwa-install">📲 Add to Home Screen</button>
          <button class="btn btn-outline btn-full" id="pwa-dismiss">Maybe later</button>
        </div>`;
    }
 
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
 
    // Wire up buttons
    document.getElementById('pwa-dismiss')?.addEventListener('click', dismissSheet);
    document.getElementById('pwa-install')?.addEventListener('click', installApp);
 
    // Animate in
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      requestAnimationFrame(() => sheet.classList.add('show'));
    });
  }
 
  function showSheet() {
    buildSheet();
  }
 
  function dismissSheet() {
    const backdrop = document.getElementById('pwa-backdrop');
    const sheet    = backdrop?.querySelector('.pwa-sheet');
    if (sheet)    sheet.classList.remove('show');
    if (backdrop) {
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 350);
    }
    localStorage.setItem('kmt-pwa-dismissed', Date.now().toString());
  }
 
  async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    dismissSheet();
    if (outcome === 'accepted') {
      localStorage.setItem('kmt-pwa-dismissed', Date.now().toString());
    }
  }
 
  // iOS: show after delay since there's no beforeinstallprompt event
  if (isIOS) {
    setTimeout(showSheet, 2500);
  }
})();
