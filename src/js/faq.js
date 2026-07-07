// Funzionalità click sulle domande frequenti
document.addEventListener('DOMContentLoaded', function () {
    window.addEventListener('load', () => {
        document.querySelectorAll(".faq-question").forEach(button => {
            button.addEventListener("click", () => {
                button.closest(".faq-item").classList.toggle("open");
            });
        });
    });
});