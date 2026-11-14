import * as THREE from 'three';
import * as TX from './tex.js';

export function makeMaterials() {
  const steelA = TX.paintedSteelTex(301, { rust: 1 });
  const steelB = TX.paintedSteelTex(302, { rust: 2.2 });
  const clean = TX.paintedSteelTex(303, { rust: 0.3 });
  const std = (color, map = null, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, map, roughness, metalness, ...extra });

  const M = {
    white: std(0xe6e5df, steelA, 0.55),
    whiteClean: std(0xecebe6, clean, 0.5),
    teal: std(0x2a8088, steelA, 0.5),
    tealDark: std(0x1c5d66, steelA, 0.55),
    red: std(0xc4472a, steelA, 0.5),
    yellow: std(0xd9a81e, steelA, 0.55),
    orange: std(0xd9622a, clean, 0.5),
    dark: std(0x24282c, steelB, 0.6),
    grey: std(0x7d8387, steelB, 0.6),
    greyLight: std(0xb3b6b6, steelA, 0.6),
    deck: std(0x5c3229, steelB, 0.75),
    deckGreen: std(0x2f5648, steelB, 0.75),
    navy: std(0x1d3252, steelA, 0.5),
    black: std(0x121416, steelB, 0.7),
    rubber: std(0x101112, null, 0.95),
    rope: std(0xb9a476, null, 0.9),
    galv: std(0x9fa5a8, clean, 0.45, 0.6),
    rail: std(0x4a4640, steelB, 0.45, 0.7),
    glass: std(0x0d1820, null, 0.08, 0.0, { envMapIntensity: 1.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff0c8, emissiveIntensity: 0.6, roughness: 0.4 }),
    redLamp: new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 1.5, roughness: 0.4 }),
    greenLamp: new THREE.MeshStandardMaterial({ color: 0x30ff60, emissive: 0x10ff40, emissiveIntensity: 1.5, roughness: 0.4 }),
    buoyRed: std(0xb32a22, steelB, 0.55),
    buoyGreen: std(0x1f7a46, steelB, 0.55),

    apron: std(0xffffff, TX.apronTex(41), 0.92),
    quayFace: std(0xffffff, TX.quayFaceTex(42), 0.9),
    hazard: std(0xffffff, TX.hazardTex(), 0.85),
    markWhite: std(0xffffff, TX.markingTex('226,226,218', 5), 0.8),
    markYellow: std(0xffffff, TX.markingTex('214,168,34', 6), 0.8),
    cladding: std(0xffffff, TX.claddingTex(51), 0.7),
    claddingBlue: std(0xffffff, TX.claddingTex(52, '#5f7f96'), 0.7),
    claddingCream: std(0xffffff, TX.claddingTex(53, '#cdc6b2'), 0.7),
    roof: std(0xffffff, TX.roofTex(54), 0.7, 0.0),
    roofRed: std(0xb0503c, TX.roofTex(55), 0.7, 0.0),
    windows: std(0xffffff, TX.windowBandTex(61), 0.5),
    windowsOffice: std(0xffffff, TX.windowBandTex(62, { wall: '#c9c6ba', cols: 6 }), 0.45),
    bridge: std(0xffffff, TX.bridgeGlassTex(), 0.35),
    block: std(0xffffff, TX.blockWallTex(71), 0.92),
    rock: std(0xffffff, TX.rockTex(72), 0.95),
    land: std(0xffffff, TX.landTex(73), 1.0),
    concrete: std(0xffffff, TX.concreteTex(74), 0.9),
    tank: std(0xe2e1da, steelB, 0.5),
    funnel: std(0xffffff, TX.funnelTex(), 0.55),
    lighthouse: std(0xffffff, TX.lighthouseTex(), 0.6),
  };
  M.apron.map.repeat.set(1, 1);
  M.fence = new THREE.MeshStandardMaterial({ map: TX.chainLinkTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
  return M;
}
