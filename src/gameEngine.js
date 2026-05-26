// ============================================================
//  Discord Dungeon — Game Engine (Server-Side)
// ============================================================

const MONSTER_STATS = {
  goblin:   { hp: 30,  atk: 8,  def: 2,  xp: 15,  gold: 5,  emoji: '👺' },
  slime:    { hp: 20,  atk: 5,  def: 1,  xp: 10,  gold: 3,  emoji: '🟢' },
  bat:      { hp: 25,  atk: 10, def: 1,  xp: 12,  gold: 4,  emoji: '🦇' },
  zombie:   { hp: 45,  atk: 12, def: 3,  xp: 20,  gold: 8,  emoji: '🧟' },
  spider:   { hp: 35,  atk: 14, def: 2,  xp: 18,  gold: 6,  emoji: '🕷️' },
  skeleton: { hp: 60,  atk: 18, def: 5,  xp: 35,  gold: 15, emoji: '💀' },
  orc:      { hp: 100, atk: 25, def: 8,  xp: 60,  gold: 30, emoji: '👹' },
  dragon:   { hp: 250, atk: 40, def: 15, xp: 150, gold: 100, emoji: '🐉' },
};

const HERO_BASE = {
  hp: 100, maxHp: 100,
  mana: 50, maxMana: 50,
  atk: 15, def: 5,
  level: 1, xp: 0, xpNext: 50,
  gold: 0,
  potions: 2,
};

const VOTE_WINDOW_MS = 5000; // 5 seconds

class GameEngine {
  constructor(members, heroName) {
    this.heroName = heroName;
    this.hero = { ...HERO_BASE };
    this.allMonsters = this._buildMonsters(members);
    this.currentMonsterIndex = 0;
    this.currentMonster = null;
    this.votes = {};
    this.voteTimer = null;
    this.phase = 'idle'; // idle | voting | animating | win | lose | boss
    this.log = [];
    this.defeatedMonsters = [];
    this.onEvent = null;
    this.floor = 1;
    this.combo = 0;
  }

  _buildMonsters(members) {
    return members.map(m => {
      const base = MONSTER_STATS[m.monsterType] || MONSTER_STATS.goblin;
      const powerMult = m.power || 1;
      return {
        id: m.id,
        name: m.username,
        type: m.monsterType,
        emoji: base.emoji,
        avatarURL: m.avatarURL,
        roles: m.roles,
        maxHp: Math.floor(base.hp * powerMult),
        hp: Math.floor(base.hp * powerMult),
        atk: Math.floor(base.atk * powerMult),
        def: Math.floor(base.def * powerMult),
        xp: Math.floor(base.xp * powerMult),
        gold: Math.floor(base.gold * powerMult),
        power: powerMult,
        defeated: false,
      };
    });
  }

  start(onEvent) {
    this.onEvent = onEvent;
    this._nextMonster();
  }

  _nextMonster() {
    // Skip already-defeated monsters (shouldn't happen but safety)
    while (
      this.currentMonsterIndex < this.allMonsters.length &&
      this.allMonsters[this.currentMonsterIndex].defeated
    ) {
      this.currentMonsterIndex++;
    }

    if (this.currentMonsterIndex >= this.allMonsters.length) {
      this._victory();
      return;
    }

    this.currentMonster = this.allMonsters[this.currentMonsterIndex];

    // Floor changes every 5 monsters
    this.floor = Math.floor(this.currentMonsterIndex / 5) + 1;

    this.phase = 'voting';
    this.votes = {};
    this.combo = 0;

    const isBoss = this.currentMonster.power >= 5;

    this._emit('MONSTER_ENTER', {
      monster: this._safeMonster(),
      floor: this.floor,
      isBoss,
      monstersLeft: this.allMonsters.length - this.currentMonsterIndex,
    });

    this._addLog(`${this.currentMonster.emoji} ${this.currentMonster.name} karşına çıktı! (${this.currentMonster.type})`);
    this._startVoteTimer();
  }

  registerVote(command, username) {
    if (this.phase !== 'voting') return;
    this.votes[command] = (this.votes[command] || 0) + 1;
    this._emit('VOTE_UPDATE', { votes: this.getVotes(), username, command });
  }

  getVotes() {
    return { ...this.votes };
  }

  _startVoteTimer() {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.phase = 'voting';

    // Emit countdown start
    this._emit('VOTE_START', {
      windowMs: VOTE_WINDOW_MS,
      votes: this.votes
    });

    this.voteTimer = setTimeout(() => {
      this._resolveVotes();
    }, VOTE_WINDOW_MS);
  }

  _resolveVotes() {
    if (this.phase !== 'voting') return;
    this.phase = 'animating';

    const winningCommand = this._getWinningCommand();
    this._emit('VOTE_RESULT', { winningCommand, votes: this.getVotes() });

    // Execute command
    setTimeout(() => {
      this._executeCommand(winningCommand);
    }, 500);
  }

  _getWinningCommand() {
    if (Object.keys(this.votes).length === 0) return '1'; // Default attack
    let best = null;
    let bestCount = 0;
    for (const [cmd, count] of Object.entries(this.votes)) {
      if (count > bestCount) {
        best = cmd;
        bestCount = count;
      }
    }
    return best;
  }

  _executeCommand(command) {
    const hero = this.hero;
    const monster = this.currentMonster;

    let actionResult = null;

    switch (command) {
      case '1': actionResult = this._attack(); break;
      case '2': actionResult = this._defend(); break;
      case '3': actionResult = this._specialAttack(); break;
      case '4': actionResult = this._usePotion(); break;
      default:  actionResult = this._attack(); break;
    }

    this._emit('ACTION', actionResult);

    // Check monster death
    if (monster.hp <= 0) {
      monster.defeated = true;
      this.defeatedMonsters.push(monster.name);
      hero.xp += monster.xp;
      hero.gold += monster.gold;

      this._addLog(`💀 ${monster.name} yenildi! +${monster.xp} XP, +${monster.gold} Altın`);
      this._checkLevelUp();

      this._emit('MONSTER_DEAD', {
        monster: this._safeMonster(),
        heroState: this._safeHero(),
        defeatedCount: this.defeatedMonsters.length,
      });

      this.currentMonsterIndex++;
      setTimeout(() => this._nextMonster(), 2000);
      return;
    }

    // Monster counter-attack (unless defending with full success)
    const isDefending = command === '2';
    setTimeout(() => {
      this._monsterAttack(isDefending);
    }, 800);
  }

  _attack() {
    const hero = this.hero;
    const monster = this.currentMonster;
    this.combo++;

    let dmg = Math.max(1, hero.atk - Math.floor(monster.def / 2) + Math.floor(Math.random() * 5));
    // Combo bonus
    if (this.combo >= 3) dmg = Math.floor(dmg * 1.5);

    monster.hp -= dmg;
    const msg = this.combo >= 3
      ? `⚔️ KOMBO x${this.combo}! ${this.heroName} ${monster.name}'a ${dmg} hasar verdi!`
      : `⚔️ ${this.heroName} ${monster.name}'a ${dmg} hasar verdi!`;

    this._addLog(msg);
    return { type: 'attack', damage: dmg, combo: this.combo, heroState: this._safeHero(), monsterState: this._safeMonster(), log: msg };
  }

  _defend() {
    const hero = this.hero;
    const manaRegen = 8;
    hero.mana = Math.min(hero.maxMana, hero.mana + manaRegen);
    this.combo = 0;

    const msg = `🛡️ ${this.heroName} savunma pozisyonu aldı! +${manaRegen} Mana`;
    this._addLog(msg);
    return { type: 'defend', manaRegen, heroState: this._safeHero(), monsterState: this._safeMonster(), log: msg };
  }

  _specialAttack() {
    const hero = this.hero;
    const monster = this.currentMonster;
    const manaCost = 20;

    if (hero.mana < manaCost) {
      const msg = `✨ Yeterli mana yok! (Gerekli: ${manaCost}, Mevcut: ${hero.mana})`;
      this._addLog(msg);
      return { type: 'special_fail', heroState: this._safeHero(), monsterState: this._safeMonster(), log: msg };
    }

    hero.mana -= manaCost;
    this.combo = 0;

    const dmg = Math.floor(hero.atk * 2.5 + Math.random() * 10);
    monster.hp -= dmg;

    const msg = `🔥 BÜYÜLÜ SALDIRI! ${this.heroName} ${monster.name}'a ${dmg} hasar verdi!`;
    this._addLog(msg);
    return { type: 'special', damage: dmg, heroState: this._safeHero(), monsterState: this._safeMonster(), log: msg };
  }

  _usePotion() {
    const hero = this.hero;
    if (hero.potions <= 0) {
      const msg = `💊 İksir kalmadı!`;
      this._addLog(msg);
      return { type: 'potion_fail', heroState: this._safeHero(), monsterState: this._safeMonster(), log: msg };
    }
    hero.potions--;
    const heal = 40;
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);

    const msg = `💊 İksir kullanıldı! +${heal} HP`;
    this._addLog(msg);
    return { type: 'potion', heal, heroState: this._safeHero(), monsterState: this._safeMonster(), log: msg };
  }

  _monsterAttack(heroIsDefending) {
    const hero = this.hero;
    const monster = this.currentMonster;

    let dmg = Math.max(1, monster.atk - hero.def + Math.floor(Math.random() * 4));
    if (heroIsDefending) dmg = Math.floor(dmg * 0.4); // 60% damage reduction when defending

    hero.hp -= dmg;

    const msg = heroIsDefending
      ? `🛡️ ${monster.name} saldırdı ama savunma ile ${dmg} hasarın önüne geçildi!`
      : `💢 ${monster.name} ${this.heroName}'a ${dmg} hasar verdi!`;

    this._addLog(msg);
    this._emit('MONSTER_ATTACK', { damage: dmg, heroState: this._safeHero(), monsterState: this._safeMonster(), log: msg });

    if (hero.hp <= 0) {
      hero.hp = 0;
      this._gameOver();
      return;
    }

    // Continue voting
    setTimeout(() => {
      this.phase = 'voting';
      this.votes = {};
      this._startVoteTimer();
    }, 1000);
  }

  _checkLevelUp() {
    const hero = this.hero;
    while (hero.xp >= hero.xpNext) {
      hero.xp -= hero.xpNext;
      hero.level++;
      hero.xpNext = Math.floor(50 * Math.pow(1.4, hero.level - 1));
      hero.maxHp += 15;
      hero.hp = hero.maxHp; // Full heal on level up
      hero.maxMana += 8;
      hero.mana = hero.maxMana;
      hero.atk += 3;
      hero.def += 1;
      hero.potions += 1;

      const msg = `⬆️ SEVİYE ATLADI! Seviye ${hero.level}! HP ve Mana tamamen yenilendi!`;
      this._addLog(msg);
      this._emit('LEVEL_UP', { level: hero.level, heroState: this._safeHero(), log: msg });
    }
  }

  _gameOver() {
    this.phase = 'lose';
    this._addLog(`💔 ${this.heroName} yenildi!`);
    this._emit('GAME_OVER', {
      heroState: this._safeHero(),
      defeatedMonsters: this.defeatedMonsters,
      totalMonsters: this.allMonsters.length,
    });
  }

  _victory() {
    this.phase = 'win';
    this._addLog(`🏆 Tüm düşmanlar yenildi! ${this.heroName} kazandı!`);
    this._emit('VICTORY', {
      heroState: this._safeHero(),
      defeatedMonsters: this.defeatedMonsters,
      totalMonsters: this.allMonsters.length,
      floor: this.floor,
    });
  }

  _emit(type, data = {}) {
    if (this.onEvent) {
      this.onEvent({ type, ...data, timestamp: Date.now() });
    }
  }

  _addLog(msg) {
    this.log.unshift({ msg, time: Date.now() });
    if (this.log.length > 50) this.log.pop();
  }

  _safeHero() {
    return { ...this.hero, name: this.heroName };
  }

  _safeMonster() {
    if (!this.currentMonster) return null;
    return { ...this.currentMonster };
  }

  getState() {
    return {
      phase: this.phase,
      hero: this._safeHero(),
      monster: this._safeMonster(),
      floor: this.floor,
      votes: this.getVotes(),
      log: this.log.slice(0, 20),
      defeatedMonsters: this.defeatedMonsters,
      totalMonsters: this.allMonsters.length,
      monstersLeft: this.allMonsters.length - this.currentMonsterIndex,
    };
  }
}

module.exports = GameEngine;
