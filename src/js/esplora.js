/**
 * esplora.js — City Explorer TripNow
 *
 * Mappa satellite interattiva, route builder con API stradale Google Maps (Walking),
 * e Heatmap integrata dinamicamente con il pannello predittivo.
 */

import { GoogleMapsScene }                        from './3d/GoogleMapsScene.js';
import { PredictivePanel }                        from './predictive/PredictivePanel.js';
import { POI_DATA, CITY_COORDS, CATEGORY_LABELS } from './3d/poi-data.js';

// ── Stato globale ─────────────────────────────────────────────────────────────
let scene            = null;
let destination      = '';
let allPOIs          = [];
let activeCategories = new Set();
let routeNodes       = [];
let heatmapData      = null;
let currentMetric    = 'crowd'; 
let predictivePanel  = null;

// Routing API
let directionsService = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(location.search);
    destination  = params.get('dest') || 'Roma';

    const cityCoords = CITY_COORDS[destination];
    if (!cityCoords) {
        document.body.innerHTML = `<p style="color:#f55;padding:40px">Destinazione non trovata: ${destination}</p>`;
        return;
    }

    document.title = `Esplora ${destination} — TripNow`;
    const titleEl = document.getElementById('explorer-title');
    if (titleEl) titleEl.textContent = `Esplora ${destination}`;

    const backLink = document.getElementById('explorer-back');
    if (backLink) {
        backLink.href = _destToFile(destination);
        const label = backLink.querySelector('.back-label');
        if(label) label.textContent = destination;
    }

    allPOIs = POI_DATA[destination] || [];
    const mapContainer = document.getElementById('explorer-map');
    const accentColor  = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#FF6F61';

    try {
        scene = new GoogleMapsScene(mapContainer, {
            destination,
            lat:         cityCoords.lat,
            lon:         cityCoords.lon,
            zoom:        cityCoords.zoom,
            accentColor,
            interactive: true,
        });
        await scene.init();

        // Inizializza il calcolatore di percorsi reali (su strade) di Google
        if (window.google?.maps?.DirectionsService) {
            directionsService = new google.maps.DirectionsService();
        }

        allPOIs.forEach(poi => {
            scene.addPOIWithClick(poi, (clickedPoi) => _onPOIClickOnMap(clickedPoi));
        });

        scene.filterPOIsByCategory([]);
        scene.setPOIsVisible(true);

    } catch (err) {
        console.error('[esplora] Google Maps error:', err);
    }

    // Inizializzazione Pannello Predittivo
    const predictiveEl = document.getElementById('explorer-predictive');
    if (predictiveEl) {
        predictivePanel = new PredictivePanel(predictiveEl, destination, { lat: cityCoords.lat, lon: cityCoords.lon });
        try {
            await predictivePanel.init();
            heatmapData = predictivePanel.getData();
            _applyHeatmap(); // Applica subito la heatmap al primo caricamento
        } catch {}
    }

    _buildCategoryFilters();
    _buildPOIGrid();
    _buildRoutePanel();
    _buildHeatmapPanel();
    _setupTabs();
});

function _destToFile(dest) {
    const map = {
        'Roma': 'Roma.html', 'Parigi': 'Parigi.html', 'Istanbul': 'Istanbul.html',
        'Il Cairo': 'Il_Cairo.html', 'New York': 'New_York.html',
        'San Francisco': 'San_Francisco.html', 'Rio de Janeiro': 'rio_de_janeiro.html',
        'Petra': 'Petra.html', 'Cuzco': 'Cuzco.html',
    };
    return map[dest] || 'homepage.html';
}

function _setupTabs() {
    document.querySelectorAll('.explorer-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.explorer-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.panel)?.classList.add('active');
        });
    });
}

function _buildCategoryFilters() {
    const container = document.getElementById('filter-chips');
    if (!container) return;

    const categories = [...new Set(allPOIs.map(p => p.category).filter(Boolean))];

    categories.forEach(cat => {
        const info = CATEGORY_LABELS[cat] || { label: cat, emoji: '📍' };
        const chip = document.createElement('button');
        chip.className = 'filter-chip';
        chip.dataset.cat = cat;
        chip.innerHTML = `${info.emoji} ${info.label}`;
        chip.addEventListener('click', () => _toggleCategoryFilter(cat, chip));
        container.appendChild(chip);
    });
}

function _toggleCategoryFilter(cat, chip) {
    if (activeCategories.has(cat)) {
        activeCategories.delete(cat);
        chip.classList.remove('active');
    } else {
        activeCategories.add(cat);
        chip.classList.add('active');
    }

    const toShow = activeCategories.size === 0 ? [] : [...activeCategories];
    if (scene) scene.filterPOIsByCategory(toShow);
    _renderPOIGrid();
}

function _buildPOIGrid() { _renderPOIGrid(); }

function _renderPOIGrid() {
    const grid = document.getElementById('poi-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = activeCategories.size === 0 ? allPOIs : allPOIs.filter(p => activeCategories.has(p.category));

    filtered.forEach(poi => {
        const card = document.createElement('div');
        card.className = 'poi-card';
        card.innerHTML = `
            <span class="poi-card-icon">${poi.icon}</span>
            <span class="poi-card-name">${poi.name}</span>
            <span class="poi-card-cat">${CATEGORY_LABELS[poi.category]?.label || poi.category}</span>
        `;
        card.addEventListener('click', () => {
            if (scene?._map) {
                scene._map.panTo({ lat: poi.lat, lng: poi.lon });
                scene._map.setZoom(17);
            }
            document.querySelectorAll('.poi-card').forEach(c => c.classList.remove('focused-on-map'));
            card.classList.add('focused-on-map');
        });
        grid.appendChild(card);
    });

    if (filtered.length === 0) grid.innerHTML = '<p style="color:#778;font-size:13px;grid-column:1/-1">Nessun POI per questa categoria.</p>';
}

// ── Route Builder (Aggiornato con Directions API reale) ──────────────────────
function _buildRoutePanel() {
    const container = document.getElementById('route-poi-list');
    if (!container) return;

    allPOIs.forEach(poi => {
        const item = document.createElement('div');
        item.className = 'route-poi-item';
        item.dataset.poiName = poi.name;
        item.innerHTML = `
            <span class="rp-icon">${poi.icon}</span>
            <span class="rp-name">${poi.name}</span>
            <span class="rp-check"><i class="fas fa-check-circle"></i></span>
        `;
        item.addEventListener('click', () => _toggleRouteNode(poi, item));
        container.appendChild(item);
    });

    document.getElementById('btn-clear-route')?.addEventListener('click', _clearRoute);
}

function _toggleRouteNode(poi, itemEl) {
    const idx = routeNodes.findIndex(n => n.name === poi.name);
    if (idx >= 0) {
        routeNodes.splice(idx, 1);
        itemEl.classList.remove('selected');
    } else {
        routeNodes.push(poi);
        itemEl.classList.add('selected');
    }
    if (scene) scene.showRoute(routeNodes);
    _updateRouteStats();
}

function _onPOIClickOnMap(poi) {
    const item = document.querySelector(`[data-poi-name="${poi.name}"]`);
    if (item) _toggleRouteNode(poi, item);
}

function _clearRoute() {
    routeNodes = [];
    document.querySelectorAll('.route-poi-item').forEach(el => el.classList.remove('selected'));
    if (scene) scene.showRoute([]);
    _updateRouteStats();
}

async function _updateRouteStats() {
    const kmEl    = document.getElementById('stat-km');
    const minEl   = document.getElementById('stat-min');
    const stopsEl = document.getElementById('stat-stops');

    if (stopsEl) stopsEl.textContent = routeNodes.length;

    if (routeNodes.length < 2) {
        if (kmEl) kmEl.textContent = '—';
        if (minEl) minEl.textContent = '—';
        return;
    }

    if (kmEl) kmEl.textContent = 'Calcolo...';
    if (minEl) minEl.textContent = '...';

    if (!directionsService) return;

    const waypoints = [];
    for (let i = 1; i < routeNodes.length - 1; i++) {
        waypoints.push({ location: new google.maps.LatLng(routeNodes[i].lat, routeNodes[i].lon), stopover: true });
    }

    const request = {
        origin: new google.maps.LatLng(routeNodes[0].lat, routeNodes[0].lon),
        destination: new google.maps.LatLng(routeNodes[routeNodes.length - 1].lat, routeNodes[routeNodes.length - 1].lon),
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.WALKING // Percorso a piedi reale!
    };

    try {
        const response = await directionsService.route(request);
        let totalDist = 0, totalTime = 0;
        
        response.routes[0].legs.forEach(leg => {
            totalDist += leg.distance.value; // Metri
            totalTime += leg.duration.value; // Secondi
        });

        const km = (totalDist / 1000).toFixed(1);
        const minutes = Math.round(totalTime / 60);

        if (kmEl) kmEl.textContent = `${km} km`;
        if (minEl) minEl.textContent = minutes > 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `~${minutes} min`;

    } catch (err) {
        const toRad = d => d * Math.PI / 180;
        let totalKm = 0;
        for (let i = 0; i < routeNodes.length - 1; i++) {
            const a = routeNodes[i], b = routeNodes[i + 1];
            const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
            const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon/2)**2;
            totalKm += 6371 * 2 * Math.asin(Math.sqrt(h));
        }
        const minutes = Math.round(totalKm / 5 * 60);
        if (kmEl) kmEl.textContent = `~${totalKm.toFixed(1)} km`;
        if (minEl) minEl.textContent = minutes > 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `~${minutes} min`;
    }
}

// ── Heatmap Fixata ────────────────────────────────────────────────────────────
function _buildHeatmapPanel() {
    document.querySelectorAll('.metric-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.metric-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentMetric = chip.dataset.metric;
            _applyHeatmap();
        });
    });

    const monthSel = document.getElementById('month-select');
    if (monthSel) {
        monthSel.addEventListener('change', () => {
            if (predictivePanel) predictivePanel.selectMonth?.(parseInt(monthSel.value));
            // Non serve chiamare _applyHeatmap() qui, perché l'evento 'predictive:monthChange' lo farà automaticamente
        });
    }

    // Resta in ascolto dei cambi di mese provenienti dal Predictive Panel
    document.addEventListener('predictive:monthChange', () => {
        _applyHeatmap();
    });
}

function _applyHeatmap() {
    if (!scene || !heatmapData || !predictivePanel) return;
    
    // Otteniamo il mese correntemente selezionato (da 0 a 11)
    let monthIdx = predictivePanel.getSelectedMonth();
    if (monthIdx === null || monthIdx === undefined) monthIdx = new Date().getMonth();

    let monthData = 0.5; // Valore di fallback

    // Mappiamo correttamente i tasti HTML ("crowd", "cost", "season") alle chiavi del JSON
    if (currentMetric === 'crowd' || currentMetric === 'crowdScore') {
        monthData = heatmapData.crowdScore[monthIdx];
    } 
    else if (currentMetric === 'season' || currentMetric === 'seasonalScore') {
        monthData = heatmapData.seasonalScore[monthIdx];
    } 
    else if (currentMetric === 'cost' || currentMetric === 'costByMonth') {
        // I costi sono in Euro. Normalizziamoli da 0 a 1 per la mappa di calore!
        const maxCost = Math.max(...heatmapData.costByMonth);
        const minCost = Math.min(...heatmapData.costByMonth);
        const currentCost = heatmapData.costByMonth[monthIdx];
        monthData = maxCost === minCost ? 0.5 : ((currentCost - minCost) / (maxCost - minCost));
    }

    // Passiamo un array con UN SOLO ELEMENTO. In questo modo Google Maps non fa
    // la media annuale, ma usa ESATTAMENTE il dato del mese selezionato.
    scene.updateHeatmap([monthData], currentMetric);
}