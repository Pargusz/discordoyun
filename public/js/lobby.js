// ============================================================
//  Discord Dungeon — Lobby & WebSocket Manager
// ============================================================

let ws = null;
let currentSessionId = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 3;

// Determine WebSocket URL (same host as page)
function getWSUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}`;
}

// ---- Loading Screen Logging ----
function loadLog(msg) {
  const container = document.getElementById('loading-log');
  if (!container) return;
  const p = document.createElement('p');
  p.textContent = msg;
  container.appendChild(p);
  container.scrollTop = container.scrollHeight;
}

// ---- Start Lobby ----
function startLobby() {
  const token = document.getElementById('botToken').value.trim();
  const guildId = document.getElementById('guildId').value.trim();
  const channelId = document.getElementById('channelId').value.trim();
  const heroName = document.getElementById('heroName').value.trim() || 'Kahraman';

  const errorEl = document.getElementById('setup-error');
  errorEl.style.display = 'none';

  if (!token) { showError('Discord Bot Token zorunludur.'); return; }
  if (!guildId) { showError('Sunucu (Guild) ID zorunludur.'); return; }
  if (!channelId) { showError('Kanal ID zorunludur.'); return; }
  if (!/^\d{17,20}$/.test(guildId)) { showError('Geçersiz Guild ID (17-20 rakam olmalı).'); return; }
  if (!/^\d{17,20}$/.test(channelId)) { showError('Geçersiz Kanal ID (17-20 rakam olmalı).'); return; }

  // Disable button
  const btn = document.getElementById('btn-start');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Bağlanılıyor...';

  showScreen('screen-loading');
  loadLog('🔌 Sunucuya bağlanılıyor...');

  connectWebSocket(token, guildId, channelId, heroName);
}

function showError(msg) {
  const errorEl = document.getElementById('setup-error');
  errorEl.textContent = '❌ ' + msg;
  errorEl.style.display = 'block';

  const btn = document.getElementById('btn-start');
  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">⚔️</span> ZINDANA GİR';

  showScreen('screen-lobby');
}

// ---- WebSocket Connection ----
function connectWebSocket(token, guildId, channelId, heroName) {
  if (ws) { ws.close(); ws = null; }

  try {
    ws = new WebSocket(getWSUrl());
  } catch (e) {
    showError('WebSocket bağlantısı kurulamadı: ' + e.message);
    return;
  }

  ws.onopen = () => {
    loadLog('✅ Sunucuya bağlandı. Discord bot başlatılıyor...');
    ws.send(JSON.stringify({
      type: 'START_LOBBY',
      token, guildId, channelId, heroName
    }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleServerMessage(msg);
  };

  ws.onerror = () => {
    showError('Bağlantı hatası. Sunucunun çalıştığından emin olun (npm start).');
  };

  ws.onclose = (e) => {
    if (e.code !== 1000 && currentSessionId) {
      // Unexpected close, try reconnect
      if (reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        setTimeout(() => {
          if (ws && ws.readyState === WebSocket.CLOSED) {
            const newWs = new WebSocket(getWSUrl());
            newWs.onopen = () => {
              newWs.send(JSON.stringify({ type: 'JOIN_LOBBY', sessionId: currentSessionId }));
            };
            newWs.onmessage = ws.onmessage;
            ws = newWs;
          }
        }, 2000 * reconnectAttempts);
      }
    }
  };
}

// ---- Handle Server Messages ----
function handleServerMessage(msg) {
  switch (msg.type) {

    case 'SESSION_ID':
      currentSessionId = msg.sessionId;
      break;

    case 'LOG':
      loadLog(msg.message);
      break;

    case 'ERROR':
      showError(msg.message);
      break;

    case 'GAME_START':
      reconnectAttempts = 0;
      handleGameEvent(msg);
      break;

    case 'GAME_STATE':
      handleGameEvent(msg);
      break;

    // All other game events
    default:
      if ([
        'MONSTER_ENTER', 'VOTE_START', 'VOTE_UPDATE', 'VOTE_RESULT',
        'ACTION', 'MONSTER_ATTACK', 'MONSTER_DEAD', 'LEVEL_UP',
        'VICTORY', 'GAME_OVER'
      ].includes(msg.type)) {
        handleGameEvent(msg);
      }
      break;
  }
}

// ---- Keyboard Shortcuts (for testing) ----
document.addEventListener('keydown', (e) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const screen = document.querySelector('.screen.active');
  if (!screen || screen.id !== 'screen-game') return;

  const keyMap = { '1': '1', '2': '2', '3': '3', '4': '4' };
  if (keyMap[e.key]) {
    // Show visual feedback
    const card = document.getElementById(`cmd-${e.key}`);
    if (card) {
      card.style.transform = 'scale(0.95)';
      setTimeout(() => card.style.transform = '', 150);
    }
  }
});
