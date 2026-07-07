document.addEventListener('DOMContentLoaded', () => {
    const units = 'metric';
    const lat = 41.9028;
    const lon = 12.4964;
    const weatherApiUrl = `${API_BASE}/api/weather?lat=${lat}&lon=${lon}`;
    const forecastContainer = document.getElementById('weather-forecast');
    const loadingIndicator = document.querySelector('.weather-loading');
    const attributionText = document.getElementById('weather-attribution');

    function getDayName(date) {
        const options = { weekday: 'short' };
        return new Intl.DateTimeFormat(navigator.language || 'it-IT', options).format(date);
    }

    function formatTemp(temp) {
        return `${Math.round(temp)}°${units === 'metric' ? 'C' : 'F'}`;
    }

    async function fetchWeather() {
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        if (forecastContainer) forecastContainer.innerHTML = '';
        if (attributionText) attributionText.textContent = 'Recupero dati meteo...';

        try {
            const response = await fetch(weatherApiUrl);
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Errore API:', errorData);
                throw new Error(`Errore HTTP ${response.status}: ${errorData.message || 'Chiave API non valida o problema server.'}`);
            }
            const data = await response.json();

            if (loadingIndicator) loadingIndicator.style.display = 'none';

            if (data.list && data.list.length > 0) {
                const dailyForecasts = {};
                data.list.forEach(item => {
                    const date = new Date(item.dt * 1000);
                    const dateString = date.toISOString().split('T')[0];
                    if (!dailyForecasts[dateString]) {
                        dailyForecasts[dateString] = {
                            date: date, temps: [], icons: {}, descriptions: {}
                        };
                    }
                    dailyForecasts[dateString].temps.push(item.main.temp);
                    const icon = item.weather[0].icon;
                    const description = item.weather[0].description;
                    const hour = date.getHours();
                    const weight = (hour >= 12 && hour < 18) ? 2 : 1;
                    dailyForecasts[dateString].icons[icon] = (dailyForecasts[dateString].icons[icon] || 0) + weight;
                    dailyForecasts[dateString].descriptions[description] = (dailyForecasts[dateString].descriptions[description] || 0) + weight;
                });

                // Elabora e mostra i dati giornalieri
                const forecastDays = Object.values(dailyForecasts).slice(0, 5);
                forecastDays.forEach(dayData => {
                    const minTemp = Math.min(...dayData.temps);
                    const maxTemp = Math.max(...dayData.temps);
                    const mostFrequentIcon = Object.keys(dayData.icons).reduce((a, b) => dayData.icons[a] > dayData.icons[b] ? a : b);
                    const mostFrequentDescription = Object.keys(dayData.descriptions).reduce((a, b) => dayData.descriptions[a] > dayData.descriptions[b] ? a : b);

                    const dayElement = document.createElement('div');
                    dayElement.classList.add('weather-day');

                    const dayName = document.createElement('span');
                    dayName.classList.add('day-name');
                    const today = new Date();
                    if (today.toDateString() === dayData.date.toDateString()) { 
                        dayName.textContent = 'Oggi'; 
                    }
                    else {
                       const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
                       if (tomorrow.toDateString() === dayData.date.toDateString()) { dayName.textContent = 'Domani'; }
                       else { dayName.textContent = getDayName(dayData.date); }
                    }

                    const iconUrl = `https://openweathermap.org/img/wn/${mostFrequentIcon}@2x.png`;
                    const weatherIcon = document.createElement('img');
                    weatherIcon.classList.add('weather-icon');
                    weatherIcon.src = iconUrl;
                    weatherIcon.alt = mostFrequentDescription;

                    const tempMax = document.createElement('span');
                    tempMax.classList.add('temp-max');
                    tempMax.textContent = formatTemp(maxTemp);

                    const tempMin = document.createElement('span');
                    tempMin.classList.add('temp-min');
                    tempMin.textContent = formatTemp(minTemp);

                    dayElement.appendChild(dayName);
                    dayElement.appendChild(weatherIcon);
                    dayElement.appendChild(tempMax);
                    dayElement.appendChild(tempMin);
                    if (forecastContainer) forecastContainer.appendChild(dayElement);
                });

                if (attributionText) attributionText.textContent = 'Dati forniti da OpenWeatherMap';

            } else {
                throw new Error("Nessun dato previsionale ('list') trovato nella risposta.");
            }

        } catch (error) {
            console.error('Errore nel recupero dati meteo:', error);
            if (loadingIndicator) {
                loadingIndicator.style.display = 'flex';
                loadingIndicator.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${error.message || 'Errore caricamento meteo'}`;
            }
            if (attributionText) attributionText.textContent = 'Errore';
        }
    }
    fetchWeather();
});