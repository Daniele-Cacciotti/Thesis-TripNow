/**
 * DestinationScene.js — Engine Three.js parametrizzato per le pagine destinazione.
 * Fallback offline 3D procedurale. Colori aggiornati al design "Ultra Premium".
 */

import * as THREE        from '../vendor/three.module.min.js';
import { GLTFLoader }    from '../vendor/GLTFLoader.js';
import { DRACOLoader }   from '../vendor/DRACOLoader.js';
import { CSS2DRenderer } from '../vendor/CSS2DRenderer.js';
import { POIMarker }     from './POIMarker.js';
import { HeatmapMaterial } from './HeatmapMaterial.js';

export class DestinationScene {
    constructor(canvas, config) {
        this.canvas      = canvas;
        this.config      = config;
        this.modelLoaded = false;
        this.phase       = 0;
        this._poiMarkers = [];
        this._routeLine  = null;
        this._heatmap    = null;
        this._animFrame  = null;
        this._clock      = new THREE.Clock();
    }

    init() {
        this._setupRenderer();
        this._setupScene();
        this._setupCamera();
        this._setupLights();
        this._buildPlaceholderCity();
        this._startRenderLoop();
        this._setupResizeObserver();
        this._lazyLoadModel();
    }

    _setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas:    this.canvas,
            antialias: true,
            alpha:     false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h, false);

        this.renderer.shadowMap.enabled      = true;
        this.renderer.shadowMap.type         = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping            = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure    = 1.2;
        this.renderer.outputColorSpace       = THREE.SRGBColorSpace;
    }

    _setupScene() {
        this.scene = new THREE.Scene();
        // Sfondo Abissale Tech
        this.scene.background = new THREE.Color(0x050508);
        this.scene.fog        = new THREE.FogExp2(0x050508, 0.008); 

        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(w, h);
        this.labelRenderer.domElement.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
        this.canvas.parentElement.appendChild(this.labelRenderer.domElement);
    }

    _setupCamera() {
        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500);
        this.camera.position.set(0, 18, 22);
        this.camera.lookAt(0, 0, 0);
    }

    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

        this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.0);
        this.sunLight.position.set(12, 20, 10);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(1024, 1024);
        this.sunLight.shadow.camera.near   = 0.5;
        this.sunLight.shadow.camera.far    = 80;
        this.sunLight.shadow.camera.left   = -20;
        this.sunLight.shadow.camera.right  =  20;
        this.sunLight.shadow.camera.top    =  20;
        this.sunLight.shadow.camera.bottom = -20;
        this.scene.add(this.sunLight);

        const accent = new THREE.PointLight(
            new THREE.Color(this.config.accentColor || '#FF6F61'), 1.2, 40
        );
        accent.position.set(-8, 8, -8);
        this.scene.add(accent);

        this.scene.add(new THREE.HemisphereLight(0x0a0a15, 0x050508, 0.8));
    }

    _buildPlaceholderCity() {
        this._placeholderGroup = new THREE.Group();

        const accent   = new THREE.Color(this.config.accentColor || '#FF6F61');
        const base     = new THREE.Color(0x1a1a2e); // Palazzi scuri tech
        const glassClr = new THREE.Color(0x38bdf8); // Vetrate azzurre

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(28, 28, 32, 32),
            new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.95 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.name = 'ground';
        this._placeholderGroup.add(ground);
        this._groundMesh = ground;

        const seed = this._hashStr(this.config.destination);
        const rand = this._seededRand(seed);

        const positions = [
            [-4.5, 3], [-2.5, 4], [0, 5.5], [2.5, 3.5], [4.5, 4],
            [-5,   1], [-3,   2], [-1,   2], [1,   3],  [3,   2], [5, 1],
            [-4.5,-1], [-2.5,-2], [0,   -1], [2.5, -2], [4.5,-1],
            [-3,  -4], [-1,  -3], [1,   -3], [3,   -4],
        ];

        for (const [x, z] of positions) {
            const h  = 0.6 + rand() * 4;
            const wx = 0.5 + rand() * 0.9;
            const wz = 0.5 + rand() * 0.9;
            const t  = rand();
            const clr = t > 0.85 ? accent
                        : t > 0.7  ? glassClr
                        : base.clone().lerp(new THREE.Color(0x10101a), rand());

            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(wx, h, wz),
                new THREE.MeshStandardMaterial({
                    color:     clr,
                    emissive: clr.clone().multiplyScalar(0.2),
                    roughness: 0.5 + rand() * 0.3,
                    metalness: 0.2 + rand() * 0.4,
                })
            );
            mesh.position.set(x + (rand() - 0.5) * 0.5, h / 2, z + (rand() - 0.5) * 0.5);
            mesh.castShadow    = true;
            mesh.receiveShadow = true;
            this._placeholderGroup.add(mesh);
        }

        const landmark = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.55, 6, 8),
            new THREE.MeshStandardMaterial({
                color:    accent,
                emissive: accent.clone().multiplyScalar(0.4), // Più luminoso
                roughness: 0.2, metalness: 0.8,
            })
        );
        landmark.position.set(0, 3, 0);
        landmark.castShadow = true;
        landmark.name = 'landmark';
        this._placeholderGroup.add(landmark);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.4, 0.05, 8, 64),
            new THREE.MeshStandardMaterial({
                color: 0x38bdf8, // Azzurro tech
                emissive: new THREE.Color(0x38bdf8).multiplyScalar(0.6),
            })
        );
        ring.position.y = 0.05;
        ring.rotation.x = -Math.PI / 2;
        ring.name = 'ring';
        this._placeholderGroup.add(ring);

        const grid = new THREE.GridHelper(28, 28, 0x1a1a3e, 0x0d0d1a);
        grid.position.y = 0.01;
        this._placeholderGroup.add(grid);

        this.scene.add(this._placeholderGroup);
    }

    _startRenderLoop() {
        const tick = () => {
            this._animFrame = requestAnimationFrame(tick);
            const delta = this._clock.getDelta();

            if (this.phase === 0) {
                if (this._placeholderGroup) this._placeholderGroup.rotation.y += delta * 0.08;
                if (this._model)            this._model.rotation.y            += delta * 0.08;
            }

            const ring = this._placeholderGroup?.getObjectByName('ring');
            if (ring) ring.rotation.z += delta * 0.45;

            if (this._routeLine) this._animateRouteLine(delta);

            this.renderer.render(this.scene, this.camera);
            this.labelRenderer.render(this.scene, this.camera);
        };
        tick();
    }

    _setupResizeObserver() {
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = (entry.contentRect?.width  || this.canvas.clientWidth  || window.innerWidth);
                const h = (entry.contentRect?.height || this.canvas.clientHeight || window.innerHeight);
                if (w === 0 || h === 0) return;
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(w, h, false);
                this.labelRenderer.setSize(w, h);
            }
        });
        ro.observe(this.canvas.parentElement);
    }

    _lazyLoadModel() {
        if (!this.config.modelPath) return;

        const section = this.canvas.closest('#destination-3d-scene')
                     || this.canvas.parentElement.parentElement;

        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            const loadUI = this.canvas.parentElement.querySelector('.model-loading-ui');
            if (loadUI) loadUI.style.display = 'flex';
            this._loadGLTF(this.config.modelPath);
        }, { threshold: 0 });
        observer.observe(section);
    }

    async _loadGLTF(path) {
        try {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('/src/js/vendor/draco/');

            const loader = new GLTFLoader();
            loader.setDRACOLoader(dracoLoader);

            const gltf = await new Promise((resolve, reject) => {
                loader.load(path, resolve, (xhr) => {
                    if (xhr.total > 0) {
                        const pct = Math.round((xhr.loaded / xhr.total) * 100);
                        const bar = this.canvas.parentElement.querySelector('.model-load-bar');
                        if (bar) bar.style.width = `${pct}%`;
                    }
                }, reject);
            });

            const box    = new THREE.Box3().setFromObject(gltf.scene);
            const size   = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const scale  = 12 / Math.max(size.x, size.y, size.z, 0.01);

            gltf.scene.scale.setScalar(scale);
            gltf.scene.position.copy(center.multiplyScalar(-scale));
            gltf.scene.position.y = 0;
            gltf.scene.traverse(node => {
                if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
            });

            this.scene.remove(this._placeholderGroup);
            this.scene.add(gltf.scene);
            this._model      = gltf.scene;
            this.modelLoaded = true;

            if (this._heatmap) this._heatmap.attachToModel(gltf.scene);

        } catch (err) {
            console.warn(`[DestinationScene] Modello non disponibile (${path}) — uso placeholder:`, err.message);
        } finally {
            const loadUI = this.canvas.parentElement.querySelector('.model-loading-ui');
            if (loadUI) loadUI.style.display = 'none';
        }
    }

    setCameraPreset(presetName, progress = 1) {
        const PRESETS = {
            orbital_far:  { pos: [0, 18, 22],    target: [0, 0, 0] },
            aerial_medium:{ pos: [0, 12, 14],    target: [0, 0, 0] },
            aerial_close: { pos: [0,  8,  9],    target: [0, 1, 0] },
            follow_route: { pos: [-5, 6,  8],    target: [0, 1, 0] },
            top_down:     { pos: [0, 22,  0.1],  target: [0, 0, 0] },
            side_view:    { pos: [16, 7,  0],    target: [0, 2, 0] },
            ground_level: { pos: [0,  2, 10],    target: [0, 1, 0] },
        };
        const p = PRESETS[presetName];
        if (!p) return;

        const lf = 0.04 + progress * 0.08;
        this.camera.position.lerp(new THREE.Vector3(...p.pos), lf);

        const lookAt = new THREE.Vector3(...p.target);
        const dir    = lookAt.clone().sub(this.camera.position).normalize();
        const curDir = new THREE.Vector3();
        this.camera.getWorldDirection(curDir);
        curDir.lerp(dir, lf);
        this.camera.lookAt(this.camera.position.clone().add(curDir));
    }

    setPhase(phase) {
        this.phase = phase;
        this.canvas.parentElement.dispatchEvent(
            new CustomEvent('scene3d:phaseChange', { bubbles: true, detail: { phase } })
        );
    }

    setPOIsVisible(visible) {
        this._poiMarkers.forEach(m => m.setVisible(visible));
    }

    addPOI(poi) {
        const marker = new POIMarker(poi, this.scene, this.config.accentColor);
        this._poiMarkers.push(marker);
    }

    showRoute(waypoints) {
        if (this._routeLine) this.scene.remove(this._routeLine);
        if (!waypoints || waypoints.length < 2) return;

        const pts  = waypoints.map(w => new THREE.Vector3(w.x, w.y ?? 0.3, w.z));
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.06, 8, false);
        const mat  = new THREE.MeshStandardMaterial({
            color:     new THREE.Color(this.config.accentColor || '#FF6F61'),
            emissive:  new THREE.Color(this.config.accentColor || '#FF6F61').multiplyScalar(0.8), // Più glowing
            roughness: 0.1, metalness: 0.8,
            transparent: true, opacity: 0,
        });
        this._routeLine = new THREE.Mesh(tube, mat);
        this._routeLine.userData.progress = 0;
        this.scene.add(this._routeLine);
    }

    _animateRouteLine(delta) {
        const p = Math.min(1, this._routeLine.userData.progress + delta * 0.5);
        this._routeLine.userData.progress    = p;
        this._routeLine.material.opacity     = p;
    }

    updateHeatmap(crowdScores, metric) {
        if (!this._heatmap) {
            this._heatmap = new HeatmapMaterial(this._groundMesh, this.scene);
        }
        this._heatmap.update(crowdScores, metric);
    }

    destroy() {
        if (this._animFrame) cancelAnimationFrame(this._animFrame);
        if (this._heatmap)   this._heatmap.dispose();
        this.renderer.dispose();
        this.scene.clear();
        if (this.labelRenderer?.domElement?.parentNode) {
            this.labelRenderer.domElement.remove();
        }
    }

    _hashStr(str) {
        let h = 0;
        for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
        return Math.abs(h);
    }

    _seededRand(seed) {
        let s = seed;
        return () => {
            s = (s * 1664525 + 1013904223) & 0xffffffff;
            return (s >>> 0) / 0xffffffff;
        };
    }
}