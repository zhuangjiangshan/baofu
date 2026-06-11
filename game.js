(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const floorText = document.getElementById('floorText');
  const moneyText = document.getElementById('moneyText');
  const hpText = document.getElementById('hpText');
  const bestText = document.getElementById('bestText');
  const panel = document.getElementById('panel');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const muteBtn = document.getElementById('muteBtn');
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');

  const W = canvas.width;
  const H = canvas.height;
  const MAX_FLOOR = 100;
  const FLOOR_GAP = 88;
  const START_Y = 120;
  const PLAYER_W = 34;
  const PLAYER_H = 54;
  const STORAGE_KEY = 'baofu-down-100-best';
  const WORLD_SCROLL_SPEED = 0.62;

  const keys = { left: false, right: false };
  const colors = {
    text: '#f7f8fd',
    dim: '#9aa3b8',
    gold: '#f8ce65',
    red: '#ff5a64',
    green: '#31d08c',
    blue: '#58b8ff',
    purple: '#bb8cff',
    dark: '#101729',
    line: 'rgba(255,255,255,.16)'
  };

  let platforms = [];
  let props = [];
  let particles = [];
  let messages = [];
  let stars = [];
  let cameraY = 0;
  let gameState = 'menu';
  let rafId = 0;
  let lastTime = 0;
  let muted = false;
  let shake = 0;
  let bestFloor = Number(localStorage.getItem(STORAGE_KEY) || 0);

  const player = {
    x: W / 2,
    y: START_Y - PLAYER_H / 2,
    vx: 0,
    vy: 0,
    hp: 3,
    wealth: 10000,
    floor: 0,
    bestThisRun: 0,
    leverage: 0,
    slow: 0,
    boost: 0,
    invincible: 0,
    stance: 0,
    facing: 1,
    justLanded: false,
    supportPlatform: null
  };

  const propPool = [
    { key: 'rise', name: '基金涨', kind: 'good' },
    { key: 'loss', name: '基金亏', kind: 'bad' },
    { key: 'bull', name: '牛市', kind: 'good' },
    { key: 'bear', name: '熊市', kind: 'bad' },
    { key: 'limitUp', name: '涨停', kind: 'good' },
    { key: 'limitDown', name: '跌停', kind: 'bad' },
    { key: 'dividend', name: '分红', kind: 'good' },
    { key: 'leverage', name: '加杠杆', kind: 'wild' },
    { key: 'ipo', name: '打新股', kind: 'wild' },
    { key: 'thunder', name: '暴雷', kind: 'bad' },
    { key: 'bankrupt', name: '破产', kind: 'bad' }
  ];

  const platformTypes = [
    { key: 'normal', label: '普通楼板', color: '#38435f' },
    { key: 'rise', label: '上涨板', color: '#7c202a' },
    { key: 'loss', label: '亏损板', color: '#0f6953' },
    { key: 'crack', label: '裂缝板', color: '#5a4b45' },
    { key: 'ice', label: '滑板', color: '#2c637a' }
  ];

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatMoney(value) {
    const rounded = Math.max(0, Math.floor(value));
    if (rounded >= 100000000) return `¥${(rounded / 100000000).toFixed(2)}亿`;
    if (rounded >= 10000) return `¥${(rounded / 10000).toFixed(1)}万`;
    return `¥${rounded.toLocaleString('zh-CN')}`;
  }

  function resizeCanvasDisplay() {
    // CSS controls visual size. Internal resolution stays 480 x 720 for stable physics.
  }

  function initStars() {
    stars = Array.from({ length: 80 }, () => ({
      x: rand(0, W),
      y: rand(0, H),
      r: rand(0.4, 1.9),
      s: rand(0.14, 0.58),
      a: rand(0.18, 0.72)
    }));
  }

  function choosePlatformType(floor) {
    if (floor === 0 || floor === MAX_FLOOR) return platformTypes[0];
    const r = Math.random();
    if (floor > 14 && r < 0.10) return platformTypes[3];
    if (floor > 8 && r < 0.20) return platformTypes[2];
    if (floor > 20 && r < 0.29) return platformTypes[4];
    if (r < 0.40) return platformTypes[1];
    return platformTypes[0];
  }

  function createPropForFloor(floor, platform) {
    if (floor < 2 || floor >= MAX_FLOOR) return null;
    if (Math.random() > 0.72) return null;

    const weighted = [];
    propPool.forEach((prop) => {
      let weight = 2;
      if (prop.kind === 'good') weight = 4;
      if (prop.key === 'bankrupt') weight = floor > 30 ? 1.1 : 0.35;
      if (prop.key === 'thunder') weight = floor > 20 ? 1.4 : 0.55;
      if (prop.key === 'leverage') weight = 1.6;
      for (let i = 0; i < Math.ceil(weight * 2); i += 1) weighted.push(prop);
    });

    const picked = weighted[Math.floor(Math.random() * weighted.length)];
    const pct = Math.round(rand(4, floor > 55 ? 28 : 18));
    let label = picked.name;
    if (picked.key === 'rise' || picked.key === 'loss') {
      label = `${picked.name}${picked.key === 'rise' ? '+' : '-'}${pct}%`;
    }

    return {
      x: clamp(rand(platform.x + 26, platform.x + platform.w - 26), 34, W - 34),
      y: platform.y - 34,
      size: 30,
      floor,
      key: picked.key,
      kind: picked.kind,
      label,
      pct,
      taken: false,
      bob: rand(0, Math.PI * 2)
    };
  }

  function generateWorld() {
    platforms = [];
    props = [];

    let lastX = 68;
    for (let floor = 0; floor <= MAX_FLOOR; floor += 1) {
      const y = START_Y + floor * FLOOR_GAP;
      let w = floor === 0 ? 320 : rand(112, 230);
      if (floor === MAX_FLOOR) w = 360;

      const targetX = clamp(lastX + rand(-120, 120), 18, W - w - 18);
      const x = floor === 0 ? (W - w) / 2 : targetX;
      lastX = x;

      const type = choosePlatformType(floor);
      const platform = {
        x,
        y,
        w,
        h: 16,
        floor,
        type: type.key,
        label: floor === MAX_FLOOR ? '财富自由终点' : type.label,
        color: floor === MAX_FLOOR ? '#c89223' : type.color,
        used: false,
        broken: false,
        breakTimer: 0,
        drift: floor > 24 && floor % 9 === 0 ? rand(0.5, 1.2) : 0,
        driftBaseX: x,
        driftPhase: rand(0, Math.PI * 2)
      };

      platforms.push(platform);
      const prop = createPropForFloor(floor, platform);
      if (prop) props.push(prop);
    }
  }

  function resetGame() {
    generateWorld();
    particles = [];
    messages = [];
    cameraY = 0;
    shake = 0;
    Object.assign(player, {
      x: W / 2,
      y: START_Y - PLAYER_H / 2,
      vx: 0,
      vy: 0,
      hp: 3,
      wealth: 10000,
      floor: 0,
      bestThisRun: 0,
      leverage: 0,
      slow: 0,
      boost: 0,
      invincible: 0,
      stance: 0,
      facing: 1,
      justLanded: false,
      supportPlatform: null
    });
    setState('playing');
    addMessage('开局本金 ¥10,000，目标：下到100层！', colors.gold);
  }

  function setState(state) {
    gameState = state;
    panel.classList.toggle('show', state !== 'playing');
    if (state === 'menu') {
      panel.innerHTML = `
        <p class="panel-kicker">基金涨了？还是直接破产？</p>
        <h2>暴富下100层</h2>
        <p class="panel-desc">控制头顶写着「暴富」的男人一路向下。踩住楼板，吃股市道具，扛过基金亏损、暴雷、破产，冲到第100层。</p>
        <div class="rule-grid">
          <span>← / A：左移</span><span>→ / D：右移</span><span>空格：开始/暂停</span><span>手机：底部按钮</span>
        </div>
        <button id="startBtn" class="primary-btn">开始下100层</button>`;
      document.getElementById('startBtn').addEventListener('click', resetGame);
    }
    if (state === 'paused') {
      panel.innerHTML = `
        <p class="panel-kicker">暂停看盘</p>
        <h2>市场休息中</h2>
        <p class="panel-desc">当前到达第 ${player.floor} 层，资产 ${formatMoney(player.wealth)}。继续向下，别被熊市甩出去。</p>
        <button id="startBtn" class="primary-btn">继续游戏</button>`;
      document.getElementById('startBtn').addEventListener('click', () => setState('playing'));
    }
  }

  function endGame(win) {
    gameState = win ? 'win' : 'over';
    bestFloor = Math.max(bestFloor, player.bestThisRun, player.floor);
    localStorage.setItem(STORAGE_KEY, String(bestFloor));
    bestText.textContent = `${bestFloor}层`;
    const title = win ? '暴富成功！' : '被市场教育了';
    const desc = win
      ? `你成功下到100层，最终资产 ${formatMoney(player.wealth)}。财富自由只是开始。`
      : `你最高下到第 ${player.bestThisRun} 层，最终资产 ${formatMoney(player.wealth)}。下次少加点杠杆。`;

    panel.innerHTML = `
      <p class="panel-kicker">${win ? '第100层达成' : '游戏结束'}</p>
      <h2>${title}</h2>
      <p class="panel-desc">${desc}</p>
      <div class="rule-grid">
        <span>本局层数：${player.bestThisRun}</span><span>历史纪录：${bestFloor}</span><span>剩余生命：${Math.max(0, player.hp)}</span><span>最终资产：${formatMoney(player.wealth)}</span>
      </div>
      <button id="startBtn" class="primary-btn">再来一局</button>`;
    panel.classList.add('show');
    document.getElementById('startBtn').addEventListener('click', resetGame);
  }

  function addMessage(text, color = colors.text) {
    messages.push({ text, color, life: 190, y: 0 });
    if (messages.length > 5) messages.shift();
  }

  function burst(x, y, color, amount = 16) {
    for (let i = 0; i < amount; i += 1) {
      particles.push({
        x,
        y,
        vx: rand(-2.2, 2.2),
        vy: rand(-4.2, 0.6),
        r: rand(2, 5),
        color,
        life: rand(34, 70)
      });
    }
  }

  function playTinyBeep(type) {
    if (muted || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audio = new AudioCtx();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = type === 'bad' ? 160 : type === 'win' ? 660 : 440;
      gain.gain.setValueAtTime(0.04, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.18);
    } catch (error) {
      // Ignore browsers that block audio before user interaction.
    }
  }

  function applyWealth(delta, text, color) {
    const multiplier = player.leverage > 0 ? 2 : 1;
    const finalDelta = delta * multiplier;
    player.wealth += finalDelta;
    addMessage(`${text}${player.leverage > 0 ? '（杠杆×2）' : ''}`, color);
    return finalDelta;
  }

  function applyProp(prop) {
    if (prop.taken) return;
    prop.taken = true;
    const gainColor = colors.red;
    const lossColor = colors.green;
    let delta = 0;

    switch (prop.key) {
      case 'rise': {
        delta = Math.round(player.wealth * (prop.pct / 100));
        applyWealth(delta, `${prop.label}，资产上涨 ${formatMoney(delta)}`, gainColor);
        burst(prop.x, prop.y, gainColor, 20);
        playTinyBeep('good');
        break;
      }
      case 'loss': {
        delta = -Math.round(player.wealth * (prop.pct / 100));
        applyWealth(delta, `${prop.label}，资产缩水 ${formatMoney(Math.abs(delta))}`, lossColor);
        player.invincible = 40;
        shake = 10;
        burst(prop.x, prop.y, lossColor, 18);
        playTinyBeep('bad');
        break;
      }
      case 'bull': {
        player.boost = 420;
        applyWealth(2600, '牛市来了，资产 +¥2,600，移速提升', gainColor);
        burst(prop.x, prop.y, gainColor, 22);
        playTinyBeep('good');
        break;
      }
      case 'bear': {
        player.slow = 420;
        applyWealth(-1800, '熊市突袭，资产 -¥1,800，短暂减速', lossColor);
        shake = 12;
        burst(prop.x, prop.y, lossColor, 22);
        playTinyBeep('bad');
        break;
      }
      case 'limitUp': {
        delta = Math.round(player.wealth * 0.1);
        applyWealth(delta, '涨停板！资产 +10%', gainColor);
        burst(prop.x, prop.y, gainColor, 26);
        playTinyBeep('good');
        break;
      }
      case 'limitDown': {
        delta = -Math.round(player.wealth * 0.1);
        applyWealth(delta, '跌停板！资产 -10%', lossColor);
        player.invincible = 50;
        shake = 12;
        burst(prop.x, prop.y, lossColor, 22);
        playTinyBeep('bad');
        break;
      }
      case 'dividend': {
        player.hp = Math.min(5, player.hp + 1);
        applyWealth(1600, '收到分红，资产 +¥1,600，生命 +1', colors.gold);
        burst(prop.x, prop.y, colors.gold, 26);
        playTinyBeep('good');
        break;
      }
      case 'leverage': {
        player.leverage = 620;
        addMessage('加杠杆开启：之后收益和亏损都×2', colors.purple);
        burst(prop.x, prop.y, colors.purple, 24);
        playTinyBeep('good');
        break;
      }
      case 'ipo': {
        const win = Math.random() > 0.42;
        delta = win ? Math.round(player.wealth * rand(0.08, 0.22)) : -Math.round(player.wealth * rand(0.05, 0.16));
        applyWealth(delta, win ? '打新股中签，赚了一笔' : '新股破发，脸有点黑', win ? gainColor : lossColor);
        if (!win) shake = 9;
        burst(prop.x, prop.y, win ? gainColor : lossColor, 24);
        playTinyBeep(win ? 'good' : 'bad');
        break;
      }
      case 'thunder': {
        delta = -Math.round(player.wealth * 0.4);
        applyWealth(delta, '持仓暴雷，资产 -40%，生命 -1', lossColor);
        player.hp -= 1;
        player.invincible = 80;
        shake = 18;
        burst(prop.x, prop.y, lossColor, 30);
        playTinyBeep('bad');
        break;
      }
      case 'bankrupt': {
        const before = player.wealth;
        player.wealth = Math.floor(player.wealth * 0.2);
        player.hp -= 1;
        player.invincible = 90;
        shake = 22;
        addMessage(`破产清算！资产从 ${formatMoney(before)} 变成 ${formatMoney(player.wealth)}，生命 -1`, lossColor);
        burst(prop.x, prop.y, lossColor, 34);
        playTinyBeep('bad');
        break;
      }
      default:
        break;
    }

    if (player.wealth <= 0 || player.hp <= 0) endGame(false);
  }

  function applyPlatform(platform) {
    if (platform.used && platform.type !== 'crack') return;
    const gainColor = colors.red;
    const lossColor = colors.green;

    if (platform.type === 'rise') {
      platform.used = true;
      player.wealth += 360;
      addMessage(`踩中上涨板，资产 +¥360`, gainColor);
      burst(player.x, platform.y - 6, gainColor, 10);
    }

    if (platform.type === 'loss') {
      platform.used = true;
      player.wealth -= 520;
      player.invincible = 35;
      addMessage(`踩中亏损板，资产 -¥520`, lossColor);
      burst(player.x, platform.y - 6, lossColor, 10);
      shake = 7;
    }

    if (platform.type === 'crack') {
      platform.breakTimer = 24;
      addMessage('裂缝板快塌了，赶紧走！', '#ffb05c');
    }

    if (platform.type === 'ice') {
      addMessage('滑板：脚底打滑，别冲太猛', colors.blue);
    }
  }

  function updateTimers() {
    player.leverage = Math.max(0, player.leverage - 1);
    player.slow = Math.max(0, player.slow - 1);
    player.boost = Math.max(0, player.boost - 1);
    player.invincible = Math.max(0, player.invincible - 1);
    shake = Math.max(0, shake - 1);

    platforms.forEach((p) => {
      if (p.breakTimer > 0) {
        p.breakTimer -= 1;
        if (p.breakTimer <= 0) p.broken = true;
      }
    });

    particles = particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.life -= 1;
      return p.life > 0;
    });

    messages = messages.filter((m) => {
      m.life -= 1;
      m.y -= 0.08;
      return m.life > 0;
    });
  }

  function updatePlatforms(time, deltaScale) {
    const scroll = WORLD_SCROLL_SPEED * deltaScale;

    if (player.supportPlatform && !player.supportPlatform.broken) {
      const p = player.supportPlatform;
      const feet = player.y + PLAYER_H / 2;
      const touching = Math.abs(feet - p.y) < 5 && player.x + PLAYER_W / 2 > p.x && player.x - PLAYER_W / 2 < p.x + p.w;
      if (touching) player.y -= scroll;
      else player.supportPlatform = null;
    }

    platforms.forEach((p) => {
      p.y -= scroll;
      if (!p.drift || p.broken) return;
      p.x = clamp(p.driftBaseX + Math.sin(time / 620 + p.driftPhase) * 54 * p.drift, 14, W - p.w - 14);
    });

    props.forEach((prop) => {
      if (!prop.taken) prop.y -= scroll;
    });
  }

  function updatePlayer() {
    const move = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    const baseSpeed = player.slow > 0 ? 2.55 : player.boost > 0 ? 5.45 : 4.1;
    const accel = player.slow > 0 ? 0.38 : 0.55;
    const friction = 0.84;

    if (move !== 0) {
      player.facing = move;
      player.vx += move * accel;
    } else {
      player.vx *= friction;
    }

    player.vx = clamp(player.vx, -baseSpeed, baseSpeed);
    player.vy = clamp(player.vy + 0.32, -8, 12.8);
    const prevBottom = player.y + PLAYER_H / 2;

    player.x += player.vx;
    player.y += player.vy;
    player.stance += Math.abs(player.vx) * 0.08 + 0.08;

    if (player.x < -PLAYER_W / 2) player.x = W + PLAYER_W / 2;
    if (player.x > W + PLAYER_W / 2) player.x = -PLAYER_W / 2;

    const newBottom = player.y + PLAYER_H / 2;
    player.justLanded = false;
    player.supportPlatform = null;

    if (player.vy >= 0) {
      for (const p of platforms) {
        if (p.broken) continue;
        const onX = player.x + PLAYER_W / 2 > p.x && player.x - PLAYER_W / 2 < p.x + p.w;
        const crossing = prevBottom <= p.y + 2 && newBottom >= p.y - 1 && newBottom <= p.y + 24;
        if (onX && crossing) {
          player.y = p.y - PLAYER_H / 2;
          player.vy = p.type === 'crack' ? 0.6 : 0;
          if (p.type === 'ice') player.vx *= 1.12;
          player.floor = Math.max(player.floor, p.floor);
          player.bestThisRun = Math.max(player.bestThisRun, player.floor);
          player.justLanded = true;
          player.supportPlatform = p;
          applyPlatform(p);
          if (p.floor >= MAX_FLOOR) endGame(true);
          break;
        }
      }
    }

    props.forEach((prop) => {
      if (prop.taken) return;
      const dx = Math.abs(player.x - prop.x);
      const dy = Math.abs(player.y - prop.y);
      if (dx < PLAYER_W / 2 + prop.size / 2 && dy < PLAYER_H / 2 + prop.size / 2) {
        applyProp(prop);
      }
    });

    if (worldToScreenY(player.y) < -80) {
      player.hp -= 1;
      player.wealth -= 1200;
      addMessage('被楼板顶上去了：生命 -1，资产 -¥1,200', colors.green);
      player.x = clamp(player.x, 40, W - 40);
      player.y = cameraY + 120;
      player.vy = 1.2;
      player.supportPlatform = null;
      player.invincible = 90;
      shake = 16;
      if (player.hp <= 0 || player.wealth <= 0) endGame(false);
    }

    if (player.y - cameraY > H + 160) {
      player.hp -= 1;
      player.wealth -= 1600;
      addMessage('坠落太深，被市场强平：生命 -1，资产 -¥1,600', colors.green);
      player.x = clamp(player.x, 40, W - 40);
      player.y = cameraY + H - 70;
      player.vy = -4;
      player.supportPlatform = null;
      player.invincible = 90;
      shake = 18;
      if (player.hp <= 0 || player.wealth <= 0) endGame(false);
    }

    cameraY = Math.max(cameraY, player.y - H * 0.36);
  }

  function updateHud() {
    floorText.textContent = `${Math.min(MAX_FLOOR, player.floor)} / ${MAX_FLOOR}`;
    moneyText.textContent = formatMoney(player.wealth);
    hpText.textContent = '♥'.repeat(Math.max(0, player.hp)) + '♡'.repeat(Math.max(0, 5 - player.hp));
    bestText.textContent = `${bestFloor}层`;
  }

  function worldToScreenY(y) {
    return y - cameraY;
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#081025');
    gradient.addColorStop(0.55, '#101735');
    gradient.addColorStop(1, '#070a14');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    stars.forEach((s) => {
      const y = (s.y + cameraY * s.s) % H;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    for (let i = 0; i < 12; i += 1) {
      const y = ((i * 84) - (cameraY * 0.35) % 84);
      ctx.strokeStyle = 'rgba(255,255,255,.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + 36);
      ctx.stroke();
    }

    const progress = clamp(player.floor / MAX_FLOOR, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    roundedRect(W - 16, 20, 5, H - 40, 8);
    ctx.fill();
    ctx.fillStyle = colors.gold;
    roundedRect(W - 16, 20 + (H - 40) * progress, 5, Math.max(12, (H - 40) * (1 - progress)), 8);
    ctx.fill();
  }

  function drawPlatform(p) {
    const y = worldToScreenY(p.y);
    if (y < -40 || y > H + 40 || p.broken) return;

    const flicker = p.breakTimer > 0 && Math.floor(p.breakTimer / 3) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = flicker ? 0.45 : 1;

    ctx.fillStyle = 'rgba(0,0,0,.28)';
    roundedRect(p.x + 4, y + 8, p.w, p.h, 8);
    ctx.fill();

    const g = ctx.createLinearGradient(p.x, y, p.x, y + p.h);
    g.addColorStop(0, p.color);
    g.addColorStop(1, '#161d32');
    ctx.fillStyle = g;
    roundedRect(p.x, y, p.w, p.h, 8);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.20)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.84)';
    ctx.font = '700 11px Microsoft YaHei, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.floor}F · ${p.label}`, p.x + p.w / 2, y - 7);

    if (p.type === 'crack') {
      ctx.strokeStyle = 'rgba(255,220,170,.72)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x + p.w * 0.34, y + 3);
      ctx.lineTo(p.x + p.w * 0.43, y + 12);
      ctx.lineTo(p.x + p.w * 0.55, y + 5);
      ctx.lineTo(p.x + p.w * 0.66, y + 14);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawProp(prop) {
    if (prop.taken) return;
    const y = worldToScreenY(prop.y) + Math.sin(prop.bob + performance.now() / 260) * 4;
    if (y < -60 || y > H + 60) return;

    const color = prop.kind === 'good' ? colors.red : prop.kind === 'bad' ? colors.green : colors.purple;

    ctx.save();
    ctx.translate(prop.x, y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    roundedRect(-28, -16, 56, 32, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = prop.label.length > 5 ? '800 10px Microsoft YaHei, Arial' : '900 12px Microsoft YaHei, Arial';
    ctx.fillText(prop.label, 0, 4);
    ctx.restore();
  }

  function drawPlayer() {
    const x = player.x;
    const y = worldToScreenY(player.y);
    const blink = player.invincible > 0 && Math.floor(player.invincible / 5) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(x, y);

    // Name tag.
    ctx.fillStyle = 'rgba(248, 206, 101, .97)';
    roundedRect(-30, -72, 60, 20, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.lineTo(0, -41);
    ctx.strokeStyle = 'rgba(248, 206, 101, .95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#241500';
    ctx.font = '900 14px Microsoft YaHei, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('暴富', 0, -57);

    const legSwing = Math.sin(player.stance) * 5;
    const armSwing = Math.sin(player.stance + Math.PI) * 5;

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(0, 31, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs.
    ctx.strokeStyle = '#1d2740';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, 16);
    ctx.lineTo(-11 + legSwing, 34);
    ctx.moveTo(8, 16);
    ctx.lineTo(11 - legSwing, 34);
    ctx.stroke();

    // Shoes.
    ctx.strokeStyle = '#0b0d14';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-11 + legSwing, 35);
    ctx.lineTo(-2 + legSwing, 35);
    ctx.moveTo(11 - legSwing, 35);
    ctx.lineTo(20 - legSwing, 35);
    ctx.stroke();

    // Body suit.
    const bodyGradient = ctx.createLinearGradient(0, -8, 0, 22);
    bodyGradient.addColorStop(0, '#4960a8');
    bodyGradient.addColorStop(1, '#263154');
    ctx.fillStyle = bodyGradient;
    roundedRect(-15, -9, 30, 31, 10);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-7, -7);
    ctx.lineTo(7, -7);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colors.red;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 7);
    ctx.lineTo(0, 15);
    ctx.lineTo(-4, 7);
    ctx.closePath();
    ctx.fill();

    // Arms.
    ctx.strokeStyle = '#f0c09a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-15, -2);
    ctx.lineTo(-24, 12 + armSwing);
    ctx.moveTo(15, -2);
    ctx.lineTo(24, 12 - armSwing);
    ctx.stroke();

    // Head.
    ctx.fillStyle = '#f3c7a4';
    ctx.beginPath();
    ctx.arc(0, -22, 16, 0, Math.PI * 2);
    ctx.fill();

    // Hair.
    ctx.fillStyle = '#151922';
    ctx.beginPath();
    ctx.arc(-4, -28, 14, Math.PI, Math.PI * 2);
    ctx.lineTo(12, -24);
    ctx.quadraticCurveTo(2, -36, -16, -25);
    ctx.fill();

    // Face.
    ctx.fillStyle = '#151922';
    ctx.beginPath();
    ctx.arc(-5, -21, 1.5, 0, Math.PI * 2);
    ctx.arc(6, -21, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9d5347';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(1, -17, 4, 0, Math.PI);
    ctx.stroke();

    if (player.leverage > 0) {
      ctx.fillStyle = 'rgba(187,140,255,.92)';
      roundedRect(-30, 23, 60, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 10px Microsoft YaHei, Arial';
      ctx.fillText('杠杆×2', 0, 35);
    }

    ctx.restore();
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / 50, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, worldToScreenY(p.y), p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawMessages() {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '800 13px Microsoft YaHei, Arial';
    messages.forEach((m, index) => {
      const y = 26 + index * 26 + m.y;
      ctx.globalAlpha = clamp(m.life / 40, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.40)';
      roundedRect(14, y - 16, Math.min(440, 36 + ctx.measureText(m.text).width), 23, 10);
      ctx.fill();
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, 28, y);
    });
    ctx.restore();
  }

  function drawStatusBadges() {
    const badges = [];
    if (player.boost > 0) badges.push({ text: `牛市加速 ${Math.ceil(player.boost / 60)}s`, color: colors.red });
    if (player.slow > 0) badges.push({ text: `熊市减速 ${Math.ceil(player.slow / 60)}s`, color: colors.green });
    if (player.leverage > 0) badges.push({ text: `杠杆×2 ${Math.ceil(player.leverage / 60)}s`, color: colors.purple });

    ctx.save();
    ctx.font = '800 12px Microsoft YaHei, Arial';
    badges.forEach((badge, i) => {
      const textW = ctx.measureText(badge.text).width + 22;
      const x = 14;
      const y = H - 24 - i * 30;
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      roundedRect(x, y - 17, textW, 23, 10);
      ctx.fill();
      ctx.fillStyle = badge.color;
      ctx.fillText(badge.text, x + 11, y);
    });
    ctx.restore();
  }

  function render() {
    ctx.save();
    const sx = shake > 0 ? rand(-shake, shake) * 0.5 : 0;
    const sy = shake > 0 ? rand(-shake, shake) * 0.5 : 0;
    ctx.translate(sx, sy);

    drawBackground();
    platforms.forEach(drawPlatform);
    props.forEach(drawProp);
    drawParticles();
    drawPlayer();
    drawMessages();
    drawStatusBadges();

    ctx.restore();
  }

  function loop(time = 0) {
    const delta = time - lastTime;
    lastTime = time;

    if (gameState === 'playing') {
      const deltaScale = delta > 0 ? Math.min(2.2, delta / 16.6667) : 1;
      updatePlatforms(time, deltaScale);
      updatePlayer(delta);
      updateTimers();
      updateHud();
    }

    render();
    rafId = requestAnimationFrame(loop);
  }

  function setKey(key, value) {
    keys[key] = value;
  }

  function bindHoldButton(button, key) {
    const on = (event) => {
      event.preventDefault();
      setKey(key, true);
    };
    const off = (event) => {
      event.preventDefault();
      setKey(key, false);
    };
    button.addEventListener('pointerdown', on);
    button.addEventListener('pointerup', off);
    button.addEventListener('pointercancel', off);
    button.addEventListener('pointerleave', off);
  }

  function togglePauseOrStart() {
    if (gameState === 'menu' || gameState === 'over' || gameState === 'win') resetGame();
    else if (gameState === 'playing') setState('paused');
    else if (gameState === 'paused') setState('playing');
  }

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'a'].includes(key)) setKey('left', true);
    if (['arrowright', 'd'].includes(key)) setKey('right', true);
    if (key === ' ' || key === 'spacebar') {
      event.preventDefault();
      togglePauseOrStart();
    }
  });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'a'].includes(key)) setKey('left', false);
    if (['arrowright', 'd'].includes(key)) setKey('right', false);
  });

  startBtn.addEventListener('click', resetGame);
  pauseBtn.addEventListener('click', togglePauseOrStart);
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
  });
  bindHoldButton(leftBtn, 'left');
  bindHoldButton(rightBtn, 'right');

  window.addEventListener('resize', resizeCanvasDisplay);
  initStars();
  generateWorld();
  updateHud();
  loop();
})();
