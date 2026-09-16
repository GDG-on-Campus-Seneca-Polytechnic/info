import { JumpDetector } from "./pose.js";
import { Wheel } from "./wheel.js";
import qrcode from "./vendor/qrcode.mjs";

// ---------- Settings (saved on this device only) ----------
const DEFAULTS = {
  goal: 5,
  sensitivity: 0.3,
  prizes: "Sticker, 6\nWater bottle, 1\nSticker, 6\nHigh five, 2",
  joinUrl: "https://linktr.ee/senecagdg",
  sound: true,
  camera: true,
};
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
let settings = { ...DEFAULTS, ...store.get("gdg-jump-settings", {}) };
let best = store.get("gdg-jump-best", { day: today(), score: 0 });
if (best.day !== today()) best = { day: today(), score: 0 };

function today() { return new Date().toISOString().slice(0, 10); }
function parsePrizes(text) {
  return text.split("\n").map((line) => {
    const i = line.lastIndexOf(",");
    const label = (i > 0 ? line.slice(0, i) : line).trim();
    const weight = i > 0 ? parseFloat(line.slice(i + 1)) : 1;
    return { label, weight: weight > 0 ? weight : 1 };
  }).filter((p) => p.label);
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
const screens = { start: $("screen-start"), over: $("screen-over"), wheel: $("screen-wheel") };
const hud = $("hud");

// ---------- Sound ----------
let audio;
function beep(freq, dur = 0.08, type = "square", vol = 0.08) {
  if (!settings.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch {}
}

// ---------- Sprites ----------
const DINO = [
  "...........########.",
  "..........##.#######",
  "..........##########",
  "..........##########",
  "..........#####.....",
  "..........########..",
  "#........#####......",
  "#.......#######.....",
  "##....##########....",
  "###..###########.#..",
  "################.....",
  ".##############......",
  "..#############......",
  "...###########.......",
  "....#########........",
  ".....#######.........",
];
const LEGS = [
  ["......##..##........", "......#....##.......", "......##............"],
  ["......##..##........", "......##...#........", "............##......"],
  ["......##..##........", "......#.....#.......", "......##....##......"],
];
const BUG = [
  "..#......#..",
  "...#....#...",
  "....####....",
  "..########..",
  "#.##.##.##.#",
  "..########..",
  "#.########.#",
  "..########..",
  "...#....#...",
];
const CLOUD = [
  "....####......",
  "..########....",
  ".############.",
  "##############",
];

function drawSprite(rows, x, y, px, fill, outline = "#1E1E1E") {
  // Thick dark outline, like the GDG logo, then the colour fill on top.
  const o = Math.max(2, Math.round(px * 0.5));
  if (outline) {
    ctx.fillStyle = outline;
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === "#") ctx.fillRect(x + c * px - o, y + r * px - o, px + o * 2, px + o * 2);
    });
  }
  ctx.fillStyle = fill;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === "#") ctx.fillRect(x + c * px, y + r * px, px + 0.5, px + 0.5);
  });
  // Punch the eye back out.
  if (rows === DINO) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x + 12 * px, y + px, px, px); }
}

// ---------- Game world ----------
// World units: 400 tall. Width follows the screen.
const WORLD_H = 400, GROUND = 346, PX = 3.2;
const DINO_W = 20 * PX, DINO_H = 19 * PX;
let DINO_X = 90; // moves left on narrow screens so bugs are visible sooner
const GRAVITY = 1500, JUMP_V = 640;
const TOKENS = ["{ }", "</>", ";", "( )", "=>", "[ ]", "&&", "#", "//", "++"];
const BUG_COLORS = ["#EA4335", "#EA4335", "#34A853", "#F9AB00"];

let scale = 1, worldW = 800, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  scale = canvas.height / WORLD_H;
  worldW = canvas.width / scale;
  DINO_X = Math.round(Math.min(90, Math.max(24, worldW * 0.08)));
}
addEventListener("resize", resize);
resize();

const game = {
  state: "start", // start | play | over | wheel
  t: 0, speed: 0, dodged: 0, y: 0, vy: 0, grounded: true,
  obstacles: [], clouds: [], tokens: [], nextSpawn: 0, jumpQueuedAt: -1, unlocked: false,
  overAt: 0, flash: 0,
};

function resetWorld() {
  Object.assign(game, {
    t: 0, speed: 300, dodged: 0, y: 0, vy: 0, grounded: true,
    obstacles: [], nextSpawn: 1.2, jumpQueuedAt: -1, unlocked: false, flash: 0,
  });
  if (!game.clouds.length) {
    for (let i = 0; i < 4; i++) game.clouds.push({ x: Math.random() * worldW, y: 60 + Math.random() * 120 });
  }
  if (!game.tokens.length) {
    for (let x = 0; x < worldW + 200; x += 70 + Math.random() * 60) {
      game.tokens.push({ x, text: TOKENS[(Math.random() * TOKENS.length) | 0] });
    }
  }
}
resetWorld();
if (location.hostname === "localhost") window.__game = game; // for local testing

function jump() {
  if (game.state === "start") return startGame();
  if (game.state === "wheel") return wheelJump();
  if (game.state !== "play") return;
  if (game.grounded) {
    game.vy = JUMP_V; game.grounded = false; beep(660, 0.09);
  } else {
    game.jumpQueuedAt = game.t; // jump again as soon as we land
  }
}

function startGame() {
  // Cancel the "back to start" timer from the last round, or it fires mid-game.
  clearTimeout(idleTimer);
  resetWorld();
  game.state = "play";
  show(null);
  hud.hidden = false;
  updateHud();
  beep(520, 0.08); setTimeout(() => beep(780, 0.1), 90);
}

function spawn() {
  const kind = Math.random();
  const color = BUG_COLORS[(Math.random() * BUG_COLORS.length) | 0];
  const count = game.t > 12 && kind > 0.7 ? 2 : 1;
  game.obstacles.push({ x: worldW + 40, count, color, passed: false });
  // Gap long enough to land and jump again, shrinking a little as speed rises.
  const air = (2 * JUMP_V) / GRAVITY;
  const minGap = game.speed * (air + 0.35);
  const gap = minGap + Math.random() * game.speed * 1.1;
  game.nextSpawn = gap / game.speed;
}

function update(dt) {
  // Background drifts even on menus.
  const drift = game.state === "play" ? game.speed : 60;
  for (const c of game.clouds) {
    c.x -= drift * 0.15 * dt;
    if (c.x < -60) { c.x = worldW + Math.random() * 200; c.y = 60 + Math.random() * 120; }
  }
  for (const tk of game.tokens) {
    tk.x -= drift * dt;
    if (tk.x < -60) { tk.x += worldW + 160; tk.text = TOKENS[(Math.random() * TOKENS.length) | 0]; }
  }
  if (game.state !== "play") return;

  game.t += dt;
  game.speed = Math.min(620, 300 + game.t * 9);
  game.flash = Math.max(0, game.flash - dt);

  if (!game.grounded) {
    game.vy -= GRAVITY * dt;
    game.y += game.vy * dt;
    if (game.y <= 0) {
      game.y = 0; game.vy = 0; game.grounded = true;
      if (game.jumpQueuedAt >= 0 && game.t - game.jumpQueuedAt < 0.2) jump();
      game.jumpQueuedAt = -1;
    }
  }

  game.nextSpawn -= dt;
  if (game.nextSpawn <= 0) spawn();

  const dinoBox = { x: DINO_X + 14, y: GROUND - game.y - DINO_H + 8, w: DINO_W - 30, h: DINO_H - 12 };
  for (const o of game.obstacles) {
    o.x -= game.speed * dt;
    const w = 12 * PX * o.count, h = 9 * PX;
    const box = { x: o.x + 6, y: GROUND - h + 6, w: w - 12, h: h - 6 };
    if (dinoBox.x < box.x + box.w && dinoBox.x + dinoBox.w > box.x && dinoBox.y < box.y + box.h && dinoBox.y + dinoBox.h > box.y) {
      return gameOver();
    }
    if (!o.passed && o.x + w < DINO_X) {
      o.passed = true;
      game.dodged += o.count;
      beep(990, 0.05, "square", 0.05);
      if (!game.unlocked && game.dodged >= settings.goal) {
        game.unlocked = true; game.flash = 1.4;
        beep(784, 0.1); setTimeout(() => beep(1046, 0.18), 110);
      }
      updateHud();
    }
  }
  game.obstacles = game.obstacles.filter((o) => o.x > -120);
}

function render() {
  const legFrame = game.state === "play" && game.grounded ? Math.floor(game.t * 12) % 2 : 2;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, worldW, WORLD_H);

  for (const c of game.clouds) drawSprite(CLOUD, c.x, c.y, 5, "#E8F0FE", null);

  // Ground: a code line.
  ctx.fillStyle = "#1E1E1E";
  ctx.fillRect(0, GROUND, worldW, 4);
  ctx.font = "700 22px 'Pixelify Sans', monospace";
  ctx.fillStyle = "#9AA0A6";
  ctx.textBaseline = "top";
  for (const tk of game.tokens) ctx.fillText(tk.text, tk.x, GROUND + 18);

  for (const o of game.obstacles) {
    for (let i = 0; i < o.count; i++) drawSprite(BUG, o.x + i * 12 * PX, GROUND - 9 * PX, PX, o.color);
  }

  const dy = GROUND - game.y - DINO_H;
  drawSprite(DINO, DINO_X, dy, PX, "#4285F4");
  drawSprite(LEGS[legFrame], DINO_X, dy + 16 * PX, PX, "#4285F4");

  if (game.flash > 0) {
    ctx.globalAlpha = Math.min(1, game.flash * 2);
    ctx.font = "700 48px 'Pixelify Sans', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#1E1E1E";
    ctx.fillStyle = "#F9AB00";
    const label = "Spin unlocked!";
    ctx.strokeText(label, worldW / 2, 200);
    ctx.fillText(label, worldW / 2, 200);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Screens ----------
function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  $("cam").style.visibility = name === "wheel" ? "hidden" : "";
}

function updateHud() {
  $("dodged").textContent = game.dodged;
  const pct = Math.min(100, (game.dodged / settings.goal) * 100);
  $("goal-fill").style.width = pct + "%";
  $("goal-bar").classList.toggle("done", game.dodged >= settings.goal);
  $("best").textContent = Math.max(best.score, game.dodged);
  document.querySelectorAll(".goal-n").forEach((el) => (el.textContent = settings.goal));
}

let idleTimer;
function gameOver() {
  game.state = "over";
  game.overAt = performance.now();
  beep(180, 0.3, "sawtooth", 0.07);
  if (game.dodged > best.score) { best = { day: today(), score: game.dodged }; store.set("gdg-jump-best", best); }
  updateHud();
  hud.hidden = true;
  const won = game.dodged >= settings.goal;
  $("over-score").textContent = game.dodged;
  $("over-title").textContent = won ? "You did it" : "Bug got you";
  $("over-msg").textContent = won
    ? "You earned a spin of the prize wheel."
    : `Dodge ${settings.goal} bugs to spin the prize wheel. ${settings.goal - game.dodged} more to go.`;
  $("btn-spin").hidden = !won;
  $("over-best").textContent = `Today's best: ${best.score}`;
  show("over");
  clearTimeout(idleTimer);
  if (!won) idleTimer = setTimeout(toStart, 9000);
}

function toStart() {
  clearTimeout(idleTimer);
  resetWorld();
  game.state = "start";
  hud.hidden = true;
  show("start");
}

// ---------- Wheel ----------
const wheel = new Wheel($("wheel"));
function openWheel() {
  clearTimeout(idleTimer);
  game.state = "wheel";
  hud.hidden = true;
  wheel.setPrizes(parsePrizes(settings.prizes));
  $("wheel-title").textContent = "Spin to win";
  $("wheel-msg").textContent = "Tap Spin, or jump to spin it.";
  $("btn-wheel").hidden = false;
  $("btn-wheel").disabled = false;
  $("join").hidden = true;
  show("wheel");
}
function wheelJump() {
  if (!$("btn-wheel").hidden && !$("btn-wheel").disabled) spinWheel();
}
async function spinWheel() {
  $("btn-wheel").disabled = true;
  const prize = await wheel.spin((tick) => tick && beep(1200, 0.02, "square", 0.03));
  beep(784, 0.1); setTimeout(() => beep(1046, 0.1), 110); setTimeout(() => beep(1318, 0.2), 220);
  $("btn-wheel").hidden = true;
  $("wheel-title").textContent = prize.label;
  $("wheel-msg").textContent = "Show this screen at the table.";
  renderQr();
  $("join").hidden = false;
}
function renderQr() {
  try {
    const qr = qrcode(0, "M");
    qr.addData(settings.joinUrl);
    qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch {
    $("qr").textContent = settings.joinUrl;
  }
}

$("btn-spin").addEventListener("click", openWheel);
$("btn-again").addEventListener("click", startGame);
$("btn-wheel").addEventListener("click", spinWheel);
$("btn-next").addEventListener("click", toStart);

// ---------- Input ----------
function isUi(target) { return target.closest("button, dialog, .brand, .cam, input, textarea"); }
addEventListener("pointerdown", (e) => {
  if (isUi(e.target)) return;
  if (game.state === "over") {
    // Ignore taps right after a crash so a late jump doesn't skip the result.
    if (performance.now() - game.overAt > 1200 && $("btn-spin").hidden) startGame();
    return;
  }
  jump();
});
addEventListener("keydown", (e) => {
  if ($("settings").open) return;
  if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
  if (e.key === "s" || e.key === "S") openSettings();
});

// ---------- Camera ----------
const cam = $("cam");
let detector;
function setCamStatus(kind, text) {
  cam.classList.remove("ready", "lost", "off");
  if (kind === "ready" || kind === "lost" || kind === "off") cam.classList.add(kind);
  $("cam-status").textContent = text;
}
async function startCamera() {
  detector?.stop();
  detector = null;
  if (!settings.camera) { setCamStatus("off", "Camera off. Tap to jump."); return; }
  detector = new JumpDetector({
    video: $("video"),
    overlay: $("skeleton"),
    onStatus: setCamStatus,
    onJump: () => {
      // Ignore jumps right after a crash so a late jump doesn't skip the result.
      // After that, a jump starts a new round unless a spin is waiting.
      if (game.state === "over") {
        if (performance.now() - game.overAt > 1500 && $("btn-spin").hidden) startGame();
        return;
      }
      jump();
    },
  });
  detector.sensitivity = settings.sensitivity;
  try {
    await detector.start();
  } catch (err) {
    console.warn(err);
    detector = null;
    setCamStatus("off", "No camera. Tap to jump.");
  }
}
startCamera();

// ---------- Staff settings ----------
const dialog = $("settings");
const form = $("settings-form");
function openSettings() {
  form.goal.value = settings.goal;
  form.sensitivity.value = settings.sensitivity;
  $("sens-out").textContent = settings.sensitivity;
  form.prizes.value = settings.prizes;
  form.joinUrl.value = settings.joinUrl;
  form.sound.checked = settings.sound;
  form.camera.checked = settings.camera;
  $("offline-status").textContent = navigator.serviceWorker?.controller
    ? "Saved for offline use on this device."
    : "Not saved for offline use yet. Open this page once with internet over https.";
  dialog.showModal();
}
form.sensitivity.addEventListener("input", () => ($("sens-out").textContent = form.sensitivity.value));
dialog.addEventListener("close", () => {
  if (dialog.returnValue === "reset-best") {
    best = { day: today(), score: 0 };
    store.set("gdg-jump-best", best);
    updateHud();
    return;
  }
  if (dialog.returnValue !== "save") return;
  const cameraBefore = settings.camera;
  settings = {
    goal: Math.max(1, parseInt(form.goal.value, 10) || DEFAULTS.goal),
    sensitivity: parseFloat(form.sensitivity.value) || DEFAULTS.sensitivity,
    prizes: parsePrizes(form.prizes.value).length ? form.prizes.value : DEFAULTS.prizes,
    joinUrl: form.joinUrl.value || DEFAULTS.joinUrl,
    sound: form.sound.checked,
    camera: form.camera.checked,
  };
  store.set("gdg-jump-settings", settings);
  if (detector) detector.sensitivity = settings.sensitivity;
  if (cameraBefore !== settings.camera) startCamera();
  updateHud();
});

// Triple tap the logo to open settings.
let logoTaps = [];
$("logo").addEventListener("pointerdown", () => {
  const now = performance.now();
  logoTaps = logoTaps.filter((t) => now - t < 800).concat(now);
  if (logoTaps.length >= 3) { logoTaps = []; openSettings(); }
});

updateHud();

// ---------- Offline ----------
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Offline cache failed", err));
}
