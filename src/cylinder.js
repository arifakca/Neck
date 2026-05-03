import * as THREE from 'three';

// Builds the gold disc with the LED screen on its top face.
// Returns a Group whose quaternion can be rotated freely; the LED screen
// uvs are arranged so the texture's local axes align with:
//   texture u (canvas x, left→right)   = disc local +X
//   texture v (canvas y, bottom→top)   = disc local -Z
// Pass that mapping when computing 2D gravity for the fluid.
export function buildDisc({ ledTexture, radius = 1.0, height = 0.18 } = {}) {
  const group = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc9a25a,
    metalness: 0.92,
    roughness: 0.28,
  });

  // Body: gold side + gold top cap (the screen will sit on top of the cap,
  // leaving a thin gold ring visible at the rim). Bottom cap stays gold too.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 96, 1, false),
    goldMat,
  );
  group.add(body);

  // The LED screen plane sits just above the cap; smaller than the cap so a
  // thin gold rim shows around it. A second mesh on the underside shows the
  // SAME fluid in the same world position — we flip the bottom face's V uvs
  // so a particle at fluid (fx, fy) lands at the same world (x, z) on either
  // face, instead of the natural mirror image.
  const screenMat = new THREE.MeshBasicMaterial({ map: ledTexture, toneMapped: false });
  const topGeom = new THREE.CircleGeometry(radius * 0.93, 96);
  const bottomGeom = topGeom.clone();
  const uv = bottomGeom.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;

  const topScreen = new THREE.Mesh(topGeom, screenMat);
  topScreen.rotation.x = -Math.PI / 2;
  topScreen.position.y = height / 2 + 0.0008;
  group.add(topScreen);

  const bottomScreen = new THREE.Mesh(bottomGeom, screenMat);
  bottomScreen.rotation.x = Math.PI / 2;
  bottomScreen.position.y = -height / 2 - 0.0008;
  group.add(bottomScreen);

  return group;
}
