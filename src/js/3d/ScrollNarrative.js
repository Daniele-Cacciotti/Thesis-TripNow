/**
 * ScrollNarrative.js
 * Orchestratore scroll-driven per le 7 fasi narrative.
 */

export class ScrollNarrative {
    constructor(scene, wrapper, panels) {
        this.scene          = scene;
        this.wrapper        = wrapper;
        this.panels         = panels || {};
        this._currentPhase  = -1;
        this._gsapLoaded    = false;
        this._scrollHandler = null;
    }

    async init() {
        try {
            await import('../vendor/gsap.min.js');
            await import('../vendor/ScrollTrigger.min.js');

            this._gsap = window.gsap;
            this._ST   = window.ScrollTrigger;

            if (!this._gsap || !this._ST) throw new Error('GSAP globals non trovati');

            this._gsap.registerPlugin(this._ST);
            this._gsapLoaded = true;
            this._buildTimeline();
        } catch (err) {
            this._buildFallbackScroll();
        }

        this._activateWhenVisible();
    }

    _activateWhenVisible() {
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            if (this._currentPhase === -1) {
                this._enterPhase(0, 0);
                this._currentPhase = 0;
            }
        }, { threshold: 0.05 });
        observer.observe(this.wrapper);
    }

    _buildTimeline() {
        this._trigger = this._ST.create({
            trigger:   this.wrapper,
            start:     'top top',
            end:       'bottom bottom',
            scrub:     1.5,
            onUpdate:  (self) => this._onProgress(self.progress),
            onEnter:   ()    => this.wrapper.classList.add('narrative-active'),
            onLeave:   ()    => this.wrapper.classList.remove('narrative-active'),
            onLeaveBack:()   => this.wrapper.classList.remove('narrative-active'),
        });
    }

    _buildFallbackScroll() {
        this._scrollHandler = () => {
            const rect = this.wrapper.getBoundingClientRect();
            const scrollable = this.wrapper.offsetHeight - window.innerHeight;
            if (scrollable <= 0) return;
            const progress = Math.max(0, Math.min(1, -rect.top / scrollable));
            this._onProgress(progress);
        };

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                window.addEventListener('scroll', this._scrollHandler, { passive: true });
            } else {
                window.removeEventListener('scroll', this._scrollHandler);
            }
        }, { threshold: 0 });

        observer.observe(this.wrapper);
        this._fallbackObserver = observer;
    }

    _onProgress(progress) {
        const phase = this._phaseFromProgress(progress);

        this._updateCamera(progress, phase);

        if (phase !== this._currentPhase) {
            this._exitPhase(this._currentPhase);
            this._enterPhase(phase, progress);
            this._currentPhase = phase;
        }

        const bar = this.wrapper.querySelector('.narrative-progress-bar');
        if (bar) bar.style.width = `${progress * 100}%`;

        this.wrapper.querySelectorAll('.phase-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === phase);
        });

        this.wrapper.dispatchEvent(new CustomEvent('narrative:progress', {
            bubbles: true, detail: { progress, phase },
        }));
    }

    _phaseFromProgress(p) {
        if (p < 0.10) return 0;
        if (p < 0.25) return 1;
        if (p < 0.40) return 2;
        if (p < 0.55) return 3;
        if (p < 0.70) return 4;
        if (p < 0.85) return 5;
        return 6;
    }

    _updateCamera(progress, phase) {
        const presets   = ['orbital_far','aerial_medium','aerial_close',
                           'follow_route','top_down','side_view','ground_level'];
        const starts    = [0, 0.10, 0.25, 0.40, 0.55, 0.70, 0.85];
        const ends      = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85, 1.0];
        const intra     = (progress - starts[phase]) / (ends[phase] - starts[phase]);

        this.scene.setCameraPreset(presets[phase], intra);
        this.scene.setPhase(phase);
    }

    _enterPhase(phase) {
        this._hideAllOverlays();

        switch (phase) {
            case 0:
                this._showOverlay('phase-hero');
                this._showEl('.scroll-hint');
                break;
            case 1:
                this._showOverlay('phase-zoom');
                this._hideEl('.scroll-hint');
                if (this.panels.routeWaypoints?.[0]) {
                    this.scene.setMainPOI?.(this.panels.routeWaypoints[0]);
                }
                break;
            case 2:
                this._showOverlay('phase-poi');
                this.scene.setPOIsVisible(true);
                this.scene.clearHeatmap?.();
                break;
            case 3:
                this._showOverlay('phase-route');
                this.scene.setPOIsVisible(true);
                if (this.panels.routeWaypoints?.length) {
                    this.scene.showRoute(this.panels.routeWaypoints);
                }
                break;
            case 4:
                this._showOverlay('phase-heatmap');
                this.scene.setPOIsVisible(true);
                if (this.panels.heatmapData) {
                    this.scene.updateHeatmap(this.panels.heatmapData, 'crowd');
                }
                this._showEl('.heatmap-controls');
                this._setupHeatmapControls();
                break;
            case 5:
                this._showOverlay('phase-recs');
                break;
            case 6:
                this._showOverlay('phase-booking');
                const pp = this.wrapper.querySelector('#predictive-panel');
                if (pp) pp.style.display = 'block';
                this.wrapper.querySelector('.btn-explore-cta')?.classList.add('visible');
                break;
        }
    }

    _exitPhase(phase) {
        if (phase === 3) this.scene.showRoute([]);
        if (phase === 4) {
            this.scene.clearHeatmap?.();
            this._hideEl('.heatmap-controls');
            this.scene.setPOIsVisible(false);
        }
        if (phase === 6) {
            const pp = this.wrapper.querySelector('#predictive-panel');
            if (pp) pp.style.display = 'none';
            this.wrapper.querySelector('.btn-explore-cta')?.classList.remove('visible');
        }
    }

    _showOverlay(id) {
        const el = this.wrapper.querySelector(`#${id}`);
        if (!el) return;
        el.classList.add('visible');
        el.style.opacity = '0';
        requestAnimationFrame(() => {
            el.style.transition = 'opacity 0.5s ease';
            el.style.opacity    = '1';
        });
    }

    _hideAllOverlays() {
        this.wrapper.querySelectorAll('.phase-overlay').forEach(el => {
            el.classList.remove('visible');
            el.style.opacity = '';
        });
    }

    _showEl(selector) {
        const el = this.wrapper.querySelector(selector);
        if (el) el.style.display = 'flex';
    }

    _hideEl(selector) {
        const el = this.wrapper.querySelector(selector);
        if (el) el.style.display = 'none';
    }

    _setupHeatmapControls() {
        const ctrl = this.wrapper.querySelector('.heatmap-controls');
        if (!ctrl || ctrl._initialized) return;
        ctrl._initialized = true;

        ctrl.querySelectorAll('[data-metric]').forEach(btn => {
            btn.addEventListener('click', () => {
                const metric = btn.dataset.metric;
                ctrl.querySelectorAll('[data-metric]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.panels.heatmapData) {
                    this.scene.updateHeatmap(this.panels.heatmapData, metric);
                }
                this.wrapper.dispatchEvent(new CustomEvent('narrative:heatmapMetric', {
                    bubbles: true, detail: { metric },
                }));
            });
        });
    }

    destroy() {
        if (this._trigger)        this._trigger.kill();
        if (this._scrollHandler)  window.removeEventListener('scroll', this._scrollHandler);
        if (this._fallbackObserver) this._fallbackObserver.disconnect();
    }
}