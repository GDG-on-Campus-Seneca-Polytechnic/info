// Big screen: shows the QR to join, the question, and every bean.
const COLORS = ["var(--blue)", "var(--red)", "var(--yellow)", "var(--green)", "var(--purple)", "var(--pink)", "var(--teal)", "var(--orange)"];
const el = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
let room = (params.get("room") || "").toUpperCase();
let hostKey = params.get("host") || "";
let state = null;
let socket = null;
let clockOffset = 0;

const zonePanels = [...document.querySelectorAll("#zones .zone")];
const timerFill = el("timer").firstElementChild;

start();

async function start() {
  if (!room || !hostKey) {
    const created = await fetch("/api/new").then((r) => r.json());
    room = created.code;
    hostKey = created.hostKey;
    // Keep the room in the URL so a reload does not start a new one.
    history.replaceState(null, "", `?room=${room}&host=${hostKey}`);
  }

  const joinUrl = `${location.origin}/?room=${room}`;
  el("code").textContent = room;
  el("roomPill").textContent = `Room ${room}`;
  el("joinUrl").textContent = joinUrl.replace(/^https?:\/\//, "");
  drawQr(joinUrl);
  connect();
}

function drawQr(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  el("qr").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}

function connect() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}/api/ws?role=screen&code=${room}&hostKey=${hostKey}`);
  socket.addEventListener("message", (event) => {
    state = JSON.parse(event.data);
    clockOffset = state.serverNow - Date.now();
    render();
  });
  socket.addEventListener("close", () => setTimeout(connect, 1200));
}

function send(type) {
  socket?.send(JSON.stringify({ type }));
}

document.querySelectorAll("footer button").forEach((button) => {
  button.addEventListener("click", () => send(button.dataset.cmd));
});

document.addEventListener("keydown", (event) => {
  const keys = { s: "start", n: "next", r: "revive", escape: "reset", " ": "next" };
  const cmd = keys[event.key.toLowerCase()];
  if (cmd) {
    event.preventDefault();
    send(cmd);
  }
});

function beanTag(player) {
  const wrap = document.createElement("div");
  wrap.className = "beanTag" + (player.status === "out" ? " out" : "");
  const bean = document.createElement("div");
  bean.className = "bean" + (player.status === "alive" ? "" : " out");
  bean.style.setProperty("--bean", COLORS[player.color] || COLORS[0]);
  bean.style.setProperty("--size", "44px");
  const name = document.createElement("span");
  name.textContent = player.name;
  wrap.append(bean, name);
  return wrap;
}

function render() {
  if (!state) return;
  const playing = state.phase === "question" || state.phase === "reveal";
  const alive = state.players.filter((p) => p.status === "alive");

  el("counter").textContent = `${state.players.length} player${state.players.length === 1 ? "" : "s"}`;
  el("alive").textContent = playing ? `${alive.length} still in` : "";

  el("joinPanel").classList.toggle("hidden", playing || state.phase === "over");
  el("playPanel").classList.toggle("hidden", !playing);
  el("overPanel").classList.toggle("hidden", state.phase !== "over");

  if (state.phase === "lobby") {
    const lobby = el("lobbyBeans");
    lobby.replaceChildren(...state.players.map(beanTag));
  }

  if (playing) {
    el("question").textContent = state.question.text;
    const locked = state.players.filter((p) => p.status === "alive" && p.locked).length;
    zonePanels.forEach((panel, index) => {
      panel.querySelector("b").textContent = state.question.answers[index];
      panel.classList.toggle("right", state.correct === index);
      panel.classList.toggle("wrong", state.correct !== null && state.correct !== index);
      const beans = state.correct === null ? [] : state.players.filter((p) => p.zone === index);
      panel.querySelector(".beans").replaceChildren(...beans.map(beanTag));
    });
    if (state.correct === null) el("alive").textContent = `${locked} of ${alive.length} locked in`;
  }

  if (state.phase === "over") {
    el("winners").textContent = alive.length ? (alive.length === 1 ? "Winner!" : "Winners!") : "Nobody survived";
    el("winnerBeans").replaceChildren(...alive.map(beanTag));
  }

  tick();
}

function tick() {
  if (!state) return;
  const total = state.phase === "question" ? 20000 : 6000;
  const left = state.deadline - (Date.now() + clockOffset);
  const ratio = state.deadline ? Math.max(0, Math.min(1, left / total)) : 0;
  timerFill.style.transform = `scaleX(${ratio})`;
  timerFill.parentElement.classList.toggle("low", ratio < 0.3);
}
setInterval(tick, 100);
