// ── Climate Chart (Open-Meteo Historical Data) ────────────────────────────────
// Legge data-lat e data-lon dalla sezione #destination-climate,
// chiama /api/climate, e renderizza un grafico a barre con Chart.js.
// Evidenzia in verde i mesi ideali: temp 15-30°C e ≤ 8 giorni di pioggia.
(function () {
    const section = document.getElementById('destination-climate');
    if (!section) return;

    const lat = parseFloat(section.dataset.lat);
    const lon = parseFloat(section.dataset.lon);
    if (isNaN(lat) || isNaN(lon)) return;

    const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

    fetch(`${typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:3000'}/api/climate?lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(data => {
            if (!Array.isArray(data) || data.length !== 12) return;

            const temps   = data.map(d => d.avgTemp);
            const rain    = data.map(d => d.rainDays);
            const ideal   = data.map(d => d.avgTemp >= 15 && d.avgTemp <= 30 && d.rainDays <= 8);

            // Aggiorna badge "mesi migliori"
            const bestMonths = MONTHS.filter((_, i) => ideal[i]);
            const badgeEl = document.getElementById('climate-best-months');
            if (badgeEl) badgeEl.textContent = bestMonths.length ? bestMonths.join(', ') : 'Varia';

            const canvas = document.getElementById('climate-chart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: MONTHS,
                    datasets: [
                        {
                            label: 'Temp media (°C)',
                            data: temps,
                            backgroundColor: temps.map((t, i) =>
                                ideal[i] ? 'rgba(52, 211, 153, 0.75)' : 'rgba(255, 111, 97, 0.55)'
                            ),
                            borderColor: temps.map((t, i) =>
                                ideal[i] ? '#34d399' : '#FF6F61'
                            ),
                            borderWidth: 1.5,
                            borderRadius: 5,
                            yAxisID: 'yTemp',
                        },
                        {
                            label: 'Giorni pioggia',
                            data: rain,
                            type: 'line',
                            borderColor: '#38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.08)',
                            borderWidth: 2,
                            pointBackgroundColor: '#38bdf8',
                            pointRadius: 4,
                            tension: 0.4,
                            fill: true,
                            yAxisID: 'yRain',
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            labels: { color: 'rgba(220,221,232,0.75)', font: { size: 12 } }
                        },
                        tooltip: {
                            callbacks: {
                                afterBody: (items) => {
                                    const idx = items[0]?.dataIndex;
                                    return ideal[idx] ? ['✅ Mese ideale per visitare'] : [];
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            ticks: { color: 'rgba(220,221,232,0.6)' },
                            grid: { color: 'rgba(255,255,255,0.04)' },
                        },
                        yTemp: {
                            type: 'linear',
                            position: 'left',
                            ticks: { color: 'rgba(220,221,232,0.6)', callback: v => v + '°C' },
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            title: { display: true, text: 'Temperatura (°C)', color: 'rgba(220,221,232,0.4)', font: { size: 11 } },
                        },
                        yRain: {
                            type: 'linear',
                            position: 'right',
                            min: 0,
                            max: 31,
                            ticks: { color: '#38bdf8', callback: v => v + 'gg' },
                            grid: { drawOnChartArea: false },
                            title: { display: true, text: 'Giorni pioggia', color: '#38bdf8', font: { size: 11 } },
                        },
                    },
                },
            });
        })
        .catch(err => console.warn('Climate data error:', err));
})();
