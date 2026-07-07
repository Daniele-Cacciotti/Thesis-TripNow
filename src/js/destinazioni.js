document.addEventListener('DOMContentLoaded', () => {
    const filterTabs = document.querySelectorAll('.filter-tab');
    const destinationCards = document.querySelectorAll('.destination-card');
    const grid = document.querySelector('.destinations-grid');

    const filterDestinations = (selectedContinent) => {
        let visibleCardCount = 0;

        destinationCards.forEach((card, index) => {
            const cardContinent = card.dataset.continent;
            const shouldShow = (selectedContinent === 'all' || cardContinent === selectedContinent);

            card.classList.remove('visible', 'hidden');
            card.style.animationDelay = '0s'; 

            if (shouldShow) {
                card.style.display = 'flex';
                card.style.animationDelay = `${visibleCardCount * 0.08}s`;
                card.classList.add('visible');
                card.style.animationName = 'cardFadeIn';
                visibleCardCount++;
            } else {
                card.style.animationName = 'cardFadeOut';
                card.addEventListener('animationend', function handleAnimationEnd() {
                    if (card.style.animationName === 'cardFadeOut') {
                        card.style.display = 'none';
                    }
                    card.removeEventListener('animationend', handleAnimationEnd);
                });
            }
        });
    };

    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const selectedContinent = tab.dataset.continent;
            filterDestinations(selectedContinent);
        });
    });

    destinationCards.forEach((card, index) => {
        card.style.setProperty('--card-delay', `${index * 0.08}s`);
    });

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                entry.target.style.animationName = 'cardFadeIn';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    destinationCards.forEach(card => {
        observer.observe(card);
    });
});