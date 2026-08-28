const CONFIG = {
  GAME_TIME: 30,
  TARGET_MONEY: 5000,
  PAY_AMOUNT: 280,
  FAST_CLICK_WINDOW: 1000,
  FAST_CLICK_LIMIT: 4,
  IDEAL_PAY_INTERVAL_MIN: 2000,
  IDEAL_PAY_INTERVAL_MAX: 4000,
  NO_PAY_WARNING: 8000,
  GIRL_MOOD_START: 60,
  GIRL_MOOD_GOOD_PAY: 8,
  GIRL_MOOD_FAST_PAY: -12,
  GIRL_MOOD_IDLE_DECAY: 2,
  BOY_NAIL_SPEED: 2.75,
  FAST_PAY_PAUSE_MIN: 1000,
  FAST_PAY_PAUSE_MAX: 2000,
  PRESSURE_MIN: 260,
  PRESSURE_MAX: 760,
  PRESSURE_HEAVY: 1120,
  GIRL_NAIL_SPEED_LIGHT: 0.95,
  GIRL_NAIL_SPEED_GOOD: 5.9,
  GIRL_NAIL_SPEED_HEAVY: 1.35,
  KEY_PROGRESS_LIGHT: 0.24,
  KEY_PROGRESS_GOOD: 1.12,
  KEY_PROGRESS_HEAVY: 0.1,
  KEY_ACTIVE_MS: 240,
  KEY_PRESSURE_FACTOR: 180000,
  REWARD: [800, 1000, 1300],
  PENALTY: [200, 300],
  PAIN_LIMIT: 5,
  ACTION_COOLDOWN: 420,
  SPEECH_TIME: 1700
};

const TEXT = {
  goodPay: ["嘿嘿，谢谢老板～", "这边马上修好啦。", "今天怎么这么懂事？", "嗯～继续保持。"],
  fastPay: ["你干嘛一直打钱啊？", "别催我……", "你这样压力很大诶。", "有钱了不起啊？", "让我好好修！"],
  idlePay: ["你是不是忘了点什么？", "怎么突然没声音了？", "你是不是没诚意啊？"],
  lightFile: ["你是在给我挠痒吗？", "可以稍微用点力……", "好像没什么感觉。"],
  goodFile: ["嗯……这样刚刚好。", "技术不错嘛。", "舒服。", "继续继续。"],
  heavyFile: ["疼疼疼！", "轻一点！", "你是想把我手锯掉吗？", "等一下！"]
};

const els = {
  app: document.getElementById("app"),
  homeScreen: document.getElementById("homeScreen"),
  gameScreen: document.getElementById("gameScreen"),
  sceneImage: document.getElementById("sceneImage"),
  sceneTint: document.getElementById("sceneTint"),
  redFlash: document.getElementById("redFlash"),
  modeLabel: document.getElementById("modeLabel"),
  timeLabel: document.getElementById("timeLabel"),
  timeBar: document.getElementById("timeBar"),
  nailBar: document.getElementById("nailBar"),
  nailLabel: document.getElementById("nailLabel"),
  speechBubble: document.getElementById("speechBubble"),
  moneyPanel: document.getElementById("moneyPanel"),
  statePanel: document.getElementById("statePanel"),
  painPanel: document.getElementById("painPanel"),
  pressurePanel: document.getElementById("pressurePanel"),
  pressureLabels: [...document.querySelectorAll(".pressure-text span")],
  pressureNeedle: document.getElementById("pressureNeedle"),
  payButton: document.getElementById("payButton"),
  fileTool: document.getElementById("fileTool"),
  nailTarget: document.getElementById("nailTarget"),
  floatLayer: document.getElementById("floatLayer"),
  sparkLayer: document.getElementById("sparkLayer"),
  resultModal: document.getElementById("resultModal"),
  resultIcon: document.getElementById("resultIcon"),
  resultTitle: document.getElementById("resultTitle"),
  resultSubtitle: document.getElementById("resultSubtitle"),
  scorePanel: document.getElementById("scorePanel"),
  modalAction: document.getElementById("modalAction"),
  homeAction: document.getElementById("homeAction")
};

let state = makeInitialState();
let rafId = 0;
let audioCtx = null;
let speechTimer = 0;

function makeInitialState() {
  return {
    mode: "",
    running: false,
    ended: false,
    success: false,
    startAt: 0,
    lastFrameAt: 0,
    timeLeft: CONFIG.GAME_TIME,
    nailProgress: 0,
    money: 0,
    girlMood: CONFIG.GIRL_MOOD_START,
    clickTimes: [],
    lastPayAt: 0,
    lastPayInterval: 0,
    lastNoPayWarnAt: 0,
    pauseUntil: 0,
    goodPayCount: 0,
    fastPayCount: 0,
    payIntervals: [],
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    lastPointerAt: 0,
    filePressure: 0,
    pressureSamples: 0,
    goodPressureSamples: 0,
    painCount: 0,
    lastActionAt: 0,
    lastCAt: 0,
    cActiveUntil: 0,
    cDirection: 1,
    cVirtualX: 52
  };
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => startGame(button.dataset.mode));
});
els.payButton.addEventListener("click", handlePay);
document.addEventListener("keydown", handleKeyControl);
els.modalAction.addEventListener("click", () => {
  if (state.ended && state.success && els.scorePanel.classList.contains("hidden")) {
    showScore();
  } else {
    startGame(state.mode);
  }
});
els.homeAction.addEventListener("click", showHome);

["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  els.gameScreen.addEventListener(eventName, handlePointer, { passive: false });
});

function startGame(mode) {
  cancelAnimationFrame(rafId);
  state = makeInitialState();
  state.mode = mode;
  state.running = true;
  state.startAt = performance.now();
  state.lastFrameAt = state.startAt;
  state.lastPayAt = state.startAt;
  state.lastNoPayWarnAt = state.startAt;

  els.homeScreen.classList.add("hidden");
  els.gameScreen.classList.remove("hidden", "finished", "shake");
  els.resultModal.classList.add("hidden");
  els.scorePanel.classList.add("hidden");
  els.payButton.classList.toggle("hidden", mode !== "boyfriend");
  els.pressurePanel.classList.remove("hidden");
  els.fileTool.classList.toggle("hidden", mode !== "girlfriend");
  els.nailTarget.classList.toggle("hidden", mode !== "girlfriend");
  els.painPanel.classList.toggle("hidden", mode !== "girlfriend");
  els.sceneImage.src = mode === "boyfriend" ? "assets/boy-pov.png" : "assets/girl-pov.png";
  els.sceneImage.alt = mode === "boyfriend" ? "男生第一视角：女生正在修指甲" : "女生第一视角：正在给男生修指甲";
  els.modeLabel.textContent = mode === "boyfriend" ? "男友模式：打钱节奏" : "女友模式：修甲力度";
  setPressureLabels(mode);
  els.modalAction.textContent = "再来一次";

  setStatus(mode === "boyfriend" ? "状态：别太急，也别太冷淡" : "状态：左右摩擦，找刚刚好的力度");
  updateHud();
  playSound("start");
  rafId = requestAnimationFrame(tick);
}

function showHome() {
  cancelAnimationFrame(rafId);
  state = makeInitialState();
  els.gameScreen.classList.add("hidden");
  els.homeScreen.classList.remove("hidden");
}

function tick(now) {
  if (!state.running) return;
  const dt = Math.min((now - state.lastFrameAt) / 1000, 0.08);
  state.lastFrameAt = now;
  state.timeLeft = Math.max(0, CONFIG.GAME_TIME - (now - state.startAt) / 1000);

  if (state.mode === "boyfriend") updateBoyfriend(dt, now);
  if (state.mode === "girlfriend") updateGirlfriend(dt, now);

  updateHud();
  checkEnd();
  if (state.running) rafId = requestAnimationFrame(tick);
}

function updateBoyfriend(dt, now) {
  const idleMs = now - state.lastPayAt;
  updatePayRhythmNeedle(idleMs);
  if (idleMs > CONFIG.NO_PAY_WARNING && now - state.lastNoPayWarnAt > CONFIG.NO_PAY_WARNING) {
    state.girlMood = clamp(state.girlMood - CONFIG.GIRL_MOOD_IDLE_DECAY, 0, 100);
    state.lastNoPayWarnAt = now;
    speak(pick(TEXT.idlePay));
    setStatus("状态：她开始觉得你没诚意了");
  }

  const paused = now < state.pauseUntil;
  const moodFactor = 0.55 + state.girlMood / 100;
  if (!paused) {
    state.nailProgress += CONFIG.BOY_NAIL_SPEED * moodFactor * dt;
  }

  if (state.girlMood >= 78) setStatus("状态：她心情很好，修得更快了");
  else if (state.girlMood <= 38) setStatus("状态：气氛有点紧，进度慢了");
  else if (!paused) setStatus("状态：保持 2～4 秒一次刚刚好");
}

function updateGirlfriend(dt, now) {
  const virtualActive = now < state.cActiveUntil;
  if (!state.dragging && !virtualActive) {
    state.filePressure *= 0.86;
    updatePressureNeedle();
    return;
  }

  const speed = state.filePressure;
  state.pressureSamples += dt;

  if (speed < CONFIG.PRESSURE_MIN) {
    state.nailProgress += CONFIG.GIRL_NAIL_SPEED_LIGHT * dt;
    setStatus("状态：有点太轻，进度很慢");
    if (now - state.lastActionAt > 1800) {
      state.lastActionAt = now;
      speak(pick(TEXT.lightFile));
    }
  } else if (speed <= CONFIG.PRESSURE_MAX) {
    state.nailProgress += CONFIG.GIRL_NAIL_SPEED_GOOD * dt;
    state.goodPressureSamples += dt;
    setStatus("状态：刚刚好，稳住这个速度");
    if (now - state.lastActionAt > CONFIG.ACTION_COOLDOWN) {
      rewardGoodFile(now);
    }
  } else {
    state.nailProgress += CONFIG.GIRL_NAIL_SPEED_HEAVY * dt;
    setStatus("状态：太重了，他快受不了了");
    if (speed > CONFIG.PRESSURE_HEAVY && now - state.lastActionAt > CONFIG.ACTION_COOLDOWN + 180) {
      punishHeavyFile(now);
    }
  }

  updatePressureNeedle();
}

function handleKeyControl(event) {
  if (event.key.toLowerCase() !== "c" || event.repeat) return;
  if (!state.running || state.mode !== "girlfriend") return;
  event.preventDefault();
  ensureAudio();

  const now = performance.now();
  const interval = state.lastCAt ? now - state.lastCAt : 520;
  state.lastCAt = now;
  state.cActiveUntil = now + CONFIG.KEY_ACTIVE_MS;

  const pressure = clamp(CONFIG.KEY_PRESSURE_FACTOR / Math.max(interval, 90), 120, CONFIG.PRESSURE_HEAVY * 1.25);
  state.filePressure = state.filePressure * 0.38 + pressure * 0.62;
  state.cDirection *= -1;
  state.cVirtualX = clamp(state.cVirtualX + state.cDirection * clamp(620 / Math.max(interval, 120), 2.5, 9), 44, 61);

  if (state.filePressure < CONFIG.PRESSURE_MIN) {
    state.nailProgress += CONFIG.KEY_PROGRESS_LIGHT;
  } else if (state.filePressure <= CONFIG.PRESSURE_MAX) {
    state.nailProgress += CONFIG.KEY_PROGRESS_GOOD;
  } else {
    state.nailProgress += CONFIG.KEY_PROGRESS_HEAVY;
  }

  moveFileToolByPercent(state.cVirtualX, 56 + state.cDirection * 0.8);
  playFileRub();
  updatePressureNeedle();
}

function handlePay() {
  if (!state.running || state.mode !== "boyfriend") return;
  ensureAudio();
  const now = performance.now();
  const interval = state.lastPayAt ? now - state.lastPayAt : 0;
  state.lastPayInterval = interval;
  state.lastPayAt = now;
  state.clickTimes = state.clickTimes.filter((time) => now - time < CONFIG.FAST_CLICK_WINDOW);
  state.clickTimes.push(now);
  state.money += CONFIG.PAY_AMOUNT;
  addFloat(`+${CONFIG.PAY_AMOUNT}W`, 74, 70, "up");
  playSound("pay");

  if (interval > 0) state.payIntervals.push(interval);

  if (state.clickTimes.length >= CONFIG.FAST_CLICK_LIMIT) {
    state.fastPayCount += 1;
    state.girlMood = clamp(state.girlMood + CONFIG.GIRL_MOOD_FAST_PAY, 0, 100);
    state.pauseUntil = now + randomBetween(CONFIG.FAST_PAY_PAUSE_MIN, CONFIG.FAST_PAY_PAUSE_MAX);
    updatePayRhythmNeedle(0, true);
    shake();
    flashRed();
    speak(pick(TEXT.fastPay));
    setStatus("状态：太急了，她压力很大");
    state.clickTimes = [];
    return;
  }

  if (interval >= CONFIG.IDEAL_PAY_INTERVAL_MIN && interval <= CONFIG.IDEAL_PAY_INTERVAL_MAX) {
    state.goodPayCount += 1;
    state.girlMood = clamp(state.girlMood + CONFIG.GIRL_MOOD_GOOD_PAY, 0, 100);
    state.nailProgress += 6.2;
    speak(pick(TEXT.goodPay));
    setStatus("状态：这个节奏很甜");
    updatePayRhythmNeedle(interval);
  } else if (interval < CONFIG.IDEAL_PAY_INTERVAL_MIN && interval > 0) {
    setStatus("状态：稍微慢一点，她会更自在");
    updatePayRhythmNeedle(interval);
  } else {
    setStatus("状态：有回应就好，别断太久");
    updatePayRhythmNeedle(interval);
  }
  updateHud();
}

function handlePointer(event) {
  if (!state.running || state.mode !== "girlfriend") return;
  if (event.pointerType === "mouse" && event.buttons === 0 && event.type === "pointermove") return;

  const rect = els.gameScreen.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);

  if (event.type === "pointerdown") {
    ensureAudio();
    state.dragging = true;
    state.lastPointerX = x;
    state.lastPointerY = y;
    state.lastPointerAt = performance.now();
    els.gameScreen.setPointerCapture(event.pointerId);
    moveFileTool(x, y);
    event.preventDefault();
  }

  if (event.type === "pointermove" && state.dragging) {
    const now = performance.now();
    const dt = Math.max((now - state.lastPointerAt) / 1000, 0.016);
    const dx = x - state.lastPointerX;
    const dy = y - state.lastPointerY;
    const horizontalBonus = Math.abs(dx) * 1.15 + Math.abs(dy) * 0.25;
    const speed = horizontalBonus / dt;
    state.filePressure = state.filePressure * 0.56 + speed * 0.44;
    state.lastPointerX = x;
    state.lastPointerY = y;
    state.lastPointerAt = now;
    moveFileTool(x, y);
    playFileRub();
    event.preventDefault();
  }

  if (event.type === "pointerup" || event.type === "pointercancel" || event.type === "pointerleave") {
    state.dragging = false;
  }
}

function rewardGoodFile(now) {
  const reward = pick(CONFIG.REWARD);
  state.money += reward;
  state.lastActionAt = now;
  if (reward === Math.max(...CONFIG.REWARD)) {
    addFloat(`Perfect +${reward}W`, 50, 44, "perfect");
    playSound("perfect");
  } else {
    addFloat(`+${reward}W`, 52, 48, "up");
    playSound("coin");
  }
  if (Math.random() < 0.44) speak(pick(TEXT.goodFile));
}

function punishHeavyFile(now) {
  const penalty = pick(CONFIG.PENALTY);
  state.money = Math.max(0, state.money - penalty);
  state.painCount += 1;
  state.lastActionAt = now;
  addFloat(`-${penalty}W`, 52, 53, "down");
  els.nailTarget.classList.add("hurt");
  setTimeout(() => els.nailTarget.classList.remove("hurt"), 260);
  speak(pick(TEXT.heavyFile));
  shake();
  flashRed();
  playSound("pain");
}

function checkEnd() {
  state.nailProgress = clamp(state.nailProgress, 0, 100);
  if (state.mode === "girlfriend" && state.painCount >= CONFIG.PAIN_LIMIT) {
    endGame(false, "pain");
    return;
  }
  if (state.nailProgress >= 100) {
    if (state.mode === "boyfriend") endGame(true, "success");
    if (state.mode === "girlfriend" && state.money >= CONFIG.TARGET_MONEY) endGame(true, "success");
  }
  if (state.timeLeft <= 0) {
    const success = state.mode === "girlfriend"
      ? state.money >= CONFIG.TARGET_MONEY && state.nailProgress >= 100
      : state.nailProgress >= 100;
    endGame(success, success ? "success" : "timeout");
  }
}

function endGame(success, reason) {
  if (state.ended) return;
  state.running = false;
  state.ended = true;
  state.success = success;
  cancelAnimationFrame(rafId);
  updateHud();
  els.gameScreen.classList.add("finished");
  els.resultModal.classList.remove("hidden");
  els.scorePanel.classList.add("hidden");
  els.modalAction.textContent = success
    ? (state.mode === "boyfriend" ? "接受" : "我愿意")
    : (reason === "pain" ? "重新挑战" : "再试一次");

  if (success) {
    burstStars();
    playSound("success");
    els.resultIcon.textContent = state.mode === "boyfriend" ? "❤️" : "💍";
    els.resultTitle.textContent = state.mode === "boyfriend" ? "我们约会吧！" : "我们结婚吧！";
    els.resultSubtitle.textContent = state.mode === "boyfriend" ? "她好像对你有点心动。" : "看来你已经完全掌握他的喜好了。";
  } else {
    playSound("fail");
    els.resultIcon.textContent = reason === "pain" ? "😵" : "💔";
    els.resultTitle.textContent = reason === "pain" ? "他受不了了！" : (state.mode === "boyfriend" ? "修甲失败" : "还差一点……");
    els.resultSubtitle.textContent = reason === "pain" ? "今天的美甲就到这里吧。" : (state.mode === "boyfriend" ? "看来你还不太懂她。" : "你的技术还需要练练。");
  }
}

function showScore() {
  const rows = state.mode === "boyfriend" ? boyfriendScoreRows() : girlfriendScoreRows();
  els.scorePanel.innerHTML = rows.map(([label, value]) => (
    `<div class="score-row"><span>${label}</span><strong>${value}</strong></div>`
  )).join("");
  els.scorePanel.classList.remove("hidden");
  els.modalAction.textContent = "再来一次";
}

function boyfriendScoreRows() {
  const validIntervals = state.payIntervals.filter((ms) => ms > 700);
  const idealCount = validIntervals.filter((ms) => ms >= CONFIG.IDEAL_PAY_INTERVAL_MIN && ms <= CONFIG.IDEAL_PAY_INTERVAL_MAX).length;
  const rhythmRate = validIntervals.length ? idealCount / validIntervals.length : 0;
  const rhythm = grade(rhythmRate, [0.72, 0.52, 0.32]);
  const mood = grade(state.girlMood / 100, [0.78, 0.62, 0.44]);
  const remain = Math.ceil(state.timeLeft);
  let title = "恋爱节奏大师";
  if (state.girlMood >= 82 && rhythmRate >= 0.65 && remain >= 6) title = "情绪价值大师";
  else if (state.money >= 2500 && rhythmRate < 0.45) title = "人形ATM";
  else if (state.girlMood < 45) title = "钢铁直男";
  return [
    ["打钱节奏", rhythm],
    ["女生心情", mood],
    ["剩余时间", `${remain}s`],
    ["修甲完成度", `${Math.round(state.nailProgress)}%`],
    ["称号", title]
  ];
}

function girlfriendScoreRows() {
  const controlRate = state.pressureSamples ? state.goodPressureSamples / state.pressureSamples : 0;
  const control = grade(controlRate, [0.58, 0.42, 0.25]);
  const remain = Math.ceil(state.timeLeft);
  let title = "温柔小手";
  if (state.painCount >= 4) title = "暴力美甲师";
  else if (state.money >= CONFIG.TARGET_MONEY * 3 && remain >= 6) title = "赚钱机器";
  else if (controlRate >= 0.58 && state.painCount <= 1 && remain >= 4) title = "金牌美甲师";
  else if (controlRate >= 0.48 && state.painCount <= 2) title = "刚刚好大师";
  else if (remain <= 2 && state.painCount <= 2) title = "极限补救王";
  return [
    ["力度控制", control],
    ["疼痛次数", `${state.painCount}`],
    ["剩余时间", `${remain}s`],
    ["赚到金额", `${state.money}W`],
    ["修甲完成度", `${Math.round(state.nailProgress)}%`],
    ["称号", title]
  ];
}

function grade(value, cuts) {
  if (value >= cuts[0]) return "S";
  if (value >= cuts[1]) return "A";
  if (value >= cuts[2]) return "B";
  return "C";
}

function updateHud() {
  const timePercent = clamp(state.timeLeft / CONFIG.GAME_TIME * 100, 0, 100);
  els.timeBar.style.width = `${timePercent}%`;
  els.timeLabel.textContent = `${Math.ceil(state.timeLeft)}s`;
  els.nailBar.style.width = `${state.nailProgress}%`;
  els.nailLabel.textContent = `${Math.round(state.nailProgress)}%`;
  if (state.mode === "girlfriend") {
    els.moneyPanel.textContent = `💰 ${state.money}W / ${CONFIG.TARGET_MONEY}W`;
    els.painPanel.textContent = `疼痛：${state.painCount} / ${CONFIG.PAIN_LIMIT}`;
  } else {
    els.moneyPanel.textContent = `💰 ${state.money}W`;
  }
}

function updatePressureNeedle() {
  const max = CONFIG.PRESSURE_HEAVY * 1.15;
  const percent = clamp(state.filePressure / max * 100, 3, 97);
  els.pressureNeedle.style.left = `${percent}%`;
}

function updatePayRhythmNeedle(idleMs, forcedFast = false) {
  if (state.mode !== "boyfriend") return;
  let percent = 5;
  if (forcedFast) {
    percent = 94;
  } else if (idleMs <= 0) {
    percent = 18;
  } else if (idleMs < CONFIG.IDEAL_PAY_INTERVAL_MIN) {
    percent = 64 + (1 - idleMs / CONFIG.IDEAL_PAY_INTERVAL_MIN) * 30;
  } else if (idleMs <= CONFIG.IDEAL_PAY_INTERVAL_MAX) {
    const center = (CONFIG.IDEAL_PAY_INTERVAL_MIN + CONFIG.IDEAL_PAY_INTERVAL_MAX) / 2;
    percent = 50 + (idleMs - center) / center * 7;
  } else {
    const late = clamp((idleMs - CONFIG.IDEAL_PAY_INTERVAL_MAX) / (CONFIG.NO_PAY_WARNING - CONFIG.IDEAL_PAY_INTERVAL_MAX), 0, 1);
    percent = 40 - late * 35;
  }
  els.pressureNeedle.style.left = `${clamp(percent, 3, 97)}%`;
}

function setPressureLabels(mode) {
  const labels = mode === "boyfriend" ? ["冷淡", "刚好", "太急"] : ["轻", "最佳", "重"];
  els.pressureLabels.forEach((label, index) => {
    label.textContent = labels[index];
  });
}

function moveFileTool(x, y) {
  const rect = els.gameScreen.getBoundingClientRect();
  const left = x / rect.width * 100;
  const top = y / rect.height * 100;
  moveFileToolByPercent(left, top);
}

function moveFileToolByPercent(left, top) {
  const tilt = clamp((state.filePressure - 520) / 42, -16, 16);
  els.fileTool.style.left = `${left}%`;
  els.fileTool.style.top = `${top}%`;
  els.fileTool.style.transform = `translate(-50%, -50%) rotate(${tilt - 8}deg)`;
}

function setStatus(text) {
  els.statePanel.textContent = text;
}

function speak(text) {
  clearTimeout(speechTimer);
  els.speechBubble.textContent = text;
  els.speechBubble.classList.remove("hidden");
  speechTimer = setTimeout(() => {
    els.speechBubble.classList.add("hidden");
  }, CONFIG.SPEECH_TIME);
}

function addFloat(text, xPercent, yPercent, direction) {
  const item = document.createElement("span");
  item.className = `float-text ${direction === "down" ? "down" : ""} ${direction === "perfect" ? "perfect" : ""}`;
  item.textContent = text;
  item.style.left = `${xPercent + randomBetween(-4, 4)}%`;
  item.style.top = `${yPercent + randomBetween(-4, 4)}%`;
  els.floatLayer.appendChild(item);
  setTimeout(() => item.remove(), 1100);
}

function burstStars() {
  for (let i = 0; i < 28; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${randomBetween(35, 65)}%`;
    spark.style.top = `${randomBetween(38, 62)}%`;
    spark.style.setProperty("--sx", `${randomBetween(-150, 150)}px`);
    spark.style.setProperty("--sy", `${randomBetween(-120, 120)}px`);
    els.sparkLayer.appendChild(spark);
    setTimeout(() => spark.remove(), 850);
  }
}

function shake() {
  els.gameScreen.classList.remove("shake");
  void els.gameScreen.offsetWidth;
  els.gameScreen.classList.add("shake");
}

function flashRed() {
  els.redFlash.classList.add("active");
  setTimeout(() => els.redFlash.classList.remove("active"), 180);
}

function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
}

function playSound(type) {
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const table = {
    pay: [740, 0.055, "triangle", 0.035],
    coin: [920, 0.065, "sine", 0.03],
    perfect: [1240, 0.12, "sine", 0.04],
    pain: [170, 0.14, "sawtooth", 0.035],
    success: [660, 0.22, "triangle", 0.045],
    fail: [150, 0.25, "sine", 0.045],
    start: [520, 0.1, "sine", 0.028]
  };
  const [freq, duration, wave, volume] = table[type] || table.coin;
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, now);
  if (type === "success") osc.frequency.exponentialRampToValueAtTime(990, now + duration);
  if (type === "fail") osc.frequency.exponentialRampToValueAtTime(90, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

let lastRubAt = 0;
function playFileRub() {
  const now = performance.now();
  if (now - lastRubAt < 95) return;
  lastRubAt = now;
  playSound("coin");
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
