// ============================================================
//  Discord Dungeon — Canvas Renderer
// ============================================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

let canvasW = 0, canvasH = 0;
let animFrame = null;

// Game draw state (updated by ui.js)
const drawState = {
  phase: 'idle',
  hero: null,
  monster: null,
  heroShake: 0,
  monsterShake: 0,
  heroFlash: 0,
  monsterFlash: 0,
  specialEffect: 0,
  bossWarning: 0,
  bgOffset: 0,
  particles: [],
  monsterImage: null,
  monsterImageLoaded: false,
};

// ---- Resize ----
function resizeCanvas() {
  if (!canvas) return;
  const area = document.querySelector('.battle-area');
  if (!area) return;
  canvasW = canvas.width = area.clientWidth;
  canvasH = canvas.height = area.clientHeight;
}

window.addEventListener('resize', resizeCanvas);

// ---- Color Palettes per floor ----
const FLOOR_PALETTES = [
  { sky: '#0d0018', ground: '#1a0a2e', accent: '#8a2be2' },
  { sky: '#001018', ground: '#0a1a2e', accent: '#2288ff' },
  { sky: '#180008', ground: '#2e0a1a', accent: '#ff2288' },
  { sky: '#080018', ground: '#0a0a2e', accent: '#22ffcc' },
  { sky: '#180800', ground: '#2e1a0a', accent: '#ff8822' },
];

function getFloorPalette(floor) {
  return FLOOR_PALETTES[(floor - 1) % FLOOR_PALETTES.length];
}

// ---- Particle System ----
function spawnParticles(x, y, count, color, type = 'spark') {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 2 + Math.random() * 4;
    drawState.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      decay: 0.03 + Math.random() * 0.04,
      color,
      size: 3 + Math.random() * 4,
      type,
    });
  }
}

function updateParticles() {
  drawState.particles = drawState.particles.filter(p => p.life > 0);
  drawState.particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // gravity
    p.life -= p.decay;
    p.vx *= 0.96;
  });
}

function drawParticles() {
  drawState.particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    if (p.type === 'star') {
      drawStar(ctx, p.x, p.y, p.size * p.life, 5);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawStar(ctx, x, y, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points;
    const radius = i % 2 === 0 ? r : r / 2;
    i === 0 ? ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
            : ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

// ---- Draw Background ----
function drawBackground(floor) {
  const pal = getFloorPalette(floor || 1);
  drawState.bgOffset = (drawState.bgOffset + 0.3) % canvasW;

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvasH * 0.7);
  skyGrad.addColorStop(0, pal.sky);
  skyGrad.addColorStop(1, pal.ground);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Moving grid lines
  ctx.strokeStyle = `${pal.accent}22`;
  ctx.lineWidth = 1;
  const gridSize = 60;
  const offset = drawState.bgOffset % gridSize;

  for (let x = -gridSize + offset; x < canvasW + gridSize; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + canvasH * 0.3, canvasH);
    ctx.stroke();
  }

  // Ground plane
  const groundGrad = ctx.createLinearGradient(0, canvasH * 0.6, 0, canvasH);
  groundGrad.addColorStop(0, pal.ground + 'aa');
  groundGrad.addColorStop(1, '#050508');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, canvasH * 0.6, canvasW, canvasH * 0.4);

  // Ground line glow
  ctx.strokeStyle = pal.accent + '88';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 15;
  ctx.shadowColor = pal.accent;
  ctx.beginPath();
  ctx.moveTo(0, canvasH * 0.6);
  ctx.lineTo(canvasW, canvasH * 0.6);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ---- Draw Hero ----
function drawHero(x, y, hero, shake, flash) {
  if (!hero) return;
  ctx.save();

  const sx = x + (shake > 0 ? (Math.random() - 0.5) * shake * 10 : 0);
  ctx.translate(sx, y);

  // Flash effect (hit)
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.filter = 'brightness(3) hue-rotate(200deg)';
  }

  // Body
  const bodyH = 70;
  const bodyW = 40;

  // Cape
  ctx.fillStyle = '#4a1080';
  ctx.beginPath();
  ctx.moveTo(-bodyW / 2 + 5, -bodyH + 10);
  ctx.lineTo(-bodyW / 2 - 10, 0);
  ctx.lineTo(bodyW / 2 + 10, 0);
  ctx.lineTo(bodyW / 2 - 5, -bodyH + 10);
  ctx.fill();

  // Armor body
  const armorGrad = ctx.createLinearGradient(-bodyW / 2, -bodyH, bodyW / 2, 0);
  armorGrad.addColorStop(0, '#7a3ab8');
  armorGrad.addColorStop(1, '#3a1080');
  ctx.fillStyle = armorGrad;
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2 + 2, -bodyH + 15, bodyW - 4, bodyH * 0.65, [4, 4, 2, 2]);
  ctx.fill();

  // Chest plate
  ctx.fillStyle = '#c080ff';
  ctx.fillRect(-10, -bodyH + 20, 20, 20);

  // Head
  ctx.fillStyle = '#f0c080';
  ctx.beginPath();
  ctx.arc(0, -bodyH + 5, 18, 0, Math.PI * 2);
  ctx.fill();

  // Helmet
  ctx.fillStyle = '#5a20a0';
  ctx.beginPath();
  ctx.arc(0, -bodyH + 5, 18, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-18, -bodyH + 5, 36, 8);

  // Eyes
  ctx.fillStyle = '#8aefff';
  ctx.shadowBlur = 8; ctx.shadowColor = '#8aefff';
  ctx.beginPath();
  ctx.arc(-6, -bodyH + 8, 3, 0, Math.PI * 2);
  ctx.arc(6, -bodyH + 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Sword
  ctx.save();
  ctx.translate(bodyW / 2 - 5, -bodyH * 0.5);
  ctx.rotate(-0.3);

  // Blade
  ctx.fillStyle = '#c0d8ff';
  ctx.shadowBlur = 10; ctx.shadowColor = '#8ab8ff';
  ctx.fillRect(-3, -35, 6, 35);

  // Guard
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(-10, 0, 20, 6);
  ctx.shadowBlur = 0;

  // Handle
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(-2, 6, 4, 15);
  ctx.restore();

  // Shield
  ctx.save();
  ctx.translate(-bodyW / 2 + 5, -bodyH * 0.5);
  ctx.fillStyle = '#3a60c0';
  ctx.strokeStyle = '#8aafff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -15);
  ctx.lineTo(10, -15);
  ctx.lineTo(12, 0);
  ctx.lineTo(0, 12);
  ctx.lineTo(-12, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shield emblem
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(0, -5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // HP bar below
  const hpPct = hero.hp / hero.maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-30, 10, 60, 6);
  ctx.fillStyle = hpPct > 0.5 ? '#44ff88' : hpPct > 0.25 ? '#ffaa00' : '#ff4444';
  ctx.fillRect(-30, 10, 60 * hpPct, 6);

  ctx.restore();
}

// ---- Draw Monster ----
function drawMonster(x, y, monster, shake, flash, image) {
  if (!monster) return;
  ctx.save();

  const sx = x + (shake > 0 ? (Math.random() - 0.5) * shake * 10 : 0);
  ctx.translate(sx, y);

  if (flash > 0) {
    ctx.globalAlpha = flash > 0.5 ? 1 : flash;
    ctx.filter = `brightness(${1 + flash * 3}) saturate(${1 - flash})`;
  }

  const scale = monster.power >= 5 ? 1.4 : monster.power >= 3 ? 1.1 : 1.0;
  ctx.scale(-scale, scale); // flip horizontally

  // If we have a Discord avatar image, draw it in a frame
  if (image && drawState.monsterImageLoaded) {
    ctx.save();
    ctx.scale(-1, 1); // un-flip for image
    const size = 70 * scale;

    // Glow ring
    ctx.beginPath();
    ctx.arc(0, -40, size / 2 + 5, 0, Math.PI * 2);
    const ringGrad = ctx.createRadialGradient(0, -40, size / 2 - 5, 0, -40, size / 2 + 10);
    ringGrad.addColorStop(0, monster.power >= 5 ? '#ff880088' : '#ff660033');
    ringGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = ringGrad;
    ctx.fill();

    // Clip circle for avatar
    ctx.beginPath();
    ctx.arc(0, -40, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, -size / 2, -40 - size / 2, size, size);
    ctx.restore();

    // Name tag
    ctx.save();
    ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.roundRect(-45, 0, 90, 22, 4);
    ctx.fill();
    ctx.fillStyle = monster.power >= 5 ? '#ff8844' : '#ffcc44';
    ctx.font = `bold ${Math.min(12, 180 / monster.name.length)}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText(monster.name, 0, 15);
    ctx.restore();

  } else {
    // Procedural monster drawing
    drawMonsterProcedural(ctx, monster);
  }

  // HP bar
  const hpPct = monster.hp / monster.maxHp;
  ctx.save();
  ctx.scale(-1 / scale, 1 / scale);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-35, 20, 70, 7);
  ctx.fillStyle = hpPct > 0.5 ? '#ff6600' : hpPct > 0.25 ? '#ff3300' : '#ff0000';
  ctx.fillRect(-35, 20, 70 * hpPct, 7);
  ctx.restore();

  ctx.restore();
}

function drawMonsterProcedural(ctx, monster) {
  const type = monster.type;
  const isPower = monster.power >= 3;
  const isBoss = monster.power >= 5;

  ctx.shadowBlur = isBoss ? 30 : 10;
  ctx.shadowColor = isBoss ? '#ff4400' : '#ff6600';

  switch (type) {
    case 'goblin': drawGoblin(ctx, isPower); break;
    case 'slime':  drawSlime(ctx, isPower); break;
    case 'bat':    drawBat(ctx, isPower); break;
    case 'zombie': drawZombie(ctx, isPower); break;
    case 'spider': drawSpider(ctx, isPower); break;
    case 'skeleton': drawSkeleton(ctx, isBoss); break;
    case 'orc':    drawOrc(ctx, isBoss); break;
    case 'dragon': drawDragon(ctx); break;
    default:       drawGoblin(ctx, isPower); break;
  }

  ctx.shadowBlur = 0;
}

function drawGoblin(ctx, strong) {
  const c = strong ? '#5aaa22' : '#3a8822';
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(0, -50, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-15, -28, 30, 35);
  ctx.fillStyle = '#ff0'; ctx.beginPath();
  ctx.arc(-7, -55, 5, 0, Math.PI * 2); ctx.arc(7, -55, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath();
  ctx.arc(-7, -55, 2, 0, Math.PI * 2); ctx.arc(7, -55, 2, 0, Math.PI * 2); ctx.fill();
  if (strong) { ctx.fillStyle = '#8b4513'; ctx.fillRect(20, -45, 6, 40); }
}

function drawSlime(ctx, strong) {
  const c = strong ? '#22aaff' : '#2266ff';
  const slimeGrad = ctx.createRadialGradient(-5, -45, 0, 0, -30, 35);
  slimeGrad.addColorStop(0, c + 'ff');
  slimeGrad.addColorStop(1, c + '44');
  ctx.fillStyle = slimeGrad;
  ctx.beginPath();
  ctx.ellipse(0, -25, 30, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(-8, -30, 6, 0, Math.PI * 2);
  ctx.arc(8, -30, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBat(ctx, strong) {
  const c = strong ? '#cc44cc' : '#882288';
  ctx.fillStyle = c;
  // Wings
  ctx.beginPath();
  ctx.ellipse(-30, -40, 25, 12, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(30, -40, 25, 12, 0.5, 0, Math.PI * 2); ctx.fill();
  // Body
  ctx.beginPath(); ctx.arc(0, -35, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff2244';
  ctx.beginPath(); ctx.arc(-5, -40, 3, 0, Math.PI * 2);
  ctx.arc(5, -40, 3, 0, Math.PI * 2); ctx.fill();
}

function drawZombie(ctx, strong) {
  ctx.fillStyle = strong ? '#557755' : '#448844';
  ctx.fillRect(-14, -55, 28, 50);
  ctx.beginPath(); ctx.arc(0, -60, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff0'; ctx.beginPath();
  ctx.arc(-5, -62, 4, 0, Math.PI * 2); ctx.arc(5, -62, 4, 0, Math.PI * 2); ctx.fill();
  // Arms
  ctx.strokeStyle = strong ? '#557755' : '#448844';
  ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-14, -45); ctx.lineTo(-30, -25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, -45); ctx.lineTo(30, -30); ctx.stroke();
}

function drawSpider(ctx, strong) {
  const c = strong ? '#444' : '#222';
  ctx.fillStyle = c;
  // Legs
  ctx.strokeStyle = c; ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const yOff = (i % 2) * 15 - 30;
    ctx.beginPath();
    ctx.moveTo(side * 15, yOff);
    ctx.lineTo(side * 35, yOff - 10);
    ctx.lineTo(side * 50, yOff + 10);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(0, -30, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -55, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f00';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath(); ctx.arc(-8 + i * 2, -58, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSkeleton(ctx, boss) {
  const c = boss ? '#ffeecc' : '#ccbbaa';
  ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.lineCap = 'round';
  // Spine
  ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(0, -20); ctx.stroke();
  // Ribs
  [-55, -45, -35].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(-20, y - 5, -20, y + 10, -15, y + 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(20, y - 5, 20, y + 10, 15, y + 10); ctx.stroke();
  });
  // Arms / Legs
  ctx.beginPath(); ctx.moveTo(0, -55); ctx.lineTo(-25, -35); ctx.lineTo(-20, -10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -55); ctx.lineTo(25, -35); ctx.lineTo(20, -10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-12, 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(12, 10); ctx.stroke();
  // Head
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(0, -82, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(-5, -84, 4, 0, Math.PI * 2); ctx.arc(5, -84, 4, 0, Math.PI * 2); ctx.fill();
  if (boss) {
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -82, 22, Math.PI * 0.8, Math.PI * 0.2); ctx.stroke(); // Crown
  }
}

function drawOrc(ctx, boss) {
  const c = boss ? '#558833' : '#446622';
  ctx.fillStyle = c;
  ctx.fillRect(-22, -55, 44, 55);
  ctx.beginPath(); ctx.arc(0, -62, 25, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#ff2200';
  ctx.beginPath(); ctx.arc(-8, -65, 5, 0, Math.PI * 2); ctx.arc(8, -65, 5, 0, Math.PI * 2); ctx.fill();
  // Tusks
  ctx.fillStyle = '#eee';
  ctx.fillRect(-12, -48, 6, 12);
  ctx.fillRect(6, -48, 6, 12);
  // Weapon
  ctx.fillStyle = '#888';
  ctx.fillRect(24, -80, 10, 70);
  ctx.fillStyle = '#cc4400';
  ctx.beginPath(); ctx.moveTo(29, -80); ctx.lineTo(44, -100); ctx.lineTo(14, -80); ctx.closePath(); ctx.fill();
  if (boss) {
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3;
    ctx.strokeRect(-25, -58, 50, 58);
  }
}

function drawDragon(ctx) {
  // Dragon (boss)
  const c1 = '#cc2200', c2 = '#ff6600';
  // Wings
  ctx.fillStyle = '#440800';
  ctx.beginPath();
  ctx.moveTo(-15, -60);
  ctx.bezierCurveTo(-60, -120, -90, -80, -80, -40);
  ctx.bezierCurveTo(-70, -20, -40, -30, -15, -40);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(15, -60);
  ctx.bezierCurveTo(60, -120, 90, -80, 80, -40);
  ctx.bezierCurveTo(70, -20, 40, -30, 15, -40);
  ctx.closePath(); ctx.fill();

  // Body
  const bg = ctx.createRadialGradient(0, -40, 0, 0, -40, 40);
  bg.addColorStop(0, c2); bg.addColorStop(1, c1);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(0, -40, 32, 45, 0, 0, Math.PI * 2); ctx.fill();

  // Head
  ctx.fillStyle = c1;
  ctx.beginPath(); ctx.arc(0, -90, 22, 0, Math.PI * 2); ctx.fill();

  // Eyes
  ctx.fillStyle = '#ffff00';
  ctx.shadowBlur = 15; ctx.shadowColor = '#ffff00';
  ctx.beginPath();
  ctx.arc(-7, -93, 5, 0, Math.PI * 2);
  ctx.arc(7, -93, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-7, -93, 2, 0, Math.PI * 2);
  ctx.arc(7, -93, 2, 0, Math.PI * 2);
  ctx.fill();

  // Horns
  ctx.fillStyle = '#880000';
  ctx.beginPath(); ctx.moveTo(-10, -108); ctx.lineTo(-18, -128); ctx.lineTo(-4, -110); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, -108); ctx.lineTo(18, -128); ctx.lineTo(4, -110); ctx.fill();

  // Fire breath effect (animated via drawState)
  if (drawState.specialEffect > 0) {
    const alpha = drawState.specialEffect;
    for (let i = 0; i < 5; i++) {
      const fx = -(30 + i * 15);
      const fy = -85 + (Math.random() - 0.5) * 10;
      ctx.fillStyle = `rgba(255, ${150 + i * 20}, 0, ${alpha - i * 0.15})`;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 15 - i * 2, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- VS Text ----
function drawVS(x, y) {
  ctx.save();
  ctx.font = 'bold 36px Cinzel, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const t = Date.now() / 1000;
  const scale = 1 + Math.sin(t * 3) * 0.05;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(255,215,0,0.15)';
  ctx.fillText('VS', 2, 2);
  ctx.fillStyle = '#ffd700';
  ctx.shadowBlur = 20; ctx.shadowColor = '#ffd700';
  ctx.fillText('VS', 0, 0);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ---- Main Draw Loop ----
function gameLoop() {
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasW, canvasH);

  const state = drawState;
  if (!state.hero) {
    animFrame = requestAnimationFrame(gameLoop);
    return;
  }

  // Background
  drawBackground(state.hero ? (state.floor || 1) : 1);

  // Update particles
  updateParticles();
  drawParticles();

  // Positions
  const heroX = canvasW * 0.25;
  const heroY = canvasH * 0.6;
  const monX = canvasW * 0.75;
  const monY = canvasH * 0.6;

  // Draw hero
  drawHero(heroX, heroY, state.hero, state.heroShake, state.heroFlash);

  // Draw monster
  if (state.monster && state.monster.hp > 0) {
    drawMonster(monX, monY, state.monster, state.monsterShake, state.monsterFlash,
      drawState.monsterImage);
  }

  // VS
  if (state.phase === 'voting' || state.phase === 'animating') {
    drawVS(canvasW / 2, canvasH * 0.45);
  }

  // Decay effects
  if (state.heroShake > 0) state.heroShake = Math.max(0, state.heroShake - 0.1);
  if (state.monsterShake > 0) state.monsterShake = Math.max(0, state.monsterShake - 0.1);
  if (state.heroFlash > 0) state.heroFlash = Math.max(0, state.heroFlash - 0.08);
  if (state.monsterFlash > 0) state.monsterFlash = Math.max(0, state.monsterFlash - 0.08);
  if (state.specialEffect > 0) state.specialEffect = Math.max(0, state.specialEffect - 0.05);

  animFrame = requestAnimationFrame(gameLoop);
}

// ---- Public API ----
function initCanvas() {
  resizeCanvas();
  gameLoop();
}

function triggerHeroHit() {
  drawState.heroShake = 1;
  drawState.heroFlash = 1;
  const heroX = canvasW * 0.25;
  const heroY = canvasH * 0.5;
  spawnParticles(heroX, heroY, 12, '#ff4444', 'spark');
}

function triggerMonsterHit(type = 'attack') {
  drawState.monsterShake = 1;
  drawState.monsterFlash = 1;
  const monX = canvasW * 0.75;
  const monY = canvasH * 0.5;
  const color = type === 'special' ? '#ffaa00' : '#ff6600';
  spawnParticles(monX, monY, type === 'special' ? 20 : 10, color, type === 'special' ? 'star' : 'spark');
  if (type === 'special') drawState.specialEffect = 1;
}

function triggerMonsterDeath() {
  const monX = canvasW * 0.75;
  const monY = canvasH * 0.5;
  spawnParticles(monX, monY, 30, '#ffd700', 'star');
  spawnParticles(monX, monY, 20, '#ff6600', 'spark');
}

function loadMonsterImage(url) {
  drawState.monsterImage = null;
  drawState.monsterImageLoaded = false;
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    drawState.monsterImage = img;
    drawState.monsterImageLoaded = true;
  };
  img.onerror = () => {
    drawState.monsterImage = null;
    drawState.monsterImageLoaded = false;
  };
  img.src = url;
}
