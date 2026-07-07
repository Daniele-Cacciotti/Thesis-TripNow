/**
 * PredictivePanel.js
 * Pannello predittivo per le pagine destinazione di TripNow.
 *
 * Logica intatta, HTML generato aggiornato per supportare le nuove
 * classi CSS Ultra Premium, con icone FontAwesome e layout migliorato.
 */

const MONTH_NAMES = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const MONTH_NAMES_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                           'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

// Coordinate di partenza default (Roma) per calcolo CO2
const DEFAULT_ORIGIN = { lat: 41.9028, lon: 12.4964, name: 'Roma' };

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

export class PredictivePanel {
    constructor(container, destination, destCoords) {
        this.container   = container;
        this.destination = destination;
        this.destCoords  = destCoords;
        this.data        = null;
        this.selectedMonth = null;

        const base = (typeof API_BASE !== 'undefined') ? API_BASE : 'http://127.0.0.1:8080';
        this.apiBase = base;
    }

    async init() {
        this._renderSkeleton();
        try {
            const r = await fetch(`${this.apiBase}/api/predictive/${encodeURIComponent(this.destination)}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            this.data = await r.json();
            this.selectedMonth = this.data.prediction.bestCombo.month;
            this._render();
        } catch (err) {
            console.warn('[PredictivePanel] Errore fetch:', err.message);
            this._renderError();
        }
    }

    _renderSkeleton() {
        this.container.innerHTML = `
            <div class="predictive-panel loading">
                <div class="pp-header">
                    <span class="pp-icon">🧠</span>
                    <h3 class="pp-title">Analisi Predittiva Motore AI</h3>
                </div>
                <div class="pp-skeleton">
                    <div class="skeleton-bar"></div>
                    <div class="skeleton-bar short"></div>
                    <div class="skeleton-months">
                        ${Array(12).fill('<div class="skeleton-month"></div>').join('')}
                    </div>
                </div>
            </div>`;
    }

    _render() {
        const d = this.data;
        const best = d.prediction.bestCombo;
        const co2 = this._calcCO2();

        this.container.innerHTML = `
            <div class="predictive-panel" data-destination="${this.destination}">

                <div class="pp-header">
                    <span class="pp-icon"><i class="fas fa-chart-network" style="color:#38bdf8;"></i></span>
                    <div>
                        <h3 class="pp-title">Telemetria Globale — ${this.destination}</h3>
                        <p class="pp-subtitle">Seleziona il periodo per ricalcolare le metriche</p>
                    </div>
                    <div class="pp-best-badge" title="${best.reason}">
                        <i class="fas fa-star"></i> Ottimo: ${MONTH_NAMES_FULL[best.month]}
                    </div>
                </div>

                <div class="pp-months" role="group" aria-label="Seleziona mese">
                    ${d.crowdScore.map((score, i) => this._monthBtn(i, score, d.seasonalScore[i])).join('')}
                </div>

                <div class="pp-stats" id="pp-stats-${this.destination.replace(/\s/g,'-')}">
                    ${this._statsHTML(this.selectedMonth, co2)}
                </div>

                <div class="pp-score-bar">
                    <span class="pp-score-label">Ranking Stagionale</span>
                    <div class="pp-bar-track">
                        <div class="pp-bar-fill" id="pp-bar-${this.destination.replace(/\s/g,'-')}"
                             style="width:${d.seasonalScore[this.selectedMonth] * 100}%"></div>
                    </div>
                    <span class="pp-score-value" id="pp-score-val-${this.destination.replace(/\s/g,'-')}">
                        ${Math.round(d.seasonalScore[this.selectedMonth] * 100)}/100
                    </span>
                </div>

                <div class="pp-callout">
                    <span class="pp-callout-icon">💡</span>
                    <p>${best.reason} — <strong>${MONTH_NAMES_FULL[best.month]}</strong></p>
                </div>

                <div class="pp-actions">
                    <a href="../html/voli.html?dest=${encodeURIComponent(this.destination)}"
                       class="pp-btn-primary">
                        <i class="fas fa-plane-departure"></i> Cerca Voli
                    </a>
                    <a href="../html/itinerario.html?dest=${encodeURIComponent(this.destination)}"
                       class="pp-btn-secondary">
                        <i class="fas fa-robot"></i> Genera Itinerario AI
                    </a>
                </div>

            </div>`;

        this._attachEvents();
    }

    _monthBtn(i, crowdScore, seasonalScore) {
        const hue = Math.round((1 - crowdScore) * 120);
        const isSelected = i === this.selectedMonth;
        const isBest     = this.data.bestMonths.includes(i);
        const isPeak     = this.data.peakMonths.includes(i);

        return `
            <button class="pp-month-btn ${isSelected ? 'selected' : ''} ${isBest ? 'best' : ''} ${isPeak ? 'peak' : ''}"
                    data-month="${i}"
                    aria-pressed="${isSelected}"
                    aria-label="${MONTH_NAMES_FULL[i]}, folla ${Math.round(crowdScore * 100)}%">
                <span class="pp-month-name">${MONTH_NAMES[i]}</span>
                <span class="pp-crowd-dot" style="background:hsl(${hue},70%,50%); color:hsl(${hue},70%,50%);"></span>
                ${isBest ? '<span class="pp-best-star" aria-hidden="true"><i class="fas fa-star"></i></span>' : ''}
            </button>`;
    }

    _statsHTML(month, co2) {
        const d = this.data;
        const crowd = d.crowdScore[month];
        const cost  = d.costByMonth[month];
        const temp  = d.climateData[month]?.avgTemp ?? '—';
        const rain  = d.climateData[month]?.rainDays ?? '—';
        
        let crowdLabel = 'Affollata';
        let crowdColor = '#FF6F61';
        if (crowd < 0.4) { crowdLabel = 'Poca folla'; crowdColor = '#34d399'; }
        else if (crowd < 0.7) { crowdLabel = 'Moderata'; crowdColor = '#F4C842'; }

        return `
            <div class="pp-stat">
                <i class="fas fa-euro-sign"></i>
                <span class="pp-stat-value">${cost}€</span>
                <span class="pp-stat-label">Costo Medio/GG</span>
            </div>
            <div class="pp-stat">
                <i class="fas fa-temperature-half"></i>
                <span class="pp-stat-value">${temp}°C</span>
                <span class="pp-stat-label">Temperatura</span>
            </div>
            <div class="pp-stat">
                <i class="fas fa-cloud-rain"></i>
                <span class="pp-stat-value">${rain} gg</span>
                <span class="pp-stat-label">Pioggia</span>
            </div>
            <div class="pp-stat">
                <i class="fas fa-users" style="color:${crowdColor}"></i>
                <span class="pp-stat-value" style="color:${crowdColor}">${crowdLabel}</span>
                <span class="pp-stat-label">Affollamento</span>
            </div>
            <div class="pp-stat">
                <i class="fas fa-leaf" style="color:#34d399"></i>
                <span class="pp-stat-value">~${co2} kg</span>
                <span class="pp-stat-label">CO₂/Pax Volo</span>
            </div>`;
    }

    _calcCO2() {
        if (!this.destCoords) return '—';
        const dist = haversine(
            DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lon,
            this.destCoords.lat, this.destCoords.lon
        );
        return Math.round(dist * 0.09);
    }

    _attachEvents() {
        const key = this.destination.replace(/\s/g, '-');
        this.container.querySelectorAll('.pp-month-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const month = parseInt(btn.dataset.month);
                this.selectedMonth = month;

                this.container.querySelectorAll('.pp-month-btn').forEach(b => {
                    b.classList.toggle('selected', parseInt(b.dataset.month) === month);
                    b.setAttribute('aria-pressed', b.classList.contains('selected'));
                });

                const statsEl = this.container.querySelector(`#pp-stats-${key}`);
                if (statsEl) statsEl.innerHTML = this._statsHTML(month, this._calcCO2());

                const barEl  = this.container.querySelector(`#pp-bar-${key}`);
                const valEl  = this.container.querySelector(`#pp-score-val-${key}`);
                const score  = this.data.seasonalScore[month];
                if (barEl)  barEl.style.width = `${score * 100}%`;
                if (valEl)  valEl.textContent = `${Math.round(score * 100)}/100`;

                this.container.dispatchEvent(new CustomEvent('predictive:monthChange', {
                    bubbles: true,
                    detail: { month, crowdScore: this.data.crowdScore[month], destination: this.destination }
                }));
            });
        });
    }

    _renderError() {
        this.container.innerHTML = `
            <div class="predictive-panel error">
                <span class="pp-icon"><i class="fas fa-exclamation-triangle"></i></span>
                <p>Impossibile stabilire un collegamento con i dati telemetrici predittivi. Riprova più tardi.</p>
            </div>`;
    }

    getData() { return this.data; }
    getSelectedMonth() { return this.selectedMonth; }
}