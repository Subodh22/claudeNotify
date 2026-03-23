const KEY_TARGET   = 'cr_target';
const KEY_DURATION = 'cr_duration';
const KEY_NOTIF    = 'cr_notif';
const KEY_MSG_ID   = 'cr_msg_id';

const $ = id => document.getElementById(id);

const els = {
  h:            $('h'),
  m:            $('m'),
  s:            $('s'),
  clock:        $('clock'),
  progress:     $('progress-bar'),
  statusText:   $('status-text'),
  startBtn:     $('start-btn'),
  stopBtn:      $('stop-btn'),
  customBtn:    $('custom-btn'),
  notifBtn:     $('notif-btn'),
  bellOn:       $('bell-on'),
  bellOff:      $('bell-off'),
  modal:        $('modal'),
  modalCancel:  $('modal-cancel'),
  modalConfirm: $('modal-confirm'),
  inpH:         $('inp-h'),
  inpM:         $('inp-m'),
  doneOverlay:  $('done-overlay'),
  doneClose:    $('done-close'),
  resetHint:    $('reset-hint'),
  chime:        $('chime'),
};

let targetTime    = parseInt(localStorage.getItem(KEY_TARGET))   || 0;
let totalDuration = parseInt(localStorage.getItem(KEY_DURATION)) || 0;
let notifEnabled  = localStorage.getItem(KEY_NOTIF) === 'true';
let messageId     = localStorage.getItem(KEY_MSG_ID) || null;
let interval      = null;
let hasNotified   = false;

// ── Helpers ────────────────────────────────────────────────────────────────

function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// ── Push Subscription ──────────────────────────────────────────────────────

async function getPushSubscription() {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const res = await fetch('/api/vapid-key');
  const { publicKey } = await res.json();

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

// ── Notification UI ────────────────────────────────────────────────────────

function updateNotifUI() {
  const active = notifEnabled && Notification.permission === 'granted';
  els.notifBtn.classList.toggle('active', active);
  els.bellOn.style.display  = active ? 'block' : 'none';
  els.bellOff.style.display = active ? 'none'  : 'block';
}

els.notifBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('Notifications not supported in this browser.');

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      notifEnabled = true;
      localStorage.setItem(KEY_NOTIF, 'true');
      await getPushSubscription().catch(console.error);
    }
  } else if (Notification.permission === 'granted') {
    notifEnabled = !notifEnabled;
    localStorage.setItem(KEY_NOTIF, String(notifEnabled));
    if (notifEnabled) await getPushSubscription().catch(console.error);
  } else {
    alert('Notifications are blocked in your browser settings.');
  }
  updateNotifUI();
});

// ── Display ────────────────────────────────────────────────────────────────

function updateDisplay(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  els.h.textContent = pad(Math.floor(total / 3600));
  els.m.textContent = pad(Math.floor((total % 3600) / 60));
  els.s.textContent = pad(total % 60);

  if (totalDuration > 0) {
    els.progress.style.width = Math.min(100, (ms / totalDuration) * 100) + '%';
  }
}

function setIdle() {
  els.clock.className      = 'clock idle';
  els.progress.className   = 'progress-bar-fill';
  els.statusText.className = 'status-text';
  els.statusText.textContent = 'Hit the limit? Start the timer.';
  els.startBtn.style.display = '';
  els.stopBtn.style.display  = 'none';
  els.resetHint.style.display = 'none';
  updateDisplay(0);
  els.progress.style.width = '0%';
}

function setRunning() {
  els.clock.className      = 'clock running';
  els.statusText.className = 'status-text running';
  els.statusText.textContent = 'Counting down…';
  els.startBtn.style.display = 'none';
  els.stopBtn.style.display  = '';
  hasNotified = false;

  const reset = new Date(targetTime);
  els.resetHint.textContent = `Resets at ${reset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  els.resetHint.style.display = '';
}

// ── Tick ───────────────────────────────────────────────────────────────────

function tick() {
  const remaining = targetTime - Date.now();

  if (remaining <= 0) {
    clearInterval(interval);
    interval = null;
    updateDisplay(0);
    els.progress.className   = 'progress-bar-fill done';
    els.clock.className      = 'clock done';
    els.statusText.className = 'status-text done';
    els.statusText.textContent = 'Usage reset!';
    els.startBtn.style.display = '';
    els.stopBtn.style.display  = 'none';

    if (!hasNotified) {
      hasNotified = true;
      // In-app sound + overlay (fires when tab is open)
      if (els.chime) els.chime.play().catch(() => {});
      els.doneOverlay.style.display = 'flex';
    }
  } else {
    updateDisplay(remaining);
  }
}

// ── Start Timer ────────────────────────────────────────────────────────────

async function startTimer(durationMs) {
  if (interval) clearInterval(interval);

  totalDuration = durationMs;
  targetTime    = Date.now() + durationMs;
  localStorage.setItem(KEY_TARGET,   String(targetTime));
  localStorage.setItem(KEY_DURATION, String(totalDuration));

  setRunning();
  tick();
  interval = setInterval(tick, 1000);

  // Schedule server-side push (fires even if tab is closed)
  if (notifEnabled && Notification.permission === 'granted') {
    try {
      const sub = await getPushSubscription();
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          delaySeconds: Math.ceil(durationMs / 1000),
        }),
      });
      const data = await res.json();
      if (data.messageId) {
        messageId = data.messageId;
        localStorage.setItem(KEY_MSG_ID, messageId);
      }
    } catch (e) {
      console.warn('Could not schedule server push:', e);
    }
  }
}

// ── Stop Timer ─────────────────────────────────────────────────────────────

function stopTimer() {
  clearInterval(interval);
  interval      = null;
  targetTime    = 0;
  totalDuration = 0;
  localStorage.removeItem(KEY_TARGET);
  localStorage.removeItem(KEY_DURATION);

  // Cancel the scheduled push
  if (messageId) {
    fetch('/api/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    }).catch(() => {});
    messageId = null;
    localStorage.removeItem(KEY_MSG_ID);
  }

  setIdle();
}

// ── Button Handlers ────────────────────────────────────────────────────────

els.startBtn.addEventListener('click', () => startTimer(5 * 3600 * 1000));
els.stopBtn.addEventListener('click', stopTimer);

els.customBtn.addEventListener('click', () => { els.modal.style.display = 'flex'; });
els.modalCancel.addEventListener('click', () => { els.modal.style.display = 'none'; });
els.modal.addEventListener('click', e => { if (e.target === els.modal) els.modal.style.display = 'none'; });

els.modalConfirm.addEventListener('click', () => {
  const h = parseInt(els.inpH.value) || 0;
  const m = parseInt(els.inpM.value) || 0;
  const ms = (h * 3600 + m * 60) * 1000;
  if (ms > 0) {
    els.modal.style.display = 'none';
    startTimer(ms);
  }
});

els.doneClose.addEventListener('click', () => {
  els.doneOverlay.style.display = 'none';
  stopTimer();
});

// ── Init ───────────────────────────────────────────────────────────────────

updateNotifUI();

if (targetTime > Date.now()) {
  setRunning();
  tick();
  interval = setInterval(tick, 1000);
} else {
  setIdle();
}
