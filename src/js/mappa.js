// ── Mappa Leaflet + Trip Planner integrato ────────────────────────────────────
// Mostra le 9 destinazioni TripNow sulla mappa mondiale (OpenStreetMap tiles).
// Implementa: marker personalizzati, popup, pannello laterale, meteo live,
// e il calcolo del percorso ottimale TSP (Multi-Start NN + 2-opt) direttamente sulla mappa.

(function () {
    // ── Dati destinazioni ──────────────────────────────────────────────────────
    const DESTINATIONS = [
        { name: 'Roma',          flag: '🇮🇹', country: 'Italia',   lat: 41.9028,  lon: 12.4964,  link: 'Roma.html',           tags: ['arte', 'storia', 'cibo'] },
        { name: 'Parigi',        flag: '🇫🇷', country: 'Francia',  lat: 48.8566,  lon:  2.3522,  link: 'Parigi.html',         tags: ['arte', 'storia', 'cibo'] },
        { name: 'Istanbul',      flag: '🇹🇷', country: 'Turchia',  lat: 41.0082,  lon: 28.9784,  link: 'Istanbul.html',       tags: ['storia', 'avventura'] },
        { name: 'Il Cairo',      flag: '🇪🇬', country: 'Egitto',   lat: 30.0444,  lon: 31.2357,  link: 'Il_Cairo.html',       tags: ['storia', 'avventura'] },
        { name: 'New York',      flag: '🇺🇸', country: 'USA',      lat: 40.7128,  lon:-74.0060,  link: 'New_York.html',       tags: ['arte', 'cibo', 'avventura'] },
        { name: 'San Francisco', flag: '🇺🇸', country: 'USA',      lat: 37.7749,  lon:-122.4194, link: 'San_Francisco.html',  tags: ['natura', 'avventura'] },
        { name: 'Rio de Janeiro',flag: '🇧🇷', country: 'Brasile',  lat:-22.9068,  lon:-43.1729,  link: 'rio_de_janeiro.html', tags: ['natura', 'avventura', 'cibo'] },
        { name: 'Petra',         flag: '🇯🇴', country: 'Giordania',lat: 30.3285,  lon: 35.4444,  link: 'Petra.html',          tags: ['storia', 'natura'] },
        { name: 'Cuzco',         flag: '🇵🇪', country: 'Perù',     lat:-13.5320,  lon:-71.9675,  link: 'Cuzco.html',          tags: ['storia', 'natura'] },
    ];

    // ── Haversine + TSP (riuso da trip-planner.js) ─────────────────────────────
    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }

    function buildMatrix(dests) {
        return dests.map(a => dests.map(b => haversine(a.lat, a.lon, b.lat, b.lon)));
    }

    function nearestNeighbor(matrix, start) {
        const n = matrix.length;
        const visited = new Set([start]);
        const route = [start];
        let cur = start;
        while (visited.size < n) {
            let best = Infinity, bestIdx = -1;
            for (let j = 0; j < n; j++) {
                if (!visited.has(j) && matrix[cur][j] < best) { best = matrix[cur][j]; bestIdx = j; }
            }
            visited.add(bestIdx);
            route.push(bestIdx);
            cur = bestIdx;
        }
        return route;
    }

    function totalDist(matrix, route) {
        let d = 0;
        for (let i = 0; i < route.length - 1; i++) d += matrix[route[i]][route[i + 1]];
        d += matrix[route[route.length - 1]][route[0]];
        return d;
    }

    function twoOpt(matrix, route) {
        const n = route.length;
        let improved = true;
        while (improved) {
            improved = false;
            for (let i = 0; i < n - 1; i++) {
                for (let j = i + 2; j < n; j++) {
                    if (j === n - 1 && i === 0) continue;
                    const a = route[i], b = route[i + 1], c = route[j], d = route[(j + 1) % n];
                    if (matrix[a][b] + matrix[c][d] > matrix[a][c] + matrix[b][d] + 0.001) {
                        let lo = i + 1, hi = j;
                        while (lo < hi) { [route[lo], route[hi]] = [route[hi], route[lo]]; lo++; hi--; }
                        improved = true;
                    }
                }
            }
        }
        return route;
    }

    function computeRoute(dests) {
        const matrix = buildMatrix(dests);
        let best = null, bestDist = Infinity;
        for (let s = 0; s < dests.length; s++) {
            const r = nearestNeighbor(matrix, s);
            const d = totalDist(matrix, r);
            if (d < bestDist) { bestDist = d; best = r; }
        }
        twoOpt(matrix, best);
        return { route: best, totalKm: Math.round(totalDist(matrix, best)) };
    }

    // ── Inizializza mappa ──────────────────────────────────────────────────────
    const map = L.map('leaflet-map', {
        center: [20, 10],
        zoom: 3,
        zoomControl: true,
        preferCanvas: false,
    });

    // Tile layer scuro (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(map);

    // ── Marker personalizzati ──────────────────────────────────────────────────
    const markers = {};
    let activeMarker = null;
    let routeLayer = null;

    DESTINATIONS.forEach(dest => {
        const icon = L.divIcon({
            className: '',
            html: `<div class="custom-marker"><div class="custom-marker-inner">${dest.flag}</div></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -30],
        });

        const marker = L.marker([dest.lat, dest.lon], { icon })
            .addTo(map)
            .bindPopup(`
                <div>
                    <div class="popup-flag">${dest.flag}</div>
                    <div class="popup-name">${dest.name}</div>
                    <a href="${dest.link}" class="popup-link"><i class="fas fa-compass"></i> Esplora</a>
                </div>
            `, { maxWidth: 160, closeButton: false });

        marker.on('click', () => openPanel(dest, marker));
        markers[dest.name] = marker;
    });

    // ── Pannello laterale ──────────────────────────────────────────────────────
    const panel = document.getElementById('dest-panel');
    const panelContent = document.getElementById('dest-panel-content');
    const panelClose = document.getElementById('dest-panel-close');

    panelClose?.addEventListener('click', closePanel);

    function openPanel(dest, marker) {
        // Deactivate previous marker
        if (activeMarker) {
            activeMarker.getElement()?.querySelector('.custom-marker')?.classList.remove('active');
        }
        marker.getElement()?.querySelector('.custom-marker')?.classList.add('active');
        activeMarker = marker;

        const tagsHtml = dest.tags.map(t => `<span class="dest-tag">${t}</span>`).join('');

        panelContent.innerHTML = `
            <div class="dest-panel-flag">${dest.flag}</div>
            <div class="dest-panel-name">${dest.name}</div>
            <div class="dest-panel-country"><i class="fas fa-globe" style="margin-right:.4rem;color:#FF6F61;font-size:.8rem;"></i>${dest.country}</div>
            <div class="dest-panel-tags">${tagsHtml}</div>
            <div class="dest-panel-coords">
                📍 ${dest.lat.toFixed(4)}°N, ${dest.lon.toFixed(4)}°E
            </div>
            <div id="panel-weather" style="margin-bottom:1rem;font-size:.82rem;color:rgba(220,221,232,.5);">
                <i class="fas fa-spinner fa-spin"></i> Caricamento meteo...
            </div>
            <div class="dest-panel-btns">
                <a href="${dest.link}" class="dest-panel-btn primary">
                    <i class="fas fa-compass"></i> Esplora ${dest.name}
                </a>
                <a href="itinerario.html" class="dest-panel-btn secondary">
                    <i class="fas fa-magic"></i> Genera Itinerario AI
                </a>
                <a href="voli.html" class="dest-panel-btn secondary" style="margin-top:.25rem;">
                    <i class="fas fa-plane"></i> Cerca Voli
                </a>
            </div>
        `;

        panel.classList.add('open');
        map.setView([dest.lat, dest.lon], Math.max(map.getZoom(), 5), { animate: true });

        // Carica meteo
        loadWeather(dest.lat, dest.lon);
    }

    function closePanel() {
        panel.classList.remove('open');
        if (activeMarker) {
            activeMarker.getElement()?.querySelector('.custom-marker')?.classList.remove('active');
            activeMarker = null;
        }
    }

    async function loadWeather(lat, lon) {
        const base = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000';
        try {
            const r = await fetch(`${base}/api/weather?lat=${lat}&lon=${lon}`, { credentials: 'include' });
            if (!r.ok) { document.getElementById('panel-weather').textContent = ''; return; }
            const data = await r.json();
            const cur = data.list?.[0];
            if (!cur) { document.getElementById('panel-weather').textContent = ''; return; }
            const temp = Math.round(cur.main.temp);
            const desc = cur.weather[0]?.description || '';
            const icon = cur.weather[0]?.icon;
            const iconUrl = `https://openweathermap.org/img/wn/${icon}@2x.png`;
            document.getElementById('panel-weather').innerHTML = `
                <div style="display:flex;align-items:center;gap:.4rem;">
                    <img src="${iconUrl}" width="36" height="36" style="filter:brightness(1.2);" alt="">
                    <span style="font-size:1rem;font-weight:700;color:#dcdde8;">${temp}°C</span>
                    <span style="color:rgba(220,221,232,.55);font-size:.8rem;">${desc}</span>
                </div>
            `;
        } catch (_) {
            document.getElementById('panel-weather').textContent = '';
        }
    }

    // ── Controlli toolbar ──────────────────────────────────────────────────────
    document.getElementById('map-show-all')?.addEventListener('click', function () {
        closePanel();
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        document.getElementById('route-info-bar').style.display = 'none';
        map.setView([20, 10], 3, { animate: true });
        setActive(this);
    });

    document.getElementById('map-show-route')?.addEventListener('click', function () {
        showOptimalRoute();
        setActive(this);
    });

    document.getElementById('map-reset-view')?.addEventListener('click', () => {
        map.setView([20, 10], 3, { animate: true });
    });

    document.getElementById('route-clear-btn')?.addEventListener('click', () => {
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
        document.getElementById('route-info-bar').style.display = 'none';
        setActive(document.getElementById('map-show-all'));
    });

    function setActive(btn) {
        document.querySelectorAll('.map-ctrl-btn').forEach(b => b.classList.remove('active'));
        btn?.classList.add('active');
    }

    function showOptimalRoute() {
        const { route, totalKm } = computeRoute(DESTINATIONS);

        // Costruisci array di latlng nell'ordine ottimale (circolare)
        const latlngs = [...route, route[0]].map(i => [DESTINATIONS[i].lat, DESTINATIONS[i].lon]);

        if (routeLayer) map.removeLayer(routeLayer);

        // Linea principale
        routeLayer = L.layerGroup().addTo(map);

        // Polyline tratteggiata
        L.polyline(latlngs, {
            color: '#FF6F61',
            weight: 2.5,
            opacity: 0.75,
            dashArray: '8 6',
        }).addTo(routeLayer);

        // Frecce direzionali (marker numerati sull'ordine)
        route.forEach((destIdx, order) => {
            const dest = DESTINATIONS[destIdx];
            const orderIcon = L.divIcon({
                className: '',
                html: `<div style="
                    background: linear-gradient(135deg,#FF6F61,#ff9a8b);
                    color:#fff;
                    border-radius:50%;
                    width:22px;height:22px;
                    display:flex;align-items:center;justify-content:center;
                    font-size:10px;font-weight:700;
                    box-shadow:0 2px 8px rgba(255,111,97,.5);
                    border:2px solid rgba(255,255,255,.3);
                ">${order + 1}</div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
            });
            L.marker([dest.lat, dest.lon], { icon: orderIcon }).addTo(routeLayer);
        });

        // Fit map to route
        map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [60, 60] });

        // Info bar
        const routeNames = route.map(i => DESTINATIONS[i].name).join(' → ');
        document.getElementById('route-info-text').innerHTML =
            `<i class="fas fa-route" style="color:#FF6F61;margin-right:.4rem;"></i> Percorso ottimale: <strong>${totalKm.toLocaleString('it-IT')} km</strong> &nbsp;·&nbsp; ${routeNames}`;
        document.getElementById('route-info-bar').style.display = 'block';
    }
})();
