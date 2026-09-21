// Everything that builds the stage: backdrop, platforms, beans, particles. arena.js drives it.
import * as THREE from "three";

export const COLORS = [0x4285f4, 0xea4335, 0xfbbc04, 0x34a853];
export const GAP = 0.12; // matches the server's dead zone
export const HALF = 5; // arena half-width in world units
export const BG = 0x070b18;

// A platform covers exactly the part of the arena the server credits to it: |x| in GAP..1,
// with a small lip past the edge so a bean standing at the very rim still has floor under it.
const LIP = 0.5;
export const PLATFORM_INNER = GAP * HALF;
export const PLATFORM_OUTER = HALF + LIP;
export const PLATFORM_CENTRE = (PLATFORM_INNER + PLATFORM_OUTER) / 2;
export const PLATFORM_WIDTH = PLATFORM_OUTER - PLATFORM_INNER;
export const PLATFORM_TOP = 0; // world y of the walking surface
const SLAB_HEIGHT = 0.7;
const BASE_HEIGHT = 1.1;

export const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
export const clamp01 = (t) => Math.max(0, Math.min(1, t));

function shade(hex, amount) {
  // amount < 1 darkens, > 1 lightens toward white
  const c = new THREE.Color(hex);
  if (amount <= 1) return c.multiplyScalar(amount);
  return c.lerp(new THREE.Color(0xffffff), amount - 1);
}

// ---------------------------------------------------------------- lights

export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0x9fbcff, 0x1a1030, 0.9));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(7, 18, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -13;
  sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 13;
  sun.shadow.camera.bottom = -13;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 45;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x4285f4, 0.9);
  rim.position.set(-8, 6, -10);
  scene.add(rim);
  return sun;
}

// ---------------------------------------------------------------- backdrop

function softDot(size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function makeBackdrop(scene) {
  const group = new THREE.Group();

  // Sky dome: a gradient that stays dark up top so the question text has a quiet background.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(70, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x05070f) },
        mid: { value: new THREE.Color(0x0f1633) },
        horizon: { value: new THREE.Color(0x24357a) },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vPos;
        void main(){
          float h = normalize(vPos).y;
          vec3 c = h < 0.0 ? mix(horizon, mid, clamp(-h * 2.5, 0.0, 1.0)) : mix(horizon, mid, smoothstep(0.0, 0.25, h));
          c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : c;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  group.add(sky);

  // A far floor with a faint grid: gives the drop somewhere to go and the fog something to eat.
  const gridCanvas = document.createElement("canvas");
  gridCanvas.width = gridCanvas.height = 256;
  const g = gridCanvas.getContext("2d");
  g.fillStyle = "#0b1226";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(120,150,255,0.09)";
  g.lineWidth = 2;
  g.strokeRect(1.5, 1.5, 253, 253);
  const gridTexture = new THREE.CanvasTexture(gridCanvas);
  gridTexture.wrapS = gridTexture.wrapT = THREE.RepeatWrapping;
  gridTexture.repeat.set(40, 40);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshBasicMaterial({ map: gridTexture, color: 0xffffff })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -16;
  group.add(floor);

  // Stars in the upper hemisphere.
  const starCount = 260;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(0.15 + Math.random() * 0.85);
    const r = 60;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ size: 1.1, map: softDot(), transparent: true, opacity: 0.7, depthWrite: false, fog: false })
  );
  group.add(stars);

  // Game-show light beams behind the stage, one per brand colour, bright at the lamp and
  // fading out toward the floor.
  const beamGeometry = new THREE.ConeGeometry(4.5, 30, 12, 1, true);
  const beams = COLORS.map((color, i) => {
    const beam = new THREE.Mesh(
      beamGeometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { color: { value: new THREE.Color(color) } },
        vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 color; varying float vY; void main(){ gl_FragColor = vec4(color, 0.22 * vY * vY); }`,
      })
    );
    beam.position.set(-16 + i * 10.5, 9, -24);
    beam.userData.phase = i * 1.3;
    group.add(beam);
    return beam;
  });

  // Floating low-poly shapes drifting around the edges, dim enough to stay background.
  const shapeGeometries = [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.OctahedronGeometry(1, 0),
    new THREE.TorusGeometry(0.8, 0.32, 6, 10),
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
  ];
  const shapes = [];
  // Behind and beside the stage only, never between the camera and the platforms.
  for (let i = 0; i < 14; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: shade(COLORS[i % 4], 0.42),
      roughness: 0.85,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(shapeGeometries[i % shapeGeometries.length], material);
    const side = i % 2 === 0 ? -1 : 1;
    const back = i % 3 === 0;
    const x = back ? side * (3 + (i * 5) % 17) : side * (15 + (i * 3) % 8);
    const z = back ? -14 - (i * 4) % 12 : -18 + (i * 5) % 12;
    mesh.position.set(x, -6 + (i * 7) % 15, z);
    mesh.scale.setScalar(0.45 + (i % 4) * 0.18);
    mesh.userData = { seed: i * 1.7, baseY: mesh.position.y };
    group.add(mesh);
    shapes.push(mesh);
  }

  scene.add(group);

  return {
    update(now) {
      for (const shape of shapes) {
        shape.rotation.x = now * 0.12 + shape.userData.seed;
        shape.rotation.y = now * 0.18 + shape.userData.seed;
        shape.position.y = shape.userData.baseY + Math.sin(now * 0.35 + shape.userData.seed) * 0.6;
      }
      beams.forEach((beam) => {
        beam.rotation.z = Math.sin(now * 0.25 + beam.userData.phase) * 0.28;
        beam.rotation.x = Math.cos(now * 0.19 + beam.userData.phase) * 0.12;
      });
      stars.rotation.y = now * 0.004;
    },
  };
}

// ---------------------------------------------------------------- platforms

function roundedSlab(width, height, depth, radius) {
  const shape = new THREE.Shape();
  const w = width / 2 - radius;
  const d = depth / 2 - radius;
  shape.moveTo(-w, -d - radius);
  shape.lineTo(w, -d - radius);
  shape.quadraticCurveTo(w + radius, -d - radius, w + radius, -d);
  shape.lineTo(w + radius, d);
  shape.quadraticCurveTo(w + radius, d + radius, w, d + radius);
  shape.lineTo(-w, d + radius);
  shape.quadraticCurveTo(-w - radius, d + radius, -w - radius, d);
  shape.lineTo(-w - radius, -d);
  shape.quadraticCurveTo(-w - radius, -d - radius, -w, -d - radius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.1,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geometry.rotateX(-Math.PI / 2); // extrude along y
  geometry.translate(0, -height - 0.1, 0); // the bevel adds 0.1 each end; top face lands at y = 0
  return geometry;
}

const slabGeometry = roundedSlab(PLATFORM_WIDTH, SLAB_HEIGHT, PLATFORM_WIDTH, 0.5);
const baseGeometry = roundedSlab(PLATFORM_WIDTH - 0.7, BASE_HEIGHT, PLATFORM_WIDTH - 0.7, 0.45);
const stripeGeometry = new THREE.PlaneGeometry(PLATFORM_WIDTH - 0.5, PLATFORM_WIDTH - 0.5);

export function makePlatform(index) {
  const color = COLORS[index];
  const group = new THREE.Group();

  const slab = new THREE.Mesh(
    slabGeometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: 0 })
  );
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);

  const base = new THREE.Mesh(
    baseGeometry,
    new THREE.MeshStandardMaterial({ color: shade(color, 0.45), roughness: 0.9 })
  );
  base.position.y = -SLAB_HEIGHT - 0.02;
  base.castShadow = true;
  group.add(base);

  // A soft lighter inset on top so the slab reads as a tile, not a block of colour.
  const inset = new THREE.Mesh(
    stripeGeometry,
    new THREE.MeshStandardMaterial({ color: shade(color, 1.18), roughness: 0.6 })
  );
  inset.rotation.x = -Math.PI / 2;
  inset.position.y = 0.012;
  inset.receiveShadow = true;
  group.add(inset);

  group.position.set(
    (index % 2 === 0 ? -1 : 1) * PLATFORM_CENTRE,
    PLATFORM_TOP,
    (index < 2 ? -1 : 1) * PLATFORM_CENTRE
  );
  // Wrong platforms tip outward, away from the middle, before they fall.
  const tiltAxis = new THREE.Vector3(index < 2 ? -1 : 1, 0, index % 2 === 0 ? 1 : -1).normalize();
  group.userData = {
    slab, base, inset, tiltAxis, radius: PLATFORM_WIDTH / 2,
    dropAt: null, riseAt: null, popAt: null, wobbleFrom: null, puffed: false, wobbleSeed: index * 2.1,
  };
  return group;
}

// Neutral floors: the walkway cross between platforms, the front dock where the crowd waits and
// the side docks where knocked-out beans watch from. Same userData shape as a platform, so the
// walkway can drop and rise with the same code.
const dockMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2340, roughness: 0.85 });
const dockTopMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3358, roughness: 0.7 });

function dockSlab(width, depth) {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(roundedSlab(width, 0.9, depth, 0.35), dockMaterial);
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.5, depth - 0.5), dockTopMaterial);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.012;
  top.receiveShadow = true;
  group.add(top);
  return { group, slab };
}

export function makeDock(kind) {
  const group = new THREE.Group();
  const span = PLATFORM_OUTER * 2 + 0.6;
  const parts = [];
  if (kind === "walkway") {
    const a = dockSlab(PLATFORM_INNER * 2 - 0.1, span + 1.4);
    a.group.position.z = 0.7;
    const b = dockSlab(span, PLATFORM_INNER * 2 - 0.1);
    group.add(a.group, b.group);
    parts.push(a.slab, b.slab);
  } else if (kind === "front") {
    const a = dockSlab(14, 3.6);
    a.group.position.z = PLATFORM_OUTER + 2.5;
    group.add(a.group);
    parts.push(a.slab);
  } else {
    const a = dockSlab(2.6, 10.4);
    a.group.position.x = (kind === "left" ? -1 : 1) * (PLATFORM_OUTER + 2.25);
    group.add(a.group);
    parts.push(a.slab);
  }
  group.userData = {
    slab: parts[0], tiltAxis: new THREE.Vector3(1, 0, 0), radius: 3,
    dropAt: null, riseAt: null, popAt: null, wobbleFrom: null, puffed: false, wobbleSeed: 9,
  };
  return group;
}

// Answer text as a canvas texture, cached by string so re-renders cost nothing.
const labelCache = new Map();

function labelTexture(text) {
  let texture = labelCache.get(text);
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  ctx.font = "900 190px ui-rounded, 'SF Pro Rounded', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 24;
  ctx.lineJoin = "round";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fit = Math.min(1, 940 / ctx.measureText(text).width);
  ctx.setTransform(fit, 0, 0, 1, canvas.width / 2, canvas.height / 2);
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  labelCache.set(text, texture);
  return texture;
}

const labelGeometry = new THREE.PlaneGeometry(PLATFORM_WIDTH - 0.4, (PLATFORM_WIDTH - 0.4) * (320 / 1024));

export function makeAnswerLabel() {
  const mesh = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  // Sits on the near edge of the slab, clear of the inset so it never z-fights.
  mesh.position.set(0, 0.08, PLATFORM_WIDTH / 2 - 0.95);
  mesh.visible = false;
  return mesh;
}

export function setAnswerLabel(mesh, text) {
  if (mesh.userData.text === text) return;
  mesh.userData.text = text;
  mesh.material.map = text ? labelTexture(text) : null;
  mesh.material.needsUpdate = true;
  mesh.visible = Boolean(text);
}

// ---------------------------------------------------------------- beans

// An egg-ish profile, fatter at the bottom, drawn once and shared.
const bodyProfile = new THREE.SplineCurve([
  new THREE.Vector2(0, 0),
  new THREE.Vector2(0.3, 0.02),
  new THREE.Vector2(0.46, 0.25),
  new THREE.Vector2(0.47, 0.55),
  new THREE.Vector2(0.38, 0.9),
  new THREE.Vector2(0.2, 1.1),
  new THREE.Vector2(0, 1.16),
]).getPoints(18);
export const BEAN_HEIGHT = 1.16;

const geo = {
  body: new THREE.LatheGeometry(bodyProfile, 28),
  eye: new THREE.SphereGeometry(0.135, 16, 12),
  pupil: new THREE.SphereGeometry(0.065, 12, 10),
  glint: new THREE.SphereGeometry(0.022, 8, 6),
  mouth: new THREE.TorusGeometry(0.09, 0.028, 6, 14, Math.PI),
  foot: new THREE.SphereGeometry(0.17, 12, 8),
  arm: new THREE.CapsuleGeometry(0.075, 0.22, 4, 8),
  stem: new THREE.CylinderGeometry(0.025, 0.035, 0.26, 6),
  leaf: new THREE.SphereGeometry(0.11, 10, 6),
};

const mat = {
  eye: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  pupil: new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4 }),
  glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x34a853, roughness: 0.7 }),
  stem: new THREE.MeshStandardMaterial({ color: 0x2b7a3d, roughness: 0.8 }),
  body: COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 })),
  dark: COLORS.map((c) => new THREE.MeshStandardMaterial({ color: shade(c, 0.5), roughness: 0.7 })),
  benchBody: new THREE.MeshStandardMaterial({ color: 0x5c6273, roughness: 0.6 }),
  benchDark: new THREE.MeshStandardMaterial({ color: 0x2e3240, roughness: 0.8 }),
};

const tagCache = new Map();

function tagTexture(name, colorIndex) {
  const key = `${colorIndex}:${name}`;
  let texture = tagCache.get(key);
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "800 62px ui-rounded, 'SF Pro Rounded', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const textWidth = Math.min(400, ctx.measureText(name).width);
  const padX = 34;
  const w = textWidth + padX * 2 + 44;
  const x = (512 - w) / 2;
  ctx.fillStyle = "rgba(8,10,20,0.82)";
  ctx.beginPath();
  ctx.roundRect(x, 18, w, 92, 46);
  ctx.fill();
  ctx.fillStyle = "#" + new THREE.Color(COLORS[colorIndex]).getHexString();
  ctx.beginPath();
  ctx.arc(x + padX + 4, 64, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const fit = Math.min(1, 400 / ctx.measureText(name).width);
  ctx.setTransform(fit, 0, 0, 1, x + padX + 40, 66);
  ctx.fillText(name, 0, 0);
  texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  tagCache.set(key, texture);
  return texture;
}

export function makeBean(colorIndex, name) {
  const group = new THREE.Group();
  const rig = new THREE.Group(); // squash/stretch and lean happen here, position on the group
  group.add(rig);

  const body = new THREE.Mesh(geo.body, mat.body[colorIndex]);
  body.castShadow = true;
  rig.add(body);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(geo.eye, mat.eye);
    eye.position.set(side * 0.17, 0.74, 0.34);
    eye.scale.set(1, 1.25, 0.55);
    rig.add(eye);
    const pupil = new THREE.Mesh(geo.pupil, mat.pupil);
    pupil.position.set(side * 0.16, 0.74, 0.43);
    rig.add(pupil);
    const glint = new THREE.Mesh(geo.glint, mat.glint);
    glint.position.set(side * 0.14, 0.79, 0.48);
    rig.add(glint);
    eyes.push(eye, pupil, glint);
  }

  const mouth = new THREE.Mesh(geo.mouth, mat.pupil);
  mouth.position.set(0, 0.55, 0.44);
  mouth.rotation.set(0.2, 0, Math.PI);
  rig.add(mouth);

  const feet = [-1, 1].map((side) => {
    const foot = new THREE.Mesh(geo.foot, mat.dark[colorIndex]);
    foot.position.set(side * 0.2, 0.05, 0.06);
    foot.scale.set(1, 0.55, 1.25);
    foot.castShadow = true;
    rig.add(foot);
    return foot;
  });

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.42, 0.62, 0);
    const arm = new THREE.Mesh(geo.arm, mat.dark[colorIndex]);
    arm.position.y = -0.15;
    arm.rotation.z = side * 0.35;
    pivot.add(arm);
    rig.add(pivot);
    return pivot;
  });

  const stem = new THREE.Mesh(geo.stem, mat.stem);
  stem.position.set(0, BEAN_HEIGHT + 0.1, 0);
  stem.rotation.z = 0.25;
  rig.add(stem);
  const leaf = new THREE.Mesh(geo.leaf, mat.leaf);
  leaf.position.set(0.09, BEAN_HEIGHT + 0.25, 0);
  leaf.scale.set(1.4, 0.55, 0.8);
  leaf.rotation.z = 0.5;
  rig.add(leaf);

  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(name, colorIndex), depthWrite: false }));
  tag.scale.set(2.0, 0.5, 1);
  tag.position.y = BEAN_HEIGHT + 0.85;
  group.add(tag);

  return {
    group,
    rig,
    body,
    eyes,
    feet,
    arms,
    tag,
    colorIndex,
    parts: { body, feet, arms: arms.map((p) => p.children[0]) },
    target: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    mode: "stand", // stand | fall | bench
    hop: Math.random() * 6,
    breath: Math.random() * 6,
    blinkAt: 1 + Math.random() * 3,
    blinkT: 0,
    landT: 1,
    wasRunning: false,
    fallAt: null,
    vy: 0,
    spin: new THREE.Vector3(),
    cheer: false,
  };
}

export function setBenched(bean, benched) {
  bean.parts.body.material = benched ? mat.benchBody : mat.body[bean.colorIndex];
  const dark = benched ? mat.benchDark : mat.dark[bean.colorIndex];
  for (const foot of bean.parts.feet) foot.material = dark;
  for (const arm of bean.parts.arms) arm.material = dark;
  bean.tag.material.opacity = benched ? 0.55 : 1;
}


// Everything that happens on the rig each frame: facing, squash and stretch, feet, arms, blink.
// `speed` is the horizontal speed; the group's position is handled by the caller.
const yAxis = new THREE.Vector3(0, 1, 0);

export function animateRig(bean, t, dt, speed, tmpQuat) {
  const g = bean.group;
  const v = bean.velocity;
  // Face the way we're going.
  const run = clamp01((speed - 0.4) / 2.5);
  if (speed > 0.5) {
    tmpQuat.setFromAxisAngle(yAxis, Math.atan2(v.x, v.z));
    g.quaternion.slerp(tmpQuat, 1 - Math.exp(-dt * 12));
  }

  // Squash and stretch: stretched in the air, squashed on contact, breathing at rest.
  bean.hop += dt * (run > 0 ? 7 + speed * 1.5 : 2.2);
  const s = Math.sin(bean.hop);
  let stretch = 1 + (Math.abs(s) - 0.5) * 0.24 * run;
  let lift = Math.abs(s) * 0.18 * run;
  stretch += Math.sin(t * 2.6 + bean.breath) * 0.02 * (1 - run);
  if (bean.cheer) {
    const j = Math.sin(t * 9 + bean.breath);
    lift += Math.max(0, j) * 0.5;
    stretch += j * 0.12;
  }
  if (bean.landT < 1) {
    bean.landT = Math.min(1, bean.landT + dt / 0.45);
    stretch *= 1 - 0.32 * Math.sin(Math.PI * bean.landT) * (1 - bean.landT * 0.6);
  }
  const rig = bean.rig;
  rig.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  rig.position.y = lift;
  rig.rotation.x = run * 0.2;
  rig.rotation.z = Math.sin(t * 2.6 + bean.breath) * 0.02;

  bean.feet[0].position.y = 0.05 + Math.max(0, s) * 0.16 * run;
  bean.feet[1].position.y = 0.05 + Math.max(0, -s) * 0.16 * run;
  bean.feet[0].position.z = 0.06 + s * 0.12 * run;
  bean.feet[1].position.z = 0.06 - s * 0.12 * run;
  if (bean.cheer) {
    bean.arms[0].rotation.z = -2.4 + Math.sin(t * 9 + bean.breath) * 0.3;
    bean.arms[1].rotation.z = 2.4 - Math.sin(t * 9 + bean.breath) * 0.3;
    bean.arms[0].rotation.x = bean.arms[1].rotation.x = 0;
  } else {
    bean.arms[0].rotation.x = -s * 0.9 * run;
    bean.arms[1].rotation.x = s * 0.9 * run;
    bean.arms[0].rotation.z = bean.arms[1].rotation.z = 0;
  }

  // Blink now and then.
  bean.blinkAt -= dt;
  if (bean.blinkAt < 0) {
    bean.blinkAt = 2 + Math.random() * 4;
    bean.blinkT = 0.13;
  }
  const closed = bean.blinkT > 0;
  if (closed) bean.blinkT -= dt;
  for (let i = 0; i < bean.eyes.length; i++) {
    const base = i % 3 === 0 ? 1.25 : 1;
    bean.eyes[i].scale.y = closed ? base * 0.12 : base;
  }

  bean.tag.position.y = BEAN_HEIGHT + 0.85 + lift;
}

// ---------------------------------------------------------------- particles

// Dust puffs are pooled sprites; confetti is one instanced mesh. Both are cheap enough to
// leave in the scene permanently.
export function makePuffs(scene, count = 120) {
  const material = new THREE.SpriteMaterial({ map: softDot(), transparent: true, depthWrite: false, opacity: 0 });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(material.clone());
    sprite.visible = false;
    scene.add(sprite);
    pool.push({ sprite, life: 0, ttl: 1, velocity: new THREE.Vector3() });
  }
  let cursor = 0;
  return {
    burst(position, radius, amount = 18, color = 0xb9c4e6) {
      for (let i = 0; i < amount; i++) {
        const p = pool[cursor];
        cursor = (cursor + 1) % pool.length;
        const angle = Math.random() * Math.PI * 2;
        const r = radius * (0.6 + Math.random() * 0.5);
        p.sprite.position.set(position.x + Math.cos(angle) * r, position.y + 0.2, position.z + Math.sin(angle) * r);
        p.velocity.set(Math.cos(angle) * (1.5 + Math.random() * 2), 1.2 + Math.random() * 1.5, Math.sin(angle) * (1.5 + Math.random() * 2));
        p.life = 0;
        p.ttl = 0.7 + Math.random() * 0.6;
        p.sprite.material.color.set(color);
        p.sprite.scale.setScalar(0.5 + Math.random() * 0.5);
        p.sprite.visible = true;
      }
    },
    update(dt) {
      for (const p of pool) {
        if (!p.sprite.visible) continue;
        p.life += dt;
        const t = p.life / p.ttl;
        if (t >= 1) {
          p.sprite.visible = false;
          continue;
        }
        p.velocity.multiplyScalar(1 - dt * 2.5);
        p.velocity.y += dt * 0.8;
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.sprite.scale.addScalar(dt * 2.2);
        p.sprite.material.opacity = 0.55 * (1 - t) ** 1.5;
      }
    },
  };
}

export function makeConfetti(scene, count = 220) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.22, 0.14),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    count
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, color.setHex(i % 5 === 4 ? 0xffffff : COLORS[i % 4]));
  scene.add(mesh);

  const pieces = Array.from({ length: count }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    spin: new THREE.Vector3(),
    life: 0,
  }));
  const dummy = new THREE.Object3D();
  let active = false;

  return {
    burst(origin) {
      active = true;
      mesh.visible = true;
      for (const piece of pieces) {
        piece.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
        piece.velocity.set((Math.random() - 0.5) * 9, 7 + Math.random() * 9, (Math.random() - 0.5) * 9);
        piece.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
        piece.rotation.set(Math.random() * 6, Math.random() * 6, 0);
        piece.life = 3.2 + Math.random() * 1.2;
      }
    },
    update(dt) {
      if (!active) return;
      let alive = 0;
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        if (piece.life > 0) {
          piece.life -= dt;
          piece.velocity.y -= dt * 9;
          piece.velocity.multiplyScalar(1 - dt * 1.6);
          piece.position.addScaledVector(piece.velocity, dt);
          piece.rotation.x += piece.spin.x * dt;
          piece.rotation.y += piece.spin.y * dt;
          alive += 1;
          dummy.position.copy(piece.position);
          dummy.rotation.copy(piece.rotation);
          dummy.scale.setScalar(piece.life < 0.5 ? piece.life * 2 : 1);
        } else {
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (!alive) {
        active = false;
        mesh.visible = false;
      }
    },
  };
}
