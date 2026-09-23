// Bean Bash room server: one Durable Object per room, WebSockets for screen and phones.
import QUESTIONS from "./questions.json";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
const QUESTION_SECONDS = 20;
const GAP = 0.12; // dead zone in the middle of the arena, where no answer counts
const REVEAL_SECONDS = 6;
const BEAN_COLORS = 8; // must match BEAN_COLORS on the phone and the arena
const WIN_BONUS = 500; // for the last beans standing
// A locked phone or a reload drops the connection for a few seconds. Only someone
// who stays gone this long has actually left.
const LEAVE_GRACE_MS = 30000;

function randomCode(n = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/new") {
      return json({ code: randomCode(), hostKey: crypto.randomUUID() });
    }

    if (url.pathname === "/api/ws") {
      const code = (url.searchParams.get("code") || "").toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) return json({ error: "bad room code" }, 400);
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set(); // { ws, role, pid }
    this.players = new Map(); // pid -> { pid, name, color, status, zone, score, total }
    this.leaveTimers = new Map(); // pid -> timeout that removes a player who went quiet
    this.departed = new Map(); // pid -> { total }, so tonight's points survive a walk-out
    this.hostKey = null;
    this.phase = "lobby"; // lobby | question | reveal | over
    this.qIndex = -1;
    this.deadline = 0;
    this.timer = null;
    this.questions = [];
  }

  fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const role = url.searchParams.get("role") === "screen" ? "screen" : "player";
    const hostKey = url.searchParams.get("hostKey") || null;
    if (role === "screen") {
      if (!hostKey) return new Response("host key required", { status: 403 });
      if (this.hostKey === null) this.hostKey = hostKey;
      if (this.hostKey !== hostKey) return new Response("wrong host key", { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const conn = { ws: server, role, pid: null };
    this.sockets.add(conn);

    server.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.onMessage(conn, msg);
    });
    const drop = () => {
      if (!this.sockets.delete(conn)) return; // "close" and "error" can both fire
      if (conn.pid) this.scheduleLeave(conn.pid);
      this.broadcast();
    };
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    this.send(conn, this.stateMessage());
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(conn, msg) {
    if (conn.role === "player") {
      if (msg.type === "join") return this.join(conn, msg);
      if (msg.type === "move") return this.move(conn, msg);
      if (msg.type === "leave") return this.leave(conn);
      return;
    }

    // Host commands come from the screen only.
    if (msg.type === "start") return this.startGame();
    if (msg.type === "next") return this.nextQuestion();
    if (msg.type === "revive") return this.revive();
    if (msg.type === "reset") return this.reset();
  }

  join(conn, msg) {
    const pid = String(msg.pid || "").slice(0, 64);
    if (!pid) return;
    const wanted = String(msg.name || "").replace(/\s+/g, " ").trim().slice(0, 14);
    if (!wanted) return; // the phone asks for a name first; never invent one
    const color = Math.abs(Math.floor(Number(msg.color) || 0)) % BEAN_COLORS;
    clearTimeout(this.leaveTimers.get(pid));
    this.leaveTimers.delete(pid);
    const existing = this.players.get(pid);
    const name = this.uniqueName(wanted, pid);
    if (existing) {
      existing.name = name;
      existing.color = color;
    } else {
      // Someone arriving mid-game waits for the next game.
      const status = this.phase === "lobby" ? "alive" : "waiting";
      const total = this.departed.get(pid)?.total || 0;
      this.departed.delete(pid);
      this.players.set(pid, {
        pid, name, color, status, zone: null, zoneAt: 0, pos: null,
        score: 0, total, gained: 0,
      });
    }
    conn.pid = pid;
    this.broadcast();
  }

  // The phone's "Leave game" button: gone straight away, no grace period.
  leave(conn) {
    const pid = conn.pid;
    if (!pid) return;
    conn.pid = null;
    this.removePlayer(pid);
  }

  isConnected(pid) {
    for (const conn of this.sockets) if (conn.pid === pid) return true;
    return false;
  }

  scheduleLeave(pid) {
    if (this.isConnected(pid)) return; // another tab of the same phone is still open
    clearTimeout(this.leaveTimers.get(pid));
    this.leaveTimers.set(
      pid,
      setTimeout(() => {
        this.leaveTimers.delete(pid);
        if (!this.isConnected(pid)) this.removePlayer(pid);
      }, LEAVE_GRACE_MS)
    );
  }

  removePlayer(pid, { quiet = false } = {}) {
    clearTimeout(this.leaveTimers.get(pid));
    this.leaveTimers.delete(pid);
    const player = this.players.get(pid);
    if (!player) return;
    if (player.total > 0) this.departed.set(pid, { total: player.total });
    this.players.delete(pid);
    if (!quiet) this.broadcast();
  }

  // Two people called Sam would never find their bean, so the second one becomes "Sam 2".
  uniqueName(wanted, pid) {
    const taken = new Set(
      [...this.players.values()].filter((p) => p.pid !== pid).map((p) => p.name.toLowerCase())
    );
    if (!taken.has(wanted.toLowerCase())) return wanted;
    for (let n = 2; ; n++) {
      const candidate = `${wanted.slice(0, 11)} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  // Remember when a player last changed platform: answering early is worth more.
  setZone(player, zone) {
    if (zone !== player.zone) player.zoneAt = Date.now();
    player.zone = zone;
  }

  // A phone sends where its character is standing; the platform under it is the answer.
  move(conn, msg) {
    if (this.phase !== "question") return;
    const player = this.players.get(conn.pid);
    if (!player || player.status !== "alive") return;
    const x = clamp(Number(msg.x));
    const y = clamp(Number(msg.y));
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    player.pos = { x, y };
    this.setZone(player, zoneFromPosition(x, y));
    this.pumpPositions();
  }

  // Positions go out to the screens on their own, 10 times a second, so dragging looks smooth
  // without sending the whole game state every time.
  pumpPositions() {
    if (this.posTimer) return;
    this.posTimer = setTimeout(() => {
      this.posTimer = null;
      if (this.phase !== "question") return;
      const message = JSON.stringify({
        type: "positions",
        list: [...this.players.values()]
          .filter((p) => p.pos && p.status === "alive")
          .map((p) => ({ pid: p.pid, x: p.pos.x, y: p.pos.y })),
      });
      for (const conn of this.sockets) {
        if (conn.role !== "screen") continue;
        try {
          conn.ws.send(message);
        } catch {
          this.sockets.delete(conn);
        }
      }
    }, 100);
  }

  startGame() {
    this.questions = shuffle([...QUESTIONS]);
    this.qIndex = -1;
    for (const p of this.players.values()) {
      p.status = "alive";
      p.zone = null;
      p.pos = null;
      p.score = 0;
      p.gained = 0;
    }
    this.nextQuestion();
  }

  nextQuestion() {
    if (this.phase === "over" && this.qIndex >= 0) return this.startGame();
    const alive = [...this.players.values()].filter((p) => p.status === "alive");
    if (this.qIndex >= 0 && (alive.length <= 1 || this.qIndex >= this.questions.length - 1)) {
      return this.finish();
    }
    if (!this.questions.length) this.questions = shuffle([...QUESTIONS]);

    this.qIndex += 1;
    this.phase = "question";
    for (const p of this.players.values()) {
      p.zone = null;
      p.pos = null;
      p.gained = 0;
    }
    this.questionStartedAt = Date.now();
    this.deadline = Date.now() + QUESTION_SECONDS * 1000;
    this.setTimer(() => this.lockIn(), QUESTION_SECONDS * 1000);
    this.broadcast();
  }

  lockIn() {
    if (this.phase !== "question") return;
    const question = this.questions[this.qIndex];
    const answerWindow = QUESTION_SECONDS * 1000;
    for (const p of this.players.values()) {
      p.gained = 0;
      if (p.status !== "alive") continue;
      if (p.zone !== question.correct) {
        p.status = "out";
        continue;
      }
      // Kahoot-style: 500 for being right, up to 500 more for getting there early.
      const early = Math.max(0, Math.min(1, (this.deadline - p.zoneAt) / answerWindow));
      p.gained = 500 + Math.round(500 * early);
      p.score += p.gained;
      p.total += p.gained;
    }
    this.phase = "reveal";
    this.deadline = Date.now() + REVEAL_SECONDS * 1000;
    this.setTimer(() => this.afterReveal(), REVEAL_SECONDS * 1000);
    this.broadcast();
  }

  afterReveal() {
    if (this.phase !== "reveal") return;
    const alive = [...this.players.values()].filter((p) => p.status === "alive");
    if (alive.length <= 1 || this.qIndex >= this.questions.length - 1) return this.finish();
    this.nextQuestion();
  }

  finish() {
    this.setTimer(null);
    if (this.phase !== "over") {
      for (const p of this.players.values()) {
        p.gained = 0;
        if (p.status !== "alive" || this.qIndex < 0) continue;
        p.gained = WIN_BONUS;
        p.score += WIN_BONUS;
        p.total += WIN_BONUS;
      }
    }
    this.phase = "over";
    this.deadline = 0;
    this.broadcast();
  }

  revive() {
    for (const p of this.players.values()) {
      p.status = "alive";
      p.zone = null;
    }
    this.broadcast();
  }

  reset() {
    this.setTimer(null);
    this.phase = "lobby";
    this.qIndex = -1;
    this.deadline = 0;
    // A fresh lobby is the moment to clear out anyone who already left, without waiting
    // for their grace period to run out.
    for (const pid of [...this.players.keys()]) {
      if (!this.isConnected(pid)) this.removePlayer(pid, { quiet: true });
    }
    for (const p of this.players.values()) {
      p.status = "alive";
      p.zone = null;
    }
    this.broadcast();
  }

  setTimer(fn, ms) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = fn ? setTimeout(fn, ms) : null;
  }

  stateMessage() {
    const question = this.qIndex >= 0 ? this.questions[this.qIndex] : null;
    const reveal = this.phase === "reveal" || this.phase === "over";
    return {
      type: "state",
      phase: this.phase,
      questionNumber: this.qIndex + 1,
      questionCount: this.questions.length,
      deadline: this.deadline,
      serverNow: Date.now(),
      question: question ? { text: question.text, answers: question.answers } : null,
      // The correct answer stays on the server until the reveal.
      correct: reveal && question ? question.correct : null,
      players: [...this.players.values()].map((p) => ({
        pid: p.pid,
        name: p.name,
        color: p.color,
        status: p.status,
        // Nobody sees other people's picks while the question is running.
        zone: reveal ? p.zone : null,
        pos: p.pos,
        locked: p.zone !== null,
        score: p.score,
        total: p.total,
        gained: p.gained,
        // Connection dropped but still inside the grace period.
        away: !this.isConnected(p.pid),
      })),
    };
  }

  send(conn, message) {
    try {
      conn.ws.send(JSON.stringify(message));
    } catch {
      this.sockets.delete(conn);
    }
  }

  broadcast() {
    const message = this.stateMessage();
    for (const conn of this.sockets) {
      // A phone also needs to know which player it is.
      this.send(conn, conn.pid ? { ...message, you: conn.pid } : message);
    }
  }
}

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function zoneFromPosition(x, y) {
  // Standing in the middle gap counts as no answer at all.
  if (Math.abs(x) < GAP || Math.abs(y) < GAP) return null;
  return (y > 0 ? 2 : 0) + (x > 0 ? 1 : 0);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
