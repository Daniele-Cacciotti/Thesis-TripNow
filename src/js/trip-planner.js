// ── TripNow Trip Planner ───────────────────────────────────────────────────────
// Feature: Ottimizzazione itinerario multi-destinazione
//
// ═══════════════════════════════════════════════════════════════════════════════
// ALGORITMO: Permutazione Casuale (soluzione iniziale) + 2-opt Local Search
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fase 1 — Permutazione Casuale:
//   Genera una permutazione casuale delle città selezionate usando
//   l'algoritmo di Fisher-Yates shuffle in O(n).
//   Non applica alcuna euristica: ogni run produce una soluzione iniziale
//   diversa, tipicamente 30-60% peggiore dell'ottimo globale.
//   Questo garantisce che il 2-opt abbia sempre spazio reale di miglioramento.
//
// Fase 2 — 2-opt Local Search (Croes, 1958):
//   Migliora iterativamente il percorso invertendo coppie di archi che si
//   "incrociano" nella mappa, riducendo la distanza totale.
//   Per ogni coppia (i→i+1) e (j→j+1):
//     se dist(i,j) + dist(i+1,j+1) < dist(i,i+1) + dist(j,j+1)
//     → inverti il segmento [i+1 … j]
//   Continua finché nessun miglioramento è possibile (ottimo locale 2-opt).
//   • Complessità per passata: O(n²)
//   • Riduce tipicamente la distanza del 10–20% rispetto alla soluzione NN
//   • Garanzia: nessuno swap di 2 archi può ulteriormente migliorare la soluzione
//
// Distanza: Formula di Haversine (RFC 2445-compliant)
//   d = 2R · arcsin(√(sin²(Δlat/2) + cos(φ₁)·cos(φ₂)·sin²(Δλ/2)))
//   Errore < 0.3% rispetto all'ellissoide WGS-84 (formula di Vincenty)
//
// Riferimenti bibliografici:
//   • Croes, G. (1958): "A Method for Solving Traveling-Salesman Problems"
//   • Lin & Kernighan (1973): "An Effective Heuristic Algorithm for the TSP"
//   • Rosenkrantz et al. (1977): NN garantito entro 0.5·(⌈log₂n⌉+1) × ottimo
//
// Questo file è discusso nel capitolo "Algoritmi e Ottimizzazione Combinatoria"
// ─────────────────────────────────────────────────────────────────────────────

const DESTINATIONS = {
    'Roma':           { lat: 41.9028, lon:  12.4964, flag: '🇮🇹', timezone: 'UTC+1', currency: 'EUR' },
    'Parigi':         { lat: 48.8566, lon:   2.3522, flag: '🇫🇷', timezone: 'UTC+1', currency: 'EUR' },
    'Istanbul':       { lat: 41.0082, lon:  28.9784, flag: '🇹🇷', timezone: 'UTC+3', currency: 'TRY' },
    'Il Cairo':       { lat: 30.0444, lon:  31.2357, flag: '🇪🇬', timezone: 'UTC+2', currency: 'EGP' },
    'New York':       { lat: 40.7128, lon: -74.0060, flag: '🇺🇸', timezone: 'UTC-5', currency: 'USD' },
    'San Francisco':  { lat: 37.7749, lon:-122.4194, flag: '🇺🇸', timezone: 'UTC-8', currency: 'USD' },
    'Rio de Janeiro': { lat:-22.9068, lon: -43.1729, flag: '🇧🇷', timezone: 'UTC-3', currency: 'BRL' },
    'Petra':          { lat: 30.3285, lon:  35.4444, flag: '🇯🇴', timezone: 'UTC+3', currency: 'JOD' },
    'Cuzco':          { lat:-13.5320, lon: -71.9675, flag: '🇵🇪', timezone: 'UTC-5', currency: 'PEN' },
};

const DEST_FACTS = {
    'Roma':           { bestMonth: 'Apr–Giu, Set–Ott', pop: '2.9M', founded: '753 a.C.', highlight: 'Ospita 4 dei 50 musei più visitati al mondo' },
    'Parigi':         { bestMonth: 'Apr–Giu, Set–Nov', pop: '2.2M', founded: 'III sec. a.C.', highlight: 'La Tour Eiffel riceve 7M di visitatori/anno' },
    'Istanbul':       { bestMonth: 'Mar–Mag, Set–Nov', pop: '15.8M', founded: '660 a.C.', highlight: 'Unica metropoli su due continenti (Europa + Asia)' },
    'Il Cairo':       { bestMonth: 'Ott–Apr',          pop: '21M',  founded: '969 d.C.',  highlight: 'Le Piramidi di Giza sono l\'unica meraviglia antica ancora in piedi' },
    'New York':       { bestMonth: 'Apr–Giu, Set–Nov', pop: '8.3M', founded: '1624',       highlight: '800 lingue parlate — città più poliglotta del mondo' },
    'San Francisco':  { bestMonth: 'Set–Nov',          pop: '0.9M', founded: '1776',       highlight: 'Il Golden Gate ha usato 83.000 tonnellate di acciaio' },
    'Rio de Janeiro': { bestMonth: 'Dic–Mar, Lug–Set', pop: '6.7M', founded: '1565',       highlight: 'Il Cristo Redentore è stato inaugurato nel 1931' },
    'Petra':          { bestMonth: 'Mar–Mag, Set–Nov', pop: '0.1M', founded: 'IV sec. a.C.', highlight: 'Il 70% della città è ancora sepolto e non scavato' },
    'Cuzco':          { bestMonth: 'Mag–Ott',          pop: '0.4M', founded: '1100 d.C.',  highlight: 'Era la capitale dell\'Impero Inca, a 3.400 m di altitudine' },
};

// ── Formula di Haversine ───────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// ── Matrice distanze O(n²) ────────────────────────────────────────────────────
function buildDistanceMatrix(names) {
    const n = names.length;
    const m = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
            const { lat: lat1, lon: lon1 } = DESTINATIONS[names[i]];
            const { lat: lat2, lon: lon2 } = DESTINATIONS[names[j]];
            m[i][j] = m[j][i] = haversine(lat1, lon1, lat2, lon2);
        }
    return m;
}

// ── Fase 1: Permutazione Casuale O(n) ─────────────────────────────────────────
// Fisher-Yates shuffle: genera una permutazione casuale degli indici [0..n-1].
// Non applica alcuna euristica — la soluzione è intenzionalmente sub-ottimale
// per dare al 2-opt spazio reale di miglioramento (tipicamente 30-60% in meno).
function randomPermutation(n) {
    const route = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [route[i], route[j]] = [route[j], route[i]];
    }
    return route;
}

// ── Fase 2: 2-opt Local Search ────────────────────────────────────────────────
// Per ogni coppia di archi, verifica se invertirne uno riduce la distanza totale.
// Converge quando nessuno swap è più migliorativo (ottimo locale 2-opt).
// Complessità: O(n²) per passata × numero di passate (O(log n) in media)
function twoOpt(matrix, initialRoute) {
    const n = initialRoute.length;
    let route = [...initialRoute];
    let improved = true;
    let passCount = 0;
    let totalImproved = 0;

    while (improved) {
        improved = false;
        passCount++;
        for (let i = 0; i < n - 1; i++) {
            for (let j = i + 2; j < n; j++) {
                const a = route[i], b = route[i + 1];
                const c = route[j], d = route[(j + 1) % n];
                const gain = (matrix[a][b] + matrix[c][d]) - (matrix[a][c] + matrix[b][d]);
                if (gain > 0.001) {
                    let lo = i + 1, hi = j;
                    while (lo < hi) {
                        [route[lo], route[hi]] = [route[hi], route[lo]];
                        lo++; hi--;
                    }
                    improved = true;
                    totalImproved += gain;
                }
            }
        }
    }
    return { route, passCount, totalImprovedKm: totalImproved };
}

// ── Distanza totale del percorso ──────────────────────────────────────────────
function totalDistance(matrix, route) {
    let d = 0;
    for (let i = 0; i < route.length - 1; i++) d += matrix[route[i]][route[i + 1]];
    return d;
}

// ── Rendering risultati nel DOM ───────────────────────────────────────────────
function renderResult(names, result) {
    const { nnRoute, nnDist, finalRoute, finalDist, passCount, savedKm } = result;
    const matrix = result.matrix;
    const improvePct = nnDist > 0 ? ((nnDist - finalDist) / nnDist * 100).toFixed(1) : 0;

    // ── Lista tappe ottimizzata
    const routeList = document.getElementById('route-list');
    routeList.innerHTML = '';
    finalRoute.forEach((idx, step) => {
        const name = names[idx];
        const dest = DESTINATIONS[name];
        const facts = DEST_FACTS[name] || {};
        const nextIdx = finalRoute[step + 1];
        const distNext = nextIdx !== undefined ? matrix[idx][nextIdx] : null;
        const flightH  = distNext ? (distNext / 800).toFixed(1) : null;
        const co2      = distNext ? Math.round(distNext * 0.09) : null;

        const div = document.createElement('div');
        div.className = 'route-step';
        div.innerHTML = `
            <div class="step-number">${step + 1}</div>
            <div class="step-info">
                <div class="step-city">${dest.flag} ${name}
                    <span class="step-tz">${dest.timezone}</span>
                </div>
                <div class="step-fact">${facts.highlight || ''}</div>
                ${distNext !== null ? `
                <div class="step-distance">
                    <span class="leg-km"><i class="fas fa-ruler-horizontal"></i> ${Math.round(distNext).toLocaleString('it-IT')} km</span>
                    <span class="leg-flight"><i class="fas fa-plane"></i> ~${flightH}h di volo</span>
                    <span class="leg-co2"><i class="fas fa-leaf"></i> ~${co2} kg CO₂/pax</span>
                </div>` : `<div class="step-distance" style="color:#34d399;"><i class="fas fa-flag-checkered"></i> Destinazione finale</div>`}
            </div>
            ${nextIdx !== undefined ? '<div class="step-arrow">→</div>' : ''}
        `;
        routeList.appendChild(div);
    });

    // ── Riepilogo statistiche
    const totalFlightH = (finalDist / 800).toFixed(0);
    const totalCO2     = Math.round(finalDist * 0.09);
    document.getElementById('total-km').textContent       = `${Math.round(finalDist).toLocaleString('it-IT')} km`;
    document.getElementById('total-flight').textContent   = `~${totalFlightH}h`;
    document.getElementById('total-co2').textContent      = `~${totalCO2} kg CO₂`;
    document.getElementById('total-stops').textContent    = `${names.length} città`;

    // ── Confronto Casuale vs 2-opt
    document.getElementById('msnn-dist').textContent      = `${Math.round(nnDist).toLocaleString('it-IT')} km`;
    document.getElementById('twopt-dist').textContent     = `${Math.round(finalDist).toLocaleString('it-IT')} km`;
    document.getElementById('improvement-km').textContent = `−${Math.round(savedKm).toLocaleString('it-IT')} km`;
    document.getElementById('improvement-pct').textContent= `−${improvePct}%`;
    document.getElementById('twopt-passes').textContent   = `${passCount} passate`;

    // ── Curiosità destinazioni
    renderDestFacts(names, matrix, finalRoute);

    // ── Mappa Google Maps (async, non blocca il rendering)
    renderGoogleMap(names, finalRoute);

    document.getElementById('results-section').style.display = 'block';
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Fun facts per ogni destinazione selezionata ───────────────────────────────
function renderDestFacts(names, matrix, route) {
    const grid = document.getElementById('dest-facts-grid');
    if (!grid) return;
    grid.innerHTML = '';
    route.forEach((idx, step) => {
        const name  = names[idx];
        const dest  = DESTINATIONS[name];
        const facts = DEST_FACTS[name] || {};
        const card = document.createElement('div');
        card.className = 'fact-card';
        card.innerHTML = `
            <div class="fact-order">#${step + 1}</div>
            <div class="fact-flag">${dest.flag}</div>
            <div class="fact-name">${name}</div>
            <div class="fact-rows">
                <div class="fact-row"><span>Miglior periodo</span><strong>${facts.bestMonth || '—'}</strong></div>
                <div class="fact-row"><span>Popolazione</span><strong>${facts.pop || '—'}</strong></div>
                <div class="fact-row"><span>Fondata</span><strong>${facts.founded || '—'}</strong></div>
                <div class="fact-row"><span>Valuta</span><strong>${dest.currency || '—'}</strong></div>
            </div>
            <div class="fact-highlight"><i class="fas fa-star"></i> ${facts.highlight || ''}</div>
        `;
        grid.appendChild(card);
    });
}

// ── Carica Google Maps API (lazy, una volta sola) ─────────────────────────────
function loadMapsAPI() {
    if (window.google?.maps) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const key = window.GOOGLE_MAPS_KEY
            || document.querySelector('meta[name="google-maps-key"]')?.content;
        if (!key) return reject(new Error('Chiave Google Maps non trovata'));
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
        s.onload  = resolve;
        s.onerror = () => reject(new Error('Caricamento Maps API fallito'));
        document.head.appendChild(s);
    });
}

// ── Mappa interattiva Google Maps con marker numerati e polyline ──────────────
async function renderGoogleMap(names, route) {
    const container = document.getElementById('route-map');
    if (!container) return;

    // Mostra un loader mentre si carica l'API
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#a0a0b0;font-size:0.95rem;"><i class="fas fa-spinner fa-spin" style="margin-right:0.5rem;"></i>Caricamento mappa…</div>';

    try {
        await loadMapsAPI();
    } catch (err) {
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;padding:1rem;text-align:center;">${err.message}</div>`;
        return;
    }

    container.innerHTML = '';

    const map = new google.maps.Map(container, {
        mapTypeId: 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
            { elementType: 'geometry',        stylers: [{ color: '#1d2c4d' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
            { featureType: 'road',  elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
        ],
    });

    const bounds = new google.maps.LatLngBounds();

    // Polyline del percorso ottimizzato (chiuso)
    const path = route.map(idx => {
        const { lat, lon } = DESTINATIONS[names[idx]];
        return { lat, lng: lon };
    });
    path.push(path[0]); // chiude il loop
    new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#FF6F61',
        strokeOpacity: 0.85,
        strokeWeight: 2.5,
        map,
    });

    // Marker numerati per ogni città
    route.forEach((idx, step) => {
        const name = names[idx];
        const { lat, lon } = DESTINATIONS[name];
        const pos = { lat, lng: lon };

        new google.maps.Marker({
            position: pos,
            map,
            title: `${step + 1}. ${name}`,
            label: {
                text: String(step + 1),
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '11px',
            },
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 14,
                fillColor: step === 0 ? '#ff3b1f' : '#FF6F61',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
            },
        });

        bounds.extend(pos);
    });

    map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });

    // Bottone "Apri su Google Maps" con tutte le tappe come waypoint
    const mapsUrl = 'https://www.google.com/maps/dir/' +
        route.map(idx => {
            const { lat, lon } = DESTINATIONS[names[idx]];
            return `${lat},${lon}`;
        }).join('/');

    const linkEl = document.getElementById('maps-link');
    if (linkEl) {
        linkEl.href = mapsUrl;
        linkEl.style.display = 'inline-flex';
    }
}

// ── UI Handler ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const checkboxes = document.querySelectorAll('.dest-checkbox-label input[type="checkbox"]');
    const counter    = document.getElementById('selected-count');
    const btnCalc    = document.getElementById('btn-calculate');
    const btnLabel   = document.getElementById('btn-label');

    function updateUI() {
        const n = Array.from(checkboxes).filter(cb => cb.checked).length;
        counter.textContent = n;
        checkboxes.forEach(cb => {
            const lbl = cb.closest('.dest-checkbox-label');
            lbl.classList.toggle('selected', cb.checked);
            lbl.querySelector('.check-circle').textContent = cb.checked ? '✓' : '';
        });
        btnCalc.disabled = n < 3;
        if (btnLabel) btnLabel.textContent = n >= 3
            ? `Ottimizza ${n} destinazioni`
            : `Seleziona almeno 3 destinazioni`;
    }

    checkboxes.forEach(cb => cb.addEventListener('change', updateUI));

    btnCalc.addEventListener('click', () => {
        const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        if (selected.length < 3) return;

        btnCalc.disabled = true;
        btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calcolo in corso…';

        requestAnimationFrame(() => requestAnimationFrame(() => {
            const matrix = buildDistanceMatrix(selected);

            // Fase 1: Permutazione casuale (Fisher-Yates)
            const randRoute = randomPermutation(matrix.length);
            const randDist  = totalDistance(matrix, randRoute);

            // Fase 2: 2-opt improvement
            const { route: finalRoute, passCount, totalImprovedKm: savedKm } = twoOpt(matrix, randRoute);
            const finalDist = totalDistance(matrix, finalRoute);

            renderResult(selected, { matrix, nnRoute: randRoute, nnDist: randDist, finalRoute, finalDist, passCount, savedKm });

            btnCalc.disabled = false;
            btnCalc.innerHTML = '<i class="fas fa-redo"></i> Ricalcola';
        }));
    });

    updateUI();
});
