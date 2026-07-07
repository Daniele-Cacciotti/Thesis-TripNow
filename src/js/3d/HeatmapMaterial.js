/**
 * HeatmapMaterial.js
 * Heatmap urbana 3D tramite vertex coloring su PlaneGeometry.
 */

import * as THREE from '../vendor/three.module.min.js';

// Colormap keyframes [t, r, g, b] — Aggiornata a schema "Ultra Premium" (Blue Tech -> Smeraldo -> Corallo)
const COLORMAP = [
    [0.0,  0.02, 0.02, 0.03],  // Sfondo trasparente/nero abissale
    [0.35, 0.22, 0.74, 0.97],  // Azzurro Tech (#38bdf8)
    [0.65, 0.20, 0.82, 0.60],  // Verde Smeraldo (#34d399)
    [1.0,  1.00, 0.43, 0.38],  // Rosso/Corallo (#FF6F61)
];

function sampleColormap(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < COLORMAP.length - 1; i++) {
        const [t0, r0, g0, b0] = COLORMAP[i];
        const [t1, r1, g1, b1] = COLORMAP[i + 1];
        if (t >= t0 && t <= t1) {
            const f = (t - t0) / (t1 - t0);
            return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
        }
    }
    return [1, 0, 0];
}

export class HeatmapMaterial {
    constructor(groundMesh, scene) {
        this._ground  = groundMesh;
        this._scene   = scene;
        this._overlay = null;
        this._worker  = null;
        this._metric  = 'crowd';
        this._visible = false;
        this._buildOverlay();
        this._initWorker();
    }

    _buildOverlay() {
        const geo = new THREE.PlaneGeometry(24, 24, 32, 32);
        geo.rotateX(-Math.PI / 2);

        const count  = geo.attributes.position.count;
        const colors = new Float32Array(count * 3).fill(0);
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.ShaderMaterial({
            vertexColors: true,
            transparent:  true,
            depthWrite:   false,
            vertexShader: `
                attribute vec3 color;
                varying   vec3 vColor;
                void main() {
                    vColor      = color;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                uniform float uOpacity;
                void main() {
                    float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
                    if (lum < 0.05) discard;
                    gl_FragColor = vec4(vColor, uOpacity);
                }
            `,
            uniforms: {
                uOpacity: { value: 0.72 },
            },
        });

        this._overlay = new THREE.Mesh(geo, mat);
        this._overlay.position.y = 0.03; 
        this._overlay.visible    = false;
        this._scene.add(this._overlay);
    }

    _initWorker() {
        try {
            this._worker = new Worker('/src/js/3d/scene-worker.js');
            this._worker.onmessage = ({ data }) => {
                if (data.type === 'heatmapScores') {
                    this._applyScores(data.scores);
                }
            };
            this._worker.onerror = (e) => {
                console.warn('[HeatmapMaterial] Worker error:', e.message);
                this._worker = null;
            };
        } catch {
            this._worker = null;
        }
    }

    update(monthScores, metric = 'crowd') {
        this._metric  = metric;
        this._visible = true;
        this._overlay.visible = true;

        const geo       = this._overlay.geometry;
        const positions = geo.attributes.position.array;
        const numVerts  = geo.attributes.position.count;
        const gridW     = 33; 

        if (this._worker) {
            this._worker.postMessage({
                type:        'computeHeatmapScores',
                monthScores,
                numVerts,
                gridW,
                positions:   Array.from(positions),
            });
        } else {
            const scores = this._computeScores(monthScores, numVerts, gridW, positions);
            this._applyScores(scores);
        }
    }

    _computeScores(monthScores, numVerts, gridW, positions) {
        const scores = new Float32Array(numVerts);
        const baseScore = monthScores.reduce((s, v) => s + v, 0) / monthScores.length;

        for (let i = 0; i < numVerts; i++) {
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];
            const dist  = Math.sqrt(x * x + z * z);
            const radial = Math.exp(-dist * 0.08); 
            const noise  = 0.15 * Math.sin(x * 1.2) * Math.cos(z * 0.9);
            scores[i]    = Math.max(0, Math.min(1, baseScore * (0.6 + 0.4 * radial) + noise));
        }
        return scores;
    }

    _applyScores(scores) {
        const geo    = this._overlay.geometry;
        const colors = geo.attributes.color.array;

        for (let i = 0; i < scores.length; i++) {
            const [r, g, b] = sampleColormap(scores[i]);
            colors[i * 3]     = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        geo.attributes.color.needsUpdate = true;

        let opacity = 0;
        const fade = () => {
            opacity = Math.min(0.72, opacity + 0.03);
            this._overlay.material.uniforms.uOpacity.value = opacity;
            if (opacity < 0.72) requestAnimationFrame(fade);
        };
        this._overlay.material.uniforms.uOpacity.value = 0;
        fade();
    }

    setVisible(visible) {
        this._visible = visible;
        if (this._overlay) this._overlay.visible = visible;
    }

    attachToModel(model) {
        const box  = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const s    = Math.max(size.x, size.z) / 24;
        this._overlay.scale.set(s, 1, s);
    }

    dispose() {
        if (this._worker) this._worker.terminate();
        this._overlay?.geometry.dispose();
        this._overlay?.material.dispose();
        this._scene.remove(this._overlay);
    }
}