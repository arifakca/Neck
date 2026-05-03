import * as THREE from 'three';

// Drag-to-rotate the target object. Builds rotation in WORLD space so the
// disc always rotates relative to the user's view, regardless of its current
// orientation. Releases with a soft inertia decay.
export function attachDragRotate(domElement, target, camera, {
  sensitivity = 0.008,
  inertiaDecay = 0.94,
} = {}) {
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let velX = 0;
  let velY = 0;

  const tmpRight = new THREE.Vector3();
  const tmpScratch1 = new THREE.Vector3();
  const tmpScratch2 = new THREE.Vector3();
  const tmpUp = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();

  function applyRotation(dx, dy) {
    // World-space rotation: yaw around world +Y from horizontal drag,
    // pitch around camera-right axis from vertical drag.
    camera.matrixWorld.extractBasis(tmpRight, tmpScratch1, tmpScratch2);

    tmpQ.setFromAxisAngle(tmpUp, dx * sensitivity);
    target.quaternion.premultiply(tmpQ);

    tmpQ.setFromAxisAngle(tmpRight, dy * sensitivity);
    target.quaternion.premultiply(tmpQ);
  }

  function onPointerDown(e) {
    if (dragging) return;
    dragging = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    velX = 0;
    velY = 0;
    domElement.setPointerCapture?.(pointerId);
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyRotation(dx, dy);
    velX = dx;
    velY = dy;
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    domElement.releasePointerCapture?.(pointerId);
    pointerId = null;
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);

  // Per-frame inertia step, called from the render loop.
  function update() {
    if (dragging) return;
    if (Math.abs(velX) < 0.01 && Math.abs(velY) < 0.01) {
      velX = 0;
      velY = 0;
      return;
    }
    applyRotation(velX, velY);
    velX *= inertiaDecay;
    velY *= inertiaDecay;
  }

  return { update };
}
