/**
 * destination-init.js
 * Bootstrap del sistema 3D immersivo per le pagine destinazione di TripNow.
 */

import { DestinationScene }  from './DestinationScene.js';
import { ScrollNarrative }   from './ScrollNarrative.js';
import { POI_DATA }          from './POIMarker.js';
import { PredictivePanel }   from '../predictive/PredictivePanel.js';
import { BehavioralTracker } from '../recommendation/BehavioralTracker.js';

document.addEventListener('DOMContentLoaded', async () => {
    const wrapper = document.getElementById('destination-3d-scene');
    if (!wrapper) return;

    const destination = wrapper.dataset.destination;
    const lat         = parseFloat(wrapper.dataset.lat);
    const lon         = parseFloat(wrapper.dataset.lon);
    const modelPath   = wrapper.dataset.modelPath || '';

    if (!destination || isNaN(lat) || isNaN(lon)) return;

    const tracker = new BehavioralTracker(destination);

    const predictiveContainer = wrapper.querySelector('#predictive-panel');
    let predictivePanel = null;
    if (predictiveContainer) {
        predictivePanel = new PredictivePanel(predictiveContainer, destination, { lat, lon });
        try { await predictivePanel.init(); } catch (e) {
            console.warn('[destination-init] PredictivePanel non disponibile:', e.message);
        }
    }

    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent').trim() || '#FF6F61';

    const viewport = wrapper.querySelector('.scene-viewport');
    const pois     = POI_DATA[destination] || [];

    let scene;
    let usingMaps = false;

    if (window.GOOGLE_MAPS_KEY) {
        try {
            const { GoogleMapsScene } = await import('./GoogleMapsScene.js');
            scene = new GoogleMapsScene(viewport, { destination, lat, lon, accentColor });
            await scene.init();
            usingMaps = true;
            const canvas = wrapper.querySelector('#three-canvas');
            if (canvas) canvas.style.display = 'none';
        } catch (err) {}
    }

    if (!usingMaps) {
        const canvas = wrapper.querySelector('#three-canvas');
        if (!canvas || !isWebGLAvailable()) {
            wrapper.classList.add('webgl-unavailable');
            return;
        }
        scene = new DestinationScene(canvas, { destination, lat, lon, modelPath, accentColor });
        scene.init();
    }

    pois.forEach(poi => scene.addPOI(poi));

    const heatmapData = predictivePanel?.getData()?.crowdScore || new Array(12).fill(0.5);

    const narrative = new ScrollNarrative(scene, wrapper, {
        routeWaypoints: pois,
        heatmapData,
        predictivePanel: predictiveContainer,
    });
    await narrative.init();

    wrapper.addEventListener('predictive:monthChange', () => {
        if (predictivePanel?.getData()) {
            scene.updateHeatmap(predictivePanel.getData().crowdScore, 'crowd');
        }
    });

    wrapper.addEventListener('scene3d:loadprogress', (e) => {
        const bar = wrapper.querySelector('.model-load-bar');
        if (bar) bar.style.width = `${e.detail.pct}%`;
    });
    wrapper.addEventListener('scene3d:modelready', () => {
        const loadUI = wrapper.querySelector('.model-loading-ui');
        if (loadUI) loadUI.style.display = 'none';
    });

    window.addEventListener('beforeunload', () => {
        scene.destroy();
        narrative.destroy();
        tracker.destroy();
    });
});

function isWebGLAvailable() {
    try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
}