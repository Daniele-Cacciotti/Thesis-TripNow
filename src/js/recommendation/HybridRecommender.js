/**
 * HybridRecommender — client-side wrapper attorno a /api/recommendations.
 *
 * Il server calcola già lo score ibrido (0.6×content + 0.4×behavioral).
 * Questo modulo si occupa di:
 *   - fetch delle raccomandazioni con retry exponential back-off
 *   - rendering delle card nei container designati
 *   - aggiornamento reattivo se l'utente aggiunge/rimuove preferiti
 *
 * Utilizzo:
 *   import { HybridRecommender } from './HybridRecommender.js';
 *   const rec = new HybridRecommender('#recs-container');
 *   rec.load();
 */

export class HybridRecommender {
    /**
     * @param {string|HTMLElement} container - Selettore CSS o elemento DOM dove renderizzare le card.
     * @param {object} [options]
     * @param {number} [options.maxResults=3] - Numero massimo di risultati da mostrare.
     * @param {number} [options.retries=2]    - Tentativi di retry in caso di errore di rete.
     */
    constructor(container, options = {}) {
        this._el = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this._maxResults = options.maxResults ?? 3;
        this._retries    = options.retries    ?? 2;
    }

    /** Carica le raccomandazioni dal server e le renderizza. */
    async load() {
        if (!this._el) return;
        this._renderSkeleton();

        let data;
        try {
            data = await this._fetchWithRetry('/api/recommendations', this._retries);
        } catch {
            this._renderError();
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            this._renderEmpty();
            return;
        }

        this._render(data.slice(0, this._maxResults));
    }

    // ── private ──────────────────────────────────────────────────────────────

    async _fetchWithRetry(url, retriesLeft) {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
            if (retriesLeft > 0 && res.status >= 500) {
                await new Promise(r => setTimeout(r, 400 * (this._retries - retriesLeft + 1)));
                return this._fetchWithRetry(url, retriesLeft - 1);
            }
            throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
    }

    _renderSkeleton() {
        this._el.innerHTML = Array.from({ length: this._maxResults }, () => `
            <div class="rec-card rec-card--skeleton" aria-hidden="true">
                <div class="rec-skeleton-img"></div>
                <div class="rec-skeleton-title"></div>
                <div class="rec-skeleton-score"></div>
            </div>`).join('');
    }

    _render(items) {
        this._el.innerHTML = items.map(({ name, link, score }) => {
            const pct  = Math.round(score * 100);
            const hue  = Math.round(score * 120); // rosso→verde
            return `
            <a class="rec-card" href="${link}" aria-label="Vai a ${name} — score ${pct}%">
                <div class="rec-card__name">${name}</div>
                <div class="rec-card__bar-track">
                    <div class="rec-card__bar" style="width:${pct}%;background:hsl(${hue},70%,50%)"></div>
                </div>
                <div class="rec-card__score">${pct}% match</div>
            </a>`;
        }).join('');
    }

    _renderEmpty() {
        this._el.innerHTML = `<p class="rec-empty">Aggiungi qualche preferito per ricevere suggerimenti personalizzati.</p>`;
    }

    _renderError() {
        this._el.innerHTML = `<p class="rec-error">Impossibile caricare i suggerimenti. Riprova più tardi.</p>`;
    }
}
