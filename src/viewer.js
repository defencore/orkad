import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { profileContour } from './profiles.js';

export class RocketViewer {
  constructor(container, onSelect, onError) {
    this.container = container;
    this.onSelect = onSelect;
    this.meshes = [];
    this.hidden = new Set();
    this.mode = 'solid';
    this.explode = 0;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      onError('WebGL is unavailable. Enable hardware acceleration to preview the model. CAD exports are still available.');
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1c2228, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.localClippingEnabled = true;
    container.prepend(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive rocket model. Drag to orbit, scroll to zoom, right-drag to pan.');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb4bdc6, 1.7));
    for (const [position, intensity, color] of [[[500, 500, 600], 2.7, 0xffffff], [[-600, 0, 250], 1.5, 0xe3edfa], [[300, -600, -500], 1.6, 0xffffff]]) {
      const light = new THREE.DirectionalLight(color, intensity);
      light.position.set(...position);
      this.scene.add(light);
    }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.raycaster = new THREE.Raycaster();
    let down;
    this.renderer.domElement.addEventListener('pointerdown', (event) => { down = [event.clientX, event.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', (event) => {
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const point = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(point, this.camera);
      const hit = this.raycaster.intersectObjects(this.meshes.filter((m) => m.visible), false).find((h) => !this.section || h.point.z <= 0);
      if (hit) this.onSelect(hit.object.userData.part.sourceNodeId);
    });
    this.frame = null;
    this.requestRender = () => {
      if (this.frame !== null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        const moving = this.controls.update();
        this.renderer.render(this.scene, this.camera);
        if (moving) this.requestRender();
      });
    };
    this.controls.addEventListener('change', this.requestRender);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.requestRender();
  }

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.requestRender?.();
  }

  load(payload, reset = true) {
    this.payload = payload;
    if (!this.renderer) return;
    this.meshes.forEach((mesh) => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.children.forEach((child) => { child.geometry.dispose(); child.material.dispose(); }); });
    this.group.clear();
    this.meshes = payload.parts.map((part) => {
      const g = part.geometry;
      let geometry;
      if (g.kind === 'revolve') {
        geometry = new THREE.LatheGeometry(profileContour(g).map(([r, z]) => new THREE.Vector2(r, -z)), 128);
      } else {
        const outline = new THREE.Shape(g.points.map(([x, r]) => new THREE.Vector2(r + g.radius, -x)));
        geometry = new THREE.ExtrudeGeometry(outline, { depth: g.thickness, bevelEnabled: false, curveSegments: 32 });
        geometry.translate(-g.radius, 0, -g.thickness / 2);
        geometry.rotateX(g.cant * Math.PI / 180);
        geometry.translate(g.radius, 0, 0);
        geometry.rotateY(-g.angle * Math.PI / 180);
      }
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.44, metalness: 0.23, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), new THREE.LineBasicMaterial({ color: '#708294', transparent: true, opacity: 0.4 }));
      mesh.add(edges);
      mesh.userData.part = part;
      mesh.position.set(part.position[0], -part.position[2], part.position[1]);
      this.group.add(mesh);
      return mesh;
    });
    this.bounds = new THREE.Box3().setFromObject(this.group);
    this.applyDisplay();
    if (reset) this.fit('iso');
  }

  fit(view = 'iso') {
    if (!this.renderer || !this.bounds) return;
    const center = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());
    const distance = Math.max(size.y, size.x / this.camera.aspect, size.z / this.camera.aspect) / (2 * Math.tan(this.camera.fov * Math.PI / 360)) * 1.25;
    const direction = { front: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), top: new THREE.Vector3(0, 1, 0.001), iso: new THREE.Vector3(0.65, 0.24, 1).normalize() }[view];
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(size.y * 0.05, 10);
    this.controls.maxDistance = distance * 8;
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  select(ids) { this.selected = new Set(Array.isArray(ids) ? ids : [ids]); this.applyDisplay(); }

  applyDisplay() {
    for (const [i, mesh] of this.meshes.entries()) {
      const part = mesh.userData.part;
      mesh.visible = !this.hidden.has(part.sourceNodeId);
      const selected = this.selected?.has(part.sourceNodeId);
      mesh.material.color.set(this.mode === 'wire' ? '#5b7084' : part.color);
      mesh.material.emissive.set(selected ? '#215b8c' : '#000000');
      mesh.material.emissiveIntensity = selected ? 0.16 : 0;
      mesh.material.wireframe = this.mode === 'wire';
      mesh.material.transparent = this.mode === 'xray';
      mesh.material.opacity = this.mode === 'xray' ? (part.internal ? 0.85 : 0.22) : 1;
      mesh.material.depthWrite = this.mode !== 'xray' || part.internal;
      mesh.material.clippingPlanes = this.section ? [this.clippingPlane] : [];
      mesh.material.needsUpdate = true;
      mesh.children.forEach((edge) => { edge.visible = this.mode !== 'wire'; edge.material.clippingPlanes = this.section ? [this.clippingPlane] : []; edge.material.opacity = this.mode === 'xray' ? 0.15 : 0.4; edge.material.needsUpdate = true; });
      const offset = this.explode * (i / Math.max(this.meshes.length - 1, 1)) * (this.bounds?.getSize(new THREE.Vector3()).y || 900) * 0.35;
      mesh.position.y = -part.position[2] - offset;
      if (this.explode && part.geometry.kind === 'fin') {
        const angle = part.geometry.angle * Math.PI / 180;
        mesh.position.x = part.position[0] + Math.cos(angle) * this.explode * 90;
        mesh.position.z = part.position[1] + Math.sin(angle) * this.explode * 90;
      } else { mesh.position.x = part.position[0]; mesh.position.z = part.position[1]; }
    }
    this.requestRender?.();
  }
}
