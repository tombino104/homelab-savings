const STATE_KEY = 'homelab-savings:state';
const PREFS_KEY = 'homelab-savings:prefs';
const SAVE_DELAY = 400;

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export async function loadState() {
  try {
    const response = await fetch('api/state', { cache: 'no-store' });
    if (response.ok) return { raw: await response.json(), remote: true };
  } catch {}
  try {
    return { raw: JSON.parse(localStorage.getItem(STATE_KEY)) || {}, remote: false };
  } catch {
    return { raw: {}, remote: false };
  }
}

export function createSaver({ remote, getState, onStatus }) {
  let timer = null;

  async function flush() {
    clearTimeout(timer);
    timer = null;
    const body = JSON.stringify(getState());
    if (!remote) {
      try {
        localStorage.setItem(STATE_KEY, body);
        onStatus(true);
      } catch {
        onStatus(false);
      }
      return;
    }
    try {
      const response = await fetch('api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
      onStatus(response.ok);
    } catch {
      onStatus(false);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  }

  addEventListener('pagehide', () => {
    if (timer) flush();
  });

  return { schedule, flush };
}
