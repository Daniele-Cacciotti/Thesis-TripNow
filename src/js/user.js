document.addEventListener('DOMContentLoaded', function () {

    checkUserAccess();

    // Recupera email dal server
    fetch(`${API_BASE}/profile`, {
        method: 'GET',
        credentials: 'include'
    })
    .then(res => res.text())
    .then(email => {
        document.getElementById('user-email').textContent = email.replace('Benvenuto ', '').trim();
        loadFavorites();
        load2FAStatus();
    })
    .catch(err => {
        console.error('Errore nel caricamento email utente:', err);
    });

    // Logout diretto
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await fetch(`${API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        // replace() rimuove user.html dalla history: il back button non ci torna più
        window.location.replace('homepage.html');
    });

    // Funzioni modali
    document.getElementById('edit-email-link').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('email-modal').style.display = 'block';
        document.getElementById('password-modal').style.display = 'none';
    });

    document.getElementById('edit-password-link').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('password-modal').style.display = 'block';
        document.getElementById('email-modal').style.display = 'none';
    });

    // Salva nuova email
    document.getElementById('save-email-btn').addEventListener('click', async () => {
        const newEmail = document.getElementById('new-email').value;
        if (!newEmail) return showToast('Inserisci una nuova email.', false);

        try {
            const res = await fetch(`${API_BASE}/change-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ newEmail })
            });
            const text = await res.text();
            showToast(text, res.ok);
            if (res.ok) window.location.reload();
        } catch (err) {
            console.error('Errore modifica email:', err);
        }
    });

    // Salva nuova password
    document.getElementById('save-password-btn').addEventListener('click', async () => {
        const newPassword = document.getElementById('new-password').value;
        if (!newPassword) return showToast('Inserisci una nuova password.', false);

        try {
            const res = await fetch(`${API_BASE}/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ newPassword })
            });
            const text = await res.text();
            showToast(text, res.ok);
            if (res.ok) window.location.reload();
        } catch (err) {
            console.error('Errore modifica password:', err);
        }
    });

    // Gestione errori per la sessione di accesso
    async function checkUserAccess() {
        try {
            const res = await fetch(`${API_BASE}/profile`, {
                method: 'GET',
                credentials: 'include'
            });
            if (!res.ok) {
                window.location.href = 'homepage.html';
            }
        } catch (err) {
            console.error('Errore nel controllo accesso utente:', err);
            window.location.href = 'homepage.html';
        }
    }

    // Controlla sempre al ripristino dalla bfcache (back button dopo logout)
    window.addEventListener('pageshow', () => {
        checkUserAccess();
    });

    // Caricamento dei preferiti — fix XSS: usa textContent e setAttribute
    async function loadFavorites() {
        try {
            const res = await fetch(`${API_BASE}/favorites`, {
                method: 'GET',
                credentials: 'include'
            });

            if (res.ok) {
                const favorites = await res.json();
                const favoritesSection = document.getElementById('favorites-list');
                const noFavoritesMessage = document.getElementById('no-favorites-message');

                favoritesSection.innerHTML = '';

                const seen = new Set();
                const uniqueFavorites = favorites.filter(fav => {
                    const key = fav.destination_link;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });

                if (uniqueFavorites.length > 0) {
                    noFavoritesMessage.style.display = 'none';
                    uniqueFavorites.forEach(fav => {
                        const li = document.createElement('li');

                        // Fix XSS: non usare innerHTML con dati dal server
                        const a = document.createElement('a');
                        a.textContent = fav.destination_name;
                        a.setAttribute('href', fav.destination_link);

                        const btn = document.createElement('button');
                        btn.textContent = 'Rimuovi';
                        btn.className = 'delete-favorite';
                        btn.setAttribute('data-link', fav.destination_link);
                        btn.style.marginLeft = '10px';

                        li.appendChild(a);
                        li.appendChild(btn);
                        favoritesSection.appendChild(li);
                    });

                    document.querySelectorAll('.delete-favorite').forEach(button => {
                        button.addEventListener('click', async () => {
                            const destinationLink = button.dataset.link;
                            try {
                                await fetch(`${API_BASE}/delete-favorite`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({ destinationLink })
                                });
                                loadFavorites();
                            } catch (err) {
                                console.error('Errore rimozione preferito:', err);
                            }
                        });
                    });

                } else {
                    noFavoritesMessage.style.display = '';
                }
            }
        } catch (err) {
            console.error('Errore caricamento preferiti:', err);
        }
    }

    // ── 2FA / TOTP Management ──────────────────────────────────────────────────

    function showTotpMsg(text, isOk = false) {
        let el = document.getElementById('totp-inline-msg');
        if (!el) {
            el = document.createElement('p');
            el.id = 'totp-inline-msg';
            el.style.cssText = 'margin:0.75rem 0 0;font-size:0.85rem;padding:0.5rem 0.8rem;border-radius:8px;';
            const section = document.getElementById('totp-section');
            if (section) section.prepend(el);
        }
        el.textContent = text;
        el.style.background = isOk ? 'rgba(52,211,153,0.1)' : 'rgba(255,111,97,0.1)';
        el.style.color = isOk ? '#34d399' : '#FF6F61';
        el.style.border = isOk ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(255,111,97,0.25)';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.textContent = ''; el.style.background = ''; el.style.border = ''; }, 5000);
    }

    async function load2FAStatus() {
        try {
            const res = await fetch(`${API_BASE}/totp/status`, { credentials: 'include' });
            if (!res.ok) return;
            const { enabled } = await res.json();
            const statusText  = document.getElementById('totp-status-text');
            const statusBadge = document.getElementById('totp-status-badge');
            if (statusText) statusText.textContent = enabled ? 'Autenticazione 2FA' : 'Attiva Autenticazione 2FA';
            if (statusBadge) {
                statusBadge.textContent = enabled ? 'Attivo' : 'Non attivo';
                statusBadge.className = `totp-badge ${enabled ? 'active' : 'inactive'}`;
            }
            // Al click mostra il form di setup o disabilitazione a seconda dello stato
            const toggleLink = document.getElementById('totp-toggle-link');
            if (toggleLink) {
                toggleLink.onclick = (e) => {
                    e.preventDefault();
                    if (enabled) {
                        document.getElementById('totp-disable-block').style.display = 'block';
                        document.getElementById('totp-setup-block').style.display = 'none';
                    } else {
                        startTOTPSetup();
                    }
                };
            }
        } catch (_) {}
    }

    async function startTOTPSetup() {
        try {
            const res  = await fetch(`${API_BASE}/totp/setup`, { method: 'POST', credentials: 'include' });
            if (!res.ok) { showTotpMsg('Errore durante il setup 2FA'); return; }
            const { qrDataUrl, secret } = await res.json();
            document.getElementById('qr-img').src  = qrDataUrl;
            document.getElementById('totp-manual-secret').textContent = secret;
            document.getElementById('totp-setup-block').style.display = 'block';
            document.getElementById('totp-disable-block').style.display = 'none';
        } catch (_) { showTotpMsg('Errore di connessione'); }
    }

    document.getElementById('totp-enable-btn')?.addEventListener('click', async () => {
        const code = document.getElementById('totp-verify-input')?.value.trim();
        if (!code || code.length !== 6) { showTotpMsg('Inserisci il codice a 6 cifre'); return; }
        try {
            const res = await fetch(`${API_BASE}/totp/enable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ totpCode: code })
            });
            if (!res.ok) { showTotpMsg(await res.text()); return; }
            const { backupCodes } = await res.json();
            // Mostra backup codes
            const list = document.getElementById('backup-codes-list');
            list.innerHTML = backupCodes.map(c => `<code>${c}</code>`).join('');
            document.getElementById('totp-setup-block').style.display = 'none';
            document.getElementById('backup-codes-block').style.display = 'block';
        } catch (_) { showTotpMsg('Errore di connessione'); }
    });

    document.getElementById('backup-codes-done')?.addEventListener('click', () => {
        document.getElementById('backup-codes-block').style.display = 'none';
        load2FAStatus();
    });

    document.getElementById('totp-setup-cancel')?.addEventListener('click', () => {
        document.getElementById('totp-setup-block').style.display = 'none';
    });

    document.getElementById('totp-disable-btn')?.addEventListener('click', async () => {
        const password  = document.getElementById('disable-password')?.value;
        const totpCode  = document.getElementById('disable-totp-code')?.value.trim();
        if (!password || !totpCode) { showTotpMsg('Inserisci password e codice OTP'); return; }
        try {
            const res = await fetch(`${API_BASE}/totp/disable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password, totpCode })
            });
            if (!res.ok) { showTotpMsg(await res.text()); return; }
            document.getElementById('totp-disable-block').style.display = 'none';
            load2FAStatus();
        } catch (_) { showTotpMsg('Errore di connessione'); }
    });

    document.getElementById('totp-disable-cancel')?.addEventListener('click', () => {
        document.getElementById('totp-disable-block').style.display = 'none';
    });

    // Funzione di eliminazione Account
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
        if (!confirm('Sei sicuro di voler cancellare il tuo account?')) return;
        try {
            const res = await fetch(`${API_BASE}/delete-account`, {
                method: 'POST',
                credentials: 'include'
            });

            const text = await res.text();
            const messageDiv = document.getElementById('message');

            if (res.ok) {
                messageDiv.textContent = 'Account cancellato! Torniamo alla homepage...';
                setTimeout(() => {
                    window.location.assign('homepage.html');
                }, 1500);
            } else {
                messageDiv.textContent = 'Errore nella cancellazione: ' + text;
                setTimeout(() => {
                    window.location.replace('homepage.html');
                }, 2000);
            }
        } catch (err) {
            console.error('Errore cancellazione account:', err);
            const messageDiv = document.getElementById('message');
            messageDiv.textContent = 'Errore durante la cancellazione dell\'account.';
            setTimeout(() => {
                window.location.replace('homepage.html');
            }, 2000);
        }
    });
});
