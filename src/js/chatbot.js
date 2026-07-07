// ── TripBot — AI Travel Chatbot (Groq LLaMA 3.3 70B) ─────────────────────────
// Widget floating con streaming SSE, conversation history in sessionStorage,
// quick-reply chips, typing indicator animato, markdown inline rendering.
// CSS iniettato via JS: zero dipendenze esterne, funziona su ogni pagina.

(function () {

    // ── Stili inline ──────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
    #tb-btn {
        position: fixed;
        bottom: 92px;           /* 32px base + 48px back-to-top + 12px gap */
        right: 32px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #FF6F61, #ff9a8b);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        box-shadow: 0 4px 20px rgba(255,111,97,.45);
        z-index: 8500;
        transition: transform .2s, box-shadow .2s;
    }
    #tb-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(255,111,97,.6); }
    #tb-btn::after {
        content: '';
        position: absolute;
        inset: -5px;
        border-radius: 50%;
        border: 2px solid rgba(255,111,97,.35);
        animation: tb-pulse 2.2s ease-out infinite;
        pointer-events: none;
    }
    @keyframes tb-pulse {
        0%   { transform: scale(1);   opacity: 1; }
        100% { transform: scale(1.6); opacity: 0; }
    }
    #tb-notif {
        position: absolute;
        top: -3px; right: -3px;
        width: 16px; height: 16px;
        border-radius: 50%;
        background: #34d399;
        border: 2px solid #0d0f1a;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: .6rem;
        font-weight: 700;
        color: #0d0f1a;
    }
    #tb-notif.show { display: flex; }

    #tb-panel {
        position: fixed;
        bottom: 152px;          /* 92px btn bottom + 48px btn height + 12px gap */
        right: 32px;
        width: 360px;
        height: 510px;
        background: rgba(11,13,23,.97);
        border: 1px solid rgba(255,111,97,.18);
        border-radius: 20px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 24px 64px rgba(0,0,0,.6), 0 0 0 1px rgba(255,111,97,.08);
        z-index: 8500;
        transform: translateY(16px) scale(.96);
        opacity: 0;
        pointer-events: none;
        transition: transform .28s cubic-bezier(.34,1.56,.64,1), opacity .2s;
        backdrop-filter: blur(24px);
        overflow: hidden;
    }
    #tb-panel.open {
        transform: translateY(0) scale(1);
        opacity: 1;
        pointer-events: all;
    }

    /* Header */
    #tb-head {
        display: flex;
        align-items: center;
        gap: .75rem;
        padding: .9rem 1.1rem;
        border-bottom: 1px solid rgba(255,111,97,.1);
        background: rgba(255,111,97,.04);
        flex-shrink: 0;
    }
    #tb-avatar {
        width: 38px; height: 38px;
        border-radius: 50%;
        background: linear-gradient(135deg,#FF6F61,#ff9a8b);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.1rem; flex-shrink: 0;
    }
    #tb-info { flex: 1; min-width: 0; }
    #tb-name { font-size: .9rem; font-weight: 700; color: #dcdde8; letter-spacing: .01em; }
    #tb-status {
        font-size: .68rem; color: #34d399;
        display: flex; align-items: center; gap: .3rem; margin-top: 1px;
    }
    #tb-status::before {
        content: ''; width: 6px; height: 6px; border-radius: 50%;
        background: #34d399; display: inline-block;
        animation: tb-blink-dot 2s ease infinite;
    }
    @keyframes tb-blink-dot { 50% { opacity: .4; } }
    #tb-head-actions { display: flex; gap: .4rem; align-items: center; }
    .tb-head-btn {
        background: none;
        border: 1px solid rgba(220,221,232,.1);
        color: rgba(220,221,232,.35);
        border-radius: 8px;
        padding: .28rem .55rem;
        font-size: .68rem;
        cursor: pointer;
        transition: all .18s;
        line-height: 1.4;
    }
    .tb-head-btn:hover { border-color: rgba(255,111,97,.4); color: #FF6F61; }

    /* Messages */
    #tb-msgs {
        flex: 1;
        overflow-y: auto;
        padding: .9rem 1rem;
        display: flex;
        flex-direction: column;
        gap: .65rem;
        scroll-behavior: smooth;
    }
    #tb-msgs::-webkit-scrollbar { width: 3px; }
    #tb-msgs::-webkit-scrollbar-thumb { background: rgba(255,111,97,.2); border-radius: 2px; }
    .tb-msg {
        display: flex;
        gap: .45rem;
        animation: tb-fadein .22s ease;
    }
    @keyframes tb-fadein {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    .tb-msg.user { flex-direction: row-reverse; }
    .tb-bubble {
        max-width: 80%;
        padding: .55rem .85rem;
        border-radius: 16px;
        font-size: .82rem;
        line-height: 1.55;
        color: #dcdde8;
        word-break: break-word;
    }
    .tb-msg.bot  .tb-bubble {
        background: rgba(255,111,97,.07);
        border: 1px solid rgba(255,111,97,.14);
        border-bottom-left-radius: 4px;
    }
    .tb-msg.user .tb-bubble {
        background: rgba(56,189,248,.09);
        border: 1px solid rgba(56,189,248,.18);
        border-bottom-right-radius: 4px;
        color: #e0f2fe;
    }
    .tb-icon-wrap {
        width: 26px; height: 26px; border-radius: 50%;
        background: linear-gradient(135deg,#FF6F61,#ff9a8b);
        display: flex; align-items: center; justify-content: center;
        font-size: .75rem; flex-shrink: 0; margin-top: auto;
    }
    .tb-cursor {
        display: inline-block; width: 2px; height: .82em;
        background: #FF6F61; margin-left: 2px;
        vertical-align: middle;
        animation: tb-cur .65s step-end infinite;
    }
    @keyframes tb-cur { 50% { opacity: 0; } }

    /* Typing indicator */
    #tb-typing {
        display: none;
        align-items: center;
        gap: .5rem;
        padding: 0 1rem .4rem;
    }
    #tb-typing.show { display: flex; }
    .tb-dots {
        display: flex; gap: 4px;
        background: rgba(255,111,97,.07);
        border: 1px solid rgba(255,111,97,.14);
        border-radius: 12px;
        padding: .45rem .7rem;
    }
    .tb-dots span {
        width: 5px; height: 5px; border-radius: 50%;
        background: rgba(255,111,97,.55);
        animation: tb-bounce 1.1s ease infinite;
    }
    .tb-dots span:nth-child(2) { animation-delay: .18s; }
    .tb-dots span:nth-child(3) { animation-delay: .36s; }
    @keyframes tb-bounce {
        0%,60%,100% { transform: translateY(0); }
        30%          { transform: translateY(-5px); }
    }

    /* Quick-reply chips */
    #tb-chips {
        display: flex;
        gap: .35rem;
        padding: 0 1rem .55rem;
        overflow-x: auto;
        flex-shrink: 0;
        scrollbar-width: none;
    }
    #tb-chips::-webkit-scrollbar { display: none; }
    .tb-chip {
        background: rgba(255,111,97,.06);
        border: 1px solid rgba(255,111,97,.18);
        color: rgba(220,221,232,.65);
        border-radius: 20px;
        padding: .28rem .72rem;
        font-size: .7rem;
        cursor: pointer;
        white-space: nowrap;
        transition: all .18s;
        flex-shrink: 0;
        font-family: inherit;
    }
    .tb-chip:hover {
        background: rgba(255,111,97,.14);
        border-color: rgba(255,111,97,.4);
        color: #FF6F61;
        transform: translateY(-1px);
    }

    /* Input row */
    #tb-input-row {
        display: flex;
        gap: .5rem;
        padding: .65rem .9rem .9rem;
        border-top: 1px solid rgba(255,111,97,.09);
        flex-shrink: 0;
        align-items: flex-end;
    }
    #tb-input {
        flex: 1;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,111,97,.18);
        border-radius: 12px;
        padding: .55rem .85rem;
        color: #dcdde8;
        font-size: .82rem;
        outline: none;
        transition: border-color .2s;
        font-family: inherit;
        resize: none;
        line-height: 1.45;
        max-height: 90px;
        overflow-y: auto;
    }
    #tb-input:focus { border-color: rgba(255,111,97,.45); }
    #tb-input::placeholder { color: rgba(220,221,232,.22); }
    #tb-send {
        background: linear-gradient(135deg,#FF6F61,#ff9a8b);
        border: none;
        border-radius: 12px;
        width: 38px; height: 38px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: .85rem;
        transition: opacity .18s, transform .15s;
        flex-shrink: 0;
    }
    #tb-send:hover { opacity: .85; transform: scale(1.06); }
    #tb-send:disabled { opacity: .35; cursor: not-allowed; transform: none; }

    #tb-footer {
        text-align: center;
        font-size: .6rem;
        color: rgba(220,221,232,.15);
        padding: 0 1rem .55rem;
        flex-shrink: 0;
    }

    @media (max-width: 430px) {
        #tb-btn   { right: 1rem; bottom: 80px; }
        #tb-panel { width: calc(100vw - 2rem); right: 1rem; bottom: 140px; }
    }
    `;
    document.head.appendChild(style);

    // ── Quick-reply suggestions ───────────────────────────────────────────────
    const CHIPS = [
        '🌍 Dove andare in estate?',
        '💸 Destinazione low cost?',
        '🏛️ Cosa vedere a Roma?',
        '🗺️ Aiutami a scegliere',
        '🍜 Migliore cucina locale?',
        '✈️ Consigli per il volo',
        '📸 Città più fotogenica?',
        '🏖️ Mare e relax?',
    ];

    // ── HTML del widget ───────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.id = 'tb-wrap';
    wrap.innerHTML = `
        <button id="tb-btn" aria-label="Apri TripBot">
            🧭
            <span id="tb-notif" aria-hidden="true"></span>
        </button>
        <div id="tb-panel" role="dialog" aria-label="TripBot assistente viaggi">
            <div id="tb-head">
                <div id="tb-avatar">🧭</div>
                <div id="tb-info">
                    <div id="tb-name">TripBot</div>
                    <div id="tb-status">Online · LLaMA 3.3 70B</div>
                </div>
                <div id="tb-head-actions">
                    <button class="tb-head-btn" id="tb-clear" title="Nuova conversazione">↺ Reset</button>
                    <button class="tb-head-btn" id="tb-close" aria-label="Chiudi">✕</button>
                </div>
            </div>
            <div id="tb-msgs" aria-live="polite"></div>
            <div id="tb-typing" aria-hidden="true">
                <div class="tb-dots"><span></span><span></span><span></span></div>
            </div>
            <div id="tb-chips">
                ${CHIPS.map(c => `<button class="tb-chip">${c}</button>`).join('')}
            </div>
            <div id="tb-input-row">
                <textarea id="tb-input" rows="1" placeholder="Chiedimi tutto sul tuo viaggio…" aria-label="Messaggio"></textarea>
                <button id="tb-send" aria-label="Invia"><i class="fas fa-paper-plane"></i></button>
            </div>
            <div id="tb-footer">Powered by Groq · LLaMA 3.3 70B</div>
        </div>`;
    document.body.appendChild(wrap);

    // ── Refs ──────────────────────────────────────────────────────────────────
    const btn    = document.getElementById('tb-btn');
    const panel  = document.getElementById('tb-panel');
    const msgs   = document.getElementById('tb-msgs');
    const typing = document.getElementById('tb-typing');
    const input  = document.getElementById('tb-input');
    const send   = document.getElementById('tb-send');
    const chips  = document.getElementById('tb-chips');
    const notif  = document.getElementById('tb-notif');

    const SESS_KEY = 'tripnow_tripbot';
    let history = []; // { role, content }[]
    let busy = false;

    // ── Utilità ───────────────────────────────────────────────────────────────
    function md(text) {
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code style="background:rgba(255,111,97,.1);padding:.05em .3em;border-radius:4px;font-size:.95em;">$1</code>')
            .replace(/\n/g, '<br>');
    }

    function scrollBottom() { msgs.scrollTop = msgs.scrollHeight; }

    function appendMsg(role, htmlContent) {
        const row = document.createElement('div');
        row.className = `tb-msg ${role}`;
        if (role === 'bot') {
            row.innerHTML = `<div class="tb-icon-wrap">🧭</div><div class="tb-bubble">${htmlContent}</div>`;
        } else {
            row.innerHTML = `<div class="tb-bubble">${htmlContent}</div>`;
        }
        msgs.appendChild(row);
        scrollBottom();
        return row.querySelector('.tb-bubble');
    }

    // ── Inizializzazione da sessionStorage ────────────────────────────────────
    function init() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(SESS_KEY) || 'null');
            if (saved?.history?.length) {
                history = saved.history;
                if (saved.html) msgs.innerHTML = saved.html;
                chips.style.display = 'none';
                scrollBottom();
                return;
            }
        } catch (_) {}
        // Messaggio di benvenuto
        appendMsg('bot', md('Ciao! 👋 Sono **TripBot**, il tuo assistente di viaggio AI.\nConosco a fondo tutte le 9 destinazioni TripNow e posso aiutarti a scegliere, pianificare e viaggiare al meglio.\nCosa vuoi sapere? 🌍'));
    }

    function persist() {
        try {
            sessionStorage.setItem(SESS_KEY, JSON.stringify({ history, html: msgs.innerHTML }));
        } catch (_) {}
    }

    // ── Invio messaggio ───────────────────────────────────────────────────────
    async function sendMsg(text) {
        text = text.trim();
        if (!text || busy) return;

        chips.style.display = 'none';
        appendMsg('user', md(text));
        history.push({ role: 'user', content: text });

        input.value = '';
        input.style.height = 'auto';
        busy = true;
        send.disabled = true;
        typing.classList.add('show');
        scrollBottom();

        const base = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000';

        try {
            const res = await fetch(`${base}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    messages: history.slice(-10),
                    pageContext: document.title,
                }),
            });

            typing.classList.remove('show');

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                appendMsg('bot', `⚠️ ${err.error || 'Errore di connessione.'}`);
                return;
            }

            // Crea bubble con cursore per streaming
            const bubble = appendMsg('bot', '');
            const cursor = document.createElement('span');
            cursor.className = 'tb-cursor';
            bubble.appendChild(cursor);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                        const chunk = JSON.parse(raw);
                        if (chunk.error) { fullText += '\n⚠️ ' + chunk.error; break; }
                        if (chunk.text) {
                            fullText += chunk.text;
                            bubble.innerHTML = md(fullText);
                            bubble.appendChild(cursor);
                            scrollBottom();
                        }
                    } catch (_) {}
                }
            }

            cursor.remove();
            bubble.innerHTML = md(fullText);
            history.push({ role: 'assistant', content: fullText });
            persist();

            // Badge notifica se panel è chiuso
            if (!panel.classList.contains('open')) {
                notif.textContent = '!';
                notif.classList.add('show');
            }

        } catch (err) {
            typing.classList.remove('show');
            appendMsg('bot', `⚠️ Errore: ${err.message}`);
        } finally {
            busy = false;
            send.disabled = false;
            input.focus();
        }
    }

    // ── Event listeners ───────────────────────────────────────────────────────
    btn.addEventListener('click', () => {
        const open = panel.classList.toggle('open');
        if (open) {
            // Chiude il convertitore valuta se è aperto
            document.getElementById('currency-panel')?.classList.remove('open');
            notif.classList.remove('show');
            setTimeout(() => input.focus(), 300);
        }
    });

    document.getElementById('tb-close').addEventListener('click', () => {
        panel.classList.remove('open');
    });

    document.getElementById('tb-clear').addEventListener('click', () => {
        history = [];
        msgs.innerHTML = '';
        chips.style.display = 'flex';
        sessionStorage.removeItem(SESS_KEY);
        appendMsg('bot', md('Chat resettata! 🔄 Dimmi, come posso aiutarti?'));
    });

    chips.addEventListener('click', e => {
        const chip = e.target.closest('.tb-chip');
        if (chip) {
            // Rimuove l'emoji iniziale prima di inviare
            const text = chip.textContent.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+/u, '').trim();
            sendMsg(text || chip.textContent.trim());
        }
    });

    send.addEventListener('click', () => sendMsg(input.value));

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMsg(input.value);
        }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });

    // Chiudi cliccando fuori dal widget
    document.addEventListener('click', e => {
        if (!wrap.contains(e.target) && panel.classList.contains('open')) {
            panel.classList.remove('open');
        }
    });

    init();
})();
