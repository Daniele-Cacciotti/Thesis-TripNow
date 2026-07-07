/**
 * POIMarker.js
 * Marker CSS2D per i Punti di Interesse nella scena Three.js.
 */

import * as THREE from '../vendor/three.module.min.js';
import { CSS2DObject } from '../vendor/CSS2DRenderer.js';
export { POI_DATA, CITY_COORDS, CATEGORY_LABELS } from './poi-data.js';

export class POIMarker {
    constructor(poi, scene, accentColor = '#FF6F61') {
        this.poi      = poi;
        this.scene    = scene;
        this._color   = accentColor;
        this._visible = false;
        this._build();
    }

    _build() {
        const color = new THREE.Color(this._color);

        // Sfera 3D glowing come base del marker
        const geo = new THREE.SphereGeometry(0.2, 16, 16);
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: color.clone().multiplyScalar(0.8), // Look olografico
            roughness: 0.1, metalness: 0.5,
        });
        this._sphere = new THREE.Mesh(geo, mat);
        this._sphere.position.set(this.poi.x, 0.2, this.poi.z);
        this._sphere.visible = false;
        this._sphere.castShadow = true;

        // Linea verticale
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(this.poi.x, 0,    this.poi.z),
            new THREE.Vector3(this.poi.x, 0.2, this.poi.z),
        ]);
        const lineMat = new THREE.LineBasicMaterial({
            color, opacity: 0.5, transparent: true,
        });
        this._line         = new THREE.Line(lineGeo, lineMat);
        this._line.visible = false;

        // Label HTML via CSS2DObject
        this._label          = document.createElement('div');
        this._label.className = 'poi-label';
        // Style iniettato per compatibilità col design dark
        this._label.style.cssText = `
            background: rgba(10,10,15,0.8);
            border: 1px solid ${this._color}66;
            color: #fff;
            padding: 4px 8px;
            border-radius: 8px;
            font-family: 'Poppins', sans-serif;
            font-size: 12px;
            font-weight: 600;
            backdrop-filter: blur(8px);
            pointer-events: none;
            display: none;
            align-items: center;
            gap: 4px;
        `;
        this._label.innerHTML = `<span class="poi-icon">${this.poi.icon}</span><span class="poi-name">${this.poi.name}</span>`;

        this._css2d = new CSS2DObject(this._label);
        this._css2d.position.set(this.poi.x, 0.6, this.poi.z);

        this.scene.add(this._sphere);
        this.scene.add(this._line);
        this.scene.add(this._css2d);
    }

    setVisible(visible) {
        if (this._visible === visible) return;
        this._visible = visible;

        this._sphere.visible = visible;
        this._line.visible   = visible;
        this._label.style.display = visible ? 'flex' : 'none';

        if (visible) {
            this._sphere.scale.setScalar(0.01);
            this._animateIn();
        }
    }

    _animateIn() {
        const start   = performance.now();
        const animate = (now) => {
            const t     = Math.min((now - start) / 400, 1);
            const scale = 0.01 + 0.99 * (1 - Math.pow(1 - t, 3));
            this._sphere.scale.setScalar(scale);
            if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    getName() { return this.poi.name; }
    getIcon()  { return this.poi.icon; }
}