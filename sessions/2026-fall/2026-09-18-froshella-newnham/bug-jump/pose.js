// Camera jump detection with MediaPipe Pose Landmarker.
// Everything loads from ./vendor, so it keeps working with no internet once cached.
import { FilesetResolver, PoseLandmarker } from "./vendor/mediapipe/vision_bundle.mjs";

const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14,
  L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24, NOSE = 0;
const BONES = [
  [L_SHOULDER, R_SHOULDER], [L_SHOULDER, L_ELBOW], [L_ELBOW, L_WRIST],
  [R_SHOULDER, R_ELBOW], [R_ELBOW, R_WRIST], [L_SHOULDER, L_HIP],
  [R_SHOULDER, R_HIP], [L_HIP, R_HIP],
];

export class JumpDetector {
  constructor({ video, overlay, onJump, onStatus }) {
    this.video = video;
    this.overlay = overlay;
    this.ctx = overlay.getContext("2d");
    this.onJump = onJump;
    this.onStatus = onStatus;
    this.sensitivity = 0.3; // rise needed, as a fraction of shoulder width
    this.baseline = null;
    this.inAir = false;
    this.airSince = 0;
    this.lastSeen = 0;
    this.lastVideoTime = -1;
    this.running = false;
  }

  async start() {
    this.onStatus("loading", "Starting camera");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser can't use the camera here. Open the game over https.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    this.onStatus("loading", "Loading pose model");
    const base = new URL("./vendor/mediapipe/", import.meta.url).href;
    const fileset = await FilesetResolver.forVisionTasks(base + "wasm");
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: base + "pose_landmarker_lite.task", delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, options("GPU"));
    } catch {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, options("CPU"));
    }
    this.running = true;
    this.onStatus("lost", "Step back so I can see your shoulders");
    this.loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  loop = () => {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const result = this.landmarker.detectForVideo(v, performance.now());
      this.handle(result.landmarks?.[0]);
    }
    requestAnimationFrame(this.loop);
  };

  handle(lm) {
    const now = performance.now();
    const { overlay, ctx } = this;
    if (overlay.width !== this.video.videoWidth) {
      overlay.width = this.video.videoWidth || 640;
      overlay.height = this.video.videoHeight || 480;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const visible = (i) => lm && lm[i] && (lm[i].visibility ?? 1) > 0.5;
    if (!visible(L_SHOULDER) || !visible(R_SHOULDER)) {
      if (now - this.lastSeen > 600) {
        this.baseline = null;
        this.inAir = false;
        this.onStatus("lost", "Step back so I can see your shoulders");
      }
      return;
    }
    this.lastSeen = now;

    const ls = lm[L_SHOULDER], rs = lm[R_SHOULDER];
    const y = (ls.y + rs.y) / 2;
    const width = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    const threshold = this.sensitivity * width;

    if (this.baseline === null) this.baseline = y;
    const rise = this.baseline - y; // image y grows downward, so rising is positive

    if (!this.inAir) {
      if (rise > threshold) {
        this.inAir = true;
        this.airSince = now;
        this.onJump();
      } else {
        // Follow slow drift, like someone stepping closer or further away.
        this.baseline += (y - this.baseline) * 0.12;
      }
    } else if (rise < threshold * 0.35 || now - this.airSince > 1500) {
      this.inAir = false;
      if (now - this.airSince > 1500) this.baseline = y;
    }
    this.onStatus("ready", this.inAir ? "Jump!" : "Ready. Jump to play");

    // Draw the skeleton and the line your shoulders need to cross.
    const W = overlay.width, H = overlay.height;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(6, W / 70);
    ctx.strokeStyle = this.inAir ? "#F9AB00" : "#34A853";
    for (const [a, b] of BONES) {
      if (!visible(a) || !visible(b)) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    }
    if (visible(NOSE)) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(lm[NOSE].x * W, lm[NOSE].y * H, W / 30, 0, Math.PI * 2);
      ctx.fill();
    }
    const lineY = (this.baseline - threshold) * H;
    ctx.setLineDash([W / 40, W / 60]);
    ctx.lineWidth = Math.max(3, W / 160);
    ctx.strokeStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(W, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
