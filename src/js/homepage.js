document.addEventListener('DOMContentLoaded', function () {

    //   Carosello Testimonial  
    const carouselContainer = document.querySelector(".testimonial-carousel-container");
    const carousel = carouselContainer ? carouselContainer.querySelector(".testimonial-carousel") : null;
    const cards = carousel ? carousel.querySelectorAll(".testimonial-card") : [];
    const prevButton = carouselContainer ? carouselContainer.querySelector(".carousel-arrow.prev") : null;
    const nextButton = carouselContainer ? carouselContainer.querySelector(".carousel-arrow.next") : null;
    const dotsContainer = carouselContainer ? carouselContainer.querySelector(".carousel-dots") : null;

    if (carousel && cards.length > 1) {
        let currentIndex = 0;
        let intervalId = null;
        const slideInterval = 5000;

        function showSlide(index) {
            cards.forEach(card => card.classList.remove("active"));
            cards[index].classList.add("active");

            if (dotsContainer) {
                const dots = dotsContainer.querySelectorAll(".dot");
                if (dots.length === cards.length) {
                    dots.forEach(dot => dot.classList.remove("active"));
                    dots[index].classList.add("active");
                }
            }
            currentIndex = index;
        }

        function nextSlide() {
            const nextIndex = (currentIndex + 1) % cards.length;
            showSlide(nextIndex);
        }

        function prevSlide() {
            const prevIndex = (currentIndex - 1 + cards.length) % cards.length;
            showSlide(prevIndex);
        }

        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            cards.forEach((_, index) => {
                const dot = document.createElement("button");
                dot.classList.add("dot");
                dot.setAttribute("aria-label", `Vai alla testimonianza ${index + 1}`);
                dot.addEventListener("click", () => {
                    if (currentIndex !== index) {
                        showSlide(index);
                        resetInterval();
                    }
                });
                dotsContainer.appendChild(dot);
            });
        }

        showSlide(0);

        function startInterval() {
            stopInterval();
            intervalId = setInterval(nextSlide, slideInterval);
        }

        function stopInterval() {
            clearInterval(intervalId);
        }

        function resetInterval() {
            stopInterval();
            startInterval();
        }

        if (nextButton) nextButton.addEventListener("click", () => {
            nextSlide();
            resetInterval();
        });

        if (prevButton) prevButton.addEventListener("click", () => {
            prevSlide();
            resetInterval();
        });

        if (carouselContainer) {
            carouselContainer.addEventListener('mouseenter', stopInterval);
            carouselContainer.addEventListener('mouseleave', startInterval);
            carouselContainer.addEventListener('focusin', stopInterval);
            carouselContainer.addEventListener('focusout', startInterval);
        }

        startInterval();
    } else {
        if (prevButton) prevButton.style.display = 'none';
        if (nextButton) nextButton.style.display = 'none';
        if (dotsContainer) dotsContainer.style.display = 'none';
        if (cards.length === 1) cards[0].classList.add('active');
    }

    // Nuove funzionalità barra di ricerca responsive
    const destination = document.getElementById("destination");
    const checkin = document.getElementById("checkin");
    const checkout = document.getElementById("checkout");
    const guests = document.getElementById("guests");
    const searchBtn = document.getElementById("searchButton");
    
    // Flatpickr
    const flatpickrInstance = {};
    flatpickr("#checkin", {
        monthSelectorType: "static",
        minDate: "today",
        dateFormat: "d/m/Y",
        locale: { firstDayOfWeek: 1 },
        disableMobile: true,
        onChange: function (selectedDates, dateStr) {
            const checkoutPicker = flatpickrInstance["checkout"];
            if (checkoutPicker) {
                checkoutPicker.set("minDate", dateStr);
            }
        },
        onDayCreate: function (_, __, ___, dayElem) {
            const date = dayElem.dateObj;
            if (date.getDay() === 0 || date.getDay() === 6) {
                dayElem.classList.add("weekend");
            }
        }
    });
    flatpickrInstance["checkout"] = flatpickr("#checkout", {
        monthSelectorType: "static",
        minDate: "today",
        dateFormat: "d/m/Y",
        locale: { firstDayOfWeek: 1 },
        disableMobile: true,
        onDayCreate: function (_, __, ___, dayElem) {
            const date = dayElem.dateObj;
            if (date.getDay() === 0 || date.getDay() === 6) {
                dayElem.classList.add("weekend");
            }
        }
    });

    initDateLogic(checkin, checkout);
    initAutoSave([destination, checkin, checkout, guests]);
    initSearchValidation([destination, checkin, checkout, guests], searchBtn);
    createCheckoutErrorMessage(checkout);
 
    destination.addEventListener("keydown", e => {
        if (e.key === "Enter") searchBtn.click();
    });
    
    const form = document.getElementById('searchForm');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);

        const rawCheckin = formData.get('checkin');
        const rawCheckout = formData.get('checkout');

        // Se arrivano tipo "30/04/2025", rimetto giusto "2025-04-30"
        const fixDate = (dateStr) => {
            if (dateStr.includes('/')) {
                const [day, month, year] = dateStr.split('/');
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            return dateStr;
        };

        const data = {
            destination: formData.get('destination'),
            checkin: fixDate(rawCheckin),
            checkout: fixDate(rawCheckout),
            guests: formData.get('guests')
        };

        const response = await fetch(`${API_BASE}/search-hotel`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        window.open(result.bookingUrl, '_blank');
    });
    
    function validateDateOrder() {
        const checkinDateParts = checkin.value.split('/');
        const checkoutDateParts = checkout.value.split('/');
    
        let showError = false;
        if (checkinDateParts.length === 3 && checkoutDateParts.length === 3) {
            const [ciDay, ciMonth, ciYear] = checkinDateParts.map(Number);
            const [coDay, coMonth, coYear] = checkoutDateParts.map(Number);
    
            if (coYear < ciYear ||
                (coYear === ciYear && coMonth < ciMonth) ||
                (coYear === ciYear && coMonth === ciMonth && coDay <= ciDay)) {
                showError = true;
            }
        }
        showCheckoutError(showError);
    }
    
    checkout.addEventListener("input", validateDateOrder);
    checkin.addEventListener("input", validateDateOrder);

    destination.addEventListener("input", () => {
        if (destination.value.length > 1) {
            showToast("Stai cercando: " + destination.value);
        }
    });

    document.addEventListener('mousedown', (e) => {
        const clickedInput = e.target;
        const isDateInput = clickedInput.classList.contains('date-input');
        const allDateInputs = document.querySelectorAll('.date-input');

        allDateInputs.forEach(input => {
            if (input !== clickedInput && input === document.activeElement) {
                input.blur();
            }
        });

        if (isDateInput && clickedInput !== document.activeElement) {
            setTimeout(() => {
                clickedInput.focus();
            }, 0);
        }
    });

    function initAutoSave(fields) {
        fields.forEach(field => {
            const saved = sessionStorage.getItem("search_" + field.id);
            if (saved) field.value = saved;

            field.addEventListener("input", () => {
                sessionStorage.setItem("search_" + field.id, field.value);
            });
        });
    }

    function initDateLogic(checkin, checkout) {
        const today = new Date().toISOString().split("T")[0];
        checkin.min = today;

        checkin.addEventListener("change", () => {
            const minCheckout = new Date(checkin.value);
            minCheckout.setDate(minCheckout.getDate() + 1);
            checkout.min = minCheckout.toISOString().split("T")[0];

            if (checkout.value && checkout.value <= checkin.value) {
                checkout.value = "";
            }
        });
    }

    // Validazione campi di input della barra di ricerca
    function initSearchValidation(fields, button) {
        function validate() {
            const [destination, checkin, checkout, guests] = fields;
            const guestsVal = parseInt(guests.value, 10);

            const allFilled = destination.value.trim() && checkin.value && checkout.value && guestsVal >= 1;
        const checkinDateParts = checkin.value.split('/');
        const checkoutDateParts = checkout.value.split('/');

        let datesValid = false;
        if (checkinDateParts.length === 3 && checkoutDateParts.length === 3) {
            const [ciDay, ciMonth, ciYear] = checkinDateParts.map(Number);
            const [coDay, coMonth, coYear] = checkoutDateParts.map(Number);

            if (coYear > ciYear) {
                datesValid = true;
            } else if (coYear === ciYear) {
                if (coMonth > ciMonth) {
                    datesValid = true;
                } else if (coMonth === ciMonth) {
                    datesValid = coDay > ciDay;
                }
            }
        }

            const isValid = allFilled && datesValid;
            button.disabled = !isValid;
            button.style.opacity = isValid ? "1" : "0.6";
            button.style.cursor = isValid ? "pointer" : "not-allowed";
        }

        fields.forEach(field => {
            field.addEventListener("input", validate);
            field.addEventListener("change", validate);
        });

        validate();
    }

    function createCheckoutErrorMessage(checkout) {
        let errorDiv = document.createElement("div");
        errorDiv.id = "checkout-error";
        errorDiv.style.color = "#ff6f61";
        errorDiv.style.fontSize = "0.8rem";
        errorDiv.style.marginTop = "4px";
        errorDiv.style.display = "none";
        errorDiv.textContent = "La data di check-out deve essere successiva al check-in.";
        checkout.parentElement.appendChild(errorDiv);
    }

    function showCheckoutError(show = true) {
        const error = document.getElementById("checkout-error");
        if (error) error.style.display = show ? "block" : "none";
    }

    function showToast(message, duration = 2500, isError=false) {
        const toast = document.createElement("div");
        toast.textContent = message;
        Object.assign(toast.style, {
            position: "fixed",
            bottom: "30px",
            left: "50%",
            transform: "translateX(-50%)",
            background: isError ? "#dc3545" : "#28a745",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "8px",
            fontSize: "0.9rem",
            opacity: "0",
            transition: "opacity 0.3s ease",
            zIndex: "9999"
        });

        document.body.appendChild(toast);
        setTimeout(() => (toast.style.opacity = "1"), 100);
        setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Gestione invio form newsletter
    const newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) {
        const newsletterFeedback = document.getElementById('toast-newsletter');

        function showNewsletterFeedback(msg, ok) {
            if (!newsletterFeedback) return;
            newsletterFeedback.textContent = msg;
            newsletterFeedback.className = '';
            newsletterFeedback.style.cssText = `
                margin-top: 14px; padding: 12px 20px; border-radius: 8px; font-size: 0.95rem;
                font-weight: 600; text-align: center;
                background: ${ok ? 'rgba(255,255,255,0.15)' : 'rgba(220,53,69,0.25)'};
                color: #fff; border: 1px solid ${ok ? 'rgba(255,255,255,0.4)' : 'rgba(220,53,69,0.6)'};
            `;
        }

        newsletterForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const emailInput = newsletterForm.querySelector('input[type="email"]');
            const email = emailInput ? emailInput.value.trim() : '';

            if (!email) {
                showNewsletterFeedback("Inserisci un'email valida.", false);
                return;
            }

            const btn = newsletterForm.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Invio...'; }

            try {
                const response = await fetch(`${API_BASE}/subscribe-newsletter`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const message = await response.text();
                showNewsletterFeedback(
                    response.ok ? '✅ Iscrizione completata! Controlla la tua email.' : message,
                    response.ok
                );
                if (response.ok && emailInput) emailInput.value = '';
            } catch (error) {
                console.error('Errore durante la richiesta:', error);
                showNewsletterFeedback('Errore di rete. Riprova più tardi.', false);
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = 'Iscrivimi <i class="fas fa-arrow-right"></i>'; }
            }
        });
    }

    // Gestione invio form contatti
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        let contactFeedback = document.getElementById('contact-feedback');
        if (!contactFeedback) {
            contactFeedback = document.createElement('p');
            contactFeedback.id = 'contact-feedback';
            contactFeedback.style.cssText = 'margin-top:14px;font-size:0.95rem;font-weight:600;display:none;';
            contactForm.appendChild(contactFeedback);
        }

        function showContactFeedback(msg, ok) {
            contactFeedback.textContent = msg;
            contactFeedback.style.display = 'block';
            contactFeedback.style.color = ok ? '#1a7a3c' : '#c0392b';
        }

        contactForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const name = document.getElementById('contact-name')?.value.trim();
            const email = document.getElementById('contact-email')?.value.trim();
            const message = document.getElementById('contact-message')?.value.trim();

            if (!name || !email || !message) {
                showContactFeedback('Compila tutti i campi prima di inviare.', false);
                return;
            }

            const btn = contactForm.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.textContent = 'Invio in corso...'; }

            try {
                const response = await fetch(`${API_BASE}/contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, message })
                });
                const result = await response.text();
                if (response.ok) {
                    showContactFeedback('✅ Messaggio inviato! Ti risponderemo al più presto.', true);
                    contactForm.reset();
                } else {
                    showContactFeedback(result || "Errore durante l'invio. Riprova.", false);
                }
            } catch (error) {
                console.error('Errore di rete:', error);
                showContactFeedback('Errore di rete. Riprova più tardi.', false);
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = 'Invia Ora <i class="fas fa-paper-plane"></i>'; }
            }
        });
    }
});