document.addEventListener('DOMContentLoaded', function () {

    // Scroll effect header: aggiunge .scrolled dopo 60px
    const headerEl = document.querySelector('header');
    if (headerEl) {
        const onScroll = () => {
            headerEl.classList.toggle('scrolled', window.scrollY > 60);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    checkLoginStatus();
    
    document.body.style.overflow = 'hidden';
    // Gestione Loading Screen
    const loadingScreenElement = document.getElementById('loading-screen');
    if (loadingScreenElement) {
        const loadingDuration = 1800;
        const transitionDuration = 1000;

        setTimeout(() => {
            loadingScreenElement.classList.add('exit');
            setTimeout(() => {
                document.body.style.overflow = "auto";
                loadingScreenElement.style.display = 'none';
                checkAndShowCookieBanner();
            }, transitionDuration);
        }, loadingDuration);
    } else {
        document.body.style.overflow = "auto";
        checkAndShowCookieBanner();
    }

    // Gestione Banner Cookie
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptButton = document.getElementById('accept-cookies');
    const rejectButton = document.getElementById('reject-cookies');

    function triggerStampAnimations() {
        const stamps = document.querySelectorAll('#cookie-banner .stamp');
        stamps.forEach(stamp => {
            stamp.style.animationPlayState = 'running';
        });
    }

    function checkAndShowCookieBanner() {
        let currentConsent = null;
        try {
            currentConsent = localStorage.getItem('cookieConsent');
        } catch (e) {
            console.error("checkAndShowCookieBanner: Errore lettura localStorage:", e);
            currentConsent = null;
        }

        const bannerElement = document.getElementById('cookie-banner');
        if (bannerElement) {
            if (!currentConsent) {
                bannerElement.style.display = '';
                bannerElement.classList.add('active');
                setTimeout(triggerStampAnimations, 650);
            } else {
                bannerElement.classList.remove('active');
            }
        }
    }

    function hideCookieBanner() {
        if (cookieBanner) cookieBanner.classList.remove('active');
    }

    function acceptCookies() {
        try {
            localStorage.setItem('cookieConsent', 'accepted');
        } catch (e) {
            console.error("Errore salvataggio consenso:", e);
        }
        hideCookieBanner();
    }

    function rejectCookies() {
        try {
            localStorage.setItem('cookieConsent', 'rejected');
        } catch (e) {
            console.error("Errore salvataggio consenso:", e);
        }
        hideCookieBanner();
    }

    if (acceptButton) acceptButton.addEventListener('click', acceptCookies);
    if (rejectButton) rejectButton.addEventListener('click', rejectCookies);

    const revealElements = document.querySelectorAll(".reveal-on-scroll");
    if (revealElements.length > 0) {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        }, {
            root: null,
            threshold: 0.15
        });
        revealElements.forEach(el => {
            revealObserver.observe(el);
        });
    }

    // Gestione del menu a tendina  
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('nav ul');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function () {
            navLinks.classList.toggle('active');
        });

        navLinks.addEventListener('click', function (event) {
            if (event.target.closest('a')) {
                if (navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                }
            }
        });

        document.addEventListener('click', function (event) {
            if (navLinks.classList.contains('active')) {
                const isClickInsideNav = navLinks.contains(event.target);
                const isClickOnToggle = menuToggle.contains(event.target);
                if (!isClickInsideNav && !isClickOnToggle) {
                    navLinks.classList.remove('active');
                }
            }
        });
    }

    // Menu Destinazioni  
    const destinationMenuItem = document.querySelector('.nav-destinations.has-megamenu');
    const continentItems = document.querySelectorAll('.continent-item');
    const destinationPanels = document.querySelectorAll('.destinations-panel');

    if (destinationMenuItem && continentItems.length > 0 && destinationPanels.length > 0) {
        continentItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                destinationPanels.forEach(panel => panel.classList.remove('active'));
                const targetPanel = document.getElementById(`panel-${item.dataset.continent}`);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
            });
        });

        const megaMenu = destinationMenuItem.querySelector('.mega-menu');
        if (megaMenu) {
            megaMenu.addEventListener('mouseleave', () => {
                destinationPanels.forEach(panel => panel.classList.remove('active'));
            });
        }
    }

    // Aggiunta classe visible per .reveal-on-load manuale  
    document.querySelectorAll('.reveal-on-load, .reveal-on-load-delayed').forEach(el => {
        setTimeout(() => el.classList.add('visible'), el.classList.contains('reveal-on-load-delayed') ? 300 : 0);
    });
    
    // Gestione del Modal
    // Supporta due strutture: "old" (modal-overlay.hidden) e "new" (#login-modal)
    const modalOverlay = document.getElementById("modal-overlay");
    const modalTitle = document.getElementById("modal-title");
    const openModalButtons = document.querySelectorAll(".open-modal");

    // Rileva quale struttura modale è presente
    const loginModal = document.getElementById('login-modal');
    const isNewModal = !!loginModal;

    const closeModalButton = isNewModal
        ? document.getElementById('modal-close-btn')
        : document.querySelector('.close-btn');

    // Riferimenti ai testi del link "passa a login/registrazione"
    // Per il nuovo modal: staticText è il <p> ma lo aggiorniamo solo tramite innerHTML
    const staticText = isNewModal
        ? document.getElementById('modal-switch-text')
        : document.querySelector('#modal-switch-link span');
    const link = isNewModal
        ? document.getElementById('modal-switch-link')
        : document.querySelector('#modal-switch-link a');

    // Helper: aggiorna testo switch senza distruggere il <a> figlio (nuovo modal)
    const updateSwitchText = (mode) => {
        if (!staticText || !link) return;
        if (isNewModal) {
            // Ricostruisce il paragrafo preservando il link
            const label = mode === 'login' ? 'Non hai un account? ' : 'Hai già un account? ';
            const linkText = mode === 'login' ? 'Registrati' : 'Accedi qui!';
            staticText.innerHTML = `${label}<a href="#" id="modal-switch-link">${linkText}</a>`;
            // Ri-aggancia il listener sul nuovo <a>
            const newLink = document.getElementById('modal-switch-link');
            if (newLink) newLink.addEventListener('click', switchHandler);
        } else {
            staticText.textContent = mode === 'login' ? 'Non hai un account? ' : 'Hai già un account? ';
            link.textContent = mode === 'login' ? 'Creane uno qui!' : 'Accedi qui!';
        }
    };

    if (modalOverlay && modalTitle && openModalButtons.length > 0 && closeModalButton) {

        const showModal = () => {
            if (isNewModal) {
                modalOverlay.style.display = 'block';
                loginModal.style.display = 'block';
            } else {
                modalOverlay.classList.remove('hidden');
            }
        };
        const closeModal = () => {
            if (isNewModal) {
                modalOverlay.style.display = 'none';
                loginModal.style.display = 'none';
            } else {
                modalOverlay.classList.add('hidden');
            }
        };

        openModalButtons.forEach(button => {
            button.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                const type = this.dataset.type;
                showModal();
                modalOverlay.dataset.mode = type;
                modalTitle.textContent = type === "login" ? "Accedi al tuo account" : "Crea un nuovo account";
                updateSwitchText(type);
            });
        });

        // Handler switch login↔registrazione (definito qui per poter essere ri-agganciato)
        function switchHandler(e) {
            e.preventDefault();
            e.stopPropagation();
            const newMode = modalOverlay.dataset.mode === 'login' ? 'register' : 'login';
            modalOverlay.dataset.mode = newMode;
            modalTitle.textContent = newMode === 'login'
                ? 'Accedi al tuo account' : 'Crea un nuovo account';
            updateSwitchText(newMode);
        }

        const switchModeLink = isNewModal
            ? document.getElementById('modal-switch-link')
            : document.getElementById('switch-mode-link');
        if (switchModeLink) switchModeLink.addEventListener('click', switchHandler);

        closeModalButton.addEventListener("click", closeModal);
        modalOverlay.addEventListener("click", function (e) {
            if (e.target === this) closeModal();
        });

        // Gestione invio form login/registrazione con Node.js server
        const modalForm = document.getElementById("modal-form");
        // Stato interno per il flusso 2FA (step 2)
        let _totpTempToken = null;
        let _totpEmail     = null;

        if (modalForm) {
            modalForm.addEventListener("submit", async (e) => {
                e.preventDefault();

                const email = modalForm.querySelector("input[type='email']").value;
                const password = modalForm.querySelector("input[type='password']").value;
                const mode = modalOverlay.dataset.mode || "login";

                const endpoint = mode === "register"
                    ? `${API_BASE}/register`
                    : `${API_BASE}/login`;

                try {
                    const res = await fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ email, password })
                    });

                    // HTTP 202 = password corretta ma 2FA richiesto
                    if (res.status === 202) {
                        const data = await res.json();
                        if (data.require2FA) {
                            _totpTempToken = data.tempToken;
                            _totpEmail     = email;
                            // Mostra step 2FA nascondendo il form password
                            modalForm.style.display = 'none';
                            const totpStep = document.getElementById('totp-step');
                            if (totpStep) {
                                totpStep.style.display = 'block';
                                document.getElementById('totp-input')?.focus();
                            }
                            return;
                        }
                    }

                    const result = await res.text();

                    if (res.ok) {
                        showToast(result, true);
                        if (result.includes("Registrazione completata") || result.includes("Login riuscito")) {
                            setTimeout(() => {
                                closeModal();
                                if (result.includes("Login riuscito")) {
                                    setupUserIcon(email);
                                    loadRecommendations();
                                }
                            }, 1000);
                        }
                    } else {
                        showToast(result, false);
                    }
                } catch (err) {
                    console.error("Errore invio dati:", err);
                    showToast("Errore di connessione al server.", false);
                }
            });
        }

        // ── Step 2: Verifica codice TOTP ──────────────────────────────────────
        const totpSubmitBtn = document.getElementById('totp-submit-btn');
        if (totpSubmitBtn) {
            totpSubmitBtn.addEventListener('click', async () => {
                const totpCode   = document.getElementById('totp-input')?.value.trim();
                const backupCode = document.getElementById('backup-input')?.value.trim();

                if ((!totpCode || totpCode.length !== 6) && !backupCode) {
                    showToast('Inserisci il codice a 6 cifre', false);
                    return;
                }

                try {
                    const res = await fetch(`${API_BASE}/totp/verify-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            tempToken: _totpTempToken,
                            totpCode:   totpCode   || undefined,
                            backupCode: backupCode || undefined,
                        })
                    });
                    const result = await res.text();
                    if (res.ok) {
                        showToast(result, true);
                        const email = _totpEmail;
                        setTimeout(() => {
                            closeModal();
                            setupUserIcon(email);
                            loadRecommendations();
                            // Reset stato 2FA
                            _totpTempToken = null;
                            _totpEmail     = null;
                            modalForm.style.display = 'block';
                            const totpStep = document.getElementById('totp-step');
                            if (totpStep) totpStep.style.display = 'none';
                            if (document.getElementById('totp-input'))
                                document.getElementById('totp-input').value = '';
                        }, 1000);
                    } else {
                        showToast(result, false);
                    }
                } catch (err) {
                    showToast('Errore di connessione', false);
                }
            });
        }

    }

    // Gestione interfaccia utente — definita fuori dall'if modal per essere sempre disponibile
    function setupUserIcon(email) {
        const loginIcon = document.querySelector('.login-icon');
        const dropdownContainer = document.querySelector('.dropdown-container');

        if (loginIcon && dropdownContainer) {
            dropdownContainer.style.display = 'none';

            const existingMenu = loginIcon.querySelector('.dropdown');
            if (existingMenu) existingMenu.remove();

            const userDropdown = document.createElement('div');
            userDropdown.classList.add('dropdown');

            userDropdown.innerHTML = `
                <p style="margin: 0; font-size: 13px; padding: 10px 15px;">${email}</p>
                <a href="#" id="logout-btn" style="display: block; padding: 10px 15px;">Logout</a>
            `;

            loginIcon.appendChild(userDropdown);

            loginIcon.addEventListener('mouseenter', () => {
                userDropdown.style.display = 'block';
            });
            loginIcon.addEventListener('mouseleave', () => {
                userDropdown.style.display = 'none';
            });
            loginIcon.addEventListener('click', () => {
                window.location.href = '../html/user.html';
            });
            userDropdown.querySelector('#logout-btn').addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await fetch(`${API_BASE}/logout`, {
                    method: 'POST',
                    credentials: 'include'
                });
                userDropdown.remove();
                dropdownContainer.style.display = 'flex';
            });
        }
    }

    async function checkLoginStatus() {
        try {
            const res = await fetch(`${API_BASE}/profile`, {
                method: 'GET',
                credentials: 'include'
            });

            if (res.ok) {
                const email = await res.text();
                setupUserIcon(email.replace('Benvenuto ', '').trim());
                loadRecommendations();
            } else {
                setupGuestIcon();
            }
        } catch (err) {
            console.error('Errore nel controllo dello stato login:', err);
            setupGuestIcon();
        }
    }

    // ── Recommendation Engine ─────────────────────────────────────────────────
    // Recupera le destinazioni suggerite dal backend (content-based filtering)
    // e le mostra nella sezione #recommendations-section se presente nella pagina.
    async function loadRecommendations() {
        const section = document.getElementById('recommendations-section');
        const grid    = document.getElementById('recommendations-grid');
        if (!section || !grid) return;

        try {
            const res = await fetch(`${API_BASE}/api/recommendations`, {
                credentials: 'include'
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!data || data.length === 0) return;

            grid.innerHTML = data.map(dest => `
                <a href="${dest.link}" class="rec-card">
                    <div class="rec-card-name">${dest.name}</div>
                    <div class="rec-card-score">
                        <span class="rec-match-bar" style="width:${Math.round(dest.score * 100)}%"></span>
                        <span class="rec-match-label">Match: ${Math.round(dest.score * 100)}%</span>
                    </div>
                </a>
            `).join('');
            section.style.display = 'block';
        } catch (_) {}
    }

    function setupGuestIcon() {
        const loginIcon = document.querySelector('.login-icon');
        const dropdownContainer = document.querySelector('.dropdown-container');
    
        if (loginIcon && dropdownContainer) {
            dropdownContainer.style.display = 'flex';

            const existingMenu = loginIcon.querySelector('.dropdown');
            if (existingMenu) existingMenu.remove();
        }
    }

    document.querySelectorAll('.save-favorite').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const destinationName = button.dataset.name;
            const destinationLink = button.dataset.link;
            try {
                const res = await fetch(`${API_BASE}/add-favorite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ destinationName, destinationLink })
                });
                const result = await res.text();
                showToast(result, res.ok);
                if (res.ok) {
                    // Aggiorna contatore badge preferiti (localStorage locale)
                    try {
                        const favs = JSON.parse(localStorage.getItem('tripnow_favorites') || '[]');
                        const entry = { name: destinationName, link: destinationLink };
                        if (!favs.some(f => f.link === destinationLink)) favs.push(entry);
                        localStorage.setItem('tripnow_favorites', JSON.stringify(favs));
                        document.dispatchEvent(new Event('favorites-updated'));
                    } catch (_) {}
                }
            } catch (err) {
                console.error('Errore salvataggio preferito:', err);
                showToast('Errore di connessione!', false);
            }
        });
    });

    // Funzione per creare un toast
    function showToast(message, success = true) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = success ? '#28a745' : '#dc3545';
        toast.style.color = 'white';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        toast.style.zIndex = 1000;
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.addEventListener('transitionend', () => toast.remove());
        }, 2500);
    }
});