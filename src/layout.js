// The FM-1's front panel, measured from M-VAVE's product photos. Units are photo pixels with the
// body's top-left corner at (0, 0): the body is 860 wide and 515 deep. `S` turns them into
// world units. Ids are the emulator's matrix ids: 0..13 buttons, 14..40 note keys (F3..G5).
// thick: from the rear photo, the body is 0.107 of its width tall; the feet add FOOT below it
export const BODY = { w: 860, h: 515, r: 40, thick: 1.3 };
export const FOOT = 0.27;
export const S = 1 / 70;

export const BEZEL = { u: 322.5, v: 142, w: 205, h: 204, r: 22 };
export const LCD = { u: 323.5, v: 142, size: 150 };
export const LOGO = { u: 325, v: 268 };

// Encoders: [label, emulator encoder id, u, v]. MASTER is a pot, not an encoder.
export const POT = { label: 'MASTER', u: 68, v: 78 };
export const ENCS = [
  ['SELECT', 0, 158, 78],
  ['PRESETS', 6, 68, 171],
  ['ALGORITHM', 1, 158, 171],
  ['KNOB1', 2, 486, 78],
  ['KNOB2', 3, 582, 78],
  ['KNOB3', 4, 678, 78],
  ['KNOB4', 5, 775, 78],
];
export const KNOB_R = 15;
export const KNOB_H = 0.47;
export const LABEL_DV = -37;      // a knob's label sits this far above its centre

export const TRAYS = {
  oct: { u: 114.5, v: 241.5, w: 137, h: 45, r: 11 },
  btn: { u: 631.5, v: 203.5, w: 349, h: 121, r: 15 },
  key: { u: 431, v: 387.5, w: 806, h: 187, r: 30 },
};

export const BUTTONS = [
  { id: 0, label: 'OCT-', u: 82, v: 241.5, w: 52, h: 29, r: 7 },
  { id: 1, label: 'OCT+', u: 150, v: 241.5, w: 52, h: 29, r: 7 },
  ...['FX', 'SEL', 'ENV', 'LFO', 'EDIT', 'GLO'].map((label, i) => ({ id: 2 + i, label, u: 497 + 54 * i, v: 176, w: 43, h: 41, r: 8 })),
  ...['HOME', 'SAVE', 'ARP', 'SEQ', 'PLAY|STOP', 'REC'].map((label, i) => ({ id: 8 + i, label, u: 497 + 54 * i, v: 230, w: 43, h: 41, r: 8 })),
];

const WHITE = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24, 26];
const BLACK = [[1, 0], [3, 1], [5, 2], [8, 4], [10, 5], [13, 7], [15, 8], [17, 9], [20, 11], [22, 12], [25, 14]];
const TOP_LABELS = ['OP1', 'OP2', 'OP3', 'OP4', 'OP5', 'OP6', 'PIT', 'GLO', 'MONO', 'POLY', ''];
const PITCH = 48.8, KEY_U0 = 65;
export const KEYS = [
  ...WHITE.map((n, i) => ({ id: 14 + n, u: KEY_U0 + PITCH * i, v: 430, w: 38, h: 78, r: 13, line: 42, label: '' })),
  ...BLACK.map(([n, after], i) => ({ id: 14 + n, u: KEY_U0 + PITCH * (after + 0.5), v: 341, w: 38, h: 66, r: 13, line: 22, lineDv: -9, label: TOP_LABELS[i] })),
];
// the small dots on the key tray under the gaps of the upper row, and the one between the button rows
export const DOTS = [[235.8, 386], [382.2, 386], [577.4, 386], [723.8, 386]];
export const BTN_DOT = [632, 203.5];

// Computer keyboard. Notes follow fm1-emu: A W S E D F T G Y H U J K O L P ; ' = C4..F5.
export const PIANO = "awsedftgyhujkolp;'";
export const PIANO_BASE = 21;     // C4
export const KEY_BUTTONS = { z: 0, x: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 0: 11, ' ': 12, 'shift ': 13 };
// key -> [index into ENCS, clicks]
export const KEY_ENCS = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowDown: [1, -1], ArrowUp: [1, 1], ',': [2, -1], '.': [2, 1],
  '[': [3, -1], ']': [3, 1], '-': [4, -1], '=': [4, 1], c: [5, -1], v: [5, 1], b: [6, -1], n: [6, 1],
};

export const THEMES = {
  black: {
    name: 'Black', swatch: '#2b2c2e', backdrop: 0xc8481f,
    body: 0x1d1e20, tray: 0x121213, keyTray: 0x131314, cap: 0x151516, key: 0x141415, ring: 0x070708,
    silk: '#e9e9e6', ink: '#f2f2ef', line: 0xf0f0ec, lineLit: true,
  },
  orange: {
    name: 'Orange', swatch: '#d2582f', backdrop: 0x242528,
    body: 0xcf5630, tray: 0xb0452a, keyTray: 0xa9432b, cap: 0xb84c30, key: 0xb34a30, ring: 0x9a3c26,
    silk: '#fff4ec', ink: '#fff1e6', line: 0x3a2622, lineLit: false,
  },
  mint: {
    name: 'Black & Mint', swatch: '#63cdb9', backdrop: 0xe6dfd2,
    body: 0x1e1f21, tray: 0x58c2ae, keyTray: 0x5cc6b2, cap: 0x66d1bd, key: 0x66d1bd, ring: 0x4fb5a2,
    silk: '#e9e9e6', ink: '#12302a', line: 0x1f3a35, lineLit: false,
  },
  purple: {
    name: 'Purple', swatch: '#b58bc9', backdrop: 0x2a2630,
    body: 0xb58bc9, tray: 0x7c72b3, keyTray: 0x776dae, cap: 0x8a6fb0, key: 0x746ab1, ring: 0x5e5498,
    silk: '#f1e8f8', ink: '#f1e8f8', line: 0x2e2850, lineLit: false,
  },
  blue: {
    name: 'White & Blue', swatch: '#516f8f', backdrop: 0x2f4763,
    body: 0xe6e3dc, tray: 0x5a7795, keyTray: 0x557290, cap: 0x516f8f, key: 0x516f8f, ring: 0x3e5c7a,
    silk: '#55616f', ink: '#e4ebf2', line: 0x1e3047, lineLit: false,
  },
};
