import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Device } from './device.js';
import { Emulator } from './emu.js';
import { BODY, FOOT, KNOB_H, S, ENCS, PIANO, PIANO_BASE, KEY_BUTTONS, KEY_ENCS, THEMES } from './layout.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem('fm1-3d.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fm1-3d.' + k, v); } catch { /* private window */ } },
};

// ---------------------------------------------------------------- scene
const canvas = $('view'), stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

const sun = new THREE.DirectionalLight(0xfff4e6, 2.1);
sun.position.set(-5.5, 12, -4.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 30 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.012;
sun.shadow.radius = 5;
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.2));

const device = new Device();
scene.add(device.group);

// the backdrop: a sheet of felt the synth sits on
const felt = new THREE.MeshStandardMaterial({ roughness: 1, bumpMap: device.grain.clone(), bumpScale: 0.6 });
felt.bumpMap.repeat.set(1400, 1400);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), felt);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -BODY.thick - FOOT;
floor.receiveShadow = true;
scene.add(floor);

function setTheme(name) {
  if (!THEMES[name]) name = 'black';
  device.setTheme(name);
  felt.color.set(THEMES[name].backdrop);
  scene.background = new THREE.Color(THEMES[name].backdrop).multiplyScalar(0.92);
  store.set('theme', name);
  for (const b of $('swatches').children) b.classList.toggle('on', b.dataset.theme === name);
}

// ---------------------------------------------------------------- camera
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 3;
controls.maxDistance = 40;
controls.zoomSpeed = 0.6;

const DW = BODY.w * S, DH = BODY.h * S;
// A view: where to look, from which direction, and the width / height that must fit.
const VIEWS = {
  overview: { dir: [0, 0.88, 0.6], target: [0, -0.3, 0.3], w: DW + 2.2, h: DH + 0.4 },
  top: { dir: [0, 1, 0.0015], target: [0, 0, 0], w: DW + 1.2, h: DH + 1.2 },
  screen: { dir: [0, 0.94, 0.34], target: [device.lcdCentre.x, 0, device.lcdCentre.z + 0.1], w: 4.6, h: 3.9 },
  keys: { dir: [0, 0.8, 0.6], target: [0, 0, 1.75], w: DW + 0.6, h: 3.6 },
  rear: { dir: [-0.28, 0.42, -1], target: [0, -0.6, -2.6], w: DW + 1.4, h: 3.4 },
  bottom: { dir: [0, 1, 0.42], target: [0, -0.5, 0], w: DW + 1.6, h: DH + 1, flip: true },
};
let flight = null, currentView = 'overview';
// turned over to show its base: 0 upright .. 1 on its back, resting on the knobs
let flip = 0, flipTo = 0;
const FLIP_Y = -(BODY.thick + FOOT) + KNOB_H + 0.02;
function viewPose(name) {
  const v = VIEWS[name], half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(v.h / (2 * half), v.w / (2 * half * camera.aspect));
  const target = new THREE.Vector3(...v.target);
  return { target, position: new THREE.Vector3(...v.dir).normalize().multiplyScalar(dist).add(target) };
}
function goTo(name, instant = false) {
  currentView = name;
  flipTo = VIEWS[name].flip ? 1 : 0;
  for (const b of $('views').children) b.classList.toggle('on', b.dataset.view === name);
  const to = viewPose(name);
  if (instant) {
    camera.position.copy(to.position);
    controls.target.copy(to.target);
    controls.update();
    return;
  }
  flight = { t: 0, from: { position: camera.position.clone(), target: controls.target.clone() }, to };
}
$('views').addEventListener('click', (e) => { if (e.target.dataset.view) goTo(e.target.dataset.view); });
controls.addEventListener('start', () => {
  flight = null;
  currentView = null;
  for (const b of $('views').children) b.classList.remove('on');
});

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (currentView) goTo(currentView, true);
}
new ResizeObserver(resize).observe(stage);

// ---------------------------------------------------------------- the machine
const emu = new Emulator();
let catalog = { firmwares: [] }, fw = null, mhz = Number(store.get('mhz', 240)), booting = false;
const status = $('status');
function say(text, cls = '') { status.textContent = text; status.className = 'status ' + cls; }

emu.onFrame = (lcd, leds) => {
  if (lcd) device.setLcd(lcd);
  device.setLeds(leds);
};
emu.onStats = ({ speed, load, halted }) => {
  if (booting) return;
  if (halted) { say(`${fw.name}: the emulated CPU halted`, 'bad'); return; }
  if (emu.audioState !== 'running') { say('sound is paused: tap the synth', 'warn'); return; }
  const slow = load > 0.95;
  say(`${mhz} MHz · ${speed === Infinity ? 'idle' : speed.toFixed(1) + '× real time'} · load ${Math.round(load * 100)}%${slow ? ' · lower the clock in options' : ''}`, slow ? 'warn' : '');
};
emu.onError = (message) => say(message, 'bad');

async function boot(options = {}) {
  if (!fw) return;
  booting = true;
  $('hint').classList.add('gone');
  say(`booting ${fw.name}…`);
  try {
    await emu.power();
    device.allOff();
    device.clearLcd();
    held.clear();
    const ok = await emu.boot(fw, { mhz, ...options });
    if (!ok) return;
    emu.pot(pot);
    document.body.classList.add('on-air');
    $('power-text').textContent = 'restart';
    say(`${fw.name} running`);
  } catch (error) {
    say(`${fw.name}: ${error.message}`, 'bad');
  } finally {
    booting = false;
  }
}
function choose(f, start = true) {
  fw = f;
  $('fw-name').textContent = f.version ? `${f.name} ${f.version}` : f.name;
  if (!f.bytes) store.set('fw', f.id);
  renderList();
  if (start && emu.powered) boot();
}
$('power').addEventListener('click', () => boot());

// ---------------------------------------------------------------- input to the machine
const down = new Map();                 // matrix id -> how many things hold it
function press(id) {
  const n = (down.get(id) || 0) + 1;
  down.set(id, n);
  if (n === 1) { device.press(id, true); emu.key(id, true); }
}
function release(id) {
  const n = (down.get(id) || 0) - 1;
  if (n > 0) { down.set(id, n); return; }
  down.delete(id);
  device.press(id, false);
  emu.key(id, false);
}
function turn(index, clicks) {
  if (!clicks) return;
  device.turn(index, clicks);
  emu.enc(ENCS[index][1], clicks);
}
let pot = Number(store.get('pot', 900));
function setPot(v) {
  pot = Math.max(0, Math.min(1023, Math.round(v)));
  device.setPot(pot);
  emu.pot(pot);
  store.set('pot', pot);
}
device.setPot(pot);

// pointers: every finger on its own, so several play a chord or hold a key while one turns a knob
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(e) {
  if (flip > 0.02) return null;          // on its back: nothing to press
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(device.pickables, true)[0];
  if (!hit) return null;
  for (let o = hit.object; o; o = o.parent) if (o.userData.ctl) return o.userData.ctl;
  return null;
}
const pointers = new Map();             // pointerId -> { ctl, held, x, y, acc }
// capture phase on the stage: decided before OrbitControls (on the canvas) sees the event
stage.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  const ctl = pick(e);
  if (!ctl) {
    controls.enabled = pointers.size === 0;
    if (!emu.powered && !booting) boot();
    return;
  }
  controls.enabled = false;
  e.stopPropagation();
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = { ctl, held: -1, x: e.clientX, y: e.clientY, acc: 0 };
  pointers.set(e.pointerId, p);
  if (ctl.type === 'key') { p.held = ctl.id; press(ctl.id); }
  if (!emu.powered && !booting) boot();
}, true);
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') {
      const ctl = pick(e);
      canvas.style.cursor = !ctl ? 'grab' : ctl.type === 'key' ? 'pointer' : 'ns-resize';
    }
    return;
  }
  if (p.ctl.type === 'key') {
    if (!p.ctl.note) return;
    const over = pick(e);               // slide across the note keys
    if (over && over.type === 'key' && over.note && over.id !== p.held) {
      release(p.held);
      p.held = over.id;
      press(p.held);
    }
    return;
  }
  // a knob: up or right turns it clockwise
  const d = (p.y - e.clientY) + (e.clientX - p.x);
  p.x = e.clientX; p.y = e.clientY;
  if (p.ctl.type === 'pot') { setPot(pot + d * 4); return; }
  p.acc += d;
  const clicks = Math.trunc(p.acc / 10);
  if (clicks) { p.acc -= clicks * 10; turn(p.ctl.index, clicks); }
});
function lift(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (p.held >= 0) release(p.held);
  pointers.delete(e.pointerId);
  if (pointers.size === 0) controls.enabled = true;
}
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('lostpointercapture', lift);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let wheelAcc = 0;
stage.addEventListener('wheel', (e) => {
  const ctl = pick(e);
  if (!ctl || ctl.type === 'key') return;       // elsewhere the wheel zooms
  e.preventDefault();
  e.stopPropagation();
  if (ctl.type === 'pot') { setPot(pot - e.deltaY * 0.6); return; }
  wheelAcc -= e.deltaY;
  const clicks = Math.trunc(wheelAcc / 30);
  if (clicks) { wheelAcc -= clicks * 30; turn(ctl.index, clicks); }
}, { capture: true, passive: false });

// computer keyboard
const held = new Map();                 // e.code -> matrix id
function keyId(k, shift) {
  const i = PIANO.indexOf(k);
  if (i >= 0) return PIANO_BASE + i;
  return (k === ' ' && shift ? KEY_BUTTONS['shift '] : undefined) ?? KEY_BUTTONS[k] ?? -1;
}
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'Escape') { closePanels(); return; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const enc = KEY_ENCS[k];
  if (enc) { e.preventDefault(); turn(enc[0], enc[1]); return; }
  const id = keyId(k, e.shiftKey);
  if (id < 0) return;
  e.preventDefault();
  if (e.repeat || held.has(e.code)) return;
  if (!emu.powered && !booting) { boot(); return; }
  held.set(e.code, id);
  press(id);
});
addEventListener('keyup', (e) => {
  const id = held.get(e.code);
  if (id === undefined) return;
  held.delete(e.code);
  release(id);
});
addEventListener('blur', () => {        // a key let go in another window would hang
  for (const id of held.values()) release(id);
  held.clear();
});

// audio waits for a real gesture (on a phone: the finger lifting), and stops when the page is left
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, () => emu.unlock(), true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) emu.unlock(); });
setInterval(() => { if (emu.powered && emu.audioState !== 'running') say('sound is paused: tap the synth', 'warn'); }, 1000);

// MIDI in: every input plays the synth through its MIDI IN jack
let midi = null;
$('midi').addEventListener('click', async () => {
  if (!navigator.requestMIDIAccess) { $('midi-note').textContent = 'This browser has no Web MIDI (Chrome and Edge do).'; return; }
  try {
    midi ||= await navigator.requestMIDIAccess();
    const hook = () => {
      const names = [];
      for (const input of midi.inputs.values()) {
        input.onmidimessage = (m) => { if (m.data[0] < 0xf8) emu.midi([...m.data]); };
        names.push(input.name);
      }
      $('midi').textContent = names.length ? 'connected' : 'no inputs';
      $('midi-note').textContent = names.length ? `Playing from: ${names.join(', ')}` : 'No MIDI inputs found: plug one in and it connects by itself.';
    };
    midi.onstatechange = hook;
    hook();
  } catch { $('midi-note').textContent = 'MIDI access was not allowed.'; }
});

// ---------------------------------------------------------------- panels
const panels = ['fw-panel', 'opt-panel', 'help-panel'].map($);
function closePanels() { for (const p of panels) p.hidden = true; }
function toggle(panel) {
  const show = panel.hidden;
  closePanels();
  panel.hidden = !show;
  if (show && panel.id === 'fw-panel') { $('fw-search').value = ''; renderList(); if (matchMedia('(pointer: fine)').matches) $('fw-search').focus(); }
}
$('fw-open').addEventListener('click', () => toggle($('fw-panel')));
$('opt-open').addEventListener('click', () => toggle($('opt-panel')));
$('help-open').addEventListener('click', () => toggle($('help-panel')));
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', closePanels);
canvas.addEventListener('pointerdown', closePanels);

function renderList() {
  const q = $('fw-search').value.trim().toLowerCase();
  const list = $('fw-list');
  list.replaceChildren();
  for (const f of catalog.firmwares) {
    if (q && !`${f.name} ${f.author} ${f.about}`.toLowerCase().includes(q)) continue;
    const li = document.createElement('li');
    li.className = f === fw ? 'on' : '';
    const head = document.createElement('div');
    const name = Object.assign(document.createElement('span'), { className: 'name', textContent: f.name });
    const ver = Object.assign(document.createElement('span'), { className: 'ver', textContent: ` ${f.version || ''}` });
    const by = Object.assign(document.createElement('span'), { className: 'by', textContent: f.author ? ` · ${f.author}` : '' });
    head.append(name, ver, by);
    const about = Object.assign(document.createElement('div'), { className: 'about', textContent: f.about || '' });
    li.append(head, about);
    li.addEventListener('click', () => { closePanels(); choose(f); if (!emu.powered) boot(); });
    list.append(li);
  }
}
$('fw-search').addEventListener('input', renderList);

async function openFile(file) {
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  closePanels();
  choose({ id: 'local', name: file.name.replace(/\.[^.]+$/, ''), version: '', bytes }, false);
  boot();
}
$('fw-file').addEventListener('change', (e) => { openFile(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); openFile(e.dataTransfer.files[0]); });

for (const [id, t] of Object.entries(THEMES)) {
  const b = document.createElement('button');
  b.dataset.theme = id;
  b.title = t.name;
  b.style.background = t.swatch;
  b.addEventListener('click', () => setTheme(id));
  $('swatches').append(b);
}
for (const c of [60, 80, 100, 120, 160, 200, 240]) $('mhz').add(new Option(`${c} MHz`, c));
$('mhz').value = mhz;
$('mhz').addEventListener('change', () => {
  mhz = Number($('mhz').value);
  store.set('mhz', mhz);
  if (emu.powered) boot();
});
$('brand').checked = store.get('brand', '1') === '1';
device.setBrand($('brand').checked);
$('brand').addEventListener('change', () => { device.setBrand($('brand').checked); store.set('brand', $('brand').checked ? '1' : '0'); });
$('reset').addEventListener('click', () => {
  if (emu.powered && confirm(`Erase the patches and settings saved for “${fw.name}” and boot it fresh?`)) boot({ reset: true });
});

// ---------------------------------------------------------------- go
setTheme(new URLSearchParams(location.search).get('theme') || store.get('theme', 'black'));
resize();
goTo('overview', true);

let lastTick = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / 0.7);
    const k = flight.t * flight.t * (3 - 2 * flight.t);
    camera.position.lerpVectors(flight.from.position, flight.to.position, k);
    controls.target.lerpVectors(flight.from.target, flight.to.target, k);
    if (flight.t === 1) flight = null;
  }
  if (flip !== flipTo) {
    flip += Math.sign(flipTo - flip) * Math.min(dt / 0.8, Math.abs(flipTo - flip));
    const k = flip * flip * (3 - 2 * flip);
    device.group.rotation.x = k * Math.PI;
    device.group.position.y = k * FLIP_Y + Math.sin(k * Math.PI) * 4.2;   // lifted clear of the felt as it turns
  }
  controls.update();
  device.update(dt);
  renderer.render(scene, camera);
});

try {
  catalog = await emu.catalog();
  const want = new URLSearchParams(location.search).get('fw') || store.get('fw', catalog.default);
  choose(catalog.firmwares.find((f) => f.id === want) || catalog.firmwares.find((f) => f.id === catalog.default) || catalog.firmwares[0], false);
} catch (error) {
  say(`the firmware list did not load: ${error.message}`, 'bad');
}

// for scripts and the console: drive the synth without a mouse
window.fm1 = { emu, device, press, release, turn, setPot, boot, goTo, setTheme };
