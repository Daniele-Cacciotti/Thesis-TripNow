// ── Voli — Amadeus API Client ──────────────────────────────────────────────────
// Chiama GET /api/flights con i parametri del form.
// Renderizza le card dei voli con dettaglio espandibile al click.
// Ordinamento lato client per: prezzo, durata, numero di scali.

(function () {
    const originEl  = document.getElementById('voli-origin');
    const destEl    = document.getElementById('voli-dest');
    const dateEl    = document.getElementById('voli-date');
    const adultsEl  = document.getElementById('voli-adults');
    const searchBtn = document.getElementById('voli-search-btn');
    const btnLabel  = document.getElementById('voli-btn-label');
    const resultsSection = document.getElementById('voli-results-section');
    const resultsList    = document.getElementById('voli-results-list');
    const resultsCount   = document.getElementById('voli-results-count');
    const resultsRoute   = document.getElementById('voli-results-route');

    // Imposta data default = domani
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateEl) dateEl.value = tomorrow.toISOString().slice(0, 10);
    if (dateEl) dateEl.min = tomorrow.toISOString().slice(0, 10);

    searchBtn?.addEventListener('click', searchFlights);

    let flightsData = [];

    // Riordina al cambio sort
    document.querySelectorAll('input[name="sort"]').forEach(r => {
        r.addEventListener('change', () => { if (flightsData.length) renderFlights(sortFlights(flightsData)); });
    });

    async function searchFlights() {
        const origin      = originEl.value;
        const destination = destEl.value;
        const date        = dateEl.value;
        const adults      = adultsEl.value;

        if (!origin || !destination || !date) return;

        searchBtn.disabled = true;
        btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ricerca in corso...';
        resultsSection.style.display = 'none';
        resultsList.innerHTML = '';

        const base = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000';

        try {
            const res = await fetch(
                `${base}/api/flights?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${date}&adults=${adults}`,
                { credentials: 'include' }
            );

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showError(err.error || `Errore ${res.status}: servizio non disponibile`);
                return;
            }

            const data = await res.json();
            flightsData = data.flights || [];

            if (!flightsData.length) {
                showError('Nessun volo trovato per questa rotta e data. Prova date o rotte diverse.');
                return;
            }

            const sourceLabel = data.source === 'demo'
                ? ' <span style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.25);color:#fbbf24;padding:.1rem .5rem;border-radius:4px;font-size:.7rem;font-weight:700;">DEMO</span>'
                : data.source === 'kiwi'
                ? ' <span style="background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.2);color:#34d399;padding:.1rem .5rem;border-radius:4px;font-size:.7rem;font-weight:700;">LIVE · Kiwi</span>'
                : data.source === 'rapidapi'
                ? ' <span style="background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25);color:#a78bfa;padding:.1rem .5rem;border-radius:4px;font-size:.7rem;font-weight:700;">LIVE · Skyscanner</span>'
                : ' <span style="background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.2);color:#38bdf8;padding:.1rem .5rem;border-radius:4px;font-size:.7rem;font-weight:700;">LIVE · Amadeus</span>';
            resultsCount.innerHTML = `${flightsData.length} voli trovati${sourceLabel}`;
            resultsRoute.textContent = `${origin} → ${destination} · ${formatDate(date)} · ${adults} adult${adults > 1 ? 'i' : 'o'}`;
            resultsSection.style.display = 'block';
            renderFlights(sortFlights(flightsData));
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            showError('Errore di connessione: ' + err.message);
        } finally {
            searchBtn.disabled = false;
            btnLabel.innerHTML = '<i class="fas fa-search"></i> Cerca Voli';
        }
    }

    function sortFlights(flights) {
        const sort = document.querySelector('input[name="sort"]:checked')?.value || 'price';
        return [...flights].sort((a, b) => {
            if (sort === 'price')    return a.price - b.price;
            if (sort === 'duration') return parseDuration(a.itineraries[0].duration) - parseDuration(b.itineraries[0].duration);
            if (sort === 'stops')    return a.itineraries[0].stops - b.itineraries[0].stops;
            return 0;
        });
    }

    function parseDuration(str) {
        // "14h 30m" → minuti
        const h = parseInt(str.match(/(\d+)h/)?.[1] || 0);
        const m = parseInt(str.match(/(\d+)m/)?.[1] || 0);
        return h * 60 + m;
    }

    function renderFlights(flights) {
        resultsList.innerHTML = '';
        flights.forEach(flight => {
            const it = flight.itineraries[0];
            const stopsLabel = it.stops === 0 ? 'Diretto' : it.stops === 1 ? '1 scalo' : `${it.stops} scali`;
            const stopsClass = `stops-${Math.min(it.stops, 2)}`;

            const seg = it.segments[0];
            const lastSeg = it.segments[it.segments.length - 1];

            const card = document.createElement('div');
            card.className = 'flight-card';
            card.innerHTML = `
                <div class="flight-card-top">
                    <div class="flight-carrier">
                        <span class="carrier-code">${flight.carrier}</span>
                    </div>
                    <div class="flight-route">
                        <span class="route-iata">${seg.from}</span>
                        <span class="route-arrow"><i class="fas fa-long-arrow-alt-right"></i></span>
                        <span class="route-iata">${lastSeg.to}</span>
                        <span class="route-duration">${it.duration}</span>
                    </div>
                    <span class="flight-stops ${stopsClass}">${stopsLabel}</span>
                    <div class="flight-price">
                        <div class="price-value">€${flight.price.toFixed(2)}</div>
                        <div class="price-note">per persona</div>
                    </div>
                </div>
                <div class="flight-card-detail">
                    <div class="segments-list">
                        ${it.segments.map(s => `
                            <div class="segment-row">
                                <span class="seg-time">${formatTime(s.departAt)}</span>
                                <span class="seg-iata">${s.from}</span>
                                <i class="fas fa-arrow-right" style="color:rgba(220,221,232,.3);font-size:.7rem;"></i>
                                <span class="seg-time">${formatTime(s.arriveAt)}</span>
                                <span class="seg-iata">${s.to}</span>
                                <span class="seg-flight">${s.carrier}${s.flight}</span>
                            </div>
                        `).join('')}
                    </div>
                    <a class="flight-book-btn" href="https://www.skyscanner.it/trasporti/voli/${seg.from.toLowerCase()}/${lastSeg.to.toLowerCase()}/${dateEl.value.replace(/-/g, '')}/" target="_blank" rel="noopener">
                        <i class="fas fa-external-link-alt"></i> Prenota su Skyscanner
                    </a>
                </div>
            `;
            card.addEventListener('click', () => card.classList.toggle('open'));
            resultsList.appendChild(card);
        });
    }

    function showError(msg) {
        resultsList.innerHTML = `<div style="color:#FF6F61;text-align:center;padding:2rem;font-size:.95rem;"><i class="fas fa-exclamation-triangle"></i> ${msg}</div>`;
        resultsSection.style.display = 'block';
    }

    function formatDate(dateStr) {
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function formatTime(isoStr) {
        return new Date(isoStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    }
})();
