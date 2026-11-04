/**
 * Travel Hub — компактный поиск (Coral-style UI поверх #tv-*).
 * Источник истины: #tv-departure, #tv-country, #tv-dates, tvAdultsCount, tvNightsFrom/To.
 */
(function () {
    'use strict';

    var HISTORY_KEY = 'th_search_history_v1';
    var HISTORY_MAX = 3;
    var FILTER_TYPES = ['meal', 'region', 'category'];
    var FILTER_META = {
        meal: { title: 'Питание', placeholder: 'Любое', search: true },
        region: { title: 'Курорт', placeholder: 'Любой', search: true },
        category: { title: 'Звёзды отеля', placeholder: 'Любая', search: false }
    };

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function qsa(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function textOfSelect(sel) {
        if (!sel || !sel.options || sel.selectedIndex < 0) return '';
        var opt = sel.options[sel.selectedIndex];
        return (opt && opt.textContent || '').replace(/^—\s*/, '').trim();
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
        return false;
    }

    function THSearchUI(root) {
        this.root = root;
        this.depSel = document.getElementById('tv-departure');
        this.countrySel = document.getElementById('tv-country');
        this.datesDisplay = document.getElementById('tv-sc-dates-display');
        this.touristsText = document.getElementById('tv-tourists-summary-text');
        this.labelCountry = qs('[data-th-label="country"]', root);
        this.labelDates = qs('[data-th-label="dates"]', root);
        this.labelTourists = qs('[data-th-label="tourists"]', root);
        this.labelDeparture = qs('[data-th-label="departure"]', root);
        this.openModalId = null;
        this.filterDraft = {};
        this.choiceDraft = {};
        this.buildChoiceModals();
        this.buildFilterModals();
        this.bind();
        this.refreshLabels();
        this.refreshFilterLabels();
        this.renderHistory();
    }

    THSearchUI.prototype.buildChoiceModals = function () {
        var self = this;
        ['country', 'departure'].forEach(function (type) {
            var sheet = document.createElement('div');
            sheet.id = 'th-search-' + type + '-sheet';
            sheet.className = 'th-search-choice-sheet hidden';
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-modal', 'true');
            sheet.innerHTML =
                '<div class="th-search-choice-sheet__backdrop" data-th-close="' + type + '"></div>' +
                '<div class="th-search-choice-sheet__panel">' +
                '<div class="th-search-choice-sheet__head">' +
                '<div class="th-search-choice-sheet__head-main">' +
                '<span class="th-search-choice-sheet__eyebrow">Travel Hub</span>' +
                '<span class="th-search-choice-sheet__title">' + (type === 'country' ? 'Куда летим?' : 'Откуда вылет?') + '</span>' +
                '</div>' +
                '<button type="button" class="th-search-choice-sheet__close" data-th-close="' + type + '" aria-label="Закрыть">' +
                '<i class="fas fa-times" aria-hidden="true"></i></button>' +
                '</div>' +
                '<div class="th-search-choice-sheet__search">' +
                '<i class="fas fa-search th-search-choice-sheet__search-ico" aria-hidden="true"></i>' +
                '<input type="search" placeholder="' + (type === 'country' ? 'Найти страну…' : 'Найти город…') + '" autocomplete="off" data-th-search-input="' + type + '">' +
                '</div>' +
                '<div class="th-search-choice-sheet__body">' +
                '<div class="th-search-choice-sheet__list" data-th-list="' + type + '"></div>' +
                '</div>' +
                (type === 'departure'
                    ? '<button type="button" class="th-search-choice-sheet__apply" data-th-choice-apply="' + type + '">' +
                      '<i class="fas fa-check" aria-hidden="true"></i> Применить</button>'
                    : '') +
                '</div>';
            document.body.appendChild(sheet);
            sheet.querySelector('[data-th-search-input="' + type + '"]').addEventListener('input', function () {
                self.renderChoiceList(type, this.value);
            });
            qsa('[data-th-close="' + type + '"]', sheet).forEach(function (el) {
                el.addEventListener('click', function () { self.closeChoice(type, true); });
            });
            var choiceApply = sheet.querySelector('[data-th-choice-apply="' + type + '"]');
            if (choiceApply) {
                choiceApply.addEventListener('click', function () { self.commitChoice(type); });
            }
        });
    };

    THSearchUI.prototype.getFilterSelect = function (type) {
        return document.getElementById('tv-' + type);
    };

    THSearchUI.prototype.buildFilterModals = function () {
        var self = this;
        FILTER_TYPES.forEach(function (type) {
            var meta = FILTER_META[type];
            var sheet = document.createElement('div');
            sheet.id = 'th-search-' + type + '-sheet';
            sheet.className = 'th-search-choice-sheet th-search-filter-sheet hidden';
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-modal', 'true');
            var searchBlock = meta.search
                ? '<div class="th-search-choice-sheet__search">' +
                '<i class="fas fa-search th-search-choice-sheet__search-ico" aria-hidden="true"></i>' +
                '<input type="search" placeholder="Найти…" autocomplete="off" data-th-filter-search="' + type + '">' +
                '</div>'
                : '';
            sheet.innerHTML =
                '<div class="th-search-choice-sheet__backdrop" data-th-filter-close="' + type + '"></div>' +
                '<div class="th-search-choice-sheet__panel">' +
                '<div class="th-search-choice-sheet__head">' +
                '<div class="th-search-choice-sheet__head-main">' +
                '<span class="th-search-choice-sheet__eyebrow">Travel Hub</span>' +
                '<span class="th-search-choice-sheet__title">' + meta.title + '</span>' +
                '</div>' +
                '<button type="button" class="th-search-choice-sheet__close" data-th-filter-close="' + type + '" aria-label="Закрыть">' +
                '<i class="fas fa-times" aria-hidden="true"></i></button>' +
                '</div>' +
                searchBlock +
                '<div class="th-search-choice-sheet__body">' +
                '<div class="th-search-choice-sheet__list" data-th-filter-list="' + type + '"></div>' +
                '</div>' +
                '<button type="button" class="th-search-choice-sheet__apply" data-th-filter-apply="' + type + '">' +
                '<i class="fas fa-check" aria-hidden="true"></i> Применить</button>' +
                '</div>';
            document.body.appendChild(sheet);

            var searchInp = sheet.querySelector('[data-th-filter-search="' + type + '"]');
            if (searchInp) {
                searchInp.addEventListener('input', function () {
                    self.renderFilterList(type, this.value);
                });
            }
            qsa('[data-th-filter-close="' + type + '"]', sheet).forEach(function (el) {
                el.addEventListener('click', function () { self.closeFilter(type, true); });
            });
            var applyBtn = sheet.querySelector('[data-th-filter-apply="' + type + '"]');
            if (applyBtn) {
                applyBtn.addEventListener('click', function () { self.applyFilter(type); });
            }
        });
    };

    THSearchUI.prototype.renderFilterList = function (type, filter) {
        var listEl = document.querySelector('[data-th-filter-list="' + type + '"]');
        var sel = this.getFilterSelect(type);
        if (!listEl || !sel) return;

        var q = String(filter || '').toLowerCase().trim();
        var items = [];
        for (var i = 0; i < sel.options.length; i++) {
            var opt = sel.options[i];
            var id = String(opt.value || '');
            var name = (opt.textContent || '').trim() || FILTER_META[type].placeholder;
            if (q && name.toLowerCase().indexOf(q) === -1) continue;
            items.push({ id: id, name: name });
        }

        if (!items.length) {
            listEl.innerHTML = '<p class="th-search-choice-sheet__empty">Ничего не найдено</p>';
            return;
        }

        var current = String(this.filterDraft[type] != null ? this.filterDraft[type] : sel.value || '');
        listEl.innerHTML = items.map(function (it) {
            var selCls = it.id === current ? ' is-selected' : '';
            var check = it.id === current ? '<i class="fas fa-check th-search-choice-sheet__item-check" aria-hidden="true"></i>' : '';
            return '<button type="button" class="th-search-choice-sheet__item' + selCls + '" data-id="' + escapeHtml(it.id) + '">' +
                '<span class="th-search-choice-sheet__item-text">' + escapeHtml(it.name) + '</span>' + check + '</button>';
        }).join('');

        var self = this;
        listEl.querySelectorAll('.th-search-choice-sheet__item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                self.filterDraft[type] = btn.getAttribute('data-id');
                self.renderFilterList(type, filter);
            });
        });
    };

    THSearchUI.prototype.applyFilter = function (type) {
        var sel = this.getFilterSelect(type);
        if (!sel) return;
        var draft = this.filterDraft[type];
        if (draft == null) draft = sel.value || '';
        sel.value = draft;
        try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {
            if (typeof Event === 'function') {
                var ev = document.createEvent('Event');
                ev.initEvent('change', true, true);
                sel.dispatchEvent(ev);
            }
        }
        this.refreshFilterLabels();
        this.closeFilter(type, false);
    };

    THSearchUI.prototype._openFilterSheet = function (type) {
        var sheet = document.getElementById('th-search-' + type + '-sheet');
        var sel = this.getFilterSelect(type);
        if (!sheet || !sel) return;
        this.closeAll();
        this.filterDraft[type] = sel.value || '';
        sheet.classList.remove('hidden');
        sheet.classList.add('is-open');
        this.openModalId = 'filter:' + type;
        document.body.classList.add('th-modal-open');
        if (window.THMobile && typeof window.THMobile.lockScroll === 'function') {
            window.THMobile.lockScroll(true);
        }
        this.renderFilterList(type, '');
        var inp = sheet.querySelector('[data-th-filter-search="' + type + '"]');
        if (inp) {
            inp.value = '';
            setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
        }
    };

    THSearchUI.prototype.openFilter = function (type) {
        var self = this;
        if (type === 'region') {
            var regionSel = this.getFilterSelect('region');
            if (regionSel && regionSel.options.length <= 1 && typeof window.loadTvRegions === 'function') {
                window.loadTvRegions().finally(function () { self._openFilterSheet(type); });
                return;
            }
        }
        this._openFilterSheet(type);
    };

    THSearchUI.prototype.closeFilter = function (type, revert) {
        var sheet = document.getElementById('th-search-' + type + '-sheet');
        if (!sheet) return;
        if (revert) delete this.filterDraft[type];
        sheet.classList.add('hidden');
        sheet.classList.remove('is-open');
        if (this.openModalId === 'filter:' + type) this.openModalId = null;
        if (!this.isAnyPopupOpen()) {
            document.body.classList.remove('th-modal-open');
            if (window.THMobile && typeof window.THMobile.lockScroll === 'function') {
                window.THMobile.lockScroll(false);
            }
        }
    };

    THSearchUI.prototype.refreshFilterLabels = function () {
        var self = this;
        FILTER_TYPES.forEach(function (type) {
            var sel = self.getFilterSelect(type);
            var label = textOfSelect(sel) || FILTER_META[type].placeholder;
            qsa('[data-th-filter-label="' + type + '"]', self.root).forEach(function (el) {
                el.textContent = label;
                el.classList.toggle('is-placeholder', !sel || !String(sel.value || '').trim());
            });
        });
    };

    THSearchUI.prototype.renderChoiceList = function (type, filter) {
        var listEl = document.querySelector('[data-th-list="' + type + '"]');
        var sel = type === 'country' ? this.countrySel : this.depSel;
        if (!listEl || !sel) return;

        var q = String(filter || '').toLowerCase().trim();
        var items = [];
        for (var i = 0; i < sel.options.length; i++) {
            var opt = sel.options[i];
            var id = String(opt.value || '').trim();
            if (!id) continue;
            var name = (opt.textContent || '').trim();
            if (q && name.toLowerCase().indexOf(q) === -1) continue;
            items.push({ id: id, name: name });
        }

        if (!items.length) {
            listEl.innerHTML = '<p class="th-search-choice-sheet__empty">Ничего не найдено</p>';
            return;
        }

        var current = String(this.choiceDraft[type] != null ? this.choiceDraft[type] : sel.value || '');
        listEl.innerHTML = items.map(function (it) {
            var selCls = it.id === current ? ' is-selected' : '';
            var check = it.id === current ? '<i class="fas fa-check th-search-choice-sheet__item-check" aria-hidden="true"></i>' : '';
            return '<button type="button" class="th-search-choice-sheet__item' + selCls + '" data-id="' + escapeHtml(it.id) + '">' +
                '<span class="th-search-choice-sheet__item-text">' + escapeHtml(it.name) + '</span>' + check + '</button>';
        }).join('');

        var self = this;
        var searchInp = document.querySelector('[data-th-search-input="' + type + '"]');
        var filterQ = searchInp ? searchInp.value : filter;
        listEl.querySelectorAll('.th-search-choice-sheet__item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-id');
                if (!id) return;
                self.choiceDraft[type] = id;
                if (type === 'country' || type === 'departure') {
                    self.commitChoice(type);
                    return;
                }
                self.renderChoiceList(type, filterQ);
            });
        });
    };

    THSearchUI.prototype.commitChoice = function (type) {
        var id = this.choiceDraft[type];
        var sel = type === 'country' ? this.countrySel : this.depSel;
        if (!sel || !id) return;
        sel.value = id;
        try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {
            if (typeof Event === 'function') {
                var ev = document.createEvent('Event');
                ev.initEvent('change', true, true);
                sel.dispatchEvent(ev);
            }
        }
        this.refreshLabels();
        this.closeChoice(type, false);
        this.clearFieldError(type === 'country' ? 'country' : 'departure');
    };

    THSearchUI.prototype.applyChoice = function (type, id) {
        this.choiceDraft[type] = id;
        this.commitChoice(type);
    };

    THSearchUI.prototype.openChoice = function (type) {
        var sheet = document.getElementById('th-search-' + type + '-sheet');
        var sel = type === 'country' ? this.countrySel : this.depSel;
        if (!sheet) return;
        this.closeAll();
        this.choiceDraft[type] = sel ? (sel.value || '') : '';
        sheet.classList.remove('hidden');
        sheet.classList.add('is-open');
        this.openModalId = type;
        document.body.classList.add('th-modal-open');
        if (window.THMobile && typeof window.THMobile.lockScroll === 'function') {
            window.THMobile.lockScroll(true);
        }
        this.renderChoiceList(type, '');
        var inp = sheet.querySelector('[data-th-search-input="' + type + '"]');
        if (inp) {
            inp.value = '';
            setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
        }
        var overlay = document.getElementById('tv-sc-overlay');
        if (overlay) {
            var self = this;
            overlay.style.display = 'block';
            overlay._onClose = function () { self.closeChoice(type, true); };
        }
    };

    THSearchUI.prototype.closeChoice = function (type, revert) {
        var sheet = document.getElementById('th-search-' + type + '-sheet');
        if (!sheet) return;
        if (revert) delete this.choiceDraft[type];
        sheet.classList.add('hidden');
        sheet.classList.remove('is-open');
        if (this.openModalId === type) this.openModalId = null;
        if (!this.isAnyPopupOpen()) {
            document.body.classList.remove('th-modal-open');
            if (window.THMobile && typeof window.THMobile.lockScroll === 'function') {
                window.THMobile.lockScroll(false);
            }
        }
        var overlay = document.getElementById('tv-sc-overlay');
        if (overlay && !this.isAnyPopupOpen()) {
            overlay.style.display = 'none';
            overlay._onClose = null;
        }
    };

    THSearchUI.prototype.isAnyPopupOpen = function () {
        var dp = document.getElementById('tv-sc-date-popup');
        if (dp && dp.style.display !== 'none' && dp.style.display !== '') return true;
        var tb = document.getElementById('tv-tourists-block');
        if (tb && !tb.classList.contains('hidden')) return true;
        var np = document.getElementById('tv-nights-popup');
        if (np && np.classList.contains('is-open')) return true;
        if (qsa('.th-search-choice-sheet.is-open').length) return true;
        return false;
    };

    THSearchUI.prototype.closeAll = function () {
        ['country', 'departure'].forEach(function (t) {
            var sheet = document.getElementById('th-search-' + t + '-sheet');
            if (sheet) {
                sheet.classList.add('hidden');
                sheet.classList.remove('is-open');
            }
            delete this.choiceDraft[t];
        }, this);
        FILTER_TYPES.forEach(function (t) {
            this.closeFilter(t, true);
        }, this);
        this.openModalId = null;
    };

    THSearchUI.prototype.openDates = function () {
        var self = this;
        window.setTimeout(function () {
            if (typeof window.__thWizardOpenDatePopup === 'function') {
                window.__thWizardOpenDatePopup();
                return;
            }
            var btn = document.getElementById('tv-sc-dates-btn');
            if (btn) btn.click();
        }, 0);
    };

    THSearchUI.prototype.openTourists = function () {
        window.setTimeout(function () {
            if (typeof window.__thWizardOpenTouristsPopup === 'function') {
                window.__thWizardOpenTouristsPopup();
                return;
            }
            var trigger = document.getElementById('tv-tourists-trigger');
            if (trigger) trigger.click();
        }, 0);
    };

    THSearchUI.prototype.openNights = function () {
        window.setTimeout(function () {
            if (typeof window.__thWizardOpenNightsPopup === 'function') {
                window.__thWizardOpenNightsPopup();
                return;
            }
            var btn = document.getElementById('tv-nights-summary');
            if (btn) btn.click();
        }, 0);
    };

    THSearchUI.prototype.openFilters = function () {
        if (typeof window.openTvFiltersModal === 'function') {
            window.openTvFiltersModal();
        } else {
            var btn = document.getElementById('tv-filters-modal-open');
            if (btn) btn.click();
        }
    };

    THSearchUI.prototype.setLabel = function (el, text, placeholder) {
        if (!el) return;
        var t = String(text || '').trim();
        el.textContent = t || placeholder;
        el.classList.toggle('is-placeholder', !t || t === placeholder);
    };

    THSearchUI.prototype.refreshLabels = function () {
        var country = textOfSelect(this.countrySel);
        var dep = textOfSelect(this.depSel);
        var dates = (this.datesDisplay && this.datesDisplay.textContent || '').trim();
        var who = (this.touristsText && this.touristsText.textContent || '').trim();

        qsa('[data-th-label="country"]', this.root).forEach(function (el) {
            el.textContent = country || 'Выберите страну';
            el.classList.toggle('is-placeholder', !country);
        });
        qsa('[data-th-label="departure"]', this.root).forEach(function (el) {
            el.textContent = dep || 'Город вылета';
            el.classList.toggle('is-placeholder', !dep);
        });
        qsa('[data-th-label="dates"]', this.root).forEach(function (el) {
            var ok = dates && dates !== 'Даты';
            el.textContent = ok ? dates : 'Выберите даты';
            el.classList.toggle('is-placeholder', !ok);
        });
        qsa('[data-th-label="tourists"]', this.root).forEach(function (el) {
            el.textContent = who || '2 взрослых';
            el.classList.toggle('is-placeholder', !who);
        });
        var nightsEl = document.getElementById('tv-nights-summary-text');
        var nights = (nightsEl && nightsEl.textContent || '').trim();
        qsa('[data-th-label="nights"]', this.root).forEach(function (el) {
            el.textContent = nights || '6–9 ночей';
        });
    };

    THSearchUI.prototype.clearFieldError = function (field) {
        qsa('[data-th-search-open="' + field + '"]', this.root).forEach(function (el) {
            el.classList.remove('is-error');
        });
    };

    THSearchUI.prototype.markFieldError = function (field) {
        qsa('[data-th-search-open="' + field + '"]', this.root).forEach(function (el) {
            el.classList.add('is-error');
        });
    };

    THSearchUI.prototype.validate = function () {
        var ok = true;
        if (!this.countrySel || !String(this.countrySel.value || '').trim()) {
            this.markFieldError('country');
            this.openChoice('country');
            ok = false;
        } else {
            this.clearFieldError('country');
        }
        if (!this.depSel || !String(this.depSel.value || '').trim()) {
            this.markFieldError('departure');
            if (ok) this.openChoice('departure');
            ok = false;
        } else {
            this.clearFieldError('departure');
        }
        if (!hasDateRange()) {
            this.markFieldError('dates');
            if (ok) this.openDates();
            ok = false;
        } else {
            this.clearFieldError('dates');
        }
        return ok;
    };

    THSearchUI.prototype.collectSnapshot = function () {
        return {
            countryId: this.countrySel && this.countrySel.value || '',
            countryName: textOfSelect(this.countrySel),
            departureId: this.depSel && this.depSel.value || '',
            departureName: textOfSelect(this.depSel),
            dates: (this.datesDisplay && this.datesDisplay.textContent || '').trim(),
            tourists: (this.touristsText && this.touristsText.textContent || '').trim(),
            meal: (document.getElementById('tv-meal') || {}).value || '',
            region: (document.getElementById('tv-region') || {}).value || '',
            category: (document.getElementById('tv-category') || {}).value || '',
            ts: Date.now()
        };
    };

    THSearchUI.prototype.saveHistory = function () {
        try {
            var snap = this.collectSnapshot();
            if (!snap.countryId) return;
            var list = [];
            try { list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) {}
            if (!Array.isArray(list)) list = [];
            list = list.filter(function (item) {
                return !(String(item.countryId) === String(snap.countryId) &&
                    String(item.departureId) === String(snap.departureId) &&
                    item.dates === snap.dates);
            });
            list.unshift(snap);
            list = list.slice(0, HISTORY_MAX);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
            this.renderHistory();
        } catch (e) {}
    };

    THSearchUI.prototype.renderHistory = function () {
        var wrap = document.getElementById('th-search-history');
        if (!wrap) return;
        var list = [];
        try { list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) {}
        if (!Array.isArray(list) || !list.length) {
            wrap.hidden = true;
            return;
        }
        wrap.hidden = false;
        var listEl = wrap.querySelector('.th-coral-search__history-list');
        if (!listEl) return;
        var self = this;
        listEl.innerHTML = list.map(function (item, idx) {
            var label = [item.countryName, item.dates, item.departureName].filter(Boolean).join(' · ');
            return '<button type="button" class="th-coral-search__history-chip" data-idx="' + idx + '">' + escapeHtml(label) + '</button>';
        }).join('');
        listEl.querySelectorAll('.th-coral-search__history-chip').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(btn.getAttribute('data-idx'), 10);
                self.restoreHistory(idx);
            });
        });
    };

    THSearchUI.prototype.restoreHistory = function (idx) {
        var list = [];
        try { list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) {}
        var item = list[idx];
        if (!item) return;
        if (this.depSel && item.departureId) {
            this.depSel.value = String(item.departureId);
            try { this.depSel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        }
        if (this.countrySel && item.countryId) {
            this.countrySel.value = String(item.countryId);
            try { this.countrySel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        }
        this.refreshLabels();
        var self = this;
        setTimeout(function () {
            if (typeof performTvSearch === 'function') performTvSearch(true);
        }, 400);
    };

    THSearchUI.prototype.onSearchClick = function () {
        if (!this.validate()) return;
        this.saveHistory();
        if (typeof performTvSearch === 'function') {
            performTvSearch(true);
        }
    };

    THSearchUI.prototype.bind = function () {
        var self = this;

        qsa('[data-th-search-open]', this.root).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var target = btn.getAttribute('data-th-search-open');
                if (target === 'country' || target === 'departure') {
                    self.openChoice(target);
                } else if (target === 'dates') {
                    self.openDates();
                } else if (target === 'tourists') {
                    self.openTourists();
                } else if (target === 'nights') {
                    self.openNights();
                }
            });
        });

        qsa('[data-th-filter-open]', this.root).forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var type = btn.getAttribute('data-th-filter-open');
                if (type) self.openFilter(type);
            });
        });

        var filtersBtn = document.getElementById('th-coral-open-filters');
        if (filtersBtn) {
            filtersBtn.addEventListener('click', function (e) {
                e.preventDefault();
                self.openFilters();
            });
        }

        ['change', 'input'].forEach(function (ev) {
            if (self.depSel) self.depSel.addEventListener(ev, function () { self.refreshLabels(); });
            if (self.countrySel) self.countrySel.addEventListener(ev, function () { self.refreshLabels(); });
            FILTER_TYPES.forEach(function (type) {
                var sel = self.getFilterSelect(type);
                if (sel) sel.addEventListener(ev, function () { self.refreshFilterLabels(); });
            });
        });

        var observeTargets = [this.datesDisplay, this.touristsText].filter(Boolean);
        if (typeof MutationObserver !== 'undefined' && observeTargets.length) {
            var mo = new MutationObserver(function () { self.refreshLabels(); });
            observeTargets.forEach(function (el) {
                mo.observe(el, { characterData: true, childList: true, subtree: true });
            });
        }

        document.addEventListener('click', function (e) {
            if (e.target && (e.target.id === 'tv-sc-dates-apply' || (e.target.closest && e.target.closest('#tv-sc-dates-apply')))) {
                setTimeout(function () { self.refreshLabels(); self.clearFieldError('dates'); }, 50);
            }
            if (e.target && (e.target.id === 'tv-tourists-apply' || (e.target.closest && e.target.closest('#tv-tourists-apply')))) {
                setTimeout(function () { self.refreshLabels(); }, 50);
            }
            if (e.target && (e.target.id === 'tv-nights-apply' || (e.target.closest && e.target.closest('#tv-nights-apply')))) {
                setTimeout(function () { self.refreshLabels(); }, 50);
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            ['country', 'departure'].forEach(function (t) {
                var sheet = document.getElementById('th-search-' + t + '-sheet');
                if (sheet && sheet.classList.contains('is-open')) self.closeChoice(t, true);
            });
            FILTER_TYPES.forEach(function (t) {
                var sheet = document.getElementById('th-search-' + t + '-sheet');
                if (sheet && sheet.classList.contains('is-open')) self.closeFilter(t, true);
            });
        });
    };

    function init() {
        var root = document.getElementById('tour-search-section');
        if (!root) return;
        if (!root.classList.contains('th-coral-search') && !root.classList.contains('th-wizard') && !root.classList.contains('th-coral-wizard')) return;
        window.THSearchUI = new THSearchUI(root);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
