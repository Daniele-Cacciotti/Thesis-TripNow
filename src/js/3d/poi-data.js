/**
 * poi-data.js — POI per tutte le destinazioni TripNow.
 * File separato da POIMarker.js per evitare dipendenze Three.js nel City Explorer.
 *
 * Ogni POI ha:
 * name     — nome visualizzato
 * icon     — emoji identificativa
 * category — 'history' | 'art' | 'food' | 'nature' | 'religious'
 * lat, lon — coordinate reali per Google Maps
 * x, z     — coordinate 3D normalizzate per Three.js (range [-5, 5])
 */

export const POI_DATA = {
    'Roma': [
        { name: 'Colosseo',         icon: '🏟️', category: 'history',   lat: 41.8902, lon: 12.4922, x:  1.5, z: -1.0 },
        { name: 'Fori Imperiali',   icon: '🏛️', category: 'history',   lat: 41.8925, lon: 12.4853, x:  1.0, z: -0.5 },
        { name: 'Vaticano',         icon: '⛪',  category: 'religious', lat: 41.9022, lon: 12.4539, x: -2.0, z:  1.5 },
        { name: 'Castel Sant\'Angelo',icon: '🏰', category: 'history',   lat: 41.9031, lon: 12.4663, x: -1.5, z:  1.0 },
        { name: 'Fontana di Trevi', icon: '⛲',  category: 'art',       lat: 41.9009, lon: 12.4833, x:  0.5, z:  0.5 },
        { name: 'Pantheon',         icon: '🏛️', category: 'history',   lat: 41.8986, lon: 12.4769, x: -0.5, z: -0.5 },
        { name: 'Piazza Navona',    icon: '🎭', category: 'art',       lat: 41.8992, lon: 12.4731, x: -1.0, z: -1.0 },
        { name: 'Piazza di Spagna', icon: '🌺', category: 'art',       lat: 41.9059, lon: 12.4827, x:  0.8, z:  1.2 },
        { name: 'Trastevere',       icon: '🍷', category: 'food',      lat: 41.8891, lon: 12.4703, x: -2.0, z:  0.0 },
        { name: 'Campo de\' Fiori', icon: '🍝', category: 'food',      lat: 41.8956, lon: 12.4722, x: -1.2, z: -0.2 },
        { name: 'Villa Borghese',   icon: '🌿', category: 'nature',    lat: 41.9143, lon: 12.4922, x:  0.0, z:  2.0 },
        { name: 'Giardino degli Aranci',icon:'🌅', category: 'nature', lat: 41.8851, lon: 12.4799, x:  0.2, z: -2.0 }
    ],
    'Parigi': [
        { name: 'Torre Eiffel',     icon: '🗼', category: 'art',       lat: 48.8584, lon:  2.2945, x:  0.0, z: -1.0 },
        { name: 'Louvre',           icon: '🏛️', category: 'art',       lat: 48.8606, lon:  2.3376, x:  1.8, z:  0.5 },
        { name: 'Notre Dame',       icon: '⛪',  category: 'religious', lat: 48.8530, lon:  2.3499, x:  2.2, z: -2.0 },
        { name: 'Sainte-Chapelle',  icon: '✨', category: 'religious', lat: 48.8554, lon:  2.3450, x:  2.0, z: -1.5 },
        { name: "Musée d'Orsay",    icon: '🖼️', category: 'art',       lat: 48.8600, lon:  2.3266, x:  0.5, z: -1.5 },
        { name: 'Centre Pompidou',  icon: '🎨', category: 'art',       lat: 48.8606, lon:  2.3522, x:  2.5, z:  1.0 },
        { name: 'Montmartre',       icon: '🎨', category: 'art',       lat: 48.8867, lon:  2.3431, x: -0.5, z:  2.0 },
        { name: 'Sacré-Cœur',       icon: '🕌', category: 'religious', lat: 48.8867, lon:  2.3431, x: -0.8, z:  2.5 },
        { name: 'Arc de Triomphe',  icon: '⛩️', category: 'history',   lat: 48.8738, lon:  2.2950, x: -1.5, z:  0.5 },
        { name: 'Jardin Luxembourg',icon: '🌿', category: 'nature',    lat: 48.8462, lon:  2.3372, x:  1.0, z: -2.5 },
        { name: 'Le Marais',        icon: '🥐', category: 'food',      lat: 48.8575, lon:  2.3578, x:  2.5, z:  0.0 },
    ],
    'Istanbul': [
        { name: 'Hagia Sofia',      icon: '🕌', category: 'religious', lat: 41.0086, lon: 28.9802, x:  0.5, z: -0.5 },
        { name: 'Moschea Blu',      icon: '🕍', category: 'religious', lat: 41.0054, lon: 28.9768, x:  0.2, z: -1.0 },
        { name: 'Topkapi',          icon: '🏰', category: 'history',   lat: 41.0115, lon: 28.9833, x:  1.5, z: -2.0 },
        { name: 'Palazzo Dolmabahçe',icon:'🏛️', category: 'history',   lat: 41.0396, lon: 28.9982, x:  2.5, z: -2.5 },
        { name: 'Gran Bazar',       icon: '🛍️', category: 'food',      lat: 41.0108, lon: 28.9680, x: -1.0, z:  1.0 },
        { name: 'Bazar delle Spezie',icon:'🌶️', category: 'food',      lat: 41.0165, lon: 28.9705, x: -0.5, z:  0.5 },
        { name: 'Cisterna Basilica',icon: '💧', category: 'history',   lat: 41.0084, lon: 28.9776, x:  0.0, z: -1.5 },
        { name: 'Torre Galata',     icon: '🗼', category: 'art',       lat: 41.0256, lon: 28.9741, x: -1.5, z:  2.0 },
        { name: 'Istiklal Street',  icon: '🚋', category: 'art',       lat: 41.0339, lon: 28.9778, x: -2.0, z:  2.5 },
        { name: 'Bosforo',          icon: '🌊', category: 'nature',    lat: 41.0614, lon: 29.0519, x:  2.0, z:  1.0 },
    ],
    'Il Cairo': [
        { name: 'Piramidi di Giza', icon: '🔺', category: 'history',  lat: 29.9792, lon: 31.1342, x: -1.5, z: -2.0 },
        { name: 'Sfinge',           icon: '🦁', category: 'history',  lat: 29.9753, lon: 31.1376, x: -0.5, z: -2.5 },
        { name: 'Museo Egizio',     icon: '🏛️', category: 'art',      lat: 30.0478, lon: 31.2336, x:  1.0, z:  1.5 },
        { name: 'Khan el-Khalili',  icon: '🛒', category: 'food',     lat: 30.0478, lon: 31.2622, x:  2.0, z:  2.0 },
        { name: 'Cittadella',       icon: '🏰', category: 'history',  lat: 30.0291, lon: 31.2594, x:  1.5, z: -1.0 },
        { name: 'Moschea di Al-Azhar',icon:'🕌', category: 'religious',lat: 30.0457, lon: 31.2626, x:  2.2, z:  1.5 },
        { name: 'Cairo Tower',      icon: '🗼', category: 'art',      lat: 30.0459, lon: 31.2243, x:  0.5, z:  1.0 },
        { name: 'Crociera sul Nilo',icon: '🌊', category: 'nature',   lat: 30.0618, lon: 31.2465, x: -0.5, z:  1.0 },
    ],
    'New York': [
        { name: 'Statua della Libertà', icon: '🗽', category: 'history', lat: 40.6892, lon: -74.0445, x: -3.0, z:  2.0 },
        { name: 'Ellis Island',         icon: '🚢', category: 'history', lat: 40.6992, lon: -74.0393, x: -2.5, z:  2.5 },
        { name: 'Central Park',         icon: '🌲', category: 'nature',  lat: 40.7829, lon: -73.9654, x:  0.5, z: -1.5 },
        { name: 'Empire State',         icon: '🏙️', category: 'art',     lat: 40.7484, lon: -73.9857, x:  1.0, z:  0.5 },
        { name: 'Top of the Rock',      icon: '🔭', category: 'art',     lat: 40.7592, lon: -73.9793, x:  1.2, z:  0.8 },
        { name: 'Times Square',         icon: '🎭', category: 'art',     lat: 40.7580, lon: -73.9855, x:  0.5, z:  1.0 },
        { name: 'Broadway',             icon: '🎬', category: 'art',     lat: 40.7590, lon: -73.9845, x:  0.6, z:  1.1 },
        { name: 'Brooklyn Bridge',      icon: '🌉', category: 'history', lat: 40.7061, lon: -73.9969, x: -1.0, z:  2.5 },
        { name: 'High Line',            icon: '🌿', category: 'nature',  lat: 40.7480, lon: -74.0048, x: -1.5, z:  0.0 },
        { name: 'Chelsea Market',       icon: '🍔', category: 'food',    lat: 40.7425, lon: -74.0059, x: -2.0, z:  0.5 },
    ],
    'San Francisco': [
        { name: 'Golden Gate',          icon: '🌉', category: 'art',     lat: 37.8199, lon: -122.4783, x: -2.0, z: -2.0 },
        { name: "Fisherman's Wharf",    icon: '🦞', category: 'food',    lat: 37.8080, lon: -122.4177, x:  0.0, z:  2.0 },
        { name: 'Pier 39',              icon: '🦭', category: 'nature',  lat: 37.8086, lon: -122.4098, x:  0.5, z:  2.2 },
        { name: 'Alcatraz',             icon: '🏝️', category: 'history', lat: 37.8267, lon: -122.4230, x: -2.5, z:  1.0 },
        { name: 'Lombard Street',       icon: '🌺', category: 'art',     lat: 37.8021, lon: -122.4186, x:  0.5, z:  1.5 },
        { name: 'Chinatown',            icon: '🥟', category: 'food',    lat: 37.7941, lon: -122.4078, x:  1.5, z:  0.5 },
        { name: 'Union Square',         icon: '🛍️', category: 'art',     lat: 37.7879, lon: -122.4074, x:  1.0, z:  0.8 },
        { name: 'Golden Gate Park',     icon: '🌿', category: 'nature',  lat: 37.7694, lon: -122.4862, x: -1.0, z: -1.5 },
        { name: 'Painted Ladies',       icon: '🏘️', category: 'art',     lat: 37.7762, lon: -122.4327, x: -0.5, z:  0.0 },
    ],
    'Rio de Janeiro': [
        { name: 'Cristo Redentore', icon: '✝️',  category: 'religious', lat: -22.9519, lon: -43.2105, x:  0.0, z: -3.0 },
        { name: 'Copacabana',       icon: '🏖️', category: 'nature',    lat: -22.9711, lon: -43.1823, x:  2.5, z:  2.5 },
        { name: 'Pão de Açúcar',    icon: '⛰️', category: 'nature',    lat: -22.9489, lon: -43.1546, x: -1.5, z:  1.5 },
        { name: 'Ipanema',          icon: '🌊', category: 'nature',    lat: -22.9835, lon: -43.2019, x:  1.5, z:  3.0 },
        { name: 'Jardim Botânico',  icon: '🌴', category: 'nature',    lat: -22.9669, lon: -43.2218, x:  1.0, z:  1.0 },
        { name: 'Lapa',             icon: '🎶', category: 'food',      lat: -22.9110, lon: -43.1801, x: -0.5, z: -1.0 },
        { name: 'Scalinata Selarón',icon: '🎨', category: 'art',       lat: -22.9155, lon: -43.1793, x: -0.2, z: -0.8 },
        { name: 'Maracanã',         icon: '⚽', category: 'art',       lat: -22.9121, lon: -43.2302, x: -2.0, z: -1.5 },
    ],
    'Petra': [
        { name: 'Al-Khazneh (Tesoro)', icon: '🏛️', category: 'history', lat: 30.3285, lon: 35.4444, x:  0.0, z: -1.5 },
        { name: 'Monastero Ad-Deir',   icon: '⛰️', category: 'history', lat: 30.3446, lon: 35.4374, x: -2.0, z: -3.0 },
        { name: 'Teatro Romano',       icon: '🎭', category: 'art',     lat: 30.3261, lon: 35.4461, x:  2.0, z: -1.0 },
        { name: 'Tombe Reali',         icon: '👑', category: 'history', lat: 30.3280, lon: 35.4470, x:  1.5, z: -1.2 },
        { name: 'High Place',          icon: '🌅', category: 'nature',  lat: 30.3335, lon: 35.4494, x:  1.0, z: -2.5 },
        { name: 'Qasr al-Bint',        icon: '🏯', category: 'history', lat: 30.3212, lon: 35.4454, x: -0.5, z:  0.0 },
        { name: 'Siq Canyon',          icon: '🏜️', category: 'nature',  lat: 30.3245, lon: 35.4481, x:  0.5, z:  1.0 },
    ],
    'Cuzco': [
        { name: 'Sacsayhuamán',   icon: '🗿', category: 'history',   lat: -13.5083, lon: -71.9817, x:  0.5, z: -2.0 },
        { name: 'Qorikancha',     icon: '🏯', category: 'religious', lat: -13.5197, lon: -71.9756, x:  0.0, z:  1.0 },
        { name: 'Plaza de Armas', icon: '⛪', category: 'art',       lat: -13.5170, lon: -71.9786, x: -1.5, z:  0.5 },
        { name: 'Cattedrale',     icon: '🔔', category: 'religious', lat: -13.5162, lon: -71.9780, x: -1.2, z:  0.2 },
        { name: 'San Blas',       icon: '🎨', category: 'art',       lat: -13.5155, lon: -71.9754, x:  1.0, z:  0.0 },
        { name: 'Mercato San Pedro',icon:'🥘',category: 'food',      lat: -13.5233, lon: -71.9811, x: -1.0, z:  1.5 },
        { name: 'Cristo Blanco',  icon: '🌄', category: 'nature',    lat: -13.5133, lon: -71.9728, x:  1.5, z: -1.0 },
    ],
};

// Coordinate centro-città per inizializzare la mappa
export const CITY_COORDS = {
    'Roma':           { lat:  41.9028, lon:  12.4964, zoom: 14 },
    'Parigi':         { lat:  48.8566, lon:   2.3522, zoom: 14 },
    'Istanbul':       { lat:  41.0082, lon:  28.9784, zoom: 13 },
    'Il Cairo':       { lat:  30.0444, lon:  31.2357, zoom: 12 },
    'New York':       { lat:  40.7128, lon: -74.0060, zoom: 13 },
    'San Francisco':  { lat:  37.7749, lon:-122.4194, zoom: 13 },
    'Rio de Janeiro': { lat: -22.9068, lon: -43.1729, zoom: 13 },
    'Petra':          { lat:  30.3285, lon:  35.4444, zoom: 14 },
    'Cuzco':          { lat: -13.5320, lon: -71.9675, zoom: 14 },
};

// Etichette leggibili per le categorie
export const CATEGORY_LABELS = {
    history:   { label: 'Storia',   emoji: '🏛️' },
    art:       { label: 'Arte',     emoji: '🎨' },
    food:      { label: 'Food',     emoji: '🍽️' },
    nature:    { label: 'Natura',   emoji: '🌿' },
    religious: { label: 'Luoghi',   emoji: '🙏' },
};