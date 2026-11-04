/**
 * Tour Search Wizard — Coral-style поэтапный UX поверх #tv-*.
 * 5 шагов: Откуда → Куда → Когда → Ночи → Туристы.
 */
(function () {
    'use strict';

    var STEP_COUNT = 5;
    var STEP_LABELS = ['Откуда', 'Куда', 'Когда', 'Ночи', 'Туристы'];
    var STEP_OPEN = ['departure', 'country', 'dates', 'nights', 'tourists'];

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function qsa(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function hasDateRange() {
        var inp = document.getElementById('tv-dates');
        var val = (inp && inp.value || '').trim();
        if (val) {
            var parts = val.split(/\s+(?:по|to)\s+|\s+[-–—]\s+/i);
            if (parts.length >= 2) return true;
        }
        var fp = window.tvDatePicker;
        if (fp && fp.selectedDates && fp.selectedDates.length >= 2) return true;
        var disp = document.getElementById('tv-sc-dates-display');
        var d = (disp && disp.textContent || '').trim();
        return !!(d && d !== 'Даты');
    }

    function hasNightsRange() {
        var nf = typeof window.tvNightsFrom !== 'undefined' ? window.tvNightsFrom : 0;
        var nt = typeof window.tvNightsTo !== 'undefined' ? window.tvNightsTo : 0;
        return nf >= 1 && nt >= nf;
    }

    function TourSearchWizard(root, options) {
        this.root = root;
        this.options = options || {};
        this.step = Math.max(1, Math.min(STEP_COUNT, parseInt(root.getAttribute('data-start-step') || '1', 10) || 1));
        this.depSel = qs('#tv-departure', root) || qs('#tv-departure');
        this.countrySel = qs('#tv-country', root) || qs('#tv-country');
        this.datesDisplay = qs('#tv-sc-dates-display', root) || qs('#tv-sc-dates-display');
        this.nightsText = qs('#tv-nights-summary-text', root) || qs('#tv-nights-summary-text');
        this.touristsText = qs('#tv-tourists-summary-text', root) || qs('#tv-tourists-summary-text');
        this.bind();
        this.go(this.step, true);
    }

    TourSearchWizard.prototype.bind = function () {
        var self = this;

        qsa('[data-thw-goto]', this.root).forEach(function (btn) {
            btn.addEventListener('click', function () {
                var n = parseInt(btn.getAttribute('data-thw-goto'), 10);
                if (!n || n < 1 || n > STEP_COUNT) return;
                self.go(n);
            });
        });

        qsa('[data-thw-next]', this.root).forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (!self.validateCurrent()) return;
                if (self.step < STEP_COUNT) self.go(self.step + 1);
            });
        });

        qsa('[data-thw-back]', this.root).forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (self.step > 1) self.go(self.step - 1);
            });
        });

        var filtersToggle = qs('#th-wizard-toggle-filters', this.root);
        var filtersPanel = qs('#th-wizard-filters-panel', this.root);
        if (filtersToggle && filtersPanel && !filtersToggle.dataset.thwToggleBound) {
            filtersToggle.dataset.thwToggleBound = '1';
            filtersToggle.addEventListener('click', function () {
                var open = filtersPanel.hasAttribute('hidden');
                if (open) {
                    filtersPanel.removeAttribute('hidden');
                    filtersToggle.setAttribute('aria-expanded', 'true');
                    filtersToggle.classList.add('is-open');
                } else {
                    filtersPanel.setAttribute('hidden', '');
                    filtersToggle.setAttribute('aria-expanded', 'false');
                    filtersToggle.classList.remove('is-open');
                }
            });
        }

        if (this.countrySel) {
            this.countrySel.addEventListener('change', function () {
                self.refreshSummary();
            });
        }

        if (this.depSel) {
            this.depSel.addEventListener('change', function () {
                self.refreshSummary();
            });
        }

        document.addEventListener('click', function (e) {
            if (e.target && (e.target.id === 'tv-sc-dates-apply' || (e.target.closest && e.target.closest('#tv-sc-dates-apply')))) {
                setTimeout(function () {
                    self.refreshSummary();
                    if (self.step === 3 && self.validateCurrent()) self.go(4);
                }, 50);
            }
            if (e.target && (e.target.id === 'tv-nights-apply' || (e.target.closest && e.target.closest('#tv-nights-apply')))) {
                setTimeout(function () {
                    self.refreshSummary();
                    if (self.step === 4 && self.validateCurrent()) self.go(5);
                }, 50);
            }
        });

        document.addEventListener('th:wizard-nights-done', function () {
            setTimeout(function () {
                self.refreshSummary();
                if (self.step === 4 && self.validateCurrent()) self.go(5);
            }, 50);
        });
    };

    TourSearchWizard.prototype.openStepModal = function (step) {
        var ui = window.THSearchUI;
        if (!ui) return;
        var key = STEP_OPEN[step - 1];
        if (key === 'country' || key === 'departure') {
            if (typeof ui.openChoice === 'function') ui.openChoice(key);
        } else if (key === 'dates' && typeof ui.openDates === 'function') {
            ui.openDates();
        } else if (key === 'nights' && typeof ui.openNights === 'function') {
            ui.openNights();
        } else if (key === 'tourists' && typeof ui.openTourists === 'function') {
            ui.openTourists();
        }
    };

    TourSearchWizard.prototype.validateCurrent = function () {
        if (this.step === 1) {
            var dep = this.depSel && String(this.depSel.value || '').trim();
            if (!dep) {
                this.shake(qs('[data-th-search-open="departure"]', this.root));
                this.openStepModal(1);
                return false;
            }
        }
        if (this.step === 2) {
            var c = this.countrySel && String(this.countrySel.value || '').trim();
            if (!c) {
                this.shake(qs('[data-th-search-open="country"]', this.root));
                this.openStepModal(2);
                return false;
            }
        }
        if (this.step === 3) {
            if (!hasDateRange()) {
                this.shake(qs('[data-th-search-open="dates"]', this.root));
                this.openStepModal(3);
                return false;
            }
        }
        if (this.step === 4) {
            if (!hasNightsRange()) {
                this.shake(qs('[data-th-search-open="nights"]', this.root));
                this.openStepModal(4);
                return false;
            }
        }
        return true;
    };

    TourSearchWizard.prototype.validateSearchReady = function () {
        for (var s = 1; s <= 4; s++) {
            var prev = this.step;
            this.step = s;
            if (!this.validateCurrent()) {
                this.go(s);
                return false;
            }
            this.step = prev;
        }
        return true;
    };

    TourSearchWizard.prototype.shake = function (el) {
        if (!el) return;
        el.focus && el.focus();
        var target = el.closest ? (el.closest('.th-coral-search__field, .tv-sc-field') || el) : el;
        target.classList.add('th-wizard--shake');
        setTimeout(function () { target.classList.remove('th-wizard--shake'); }, 420);
    };

    TourSearchWizard.prototype.go = function (step, silent) {
        step = Math.max(1, Math.min(STEP_COUNT, step));
        this.step = step;
        this.root.setAttribute('data-step', String(step));

        qsa('.th-wizard__panel', this.root).forEach(function (panel) {
            var id = parseInt(panel.getAttribute('data-panel'), 10);
            panel.classList.toggle('is-active', id === step);
            panel.hidden = id !== step;
        });

        qsa('[data-thw-goto]', this.root).forEach(function (btn) {
            var n = parseInt(btn.getAttribute('data-thw-goto'), 10);
            btn.classList.toggle('is-active', n === step);
            btn.classList.toggle('is-done', n < step);
            btn.setAttribute('aria-current', n === step ? 'step' : 'false');
        });

        qsa('[data-thw-back]', this.root).forEach(function (btn) {
            if (step <= 1) btn.setAttribute('hidden', '');
            else btn.removeAttribute('hidden');
        });

        this.updateStepbar(step);
        try {
            document.body.classList.toggle('th-wizard-active', step >= 1 && step <= STEP_COUNT);
            document.dispatchEvent(new CustomEvent('th:wizard-step', { detail: { step: step, key: STEP_LABELS[step - 1] || '' } }));
        } catch (eEv) {}

        if (!silent) {
            var activeField = qs('.th-wizard__panel.is-active [data-th-search-open]', this.root);
            if (activeField) activeField.focus && activeField.focus();
        }
    };

    TourSearchWizard.prototype.updateStepbar = function (step) {
        var labelEl = document.getElementById('th-wizard-step-label');
        var fillEl = document.querySelector('[data-thw-progress]');
        var name = STEP_LABELS[step - 1] || '';
        if (labelEl) labelEl.textContent = step + ' из ' + STEP_COUNT + ' · ' + name;
        if (fillEl) fillEl.style.width = String(Math.round((step / STEP_COUNT) * 100)) + '%';
    };

    TourSearchWizard.prototype.refreshSummary = function () {
        if (window.THSearchUI && typeof window.THSearchUI.refreshLabels === 'function') {
            window.THSearchUI.refreshLabels();
        }
    };

    function initHomeWizard() {
        var root = document.getElementById('tour-search-section');
        if (!root || !root.classList.contains('th-wizard')) return;
        window.THTourSearchWizard = new TourSearchWizard(root, { mode: 'home' });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHomeWizard);
    } else {
        initHomeWizard();
    }
})();
