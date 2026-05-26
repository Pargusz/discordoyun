// ============================================================
//  Discord Dungeon — UI Manager
// ============================================================

let gameState = null;
let voteTimerInterval = null;
let voteEndTime = 0;

// ---- Screen Management ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById(id);
  if (s) s.classList.add('active');

  if (id === 'screen-game') {
    setTimeout(() => { initCanvas(); }, 100);
  }
}

// ---- Stars init ----
function initStars() {
  const container = document.getElementById('stars');
  if (!container) return;
  for (let i = 0; i < 120; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    star.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${size}px;
      --dur: ${2 + Math.random() * 4}s;
      animation-delay: ${Math.random() * 4}s;
    `;
    container.appendChild(star);
  }
}
initStars();

// ---- Update HUD ----
function updateHUD(state) {
  if (!state) return;
  gameState = state;

  const hero = state.hero;
  const monster = state.monster;

  if (hero) {
    // Update canvas draw state
    drawState.hero = hero;
    drawState.floor = state.floor;

    // Hero stats
    document.getElementById('hud-hero-name').textContent = hero.name || 'Kahraman';

    const hpPct = (hero.hp / hero.maxHp) * 100;
    const mpPct = (hero.mana / hero.maxMana) * 100;

    document.getElementById('bar-hp').style.width = hpPct + '%';
    document.getElementById('bar-mp').style.width = mpPct + '%';
    document.getElementById('val-hp').textContent = `${hero.hp}/${hero.maxHp}`;
    document.getElementById('val-mp').textContent = `${hero.mana}/${hero.maxMana}`;

    document.getElementById('badge-level').textContent = `LV ${hero.level}`;
    document.getElementById('badge-gold').textContent = `💰 ${hero.gold}`;
    document.getElementById('badge-potion').textContent = `💊 ${hero.potions}`;
  }

  // Floor
  document.getElementById('floor-badge').textContent = `🏰 KAT ${state.floor || 1}`;

  // Monster
  if (monster) {
    drawState.monster = monster;

    document.getElementById('hud-monster-name').textContent = monster.name || '???';
    document.getElementById('monster-emoji').textContent = monster.emoji || '👺';

    const ePct = (monster.hp / monster.maxHp) * 100;
    document.getElementById('bar-enemy').style.width = Math.max(0, ePct) + '%';
    document.getElementById('val-enemy').textContent = `${Math.max(0, monster.hp)}/${monster.maxHp}`;

    const badge = document.getElementById('monster-type-badge');
    const typeNames = {
      goblin: '👺 Goblin', slime: '🟢 Slime', bat: '🦇 Yarasa',
      zombie: '🧟 Zombi', spider: '🕷️ Örümcek', skeleton: '💀 İskelet',
      orc: '👹 Ork Elite', dragon: '🐉 EJDERHA BOSS'
    };
    badge.textContent = typeNames[monster.type] || monster.type;
    badge.style.color = monster.power >= 5 ? '#ff4400' : monster.power >= 3 ? '#ff8844' : '#ffcc44';

    // Monster progress
    document.getElementById('monster-count-label').textContent =
      `${state.defeatedMonsters?.length || 0}/${state.totalMonsters || 0} Yenildi`;
  }

  // Log
  if (state.log) {
    updateLog(state.log);
  }
}

// ---- Battle Log ----
function updateLog(logEntries) {
  const container = document.getElementById('log-entries');
  if (!container) return;
  container.innerHTML = '';
  logEntries.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry ' + getLogClass(entry.msg);
    div.textContent = entry.msg;
    container.appendChild(div);
  });
}

function getLogClass(msg) {
  if (msg.includes('hasar verdi') && msg.includes('Kahraman')) return 'log-damage';
  if (msg.includes('HP') || msg.includes('yenilendi')) return 'log-heal';
  if (msg.includes('BÜYÜLÜ') || msg.includes('KOMBO')) return 'log-special';
  if (msg.includes('SEVİYE')) return 'log-level';
  if (msg.includes('yenildi') && msg.includes('💀')) return 'log-death';
  return '';
}

// ---- Vote Display ----
function updateVotes(votes) {
  const cmds = ['1', '2', '3', '4'];
  let maxVotes = 0;
  cmds.forEach(c => { if ((votes[c] || 0) > maxVotes) maxVotes = votes[c] || 0; });

  cmds.forEach(c => {
    const count = votes[c] || 0;
    const el = document.getElementById(`votes-${c}`);
    const card = document.getElementById(`cmd-${c}`);
    if (el) el.textContent = `${count} oy`;
    if (card) {
      card.classList.toggle('active', count > 0);
      card.classList.toggle('winning', count > 0 && count === maxVotes);
    }
  });

  // Top count display
  const countEl = document.getElementById('vote-counts');
  if (countEl) {
    countEl.innerHTML = cmds.map(c =>
      `<span style="color:${(votes[c] || 0) === maxVotes && maxVotes > 0 ? '#ffd700' : '#8888aa'}">${c}: ${votes[c] || 0}</span>`
    ).join('');
  }
}

function clearVotes() {
  ['1','2','3','4'].forEach(c => {
    const el = document.getElementById(`votes-${c}`);
    const card = document.getElementById(`cmd-${c}`);
    if (el) el.textContent = '0 oy';
    if (card) { card.classList.remove('active', 'winning'); }
  });
}

// ---- Vote Timer ----
function startVoteTimer(durationMs) {
  voteEndTime = Date.now() + durationMs;
  if (voteTimerInterval) clearInterval(voteTimerInterval);

  const bar = document.getElementById('vote-timer-bar');
  voteTimerInterval = setInterval(() => {
    const remaining = voteEndTime - Date.now();
    const pct = Math.max(0, (remaining / durationMs) * 100);
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = pct > 50
        ? 'linear-gradient(90deg, #8a2be2, #ffd700)'
        : pct > 25
          ? 'linear-gradient(90deg, #ff8800, #ffdd00)'
          : 'linear-gradient(90deg, #ff2200, #ff6600)';
    }
    if (remaining <= 0) clearInterval(voteTimerInterval);
  }, 50);
}

// ---- Damage Floaters ----
function showFloater(text, x, y, color = '#ff4444', size = '1.5rem') {
  const container = document.getElementById('floaters');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.cssText = `left:${x}px; top:${y}px; color:${color}; font-size:${size};`;
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function showActionOverlay(text, color) {
  const overlay = document.getElementById('action-overlay');
  if (!overlay) return;
  overlay.textContent = text;
  overlay.style.color = color;
  overlay.classList.remove('show');
  void overlay.offsetWidth;
  overlay.classList.add('show');
}

// ---- Handle Game Events ----
function handleGameEvent(event) {
  switch (event.type) {

    case 'GAME_START':
    case 'GAME_STATE':
      updateHUD(event.state || event);
      showScreen('screen-game');
      break;

    case 'MONSTER_ENTER': {
      const m = event.monster;
      if (m) {
        drawState.monster = m;
        loadMonsterImage(m.avatarURL);
      }
      updateHUD({ ...gameState, monster: m, floor: event.floor });
      clearVotes();

      if (event.isBoss) {
        showActionOverlay('⚠️ BOSS!', '#ff4400');
      }
      break;
    }

    case 'VOTE_START':
      startVoteTimer(event.windowMs);
      updateVotes(event.votes || {});
      break;

    case 'VOTE_UPDATE':
      updateVotes(event.votes || {});
      break;

    case 'VOTE_RESULT': {
      const cmdNames = { '1': '⚔️ SALDIRI!', '2': '🛡️ SAVUNMA!', '3': '🔥 BÜYÜ!', '4': '💊 İKSİR!' };
      const colors = { '1': '#ff8800', '2': '#4488ff', '3': '#ff4400', '4': '#44ff88' };
      showActionOverlay(cmdNames[event.winningCommand] || '⚔️', colors[event.winningCommand] || '#fff');
      break;
    }

    case 'ACTION': {
      const act = event;

      if (act.heroState) updateHUD({ ...gameState, hero: act.heroState, monster: act.monsterState });
      if (act.monsterState) drawState.monster = act.monsterState;

      if (act.log) addLogEntry(act.log);

      switch (act.type) {
        case 'attack':
          triggerMonsterHit('attack');
          showFloater(`-${act.damage}`, window.innerWidth * 0.72, window.innerHeight * 0.4, '#ff6600', '2rem');
          break;
        case 'special':
          triggerMonsterHit('special');
          showFloater(`🔥 -${act.damage}`, window.innerWidth * 0.68, window.innerHeight * 0.35, '#ff8800', '2.5rem');
          break;
        case 'defend':
          showFloater(`+${act.manaRegen} MP`, window.innerWidth * 0.22, window.innerHeight * 0.35, '#4488ff', '1.5rem');
          break;
        case 'potion':
          showFloater(`+${act.heal} HP`, window.innerWidth * 0.22, window.innerHeight * 0.35, '#44ff88', '2rem');
          break;
        case 'special_fail':
          showFloater('❌ Mana Yok!', window.innerWidth * 0.22, window.innerHeight * 0.35, '#ff4444', '1.5rem');
          break;
        case 'potion_fail':
          showFloater('❌ İksir Yok!', window.innerWidth * 0.22, window.innerHeight * 0.35, '#ff4444', '1.5rem');
          break;
      }
      break;
    }

    case 'MONSTER_ATTACK': {
      triggerHeroHit();
      if (event.heroState) updateHUD({ ...gameState, hero: event.heroState });
      if (event.damage) showFloater(`-${event.damage}`, window.innerWidth * 0.22, window.innerHeight * 0.4, '#ff4444', '2rem');
      if (event.log) addLogEntry(event.log);
      break;
    }

    case 'MONSTER_DEAD': {
      triggerMonsterDeath();
      if (event.heroState) updateHUD({ ...gameState, hero: event.heroState });
      addLogEntry(`💀 ${event.monster?.name} yenildi! (${event.defeatedCount}/${gameState?.totalMonsters || '?'})`);
      break;
    }

    case 'LEVEL_UP': {
      if (event.heroState) updateHUD({ ...gameState, hero: event.heroState });
      showActionOverlay(`⬆️ LV ${event.level}!`, '#ffd700');
      addLogEntry(event.log);
      // Particle burst
      spawnParticles(canvasW * 0.25, canvasH * 0.5, 30, '#ffd700', 'star');
      break;
    }

    case 'VICTORY':
      showEndScreen('victory', event);
      break;

    case 'GAME_OVER':
      showEndScreen('gameover', event);
      break;
  }
}

function addLogEntry(msg) {
  if (!gameState) gameState = {};
  if (!gameState.log) gameState.log = [];
  gameState.log.unshift({ msg, time: Date.now() });
  if (gameState.log.length > 20) gameState.log.pop();
  updateLog(gameState.log);
}

// ---- End Screens ----
function showEndScreen(type, event) {
  const hero = event.heroState;
  const screenId = type === 'victory' ? 'screen-victory' : 'screen-gameover';

  if (type === 'victory') {
    document.getElementById('victory-sub').textContent =
      `${hero?.name || 'Kahraman'} tüm ${event.totalMonsters} canavarı yendi! 🏆`;

    document.getElementById('victory-stats').innerHTML = `
      <div class="stat-item"><div class="stat-label">Seviye</div><div class="stat-val">LV ${hero?.level || 1}</div></div>
      <div class="stat-item"><div class="stat-label">Altın</div><div class="stat-val">💰 ${hero?.gold || 0}</div></div>
      <div class="stat-item"><div class="stat-label">Yenilen Düşman</div><div class="stat-val">${event.totalMonsters}</div></div>
      <div class="stat-item"><div class="stat-label">Kat</div><div class="stat-val">🏰 ${event.floor}</div></div>
    `;
  } else {
    document.getElementById('gameover-sub').textContent =
      `${hero?.name || 'Kahraman'} ${event.defeatedMonsters?.length || 0} düşmanı yenebildi...`;

    document.getElementById('gameover-stats').innerHTML = `
      <div class="stat-item"><div class="stat-label">Seviye</div><div class="stat-val">LV ${hero?.level || 1}</div></div>
      <div class="stat-item"><div class="stat-label">Altın</div><div class="stat-val">💰 ${hero?.gold || 0}</div></div>
      <div class="stat-item"><div class="stat-label">Yenilen Düşman</div><div class="stat-val">${event.defeatedMonsters?.length || 0}/${event.totalMonsters}</div></div>
      <div class="stat-item"><div class="stat-label">HP</div><div class="stat-val">❤️ 0/${hero?.maxHp || 100}</div></div>
    `;
  }

  showScreen(screenId);
}

function resetGame() {
  gameState = null;
  drawState.hero = null;
  drawState.monster = null;
  drawState.particles = [];
  drawState.monsterImage = null;
  drawState.monsterImageLoaded = false;
  showScreen('screen-lobby');
}
