/**
 * BehavioralTracker.js
 * Tracciamento implicito del comportamento utente per il recommendation engine ibrido.
 *
 * Raccoglie: tempo su pagina, sezioni viste >50%, POI cliccati, fase scroll raggiunta,
 * metrica heatmap selezionata, interazione con booking simulator.
 *
 * I dati vengono inviati tramite navigator.sendBeacon a POST /api/behavior
 * al momento in cui l'utente lascia la pagina (visibilitychange: hidden).
 *
 * Vettore di sessione formale: s = (t, V, P, φ)
 *   t = time_on_page (ms)
 *   V = set di section IDs viste
 *   P = multiset di POI cliccati
 *   φ = fase scroll massima raggiunta (0-6)
 */

export class BehavioralTracker {
    /**
     * @param {string} destination — nome destinazione (es. "Roma")
     */
    constructor(destination) {
        this.destination = destination;
        this._enterTime  = Date.now();
        this._data = {
            destination,
            session_id:              this._getOrCreateSessionId(),
            time_on_page:            0,
            sections_viewed:         [],
            pois_clicked:            [],
            phase_reached:           0,
            booking_sim_interacted:  false,
            heatmap_metric:          null,
        };
        this._io  = null;
        this._api = (typeof API_BASE !== 'undefined') ? API_BASE : 'http://127.0.0.1:8080';
        this._init();
    }

    _init() {
        this._observeSections();
        this._listenScrollPhase();
        this._listenPOIClicks();
        this._listenHeatmapMetric();
        this._listenBookingSim();
        this._attachFlush();
    }

    // ── Osserva le sezioni della pagina ────────────────────────────────────────
    _observeSections() {
        this._io = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting && e.intersectionRatio >= 0.5) {
                    const id = e.target.id || e.target.className;
                    if (id && !this._data.sections_viewed.includes(id)) {
                        this._data.sections_viewed.push(id);
                    }
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll('.destination-section, section[id]').forEach(s => {
            this._io.observe(s);
        });
    }

    // ── Ascolta gli eventi di fase narrative (da ScrollNarrative) ─────────────
    _listenScrollPhase() {
        document.addEventListener('narrative:progress', (e) => {
            const phase = e.detail?.phase ?? 0;
            if (phase > this._data.phase_reached) {
                this._data.phase_reached = phase;
            }
        });
    }

    // ── Ascolta i click sui POI marker (da DestinationScene) ──────────────────
    _listenPOIClicks() {
        document.addEventListener('scene3d:poiClick', (e) => {
            const name = e.detail?.name;
            if (name) this._data.pois_clicked.push(name);
        });
    }

    // ── Ascolta la metrica heatmap selezionata ─────────────────────────────────
    _listenHeatmapMetric() {
        document.addEventListener('narrative:heatmapMetric', (e) => {
            this._data.heatmap_metric = e.detail?.metric || null;
        });
    }

    // ── Ascolta interazione con booking simulator ──────────────────────────────
    _listenBookingSim() {
        document.addEventListener('click', (e) => {
            if (e.target.closest?.('.pp-btn-primary, .pp-btn-secondary, .pp-month-btn')) {
                this._data.booking_sim_interacted = true;
            }
        });
    }

    // ── Flush dati al backend ──────────────────────────────────────────────────
    _attachFlush() {
        const flush = () => {
            this._data.time_on_page = Date.now() - this._enterTime;
            const url  = `${this._api}/api/behavior`;
            const body = JSON.stringify(this._data);
            // sendBeacon garantisce l'invio anche durante navigazione out
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, body);
            } else {
                // fallback XHR sincrono (deprecato ma supportato)
                const xhr = new XMLHttpRequest();
                xhr.open('POST', url, false);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(body);
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flush();
        });
        window.addEventListener('pagehide', flush);
    }

    // ── Utility ────────────────────────────────────────────────────────────────
    _getOrCreateSessionId() {
        const KEY = 'tripnow_session_id';
        let id = sessionStorage.getItem(KEY);
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID()
                : Math.random().toString(36).slice(2) + Date.now().toString(36);
            sessionStorage.setItem(KEY, id);
        }
        return id;
    }

    /** Espone dati per debug/test */
    getData() { return { ...this._data }; }

    destroy() {
        if (this._io) this._io.disconnect();
    }
}
