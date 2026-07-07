document.addEventListener('DOMContentLoaded', function () {

    const downloadButtons = document.querySelectorAll('.download-btn');

    downloadButtons.forEach(button => {
        button.addEventListener('click', () => {
            const fileName = button.getAttribute('data-file');
            if (fileName) {
                window.location.href = `${API_BASE}/download?file=${encodeURIComponent(fileName)}`;
            } else {
                alert('File non disponibile per il download.');
            }
        });
    });

});