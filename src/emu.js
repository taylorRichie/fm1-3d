// The machine: fm1-emu's WebAssembly core (core/fm1_web.wasm, MIT, by Joakim Eriksson) running in
// an AudioWorklet (core/worklet.js). This file only talks to that worklet: boot a firmware
// package, send keys / encoders / the pot / MIDI, and hand back LCD frames and LED levels.
import { fetchPackage } from '../core/fwsc.js';
import { packageHash, changedSectors, packSectors } from '../core/persistence.js';

// Flash saves (patches, settings) per firmware package, kept in IndexedDB by the package's hash.
const saves = {
  db: null,
  open() {
    return (this.db ||= new Promise((resolve, reject) => {
      const rq = indexedDB.open('fm1-3d', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('saves');
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    }));
  },
  async get(hash) {
    try {
      const db = await this.open();
      return await new Promise((resolve) => {
        const rq = db.transaction('saves').objectStore('saves').get(hash);
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => resolve(null);
      });
    } catch { return null; }
  },
  async put(hash, value) {
    try {
      const db = await this.open();
      db.transaction('saves', 'readwrite').objectStore('saves').put(value, hash);
    } catch { /* private window: the save lives until the tab closes */ }
  },
  async clear(hash) {
    try {
      const db = await this.open();
      db.transaction('saves', 'readwrite').objectStore('saves').delete(hash);
    } catch { /* nothing kept */ }
  },
};

export class Emulator {
  constructor() {
    this.ac = null;
    this.node = null;
    this.wasm = null;
    this.seq = 0;
    this.session = null;          // { seq, hash, name, base }
    this.waiters = new Map();     // seq -> { resolve, reject, timer }
    this.packages = new Map();    // firmware id -> { bytes, url }
    this.onFrame = () => {};      // (lcd: Uint16Array | null, leds: Float32Array)
    this.onStats = () => {};      // ({ speed, load, ms, halted })
    this.onError = () => {};      // (message)
    this.onSaved = () => {};      // ()
    this.stats = { emulated: 0, busy: 0, t: 0 };
  }

  get powered() { return !!this.node; }

  async catalog() {
    const c = await (await fetch('core/firmwares.json', { cache: 'no-cache' })).json();
    return { default: c.default, firmwares: c.firmwares.filter((f) => !f.byo && (f.package || f.embedded)) };
  }

  // Needs a user gesture: browsers start audio only after a click or a key. The context is made
  // before anything is awaited, so it is still inside that gesture (Safari is strict about it).
  async power() {
    if (!this.ac) {
      // iOS: play like a music app, so the ring / silent switch does not mute the synth
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC({ sampleRate: 44100, latencyHint: 'interactive' });
    }
    const ac = this.ac;
    ac.resume().catch(() => {});
    if (this.node) return;
    this.wasm ||= await (await fetch('core/fm1_web.wasm')).arrayBuffer();
    await ac.audioWorklet.addModule('core/worklet.js');
    if (this.node) return;
    const node = new AudioWorkletNode(ac, 'fm1', { numberOfInputs: 0, outputChannelCount: [2] });
    node.connect(ac.destination);
    node.port.onmessage = (e) => this.#message(e.data);
    this.node = node;
    // a touch only counts as a gesture when the finger lifts: unlock() resumes it then
    if (ac.state !== 'running') await Promise.race([ac.resume().catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);
  }

  // Call from any tap, click or key: starts the audio if the browser held it back, and brings it
  // back after a phone call or a trip to another app.
  unlock() {
    if (this.ac && this.ac.state !== 'running') this.ac.resume().catch(() => {});
  }

  get audioState() { return this.ac ? this.ac.state : 'off'; }

  async package(fw) {
    if (fw.bytes) return { bytes: fw.bytes, url: null };
    if (!this.packages.has(fw.id)) this.packages.set(fw.id, await fetchPackage(fw));
    return this.packages.get(fw.id);
  }

  // Boot a firmware: a catalog entry, or { id, name, bytes } for a file the user opened.
  async boot(fw, { mhz = 240, reset = false } = {}) {
    const seq = ++this.seq;
    const got = await this.package(fw);
    const hash = await packageHash(got.bytes);
    if (reset) await saves.clear(hash);
    const kept = reset ? null : await saves.get(hash);
    if (seq !== this.seq) return false;       // another boot was asked for meanwhile
    const sectors = kept?.sectors?.length ? packSectors(kept.sectors).buffer : new ArrayBuffer(0);
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(seq); reject(new Error('the firmware did not boot in 30 s')); }, 30000);
      this.waiters.set(seq, { resolve, reject, timer });
    });
    this.pending = { seq, hash, name: fw.name, base: null };
    this.node.port.postMessage({
      type: 'boot', seq, wasm: this.wasm.slice(0), package: got.bytes.slice().buffer,
      sectors, syx: null, script: null, mhz, jit: true, chip: 'p25q80',
    });
    await ready;
    return true;
  }

  key(id, down) { this.node?.port.postMessage({ type: 'key', id, down }); }
  enc(enc, clicks) { this.node?.port.postMessage({ type: 'enc', enc, clicks }); }
  pot(value) { this.node?.port.postMessage({ type: 'pot', value }); }
  midi(bytes) { this.node?.port.postMessage({ type: 'midi', bytes }); }

  #message(m) {
    if (m.type === 'error') {
      const w = this.waiters.get(m.seq);
      if (w) { clearTimeout(w.timer); this.waiters.delete(m.seq); w.reject(new Error(m.message)); }
      else if (m.seq === this.seq) this.onError(m.message);
      return;
    }
    if (m.type === 'booted') {
      const w = this.waiters.get(m.seq);
      if (!w || !this.pending || this.pending.seq !== m.seq) return;
      this.session = { ...this.pending, base: m.base };
      this.pending = null;
      this.stats = { emulated: 0, busy: 0, t: performance.now() };
      clearTimeout(w.timer); this.waiters.delete(m.seq); w.resolve();
      return;
    }
    if (m.type === 'snapshot') {
      // the worklet sends the flash by itself a moment after the firmware wrote to it
      const s = this.session;
      if (s && m.seq === s.seq && m.flash) {
        saves.put(s.hash, { name: s.name, sectors: changedSectors(s.base, m.flash) });
        this.onSaved();
      }
      return;
    }
    if (m.type !== 'frame' || m.seq !== this.seq || !this.session) return;
    this.onFrame(m.lcd, m.leds);
    const st = this.stats;
    st.emulated += m.emulated - m.idle;
    st.busy += m.busy;
    const now = performance.now();
    if (now - st.t >= 1000) {
      this.onStats({
        speed: st.busy > 0 ? Math.max(st.emulated, 0) / st.busy : Infinity,
        load: st.busy / (now - st.t), ms: m.ms, halted: !!m.halted,
      });
      st.emulated = 0; st.busy = 0; st.t = now;
    }
  }
}
