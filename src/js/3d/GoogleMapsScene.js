/**
 * GoogleMapsScene.js
 * Vista 3D fotorealistica tramite Google Maps JavaScript API.
 */

export class GoogleMapsScene {
    constructor(container, config) {
        this.container          = container;
        this.config             = config;
        this.phase              = 0;
        this._map               = null;
        this._mapDiv            = null;
        this._markers           = [];
        this._routeLine         = null;
        this._directionsRenderer = null;
        this._heatmap           = null;
        this._headingDrift      = 0;
        this._mainPOI           = null;
    }

    async init() {
        this._mapDiv = document.createElement('div');
        this._mapDiv.id = 'google-maps-container';
        this._mapDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;';
        this.container.insertBefore(this._mapDiv, this.container.firstChild);

        await this._loadMapsAPI();

        const gestures = this.config.interactive ? 'greedy' : 'none';

        this._map = new google.maps.Map(this._mapDiv, {
            center:            { lat: this.config.lat, lng: this.config.lon },
            zoom:              this.config.zoom || 15,
            tilt:              45,
            heading:           0,
            mapTypeId:         'satellite',
            disableDefaultUI:  !this.config.interactive,
            gestureHandling:   gestures,
            keyboardShortcuts: false,
            
            // FIX: Questo solleva tutti i bottoni "BOTTOM" di 40px dal fondo della mappa,
            // allineandoli perfettamente e staccandoli dal pannello inferiore!
            padding: { bottom: 50 },

            // --- Controlli lato DESTRO ---
            zoomControl: this.config.interactive,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            streetViewControl: this.config.interactive,
            streetViewControlOptions: {
                position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            fullscreenControl: this.config.interactive,
            fullscreenControlOptions: {
                position: google.maps.ControlPosition.RIGHT_TOP,
            },

            // --- Controlli lato SINISTRO ---
            tiltControl: this.config.interactive,
            tiltControlOptions: {
                position: google.maps.ControlPosition.LEFT_BOTTOM,
            },
            rotateControl: this.config.interactive,
            rotateControlOptions: {
                position: google.maps.ControlPosition.LEFT_BOTTOM,
            },

            mapTypeControl: false, 
        });

        if (!this.config.interactive) {
            this._driftInterval = setInterval(() => {
                if (this._map && this.phase <= 1) {
                    this._headingDrift = (this._headingDrift + 0.15) % 360;
                    this._map.moveCamera({ heading: this._headingDrift });
                }
            }, 50);
        }
    }

    _loadMapsAPI() {
        if (window.google?.maps) return Promise.resolve();
        const key = window.GOOGLE_MAPS_KEY
            || document.querySelector('meta[name="google-maps-key"]')?.content
            || '';
        if (!key) return Promise.reject(new Error('GOOGLE_MAPS_KEY non definita'));

        return new Promise((resolve, reject) => {
            window._tripnowGmCb = resolve;
            const s = document.createElement('script');
            s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=visualization&callback=_tripnowGmCb&loading=async`;
            s.onerror = () => reject(new Error('Google Maps API non raggiungibile'));
            document.head.appendChild(s);
        });
    }

    setCameraPreset(name, progress = 1) {
        if (!this._map) return;

        const PRESETS = {
            orbital_far:   { zoom: 15, tilt: 45, heading: null },
            aerial_medium: { zoom: 18, tilt: 60, heading: 20   },
            aerial_close:  { zoom: 16, tilt: 50, heading: 50   },
            follow_route:  { zoom: 15, tilt: 55, heading: 90   },
            top_down:      { zoom: 15, tilt: 30, heading: 0    },
            side_view:     { zoom: 16, tilt: 67, heading: 140  },
            ground_level:  { zoom: 19, tilt: 67, heading: 200  },
        };

        const p = PRESETS[name];
        if (!p) return;

        const heading = p.heading !== null
            ? p.heading + progress * 12
            : this._headingDrift;

        const usePOI = name === 'aerial_medium' && this._mainPOI;
        const centerLat = usePOI ? this._mainPOI.lat : this.config.lat;
        const centerLng = usePOI ? this._mainPOI.lon : this.config.lon;

        this._map.moveCamera({
            center:  { lat: centerLat, lng: centerLng },
            zoom:    p.zoom,
            tilt:    p.tilt,
            heading,
        });
    }

    setMainPOI(poi) { this._mainPOI = poi; }
    setPhase(phase) { this.phase = phase; }

    setPOIsVisible(visible) {
        this._markers.forEach(m => m.setMap(visible ? this._map : null));
    }

    addPOI(poi) { this._addMarker(poi, null); }
    addPOIWithClick(poi, onClickCallback) { this._addMarker(poi, onClickCallback); }

    _addMarker(poi, onClickCallback) {
        if (!this._map || poi.lat == null || poi.lon == null) return;

        const marker = new google.maps.Marker({
            position: { lat: poi.lat, lng: poi.lon },
            title:    poi.name,
            icon: {
                path:         google.maps.SymbolPath.CIRCLE,
                scale:        10,
                fillColor:    this.config.accentColor || '#FF6F61',
                fillOpacity:  1,
                strokeColor:  '#ffffff',
                strokeWeight: 2,
            },
            label: {
                text:     poi.icon,
                fontSize: '16px',
                color:    '#ffffff',
            },
            map: null,
        });

        const iw = new google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif;padding:6px 10px;min-width:120px;">
                        <b style="font-size:14px">${poi.icon} ${poi.name}</b>
                        ${poi.category ? `<br><small style="color:#888">${poi.category}</small>` : ''}
                      </div>`,
        });
        marker.addListener('click', () => {
            iw.open(this._map, marker);
            if (onClickCallback) onClickCallback(poi, marker);
        });

        marker._poiCategory = poi.category || '';
        marker._poi = poi;
        this._markers.push(marker);
    }

    filterPOIsByCategory(categories) {
        const all = categories.length === 0;
        this._markers.forEach(m => {
            const show = all || categories.includes(m._poiCategory);
            m.setMap(show ? this._map : null);
        });
    }

    showRoute(waypoints) {
        if (this._routeLine) { this._routeLine.setMap(null); this._routeLine = null; }
        if (this._directionsRenderer) {
            this._directionsRenderer.setMap(null);
            this._directionsRenderer = null;
        }
        if (!waypoints?.length) return;

        const pts = waypoints.filter(w => w.lat != null && w.lon != null);
        if (pts.length < 2) return;

        if (window.google?.maps?.DirectionsService) {
            this._showRouteOnRoads(pts);
        } else {
            this._showRouteFallback(pts);
        }
    }

    _showRouteOnRoads(pts) {
        const service  = new google.maps.DirectionsService();
        const renderer = new google.maps.DirectionsRenderer({
            map:              this._map,
            suppressMarkers:  true,
            polylineOptions: {
                strokeColor:   this.config.accentColor || '#FF6F61',
                strokeOpacity: 0.8,
                strokeWeight:  6, 
            },
        });

        const origin      = { lat: pts[0].lat, lng: pts[0].lon };
        const destination = { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lon };
        const waypts      = pts.slice(1, -1).slice(0, 6).map(p => ({
            location: { lat: p.lat, lng: p.lon },
            stopover: true,
        }));

        service.route({
            origin,
            destination,
            waypoints:          waypts,
            travelMode:         google.maps.TravelMode.WALKING,
            optimizeWaypoints:  false,
        }, (result, status) => {
            if (status === 'OK') {
                renderer.setDirections(result);
                this._directionsRenderer = renderer;
            } else {
                renderer.setMap(null);
                this._showRouteFallback(pts);
            }
        });
    }

    _showRouteFallback(pts) {
        this._routeLine = new google.maps.Polyline({
            path:          pts.map(w => ({ lat: w.lat, lng: w.lon })),
            geodesic:      true,
            strokeColor:   this.config.accentColor || '#FF6F61',
            strokeOpacity: 0.9,
            strokeWeight:  4,
            icons: [{
                icon:   { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                offset: '50%',
            }],
            map: this._map,
        });
    }

    clearHeatmap() {
        if (this._heatmap) { this._heatmap.setMap(null); this._heatmap = null; }
    }

    updateHeatmap(monthScores) {
        if (!this._map || !window.google?.maps?.visualization) return;
        this.clearHeatmap();

        const avg = monthScores.reduce((a, b) => a + b, 0) / monthScores.length;
        const pts = [];

        const poisWithCoords = this._markers.map(m => m._poi).filter(p => p?.lat != null && p?.lon != null);
        const sources = poisWithCoords.length > 0 ? poisWithCoords : [{ lat: this.config.lat, lon: this.config.lon }];

        sources.forEach(poi => {
            pts.push({
                location: new google.maps.LatLng(poi.lat, poi.lon),
                weight: avg * 10,
            });
            const offsets = [
                [ 0.0004,  0.0002], [-0.0003,  0.0005],
                [ 0.0002, -0.0004], [-0.0005, -0.0002],
            ];
            offsets.forEach(([dlat, dlon]) => {
                pts.push({
                    location: new google.maps.LatLng(poi.lat + dlat, poi.lon + dlon),
                    weight: avg * 3,
                });
            });
        });

        this._heatmap = new google.maps.visualization.HeatmapLayer({
            data:    pts,
            map:     this._map,
            radius:  50,
            opacity: 0.7,
            maxIntensity: 15,
            gradient: [
                'rgba(56, 189, 248, 0)',   
                'rgba(56, 189, 248, 0.8)', 
                'rgba(52, 211, 153, 1)',   
                'rgba(244, 200, 66, 1)',   
                'rgba(255, 111, 97, 1)',   
            ],
        });
    }

    destroy() {
        if (this._driftInterval) clearInterval(this._driftInterval);
        this.clearHeatmap();
        if (this._directionsRenderer) {
            this._directionsRenderer.setMap(null);
            google.maps.event.clearInstanceListeners(this._directionsRenderer);
        }
        if (this._routeLine) this._routeLine.setMap(null);
        this._markers.forEach(m => {
            m.setMap(null);
            google.maps.event.clearInstanceListeners(m);
        });
        this._markers = [];
    }
}