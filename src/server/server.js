require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');

// ── 2FA / TOTP (RFC 6238) ─────────────────────────────────────────────────────
// TOTP(K,T) = HOTP(K, floor(currentTime / 30))
// HOTP(K,C) = Truncate(HMAC-SHA1(K, C)) mod 10^6
const otp = require('otplib');
const QRCode = require('qrcode');

// ── Costanti ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 12;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── 2FA: Temporary Token Store ────────────────────────────────────────────────
// Map in memoria che associa un token temporaneo (UUID) all'email dell'utente.
// Il token è valido 5 minuti, poi viene eliminato automaticamente.
// Nota: in produzione usare Redis o DB per supportare più istanze server.
const tempTokens = new Map(); // Map<token, { email, expires: Date.now() + 5min }>
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of tempTokens.entries()) {
        if (data.expires < now) tempTokens.delete(token);
    }
}, 5 * 60 * 1000);

// ── Recommendation Engine: Tag Destinazioni ───────────────────────────────────
// Vettori di feature per ogni destinazione.
// Ogni feature è normalizzata: {0,1} per booleane, {1,2,3} per costo.
// Similarity: cos_sim(A,B) = (A·B) / (|A|·|B|)  — valore ∈ [0,1]
const DESTINATION_TAGS = {
    'Roma':           { arte:1, storia:1, cibo:1, natura:0, avventura:0, clima_caldo:1, costo:2 },
    'Parigi':         { arte:1, storia:1, cibo:1, natura:0, avventura:0, clima_caldo:0, costo:3 },
    'Istanbul':       { arte:1, storia:1, cibo:1, natura:0, avventura:1, clima_caldo:1, costo:1 },
    'Il Cairo':       { arte:1, storia:1, cibo:0, natura:0, avventura:1, clima_caldo:1, costo:1 },
    'New York':       { arte:1, storia:0, cibo:1, natura:0, avventura:1, clima_caldo:0, costo:3 },
    'San Francisco':  { arte:0, storia:0, cibo:1, natura:1, avventura:1, clima_caldo:0, costo:3 },
    'Rio de Janeiro': { arte:0, storia:0, cibo:1, natura:1, avventura:1, clima_caldo:1, costo:2 },
    'Petra':          { arte:1, storia:1, cibo:0, natura:1, avventura:1, clima_caldo:1, costo:1 },
    'Cuzco':          { arte:1, storia:1, cibo:0, natura:1, avventura:1, clima_caldo:0, costo:1 },
};
const DESTINATION_LINKS = {
    'Roma': 'Roma.html', 'Parigi': 'Parigi.html', 'Istanbul': 'Istanbul.html',
    'Il Cairo': 'Il_Cairo.html', 'New York': 'New_York.html',
    'San Francisco': 'San_Francisco.html', 'Rio de Janeiro': 'rio_de_janeiro.html',
    'Petra': 'Petra.html', 'Cuzco': 'Cuzco.html',
};

function cosineSimilarity(vecA, vecB) {
    const keys = Object.keys(vecA);
    const dot  = keys.reduce((s, k) => s + (vecA[k] || 0) * (vecB[k] || 0), 0);
    const magA = Math.sqrt(keys.reduce((s, k) => s + (vecA[k] || 0) ** 2, 0));
    const magB = Math.sqrt(keys.reduce((s, k) => s + (vecB[k] || 0) ** 2, 0));
    return (magA === 0 || magB === 0) ? 0 : dot / (magA * magB);
}

function buildUserProfile(favoriteNames) {
    const keys = Object.keys(DESTINATION_TAGS['Roma']);
    const profile = Object.fromEntries(keys.map(k => [k, 0]));
    let count = 0;
    for (const name of favoriteNames) {
        const tags = DESTINATION_TAGS[name];
        if (tags) {
            keys.forEach(k => { profile[k] += tags[k] || 0; });
            count++;
        }
    }
    if (count > 0) keys.forEach(k => { profile[k] /= count; });
    return profile;
}

// File scaricabili consentiti (whitelist esplicita contro path traversal)
const ALLOWED_DOWNLOADS = new Set([
    'guida_roma.pdf',
    'guida_parigi.pdf',
    'guida_istanbul.pdf',
    'guida_cairo.pdf',
    'guida_new_york.pdf',
    'guida_san_francisco.pdf',
    'guida_rio.pdf',
    'guida_petra.pdf',
    'guida_cuzco.pdf'
]);

// ── Helper ────────────────────────────────────────────────────────────────────
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof email === 'string' && emailRegex.test(email) && email.length <= 254;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'strict',
        secure: IS_PROD
    };
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();

// Security headers — CSP configurato per consentire CDN esterni necessari
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net",
                          "https://maps.googleapis.com", "blob:"],
            styleSrc:    ["'self'", "'unsafe-inline'",
                          "https://fonts.googleapis.com",
                          "https://cdnjs.cloudflare.com",
                          "https://cdn.jsdelivr.net",
                          "https://maps.googleapis.com"],
            fontSrc:     ["'self'", "data:",
                          "https://fonts.gstatic.com",
                          "https://cdnjs.cloudflare.com"],
            imgSrc:      ["'self'", "data:", "https://openweathermap.org", "blob:",
                          "https://maps.googleapis.com", "https://maps.gstatic.com"],
            connectSrc:  ["'self'",
                          "https://archive-api.open-meteo.com",
                          "https://api.openweathermap.org",
                          "https://maps.googleapis.com", "https://maps.gstatic.com"],
            mediaSrc:    ["'self'"],
            frameSrc:    ["'none'"],
            workerSrc:   ["'self'", "blob:"],
        }
    }
}));

// CORS — accetta Live Preview (3000), Live Server (5500) e localhost generico
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .concat([
        'http://localhost:3000', 'http://127.0.0.1:3000',
        'http://localhost:5500', 'http://127.0.0.1:5500',
        'http://localhost:3001', 'http://127.0.0.1:3001',
        'http://localhost:8080', 'http://127.0.0.1:8080'
    ]);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS non consentito per: ' + origin));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, '..'), {
    maxAge: '1d',
    etag: true,
    index: false
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Troppi tentativi. Riprova tra 15 minuti.'
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Limite invio messaggi raggiunto. Riprova tra un\'ora.'
});

// ── Database ──────────────────────────────────────────────────────────────────
const db = new sqlite3.Database('./mydatabase.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        totp_secret TEXT,
        totp_enabled INTEGER DEFAULT 0,
        backup_codes TEXT
    )`);
    // Migrazione colonne 2FA per database esistenti (le istruzioni sono idempotenti)
    db.run(`ALTER TABLE users ADD COLUMN totp_secret TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN backup_codes TEXT`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        destination_name TEXT NOT NULL,
        destination_link TEXT NOT NULL,
        UNIQUE(user_email, destination_name, destination_link)
    )`);

    // ── Behavioral events per recommendation engine ibrido ────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS behavioral_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT,
        session_id TEXT NOT NULL,
        destination TEXT NOT NULL,
        time_on_page INTEGER,
        sections_viewed TEXT,
        pois_clicked TEXT,
        phase_reached INTEGER DEFAULT 0,
        booking_sim_interacted INTEGER DEFAULT 0,
        heatmap_metric TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_behavioral_destination ON behavioral_events(destination)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_behavioral_session ON behavioral_events(session_id)`);

    // ── Cache predittiva (evita Open-Meteo ad ogni request) ──────────────────
    db.run(`CREATE TABLE IF NOT EXISTS predictive_cache (
        destination TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER
    )`);

    // ── Iscritti newsletter ───────────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        subscribed_at INTEGER DEFAULT (strftime('%s','now')),
        unsubscribe_token TEXT UNIQUE NOT NULL,
        active INTEGER DEFAULT 1
    )`);
});

// ── Email transporter ─────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// ── Proxy Meteo (API key tenuta solo lato server) ─────────────────────────────
app.get('/api/weather', async (req, res) => {
    const latNum = parseFloat(req.query.lat);
    const lonNum = parseFloat(req.query.lon);

    if (isNaN(latNum) || isNaN(lonNum) ||
        latNum < -90 || latNum > 90 ||
        lonNum < -180 || lonNum > 180) {
        return res.status(400).json({ error: 'Coordinate non valide' });
    }

    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey || apiKey.startsWith('inserisci_')) {
        return res.status(503).json({ error: 'API key meteo non configurata. Aggiungere WEATHER_API_KEY nel file .env' });
    }

    try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latNum}&lon=${lonNum}&appid=${apiKey}&lang=it&units=metric`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Errore weather proxy:', err);
        res.status(500).json({ error: 'Errore recupero dati meteo' });
    }
});

// ── Registrazione ─────────────────────────────────────────────────────────────
app.post('/register', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!isValidEmail(email)) return res.status(400).send('Email non valida');
    if (!password || password.length < 8) return res.status(400).send('La password deve essere di almeno 8 caratteri');
    if (password.length > 128) return res.status(400).send('Password troppo lunga');

    try {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hash], (err) => {
            if (err) return res.status(400).send('Errore: utente già registrato');
            res.send('Registrazione completata');
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Errore server');
    }
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!isValidEmail(email) || !password) return res.status(400).send('Dati non validi');

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).send('Errore server');
        if (!user) return res.status(401).send('Email o password sbagliata');

        try {
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.status(401).send('Email o password sbagliata');

            // Se 2FA è attivo, emetti un token temporaneo invece del cookie di sessione.
            // Il client dovrà completare la verifica TOTP con POST /totp/verify-login.
            if (user.totp_enabled === 1) {
                const tempToken = crypto.randomUUID();
                tempTokens.set(tempToken, { email: user.email, expires: Date.now() + 5 * 60 * 1000 });
                return res.status(202).json({ require2FA: true, tempToken });
            }

            res.cookie('user_email', user.email, cookieOptions());
            res.send('Login riuscito');
        } catch (err) {
            console.error(err);
            res.status(500).send('Errore server');
        }
    });
});

// ── Profilo protetto ──────────────────────────────────────────────────────────
app.get('/profile', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const email = req.cookies.user_email;
    if (!email) return res.status(401).send('Non autenticato');
    res.send(`Benvenuto ${email}`);
});

// ── Logout ────────────────────────────────────────────────────────────────────
app.post('/logout', (req, res) => {
    res.clearCookie('user_email', cookieOptions());
    res.send('Logout riuscito');
});

// ── 2FA Setup: genera secret e QR code ───────────────────────────────────────
// L'utente richiede l'attivazione 2FA. Il server genera un secret base32,
// lo salva nel DB (non ancora enabled), e restituisce il QR code data URL.
// Il client dovrà scansionare il QR con Google Authenticator o Authy.
app.post('/totp/setup', async (req, res) => {
    const email = req.cookies.user_email;
    if (!email) return res.status(401).send('Non autenticato');

    const secret = otp.generateSecret();
    const otpauthUrl = otp.generateURI({ type: 'totp', label: `TripNow:${email}`, issuer: 'TripNow', secret });

    try {
        const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
            color: { dark: '#dcdde8', light: '#0a0a0f' },
            width: 220,
        });
        // Salva il secret (totp_enabled rimane 0 finché non verificato)
        db.run('UPDATE users SET totp_secret = ? WHERE email = ?', [secret, email], (err) => {
            if (err) return res.status(500).send('Errore server');
            res.json({ qrDataUrl, secret });
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Errore generazione QR');
    }
});

// ── 2FA Enable: verifica il primo codice OTP e attiva 2FA ────────────────────
app.post('/totp/enable', (req, res) => {
    const email = req.cookies.user_email;
    const { totpCode } = req.body;
    if (!email || !totpCode) return res.status(400).send('Dati mancanti');

    db.get('SELECT totp_secret FROM users WHERE email = ?', [email], (err, user) => {
        if (err || !user) return res.status(500).send('Errore server');
        if (!user.totp_secret) return res.status(400).send('Prima esegui il setup 2FA');

        const { valid: isValid } = otp.verifySync({ type: 'totp', token: String(totpCode), secret: user.totp_secret });
        if (!isValid) return res.status(401).send('Codice OTP non valido');

        // Genera 8 backup codes esadecimali monouso
        const backupCodes = Array.from({ length: 8 }, () =>
            crypto.randomBytes(4).toString('hex').toUpperCase()
        );
        db.run(
            'UPDATE users SET totp_enabled = 1, backup_codes = ? WHERE email = ?',
            [JSON.stringify(backupCodes), email],
            (err2) => {
                if (err2) return res.status(500).send('Errore server');
                res.json({ backupCodes });
            }
        );
    });
});

// ── 2FA Verify Login: completa il login a due fattori ────────────────────────
// Riceve il tempToken emesso dal /login e il codice TOTP inserito dall'utente.
// Controlla la validità del token (TTL 5 min), poi verifica il codice TOTP.
// Se tutto ok, emette il cookie di sessione definitivo.
app.post('/totp/verify-login', (req, res) => {
    const { tempToken, totpCode, backupCode } = req.body;
    if (!tempToken) return res.status(400).send('Token mancante');

    const tokenData = tempTokens.get(tempToken);
    if (!tokenData || tokenData.expires < Date.now()) {
        tempTokens.delete(tempToken);
        return res.status(401).send('Token scaduto. Effettua nuovamente il login.');
    }

    db.get('SELECT * FROM users WHERE email = ?', [tokenData.email], (err, user) => {
        if (err || !user) return res.status(500).send('Errore server');

        // Verifica TOTP o backup code
        if (totpCode) {
            const { valid: isValid } = otp.verifySync({ type: 'totp', token: String(totpCode), secret: user.totp_secret });
            if (!isValid) return res.status(401).send('Codice OTP non valido');
        } else if (backupCode) {
            const codes = JSON.parse(user.backup_codes || '[]');
            const idx = codes.indexOf(backupCode.toUpperCase());
            if (idx === -1) return res.status(401).send('Backup code non valido');
            // Rimuove il backup code usato (monouso)
            codes.splice(idx, 1);
            db.run('UPDATE users SET backup_codes = ? WHERE email = ?',
                [JSON.stringify(codes), user.email], () => {});
        } else {
            return res.status(400).send('Inserisci il codice OTP o un backup code');
        }

        // Emetti il cookie di sessione e invalida il temp token
        tempTokens.delete(tempToken);
        res.cookie('user_email', user.email, cookieOptions());
        res.send('Login riuscito');
    });
});

// ── 2FA Disable: disattiva 2FA richiedendo password + codice OTP ─────────────
app.post('/totp/disable', async (req, res) => {
    const email = req.cookies.user_email;
    const { password, totpCode } = req.body;
    if (!email || !password || !totpCode) return res.status(400).send('Dati mancanti');

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) return res.status(500).send('Errore server');

        const pwMatch = await bcrypt.compare(password, user.password);
        if (!pwMatch) return res.status(401).send('Password non corretta');

        const { valid: isValid } = otp.verifySync({ type: 'totp', token: String(totpCode), secret: user.totp_secret });
        if (!isValid) return res.status(401).send('Codice OTP non valido');

        db.run(
            'UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL WHERE email = ?',
            [email],
            (err2) => {
                if (err2) return res.status(500).send('Errore server');
                res.send('2FA disattivato');
            }
        );
    });
});

// ── 2FA Status: ritorna se 2FA è attivo per l'utente corrente ────────────────
app.get('/totp/status', (req, res) => {
    const email = req.cookies.user_email;
    if (!email) return res.status(401).send('Non autenticato');

    db.get('SELECT totp_enabled FROM users WHERE email = ?', [email], (err, user) => {
        if (err || !user) return res.status(500).send('Errore server');
        res.json({ enabled: user.totp_enabled === 1 });
    });
});

// ── Recommendation Engine (Content-Based Filtering) ──────────────────────────
// Motore di raccomandazione ibrido: 0.6×content-based + 0.4×behavioral implicit feedback.
// Content score: similarità coseno tra profilo utente (media preferiti) e vettore destinazione.
// Behavioral score: somma pesata di eventi impliciti (dwell=1, poi_click=2, booking_click=3)
// normalizzata su [0,1] rispetto al massimo osservato nella sessione corrente.
app.get('/api/recommendations', (req, res) => {
    const email = req.cookies.user_email;
    if (!email) return res.status(401).json([]);

    db.all('SELECT destination_name FROM favorites WHERE user_email = ?', [email], (err, rows) => {
        if (err) return res.status(500).json([]);

        const favoriteNames = rows.map(r => r.destination_name);
        if (favoriteNames.length === 0) return res.json([]);

        const userProfile = buildUserProfile(favoriteNames);
        const allDests = Object.keys(DESTINATION_TAGS);
        const candidates = allDests.filter(name => !favoriteNames.includes(name));

        // Fetch behavioral events — usa colonne reali della tabella
        // created_at è in secondi Unix; cutoff in secondi
        const cutoff = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        db.all(
            `SELECT destination,
                    COUNT(*) as visits,
                    AVG(COALESCE(time_on_page, 0)) as avg_time,
                    MAX(COALESCE(phase_reached, 0)) as max_phase,
                    SUM(CASE WHEN booking_sim_interacted = 1 THEN 1 ELSE 0 END) as bookings
             FROM behavioral_events
             WHERE user_email = ? AND created_at > ?
             GROUP BY destination`,
            [email, cutoff],
            (err2, events) => {
                const rawBehavioral = {};
                if (!err2 && events) {
                    for (const { destination, visits, avg_time, max_phase, bookings } of events) {
                        // Score composito: tempo (0-1) + fasi raggiunte (0-2) + booking (0-3)
                        const timeScore    = Math.min(1, (avg_time || 0) / 300000);
                        const phaseScore   = ((max_phase || 0) / 6) * 2;
                        const bookingScore = (bookings > 0) ? 3 : 0;
                        rawBehavioral[destination] = (rawBehavioral[destination] || 0)
                            + timeScore + phaseScore + bookingScore;
                    }
                }

                const maxB = Math.max(1, ...Object.values(rawBehavioral));

                const scored = candidates
                    .map(name => {
                        const contentScore    = cosineSimilarity(userProfile, DESTINATION_TAGS[name]);
                        const behavioralScore = (rawBehavioral[name] || 0) / maxB;
                        const hybridScore     = 0.6 * contentScore + 0.4 * behavioralScore;
                        return { name, link: DESTINATION_LINKS[name] || '#', score: hybridScore };
                    })
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3);

                res.json(scored);
            }
        );
    });
});

// ── Modifica email ────────────────────────────────────────────────────────────
app.post('/change-email', (req, res) => {
    const newEmail = req.body.newEmail;
    const currentEmail = req.cookies.user_email;

    if (!newEmail || !currentEmail) return res.status(400).send('Dati mancanti');
    if (!isValidEmail(newEmail)) return res.status(400).send('Email non valida');

    db.serialize(() => {
        db.run('UPDATE favorites SET user_email = ? WHERE user_email = ?', [newEmail, currentEmail], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send('Errore aggiornamento email');
            }
            db.run('UPDATE users SET email = ? WHERE email = ?', [newEmail, currentEmail], function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Errore aggiornamento email');
                }
                res.cookie('user_email', newEmail, cookieOptions());
                res.send('Email aggiornata con successo!');
            });
        });
    });
});

// ── Modifica password ─────────────────────────────────────────────────────────
app.post('/change-password', async (req, res) => {
    const newPassword = req.body.newPassword;
    const currentEmail = req.cookies.user_email;

    if (!newPassword || !currentEmail) return res.status(400).send('Dati mancanti');
    if (newPassword.length < 8) return res.status(400).send('La password deve essere di almeno 8 caratteri');
    if (newPassword.length > 128) return res.status(400).send('Password troppo lunga');

    try {
        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        db.run('UPDATE users SET password = ? WHERE email = ?', [hash, currentEmail], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send('Errore aggiornamento password');
            }
            res.send('Password aggiornata con successo!');
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Errore server');
    }
});

// ── Aggiunta ai preferiti ─────────────────────────────────────────────────────
app.post('/add-favorite', (req, res) => {
    const email = req.cookies.user_email;
    const { destinationName, destinationLink } = req.body;

    if (!email || !destinationName || !destinationLink) return res.status(400).send('Accesso non eseguito!');
    if (typeof destinationName !== 'string' || destinationName.length > 200) return res.status(400).send('Dati non validi');
    if (typeof destinationLink !== 'string' || destinationLink.length > 500) return res.status(400).send('Dati non validi');

    db.run(
        'INSERT OR IGNORE INTO favorites (user_email, destination_name, destination_link) VALUES (?, ?, ?)',
        [email, destinationName, destinationLink],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send('Errore salvataggio preferito');
            }
            res.send('Viaggio salvato tra i preferiti!');
        }
    );
});

// ── Recupero preferiti ────────────────────────────────────────────────────────
app.get('/favorites', (req, res) => {
    const email = req.cookies.user_email;
    if (!email) return res.status(401).send('Non autenticato');

    db.all(
        'SELECT destination_name, destination_link FROM favorites WHERE user_email = ?',
        [email],
        (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Errore recupero preferiti');
            }
            res.json(rows);
        }
    );
});

// ── Rimozione preferito ───────────────────────────────────────────────────────
app.post('/delete-favorite', (req, res) => {
    const email = req.cookies.user_email;
    const { destinationLink } = req.body;

    if (!email || !destinationLink) return res.status(400).send('Dati mancanti');

    db.run(
        'DELETE FROM favorites WHERE user_email = ? AND destination_link = ?',
        [email, destinationLink],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).send('Errore cancellazione preferito');
            }
            res.send('Preferito rimosso');
        }
    );
});

// ── Cancellazione account ─────────────────────────────────────────────────────
app.post('/delete-account', (req, res) => {
    const email = req.cookies.user_email;
    if (!email) return res.status(401).send('Non autenticato');

    db.serialize(() => {
        db.run('DELETE FROM favorites WHERE user_email = ?', [email], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Errore cancellazione preferiti');
            }
            db.run('DELETE FROM users WHERE email = ?', [email], (err2) => {
                if (err2) {
                    console.error(err2);
                    return res.status(500).send('Errore cancellazione account');
                }
                res.clearCookie('user_email', cookieOptions());
                res.send('Account cancellato!');
            });
        });
    });
});

// ── Ricerca hotel → redirect Booking.com ─────────────────────────────────────
app.post('/search-hotel', (req, res) => {
    const { destination, checkin, checkout, guests } = req.body;

    if (!destination || !checkin || !checkout || !guests) return res.status(400).send('Dati mancanti');
    if (typeof destination !== 'string' || destination.length > 200) return res.status(400).send('Destinazione non valida');

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(checkin) || !dateRegex.test(checkout)) return res.status(400).send('Date non valide');

    const guestsNum = parseInt(guests, 10);
    if (isNaN(guestsNum) || guestsNum < 1 || guestsNum > 30) return res.status(400).send('Numero ospiti non valido');

    const [checkinYear, checkinMonth, checkinDay] = checkin.split('-');
    const [checkoutYear, checkoutMonth, checkoutDay] = checkout.split('-');

    const bookingUrl = `https://www.booking.com/searchresults.html?` +
        `ss=${encodeURIComponent(destination)}` +
        `&checkin_year=${checkinYear}` +
        `&checkin_month=${parseInt(checkinMonth)}` +
        `&checkin_monthday=${parseInt(checkinDay)}` +
        `&checkout_year=${checkoutYear}` +
        `&checkout_month=${parseInt(checkoutMonth)}` +
        `&checkout_monthday=${parseInt(checkoutDay)}` +
        `&group_adults=${guestsNum}` +
        `&group_children=0`;

    res.json({ bookingUrl });
});

// ── Download con whitelist ────────────────────────────────────────────────────
app.get('/download', (req, res) => {
    const fileName = req.query.file;

    if (!fileName || !ALLOWED_DOWNLOADS.has(fileName)) {
        return res.status(403).send('File non autorizzato');
    }

    const filePath = path.join(__dirname, 'public', 'files', path.basename(fileName));
    res.download(filePath, fileName, (err) => {
        if (err) {
            console.error('Errore nel download:', err);
            if (!res.headersSent) res.status(404).send('File non trovato');
        }
    });
});

// ── Newsletter ────────────────────────────────────────────────────────────────
app.post('/subscribe-newsletter', contactLimiter, (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).send('Email mancante');
    if (!isValidEmail(email)) return res.status(400).send('Email non valida');

    const safeEmail = escapeHtml(email);
    const unsubToken = crypto.randomUUID();
    const BASE_URL = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

    db.run(
        `INSERT INTO newsletter_subscribers (email, unsubscribe_token)
         VALUES (?, ?)
         ON CONFLICT(email) DO UPDATE SET active=1, unsubscribe_token=excluded.unsubscribe_token`,
        [safeEmail, unsubToken]
    );

    transporter.sendMail({
        from: `"TripNow" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "✈️ Benvenuto in TripNow — Il tuo viaggio inizia adesso!",
        html: `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Benvenuto su TripNow</title>
</head>
<body style="margin:0;padding:0;background-color:#050508;font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050508;padding:40px 0;">
  <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#0a0a0f;border:1px solid rgba(255,255,255,0.05);border-radius:16px;">

    <tr>
      <td style="background-color:#101016;border-top:4px solid #FF6F61;border-radius:16px 16px 0 0;padding:48px 44px 40px;text-align:center;">
        <p style="margin:0 0 16px 0;font-size:11px;font-weight:700;color:#8b8b9d;letter-spacing:4px;text-transform:uppercase;">— BENVENUTO A BORDO —</p>
        <div style="margin-bottom:24px;">
          <span style="font-size:42px;font-weight:900;color:#FFFFFF;letter-spacing:-1px;">Trip</span><span style="font-size:42px;font-weight:900;color:#FF6F61;letter-spacing:-1px;">Now</span><span style="font-size:26px;margin-left:8px;">✈️</span>
        </div>
        <h1 style="margin:0 0 16px 0;font-size:32px;font-weight:800;color:#FFFFFF;line-height:1.2;">
          Il Mondo è Tuo.<br><span style="color:#FF6F61;">Inizia ad Esplorarlo.</span>
        </h1>
        <p style="margin:0 0 32px 0;font-size:16px;color:#a0a0b0;line-height:1.6;">
          Sei parte della community TripNow. Da oggi le destinazioni più belle del mondo sono a portata di clic.
        </p>
        <a href="http://127.0.0.1:3000/src/html/homepage.html"
           style="display:inline-block;background-color:#FF6F61;color:#ffffff;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:16px 40px;border-radius:12px;">
          ✈️ &nbsp;Esplora TripNow
        </a>
      </td>
    </tr>

    <tr>
      <td style="background-color:#151520;padding:0;border-top:1px solid rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.05);">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="33%" align="center" style="padding:20px 8px;border-right:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:24px;font-weight:900;color:#38bdf8;">9</p>
              <p style="margin:4px 0 0;font-size:10px;font-weight:700;color:#8b8b9d;text-transform:uppercase;letter-spacing:1.5px;">Destinazioni</p>
            </td>
            <td width="33%" align="center" style="padding:20px 8px;border-right:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:24px;font-weight:900;color:#38bdf8;">AI</p>
              <p style="margin:4px 0 0;font-size:10px;font-weight:700;color:#8b8b9d;text-transform:uppercase;letter-spacing:1.5px;">Itinerari Smart</p>
            </td>
            <td width="33%" align="center" style="padding:20px 8px;">
              <p style="margin:0;font-size:24px;font-weight:900;color:#38bdf8;">24/7</p>
              <p style="margin:4px 0 0;font-size:10px;font-weight:700;color:#8b8b9d;text-transform:uppercase;letter-spacing:1.5px;">TripBot Live</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background-color:#0a0a0f;padding:40px 44px 32px;">
        <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:2.5px;">Cosa riceverai</p>
        <h2 style="margin:0 0 32px 0;font-size:22px;font-weight:800;color:#FFFFFF;line-height:1.35;">
          Tutto ciò che ti serve per viaggiare meglio
        </h2>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="56" valign="top">
              <div style="width:48px;height:48px;background-color:#151520;border-radius:12px;text-align:center;line-height:48px;font-size:20px;border:1px solid rgba(255,255,255,0.05);">🗺️</div>
            </td>
            <td valign="top" style="padding-left:16px;">
              <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#FFFFFF;">Guide & Destinazioni</p>
              <p style="margin:0;font-size:14px;color:#a0a0b0;line-height:1.6;">Roma, Parigi, New York, Istanbul e altre 5 mete — con meteo live, attrazioni, ristoranti e consigli pratici aggiornati.</p>
            </td>
          </tr>
        </table>
        <div style="border-top:1px dashed rgba(255,255,255,0.05);margin-bottom:24px;"></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="56" valign="top">
              <div style="width:48px;height:48px;background-color:#151520;border-radius:12px;text-align:center;line-height:48px;font-size:20px;border:1px solid rgba(255,255,255,0.05);">🤖</div>
            </td>
            <td valign="top" style="padding-left:16px;">
              <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#FFFFFF;">Itinerari generati dall'AI</p>
              <p style="margin:0;font-size:14px;color:#a0a0b0;line-height:1.6;">Scegli destinazione, giorni e interessi. L'AI di TripNow crea un piano viaggio completo — mattina, pomeriggio e sera — in pochi secondi.</p>
            </td>
          </tr>
        </table>
        <div style="border-top:1px dashed rgba(255,255,255,0.05);margin-bottom:24px;"></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td width="56" valign="top">
              <div style="width:48px;height:48px;background-color:#151520;border-radius:12px;text-align:center;line-height:48px;font-size:20px;border:1px solid rgba(255,255,255,0.05);">💬</div>
            </td>
            <td valign="top" style="padding-left:16px;">
              <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#FFFFFF;">TripBot — Assistente AI 24/7</p>
              <p style="margin:0;font-size:14px;color:#a0a0b0;line-height:1.6;">Domande su hotel, ristoranti, trasporti o attrazioni? TripBot risponde istantaneamente, come un esperto di viaggio sempre disponibile.</p>
            </td>
          </tr>
        </table>
        <div style="border-top:1px dashed rgba(255,255,255,0.05);margin-bottom:24px;"></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:40px;">
          <tr>
            <td width="56" valign="top">
              <div style="width:48px;height:48px;background-color:#151520;border-radius:12px;text-align:center;line-height:48px;font-size:20px;border:1px solid rgba(255,255,255,0.05);">🎟️</div>
            </td>
            <td valign="top" style="padding-left:16px;">
              <p style="margin:0 0 4px 0;font-size:16px;font-weight:700;color:#FFFFFF;">Offerte Esclusive per iscritti</p>
              <p style="margin:0;font-size:14px;color:#a0a0b0;line-height:1.6;">Accesso anticipato a sconti su voli e hotel, promozioni stagionali e deal speciali riservati alla community TripNow.</p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="background-color:#101016;border-radius:16px;padding:32px 28px;border:1px solid rgba(56,189,248,0.3);">
              <p style="margin:0 0 6px 0;font-size:11px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:2px;">Prova adesso</p>
              <p style="margin:0 0 24px 0;font-size:15px;color:#e8eaf0;line-height:1.6;">Crea il tuo itinerario personalizzato con l'AI di TripNow — gratis, in pochi clic.</p>
              <a href="http://127.0.0.1:3000/src/html/itinerario.html"
                 style="display:inline-block;background-color:#38bdf8;color:#ffffff;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:14px 32px;border-radius:12px;">
                🤖 &nbsp;Genera Itinerario AI
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background-color:#050508;padding:32px 44px;border-top:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0 0 24px 0;font-size:11px;font-weight:700;color:#FF6F61;text-transform:uppercase;letter-spacing:3px;text-align:center;">Nodi di Destinazione</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" width="20%" style="padding:4px;">
              <div style="background-color:#101016;border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:14px 6px;">
                <div style="font-size:24px;margin-bottom:6px;">🏛️</div>
                <p style="margin:0;font-size:11px;font-weight:700;color:#FFFFFF;">Roma</p>
              </div>
            </td>
            <td align="center" width="20%" style="padding:4px;">
              <div style="background-color:#101016;border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:14px 6px;">
                <div style="font-size:24px;margin-bottom:6px;">🗼</div>
                <p style="margin:0;font-size:11px;font-weight:700;color:#FFFFFF;">Parigi</p>
              </div>
            </td>
            <td align="center" width="20%" style="padding:4px;">
              <div style="background-color:#101016;border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:14px 6px;">
                <div style="font-size:24px;margin-bottom:6px;">🕌</div>
                <p style="margin:0;font-size:11px;font-weight:700;color:#FFFFFF;">Istanbul</p>
              </div>
            </td>
            <td align="center" width="20%" style="padding:4px;">
              <div style="background-color:#101016;border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:14px 6px;">
                <div style="font-size:24px;margin-bottom:6px;">🗽</div>
                <p style="margin:0;font-size:11px;font-weight:700;color:#FFFFFF;">New York</p>
              </div>
            </td>
            <td align="center" width="20%" style="padding:4px;">
              <div style="background-color:#FF6F61;border-radius:12px;padding:14px 6px;">
                <div style="font-size:24px;margin-bottom:6px;color:#fff;font-weight:900;">+5</div>
                <p style="margin:0;font-size:11px;font-weight:800;color:#ffffff;text-transform:uppercase;">Scopri</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background-color:#050508;border-radius:0 0 16px 16px;padding:24px 44px 32px;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:20px;font-weight:900;color:#FFFFFF;">
          Trip<span style="color:#FF6F61;">Now</span> ✈️
        </p>
        <p style="margin:0 0 20px 0;font-size:11px;color:#8b8b9d;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Esplora · Sogna · Viaggia</p>
        
        <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:20px;">
          <p style="margin:0 0 12px 0;font-size:12px;color:#6a6a7c;line-height:1.6;">
            Hai ricevuto questa email perché <strong>${safeEmail}</strong><br>si è iscritto alla newsletter di TripNow.com.
          </p>
          <p style="margin:0 0 10px 0;font-size:11px;color:#6a6a7c;">
            <a href="mailto:nowtripnow@gmail.com" style="color:#38bdf8;text-decoration:none;">nowtripnow@gmail.com</a>
            &nbsp;·&nbsp;
            <a href="http://127.0.0.1:3000/src/html/privacy.html" style="color:#6a6a7c;text-decoration:underline;">Privacy Policy</a>
            &nbsp;·&nbsp;
            <span>&copy; ${new Date().getFullYear()} TripNow.com</span>
          </p>
          <p style="margin:0;font-size:11px;color:#6a6a7c;">
            <a href="${BASE_URL}/unsubscribe?token=${unsubToken}" style="color:#6a6a7c;text-decoration:underline;">Disiscriviti dalla newsletter</a>
          </p>
        </div>
      </td>
    </tr>

  </table>
  </td></tr>
</table>

</body>
</html>`
    }, (err) => {
        if (err) {
            console.error('Errore invio newsletter:', err);
            return res.status(500).send('Errore durante l\'invio dell\'email');
        }
        res.send('Iscrizione completata e email inviata!');
    });
});

// ── Disiscrizione newsletter ──────────────────────────────────────────────────
app.get('/unsubscribe', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('Token mancante');
    db.run(
        `UPDATE newsletter_subscribers SET active=0 WHERE unsubscribe_token=?`,
        [token],
        function(err) {
            if (err || this.changes === 0) return res.status(404).send('Token non trovato o già disattivato');
            res.send(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Disiscrizione — TripNow</title></head>
<body style="margin:0;padding:0;background:#050508;font-family:Helvetica,Arial,sans-serif;color:#e8e8f0;text-align:center;padding:80px 20px;">
  <p style="font-size:40px;margin:0 0 24px">✅</p>
  <h1 style="font-size:24px;font-weight:800;margin:0 0 12px">Disiscrizione completata</h1>
  <p style="font-size:15px;color:#a0a0b0;margin:0 0 32px">La tua email è stata rimossa dalla newsletter TripNow.</p>
  <a href="/" style="display:inline-block;background:#FF6F61;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">Torna alla Home</a>
</body></html>`);
        }
    );
});

// ── Admin: invio newsletter personalizzata ────────────────────────────────────
// Protetto da header: Authorization: Bearer <ADMIN_SECRET>
app.post('/admin/send-newsletter', async (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
        return res.status(401).json({ error: 'Non autorizzato' });
    }

    const BASE_URL = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
    const apiKey = process.env.GROQ_API_KEY;

    db.all(`SELECT email, unsubscribe_token FROM newsletter_subscribers WHERE active=1`, [], async (err, subscribers) => {
        if (err) return res.status(500).json({ error: 'Errore DB' });
        if (!subscribers.length) return res.json({ sent: 0, message: 'Nessun iscritto attivo' });

        const results = { sent: 0, errors: [] };

        for (const sub of subscribers) {
            try {
                // 1. Recupera favorites dell'iscritto (se utente registrato)
                const favorites = await new Promise(resolve => {
                    db.all(`SELECT destination_name FROM favorites WHERE user_email=?`, [sub.email], (e, rows) => {
                        resolve(e ? [] : rows.map(r => r.destination_name));
                    });
                });

                // 2. Recupera behavioral events ultimi 30 giorni
                const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
                const behaviorRows = await new Promise(resolve => {
                    db.all(
                        `SELECT destination, SUM(time_on_page) as tot_time, MAX(phase_reached) as max_phase
                         FROM behavioral_events
                         WHERE (user_email=? OR user_email IS NULL) AND created_at > ?
                         GROUP BY destination`,
                        [sub.email, cutoff],
                        (e, rows) => resolve(e ? [] : rows)
                    );
                });

                // 3. Calcola top 3 destinazioni
                let topRecs;
                if (favorites.length > 0) {
                    const profile = buildUserProfile(favorites);
                    topRecs = Object.keys(DESTINATION_TAGS)
                        .filter(d => !favorites.includes(d))
                        .map(d => ({ name: d, score: cosineSimilarity(profile, DESTINATION_TAGS[d]) }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 3);
                } else if (behaviorRows.length > 0) {
                    const destNames = behaviorRows.map(r => r.destination);
                    const profile = buildUserProfile(destNames);
                    topRecs = Object.keys(DESTINATION_TAGS)
                        .filter(d => !destNames.includes(d))
                        .map(d => ({ name: d, score: cosineSimilarity(profile, DESTINATION_TAGS[d]) }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 3);
                } else {
                    topRecs = [
                        { name: 'Roma' }, { name: 'New York' }, { name: 'Istanbul' }
                    ];
                }

                // 4. Genera intro AI con Groq (fallback generico se API non disponibile)
                let introText = 'Nuove destinazioni ti aspettano. Scopri le mete selezionate per te questa settimana.';
                if (apiKey && !apiKey.startsWith('inserisci_')) {
                    try {
                        const interests = favorites.length > 0
                            ? buildUserProfile(favorites)
                            : null;
                        const interestDesc = interests
                            ? Object.entries(interests).filter(([,v]) => v > 0.3).map(([k]) => k).join(', ') || 'viaggi'
                            : 'viaggi e avventura';

                        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                            body: JSON.stringify({
                                model: 'llama-3.3-70b-versatile',
                                messages: [{
                                    role: 'user',
                                    content: `Sei TripBot, l'assistente di viaggio di TripNow.com. Scrivi un breve paragrafo introduttivo per una newsletter settimanale di viaggi in italiano. L'utente è appassionato di: ${interestDesc}. Tono caldo e ispirazionale. Massimo 60 parole. Niente elenchi, solo testo fluido.`
                                }],
                                max_tokens: 120,
                                temperature: 0.8,
                                stream: false,
                            }),
                        });
                        if (groqRes.ok) {
                            const groqData = await groqRes.json();
                            introText = groqData.choices?.[0]?.message?.content?.trim() || introText;
                        }
                    } catch (_) { /* usa fallback */ }
                }

                // 5. Componi le card delle destinazioni consigliate
                const destIcons = { 'Roma':'🏛️','Parigi':'🗼','Istanbul':'🕌','Il Cairo':'🏺','New York':'🗽','San Francisco':'🌉','Rio de Janeiro':'🌊','Petra':'🪨','Cuzco':'🦙' };
                const recCardsHtml = topRecs.map(rec => {
                    const icon = destIcons[rec.name] || '✈️';
                    const link = DESTINATION_LINKS[rec.name] ? `${BASE_URL}/src/html/${DESTINATION_LINKS[rec.name]}` : BASE_URL;
                    const tags = DESTINATION_TAGS[rec.name] || {};
                    const topTag = Object.entries(tags).filter(([k,v]) => k !== 'costo' && v === 1).map(([k]) => k)[0] || 'viaggi';
                    return `<td align="center" width="33%" style="padding:6px;">
                      <a href="${link}" style="display:block;text-decoration:none;background-color:#101016;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:18px 10px;">
                        <div style="font-size:28px;margin-bottom:8px;">${icon}</div>
                        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#FFFFFF;">${rec.name}</p>
                        <p style="margin:0;font-size:10px;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;">${topTag}</p>
                      </a>
                    </td>`;
                }).join('');

                // 6. Componi e invia l'email
                const safeEmail = escapeHtml(sub.email);
                await new Promise((resolve, reject) => {
                    transporter.sendMail({
                        from: `"TripNow" <${process.env.EMAIL_USER}>`,
                        to: sub.email,
                        subject: '✈️ TripNow — Le destinazioni scelte per te questa settimana',
                        html: `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>TripNow Newsletter</title></head>
<body style="margin:0;padding:0;background-color:#050508;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050508;padding:40px 0;">
  <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#0a0a0f;border:1px solid rgba(255,255,255,0.05);border-radius:16px;">

    <tr>
      <td style="background-color:#101016;border-top:4px solid #FF6F61;border-radius:16px 16px 0 0;padding:40px 44px 32px;text-align:center;">
        <div style="margin-bottom:16px;">
          <span style="font-size:36px;font-weight:900;color:#FFFFFF;">Trip</span><span style="font-size:36px;font-weight:900;color:#FF6F61;">Now</span><span style="font-size:22px;margin-left:6px;">✈️</span>
        </div>
        <p style="margin:0 0 8px;font-size:11px;color:#8b8b9d;letter-spacing:3px;text-transform:uppercase;font-weight:700;">Newsletter Settimanale</p>
        <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;">Il Mondo Ti Aspetta</h1>
      </td>
    </tr>

    <tr>
      <td style="padding:32px 44px;background-color:#0a0a0f;border-top:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0;font-size:15px;color:#a0a0b0;line-height:1.7;">${introText}</p>
      </td>
    </tr>

    <tr>
      <td style="padding:0 44px 32px;background-color:#0a0a0f;">
        <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#FF6F61;text-transform:uppercase;letter-spacing:2.5px;">✨ Scelte per te</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>${recCardsHtml}</tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:0 44px 40px;background-color:#0a0a0f;">
        <a href="${BASE_URL}/src/html/homepage.html"
           style="display:inline-block;background-color:#FF6F61;color:#ffffff;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:14px 36px;border-radius:12px;">
          Esplora TripNow →
        </a>
      </td>
    </tr>

    <tr>
      <td style="background-color:#050508;border-radius:0 0 16px 16px;padding:20px 44px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0 0 8px;font-size:11px;color:#6a6a7c;">
          <a href="mailto:nowtripnow@gmail.com" style="color:#38bdf8;text-decoration:none;">nowtripnow@gmail.com</a>
          &nbsp;·&nbsp;
          <a href="http://127.0.0.1:3000/src/html/privacy.html" style="color:#6a6a7c;text-decoration:underline;">Privacy Policy</a>
          &nbsp;·&nbsp;
          <span>&copy; ${new Date().getFullYear()} TripNow.com</span>
        </p>
        <p style="margin:0;font-size:11px;color:#6a6a7c;">
          Hai ricevuto questa email perché <strong style="color:#a0a0b0;">${safeEmail}</strong> è iscritto alla newsletter TripNow.<br>
          <a href="${BASE_URL}/unsubscribe?token=${sub.unsubscribe_token}" style="color:#6a6a7c;text-decoration:underline;">Disiscriviti</a>
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body></html>`
                    }, (mailErr) => {
                        if (mailErr) reject(mailErr);
                        else resolve();
                    });
                });

                results.sent++;
                // Delay 300ms tra invii per non stressare il relay SMTP
                await new Promise(r => setTimeout(r, 300));

            } catch (sendErr) {
                results.errors.push({ email: sub.email, error: sendErr.message });
            }
        }

        res.json(results);
    });
});

// ── Form contatti ─────────────────────────────────────────────────────────────
app.post('/contact', contactLimiter, (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) return res.status(400).send('Tutti i campi sono obbligatori');
    if (!isValidEmail(email)) return res.status(400).send('Email non valida');
    if (name.length > 100) return res.status(400).send('Nome troppo lungo');
    if (message.length > 5000) return res.status(400).send('Messaggio troppo lungo');

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);

    const mailOptions = {
        from: `"TripNow Contatti" <${process.env.EMAIL_USER}>`,
        to: 'nowtripnow@gmail.com',
        replyTo: email,
        subject: `📬 Nuovo messaggio da ${safeName}`,
        html: `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuovo messaggio - TripNow</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Arial,Helvetica,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF2F7;padding:30px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#005A8E 0%,#0083C5 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:28px;font-weight:900;color:#FFFFFF;">Trip<span style="color:#FFD54F;">Now</span> ✈️</p>
              <p style="margin:0;font-size:13px;color:#B8E0F7;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Modulo di contatto</p>
            </td>
          </tr>

          <!-- CORPO -->
          <tr>
            <td style="background:#FFFFFF;padding:36px 40px 32px;">

              <!-- Badge notifica -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#E8F5E9;border:1px solid #A5D6A7;border-radius:8px;padding:10px 18px;">
                    <span style="font-size:13px;color:#2E7D32;font-weight:700;">📬 Hai ricevuto un nuovo messaggio dal sito</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px 0;font-size:15px;color:#555;line-height:1.7;">
                Un visitatore ha compilato il modulo <strong>"Mettiti in Contatto"</strong> su TripNow.com.
                Puoi rispondergli direttamente a questa email.
              </p>

              <!-- Dati mittente -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-radius:12px;overflow:hidden;border:1px solid #E0E8F0;">
                <tr>
                  <td style="background:#F0F7FF;padding:14px 20px;border-bottom:1px solid #E0E8F0;">
                    <p style="margin:0;font-size:11px;font-weight:700;color:#0083C5;text-transform:uppercase;letter-spacing:1.5px;">Mittente</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="28" style="vertical-align:middle;padding-right:10px;font-size:18px;">👤</td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-size:14px;color:#888;">Nome</p>
                          <p style="margin:2px 0 0 0;font-size:16px;font-weight:700;color:#003F6B;">${safeName}</p>
                        </td>
                      </tr>
                      <tr><td colspan="2" style="padding:10px 0;"><div style="border-top:1px solid #EEF2F7;"></div></td></tr>
                      <tr>
                        <td width="28" style="vertical-align:middle;padding-right:10px;font-size:18px;">📧</td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-size:14px;color:#888;">Email</p>
                          <a href="mailto:${safeEmail}" style="display:block;margin:2px 0 0 0;font-size:16px;font-weight:700;color:#0083C5;text-decoration:none;">${safeEmail}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Messaggio -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border-radius:12px;overflow:hidden;border:1px solid #E0E8F0;">
                <tr>
                  <td style="background:#F0F7FF;padding:14px 20px;border-bottom:1px solid #E0E8F0;">
                    <p style="margin:0;font-size:11px;font-weight:700;color:#0083C5;text-transform:uppercase;letter-spacing:1.5px;">💬 Messaggio</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;background:#FAFCFF;">
                    <p style="margin:0;font-size:15px;color:#333;line-height:1.8;white-space:pre-wrap;">${safeMessage}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA risposta -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="mailto:${safeEmail}?subject=Re: La tua richiesta su TripNow"
                       style="display:inline-block;background:linear-gradient(135deg,#005A8E,#0083C5);color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:50px;">
                      ↩️ &nbsp;Rispondi a ${safeName}
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#003F6B;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#6A9AB8;">
                Messaggio ricevuto automaticamente da <strong style="color:#89C4E1;">TripNow.com</strong>
              </p>
              <p style="margin:0;font-size:11px;color:#4D8AAA;">
                &copy; ${new Date().getFullYear()} TripNow.com &mdash; Tutti i diritti riservati
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
    };

    transporter.sendMail(mailOptions, (err) => {
        if (err) {
            console.error('Errore invio email contatto:', err);
            return res.status(500).send('Errore invio email');
        }
        res.send('Messaggio inviato con successo!');
    });
});

// ── Clima Storico (Open-Meteo, gratuito, no API key) ──────────────────────────
// Open-Meteo Historical Archive aggrega dati giornalieri degli ultimi 5 anni.
// Per ogni mese calcola: temperatura media (°C) e giorni di pioggia (precip > 1mm).
// Cache 24h in memoria — i dati climatici storici non cambiano frequentemente.
const climateCache = new Map();
app.get('/api/climate', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180)
        return res.status(400).json({ error: 'Coordinate non valide' });

    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = climateCache.get(cacheKey);
    if (cached && cached.ts > Date.now() - 24 * 3600 * 1000) return res.json(cached.data);

    try {
        const endYear = new Date().getFullYear() - 1;
        const startYear = endYear - 4;
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
        const r = await fetch(url);
        if (!r.ok) return res.status(502).json({ error: 'Errore Open-Meteo' });
        const raw = await r.json();

        const months = Array.from({ length: 12 }, (_, i) => ({ m: i, tSum: 0, tCount: 0, rainDays: 0, dayCount: 0 }));
        raw.daily.time.forEach((dateStr, idx) => {
            const m = parseInt(dateStr.slice(5, 7)) - 1;
            const tmax = raw.daily.temperature_2m_max[idx];
            const tmin = raw.daily.temperature_2m_min[idx];
            const rain = raw.daily.precipitation_sum[idx];
            if (tmax !== null && tmin !== null) { months[m].tSum += (tmax + tmin) / 2; months[m].tCount++; }
            if (rain !== null) { if (rain > 1) months[m].rainDays++; months[m].dayCount++; }
        });

        const data = months.map(({ m, tSum, tCount, rainDays, dayCount }) => ({
            month: m + 1,
            avgTemp: tCount ? Math.round(tSum / tCount) : null,
            rainDays: dayCount ? Math.round(rainDays / (dayCount / 30)) : null,
        }));

        climateCache.set(cacheKey, { data, ts: Date.now() });
        res.json(data);
    } catch (err) {
        console.error('Climate API error:', err.message);
        res.status(500).json({ error: 'Errore server' });
    }
});

// ── Valuta Live (ExchangeRate API) ─────────────────────────────────────────────
// Richiede EXCHANGE_RATE_KEY nel .env — free tier: 1500 req/mese.
// Cache 1h per risparmiare chiamate. Se la chiave manca restituisce { fallback: true }
// e il client usa i tassi hardcoded già presenti in extras.js.
const currencyCache = new Map();
app.get('/api/currency', async (req, res) => {
    const from = (req.query.from || 'EUR').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    const to   = (req.query.to   || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (from.length !== 3 || to.length !== 3)
        return res.status(400).json({ error: 'Codice valuta non valido' });

    const apiKey = process.env.EXCHANGE_RATE_KEY;
    if (!apiKey || apiKey.startsWith('inserisci_')) return res.json({ fallback: true });

    const cacheKey = `${from}-${to}`;
    const cached = currencyCache.get(cacheKey);
    if (cached && cached.ts > Date.now() - 3600 * 1000) return res.json({ rate: cached.rate, cached: true });

    try {
        const r = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`);
        if (!r.ok) return res.json({ fallback: true });
        const body = await r.json();
        if (!body.conversion_rate) return res.json({ fallback: true });
        currencyCache.set(cacheKey, { rate: body.conversion_rate, ts: Date.now() });
        res.json({ rate: body.conversion_rate, live: true });
    } catch (_) {
        res.json({ fallback: true });
    }
});

// ── Itinerario AI (Groq API / SSE streaming) ──────────────────────────────────
// Usa Groq con LLaMA 3.3 70B — free tier: 14.400 req/giorno, API OpenAI-compatibile.
// Endpoint: POST https://api.groq.com/openai/v1/chat/completions (stream: true)
// Risposta SSE: choices[0].delta.content — re-inoltrata al client in tempo reale.
app.post('/api/itinerary', async (req, res) => {
    const { destination, days, interests } = req.body;
    if (!destination || !days) return res.status(400).json({ error: 'Dati mancanti: destination, days' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.startsWith('inserisci_'))
        return res.status(503).json({ error: 'Servizio AI non configurato. Aggiungi GROQ_API_KEY nel file .env (chiave gratuita su https://console.groq.com/keys)' });

    const interestStr = Array.isArray(interests) && interests.length ? interests.join(', ') : 'arte e cultura';
    const daysNum = Math.min(14, Math.max(1, parseInt(days) || 3));

    const prompt = `Sei un esperto travel planner italiano. Crea un itinerario dettagliato per ${daysNum} giorni a ${destination} per un viaggiatore interessato a: ${interestStr}.

Per ogni giorno usa esattamente questo formato:
## Giorno [N] — [Tema del giorno]
**Mattina:** attività specifica con nome del luogo, orario di apertura e prezzo ingresso se disponibile.
**Pomeriggio:** attività specifica con dettagli pratici e consigli.
**Sera:** nome di un ristorante o locale tipico, con indicazione del quartiere e fascia di prezzo (€/€€/€€€).
💡 *Consiglio del giorno:* un suggerimento pratico specifico per questo giorno.

Alla fine aggiungi queste due sezioni:
## 💰 Budget Indicativo (per persona/giorno)
- Alloggio (fascia media): € ...
- Pasti (3 al giorno): € ...
- Attrazioni: € ...
- Trasporti locali: € ...
- **Totale stimato:** € .../giorno

## 🗺️ Note Pratiche
- Come arrivare: ...
- Trasporti locali: ...
- Periodo migliore per visitare: ...
- Una cosa da non perdere assolutamente: ...

Scrivi in italiano. Usa nomi reali di luoghi, musei e ristoranti. Sii concreto e pratico.`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2048,
                temperature: 0.7,
                stream: true,
            }),
        });

        if (!groqRes.ok) {
            const errBody = await groqRes.text();
            throw new Error(`Groq ${groqRes.status}: ${errBody.slice(0, 200)}`);
        }

        // Legge il body SSE chunk per chunk (OpenAI-compatible format)
        const reader = groqRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                    const chunk = JSON.parse(jsonStr);
                    const text = chunk.choices?.[0]?.delta?.content;
                    if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
                } catch (_) { /* ignora chunk malformati */ }
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error('Groq API error:', err.message);
        res.write(`data: ${JSON.stringify({ error: 'Errore AI: ' + err.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
});

// ── Ricerca Voli — priorità: RapidAPI Sky Scrapper → Kiwi → Amadeus → Demo ────
// 1. RapidAPI Sky Scrapper (RAPIDAPI_KEY): dati Skyscanner, free tier 500 req/mese
// 2. Kiwi.com Tequila API (KIWI_API_KEY): semplice API key, free tier, https://tequila.kiwi.com
// 3. Amadeus test sandbox (AMADEUS_CLIENT_ID + SECRET): OAuth2 client credentials
// 4. Demo mode: dati simulati ma strutturalmente identici al formato reale (per tesi/demo)

// Mappa nomi italiani → codici IATA
const IATA_MAP = {
    'Roma': 'FCO', 'Milano': 'MXP', 'Napoli': 'NAP', 'Venezia': 'VCE',
    'Parigi': 'CDG', 'Istanbul': 'IST',
    'Il Cairo': 'CAI', 'New York': 'JFK', 'San Francisco': 'SFO',
    'Rio de Janeiro': 'GIG', 'Petra': 'AMM', 'Cuzco': 'CUZ',
    'Londra': 'LHR', 'Madrid': 'MAD', 'Barcellona': 'BCN',
    'Amsterdam': 'AMS', 'Berlino': 'BER', 'Vienna': 'VIE',
    'Praga': 'PRG', 'Dublino': 'DUB', 'Lisbona': 'LIS', 'Atene': 'ATH',
    'Dubai': 'DXB', 'Tokyo': 'NRT', 'Bangkok': 'BKK', 'Singapore': 'SIN',
};

// ── RapidAPI Sky Scrapper helper ───────────────────────────────────────────────
// Sky Scrapper richiede entityId (numerico) oltre al codice IATA.
// Li otteniamo con searchAirport e li cacchiamo per tutta la vita del processo.
const rapidApiEntityCache = new Map();
// Mappa inversa IATA → nome città (per la ricerca aeroporto)
const IATA_TO_CITY = Object.fromEntries(
    Object.entries({
        'Roma': 'FCO', 'Milano': 'MXP', 'Napoli': 'NAP', 'Venezia': 'VCE',
        'Parigi': 'CDG', 'Istanbul': 'IST',
        'Il Cairo': 'CAI', 'New York': 'JFK', 'San Francisco': 'SFO',
        'Rio de Janeiro': 'GIG', 'Petra': 'AMM', 'Cuzco': 'CUZ',
        'Londra': 'LHR', 'Madrid': 'MAD', 'Barcellona': 'BCN',
        'Amsterdam': 'AMS', 'Berlino': 'BER', 'Vienna': 'VIE',
        'Praga': 'PRG', 'Dublino': 'DUB', 'Lisbona': 'LIS', 'Atene': 'ATH',
        'Dubai': 'DXB', 'Tokyo': 'NRT', 'Bangkok': 'BKK', 'Singapore': 'SIN',
    }).map(([city, iata]) => [iata, city])
);

async function getRapidApiEntity(iataCode, apiKey) {
    if (rapidApiEntityCache.has(iataCode)) return rapidApiEntityCache.get(iataCode);
    const query = IATA_TO_CITY[iataCode] || iataCode;
    const r = await fetch(`https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${encodeURIComponent(query)}&locale=it-IT`, {
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'sky-scrapper.p.rapidapi.com' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const airport = data.data?.find(e => e.iata === iataCode) || data.data?.[0];
    if (!airport?.entityId) return null;
    const entity = { skyId: airport.skyId || iataCode, entityId: airport.entityId };
    rapidApiEntityCache.set(iataCode, entity);
    return entity;
}

// ── Amadeus OAuth2 helper (mantenuto per tesi) ─────────────────────────────────
let amadeusToken = null;
let amadeusTokenExpiry = 0;
async function getAmadeusToken() {
    if (amadeusToken && Date.now() < amadeusTokenExpiry) return amadeusToken;
    const r = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.AMADEUS_CLIENT_ID,
            client_secret: process.env.AMADEUS_CLIENT_SECRET,
        }).toString(),
    });
    if (!r.ok) throw new Error('Amadeus token error: ' + r.status);
    const { access_token, expires_in } = await r.json();
    amadeusToken = access_token;
    amadeusTokenExpiry = Date.now() + (expires_in - 60) * 1000;
    return amadeusToken;
}

// ── Demo mode: genera voli verosimili ─────────────────────────────────────────
// I prezzi si basano su distanza IATA indicativa, le compagnie sono reali.
function generateDemoFlights(originIATA, destIATA, date, adults) {
    const CARRIERS = ['AZ', 'FR', 'U2', 'VY', 'IB', 'LH', 'KL', 'AF', 'TK', 'EK'];
    const BASE_PRICES = { short: 60, medium: 180, long: 380, ultra: 620 };
    const HUBS = { FCO: 'MXP', CDG: 'AMS', LHR: 'CDG', JFK: 'MXP', SFO: 'LHR' };

    // Distanza stimata per fascia di prezzo
    const longRoutes = new Set(['JFK','SFO','GIG','NRT','BKK','SIN']);
    const ultraRoutes = new Set(['CUZ']);
    const shortRoutes = new Set(['CDG','LHR','AMS','BCN','MAD','BER','VIE','PRG','DUB','LIS','ATH']);
    const dist = ultraRoutes.has(destIATA) ? 'ultra' : longRoutes.has(destIATA) ? 'long' : shortRoutes.has(destIATA) ? 'short' : 'medium';
    const basePrice = BASE_PRICES[dist] * adults;

    const flights = [];
    const depDate = new Date(date + 'T00:00:00');

    for (let i = 0; i < 8; i++) {
        const carrier = CARRIERS[i % CARRIERS.length];
        const depHour = 6 + Math.floor(i * 2.4);
        const flightHours = dist === 'short' ? 2 + Math.random() : dist === 'medium' ? 3.5 + Math.random() * 1.5 : dist === 'long' ? 10 + Math.random() * 4 : 14 + Math.random() * 4;
        const flightMinutes = Math.round(flightHours * 60);
        const stops = i < 4 ? 0 : (dist === 'short' ? 0 : 1);

        const depTime = new Date(depDate);
        depTime.setHours(depHour, (i * 13) % 60);
        const arrTime = new Date(depTime.getTime() + flightMinutes * 60000);

        const hh = h => String(h).padStart(2, '0');
        const durStr = `${Math.floor(flightMinutes / 60)}h ${String(flightMinutes % 60).padStart(2, '0')}m`;

        const segments = stops === 0 ? [{
            from: originIATA, to: destIATA,
            departAt: depTime.toISOString(), arriveAt: arrTime.toISOString(),
            carrier, flight: String(100 + i * 37),
        }] : (() => {
            const hub = HUBS[originIATA] || 'AMS';
            const layover = 90;
            const leg1min = Math.round(flightMinutes * 0.45);
            const leg2min = flightMinutes - leg1min - layover;
            const arr1 = new Date(depTime.getTime() + leg1min * 60000);
            const dep2 = new Date(arr1.getTime() + layover * 60000);
            const arr2 = new Date(dep2.getTime() + leg2min * 60000);
            return [
                { from: originIATA, to: hub, departAt: depTime.toISOString(), arriveAt: arr1.toISOString(), carrier, flight: String(100 + i * 37) },
                { from: hub, to: destIATA, departAt: dep2.toISOString(), arriveAt: arr2.toISOString(), carrier, flight: String(200 + i * 41) },
            ];
        })();

        const priceVariation = 0.8 + (i % 5) * 0.12;
        flights.push({
            id: `demo-${i}`,
            price: Math.round(basePrice * priceVariation),
            currency: 'EUR',
            carrier,
            demo: true,
            itineraries: [{ duration: durStr, stops, segments }],
        });
    }
    return flights.sort((a, b) => a.price - b.price);
}

app.get('/api/flights', async (req, res) => {
    const { origin, destination, date, adults = '1' } = req.query;
    if (!origin || !destination || !date)
        return res.status(400).json({ error: 'Parametri mancanti: origin, destination, date (YYYY-MM-DD)' });

    const adultsNum = Math.min(9, Math.max(1, parseInt(adults) || 1));
    const iataRegex = /^[A-Z]{3}$/;
    const originIATA = iataRegex.test(origin.toUpperCase()) ? origin.toUpperCase() : IATA_MAP[origin];
    const destIATA   = iataRegex.test(destination.toUpperCase()) ? destination.toUpperCase() : IATA_MAP[destination];
    if (!originIATA || !destIATA)
        return res.status(400).json({ error: 'Aeroporto non riconosciuto: ' + (!originIATA ? origin : destination) });

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const kiwiKey     = process.env.KIWI_API_KEY;
    const amadeusId   = process.env.AMADEUS_CLIENT_ID;

    // ── Prova 1: RapidAPI Sky Scrapper ─────────────────────────────────────────
    if (rapidApiKey && !rapidApiKey.startsWith('inserisci_')) {
        try {
            const [originEntity, destEntity] = await Promise.all([
                getRapidApiEntity(originIATA, rapidApiKey),
                getRapidApiEntity(destIATA, rapidApiKey),
            ]);
            if (originEntity && destEntity) {
                const url = `https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights` +
                    `?originSkyId=${originEntity.skyId}&destinationSkyId=${destEntity.skyId}` +
                    `&originEntityId=${originEntity.entityId}&destinationEntityId=${destEntity.entityId}` +
                    `&date=${date}&adults=${adultsNum}&currency=EUR&locale=it-IT&market=IT&cabinClass=economy`;
                const r = await fetch(url, {
                    headers: { 'X-RapidAPI-Key': rapidApiKey, 'X-RapidAPI-Host': 'sky-scrapper.p.rapidapi.com' },
                });
                if (r.ok) {
                    const data = await r.json();
                    const itineraries = data.data?.itineraries || [];
                    const flights = itineraries.map((it, i) => {
                        const leg = it.legs?.[0];
                        if (!leg) return null;
                        const durMin = leg.durationInMinutes || 0;
                        return {
                            id: it.id || `rapid-${i}`,
                            price: it.price?.raw || 0,
                            currency: 'EUR',
                            carrier: leg.carriers?.marketing?.[0]?.alternateId || '—',
                            itineraries: [{
                                duration: `${Math.floor(durMin / 60)}h ${String(durMin % 60).padStart(2, '0')}m`,
                                stops: leg.stopCount || 0,
                                segments: (leg.segments || []).map(s => ({
                                    from: s.origin?.displayCode || '',
                                    to: s.destination?.displayCode || '',
                                    departAt: s.departure,
                                    arriveAt: s.arrival,
                                    carrier: s.marketingCarrier?.alternateId || '',
                                    flight: String(s.flightNumber || ''),
                                })),
                            }],
                        };
                    }).filter(Boolean);
                    if (flights.length > 0)
                        return res.json({ flights, count: flights.length, source: 'rapidapi' });
                }
            }
        } catch (err) {
            console.error('RapidAPI Sky Scrapper error:', err.message);
        }
    }

    // ── Prova 3: Kiwi Tequila API ──────────────────────────────────────────────
    if (kiwiKey && !kiwiKey.startsWith('inserisci_')) {
        try {
            const dateFormatted = date; // già YYYY-MM-DD
            const url = `https://api.tequila.kiwi.com/v2/search?fly_from=${originIATA}&fly_to=${destIATA}&date_from=${dateFormatted}&date_to=${dateFormatted}&adults=${adultsNum}&curr=EUR&limit=12&sort=price`;
            const r = await fetch(url, { headers: { apikey: kiwiKey } });
            if (r.ok) {
                const { data = [] } = await r.json();
                const flights = data.map(f => ({
                    id: f.id,
                    price: f.price,
                    currency: 'EUR',
                    carrier: f.airlines?.[0] || '—',
                    itineraries: [{
                        duration: (() => {
                            const tot = f.duration?.total || 0;
                            return `${Math.floor(tot / 3600)}h ${String(Math.floor((tot % 3600) / 60)).padStart(2,'0')}m`;
                        })(),
                        stops: (f.route?.length || 1) - 1,
                        segments: (f.route || []).map(s => ({
                            from: s.flyFrom, to: s.flyTo,
                            departAt: new Date(s.dTime * 1000).toISOString(),
                            arriveAt: new Date(s.aTime * 1000).toISOString(),
                            carrier: s.airline, flight: s.flight_no,
                        })),
                    }],
                }));
                return res.json({ flights, count: flights.length, source: 'kiwi' });
            }
        } catch (err) {
            console.error('Kiwi API error:', err.message);
        }
    }

    // ── Prova 4: Amadeus sandbox ───────────────────────────────────────────────
    if (amadeusId && amadeusId.length > 5) {
        try {
            const token = await getAmadeusToken();
            const url = `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${originIATA}&destinationLocationCode=${destIATA}&departureDate=${date}&adults=${adultsNum}&max=12&currencyCode=EUR`;
            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (r.ok) {
                const { data = [] } = await r.json();
                const flights = data.map(offer => ({
                    id: offer.id,
                    price: parseFloat(offer.price.grandTotal),
                    currency: offer.price.currency,
                    carrier: offer.validatingAirlineCodes?.[0] || '—',
                    itineraries: offer.itineraries.map(it => ({
                        duration: it.duration.replace('PT','').replace('H','h ').replace('M','m').trim(),
                        stops: it.segments.length - 1,
                        segments: it.segments.map(s => ({
                            from: s.departure.iataCode, to: s.arrival.iataCode,
                            departAt: s.departure.at, arriveAt: s.arrival.at,
                            carrier: s.carrierCode, flight: s.number,
                        })),
                    })),
                }));
                return res.json({ flights, count: flights.length, source: 'amadeus' });
            }
        } catch (err) {
            console.error('Amadeus error:', err.message);
        }
    }

    // ── Prova 5: Demo mode ─────────────────────────────────────────────────────
    // Genera dati verosimili per demo/tesi. Struttura identica al formato API reale.
    const flights = generateDemoFlights(originIATA, destIATA, date, adultsNum);
    res.json({ flights, count: flights.length, source: 'demo' });
});

// ── TripBot Chat (Groq LLaMA 3.3 / SSE streaming) ─────────────────────────────
// Mantiene la conversation history lato client (inviata ad ogni request).
// Il system prompt trasforma il modello in un esperto travel concierge di TripNow.
// Limita a 10 messaggi recenti per rispettare il context window e i rate limit.
app.post('/api/chat', async (req, res) => {
    const { messages, pageContext } = req.body;
    if (!Array.isArray(messages) || messages.length === 0)
        return res.status(400).json({ error: 'messages array required' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.startsWith('inserisci_'))
        return res.status(503).json({ error: 'Chatbot non configurato: aggiungi GROQ_API_KEY nel .env' });

    const systemPrompt = `Sei TripBot, l'assistente AI di TripNow.com — il portale di viaggi italiano.
Sei entusiasta, caldo e appassionato di viaggi. Rispondi SEMPRE in italiano.
Conosci perfettamente le 9 destinazioni TripNow: Roma (Italia), Parigi (Francia), Istanbul (Turchia),
Il Cairo (Egitto), New York (USA), San Francisco (USA), Rio de Janeiro (Brasile), Petra (Giordania), Cuzco (Perù).
Per ogni destinazione puoi consigliare: attrazioni imperdibili, cucina locale, periodo migliore per visitare,
budget indicativo, quartieri, trasporti interni, consigli di sicurezza e curiosità culturali.
Puoi anche aiutare l'utente a scegliere la destinazione giusta in base ai suoi interessi e budget.
Per prenotare voli rimanda alla sezione "Cerca Voli" del sito. Per itinerari dettagliati rimanda a "Itinerario AI".
Usa emoji con moderazione. Risposte concise ma utili (massimo 120 parole). Non inventare prezzi specifici di hotel/voli.
Stile conversazionale, mai robotico. Se l'utente è già su una pagina destinazione, parti da quella.
${pageContext ? `Contesto pagina corrente: "${pageContext}"` : ''}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.slice(-10), // ultimi 10 messaggi per rispettare i token limit
                ],
                max_tokens: 350,
                temperature: 0.8,
                stream: true,
            }),
        });

        if (!groqRes.ok) {
            const errBody = await groqRes.text();
            throw new Error(`Groq ${groqRes.status}: ${errBody.slice(0, 150)}`);
        }

        const reader = groqRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                    const chunk = JSON.parse(jsonStr);
                    const text = chunk.choices?.[0]?.delta?.content;
                    if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
                } catch (_) {}
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error('Chat API error:', err.message);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
});

// ── Predictive Engine: Dataset ────────────────────────────────────────────────
// Crowd score mensile [0,1] per destinazione — calibrato su dati UNWTO/Euromonitor.
// 0 = quasi deserta, 1 = massimo affollamento (es. Roma ad agosto = 0.95).
// Pesi applicati successivamente: alta pioggia → crowd −0.15, caldo >35°C → crowd −0.10
const CROWD_BASELINE = {
    'Roma':           [0.35,0.38,0.52,0.75,0.80,0.85,0.95,0.95,0.80,0.65,0.45,0.55],
    'Parigi':         [0.45,0.45,0.55,0.70,0.75,0.80,0.95,0.90,0.75,0.65,0.50,0.60],
    'Istanbul':       [0.30,0.32,0.45,0.65,0.75,0.85,0.90,0.88,0.80,0.60,0.40,0.35],
    'Il Cairo':       [0.40,0.42,0.50,0.60,0.55,0.40,0.35,0.35,0.45,0.60,0.65,0.55],
    'New York':       [0.45,0.45,0.55,0.65,0.75,0.80,0.90,0.88,0.80,0.75,0.60,0.70],
    'San Francisco':  [0.35,0.38,0.45,0.55,0.65,0.80,0.88,0.90,0.80,0.65,0.50,0.40],
    'Rio de Janeiro': [0.70,0.95,0.55,0.40,0.35,0.30,0.32,0.35,0.40,0.45,0.55,0.65],
    'Petra':          [0.30,0.35,0.50,0.70,0.65,0.40,0.35,0.35,0.45,0.65,0.55,0.38],
    'Cuzco':          [0.60,0.55,0.50,0.45,0.40,0.38,0.35,0.38,0.42,0.50,0.55,0.58],
};

// Costo medio giornaliero (€/persona) per mese — fascia media (hotel 3★, cibo locale)
// Struttura: [costo_bassa_stagione, costo_alta_stagione] interpolati su crowd score
const COST_RANGE = {
    'Roma':           { low: 90,  high: 220 },
    'Parigi':         { low: 120, high: 280 },
    'Istanbul':       { low: 50,  high: 130 },
    'Il Cairo':       { low: 35,  high: 90  },
    'New York':       { low: 150, high: 350 },
    'San Francisco':  { low: 160, high: 320 },
    'Rio de Janeiro': { low: 70,  high: 180 },
    'Petra':          { low: 55,  high: 140 },
    'Cuzco':          { low: 45,  high: 110 },
};

// Coordinate GPS per /api/predictive (duplicate da trip-planner ma autonome lato server)
const DEST_COORDS = {
    'Roma':           { lat: 41.9028, lon:  12.4964 },
    'Parigi':         { lat: 48.8566, lon:   2.3522 },
    'Istanbul':       { lat: 41.0082, lon:  28.9784 },
    'Il Cairo':       { lat: 30.0444, lon:  31.2357 },
    'New York':       { lat: 40.7128, lon: -74.0060 },
    'San Francisco':  { lat: 37.7749, lon:-122.4194 },
    'Rio de Janeiro': { lat:-22.9068, lon: -43.1729 },
    'Petra':          { lat: 30.3285, lon:  35.4444 },
    'Cuzco':          { lat:-13.5320, lon: -71.9675 },
};

// ── Predictive API ─────────────────────────────────────────────────────────────
// GET /api/predictive/:destination
// Aggrega dati climatici Open-Meteo + crowd baseline + cost range in un pannello
// predittivo completo. Risultato cacchato 24h in SQLite (predictive_cache).
// SeasonalScore(m) = 0.40·climaScore + 0.35·(1−crowdScore) + 0.25·costScore
app.get('/api/predictive/:destination', async (req, res) => {
    const dest = req.params.destination;
    const coords = DEST_COORDS[dest];
    if (!coords) return res.status(404).json({ error: 'Destinazione non trovata' });

    // Controlla cache SQLite (TTL 24h)
    const now = Math.floor(Date.now() / 1000);
    try {
        const cached = await new Promise((resolve, reject) =>
            db.get('SELECT data, updated_at FROM predictive_cache WHERE destination = ?', [dest], (err, row) => err ? reject(err) : resolve(row))
        );
        if (cached && (now - cached.updated_at) < 86400) {
            return res.json(JSON.parse(cached.data));
        }
    } catch (_) {}

    try {
        // Richiama Open-Meteo (stessa logica di /api/climate)
        const endYear = new Date().getFullYear() - 1;
        const startYear = endYear - 4;
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
        const r = await fetch(url);
        if (!r.ok) return res.status(502).json({ error: 'Errore Open-Meteo' });
        const raw = await r.json();

        const months = Array.from({ length: 12 }, (_, i) => ({ m: i, tSum: 0, tCount: 0, rainDays: 0, dayCount: 0 }));
        raw.daily.time.forEach((dateStr, idx) => {
            const m = parseInt(dateStr.slice(5, 7)) - 1;
            const tmax = raw.daily.temperature_2m_max[idx];
            const tmin = raw.daily.temperature_2m_min[idx];
            const rain = raw.daily.precipitation_sum[idx];
            if (tmax !== null && tmin !== null) { months[m].tSum += (tmax + tmin) / 2; months[m].tCount++; }
            if (rain !== null) { if (rain > 1) months[m].rainDays++; months[m].dayCount++; }
        });

        const climateData = months.map(({ m, tSum, tCount, rainDays, dayCount }) => ({
            month: m + 1,
            avgTemp: tCount ? Math.round(tSum / tCount) : null,
            rainDays: dayCount ? Math.round(rainDays / (dayCount / 30)) : null,
        }));

        const crowd = CROWD_BASELINE[dest];
        const costCfg = COST_RANGE[dest];

        // Calcola crowd score corretto per pioggia e caldo estremo
        const adjustedCrowd = climateData.map((d, i) => {
            let c = crowd[i];
            if (d.rainDays != null && d.rainDays > 15) c = Math.max(0, c - 0.15);
            if (d.avgTemp != null && d.avgTemp > 35) c = Math.max(0, c - 0.10);
            return Math.round(c * 100) / 100;
        });

        // Costo mensile: interpolazione lineare su crowd score
        const costByMonth = adjustedCrowd.map(c =>
            Math.round(costCfg.low + (costCfg.high - costCfg.low) * c)
        );

        // Clima score: temp ottimale [15,28]°C e pioggia < 8gg/mese → score alto
        const climaScore = climateData.map(d => {
            if (d.avgTemp == null) return 0.5;
            let s = 0;
            if (d.avgTemp >= 15 && d.avgTemp <= 28) s += 0.6;
            else if (d.avgTemp >= 10 && d.avgTemp < 15) s += 0.3;
            else if (d.avgTemp > 28 && d.avgTemp <= 35) s += 0.4;
            if (d.rainDays != null && d.rainDays <= 8) s += 0.4;
            else if (d.rainDays != null && d.rainDays <= 14) s += 0.2;
            return Math.min(1, Math.round(s * 100) / 100);
        });

        // Cost score: mesi economici = score alto
        const maxCost = Math.max(...costByMonth);
        const costScore = costByMonth.map(c => Math.round((1 - c / maxCost) * 100) / 100);

        // Seasonal score composito: w1=0.40 clima, w2=0.35 non-crowd, w3=0.25 costo
        const seasonalScore = climaScore.map((cs, i) =>
            Math.round((0.40 * cs + 0.35 * (1 - adjustedCrowd[i]) + 0.25 * costScore[i]) * 100) / 100
        );

        const bestMonths = seasonalScore
            .map((s, i) => ({ month: i, score: s }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(x => x.month);

        const peakMonths = adjustedCrowd
            .map((c, i) => c >= 0.75 ? i : -1)
            .filter(i => i >= 0);

        const bestMonth = bestMonths[0];
        const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        const bestReason = `Ottimo clima (${climateData[bestMonth]?.avgTemp ?? '?'}°C), costi ${costByMonth[bestMonth]}€/gg, folla ridotta`;

        const payload = {
            destination: dest,
            bestMonths,
            crowdScore: adjustedCrowd,
            costByMonth,
            costRange: costCfg,
            climateData,
            seasonalScore,
            peakMonths,
            prediction: {
                bestCombo: {
                    month: bestMonth,
                    monthName: MONTH_NAMES[bestMonth],
                    score: seasonalScore[bestMonth],
                    reason: bestReason,
                    estimatedCost: costByMonth[bestMonth],
                },
            },
        };

        // Salva in cache SQLite
        db.run(
            'INSERT OR REPLACE INTO predictive_cache (destination, data, updated_at) VALUES (?,?,?)',
            [dest, JSON.stringify(payload), now]
        );

        res.json(payload);
    } catch (err) {
        console.error('Predictive API error:', err.message);
        res.status(500).json({ error: 'Errore server' });
    }
});

// ── Behavioral Events API ──────────────────────────────────────────────────────
// POST /api/behavior — riceve implicit feedback da BehavioralTracker.js lato client.
// Usa navigator.sendBeacon quindi il corpo è text/plain con JSON serializzato.
// I dati alimentano il recommendation engine ibrido (HybridRecommender.js).
app.post('/api/behavior', (req, res) => {
    let body = '';
    // sendBeacon manda text/plain, non application/json
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        try {
            const d = JSON.parse(body);
            const sessionId   = String(d.session_id   || '').slice(0, 64);
            const destination = String(d.destination  || '').slice(0, 64);
            if (!sessionId || !destination) return res.status(400).end();

            const timeOnPage  = parseInt(d.time_on_page)  || 0;
            const phaseReached = parseInt(d.phase_reached) || 0;
            const bookingSim  = d.booking_sim_interacted ? 1 : 0;
            const sectionsViewed = JSON.stringify(Array.isArray(d.sections_viewed) ? d.sections_viewed.slice(0, 20) : []);
            const poisClicked    = JSON.stringify(Array.isArray(d.pois_clicked)    ? d.pois_clicked.slice(0, 20)    : []);
            const heatmapMetric  = String(d.heatmap_metric || '').slice(0, 20) || null;
            const userEmail      = req.cookies?.user_email || null;

            db.run(
                `INSERT INTO behavioral_events
                 (user_email, session_id, destination, time_on_page, sections_viewed,
                  pois_clicked, phase_reached, booking_sim_interacted, heatmap_metric)
                 VALUES (?,?,?,?,?,?,?,?,?)`,
                [userEmail, sessionId, destination, timeOnPage, sectionsViewed,
                 poisClicked, phaseReached, bookingSim, heatmapMetric],
                (err) => { if (err) console.error('Behavioral insert error:', err.message); }
            );
            res.status(204).end();
        } catch (_) {
            res.status(400).end();
        }
    });
});

// ── Avvio server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server partito su http://localhost:${PORT}`);
});
