import * as THREE from 'three';
import { profileContour } from './profiles.js';

export function createPartMesh(part) {
  const g = part.geometry;
  let geometry, material, edgeGeometry, edgeMaterial;
  try {
    if (g.kind === 'revolve') {
      geometry = new THREE.LatheGeometry(
        profileContour(g).map(([r, z]) => new THREE.Vector2(r, -z)),
        128,
      );
    } else {
      const outline = new THREE.Shape(g.points.map(([x, r]) => new THREE.Vector2(r + g.radius, -x)));
      geometry = new THREE.ExtrudeGeometry(outline, {
        depth: g.thickness,
        bevelEnabled: false,
        curveSegments: 32,
      });
      geometry.translate(-g.radius, 0, -g.thickness / 2);
      geometry.rotateX((g.cant * Math.PI) / 180);
      geometry.translate(g.radius, 0, 0);
      geometry.rotateY((-g.angle * Math.PI) / 180);
    }
    geometry.computeVertexNormals();
    material = new THREE.MeshStandardMaterial({
      color: part.color,
      roughness: 0.44,
      metalness: 0.23,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
    edgeMaterial = new THREE.LineBasicMaterial({ color: '#708294', transparent: true, opacity: 0.4 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);
    mesh.userData.part = part;
    mesh.position.set(part.position[0], -part.position[2], part.position[1]);
    return mesh;
  } catch (error) {
    geometry?.dispose();
    material?.dispose();
    edgeGeometry?.dispose();
    edgeMaterial?.dispose();
    throw error;
  }
}
export function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
  group.clear();
}
