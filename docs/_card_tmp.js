/**
 * Единая карточка тура (образец — раздел «Акции»).
 * window.THTourCard.render(hotel, options) → HTML string
 */
(function (global) {
  'use strict';

  var FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80';
  var DETAIL_BTN_LABEL = '\u0417\u0430\u0431\u0440\u043e\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c';

  /** Ссылка на tour-detail без авто-открытия модалки (best practice: сначала детали тура). */
  function bookingHref(href) {
    return href;
  }
  var PHOTO_SLIDE_MAX = 6;

  /** Добавляет до 6 URL фото в ссылку на tour-detail.php (gallery_b64). */
  function appendGalleryToDetailUrl(url, slides) {
    if (!url || url === '#' || !slides || !slides.length) return url;
    if (url.indexOf('tour-detail') < 0) return url;
    try {
      var payload = slides.slice(0, PHOTO_SLIDE_MAX);
      var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      var sep = url.indexOf('?') >= 0 ? '&' : '?';
      return url + sep + 'gallery_b64=' + encodeURIComponent(b64);
    } catch (e) {
      return url;
    }
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function buildPromoLeadButtonHtml(meta) {
    meta = meta || {};
    return (
      '<button type="button" class="th-tour-card__btn th-tour-card__btn--secondary th-tour-card__btn--promo-lead"' +
      ' data-th-promo-card-lead="1"' +
      ' data-hotel-name="' + esc(meta.hotelName || '') + '"' +
      ' data-hotel-price="' + esc(meta.hotelPrice != null ? String(meta.hotelPrice) : '') + '"' +
      ' data-hotel-country="' + esc(meta.hotelCountry || '') + '"' +
      (meta.tourId ? ' data-tour-id="' + esc(String(meta.tourId)) + '"' : '') +
      '>\u0423\u0442\u043e\u0447\u043d\u0438\u0442\u044c \u0446\u0435\u043d\u0443</button>'
    );
  }

  function formatPrice(n) {
    var num = parseInt(String(n), 10) || 0;
    if (!num) return '—';
    return num.toLocaleString('ru-RU') + ' ₽';
  }

  function expandMeal(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    var map = {
      AI: 'Всё включено', UAI: 'Ультра всё включено', BB: 'Завтрак',
      HB: 'Завтрак + ужин', 'HB+': 'Завтрак + ужин (улучш.)',
      FB: 'Завтрак + обед + ужин', RO: 'Без питания', SC: 'Самообслуживание', AL: 'Всё включено'
    };
    return map[s.toUpperCase()] || s;
  }

  function nightsLabel(n) {
    var num = parseInt(String(n), 10) || 0;
    if (!num) return '';
    if (num === 1) return '1 ночь';
    if (num < 5) return num + ' ночи';
    return num + ' ночей';
  }

  /** «1 взрослый», «2 взрослых» — без непонятных сокращений. */
  function adultsLabel(n) {
    var num = parseInt(String(n), 10) || 0;
    if (!num) return '';
    return num === 1 ? '1 взрослый' : num + ' взрослых';
  }

  var CHILD_AGE_LABELS = {
    0: 'до 2 лет', 2: '2 года', 3: '3 года', 4: '4 года', 5: '5 лет', 6: '6 лет',
    7: '7 лет', 8: '8 лет', 9: '9 лет', 10: '10 лет', 11: '11 лет', 12: '12 лет',
    13: '13 лет', 14: '14 лет', 15: '15 лет'
  };

  function childAgeLabel(age) {
    var n = parseInt(String(age), 10);
    if (isNaN(n)) return '';
    if (CHILD_AGE_LABELS[n] != null) return CHILD_AGE_LABELS[n];
    if (n === 1) return '1 год';
    if (n >= 2 && n <= 4) return n + ' года';
    if (n >= 5 && n <= 17) return n + ' лет';
    return String(n);
  }

  function normalizeChildAges(raw) {
    if (!raw) return [];
    var list = Array.isArray(raw) ? raw : String(raw).split(',');
    var out = [];
    list.forEach(function (a) {
      if (a === null || a === undefined || a === '') return;
      var n = parseInt(String(a), 10);
      if (isNaN(n)) return;
      n = Math.max(0, Math.min(17, n));
      if (out.length < 3) out.push(n);
    });
    return out;
  }

  function childsParam(raw) {
    var ages = normalizeChildAges(raw);
    return ages.length ? ages.join(',') : '';
  }

  /** Подпись состава для цены: «за 2 взрослых + 1 реб. (7 лет)». */
  function partyPriceLabel(adults, childAges) {
    var a = Math.max(1, parseInt(String(adults), 10) || 2);
    var ages = normalizeChildAges(childAges);
    var parts = [a === 1 ? '1 взрослого' : a + ' взрослых'];
    ages.forEach(function (age) {
      parts.push('1 реб. (' + childAgeLabel(age) + ')');
    });
    return 'за ' + parts.join(' + ');
  }

  /** Краткий состав для строки дат: «2 взрослых + 1 реб. (до 2 лет)». */
  function partySummaryLabel(adults, childAges) {
    var a = Math.max(1, parseInt(String(adults), 10) || 2);
    var ages = normalizeChildAges(childAges);
    var parts = [adultsLabel(a)];
    ages.forEach(function (age) {
      parts.push('1 реб. (' + childAgeLabel(age) + ')');
    });
    return parts.join(' + ');
  }

  /** Совпадает ли тур из API с запрошенным составом (Tourvisor считает цену под него). */
  function tourPartyMatches(tour, adults, childAges) {
    if (!tour || typeof tour !== 'object') return true;
    var reqA = Math.max(1, parseInt(String(adults), 10) || 2);
    var reqC = normalizeChildAges(childAges).length;
    var tourA = tour.adults != null ? parseInt(String(tour.adults), 10) : null;
    var tourC = tour.childs != null ? parseInt(String(tour.childs), 10) : null;
    if (tourA != null && !isNaN(tourA) && tourA !== reqA) return false;
    if (reqC > 0 && tourC != null && !isNaN(tourC) && tourC !== reqC) return false;
    return true;
  }

  function fmtDateShort(ymd) {
    if (!ymd) return '';
    var parts = String(ymd).split('-');
    if (parts.length < 3) return ymd;
    return parts[2] + '.' + parts[1] + '.' + String(parts[0]).slice(2);
  }

  function departureName() {
    if (global.THDeparturePreference && typeof global.THDeparturePreference.getActive === 'function') {
      var active = global.THDeparturePreference.getActive();
      if (active && active.name) return active.name;
    }
    var depEl = document.getElementById('tv-departure');
    if (depEl && depEl.value) {
      var opt = depEl.options[depEl.selectedIndex];
      if (opt && (opt.textContent || '').trim()) return (opt.textContent || '').trim();
    }
    if (global.TH_DEPARTURE && global.TH_DEPARTURE.name) return global.TH_DEPARTURE.name;
    try {
      return localStorage.getItem('th_departure_name') || 'Самара';
    } catch (e) {
      return 'Самара';
    }
  }

  function departureId() {
    if (global.THDeparturePreference && typeof global.THDeparturePreference.getActive === 'function') {
      var activeId = global.THDeparturePreference.getActive();
      if (activeId && activeId.id) return String(activeId.id);
    }
    var depEl = document.getElementById('tv-departure');
    if (depEl && depEl.value) return String(depEl.value).trim();
    if (global.TH_DEPARTURE && global.TH_DEPARTURE.id) return String(global.TH_DEPARTURE.id);
    try {
      return localStorage.getItem('th_departure_id') || '7';
    } catch (e2) {
      return '7';
    }
  }

  function tourIdFromTour(tour) {
    if (!tour) return '';
    var id = tour.id != null ? tour.id : (tour.tourId != null ? tour.tourId : tour.tourid);
    return (id != null && id !== '') ? String(id) : '';
  }

  function resolveFlightMeta(tourId, depCity, options) {
    options = options || {};
    if (options.flightMeta) {
      if (typeof global.thFlightMetaNormalize === 'function') {
        return global.thFlightMetaNormalize(options.flightMeta, depCity);
      }
      return options.flightMeta;
    }
    if (tourId) {
      if (typeof global.thFlightsCacheGet === 'function') {
        var cached = global.thFlightsCacheGet(tourId, depCity);
        if (cached) return cached;
      }
    }
    return null;
  }

  var FLIGHT_STUB_TEXT = '\u0423\u0442\u043e\u0447\u043d\u0438\u0442\u0435 \u0443 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430';

  function flightSublineClass(hasData) {
    return hasData
      ? 'th-tour-card__flight-sub'
      : 'th-tour-card__flight-sub th-tour-card__flight-sub--stub';
  }

  function buildFlightLegHtml(label, cityLine, subline, hasData, modClass) {
    modClass = modClass || '';
    return (
      '<div class="th-tour-card__flight-leg' + modClass + '">' +
      '<span class="th-tour-card__flight-icon" aria-hidden="true"><i class="fas fa-plane"></i></span>' +
      '<div class="th-tour-card__flight-text">' +
      '<b>' + esc(label) + '</b>' +
      (cityLine ? '<span class="th-tour-card__flight-city">' + esc(cityLine) + '</span>' : '') +
      '<span class="' + flightSublineClass(hasData) + '">' + esc(subline) + '</span>' +
      '</div></div>'
    );
  }

  /**
   * Блок перелёта: туда + обратно с авиакомпанией и временем, или заглушка.
   */
  function buildFlightBlockHtml(depCity, tourId, options) {
    var city = String(depCity || departureName()).trim();
    if (!city) return '';
    var meta = resolveFlightMeta(tourId, city, options);
    if (meta && meta.city) city = String(meta.city).trim() || city;
    var forwardLine = '';
    var backwardLine = '';
    if (meta) {
      forwardLine = String(meta.forwardLine || meta.subline || meta.summary || '').trim();
      backwardLine = String(meta.backwardLine || '').trim();
      if (!forwardLine) {
        var airline = String(meta.airline || (meta.companies && meta.companies[0]) || '').trim();
        var time = String(meta.time || '').trim();
        if (airline && time) forwardLine = airline + ' \u00b7 ' + time;
        else if (airline) forwardLine = airline;
        else if (time) forwardLine = time;
        else if (meta.route) forwardLine = String(meta.route).trim();
      }
    }
    var hasForward = !!forwardLine;
    var hasBackward = !!backwardLine;
    if (!hasForward && !hasBackward) {
      return (
        '<div class="th-tour-card__flight-chip">' +
        buildFlightLegHtml('\u0412\u044b\u043b\u0435\u0442', city, FLIGHT_STUB_TEXT, false) +
        '</div>'
      );
    }
    var html = '<div class="th-tour-card__flight-chip">';
    html += buildFlightLegHtml('\u0412\u044b\u043b\u0435\u0442', city, forwardLine || FLIGHT_STUB_TEXT, hasForward);
    html += buildFlightLegHtml(
      '\u041e\u0431\u0440\u0430\u0442\u043d\u043e',
      '',
      backwardLine || FLIGHT_STUB_TEXT,
      hasBackward,
      ' th-tour-card__flight-leg--return'
    );
    html += '</div>';
    return html;
  }

  function patchFlightsInContainer(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var cards = scope.querySelectorAll('.th-tour-card[data-th-tour-id]');
    cards.forEach(function (card) {
      var tourId = card.getAttribute('data-th-tour-id');
      var depCity = card.getAttribute('data-th-departure-city') || departureName();
      var body = card.querySelector('.th-tour-card__body');
      if (!body) return;
      var meta = resolveFlightMeta(tourId, depCity, {});
      var html = buildFlightBlockHtml(depCity, tourId, meta ? { flightMeta: meta } : {});
      if (meta && meta.city) card.setAttribute('data-th-departure-city', meta.city);
      var chip = body.querySelector('.th-tour-card__flight-chip');
      var dep = body.querySelector('.th-tour-card__dep-city');
      var anchor = body.querySelector('.th-tour-card__price-block');
      if (chip) {
        chip.outerHTML = html;
        return;
      }
      if (dep) {
        dep.outerHTML = html;
        return;
      }
      if (!html || !anchor) return;
      var wrap = document.createElement('div');
      wrap.innerHTML = html;
      while (wrap.firstChild) body.insertBefore(wrap.firstChild, anchor);
    });
    ensureCarouselsInContainer(scope);
  }

  /** Принудительная загрузка img в карусели. */
  function preloadCarouselImage(img) {
    if (!img) return;
    var src = img.getAttribute('src') || img.dataset.src || '';
    if (!src) return;
    img.loading = 'eager';
    if (img.complete && img.naturalWidth > 1) return;
    if (!img.getAttribute('src')) img.setAttribute('src', src);
    if (!img.src) {
      img.src = src;
      return;
    }
    if (img.complete) return;
    /* lazy в скрытом слайде мог не стартовать — перезапуск без пустого src */
    if (img.dataset.thPreload !== src) {
      img.dataset.thPreload = src;
      img.src = src;
    }
  }

  /** Legacy strip-scroll → полноценная JS-карусель. */
  function upgradeStripScrollCarousels(scope) {
    var medias = scope.querySelectorAll('.th-tour-card__media--carousel');
    medias.forEach(function (media) {
      if (media.querySelector('[data-th-carousel]')) return;
      var strip = media.querySelector('.th-tour-card__strip-scroll');
      if (!strip) return;
      var srcs = [];
      strip.querySelectorAll('img').forEach(function (img) {
        var s = img.getAttribute('src') || img.src;
        if (s) srcs.push(s);
      });
      if (!srcs.length) return;
      var badgeNodes = Array.prototype.slice.call(media.querySelectorAll('.th-tour-card__badge'));
      var card = media.closest('.th-tour-card');
      var linkEl = card ? (card.querySelector('.th-tour-card__link--main') || card.querySelector('a.th-tour-card__btn--secondary')) : null;
      var detailUrl = linkEl ? (linkEl.getAttribute('href') || '') : '';
      var built = buildCarouselMediaHtml(srcs, { fallbackImg: FALLBACK_IMG, detailUrl: detailUrl });
      var tmp = document.createElement('div');
      tmp.innerHTML = built;
      var newMedia = tmp.firstElementChild;
      if (!newMedia) return;
      badgeNodes.forEach(function (b) { newMedia.appendChild(b); });
      media.parentNode.replaceChild(newMedia, media);
    });
  }

  function carouselViewportWidth(carousel) {
    var vp = carousel.querySelector('.th-tour-card__carousel-viewport');
    var w = vp ? vp.clientWidth : 0;
    if (!w) w = carousel.clientWidth || 0;
    return w;
  }

  function syncCarouselInstance(carousel) {
    var track = carousel.querySelector('.th-tour-card__carousel-track');
    if (!track) return;
    var slides = Array.prototype.slice.call(track.querySelectorAll('.th-tour-card__carousel-slide'));
    if (!slides.length) return;

    var n = slides.length;
    var prevBtn = carousel.querySelector('.th-tour-card__carousel-btn--prev');
    var nextBtn = carousel.querySelector('.th-tour-card__carousel-btn--next');
    var dotsEl = carousel.querySelector('.th-tour-card__carousel-dots');
    var counterEl = carousel.querySelector('.th-tour-card__carousel-counter');
    var current = parseInt(carousel.getAttribute('data-th-slide-index') || '0', 10) || 0;
    if (current < 0) current = 0;
    if (current >= n) current = n - 1;

    carousel.classList.toggle('th-tour-card__carousel--single', n <= 1);
    carousel.classList.add('th-tour-card__carousel--ready');

    if (prevBtn) prevBtn.style.display = n > 1 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = n > 1 ? 'flex' : 'none';
    if (counterEl) {
      counterEl.style.display = n > 1 ? '' : 'none';
      counterEl.textContent = (current + 1) + ' / ' + n;
    }

    if (dotsEl) {
      if (n <= 1) {
        dotsEl.innerHTML = '';
      } else if (dotsEl.children.length !== n) {
        dotsEl.innerHTML = '';
        for (var i = 0; i < n; i++) {
          (function (idx) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'th-tour-card__carousel-dot' + (idx === current ? ' is-active' : '');
            btn.setAttribute('aria-label', '\u0424\u043e\u0442\u043e ' + (idx + 1));
            btn.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              carousel.setAttribute('data-th-slide-index', String(idx));
              syncCarouselInstance(carousel);
            });
            dotsEl.appendChild(btn);
          })(i);
        }
      } else {
        var dots = dotsEl.querySelectorAll('.th-tour-card__carousel-dot');
        dots.forEach(function (d, i) {
          d.classList.toggle('is-active', i === current);
          if (d.getAttribute('data-th-dot-wired') === '1') return;
          d.setAttribute('data-th-dot-wired', '1');
          d.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            carousel.setAttribute('data-th-slide-index', String(i));
            syncCarouselInstance(carousel);
          });
        });
      }
    }

    /* px от viewport — % от track даёт скачки (track шире родителя на N слайдов) */
    var vw = carouselViewportWidth(carousel);
    if (vw > 0) {
      slides.forEach(function (sl) {
        sl.style.flex = '0 0 ' + vw + 'px';
        sl.style.width = vw + 'px';
        sl.style.minWidth = vw + 'px';
        sl.style.maxWidth = vw + 'px';
      });
      track.style.transform = 'translate3d(' + (-current * vw) + 'px, 0, 0)';
    } else {
      track.style.transform = 'translate3d(-' + (current * 100) + '%, 0, 0)';
    }
    slides.forEach(function (sl, i) {
      sl.classList.toggle('is-active', i === current);
      if (i === current || (n > 1 && (i === (current + 1) % n || i === (current - 1 + n) % n))) {
        preloadCarouselImage(sl);
      }
    });
    if (n <= 1) preloadCarouselImage(slides[0]);
    carousel.setAttribute('data-th-slide-index', String(current));
  }

  function wireCarouselInstance(carousel) {
    if (carousel.getAttribute('data-th-carousel-wired') === '1') return;
    carousel.setAttribute('data-th-carousel-wired', '1');

    var track = carousel.querySelector('.th-tour-card__carousel-track');
    var prevBtn = carousel.querySelector('.th-tour-card__carousel-btn--prev');
    var nextBtn = carousel.querySelector('.th-tour-card__carousel-btn--next');
    var pointerId = null;
    var startX = 0;
    var moved = false;
    var lockUntil = 0;

    function stopNav(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    function goTo(delta) {
      var now = Date.now();
      if (now < lockUntil) return;
      var slides = track ? track.querySelectorAll('.th-tour-card__carousel-slide') : [];
      var n = slides.length;
      if (n <= 1) return;
      var cur = parseInt(carousel.getAttribute('data-th-slide-index') || '0', 10) || 0;
      cur = (cur + delta + n) % n;
      carousel.setAttribute('data-th-slide-index', String(cur));
      lockUntil = now + 280;
      syncCarouselInstance(carousel);
    }

    if (prevBtn) prevBtn.addEventListener('click', function (e) { stopNav(e); goTo(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function (e) { stopNav(e); goTo(1); });

    carousel.addEventListener('click', function (e) {
      if (e.target.closest('.th-tour-card__carousel-btn, .th-tour-card__carousel-dot')) stopNav(e);
    });

    carousel.addEventListener('click', function (e) {
      if (e.target.closest('.th-tour-card__carousel-btn, .th-tour-card__carousel-dot')) return;
      if (moved || Date.now() < lockUntil) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
        return;
      }
      var hit = carousel.querySelector('.th-tour-card__media-hit');
      if (!hit) return;
      var href = hit.getAttribute('href') || '';
      if (!href || href === '#') return;
      e.preventDefault();
      e.stopPropagation();
      if (hit.getAttribute('target') === '_blank') window.open(href, '_blank', 'noopener');
      else window.location.href = href;
    });

    /* Единый свайп (PointerEvent; touch fallback) — без двойного goTo → 1-3-5-7 */
    var swipeRoot = track || carousel;
    if (window.PointerEvent) {
      swipeRoot.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.th-tour-card__carousel-btn, .th-tour-card__carousel-dot')) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        moved = false;
        try { swipeRoot.setPointerCapture(e.pointerId); } catch (err) {}
      });
      swipeRoot.addEventListener('pointermove', function (e) {
        if (pointerId == null || e.pointerId !== pointerId) return;
        if (Math.abs(e.clientX - startX) > 10) moved = true;
      });
      function endPointer(e) {
        if (pointerId == null || e.pointerId !== pointerId) return;
        var dx = e.clientX - startX;
        pointerId = null;
        try { swipeRoot.releasePointerCapture(e.pointerId); } catch (err2) {}
        if (Math.abs(dx) > 40) {
          moved = true;
          goTo(dx < 0 ? 1 : -1);
        }
      }
      swipeRoot.addEventListener('pointerup', endPointer);
      swipeRoot.addEventListener('pointercancel', function (e) {
        if (pointerId == null || e.pointerId !== pointerId) return;
        pointerId = null;
        moved = false;
      });
    } else {
      swipeRoot.addEventListener('touchstart', function (e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        if (e.target.closest('.th-tour-card__carousel-btn, .th-tour-card__carousel-dot')) return;
        startX = e.changedTouches[0].clientX;
        moved = false;
      }, { passive: true });
      swipeRoot.addEventListener('touchmove', function (e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        if (Math.abs(e.changedTouches[0].clientX - startX) > 10) moved = true;
      }, { passive: true });
      swipeRoot.addEventListener('touchend', function (e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) {
          moved = true;
          goTo(dx < 0 ? 1 : -1);
        }
      }, { passive: true });
    }

    carousel.addEventListener('click', function (e) {
      if (moved || Date.now() < lockUntil) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }, true);

    if (!carousel.__thCarouselResizeBound) {
      carousel.__thCarouselResizeBound = true;
      var onResize = function () { syncCarouselInstance(carousel); };
      window.addEventListener('resize', onResize, { passive: true });
      window.addEventListener('orientationchange', function () {
        setTimeout(onResize, 80);
        setTimeout(onResize, 320);
      });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onResize, { passive: true });
      }
    }
  }

  /** JS-карусель на карточках: можно вызывать повторно после innerHTML. */
  function initCarouselsInContainer(root) {
    var scope = root && root.querySelectorAll ? root : document;
    upgradeStripScrollCarousels(scope);
    scope.querySelectorAll('.th-tour-card__carousel').forEach(function (carousel) {
      wireCarouselInstance(carousel);
      syncCarouselInstance(carousel);
    });
  }

  /** Карусель + фото: повторная инициализация после показа скрытых блоков. */
  function ensureCarouselsInContainer(root) {
    var scope = root && root.querySelectorAll ? root : document;
    kickImagesInContainer(scope);
    function run() { initCarouselsInContainer(scope); }
    run();
    requestAnimationFrame(function () {
      run();
      requestAnimationFrame(run);
    });
    setTimeout(run, 0);
    setTimeout(run, 80);
    setTimeout(run, 300);
    setTimeout(function () { hydrateCarouselsFromHotelApi(scope); }, 0);
  }

  function resolveTvApiBase() {
    return String(global.TV_API_BASE || global.TH_TV_API_BASE || global.tvApiBase || '').trim();
  }

  function resolveImageProxy() {
    return global.TH_TV_IMAGE_PROXY || global.TV_IMAGE_PROXY || '';
  }

  var thCarouselHydrateQueue = [];
  var thCarouselHydrateActive = 0;
  var TH_CAROUSEL_HYDRATE_MAX = 2;
  var TH_CAROUSEL_HYDRATE_GAP_MS = 120;

  function rebuildCarouselTrack(carousel, slides, options) {
    var track = carousel.querySelector('.th-tour-card__carousel-track');
    if (!track || !slides || slides.length < 2) return;
    var built = buildCarouselMediaHtml(slides, options);
    var tmp = document.createElement('div');
    tmp.innerHTML = built;
    var newCarousel = tmp.querySelector('[data-th-carousel]');
    if (!newCarousel) return;
    var newTrack = newCarousel.querySelector('.th-tour-card__carousel-track');
    var newDots = newCarousel.querySelector('.th-tour-card__carousel-dots');
    var newCounter = newCarousel.querySelector('.th-tour-card__carousel-counter');
    var hitLink = newCarousel.querySelector('.th-tour-card__media-hit');
    if (!newTrack) return;
    track.innerHTML = newTrack.innerHTML;
    carousel.className = newCarousel.className;
    if (newDots) {
      var dotsEl = carousel.querySelector('.th-tour-card__carousel-dots');
      if (dotsEl) dotsEl.innerHTML = newDots.innerHTML;
    }
    if (newCounter) {
      var counterEl = carousel.querySelector('.th-tour-card__carousel-counter');
      if (counterEl) counterEl.textContent = newCounter.textContent;
    }
    var oldHit = carousel.querySelector('.th-tour-card__media-hit');
    if (oldHit) oldHit.remove();
    if (hitLink) carousel.appendChild(hitLink);
    /* НЕ снимать data-th-carousel-wired: иначе init повесит второй swipe → 1-3-5-7 */
    carousel.setAttribute('data-th-slide-index', '0');
    var dotsEl = carousel.querySelector('.th-tour-card__carousel-dots');
    if (dotsEl) {
      dotsEl.querySelectorAll('.th-tour-card__carousel-dot').forEach(function (d) {
        d.removeAttribute('data-th-dot-wired');
      });
    }
    syncCarouselInstance(carousel);
  }

  function thCarouselDrainHydrateQueue(apiBase) {
    while (thCarouselHydrateActive < TH_CAROUSEL_HYDRATE_MAX && thCarouselHydrateQueue.length) {
      var job = thCarouselHydrateQueue.shift();
      thCarouselHydrateActive++;
      thCarouselFetchHotelPhotos(job, apiBase);
    }
  }

  function thCarouselFetchHotelPhotos(job, apiBase) {
    var base = apiBase.replace(/\/$/, '');
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    var url = base + sep + 'type=hotel&hotelId=' + encodeURIComponent(job.hotelId);
    function fetchHotel() {
      return fetch(url, { cache: 'force-cache' }).then(function (r) {
        if (r.status !== 503 && r.status !== 429) return r;
        return new Promise(function (resolve) {
          setTimeout(resolve, 1200);
        }).then(function () {
          return fetch(url, { cache: 'force-cache' });
        });
      });
    }
    fetchHotel()
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.success || !j.data) return;
        var proxy = resolveImageProxy();
        var mapped = [];
        var dedup = {};
        collectHotelPhotoRawUrls(j.data, null).forEach(function (u) {
          var m = mapTourvisorImageUrl(u, proxy);
          if (!m || dedup[m]) return;
          dedup[m] = true;
          mapped.push(m);
        });
        if (mapped.length < 2) return;
        var nameEl = job.card.querySelector('.th-tour-card__name');
        var linkEl = job.card.querySelector('.th-tour-card__link--main') || job.card.querySelector('a.th-tour-card__btn--secondary');
        rebuildCarouselTrack(job.carousel, mapped, {
          fallbackImg: FALLBACK_IMG,
          hotelName: nameEl ? nameEl.textContent : '',
          detailUrl: linkEl ? (linkEl.getAttribute('href') || '') : '',
          target: linkEl && linkEl.getAttribute('target') === '_blank' ? '_blank' : ''
        });
        kickImagesInContainer(job.card);
        initCarouselsInContainer(job.card);
      })
      .catch(function () {})
      .finally(function () {
        job.card.setAttribute('data-th-carousel-hydrated', '1');
        thCarouselHydrateActive--;
        setTimeout(function () {
          thCarouselDrainHydrateQueue(apiBase);
        }, TH_CAROUSEL_HYDRATE_GAP_MS);
      });
  }

  /** Догружает фото отеля из API Tourvisor, если в поиске было одно фото. */
  function hydrateCarouselsFromHotelApi(root) {
    var apiBase = resolveTvApiBase();
    if (!apiBase) return;
    var scope = root && root.querySelectorAll ? root : document;
    var promoResults = scope.id === 'promo-tours-results' ? scope : scope.querySelector('#promo-tours-results');
    var hydrateLimit = promoResults ? 5 : 0;
    var queued = 0;
    scope.querySelectorAll('.th-tour-card[data-th-hotel-id]').forEach(function (card) {
      if (hydrateLimit > 0 && queued >= hydrateLimit) return;
      if (card.getAttribute('data-th-carousel-hydrated') === '1') return;
      if (card.getAttribute('data-th-carousel-hydrate-pending') === '1') return;
      var carousel = card.querySelector('[data-th-carousel]');
      if (!carousel) return;
      var track = carousel.querySelector('.th-tour-card__carousel-track');
      if (!track) return;
      var slideCount = track.querySelectorAll('.th-tour-card__carousel-slide').length;
      if (slideCount >= 2) {
        card.setAttribute('data-th-carousel-hydrated', '1');
        return;
      }
      var hotelId = card.getAttribute('data-th-hotel-id');
      if (!hotelId) return;
      card.setAttribute('data-th-carousel-hydrate-pending', '1');
      thCarouselHydrateQueue.push({ card: card, carousel: carousel, hotelId: hotelId });
      queued++;
    });
    thCarouselDrainHydrateQueue(apiBase);
  }

  /** Прогрузка фото туров (карусель, прокси): без lazy, сразу eager. */
  function kickImagesInContainer(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var imgs = scope.querySelectorAll('.th-tour-card__carousel-slide, .th-tour-card__strip-img, .th-tour-card__img');
    if (!imgs.length) return;

    function applyFallback(img) {
      if (!img.dataset.fb || img.dataset.fbTried) return;
      img.dataset.fbTried = '1';
      img.onerror = null;
      img.src = img.dataset.fb;
    }

    function kickOne(img, retry) {
      img.loading = 'eager';
      if (img.complete && (img.naturalWidth <= 1 || img.naturalHeight <= 1)) {
        if (retry && !img.dataset.fbTried) {
          var brokenSrc = img.getAttribute('src') || img.src;
          if (brokenSrc && brokenSrc.indexOf('image-proxy') >= 0) {
            var bust = brokenSrc.replace(/([?&])_kick=\d+/g, '').replace(/[?&]$/, '');
            bust += (bust.indexOf('?') >= 0 ? '&' : '?') + '_kick=' + Date.now();
            img.src = bust;
            return;
          }
        }
        applyFallback(img);
        return;
      }
      if (img.complete) return;
      preloadCarouselImage(img);
    }

    imgs.forEach(function (img) {
      img.loading = 'eager';
      kickOne(img, false);
    });
    requestAnimationFrame(function () {
      imgs.forEach(function (img) { kickOne(img, true); });
    });
  }

  /** Сырые URL из ответа Tourvisor (picturelink + pictures[] + fallback по id отеля). */
  function collectHotelPhotoRawUrls(h, tour) {
    var urls = [];
    var seen = {};
    function add(u) {
      if (u == null || u === '') return;
      u = String(u).trim();
      if (!u) return;
      var k = u.replace(/^https?:/i, '').replace(/^\/\//, '').replace(/^www\./i, '').toLowerCase();
      if (!k || seen[k]) return;
      seen[k] = true;
      urls.push(u);
    }
    function addFromObj(obj) {
      if (!obj || typeof obj !== 'object') return;
      var keys = ['picturelink', 'pictureLink', 'mainpicture', 'mainPicture', 'picture', 'photo', 'image', 'img'];
      keys.forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) return;
        var v = obj[k];
        if (typeof v === 'string') add(v);
        else if (v && typeof v === 'object') {
          add((v.src || v.url || v.link || v.picturelink || v.pictureLink || '').toString());
        }
      });
      var pics = obj.pictures || obj.images || obj.photos || obj.gallery;
      if (pics && Array.isArray(pics)) {
        pics.forEach(function (p) {
          if (typeof p === 'string') add(p);
          else if (p && typeof p === 'object') {
            add((p.src || p.url || p.link || p.picturelink || p.pictureLink || p.picture || '').toString());
          }
        });
      } else if (pics && typeof pics === 'object') {
        Object.keys(pics).forEach(function (k) { add(pics[k]); });
      }
    }
    if (!h) h = {};
    tour = tour || ((h.tours && h.tours[0]) ? h.tours[0] : {});
    addFromObj(h);
    addFromObj(tour);
    if (h.common && typeof h.common === 'object') addFromObj(h.common);
    return urls.slice(0, PHOTO_SLIDE_MAX);
  }

  /**
   * Прокси Tourvisor (static / hotel_pics / //static) — как normalizeTvImageUrl на tour-detail.
   */
  function mapTourvisorImageUrl(src, proxyBase) {
    var s = (src == null || src === '') ? '' : String(src).trim();
    if (!s) return '';
    if (/^\/\//.test(s)) {
      var proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'https:' : 'http:';
      s = proto + s;
    }
    var proxy = proxyBase || global.TH_TV_IMAGE_PROXY || global.TV_IMAGE_PROXY || '';
    if (proxy && typeof location !== 'undefined' && location.protocol === 'https:' && proxy.indexOf('http://') === 0) {
      proxy = 'https:' + proxy.substring(5);
    }
    var tvPath = s.match(/static\.tourvisor\.ru\/(.+)$/i);
    if (tvPath && tvPath[1] && proxy) {
      return proxy + '?path=' + encodeURIComponent(tvPath[1].replace(/^\/+/, ''));
    }
    if (!proxy) return s;
    if (/^https?:\/\/static\.tourvisor\.ru\//i.test(s) || /^http:\/\/static\.tourvisor\.ru\//i.test(s)) {
      return proxy + '?url=' + encodeURIComponent(s.replace(/^https:/i, 'http:'));
    }
    if (/^static\.tourvisor\.ru\//i.test(s)) {
      return proxy + '?url=' + encodeURIComponent('http://' + s);
    }
    if (/^\/hotel_pics\//i.test(s) || /^hotel_pics\//i.test(s)) {
      return proxy + '?path=' + encodeURIComponent(s.replace(/^\/+/, ''));
    }
    if (!/^https?:\/\//i.test(s) && /^hotel_pics\//i.test(s)) {
      return mapTourvisorImageUrl('https://static.tourvisor.ru/' + s.replace(/^\/+/, ''), proxy);
    }
    if (/^https?:\/\//i.test(s) && !/tourvisor\.ru/i.test(s)) return s;
    return s;
  }

  /**
   * HTML блока медиа с JS-каруселью (до PHOTO_SLIDE_MAX уникальных фото).
   */
  function buildCarouselMediaHtml(slides, options) {
    options = options || {};
    var fbAttr = esc(options.fallbackImg || FALLBACK_IMG);
    var hotelName = options.hotelName || '';
    var isPromo = !!options.isPromo;
    var imgFallbackHandler = 'if(this.dataset.fb){if(this.dataset.fbTried){return}this.dataset.fbTried=1;this.onerror=null;this.src=this.dataset.fb}';
    var imgLoadCheckHandler = 'if(this.dataset.fb&&!this.dataset.fbTried&&(this.naturalWidth<=1||this.naturalHeight<=1)){this.dataset.fbTried=1;this.src=this.dataset.fb}';
    var list = (slides || []).slice(0, PHOTO_SLIDE_MAX);
    if (!list.length) list.push(options.fallbackImg || FALLBACK_IMG);

    var slideHtml = list.map(function (src, ji) {
      var prio = ji === 0 ? ' fetchpriority="high"' : '';
      return '<img src="' + esc(src) + '" data-fb="' + fbAttr + '" alt="' + esc(hotelName) + '" class="th-tour-card__carousel-slide' + (ji === 0 ? ' is-active' : '') + '" loading="eager"' + prio + ' decoding="async" onerror="' + imgFallbackHandler + '" onload="' + imgLoadCheckHandler + '">';
    }).join('');

    var multi = list.length > 1;
    var dotsHtml = '';
    if (multi) {
      for (var di = 0; di < list.length; di++) {
        dotsHtml += '<button type="button" class="th-tour-card__carousel-dot' + (di === 0 ? ' is-active' : '') + '" aria-label="\u0424\u043e\u0442\u043e ' + (di + 1) + '"></button>';
      }
    }
    var controls =
      '<button type="button" class="th-tour-card__carousel-btn th-tour-card__carousel-btn--prev" aria-label="\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0435 \u0444\u043e\u0442\u043e"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>' +
      '<button type="button" class="th-tour-card__carousel-btn th-tour-card__carousel-btn--next" aria-label="\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0435 \u0444\u043e\u0442\u043e"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>' +
      '<div class="th-tour-card__carousel-dots" role="tablist" aria-label="\u0413\u0430\u043b\u0435\u0440\u0435\u044f \u0444\u043e\u0442\u043e">' + dotsHtml + '</div>' +
      '<span class="th-tour-card__carousel-counter" aria-hidden="true">1 / ' + list.length + '</span>';

    var badges = '';
    if (isPromo) badges += '<span class="th-tour-card__badge th-tour-card__badge--promo">\u0410\u043a\u0446\u0438\u044f</span>';
    if (options.directBadge) badges += '<span class="th-tour-card__badge th-tour-card__badge--direct">\u041f\u0440\u044f\u043c\u043e\u0439 \u0440\u0435\u0439\u0441</span>';
    if (options.badge) badges += '<span class="th-tour-card__badge th-tour-card__badge--exclusive">' + esc(options.badge) + '</span>';

    var targetAttr = options.target === '_blank' ? ' target="_blank" rel="noopener"' : '';
    var hitLink = '';
    if (options.detailUrl && options.detailUrl !== '#') {
      hitLink = '<a href="' + esc(options.detailUrl) + '"' + targetAttr + ' class="th-tour-card__media-hit" tabindex="-1" aria-hidden="true"></a>';
    }

    return (
      '<div class="th-tour-card__media th-tour-card__media--carousel">' +
      '<div class="th-tour-card__carousel' + (multi ? ' th-tour-card__carousel--ready' : ' th-tour-card__carousel--single') + '" data-th-carousel>' +
      '<div class="th-tour-card__carousel-viewport">' +
      '<div class="th-tour-card__carousel-track">' + slideHtml + '</div>' +
      '</div>' + controls + hitLink +
      '</div>' + badges +
      '</div>'
    );
  }

  /**
   * @param {object} h — hotel from Tourvisor search
   * @param {object} options — tour, detailUrl, promo, getImageUrl, adults, dates, target
   */
  function render(h, options) {
    options = options || {};
    var tour = options.tour || ((h.tours && h.tours[0]) ? h.tours[0] : {});
    var getImageUrl = options.getImageUrl;
    var fallbackImg = options.fallbackImg || FALLBACK_IMG;
    var slides = [];
    var dedup = {};
    var mapFn = typeof getImageUrl === 'function'
      ? getImageUrl
      : function (src) { return mapTourvisorImageUrl(src, options.imageProxy); };
    collectHotelPhotoRawUrls(h, tour).forEach(function (src) {
      var mapped = mapFn(src);
      if (!mapped || dedup[mapped]) return;
      dedup[mapped] = true;
      slides.push(mapped);
    });
    if (!slides.length && options.image) {
      var optImg = mapFn(options.image);
      if (optImg) slides.push(optImg);
    }
    if (!slides.length) slides.push(fallbackImg);
    slides = slides.slice(0, PHOTO_SLIDE_MAX);

    var countryIdOpt = options.countryId != null ? String(options.countryId) : '';
    if (!countryIdOpt && h.country && h.country.id != null) countryIdOpt = String(h.country.id);
    var country = options.country || '';
    if (!country) {
        if (countryIdOpt === '47') country = 'Сочи';
        else country = (h.country && h.country.name) || '';
    } else if (countryIdOpt === '47' && (country === 'Россия' || country === 'Russia')) {
        country = 'Сочи';
    }
    var region = options.region || (h.region && h.region.name) || '';
    var mealRaw = (tour.meal && (tour.meal.russianName || tour.meal.name)) || options.meal || '';
    var meal = expandMeal(mealRaw);
    var nightsNum = parseInt(String(tour.nights || options.nights || ''), 10) || 0;
    var priceNum = options.price != null ? parseInt(String(options.price), 10) : 0;
    if (!priceNum && tour) {
      priceNum = Math.round(
        (parseInt(String(tour.totalPrice || ''), 10) || 0) ||
        (parseInt(String(tour.price || ''), 10) || 0) ||
        (parseInt(String(tour.priceRub || ''), 10) || 0) ||
        (parseInt(String(tour.cost || ''), 10) || 0)
      );
    }
    var adultsNum = parseInt(String(options.adults || 2), 10) || 2;
    var childAges = normalizeChildAges(options.childAges != null ? options.childAges : options.childs);
    var catNum = parseInt(String(h.category || ''), 10) || 0;
    var starsHtml = catNum > 0 ? '\u2605'.repeat(Math.min(catNum, 5)) : '';
    var isPromo = !!options.promo;
    var showDirectBadge = !!options.directBadge;
    var cardHref = options.detailUrl || options.href || '#';
    if (slides.length && cardHref.indexOf('tour-detail') >= 0) {
      cardHref = appendGalleryToDetailUrl(cardHref, slides);
    }
    var targetAttr = options.target === '_blank' ? ' target="_blank" rel="noopener"' : '';
    var modClass = isPromo ? ' th-tour-card--promo' : (options.countryCard ? ' th-tour-card--country' : '');
    var skipPatch = options.skipPromoPatch ? ' data-promo-patched="skip"' : '';

    var startYmd = options.dateFrom || '';
    var retYmd = options.dateTo || '';
    var datesMeta = '';
    var partyWord = partySummaryLabel(adultsNum, childAges);
    var pricePartyLabel = partyPriceLabel(adultsNum, childAges);
    var partyMismatch = !tourPartyMatches(tour, adultsNum, childAges);
    if (startYmd && retYmd) {
      datesMeta = fmtDateShort(startYmd) + ' \u2013 ' + fmtDateShort(retYmd) + ', ' + nightsLabel(nightsNum) + ', ' + partyWord;
    } else if (nightsNum) {
      datesMeta = nightsLabel(nightsNum) + ', ' + partyWord;
    } else {
      datesMeta = partyWord;
    }

    // Hard funnel: никогда не рисуем фейковую «было» (+15%). Только реальная цена API.
    var oldPriceNum = 0;
    if (isPromo && priceNum > 0 && options.realOldPrice && Number(options.realOldPrice) > priceNum) {
      oldPriceNum = Math.round(Number(options.realOldPrice) / 100) * 100;
    }

    var depCity = options.departureCity || departureName();
    var tourIdStr = tourIdFromTour(tour);
    var flightHtml = buildFlightBlockHtml(depCity, tourIdStr, {
      flightMeta: options.flightMeta
    });

    var mediaHtml;
    if (options.carousel !== false) {
      mediaHtml = buildCarouselMediaHtml(slides, {
        fallbackImg: fallbackImg,
        hotelName: h.name,
        isPromo: isPromo,
        directBadge: showDirectBadge,
        badge: options.badge,
        detailUrl: cardHref,
        target: options.target
      });
    } else {
      var fbAttr = esc(fallbackImg);
      var imgFallbackHandler = 'if(this.dataset.fb){if(this.dataset.fbTried){return}this.dataset.fbTried=1;this.onerror=null;this.src=this.dataset.fb}';
      var imgLoadCheckHandler = 'if(this.dataset.fb&&!this.dataset.fbTried&&(this.naturalWidth<=1||this.naturalHeight<=1)){this.dataset.fbTried=1;this.src=this.dataset.fb}';
      mediaHtml =
        '<div class="th-tour-card__media">' +
        '<img src="' + esc(slides[0]) + '" data-fb="' + fbAttr + '" alt="' + esc(h.name) + '" class="th-tour-card__img" loading="eager" fetchpriority="high" decoding="async" onerror="' + imgFallbackHandler + '" onload="' + imgLoadCheckHandler + '">' +
        (options.badge ? '<span class="th-tour-card__badge th-tour-card__badge--exclusive">' + esc(options.badge) + '</span>' : '') +
        '</div>';
    }

    var hotelIdAttr = h.id ? ' data-th-hotel-id="' + esc(String(h.id)) + '"' : '';
    var tourIdAttr = tourIdStr ? ' data-th-tour-id="' + esc(tourIdStr) + '"' : '';
    var depCityAttr = depCity ? ' data-th-departure-city="' + esc(depCity) + '"' : '';
    var promoLeadBtn = (isPromo && options.promoLead !== false)
      ? buildPromoLeadButtonHtml({
          hotelName: h.name,
          hotelPrice: priceNum,
          hotelCountry: country,
          tourId: tourIdStr
        })
      : '';
    return (
      '<article class="th-tour-card' + modClass + '"' + skipPatch + hotelIdAttr + tourIdAttr + depCityAttr + '>' +
      mediaHtml +
      '<a href="' + esc(cardHref) + '"' + targetAttr + ' class="th-tour-card__link th-tour-card__link--main">' +
      '<div class="th-tour-card__body">' +
      '<p class="th-tour-card__geo">' + esc(country + (region ? ', ' + region : '')) + '</p>' +
      '<div class="th-tour-card__name-row">' +
      '<h3 class="th-tour-card__name">' + esc(h.name) + '</h3>' +
      (starsHtml ? '<span class="th-tour-card__stars">' + starsHtml + '</span>' : '') +
      '</div>' +
      (meal ? '<span class="th-tour-card__meal-badge">' + esc(meal) + '</span>' : '') +
      flightHtml +
      '<div class="th-tour-card__price-block">' +
      (oldPriceNum ? '<span class="th-tour-card__old-price">' + formatPrice(oldPriceNum) + '</span>' : '') +
      '<span class="th-tour-card__price-label">' + esc(pricePartyLabel) + '</span>' +
      (partyMismatch ? '<span class="th-tour-card__price-hint">Уточните цену для вашего состава</span>' : '') +
      '<span class="th-tour-card__price">' + formatPrice(priceNum) + '</span>' +
      (isPromo ? '<span class="th-tour-card__promo-label">\u0410\u043a\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u0446\u0435\u043d\u0430</span>' : '') +
      '<span class="th-tour-card__dates">' + esc(datesMeta) + '</span>' +
      '</div>' +
      '</div>' +
      '</a>' +
      '<div class="th-tour-card__actions">' +
      '<a href="' + esc(bookingHref(cardHref)) + '"' + targetAttr + ' class="th-tour-card__btn">' + esc(DETAIL_BTN_LABEL) + '</a>' +
      promoLeadBtn +
      '</div>' +
      '</article>'
    );
  }

  function renderList(hotels, options) {
    if (!hotels || !hotels.length) return '';
    var mapFn = options && options.mapHotel ? options.mapHotel : function (h) { return render(h, options); };
    return hotels.map(mapFn).join('');
  }

  global.THTourCard = {
    DETAIL_BTN_LABEL: DETAIL_BTN_LABEL,
    PHOTO_SLIDE_MAX: PHOTO_SLIDE_MAX,
    render: render,
    renderList: renderList,
    appendGalleryToDetailUrl: appendGalleryToDetailUrl,
    buildCarouselMediaHtml: buildCarouselMediaHtml,
    formatPrice: formatPrice,
    expandMeal: expandMeal,
    nightsLabel: nightsLabel,
    adultsLabel: adultsLabel,
    childAgeLabel: childAgeLabel,
    normalizeChildAges: normalizeChildAges,
    childsParam: childsParam,
    partyPriceLabel: partyPriceLabel,
    partySummaryLabel: partySummaryLabel,
    tourPartyMatches: tourPartyMatches,
    collectHotelPhotoRawUrls: collectHotelPhotoRawUrls,
    mapTourvisorImageUrl: mapTourvisorImageUrl,
    buildFlightBlockHtml: buildFlightBlockHtml,
    patchFlightsInContainer: patchFlightsInContainer,
    preloadCarouselImage: preloadCarouselImage,
    kickImagesInContainer: kickImagesInContainer,
    initCarouselsInContainer: initCarouselsInContainer,
    ensureCarouselsInContainer: ensureCarouselsInContainer,
    hydrateCarouselsFromHotelApi: hydrateCarouselsFromHotelApi,
    rebuildCarouselTrack: rebuildCarouselTrack,
    buildPromoLeadButtonHtml: buildPromoLeadButtonHtml,
    FALLBACK_IMG: FALLBACK_IMG
  };

  if (typeof document !== 'undefined') {
    function thTourCardBootCarousels() {
      ensureCarouselsInContainer(document);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', thTourCardBootCarousels);
    } else {
      thTourCardBootCarousels();
    }
    if (typeof MutationObserver !== 'undefined') {
      var thCarouselMoTimer = null;
      var thCarouselMo = new MutationObserver(function () {
        if (thCarouselMoTimer) clearTimeout(thCarouselMoTimer);
        thCarouselMoTimer = setTimeout(function () {
          ensureCarouselsInContainer(document);
        }, 60);
      });
      function thCarouselMoStart() {
        var targets = [
          document.getElementById('promo-tours-results'),
          document.getElementById('tv-search-results'),
          document.getElementById('country-tv-search-results'),
          document.getElementById('vip-tv-search-results'),
          document.getElementById('country-promo-results')
        ];
        targets.forEach(function (el) {
          if (el) thCarouselMo.observe(el, { childList: true, subtree: true });
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', thCarouselMoStart);
      } else {
        thCarouselMoStart();
      }
    }
  }
})(typeof window !== 'undefined' ? window : this);
