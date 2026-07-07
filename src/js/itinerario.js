// ── Itinerario AI — Client SSE Consumer ───────────────────────────────────────
// Invia un POST /api/itinerary e consuma la risposta Server-Sent Events (SSE).
// Ogni evento porta un chunk di testo che viene aggiunto al DOM in tempo reale.
// Al termine applica una formattazione markdown-like minimale.

(function () {
    const destEl   = document.getElementById('itin-dest');
    const daysEl   = document.getElementById('itin-days');
    const daysLbl  = document.getElementById('itin-days-label');
    const generateBtn = document.getElementById('itin-generate-btn');
    const btnLabel = document.getElementById('itin-btn-label');
    const resultSection = document.getElementById('itin-result-section');
    const outputEl = document.getElementById('itin-output');
    const cursorEl = document.getElementById('itin-cursor');
    const regenBtn = document.getElementById('itin-regen-btn');
    const copyBtn  = document.getElementById('itin-copy-btn');
    const resultDestLabel = document.getElementById('itin-result-dest-label');
    const actionsEl = document.getElementById('itin-actions');
    const bookLink = document.getElementById('itin-book-link');

    let generating = false;
    let rawText = '';

    // Aggiorna slider giorni
    daysEl?.addEventListener('input', () => {
        const v = daysEl.value;
        daysLbl.textContent = v + (v === '1' ? ' giorno' : ' giorni');
    });

    // Abilita bottone quando destinazione selezionata
    destEl?.addEventListener('change', () => {
        const ok = destEl.value.trim() !== '';
        generateBtn.disabled = !ok;
        btnLabel.textContent = ok ? 'Genera Itinerario' : 'Seleziona una destinazione';
    });

    generateBtn?.addEventListener('click', generate);
    regenBtn?.addEventListener('click', generate);

    // Copia testo
    copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(rawText).then(() => {
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiato!';
            copyBtn.style.color = '#34d399';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copia';
                copyBtn.style.color = '';
            }, 2000);
        });
    });

    async function generate() {
        if (generating) return;
        const destination = destEl.value.trim();
        const days = daysEl.value;
        const interests = [...document.querySelectorAll('.itin-interest-tag input:checked')]
            .map(cb => cb.value);

        if (!destination) return;

        generating = true;
        rawText = '';
        outputEl.innerHTML = '';
        cursorEl?.classList.remove('hidden');
        resultSection.style.display = 'block';
        resultDestLabel.textContent = destination + ' — ' + days + ' giorni';
        if (actionsEl) actionsEl.style.display = 'none';

        // Aggiorna link prenotazione
        if (bookLink) {
            bookLink.href = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}`;
        }

        generateBtn.disabled = true;
        btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generazione in corso...';

        // Scroll to result
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const base = typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000';

        try {
            const res = await fetch(`${base}/api/itinerary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ destination, days: parseInt(days), interests }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showError(err.error || 'Errore durante la generazione');
                return;
            }

            // Legge lo stream SSE manualmente (ReadableStream)
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Processa tutti gli eventi completi nel buffer
                const lines = buffer.split('\n');
                buffer = lines.pop(); // l'ultima riga potrebbe essere incompleta

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (payload === '[DONE]') break;
                    try {
                        const { text, error } = JSON.parse(payload);
                        if (error) { showError(error); return; }
                        if (text) {
                            rawText += text;
                            outputEl.textContent = rawText;
                        }
                    } catch (_) {}
                }
            }

            // Formattazione finale markdown-like
            renderMarkdown();
            cursorEl?.classList.add('hidden');
            if (actionsEl) actionsEl.style.display = 'flex';

        } catch (err) {
            showError('Errore di connessione: ' + err.message);
        } finally {
            generating = false;
            generateBtn.disabled = false;
            btnLabel.innerHTML = '<i class="fas fa-magic"></i> Genera Itinerario';
        }
    }

    function renderMarkdown() {
        // Converte il testo grezzo in HTML con stili leggeri
        const html = rawText
            .replace(/^## (.+)$/gm, '<div class="itin-h2">$1</div>')
            .replace(/^### (.+)$/gm, '<div class="itin-h3">$1</div>')
            .replace(/\*\*(.+?)\*\*/g, '<span class="itin-bold">$1</span>')
            .replace(/\*(.+?)\*/g, '<span class="itin-italic">$1</span>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        outputEl.innerHTML = html;
    }

    function showError(msg) {
        outputEl.innerHTML = `<span style="color:#FF6F61;"><i class="fas fa-exclamation-triangle"></i> ${msg}</span>`;
        cursorEl?.classList.add('hidden');
        generating = false;
        generateBtn.disabled = false;
        btnLabel.innerHTML = '<i class="fas fa-magic"></i> Genera Itinerario';
    }
})();
