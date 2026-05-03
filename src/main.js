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

const hemi = new THREE.HemisphereLight(0xfff3dc, 0x202028, 1.05);
scene.add(hemi);

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
const led = new LedScreen({ size: 1024 });
led.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const fluid = new Fluid({ count: 600, radius: 0.032 });

// Disc.
const disc = buildDisc({ ledTexture: led.texture, radius: 1.0, height: 0.18 });
// A slight initial tilt makes the screen visible from the camera's angle.
disc.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
scene.add(disc);

// Drag and gyro write to baseTarget.quaternion. Each frame, we compose:
//   disc.quaternion = baseTarget.quaternion * R(0,1,0, manualSpinAngle)
// so the slider's angle stacks on top of whatever drag/gyro produced.
const baseTarget = { quaternion: new THREE.Quaternion().copy(disc.quaternion) };
let manualSpinAngle = 0;

let gyroEnabled = false;
const controls = attachDragRotate(canvas, baseTarget, camera, {
  sensitivity: 0.008,
  inertiaDecay: 0.94,
  isEnabled: () => !gyroEnabled,
});

// UI wiring.
function $(id) { return document.getElementById(id); }
const resInput = $('resolution');
const resValue = $('resolution-value');
const footprintInput = $('footprint');
const footprintValue = $('footprint-value');
const dotFillInput = $('dot-fill');
const dotFillValue = $('dot-fill-value');
const amtInput = $('amount');
const amtValue = $('amount-value');
const particleRInput = $('particle-r');
const particleRValue = $('particle-r-value');
const liquidColorInput = $('liquid-color');
const screenColorInput = $('screen-color');
const rainbowInput = $('rainbow');
const glowInput = $('glow');
const glowStrengthInput = $('glow-strength');
const glowStrengthValue = $('glow-strength-value');
const speedGlowInput = $('speed-glow');
const speedRefInput = $('speed-ref');
const speedRefValue = $('speed-ref-value');
const whitewaterInput = $('whitewater');
const whitewaterAmountInput = $('whitewater-amount');
const whitewaterAmountValue = $('whitewater-amount-value');
const whitewaterThresholdInput = $('whitewater-threshold');
const whitewaterThresholdValue = $('whitewater-threshold-value');
const whitewaterColorInput = $('whitewater-color');
const gravityInput = $('gravity');
const gravityValue = $('gravity-value');
const viscosityInput = $('viscosity');
const viscosityValue = $('viscosity-value');
const bounceInput = $('bounce');
const bounceValue = $('bounce-value');
const spinInput = $('spin');
const spinValue = $('spin-value');

const settings = {
  gravity: parseFloat(gravityInput.value),
  spinScale: parseFloat(spinInput.value),
};

function syncResolution() {
  const n = parseInt(resInput.value, 10);
  resValue.textContent = String(n);
  led.setResolution(n);
}
function syncFootprint() {
  const v = parseFloat(footprintInput.value);
  footprintValue.textContent = v.toFixed(2);
  led.setParticleFootprint(v);
}
function syncDotFill() {
  const v = parseFloat(dotFillInput.value);
  dotFillValue.textContent = v.toFixed(2);
  led.setDotFill(v);
}
function syncAmount() {
  const n = parseInt(amtInput.value, 10);
  amtValue.textContent = String(n);
  fluid.setCount(n);
}
function syncParticleRadius() {
  const r = parseFloat(particleRInput.value);
  particleRValue.textContent = r.toFixed(3);
  fluid.setParticleRadius(r);
}
function syncColors() {
  led.setColors({
    liquid: liquidColorInput.value,
    background: screenColorInput.value,
  });
}
function syncRainbow() {
  led.setRainbow(rainbowInput.checked);
}
function syncGlow() {
  led.setGlow(glowInput.checked);
  led.setSpeedGlow(speedGlowInput.checked);
}
function syncGlowStrength() {
  const v = parseFloat(glowStrengthInput.value);
  glowStrengthValue.textContent = v.toFixed(1);
  led.setGlowStrength(v);
}
function syncSpeedRef() {
  const v = parseFloat(speedRefInput.value);
  speedRefValue.textContent = v.toFixed(1);
  led.setSpeedRef(v);
}
function syncWhitewater() {
  led.setWhitewater(whitewaterInput.checked);
}
function syncWhitewaterAmount() {
  const v = parseFloat(whitewaterAmountInput.value);
  whitewaterAmountValue.textContent = v.toFixed(2);
  led.setWhitewaterAmount(v);
}
function syncWhitewaterThreshold() {
  const v = parseFloat(whitewaterThresholdInput.value);
  whitewaterThresholdValue.textContent = v.toFixed(2);
  led.setWhitewaterThreshold(v);
}
function syncWhitewaterColor() {
  led.setWhitewaterColor(whitewaterColorInput.value);
}
function syncGravity() {
  settings.gravity = parseFloat(gravityInput.value);
  gravityValue.textContent = settings.gravity.toFixed(1);
}
function syncViscosity() {
  // viscosity 0..1 → damping 1.0..0.94. 0 = ideal fluid, 1 = thick.
  const v = parseFloat(viscosityInput.value);
  viscosityValue.textContent = v.toFixed(2);
  fluid.setDamping(1 - v * 0.06);
}
function syncBounce() {
  const r = parseFloat(bounceInput.value);
  bounceValue.textContent = r.toFixed(2);
  fluid.setRestitution(r);
}
function syncSpin() {
  settings.spinScale = parseFloat(spinInput.value);
  spinValue.textContent = settings.spinScale.toFixed(2);
}

resInput.addEventListener('input', syncResolution);
footprintInput.addEventListener('input', syncFootprint);
dotFillInput.addEventListener('input', syncDotFill);
amtInput.addEventListener('input', syncAmount);
particleRInput.addEventListener('input', syncParticleRadius);
liquidColorInput.addEventListener('input', syncColors);
screenColorInput.addEventListener('input', syncColors);
rainbowInput.addEventListener('change', syncRainbow);
glowInput.addEventListener('change', syncGlow);
glowStrengthInput.addEventListener('input', syncGlowStrength);
speedGlowInput.addEventListener('change', syncGlow);
speedRefInput.addEventListener('input', syncSpeedRef);
whitewaterInput.addEventListener('change', syncWhitewater);
whitewaterAmountInput.addEventListener('input', syncWhitewaterAmount);
whitewaterThresholdInput.addEventListener('input', syncWhitewaterThreshold);
whitewaterColorInput.addEventListener('input', syncWhitewaterColor);
gravityInput.addEventListener('input', syncGravity);
viscosityInput.addEventListener('input', syncViscosity);
bounceInput.addEventListener('input', syncBounce);
spinInput.addEventListener('input', syncSpin);

syncResolution();
syncFootprint();
syncDotFill();
syncColors();
syncRainbow();
syncGlow();
syncGlowStrength();
syncSpeedRef();
syncWhitewater();
syncWhitewaterAmount();
syncWhitewaterThreshold();
syncWhitewaterColor();
syncGravity();
syncViscosity();
syncBounce();
syncSpin();
// Order matters: set radius first so setCount's particle scatter uses it.
syncParticleRadius();
syncAmount();

// Vertical slider on the right edge. Slider value (0..360 degrees) sets an
// absolute rotation around the disc's local +Y axis (its screen normal).
// Negated so a higher slider position reads as clockwise when viewed from
// above. Composed on top of baseTarget each frame, so it persists across
// drag/gyro updates instead of being overwritten.
const deg2rad = Math.PI / 180;
(function wireSpinSlider() {
  const slider = $('spin-slider');
  function update() {
    manualSpinAngle = -parseFloat(slider.value) * deg2rad;
  }
  slider.addEventListener('input', update);
  update();
})();

// Phone gyroscope → disc orientation. iOS 13+ requires explicit permission
// granted from a user gesture, so we ask on the toggle's `change` event.
(function wireGyro() {
  const gyroInput = $('gyro');
  const deg2rad = Math.PI / 180;
  const gyroEuler = new THREE.Euler();
  const gyroTarget = new THREE.Quaternion();
  let listening = false;

  function onOrientation(e) {
    if (!gyroEnabled) return;
    if (e.beta == null && e.gamma == null) return;
    const beta = (e.beta || 0) * deg2rad;   // pitch (front-back tilt)
    const gamma = (e.gamma || 0) * deg2rad; // roll (left-right tilt)
    // Map: tilting top of phone away from user → disc top tilts away.
    // Tilting right edge of phone down → disc right edge tilts down.
    gyroEuler.set(beta, 0, -gamma, 'XYZ');
    gyroTarget.setFromEuler(gyroEuler);
    // Soft slerp to smooth out gyro noise.
    baseTarget.quaternion.slerp(gyroTarget, 0.18);
  }

  function attach() {
    if (listening) return;
    window.addEventListener('deviceorientation', onOrientation);
    listening = true;
  }

  async function enable() {
    const E = window.DeviceOrientationEvent;
    if (E && typeof E.requestPermission === 'function') {
      try {
        const result = await E.requestPermission();
        if (result !== 'granted') {
          gyroInput.checked = false;
          gyroEnabled = false;
          return;
        }
      } catch {
        gyroInput.checked = false;
        gyroEnabled = false;
        return;
      }
    } else if (typeof window.DeviceOrientationEvent === 'undefined') {
      gyroInput.checked = false;
      return;
    }
    attach();
    gyroEnabled = true;
  }

  gyroInput.addEventListener('change', () => {
    if (gyroInput.checked) enable();
    else gyroEnabled = false;
  });
})();

// Minimize / expand the parameter panel.
(function wirePanelToggle() {
  const panel = $('panel');
  const btn = $('panel-toggle');
  btn.addEventListener('click', () => {
    const minimized = panel.classList.toggle('minimized');
    btn.textContent = minimized ? '+' : '−';
    btn.setAttribute('aria-label', minimized ? 'Expand panel' : 'Minimize panel');
  });
})();

// Make the parameter panel a draggable floating window via its grip handle.
(function makePanelDraggable() {
  const panel = $('panel');
  const grip = $('panel-drag');
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let detached = false;

  function detachFromInitialPosition() {
    if (detached) return;
    const rect = panel.getBoundingClientRect();
    panel.style.transform = 'none';
    panel.style.bottom = 'auto';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    detached = true;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  grip.addEventListener('pointerdown', (e) => {
    dragging = true;
    detachFromInitialPosition();
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    grip.setPointerCapture(e.pointerId);
    panel.classList.add('dragging');
    e.preventDefault();
  });

  grip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    panel.style.left = `${clamp(startLeft + dx, 0, maxLeft)}px`;
    panel.style.top = `${clamp(startTop + dy, 0, maxTop)}px`;
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    grip.releasePointerCapture?.(e.pointerId);
    panel.classList.remove('dragging');
  }
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  // Keep the panel inside the viewport when the window resizes.
  window.addEventListener('resize', () => {
    if (!detached) return;
    const rect = panel.getBoundingClientRect();
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    panel.style.left = `${clamp(rect.left, 0, maxLeft)}px`;
    panel.style.top = `${clamp(rect.top, 0, maxTop)}px`;
  });
})();

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

// Per-frame: derive 2D gravity + spin from disc orientation, step sim, redraw.
const worldDown = new THREE.Vector3(0, -1, 0);
const localDown = new THREE.Vector3();
const invQ = new THREE.Quaternion();

// Angular velocity tracking: dq = qNew * qPrev^-1 in world space.
// For small angles dq ≈ (1, ω·dt/2), so ω = 2·dq.xyz / dt.
const prevQuat = new THREE.Quaternion().copy(disc.quaternion);
const prevInv = new THREE.Quaternion();
const dQuat = new THREE.Quaternion();
const omegaWorld = new THREE.Vector3();
const omegaLocal = new THREE.Vector3();

// Reused for slider→disc composition each frame.
const MANUAL_SPIN_AXIS = new THREE.Vector3(0, 1, 0);
const manualSpinQ = new THREE.Quaternion();
let smoothedOmegaY = 0;

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  controls.update();

  // Compose drag/gyro orientation with the slider's absolute rotation
  // around the disc's object-space +Y. Right-multiplying applies the
  // slider rotation first in object space, then the base orientation.
  manualSpinQ.setFromAxisAngle(MANUAL_SPIN_AXIS, manualSpinAngle);
  disc.quaternion.copy(baseTarget.quaternion).multiply(manualSpinQ);

  // worldDown rotated by inverse(disc.quaternion) → localDown in disc frame.
  invQ.copy(disc.quaternion).invert();
  localDown.copy(worldDown).applyQuaternion(invQ);
  // Disc top face is the local XZ plane. Map to fluid coords:
  //   fluid.x  ←  local +X
  //   fluid.y  ←  local -Z   (see cylinder.js for the uv axis derivation)
  fluid.setGravity(localDown.x * settings.gravity, -localDown.z * settings.gravity);

  // Angular velocity around the screen normal (disc local +Y).
  prevInv.copy(prevQuat).invert();
  dQuat.copy(disc.quaternion).multiply(prevInv);
  if (dt > 1e-6) {
    omegaWorld.set(dQuat.x, dQuat.y, dQuat.z).multiplyScalar(2 / dt);
    omegaLocal.copy(omegaWorld).applyQuaternion(invQ);
    // The fluid 2D frame's "z" axis = disc local +Y, so the in-plane spin
    // rate is omegaLocal.y. Smooth a bit to avoid frame-to-frame jitter.
    smoothedOmegaY = smoothedOmegaY * 0.6 + omegaLocal.y * 0.4;
    fluid.setSpin(smoothedOmegaY * settings.spinScale);
  }
  prevQuat.copy(disc.quaternion);

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
