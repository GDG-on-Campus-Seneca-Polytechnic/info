// Phone controller: join a room, drag your bean onto an answer.
const COLORS = ["var(--blue)", "var(--red)", "var(--yellow)", "var(--green)"];

const el = (id) => document.getElementById(id);
const joinView = el("joinView");
const gameView = el("gameView");
const roomInput = el("roomInput");
const nameInput = el("nameInput");
const statusEl = el("status");
const questionEl = el("question");
const stage = el("stage");
const me = el("me");
const hint = el("hint");
const timerFill = el("timer").firstElementChild;

const zones = [...stage.querySelectorAll(".zone")];
const waitView = el("waitView");
const waitBean = el("waitBean");

const TIPS = [
  "Drag your bean onto the answer you think is right.",
  "You can keep moving until the timer runs out.",
  "Wrong answer and the floor drops. Brutal.",
  "Knocked out? You're back in the next game.",
  "Watch the big screen to see everyone run.",
];
const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};

let pid = store.get("beanPid", "");
if (!pid) {
  pid = crypto.randomUUID();
  store.set("beanPid", pid);
}
let color = Number(store.get("beanColor", "0"));
let socket = null;
let state = null;
let myZone = null;
let clockOffset = 0;
let lastSent = 0;
let lastQuestion = -1;

// ---- join screen ----

const params = new URLSearchParams(location.search);
roomInput.value = (params.get("room") || store.get("beanRoom", "")).toUpperCase();
nameInput.value = store.get("beanName", "");

const colorRow = el("colors");
COLORS.forEach((value, index) => {
  const button = document.createElement("button");
  button.innerHTML = `<span class="bean" style="--bean:${value};--size:34px"></span>`;
  button.setAttribute("aria-pressed", String(index === color));
  button.addEventListener("click", () => {
    color = index;
    store.set("beanColor", String(index));
    [...colorRow.children].forEach((child, i) => child.setAttribute("aria-pressed", String(i === index)));
    me.style.setProperty("--bean", COLORS[color]);
  });
  colorRow.append(button);
});
me.style.setProperty("--bean", COLORS[color]);

el("joinBtn").addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    el("joinHint").textContent = "Room codes are 4 letters or numbers.";
    return;
  }
  store.set("beanRoom", code);
  store.set("beanName", nameInput.value.trim());
  connect(code);
});

if (params.get("room")) el("joinBtn").click();

// ---- connection ----

function connect(code) {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}/api/ws?role=player&code=${code}`);

  socket.addEventListener("open", () => {
    joinView.classList.add("hidden");
    gameView.classList.remove("hidden");
    socket.send(
      JSON.stringify({ type: "join", pid, name: nameInput.value.trim() || "Bean", color })
    );
  });

  socket.addEventListener("message", (event) => {
    state = JSON.parse(event.data);
    clockOffset = state.serverNow - Date.now();
    if (state.questionNumber !== lastQuestion) {
      lastQuestion = state.questionNumber;
      if (state.phase === "question") myZone = null;
    }
    render();
  });

  socket.addEventListener("close", () => {
    statusEl.textContent = "Disconnected. Reconnecting…";
    setTimeout(() => connect(code), 1200);
  });
}

// ---- rendering ----

function myPlayer() {
  return state?.players.find((p) => p.pid === pid) || null;
}

// The waiting room covers everything that is not an active question: the lobby, late
// joiners, knocked-out players, and the gap between games.
function renderWaiting(player) {
  const inQuestion = state.phase === "question" || state.phase === "reveal";
  const showWaiting = !inQuestion || player?.status === "waiting" || player?.status === "out";
  waitView.classList.toggle("hidden", !showWaiting);
  gameView.classList.toggle("hidden", showWaiting);
  if (!showWaiting) return;

  waitBean.style.setProperty("--bean", COLORS[color]);
  const others = state.players.length - 1;

  if (player?.status === "waiting") {
    el("waitTitle").textContent = "Next game is yours";
    el("waitLine").textContent = "A game is already running. You join the next one.";
  } else if (player?.status === "out") {
    el("waitTitle").textContent = "Knocked out";
    el("waitLine").textContent = "Cheer for the ones still up there.";
  } else if (state.phase === "over") {
    const winners = state.players.filter((p) => p.status === "alive");
    const iWon = winners.some((p) => p.pid === pid);
    el("waitTitle").textContent = iWon ? "You win!" : "Game over";
    el("waitLine").textContent = winners.length
      ? `Winner: ${winners.map((p) => p.name).join(", ")}`
      : "Nobody survived that one.";
  } else {
    el("waitTitle").textContent = `You're in, ${player?.name || "Bean"}`;
    el("waitLine").textContent = "Waiting for the host to start.";
  }

  el("waitRoom").textContent = `Room ${store.get("beanRoom", "")}`;
  el("waitCount").textContent = others <= 0 ? "First one here" : `${state.players.length} players`;
  el("waitTip").textContent = TIPS[Math.floor(Date.now() / 6000) % TIPS.length];
}

function render() {
  if (!state) return;
  const player = myPlayer();
  const question = state.question;
  renderWaiting(player);

  zones.forEach((zone, index) => {
    zone.textContent = question ? question.answers[index] : "";
    zone.classList.toggle("right", state.correct === index);
    zone.classList.toggle("wrong", state.correct !== null && state.correct !== index);
  });

  questionEl.textContent = question && state.phase !== "lobby" ? question.text : "";

  if (state.phase === "lobby") {
    statusEl.textContent = "You're in. Waiting for the host to start.";
    hint.textContent = "Keep this page open";
  } else if (player?.status === "waiting") {
    statusEl.textContent = "You join the next game";
    hint.textContent = "Watch the big screen";
  } else if (player?.status === "out") {
    statusEl.textContent = "Knocked out — cheer for the rest";
    hint.textContent = "You're back in the next game";
  } else if (state.phase === "question") {
    statusEl.textContent = myZone === null ? "Pick an answer" : "Locked in — you can still move";
    hint.textContent = "Drag your bean onto an answer";
  } else if (state.phase === "reveal") {
    const survived = player?.status === "alive";
    statusEl.textContent = survived ? "You survived" : "Wrong one";
    hint.textContent = "";
  } else if (state.phase === "over") {
    const winners = state.players.filter((p) => p.status === "alive");
    const iWon = winners.some((p) => p.pid === pid);
    statusEl.textContent = iWon ? "You win!" : `Winner: ${winners.map((p) => p.name).join(", ") || "nobody"}`;
  }

  me.classList.toggle("out", player?.status !== "alive");
  if (state.phase === "question" && myZone === null) centreBean();
  tickTimer();
}

function tickTimer() {
  if (!state) return;
  const total = state.phase === "question" ? 20000 : 6000;
  const left = state.deadline - (Date.now() + clockOffset);
  const ratio = state.deadline ? Math.max(0, Math.min(1, left / total)) : 0;
  timerFill.style.transform = `scaleX(${ratio})`;
  timerFill.parentElement.classList.toggle("low", ratio < 0.3);
}
setInterval(tickTimer, 100);

// ---- dragging ----

function centreBean() {
  const box = stage.getBoundingClientRect();
  place(box.width / 2, box.height / 2);
}

function place(x, y) {
  me.style.left = `${x}px`;
  me.style.top = `${y}px`;
}

// The big screen needs to know where the character is standing, but not 60 times a second.
function sendPosition(x, y, force = false) {
  const now = Date.now();
  if (!force && now - lastSent < 80) return;
  lastSent = now;
  const box = stage.getBoundingClientRect();
  socket?.send(
    JSON.stringify({
      type: "move",
      x: (x / box.width) * 2 - 1,
      y: (y / box.height) * 2 - 1,
    })
  );
}

let dragging = false;

function pointerMove(event) {
  if (!dragging) return;
  const box = stage.getBoundingClientRect();
  const x = Math.max(0, Math.min(box.width, event.clientX - box.left));
  const y = Math.max(0, Math.min(box.height, event.clientY - box.top));
  place(x, y);
  sendPosition(x, y);
}

function pointerUp(event) {
  if (!dragging) return;
  dragging = false;
  me.classList.remove("dragging");
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".zone");
  if (target) {
    const zone = Number(target.dataset.zone);
    myZone = zone;
    const box = target.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const x = box.left - stageBox.left + box.width / 2;
    const y = box.top - stageBox.top + box.height / 2;
    place(x, y);
    // Snap to the middle of the platform, so nobody is left teetering on the edge.
    sendPosition(x, y, true);
    render();
  } else {
    centreBean();
  }
}

me.addEventListener("pointerdown", (event) => {
  const player = myPlayer();
  if (state?.phase !== "question" || player?.status !== "alive") return;
  dragging = true;
  me.classList.add("dragging");
  me.setPointerCapture(event.pointerId);
  pointerMove(event);
});
me.addEventListener("pointermove", pointerMove);
me.addEventListener("pointerup", pointerUp);
me.addEventListener("pointercancel", pointerUp);

// Tapping a zone works too, for anyone who finds dragging fiddly.
zones.forEach((zone) => {
  zone.addEventListener("click", () => {
    const player = myPlayer();
    if (state?.phase !== "question" || player?.status !== "alive") return;
    myZone = Number(zone.dataset.zone);
    const box = zone.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const x = box.left - stageBox.left + box.width / 2;
    const y = box.top - stageBox.top + box.height / 2;
    place(x, y);
    sendPosition(x, y, true);
    render();
  });
});

el("changeBean").addEventListener("click", () => {
  color = (color + 1) % COLORS.length;
  store.set("beanColor", String(color));
  me.style.setProperty("--bean", COLORS[color]);
  waitBean.style.setProperty("--bean", COLORS[color]);
  socket?.send(JSON.stringify({ type: "join", pid, name: nameInput.value.trim() || "Bean", color }));
});

// Keep the tip and the timer fresh while people wait.
setInterval(() => state && renderWaiting(myPlayer()), 2000);
