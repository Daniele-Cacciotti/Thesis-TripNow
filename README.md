# TripNow — Full-Stack Travel-Planning Platform

TripNow is a full-stack web application that guides a user from **discovering a destination** to **building a complete travel itinerary**. It was developed as a **bachelor's thesis project** in Computer Engineering at Sapienza University of Rome, together with a coursemate.

The application combines an interactive map experience, an AI-powered itinerary generator, a route optimizer between cities, and a set of travel utilities (flights, weather, climate, currency), on top of a REST API backend with user accounts and data persistence.

> **Note on scope:** This is an academic project built for learning purposes. It is not intended as a production-grade product, and some features (e.g. authentication and security) were implemented at a basic, educational level.

---

## Mission

**Make every trip accessible, inspiring and personalized.**

TripNow was built to bridge the gap between inspiration and action: planning a trip from scratch is hard, so the platform brings destination content, interactive tools and a smooth visual experience together in one place — helping the user go from discovering a place to leaving with a concrete plan.

---

## Features

- **Interactive map exploration** — destinations and points of interest rendered with the Google Maps and Leaflet APIs, with category filters and a walking-route builder.
- **AI itinerary generator** — generates a day-by-day itinerary through an LLM (via an external API), streamed to the browser in real time using **Server-Sent Events (SSE)**.
- **Route optimizer** — computes an efficient path across multiple cities using a **Traveling Salesman heuristic** (multi-start nearest-neighbor with 2-opt improvement), implemented from scratch in JavaScript.
- **Content-based recommendations** — a simple recommender that suggests destinations using **cosine similarity** over destination tags, combined with basic behavioral signals.
- **Travel utilities** — live flight search (Amadeus / alternative providers), weather forecasts (OpenWeatherMap), historical climate charts (Open-Meteo), and a currency converter.
- **User accounts** — registration and login, personal favorites, and profile management.
- **Progressive Web App** — offline support via a Service Worker (cache-first for assets, network-first for API calls).

---

## Tech Stack

**Frontend**
- JavaScript (vanilla, no framework)
- HTML & CSS
- Three.js (3D destination scenes), Google Maps API, Leaflet, Chart.js

**Backend**
- Node.js + Express
- SQLite (via `sqlite3`)
- REST API, Server-Sent Events for streaming

**External APIs**
- Groq (LLM itinerary generation)
- OpenWeatherMap, Open-Meteo (weather & climate)
- Amadeus (flight search)

---

## Architecture Overview

```
Browser (vanilla JS front-end, PWA)
   │
   │  REST calls + Server-Sent Events
   ▼
Express server (Node.js)
   │
   ├── SQLite database  (users, favorites, behavioral events, cache)
   ├── External API proxies (weather, flights, currency) — keys kept server-side
   └── LLM streaming endpoint (Groq) — forwarded to client over SSE
```

The server also acts as a **proxy** for third-party APIs, so that secret API keys are never exposed to the browser.

---

## Authors & My Role

TripNow was developed by **Michael Ciotti** and **Daniele Cacciotti** as a collaborative thesis project.

Within the collaboration, I (Daniele) focused mainly on the **JavaScript and front-end** development — the client-side application logic, the map and itinerary interfaces, the real-time SSE consumption, and connecting the different parts of the app into a single working product. The backend, database and security features were built collaboratively as part of the coursework.

---

## Getting Started

### Prerequisites
- Node.js (v18 or newer recommended)
- A Google Maps JavaScript API key
- API keys for the external services you want to enable (see below)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Daniele-Cacciotti/<repo-name>.git
cd <repo-name>

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
#    then edit .env and add your own keys

# 4. Add your Google Maps key
#    edit src/js/config.js and replace the placeholder with your key

# 5. Start the server
node server.js
```

The server runs on the port defined in `.env` (default `8080`). Open the site through a local web server (e.g. Live Server) so that the front-end can reach the API.

### Configuration notes
- All secret keys live in `.env` (see `.env.example` for the full list). This file is **not** committed.
- The **Google Maps** key is a client-side key and lives in `src/js/config.js`. Restrict it by HTTP referrer in the Google Cloud Console before any public deployment.
- Most features **degrade gracefully**: if an API key is missing, that feature shows a fallback or an informative message instead of crashing.

---

## Project Status

Academic / portfolio project — feature-complete for the thesis scope and not actively maintained. Feedback is welcome.

## License

Released for educational and portfolio purposes.
