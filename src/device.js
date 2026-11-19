// The FM-1 as a three.js model, built from primitives: body with recessed trays, glass screen
// with the live LCD, knurled knobs, silicone buttons and pill keys with their backlights.
import * as THREE from 'three';
import { BODY, FOOT, S, BEZEL, LCD, LOGO, POT, ENCS, KNOB_R, KNOB_H, LABEL_DV, TRAYS, BUTTONS, KEYS, DOTS, BTN_DOT, THEMES } from './layout.js';

const RECESS = 0.07;                         // how deep the trays sit below the top face
const X = (u) => (u - BODY.w / 2) * S;
const Z = (v) => (v - BODY.h / 2) * S;
const LIT = new THREE.Color(0xfff3dc);       // the backlight: warm white
const PLAY_LIT = new THREE.Color(0x9dffa8);

// A rounded rectangle path centred on (cx, cy), in shape space (x right, y = -world z).
function roundedRect(path, cx, cy, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x1, y1 - r);
  path.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  path.lineTo(x0 + r, y1);
  path.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x0, y0 + r);
  path.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

// A cap: a rounded rectangle w x h (world units) standing `height` tall from y = 0, its top edge
// rounded over by `bevel`.
function capGeometry(w, h, r, height, bevel, segments = 4) {
  const shape = roundedRect(new THREE.Shape(), 0, 0, w - 2 * bevel, h - 2 * bevel, Math.max(r - bevel, 0.001));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: segments, curveSegments: 10,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

function flatGeometry(w, h, r) {
  const g = new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), 0, 0, w, h, r), 10);
  g.rotateX(-Math.PI / 2);
  return g;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Fine grain for the moulded plastic and the backdrop.
function noiseTexture(size, amount, repeat) {
  const t = canvasTexture(size, size, (g) => {
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * amount;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

const SILK_FONT = 'Menlo, "DejaVu Sans Mono", Consolas, monospace';
const LABEL_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export class Device {
  constructor() {
    this.group = new THREE.Group();
    this.pickables = [];
    this.keys = new Map();      // matrix id -> part
    this.knobs = [];            // 0..6 encoders (layout order), 7 the pot
    this.themed = [];           // (theme) => void, run on every colourway change
    this.brand = true;
    this.grain = noiseTexture(256, 70, 6);
    this.#body();
    this.#screen();
    this.#knobs();
    this.#buttons();
    this.#noteKeys();
    this.#rear();
    this.#underside();
    this.setTheme('black');
    this.clearLcd();
  }

  // ------------------------------------------------------------------ body
  #body() {
    const hw = BODY.w * S, hh = BODY.h * S, r = BODY.r * S;
    const plastic = new THREE.MeshPhysicalMaterial({ roughness: 0.62, metalness: 0, bumpMap: this.grain, bumpScale: 0.35, clearcoat: 0.05, clearcoatRoughness: 0.6 });
    this.themed.push((t) => plastic.color.set(t.body));

    // one moulding: the body with the three trays cut through it (their floors close them below)
    const b = 0.035;
    const top = roundedRect(new THREE.Shape(), 0, 0, hw - 2 * b, hh - 2 * b, r - b);
    for (const t of Object.values(TRAYS)) top.holes.push(roundedRect(new THREE.Path(), X(t.u), -Z(t.v), t.w * S + 2 * b, t.h * S + 2 * b, t.r * S + b));
    const shell = new THREE.ExtrudeGeometry(top, { depth: BODY.thick - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 20 });
    shell.rotateX(-Math.PI / 2);
    shell.translate(0, -BODY.thick + b, 0);
    const shellMesh = new THREE.Mesh(shell, plastic);
    shellMesh.castShadow = shellMesh.receiveShadow = true;
    this.group.add(shellMesh);
    this.plastic = plastic;

    // tray floors
    for (const [name, t] of Object.entries(TRAYS)) {
      const m = new THREE.MeshPhysicalMaterial({ roughness: 0.75, bumpMap: this.grain, bumpScale: 0.2 });
      const floor = new THREE.Mesh(flatGeometry(t.w * S + 0.12, t.h * S + 0.12, t.r * S), m);
      floor.position.set(X(t.u), -RECESS + 0.002, Z(t.v));
      floor.receiveShadow = true;
      this.group.add(floor);
      this.themed.push((th) => m.color.set(name === 'key' ? th.keyTray : th.tray));
    }

    // silk-screen: knob labels and the logo, one transparent decal over the top face
    const silk = document.createElement('canvas');
    silk.width = 2048; silk.height = Math.round(2048 * BODY.h / BODY.w);
    const silkTex = new THREE.CanvasTexture(silk);
    silkTex.colorSpace = THREE.SRGBColorSpace;
    silkTex.anisotropy = 16;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), new THREE.MeshBasicMaterial({ map: silkTex, transparent: true, depthWrite: false, toneMapped: false }));
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.003;
    this.group.add(decal);
    this.themed.push((t) => {
      const g = silk.getContext('2d'), k = silk.width / BODY.w;
      g.clearRect(0, 0, silk.width, silk.height);
      g.fillStyle = t.silk;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${13.5 * k}px ${SILK_FONT}`;
      g.letterSpacing = `${0.6 * k}px`;
      g.fillText(POT.label, POT.u * k, (POT.v + LABEL_DV) * k);
      for (const [label, , u, v] of ENCS) g.fillText(label, u * k, (v + LABEL_DV) * k);
      g.font = `700 ${27 * k}px ${LABEL_FONT}`;
      g.letterSpacing = `${1.5 * k}px`;
      if (this.brand) g.fillText('M-VAVE', LOGO.u * k, LOGO.v * k);
      silkTex.needsUpdate = true;
    });

    // the little dots moulded into the trays
    const dotMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.5 });
    for (const [u, v] of [...DOTS, BTN_DOT]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(2.2 * S, 16), dotMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(X(u), -RECESS + 0.004, Z(v));
      this.group.add(d);
    }
  }

  // ------------------------------------------------------------------ screen
  #screen() {
    const bw = BEZEL.w * S, bh = BEZEL.h * S;
    const bezel = new THREE.Mesh(
      capGeometry(bw, bh, BEZEL.r * S, 0.045, 0.02, 4),
      new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 }),
    );
    bezel.position.set(X(BEZEL.u), 0, Z(BEZEL.v));
    bezel.castShadow = true;
    this.group.add(bezel);

    this.lcdBytes = new Uint8Array(240 * 240 * 4);
    this.lcdTex = new THREE.DataTexture(this.lcdBytes, 240, 240, THREE.RGBAFormat);
    this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    this.lcdTex.magFilter = THREE.LinearFilter;
    this.lcdTex.minFilter = THREE.LinearFilter;
    this.lut = new Uint32Array(65536);       // RGB565 -> RGBA bytes (little-endian)
    for (let p = 0; p < 65536; p++) {
      const r = ((p >> 11) * 255 / 31) | 0, g = (((p >> 5) & 63) * 255 / 63) | 0, b = ((p & 31) * 255 / 31) | 0;
      this.lut[p] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
    const size = LCD.size * S;
    this.lcdMat = new THREE.MeshBasicMaterial({ map: this.lcdTex, toneMapped: false });
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.lcdMat);
    lcd.rotation.x = -Math.PI / 2;
    lcd.position.set(X(LCD.u), 0.0465, Z(LCD.v));
    this.group.add(lcd);
    this.lcdCentre = new THREE.Vector3(X(LCD.u), 0.05, Z(LCD.v));

    // the cover glass: only its reflections show
    const glass = new THREE.Mesh(
      flatGeometry(bw - 0.05, bh - 0.05, BEZEL.r * S - 0.02),
      new THREE.MeshPhysicalMaterial({ color: 0x000000, transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0, envMapIntensity: 1.2, depthWrite: false }),
    );
    glass.position.set(X(BEZEL.u), 0.049, Z(BEZEL.v));
    this.group.add(glass);
  }

  clearLcd() {
    new Uint32Array(this.lcdBytes.buffer).fill(0xff000000);
    this.lcdTex.needsUpdate = true;
  }

  // A frame from the emulator: 240 x 240 RGB565, top row first (a DataTexture's first row is its bottom).
  setLcd(px) {
    const out = new Uint32Array(this.lcdBytes.buffer), lut = this.lut;
    for (let y = 0; y < 240; y++) {
      const src = y * 240, dst = (239 - y) * 240;
      for (let x = 0; x < 240; x++) out[dst + x] = lut[px[src + x]];
    }
    this.lcdTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ knobs
  #knobs() {
    const r = KNOB_R * S, h = KNOB_H;
    // a lathe profile: flared skirt, straight grip, rounded shoulder, flat cap
    const pts = [[r * 1.22, 0], [r * 1.22, 0.05], [r * 1.08, 0.085], [r, 0.11], [r, h - 0.06], [r * 0.97, h - 0.03], [r * 0.9, h - 0.008], [r * 0.82, h], [0, h]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.LatheGeometry(pts, 64);
    const ridges = canvasTexture(256, 4, (g) => {
      for (let i = 0; i < 256; i++) { const v = 128 + 110 * Math.sin((i / 256) * Math.PI * 2 * 4); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i, 0, 1, 4); }
    });
    ridges.colorSpace = THREE.NoColorSpace;
    ridges.wrapS = THREE.RepeatWrapping;
    ridges.repeat.set(11, 1);
    const grip = new THREE.MeshPhysicalMaterial({ color: 0x242426, roughness: 0.38, metalness: 0.25, bumpMap: ridges, bumpScale: 1.6, clearcoat: 0.25, clearcoatRoughness: 0.4 });
    const capMat = new THREE.MeshPhysicalMaterial({ color: 0x1f1f21, roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5 });
    const mark = new THREE.MeshBasicMaterial({ color: 0xf3f1ea, toneMapped: false });
    const dimple = new THREE.MeshStandardMaterial({ color: 0x6a6b70, roughness: 0.4 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.5, metalness: 0.3 });

    const make = (u, v, ctl, isPot) => {
      const g = new THREE.Group();
      g.position.set(X(u), 0, Z(v));
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.34, r * 1.34, 0.012, 48), collarMat);
      collar.position.y = 0.006;
      collar.receiveShadow = true;
      const spin = new THREE.Group();        // what turns
      const b = new THREE.Mesh(body, grip);
      b.castShadow = true;
      const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 48), capMat);
      cap.rotation.x = -Math.PI / 2;
      cap.position.y = h + 0.001;
      // the pointer: a white dot near the rim on MASTER, a faint dimple on the encoders
      const dot = new THREE.Mesh(new THREE.CircleGeometry(r * (isPot ? 0.13 : 0.1), 20), isPot ? mark : dimple);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(0, h + 0.002, -r * 0.56);
      spin.add(b, cap, dot);
      // a generous invisible target, so a finger finds the knob
      const target = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.9, r * 1.9, h + 0.1, 16));
      target.position.y = h / 2;
      target.visible = false;
      g.add(collar, spin, target);
      g.userData.ctl = ctl;
      this.group.add(g);
      this.pickables.push(g);
      return { group: g, spin, angle: 0, target: 0 };
    };
    ENCS.forEach(([, , u, v], i) => this.knobs.push(make(u, v, { type: 'enc', index: i }, false)));
    this.knobs.push(make(POT.u, POT.v, { type: 'pot' }, true));
    this.setPot(900);
  }

  turn(index, clicks) { this.knobs[index].target += clicks * (Math.PI / 10); }   // 18 degrees a detent
  setPot(value) { this.knobs[7].target = ((-135 + 270 * value / 1023) * Math.PI) / 180; }

  // ------------------------------------------------------------------ buttons
  #buttons() {
    for (const b of BUTTONS) {
      const w = b.w * S, h = b.h * S, height = RECESS + 0.075;
      const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.58, sheen: 0.5, sheenRoughness: 0.55, emissive: 0x000000 });
      const cap = new THREE.Mesh(capGeometry(w, h, b.r * S, height, 0.022, 4), mat);
      cap.castShadow = cap.receiveShadow = true;
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = Math.round(256 * b.h / b.w);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(w, h), labelMat);
      label.rotation.x = -Math.PI / 2;
      label.position.y = height + 0.002;
      const g = new THREE.Group();
      g.add(cap, label);
      g.position.set(X(b.u), -RECESS, Z(b.v));
      g.userData.ctl = { type: 'key', id: b.id, note: false };
      this.group.add(g);
      this.pickables.push(g);
      const part = { group: g, mat, labelMat, rest: -RECESS, travel: 0.04, y: 0, down: false, led: 0, shown: -1, lit: b.id === 12 ? PLAY_LIT : LIT, base: new THREE.Color(), ink: new THREE.Color() };
      this.keys.set(b.id, part);
      this.themed.push((t) => {
        mat.color.set(t.cap);
        part.base.set(t.cap);
        part.ink.set(t.ink);
        part.shown = -1;
        const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
        c.clearRect(0, 0, W, H);
        c.fillStyle = '#fff';                // tinted by the material: ink, or the backlight
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const lines = b.label.split('|');
        const px = (b.id < 2 ? 0.2 : lines.length > 1 ? 0.2 : 0.23) * W;
        c.font = `700 ${px}px ${LABEL_FONT}`;
        c.letterSpacing = `${px * 0.04}px`;
        if (lines.length > 1) {
          c.fillText(lines[0], W / 2, H / 2 - px * 0.62);
          c.fillRect(W / 2 - px * 1.25, H / 2 - px * 0.04, px * 2.5, px * 0.09);
          c.fillText(lines[1], W / 2, H / 2 + px * 0.68);
        } else c.fillText(b.label, W / 2, H / 2 + px * 0.04);
        tex.needsUpdate = true;
      });
    }
  }

  // ------------------------------------------------------------------ note keys
  #noteKeys() {
    const shared = new Map();                // geometry by size
    const geo = (k) => {
      const id = `${k.w}x${k.h}`;
      if (!shared.has(id)) {
        shared.set(id, {
          cap: capGeometry(k.w * S, k.h * S, k.r * S, RECESS + 0.12, 0.045, 6),
          ring: flatGeometry(k.w * S + 0.075, k.h * S + 0.075, k.r * S + 0.035),
          line: capGeometry(3.4 * S, k.line * S, 1.7 * S, 0.012, 0.005, 2),
        });
      }
      return shared.get(id);
    };
    const ringMat = new THREE.MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    this.themed.push((t) => ringMat.color.set(t.ring));

    for (const k of KEYS) {
      const { cap, ring, line } = geo(k);
      const height = RECESS + 0.12;
      const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.6, sheen: 0.6, sheenRoughness: 0.5, emissive: 0x000000 });
      const capMesh = new THREE.Mesh(cap, mat);
      capMesh.castShadow = capMesh.receiveShadow = true;
      const lineMat = new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x000000 });
      const lineMesh = new THREE.Mesh(line, lineMat);
      lineMesh.position.set(0, height - 0.004, (k.lineDv || 0) * S);
      const g = new THREE.Group();
      g.add(capMesh, lineMesh);
      let labelMat = null;
      if (k.label) {
        const tex = canvasTexture(128, 48, (c) => {
          c.fillStyle = '#fff';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.font = `600 30px ${LABEL_FONT}`;
          c.letterSpacing = '1px';
          c.fillText(k.label, 64, 26);
        });
        labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
        const label = new THREE.Mesh(new THREE.PlaneGeometry(30 * S, 11.25 * S), labelMat);
        label.rotation.x = -Math.PI / 2;
        label.position.set(0, height + 0.002, 19 * S);
        g.add(label);
      }
      g.position.set(X(k.u), -RECESS, Z(k.v));
      g.userData.ctl = { type: 'key', id: k.id, note: true };
      const ringMesh = new THREE.Mesh(ring, ringMat);
      ringMesh.position.set(X(k.u), -RECESS + 0.004, Z(k.v));
      ringMesh.receiveShadow = true;
      this.group.add(ringMesh, g);
      this.pickables.push(g);
      const part = { group: g, mat, lineMat, labelMat, rest: -RECESS, travel: 0.065, y: 0, down: false, led: 0, shown: -1, lit: LIT, base: new THREE.Color(), ink: new THREE.Color(), lineBase: new THREE.Color() };
      this.keys.set(k.id, part);
      this.themed.push((t) => {
        mat.color.set(t.key);
        part.base.set(t.key);
        part.ink.set(t.ink);
        part.lineBase.set(t.line);
        part.shown = -1;
      });
    }
  }

  // ------------------------------------------------------------------ rear panel
  // Seen from behind, left to right: the logo, then the connector bay with the 6.35 mm output,
  // the 3.5 mm jack, USB-C, the power switch and the charge LED. Positions from the rear photo.
  #rear() {
    const g = new THREE.Group();
    g.position.set(0, 0, -(BODY.h * S) / 2 - 0.001);
    g.rotation.y = Math.PI;                    // local +z points out of the back, local x runs as the photo does
    this.group.add(g);
    const yc = -BODY.thick / 2;
    const black = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.45 });
    const hole = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.28, metalness: 1 });
    const flat = (w, h, r, mat, x, z) => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), 0, 0, w, h, r), 10), mat);
      m.position.set(x, yc, z);
      g.add(m);
      return m;
    };
    const disc = (r, mat, x, z) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat);
      m.position.set(x, yc, z);
      g.add(m);
      return m;
    };
    // the bay: a groove around a panel of the body's own plastic
    flat(4.3, 0.68, 0.14, black, 2.2, 0.001);
    flat(4.2, 0.58, 0.1, this.plastic, 2.2, 0.002);
    // 6.35 mm output in its square collar
    flat(0.62, 0.5, 0.1, black, 0.43, 0.003);
    flat(0.54, 0.42, 0.07, this.plastic, 0.43, 0.004);
    const nut = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.035, 12, 40), black);
    nut.position.set(0.43, yc, 0.012);
    g.add(nut);
    disc(0.14, hole, 0.43, 0.005);
    // 3.5 mm jack
    disc(0.125, black, 1.4, 0.004);
    disc(0.075, hole, 1.4, 0.005);
    // USB-C: a steel shell around the tongue
    flat(0.66, 0.24, 0.12, metal, 2.39, 0.004);
    flat(0.57, 0.15, 0.075, hole, 2.39, 0.005);
    flat(0.4, 0.035, 0.015, new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5 }), 2.39, 0.006);
    // power switch: a slot with its slider to one side
    flat(0.56, 0.3, 0.15, black, 3.4, 0.004);
    flat(0.48, 0.22, 0.11, hole, 3.4, 0.005);
    const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.5 }));
    nub.rotation.x = Math.PI / 2;
    nub.position.set(3.51, yc, 0.045);
    g.add(nub);
    disc(0.022, hole, 3.95, 0.005);

    // the logo
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 192;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5 * 192 / 1024), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    logo.position.set(-3.69, yc, 0.003);
    g.add(logo);
    this.themed.push((t) => {
      const x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = t.silk;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = `300 168px ${LABEL_FONT}`;
      x.letterSpacing = '4px';
      if (this.brand) x.fillText('M-VAVE', 512, 104);
      tex.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ underside
  // From the photo of the base: an inset plate, four rubber feet in their wells, case screws,
  // the battery door and the speaker grille.
  #underside() {
    const hw = BODY.w * S, hh = BODY.h * S;
    const g = new THREE.Group();
    g.position.y = -BODY.thick;
    g.rotation.x = Math.PI;                    // local +y points down, out of the base
    this.group.add(g);
    const base = new THREE.MeshStandardMaterial({ roughness: 0.8, bumpMap: this.grain, bumpScale: 0.25 });
    this.themed.push((t) => base.color.set(t.body).lerp(new THREE.Color(0x4a4b4e), 0.35));
    const groove = new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.6 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.35, metalness: 0.8 });
    const at = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    at(new THREE.Mesh(flatGeometry(hw - 0.07, hh - 0.07, BODY.r * S), groove), 0, 0.001, 0);
    at(new THREE.Mesh(flatGeometry(hw - 0.2, hh - 0.2, BODY.r * S - 0.06), base), 0, 0.002, 0).receiveShadow = true;
    // battery door
    at(new THREE.Mesh(flatGeometry(4.32, 2.4, 0.12), groove), -0.04, 0.003, 0.08);
    at(new THREE.Mesh(flatGeometry(4.26, 2.34, 0.1), base), -0.04, 0.004, 0.08);
    const screw = (x, z, r = 0.085) => {
      at(new THREE.Mesh(new THREE.CircleGeometry(r * 1.5, 24).rotateX(-Math.PI / 2), groove), x, 0.005, z);
      at(new THREE.Mesh(new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), steel), x, 0.006, z);
      at(new THREE.Mesh(new THREE.PlaneGeometry(r * 1.3, r * 0.28).rotateX(-Math.PI / 2), groove), x, 0.007, z);
      at(new THREE.Mesh(new THREE.PlaneGeometry(r * 0.28, r * 1.3).rotateX(-Math.PI / 2), groove), x, 0.007, z);
    };
    for (const [x, z] of [[-5.66, -3.11], [-0.22, -3.11], [5.6, -3.13], [-5.66, 0.33], [5.6, 0.33], [-0.07, 0.33]]) screw(x, z);
    screw(-0.07, -0.7, 0.05);
    // feet: a well, a rim, the rubber pad standing proud
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 5.09, z = sz * 2.6;
      at(new THREE.Mesh(new THREE.CircleGeometry(0.52, 40).rotateX(-Math.PI / 2), groove), x, 0.005, z);
      at(new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 10, 48).rotateX(Math.PI / 2), rubber), x, 0.02, z);
      const pad = at(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, FOOT, 40), rubber), x, FOOT / 2, z);
      pad.castShadow = true;
    }
    // speaker grille: rings and spokes over the dark of the driver
    const grille = canvasTexture(512, 512, (c) => {
      c.translate(256, 256);
      c.fillStyle = '#050505';
      c.beginPath(); c.arc(0, 0, 250, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3d3e41';
      c.lineCap = 'round';
      c.lineWidth = 20;
      for (const r of [70, 150, 232]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
      c.lineWidth = 17;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        c.beginPath();
        c.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
        c.quadraticCurveTo(Math.cos(a + 0.45) * 150, Math.sin(a + 0.45) * 150, Math.cos(a + 0.5) * 236, Math.sin(a + 0.5) * 236);
        c.stroke();
      }
      c.fillStyle = '#3d3e41';
      c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.fill();
    });
    at(new THREE.Mesh(new THREE.PlaneGeometry(1.85, 1.85).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: grille, transparent: true, depthWrite: false })), 4.29, 0.006, 1.35);
  }

  // the maker's wordmark under the screen and on the back: on or off
  setBrand(on) {
    this.brand = on;
    for (const f of this.themed) f(this.theme);
  }

  setTheme(name) {
    this.theme = THEMES[name] || THEMES.black;
    for (const f of this.themed) f(this.theme);
  }

  press(id, down) {
    const k = this.keys.get(id);
    if (k) k.down = down;
  }

  // 41 LED levels from the emulator: the share of time each is lit; fully on is about 1 tick in 11.
  setLeds(leds) {
    for (const [id, k] of this.keys) k.led = Math.min(Math.max(leds[id] / 0.08, 0), 1);
  }

  allOff() {
    for (const k of this.keys.values()) { k.led = 0; k.down = false; }
  }

  update(dt) {
    const ease = 1 - Math.exp(-dt * 38);
    for (const k of this.keys.values()) {
      const want = k.down ? 1 : 0;
      if (k.y !== want) {
        k.y += (want - k.y) * ease;
        if (Math.abs(want - k.y) < 0.004) k.y = want;
        k.group.position.y = k.rest - k.y * k.travel;
      }
      // a note key glows a little while held, as a finger on it would hide anyway
      const glow = k.lineMat ? Math.max(k.led, k.y * 0.5) : k.led;
      if (glow !== k.shown) {
        k.shown = glow;
        k.mat.emissive.copy(k.lit).multiplyScalar(glow * (k.lineMat ? 0.07 : 0.2));
        if (k.lineMat) {
          k.lineMat.color.copy(k.lineBase);
          k.lineMat.emissive.copy(k.lit).multiplyScalar(glow * 1.6);
        }
        if (k.labelMat) k.labelMat.color.copy(k.ink).lerp(k.lit, glow).multiplyScalar(1 + glow * 0.6);
      }
    }
    const turnEase = 1 - Math.exp(-dt * 26);
    for (const n of this.knobs) {
      if (n.angle !== n.target) {
        n.angle += (n.target - n.angle) * turnEase;
        if (Math.abs(n.target - n.angle) < 0.002) n.angle = n.target;
        n.spin.rotation.y = -n.angle;
      }
    }
  }
}
