// The projector view: a 3D arena where every phone drives one bean.
import * as THREE from "three";
import {
  COLORS, GAP, HALF, BG, PLATFORM_OUTER, PLATFORM_TOP, ease, clamp01,
  addLights, makeBackdrop, makePlatform, makeDock, makeAnswerLabel, setAnswerLabel,
  makeBean, setBenched, animateRig, makePuffs, makeConfetti,
} from "./arena-scene.js";

const el = (id) => document.getElementById(id);
const now = () => performance.now() / 1000;

// ---------------------------------------------------------------- scene setup

const renderer = new THREE.WebGLRenderer({ canvas: el("scene"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 28, 62);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 160);
// Two framings: the lobby shows the crowd waiting on the front dock, play tightens on the stage.
const SHOTS = {
  lobby: { pos: new THREE.Vector3(0, 9.5, 23), look: new THREE.Vector3(0, 0.5, 3) },
  play: { pos: new THREE.Vector3(0, 16, 14.5), look: new THREE.Vector3(0, 0, -3) },
  over: { pos: new THREE.Vector3(0, 13, 12.5), look: new THREE.Vector3(0, 0.5, -2.5) },
};
const cam = {
  from: { pos: SHOTS.lobby.pos.clone(), look: SHOTS.lobby.look.clone() },
  to: SHOTS.lobby,
  startedAt: -10,
  duration: 1.8,
  pos: SHOTS.lobby.pos.clone(),
  look: SHOTS.lobby.look.clone(),
  shake: 0,
};

function moveCamera(shot) {
  if (cam.to === shot) return;
  cam.from = { pos: cam.pos.clone(), look: cam.look.clone() };
  cam.to = shot;
  cam.startedAt = now();
}

addLights(scene);
const backdrop = makeBackdrop(scene);
const puffs = makePuffs(scene);
const confetti = makeConfetti(scene);

// Four answer platforms, laid out like the 2x2 grid on the phones.
const platforms = [0, 1, 2, 3].map((index) => {
  const platform = makePlatform(index);
  scene.add(platform);
  return platform;
});
const labels = platforms.map((platform) => {
  const label = makeAnswerLabel();
  platform.add(label);
  return label;
});

// The dead zone between platforms is a walkway; it drops on the reveal so "no answer" falls too.
const walkway = makeDock("walkway");
scene.add(walkway);
// Docks: the crowd waits at the front, knocked-out beans watch from the sides.
const frontDock = makeDock("front");
const leftDock = makeDock("left");
const rightDock = makeDock("right");
scene.add(frontDock, leftDock, rightDock);

const DOCK_Z = PLATFORM_OUTER + 2.5; // centre of the front dock
const lobbySlot = (index) => {
  const row = Math.floor(index / 10);
  const col = index % 10;
  return new THREE.Vector3((col - 4.5) * 1.3 + (row % 2) * 0.4, PLATFORM_TOP, DOCK_Z - 1.05 + row * 1.15);
};
// Beans with no position yet queue along the walkway cross, like the phone centring its bean.
const walkwaySlot = (index) =>
  new THREE.Vector3(index % 2 ? 0.27 : -0.27, PLATFORM_TOP, -4.9 + Math.floor(index / 2) * 0.78);
const benchSlot = (index) => {
  const side = index % 2 ? 1 : -1;
  const i = Math.floor(index / 2);
  const col = Math.floor(i / 7);
  return new THREE.Vector3(side * (PLATFORM_OUTER + 1.7 + col * 1.1), PLATFORM_TOP, -4.2 + (i % 7) * 1.4 + col * 0.5);
};

// ---------------------------------------------------------------- characters

const beans = new Map(); // pid -> bean rig, see makeBean

function worldFromArena(x, y) {
  return new THREE.Vector3(x * HALF, PLATFORM_TOP, y * HALF);
}

// Drop a bean in from above, so arrivals and bench moves read as a landing, not a teleport.
function placeFromAbove(bean, spot) {
  bean.group.position.set(spot.x, spot.y + 7, spot.z);
  bean.group.rotation.set(0, 0, 0);
  bean.group.visible = true;
  bean.velocity.set(0, 0, 0);
  bean.vy = 0;
  bean.target.copy(spot);
}

function syncBeans(players) {
  const seen = new Set();
  let lobbyIndex = 0;
  let benchIndex = 0;
  let walkwayIndex = 0;
  const staged = state.phase !== "lobby"; // winners stay on stage for the "over" screen

  for (const player of players) {
    seen.add(player.pid);
    let bean = beans.get(player.pid);
    const isNew = !bean;
    if (isNew) {
      bean = makeBean(COLORS[player.color] ? player.color : 0, player.name);
      scene.add(bean.group);
      beans.set(player.pid, bean);
      // A screen reload mid-round must put alive players straight back where they stand.
      const spot = !staged ? lobbySlot(lobbyIndex)
        : player.status === "alive" && player.pos ? worldFromArena(player.pos.x, player.pos.y)
        : benchSlot(benchIndex);
      placeFromAbove(bean, spot);
    }
    bean.status = player.status;
    bean.zone = player.zone;

    const onStage = staged && player.status === "alive";
    // Knocked-out beans stay on stage through the reveal (that's when they fall) and only move
    // to the bench when the next phase starts.
    const benched = staged && !onStage && (state.phase !== "reveal" || bean.mode === "bench" || isNew);
    if (benched && bean.mode !== "bench") {
      bean.mode = "bench";
      setBenched(bean, true);
      placeFromAbove(bean, benchSlot(benchIndex));
    }
    if (benched) benchIndex += 1;
    if (!benched && bean.mode === "bench") {
      bean.mode = "stand";
      setBenched(bean, false);
    }
    if (onStage && bean.mode === "fall") {
      // Revived mid-fall: back onto the stage from above.
      placeFromAbove(bean, player.pos ? worldFromArena(player.pos.x, player.pos.y) : new THREE.Vector3(0, PLATFORM_TOP, 0));
      bean.mode = "stand";
    }
    if (onStage && bean.mode === "stand") {
      if (player.pos) bean.target.copy(worldFromArena(player.pos.x, player.pos.y));
      else if (state.phase === "question") bean.target.copy(walkwaySlot(walkwayIndex++));
    }
    if (!staged) {
      if (bean.mode === "fall") placeFromAbove(bean, lobbySlot(lobbyIndex));
      bean.mode = "stand";
      bean.target.copy(lobbySlot(lobbyIndex));
      lobbyIndex += 1;
    }
    bean.cheer = state.phase === "over" && player.status === "alive";
  }

  for (const [pid, bean] of beans) {
    if (seen.has(pid)) continue;
    scene.remove(bean.group);
    beans.delete(pid);
  }
}

// ---------------------------------------------------------------- game state

const params = new URLSearchParams(location.search);
let room = (params.get("room") || "").toUpperCase();
let hostKey = params.get("host") || "";
let socket = null;
let state = null;
let clockOffset = 0;

start();

async function start() {
  if (!room || !hostKey) {
    const created = await fetch("/api/new").then((r) => r.json());
    room = created.code;
    hostKey = created.hostKey;
    history.replaceState(null, "", `?room=${room}&host=${hostKey}`);
  }
  const joinUrl = `${location.origin}/?room=${room}`;
  el("code").innerHTML = [...room].map((ch, i) => `<span class="c${i % 4}">${ch}</span>`).join("");
  el("roomPill").textContent = `Room ${room}`;
  el("joinUrl").textContent = joinUrl.replace(/^https?:\/\//, "");
  const qr = qrcode(0, "M");
  qr.addData(joinUrl);
  qr.make();
  el("qr").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  connect();
}

let everConnected = false;
let failedTries = 0;

function connect() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}/api/ws?role=screen&code=${room}&hostKey=${hostKey}`);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "positions") {
      let onPlatform = 0;
      for (const item of message.list) {
        const bean = beans.get(item.pid);
        if (bean && bean.mode === "stand") bean.target.copy(worldFromArena(item.x, item.y));
        if (Math.abs(item.x) >= GAP && Math.abs(item.y) >= GAP) onPlatform += 1;
      }
      if (state?.phase === "question") {
        const alive = state.players.filter((p) => p.status === "alive").length;
        el("alive").textContent = `${onPlatform} of ${alive} on a platform`;
      }
      return;
    }
    const previousPhase = state?.phase;
    state = message;
    clockOffset = state.serverNow - Date.now();
    render(previousPhase);
  });
  socket.addEventListener("open", () => {
    everConnected = true;
    failedTries = 0;
  });

  socket.addEventListener("close", () => {
    // A room only accepts the host key it was opened with. Say so instead of
    // retrying forever behind a screen that looks fine.
    if (!everConnected && ++failedTries >= 3) {
      const message = el("bigMessage");
      message.classList.remove("hidden");
      message.textContent = "Can't open this room. Load the arena page without a room in the address to start a fresh one.";
      return;
    }
    setTimeout(connect, 1200);
  });
}

function send(type) {
  socket?.send(JSON.stringify({ type }));
}

// Handy from the browser console during a rehearsal: BB.send("start"), BB.state, BB.beans.size
window.BB = {
  send,
  get state() { return state; },
  beans,
  shots: SHOTS,
  // Grabs the 3D frame (no overlay) as a JPEG data URL, for checking animation timing.
  snap() {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/jpeg", 0.8);
  },
};

document.querySelectorAll("footer button").forEach((button) =>
  button.addEventListener("click", () => send(button.dataset.cmd))
);

document.addEventListener("keydown", (event) => {
  const keys = { s: "start", n: "next", r: "revive", escape: "reset", " ": "next" };
  const cmd = keys[event.key.toLowerCase()];
  if (cmd) {
    event.preventDefault();
    send(cmd);
  }
});

function render(previousPhase) {
  const playing = state.phase === "question" || state.phase === "reveal";
  const alive = state.players.filter((p) => p.status === "alive");

  el("counter").textContent = `${state.players.length} player${state.players.length === 1 ? "" : "s"}`;
  el("joinPanel").classList.toggle("hidden", playing || state.phase === "over");
  el("timer").classList.toggle("hidden", !playing);
  el("question").textContent = playing ? state.question.text : "";
  el("progress").textContent = playing ? `Question ${state.questionNumber}` : "";
  el("progress").classList.toggle("hidden", !playing);
  document.body.dataset.phase = state.phase;

  if (state.phase === "question") {
    const locked = alive.filter((p) => p.locked).length;
    el("alive").textContent = `${locked} of ${alive.length} on a platform`;
  } else {
    el("alive").textContent = playing ? `${alive.length} still in` : "";
  }

  const message = el("bigMessage");
  if (state.phase === "over") {
    message.classList.remove("hidden");
    const names = alive.map((p) => p.name);
    message.innerHTML = names.length
      ? `<small>${names.length === 1 ? "Winner" : "Winners"}</small><strong>${names.map(escapeHtml).join(" · ")}</strong>`
      : `<small>Game over</small><strong>Nobody survived</strong>`;
  } else {
    message.classList.add("hidden");
  }

  if (state.question) state.question.answers.forEach((text, index) => setAnswerLabel(labels[index], text));

  moveCamera(SHOTS[state.phase === "lobby" || state.phase === "over" ? state.phase : "play"]);
  syncBeans(state.players);

  if (state.phase !== previousPhase) onPhaseChange();
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}

function onPhaseChange() {
  const t = now();
  if (state.phase === "reveal") {
    el("flash").classList.add("on");
    setTimeout(() => el("flash").classList.remove("on"), 400);
    platforms.forEach((platform, index) => {
      const d = platform.userData;
      if (index === state.correct) {
        d.popAt = t + 0.15;
        setTimeout(() => confetti.burst(platform.position.clone().setY(PLATFORM_TOP + 1)), 250);
      } else {
        // Wrong platforms wobble for a beat, then let go one after another.
        d.dropAt = t + 1.0 + index * 0.18;
        d.wobbleFrom = t + 0.3;
      }
    });
    walkway.userData.dropAt = t + 1.0;
    walkway.userData.wobbleFrom = t + 0.3;
    return;
  }
  if (state.phase === "question" || state.phase === "lobby" || state.phase === "over") {
    // Everything that fell comes back up for the next round.
    for (const platform of [...platforms, walkway]) {
      const d = platform.userData;
      if (d.dropAt !== null || d.riseAt !== null) {
        d.riseAt = t;
        d.dropAt = null;
        d.puffed = false;
      }
      d.popAt = null;
      d.wobbleFrom = null;
      d.slab.material.emissiveIntensity = 0;
    }
  }
}

// ---------------------------------------------------------------- timer overlay

function tickTimer() {
  if (!state || (state.phase !== "question" && state.phase !== "reveal")) return;
  const total = state.phase === "question" ? 20000 : 6000;
  const left = state.deadline - (Date.now() + clockOffset);
  const ratio = clamp01(left / total);
  const bar = el("timer");
  bar.querySelector("i").style.transform = `scaleX(${ratio})`;
  bar.classList.toggle("low", state.phase === "question" && ratio < 0.25);
  bar.classList.toggle("reveal", state.phase === "reveal");
  el("timerText").textContent = state.phase === "question" ? String(Math.ceil(Math.max(0, left) / 1000)) : "";
}
setInterval(tickTimer, 100);

// ---------------------------------------------------------------- animation

const clock = new THREE.Clock();
const DROP_G = 16;
const BEAN_G = 30;
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

function updatePlatform(platform, t, dt) {
  const d = platform.userData;
  let y = 0;
  let tilt = 0;
  let wobble = 0;
  let scale = 1;

  if (d.riseAt !== null) {
    const k = clamp01((t - d.riseAt) / 1.1);
    y = -18 * (1 - ease.outCubic(k));
    if (k >= 1) d.riseAt = null;
    platform.visible = true;
  }
  if (d.wobbleFrom !== null && d.dropAt !== null && t < d.dropAt) {
    wobble = clamp01((t - d.wobbleFrom) / (d.dropAt - d.wobbleFrom));
  }
  if (d.dropAt !== null && t >= d.dropAt) {
    const k = t - d.dropAt;
    if (!d.puffed) {
      d.puffed = true;
      puffs.burst(platform.position, d.radius, 26);
      cam.shake = Math.max(cam.shake, 0.22);
    }
    y = -0.5 * DROP_G * k * k - k * 0.8;
    tilt = ease.inCubic(clamp01(k / 1.3)) * 0.85;
    if (y < -40) platform.visible = false;
  }
  if (d.popAt !== null) {
    const k = clamp01((t - d.popAt) / 1.1);
    scale = 1 + 0.09 * (ease.outElastic(k) - 1) + (k >= 1 ? 0 : 0.06 * Math.sin(k * Math.PI));
    d.slab.material.emissiveIntensity = 0.1 + Math.sin(t * 5) * 0.07;
  }

  platform.position.y = PLATFORM_TOP + y;
  platform.scale.setScalar(scale);
  platform.quaternion.setFromAxisAngle(d.tiltAxis, tilt);
  if (wobble > 0) {
    const a = wobble * wobble * 0.05;
    tmpEuler.set(Math.sin(t * 38 + d.wobbleSeed) * a, 0, Math.cos(t * 43 + d.wobbleSeed) * a);
    platform.quaternion.multiply(tmpQuat.setFromEuler(tmpEuler));
    platform.position.y += Math.sin(t * 50) * a * 0.6;
  }
}

// Where the floor is under a bean right now. Falls with a sinking platform; -Infinity means void.
function groundFor(bean) {
  if (bean.mode === "bench" || bean.status === "alive") return PLATFORM_TOP;
  if (!state || state.correct === null) return PLATFORM_TOP;
  const rider = bean.zone !== null ? platforms[bean.zone] : walkway;
  return rider.visible ? rider.position.y : -Infinity;
}

function updateBean(bean, t, dt) {
  const g = bean.group;
  const v = bean.velocity;

  if (bean.mode === "fall") {
    bean.vy -= BEAN_G * 0.6 * dt;
    g.position.y += bean.vy * dt;
    g.position.x += v.x * dt;
    g.position.z += v.z * dt;
    g.rotation.x += bean.spin.x * dt;
    g.rotation.z += bean.spin.z * dt;
    bean.arms[0].rotation.z = -2.6 + Math.sin(t * 20) * 0.5;
    bean.arms[1].rotation.z = 2.6 - Math.sin(t * 20) * 0.5;
    if (g.position.y < -34) g.visible = false;
    return;
  }

  // Horizontal motion is a slightly under-damped spring, so beans accelerate and settle.
  const ax = (bean.target.x - g.position.x) * 80 - v.x * 14;
  const az = (bean.target.z - g.position.z) * 80 - v.z * 14;
  v.x += ax * dt;
  v.z += az * dt;
  const speed = Math.hypot(v.x, v.z);
  if (speed > 9) {
    v.x *= 9 / speed;
    v.z *= 9 / speed;
  }
  g.position.x += v.x * dt;
  g.position.z += v.z * dt;

  const ground = groundFor(bean);
  if (ground === -Infinity || ground < -2.5) {
    bean.mode = "fall";
    bean.spin.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
    v.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    return;
  }
  if (g.position.y > ground + 0.001 || bean.vy < 0) {
    bean.vy -= BEAN_G * dt;
    g.position.y += bean.vy * dt;
    if (g.position.y <= ground) {
      g.position.y = ground;
      if (bean.vy < -5) {
        bean.landT = 0;
        puffs.burst(g.position, 0.4, 5, 0xffffff);
      }
      bean.vy = 0;
    }
  } else {
    g.position.y = ground;
  }

  animateRig(bean, t, dt, speed, tmpQuat);
}

function updateCamera(t, dt) {
  const k = ease.inOutCubic(clamp01((t - cam.startedAt) / cam.duration));
  cam.pos.lerpVectors(cam.from.pos, cam.to.pos, k);
  cam.look.lerpVectors(cam.from.look, cam.to.look, k);
  cam.shake = Math.max(0, cam.shake - dt * 0.9);
  const shake = cam.shake * cam.shake;
  camera.position.set(
    cam.pos.x + Math.sin(t * 0.31) * 0.4 + (Math.random() - 0.5) * shake * 1.5,
    cam.pos.y + Math.sin(t * 0.47) * 0.18 + (Math.random() - 0.5) * shake,
    cam.pos.z
  );
  camera.lookAt(cam.look.x + Math.sin(t * 0.31) * 0.15, cam.look.y, cam.look.z);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = now();

  for (const platform of platforms) updatePlatform(platform, t, dt);
  updatePlatform(walkway, t, dt);
  for (const bean of beans.values()) updateBean(bean, t, dt);

  backdrop.update(t);
  puffs.update(dt);
  confetti.update(dt);
  if (state?.phase === "over" && Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5)) {
    const winners = [...beans.values()].filter((bean) => bean.cheer);
    if (winners.length) confetti.burst(winners[Math.floor(Math.random() * winners.length)].group.position.clone().setY(2));
  }
  updateCamera(t, dt);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

addEventListener("resize", resize);
resize();
frame();
