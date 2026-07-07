// ── PWA: Registrazione Service Worker ─────────────────────────────────────────
// Il Service Worker intercetta le richieste di rete permettendo:
//   • Cache First per asset statici (CSS/JS/img) — offline support
//   • Network First per API calls (meteo, auth) — dati sempre aggiornati
//   • Fallback su offline.html quando non c'è connessione
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('../service-worker.js', { scope: '/src/' })
            .then(() => {})
            .catch(() => {});
    });
}

// ── Scroll Progress Bar ───────────────────────────────────────────────────────
(function () {
    const bar = document.getElementById('scroll-progress');
    if (!bar) return;
    const update = () => {
        const scrollTop = window.scrollY;
        const docH = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = docH > 0 ? (scrollTop / docH * 100) + '%' : '0%';
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
})();

// ── Back to Top ───────────────────────────────────────────────────────────────
(function () {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();

// ── Typewriter Hero ───────────────────────────────────────────────────────────
(function () {
    const el = document.getElementById('hero-typewriter');
    if (!el) return;
    const phrases = [
        'La tua prossima avventura inizia qui.',
        'Scopri il mondo con TripNow.',
        'Vola dove sogni.',
        'Prezzi imbattibili, esperienze uniche.',
        'Il viaggio dei tuoi sogni ti aspetta.'
    ];
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;

    function tick() {
        const phrase = phrases[phraseIdx];
        if (!deleting) {
            charIdx++;
            el.textContent = phrase.slice(0, charIdx);
            if (charIdx === phrase.length) {
                deleting = true;
                setTimeout(tick, 2200);
                return;
            }
            setTimeout(tick, 60);
        } else {
            charIdx--;
            el.textContent = phrase.slice(0, charIdx);
            if (charIdx === 0) {
                deleting = false;
                phraseIdx = (phraseIdx + 1) % phrases.length;
                setTimeout(tick, 400);
                return;
            }
            setTimeout(tick, 30);
        }
    }
    setTimeout(tick, 900);
})();

// ── Page Transition Loading Screen ───────────────────────────────────────────
(function () {
    const loadingScreen = document.getElementById('loading-screen');
    if (!loadingScreen) return;

    document.addEventListener('click', function (e) {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href) return;
        // Salta: anchor interni, link esterni, mailto/tel, _blank
        if (href.startsWith('#') || href.startsWith('http') ||
            href.startsWith('//') || href.startsWith('mailto:') ||
            href.startsWith('tel:') || link.target === '_blank') return;

        e.preventDefault();
        // Mostra loading screen (rimuovi exit, porta in display flex, poi naviga)
        loadingScreen.style.display = 'flex';
        loadingScreen.classList.remove('exit');
        setTimeout(() => { window.location.href = href; }, 380);
    });

    // Nascondi loading screen al ritorno con il tasto back del browser
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) {
            loadingScreen.style.display = 'none';
        }
    });
})();

// ── Stats Counter ─────────────────────────────────────────────────────────────
(function () {
    const statNums = document.querySelectorAll('.stat-number');
    if (!statNums.length) return;

    const animate = (el) => {
        const target = parseFloat(el.dataset.target);
        const isDecimal = el.dataset.decimal;
        const duration = 1800;
        const start = performance.now();

        const step = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const value = eased * target;
            el.textContent = isDecimal
                ? value.toFixed(parseInt(isDecimal))
                : Math.floor(value).toLocaleString('it-IT');
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animate(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    statNums.forEach(el => observer.observe(el));
})();

// ── Currency Converter (Live via /api/currency, fallback a tassi hardcoded) ────
// Carica i tassi dal server (ExchangeRate API con cache 1h).
// Se EXCHANGE_RATE_KEY non è configurata nel .env, usa tassi indicativi hardcoded.
(function () {
    // Tassi indicativi rispetto a EUR — usati come fallback se API non disponibile
    const RATES = {
        EUR: 1,
        USD: 1.08,
        GBP: 0.86,
        JPY: 162,
        CHF: 0.97,
        BRL: 5.45,
        TRY: 35.2,
        EGP: 52.5,
        JOD: 0.77,
        PEN: 4.05,
        AUD: 1.64,
        CAD: 1.47,
    };

    // Cache locale in-tab dei tassi live già scaricati
    const liveRatesCache = {};

    const HTML = `
        <button id="currency-toggle" aria-label="Convertitore valute" title="Convertitore valute">
            <i class="fas fa-coins"></i>
        </button>
        <div id="currency-panel" role="dialog" aria-label="Convertitore valute">
            <h4>Convertitore Valute</h4>
            <div class="currency-row">
                <input type="number" id="curr-amount" value="100" min="0" step="any">
                <select id="curr-from">
                    ${Object.keys(RATES).map(c => `<option value="${c}"${c === 'EUR' ? ' selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="currency-row">
                <select id="curr-to" style="width:100%">
                    ${Object.keys(RATES).map(c => `<option value="${c}"${c === 'USD' ? ' selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div id="currency-result">—</div>
            <p id="currency-rate-note">Tassi indicativi • non in tempo reale</p>
        </div>`;

    const widget = document.createElement('div');
    widget.id = 'currency-widget';
    widget.innerHTML = HTML;
    document.body.appendChild(widget);

    const toggle = document.getElementById('currency-toggle');
    const panel  = document.getElementById('currency-panel');
    const amountEl = document.getElementById('curr-amount');
    const fromEl   = document.getElementById('curr-from');
    const toEl     = document.getElementById('curr-to');
    const resultEl = document.getElementById('currency-result');

    async function getLiveRate(from, to) {
        const key = `${from}-${to}`;
        if (liveRatesCache[key]) return liveRatesCache[key];
        try {
            const base = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000';
            const r = await fetch(`${base}/api/currency?from=${from}&to=${to}`, { credentials: 'include' });
            if (!r.ok) return null;
            const data = await r.json();
            if (data.fallback || !data.rate) return null;
            liveRatesCache[key] = data.rate;
            // Aggiorna nota
            const noteEl = document.getElementById('currency-rate-note');
            if (noteEl) noteEl.textContent = '🟢 Tasso live aggiornato';
            return data.rate;
        } catch (_) { return null; }
    }

    function convertFallback(amount, from, to) {
        const eur    = amount / (RATES[from] || 1);
        const result = eur * (RATES[to] || 1);
        return result;
    }

    async function convert() {
        const amount = parseFloat(amountEl.value) || 0;
        const from   = fromEl.value;
        const to     = toEl.value;

        const liveRate = await getLiveRate(from, to);
        const result = liveRate ? amount * liveRate : convertFallback(amount, from, to);
        resultEl.textContent = `${amount.toFixed(2)} ${from} = ${result.toFixed(2)} ${to}`;
    }

    toggle.addEventListener('click', () => {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
            // Chiude TripBot se è aperto
            document.getElementById('tb-panel')?.classList.remove('open');
        }
    });
    [amountEl, fromEl, toEl].forEach(el => el.addEventListener('input', convert));

    // Chiudi cliccando fuori
    document.addEventListener('click', e => {
        if (!widget.contains(e.target)) panel.classList.remove('open');
    });
    convert();
})();

// ── Social Share Bar (destinazioni) ──────────────────────────────────────────
(function () {
    // Cerchiamo la prima sezione di contenuto dopo la hero
    const heroSection = document.querySelector('.hero-destination');
    if (!heroSection) return;

    const url  = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(document.title + ' — TripNow.com');

    // Wrapper posizionato DOPO la hero, non dentro il titolo centrato
    const wrapper = document.createElement('div');
    wrapper.className = 'share-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'share-bar';
    bar.innerHTML = `
        <span class="share-bar-label"><i class="fas fa-share-alt"></i> Condividi</span>
        <a href="https://wa.me/?text=${text}%20${url}" target="_blank" rel="noopener noreferrer" class="share-btn whatsapp">
            <i class="fab fa-whatsapp"></i> WhatsApp
        </a>
        <a href="https://twitter.com/intent/tweet?url=${url}&text=${text}" target="_blank" rel="noopener noreferrer" class="share-btn twitter">
            <i class="fa-brands fa-x-twitter"></i> X
        </a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener noreferrer" class="share-btn facebook">
            <i class="fab fa-facebook-f"></i> Facebook
        </a>
        <button class="share-btn copy-link" id="copy-link-btn">
            <i class="fas fa-link"></i> Copia link
        </button>`;
    wrapper.appendChild(bar);
    const footer = document.querySelector('footer');
    if (footer) {
        footer.insertAdjacentElement('beforebegin', wrapper);
    } else {
        heroSection.insertAdjacentElement('afterend', wrapper);
    }

    document.getElementById('copy-link-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            const btn = document.getElementById('copy-link-btn');
            btn.innerHTML = '<i class="fas fa-check"></i> Copiato!';
            btn.style.color = '#34d399';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-link"></i> Copia link';
                btn.style.color = '';
            }, 2000);
        });
    });
})();

// ── Favorites Badge (header) ──────────────────────────────────────────────────
(function () {
    const loginIcon = document.querySelector('.login-icon');
    if (!loginIcon) return;
    loginIcon.style.position = 'relative';

    const badge = document.createElement('span');
    badge.className = 'fav-badge';
    loginIcon.appendChild(badge);

    function updateBadge() {
        try {
            const favs = JSON.parse(localStorage.getItem('tripnow_favorites') || '[]');
            const count = Array.isArray(favs) ? favs.length : 0;
            badge.textContent = count > 9 ? '9+' : count;
            badge.classList.toggle('visible', count > 0);
        } catch (_) {}
    }
    updateBadge();
    window.addEventListener('storage', updateBadge);
    // Aggiorna anche dopo operazioni sui preferiti nella stessa pagina
    document.addEventListener('favorites-updated', updateBadge);
})();

// ── Travel Tip Toast (una volta per sessione) ─────────────────────────────────
(function () {
    if (sessionStorage.getItem('tip-shown')) return;

    const tips = [
        '💡 Prenota i voli il martedì o mercoledì per trovare i prezzi migliori!',
        '🧳 Viaggi leggero: portare solo il necessario riduce lo stress e i costi del bagaglio.',
        '📸 I posti più fotogenici sono spesso nelle vie laterali, non nelle piazze principali.',
        '🌐 Scarica le mappe offline prima di partire — risparmierai dati e tempo.',
        '💳 Avvisa sempre la banca prima di partire per evitare blocchi sulla carta all\'estero.',
        '⏰ Visita i monumenti famosi all\'apertura: meno folla, luce migliore, foto perfette.',
        '🍽️ Mangia dove mangiano i locali, non nei ristoranti vicino ai monumenti — qualità e prezzi migliori!',
        '🔌 Porta sempre un adattatore universale: ogni Paese ha prese diverse.',
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];

    const toast = document.createElement('div');
    toast.id = 'travel-tip-toast';
    toast.innerHTML = `
        <div class="tip-header">
            <span><i class="fas fa-lightbulb"></i> Consiglio di Viaggio</span>
            <button id="tip-close" aria-label="Chiudi"><i class="fas fa-times"></i></button>
        </div>
        <p>${tip}</p>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 12000);

    document.getElementById('tip-close').addEventListener('click', () => {
        toast.classList.remove('show');
        sessionStorage.setItem('tip-shown', '1');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        sessionStorage.setItem('tip-shown', '1');
    }, 22000);
})();

