import * as THREE from 'three';
import { Fluid } from './fluid.js';
import { LedScreen } from './screen.js';
import { buildDisc } from './cylinder.js';
import { attachDragRotate } from './controls.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
camera.position.set(0, 1.0, 4.6);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xfff1d6, 0x1a1c22, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0d0, 1.4);
key.position.set(2.5, 4, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
rim.position.set(-3, 1.5, -2);
scene.add(rim);

// Soft contact shadow under the floating disc.
const shadowTex = makeRadialShadowTexture();
const shadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex,
  transparent: true,
  depthWrite: false,
});
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), shadowMat);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -1.35;
scene.add(shadow);

// LED screen + fluid sim.
const led = new LedScreen({ size: 512 });
const fluid = new Fluid({ count: 600, radius: 0.032 });

// Disc.
const disc = buildDisc({ ledTexture: led.texture, radius: 1.0, height: 0.18 });
// A slight initial tilt makes the screen visible from the camera's angle.
disc.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
scene.add(disc);

const controls = attachDragRotate(canvas, disc, camera, {
  sensitivity: 0.008,
  inertiaDecay: 0.94,
});

// UI wiring.
const resInput = document.getElementById('resolution');
const resValue = document.getElementById('resolution-value');
const amtInput = document.getElementById('amount');
const amtValue = document.getElementById('amount-value');

function syncResolution() {
  const n = parseInt(resInput.value, 10);
  resValue.textContent = String(n);
  led.setResolution(n);
}
function syncAmount() {
  const n = parseInt(amtInput.value, 10);
  amtValue.textContent = String(n);
  fluid.setCount(n);
}
resInput.addEventListener('input', syncResolution);
amtInput.addEventListener('input', syncAmount);
syncResolution();

// Resize handling.
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// Per-frame: derive 2D gravity from disc orientation, step sim, redraw.
const G = 4.0;
const worldDown = new THREE.Vector3(0, -1, 0);
const localDown = new THREE.Vector3();
const invQ = new THREE.Quaternion();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  controls.update();

  // worldDown rotated by inverse(disc.quaternion) → localDown in disc frame.
  invQ.copy(disc.quaternion).invert();
  localDown.copy(worldDown).applyQuaternion(invQ);
  // Disc top face is the local XZ plane. Map to fluid coords:
  //   fluid.x  ←  local +X
  //   fluid.y  ←  local -Z   (see cylinder.js for the uv axis derivation)
  fluid.setGravity(localDown.x * G, -localDown.z * G);

  fluid.step(dt);
  led.render(fluid);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function makeRadialShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
