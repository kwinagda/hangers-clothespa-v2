(function () {
  'use strict';
  if (window.hangersAnalytics) return;
  var ID = 'G-D23MCHNN38';
  var CLARITY = 'yphkdk0bzr';
  var VERSION = '2026-09-29.1';
  // Exact-match routes are the fixed marketing pages. routePrefixes cover growing,
  // DB-backed content under those sections (individual blog posts, suburb pickup
  // pages) so newly published pages are tracked automatically without editing this
  // allowlist for every new slug.
  var routes = ['/', '/services', '/rate-chart', '/book-pickup', '/about', '/contact', '/corporate-accounts', '/monthly-plans', '/pickup-zones', '/blog', '/faq'];
  var routePrefixes = ['/blog/', '/pickup-zones/'];
  var hosts = ['hangers-cs.com', 'www.hangers-cs.com'];
  var consentKey = 'hangers_analytics_consent_v1';
  var consent = false, loaded = false, lastPath = '', seen = new Set(), bookingDone = new Set();
  var started = performance.now(), activeMs = 0, lastActivity = Date.now(), lastTick = Date.now();
  var funnelStep = '', pageEvents = 0, searchTimer, scrollTimer;
  function path() { return location.pathname.replace(/\/$/, '') || '/'; }
  function isTrackedPath(p) { return routes.includes(p) || routePrefixes.some(function (prefix) { return p.indexOf(prefix) === 0; }); }
  function publicPage() { return hosts.includes(location.hostname) && isTrackedPath(path()); }
  if (!publicPage()) return;
  function readConsent() {
    try {
      var saved = JSON.parse(localStorage.getItem(consentKey) || 'null');
      return saved && saved.version === 1 && saved.expires > Date.now() ? saved.allowed : null;
    } catch (_) { return null; }
  }
  function tag() { window.dataLayer.push(arguments); }
  window.dataLayer = window.dataLayer || [];
  window.gtag = tag;
  tag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  function referrer() {
    try {
      var u = new URL(document.referrer);
      return hosts.includes(u.hostname) ? (isTrackedPath(u.pathname) ? u.origin + u.pathname : '') : u.origin + '/';
    } catch (_) { return ''; }
  }
  var allowedParameters = ['page_path', 'page_location', 'page_referrer', 'page_title', 'step_name', 'method', 'destination', 'placement', 'category', 'sort_order', 'results_state', 'percent_scrolled', 'duration_ms', 'engagement_time_msec', 'http_status', 'error_type', 'field_name', 'metric_name', 'metric_value', 'lead_type', 'section_name'];
  function emit(name, params) {
    if (!consent || !loaded || !publicPage()) return;
    if (pageEvents++ > 300 && !/^(generate_lead|otp_|pickup_submit)/.test(name)) return;
    var currentPath = path();
    var contentGroup = currentPath === '/' ? 'home'
      : ['/services', '/rate-chart', '/monthly-plans', '/corporate-accounts'].includes(currentPath) ? 'services_and_pricing'
      : currentPath === '/book-pickup' ? 'booking'
      : currentPath === '/blog' || currentPath.indexOf('/blog/') === 0 ? 'journal'
      : currentPath === '/pickup-zones' || currentPath.indexOf('/pickup-zones/') === 0 ? 'coverage'
      : 'information';
    var safe = { send_to: ID, page_path: currentPath, page_location: location.origin + currentPath, page_referrer: referrer(), tracking_version: VERSION, content_group: contentGroup };
    Object.keys(params || {}).forEach(function (key) {
      if (allowedParameters.includes(key)) safe[key] = params[key];
    });
    tag('event', name, safe);
    if (window.clarity) window.clarity('event', name);
  }
  function once(name, params, key) {
    key = key || name;
    if (!consent || seen.has(key)) return;
    seen.add(key); emit(name, params);
  }
  function addScript(src) {
    var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); return s;
  }
  function load() {
    if (loaded || !publicPage()) return;
    loaded = true;
    tag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    tag('js', new Date());
    var config = { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: location.origin + path(), page_referrer: referrer() };
    var query = new URLSearchParams(location.search);
    var campaigns = { source: ['google', 'bing', 'instagram', 'facebook', 'whatsapp'], medium: ['organic', 'social', 'referral', 'email', 'cpc'], name: ['gbp_mulund', 'instagram_profile', 'whatsapp_share', 'local_search'] };
    ['source', 'medium', 'name'].forEach(function (key) {
      var value = query.get('utm_' + (key === 'name' ? 'campaign' : key));
      if (value) config['campaign_' + key] = campaigns[key].includes(value) ? value : 'other_campaign';
    });
    tag('config', ID, config);
    addScript('https://www.googletagmanager.com/gtag/js?id=' + ID);
    var initialPath = path();
    var vitals = addScript('/analytics-vendor/web-vitals.iife.js');
    vitals.onload = function () {
      if (!window.webVitals) return;
      function report(metric) {
        emit('web_vital', { metric_name: metric.name, metric_value: metric.value, page_path: initialPath, page_location: location.origin + initialPath });
      }
      ['onCLS', 'onLCP', 'onINP', 'onFCP', 'onTTFB'].forEach(function (method) { window.webVitals[method](report); });
    };
    // Do not replay a URL containing arbitrary query data or fragments.
    if (!location.search && !location.hash) {
      window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
      window.clarity('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' });
      addScript('https://www.clarity.ms/tag/' + CLARITY);
    }
    pageView();
  }
  function pageView() {
    if (!publicPage()) { window['ga-disable-' + ID] = true; if (window.clarity) window.clarity('stop'); return; }
    if (!consent || lastPath === path()) return;
    lastPath = path(); seen.clear(); pageEvents = 0; activeMs = 0; started = performance.now(); funnelStep = '';
    document.querySelectorAll('form.booking,.form-message,.confirmation-copy').forEach(function (el) { el.setAttribute('data-clarity-mask', 'true'); });
    emit('page_view', { page_title: 'Hangers - ' + (path() === '/' ? 'Home' : path().slice(1)) });
  }
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      pageView();
      return result;
    };
  });
  window.addEventListener('popstate', pageView);
  function saveConsent(allowed) {
    consent = allowed;
    try { localStorage.setItem(consentKey, JSON.stringify({ version: 1, allowed: allowed, expires: Date.now() + 180 * 86400000 })); } catch (_) {}
    document.getElementById('hangers-consent-panel')?.remove();
    if (allowed) { window['ga-disable-' + ID] = false; load(); }
    else {
      window['ga-disable-' + ID] = true;
      tag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      if (window.clarity) { window.clarity('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' }); window.clarity('stop'); }
      // Reload discards already-loaded recording code after withdrawal.
      if (loaded) location.reload();
    }
  }
  function showConsent() {
    if (document.getElementById('hangers-consent-panel')) return;
    var panel = document.createElement('section'); panel.id = 'hangers-consent-panel'; panel.setAttribute('aria-label', 'Analytics preferences');
    panel.innerHTML = '<strong>Help us improve your visit</strong><p>With your permission, Google Analytics measures visits and booking steps, and Microsoft Clarity records masked interactions for heatmaps. We do not send your form details or OTPs. Optional analytics stays off unless you accept.</p><div><button type="button" data-choice="no">Reject optional</button><button type="button" data-choice="yes">Accept analytics</button></div><small>You can change this choice using Analytics preferences below.</small>';
    panel.querySelector('[data-choice="no"]').onclick = function () { saveConsent(false); };
    panel.querySelector('[data-choice="yes"]').onclick = function () { saveConsent(true); };
    document.body.appendChild(panel);
  }
  function installUi() {
    var style = document.createElement('style');
    style.textContent = '#hangers-consent-panel{position:fixed;bottom:16px;left:16px;z-index:9999;box-sizing:border-box;width:min(460px,calc(100% - 32px));max-height:80vh;overflow:auto;padding:20px;border:1px solid #c8dce9;border-radius:8px;background:#fff;color:#10243a;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 24px #0002}#hangers-consent-panel p{margin:8px 0 14px}#hangers-consent-panel div{display:flex;gap:10px;flex-wrap:wrap}#hangers-consent-panel button{min-height:44px;flex:1;padding:10px;border:1px solid #023c62;border-radius:6px;background:#fff;color:#023c62;font:600 14px system-ui;cursor:pointer}#hangers-consent-panel button[data-choice=yes]{background:#023c62;color:#fff}#hangers-consent-panel small{display:block;margin-top:10px}#hangers-privacy-link{display:block;margin:12px auto;padding:10px;border:0;background:transparent;color:#023c62;text-decoration:underline;font:13px system-ui;cursor:pointer}';
    document.head.appendChild(style);
    var link = document.createElement('button'); link.id = 'hangers-privacy-link'; link.textContent = 'Analytics preferences'; link.type = 'button'; link.onclick = showConsent; document.body.appendChild(link);
    var choice = readConsent(); consent = choice === true;
    if (consent) load(); else if (choice === null) showConsent();
  }
  function placement(el) { return el.closest('header,nav') ? 'navigation' : el.closest('footer') ? 'footer' : 'content'; }
  function startForm() { if (path() === '/book-pickup') { once('pickup_form_start'); if (!funnelStep) funnelStep = 'form_started'; } }
  document.addEventListener('click', function (e) {
    var el = e.target instanceof Element ? e.target.closest('a,button') : null;
    if (!el || el.closest('#hangers-consent-panel') || el.id === 'hangers-privacy-link') return;
    lastActivity = Date.now();
    if (el.closest('form.booking')) startForm();
    if (el.closest('.counter')) {
      emit('service_quantity_change', { category: serviceCategory(el.closest('.service-count')?.querySelector('strong')?.textContent) });
      setTimeout(function () {
        if (Array.from(document.querySelectorAll('.counter b')).some(function (n) { return Number(n.textContent) > 0; })) once('pickup_step_complete', { step_name: 'services' }, 'step_services');
      }, 0);
    }
    if (el.matches('.hero-arrow,.hero-dot,.hero-play')) emit('carousel_interaction', { method: el.matches('.hero-play') ? 'play_pause' : 'change_slide' });
    if (el.matches('.rate-category-button')) emit('rate_filter', { method: 'category', category: serviceCategory(el.textContent) });
    if (el.matches('.rate-page-btn') && !el.disabled) emit('rate_pagination');
    if (el.tagName !== 'A') return;
    var u; try { u = new URL(el.href, location.href); } catch (_) { return; }
    var method = u.protocol === 'tel:' ? 'phone' : u.protocol === 'mailto:' ? 'email' : ['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(u.hostname) ? 'whatsapp' : /(^|\.)google\.(com|co.in)$/.test(u.hostname) && u.pathname.includes('maps') ? 'directions' : '';
    if (method) emit('contact_click', { method: method, placement: placement(el) });
    else if (u.origin === location.origin && isTrackedPath(u.pathname)) emit(u.pathname === '/book-pickup' ? 'pickup_cta_click' : 'navigation_click', { destination: u.pathname, placement: placement(el) });
  }, true);
  document.addEventListener('input', function (e) {
    lastActivity = Date.now();
    var el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest('form.booking')) startForm();
    if (el.matches('.rate-search')) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        // Record only search use and empty results, never the typed search term.
        emit('rate_search', { results_state: document.querySelector('.rate-empty') ? 'no_results' : 'results_found' });
      }, 900);
    }
  }, true);
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!(el instanceof Element)) return;
    if (el.matches('.rate-select')) emit('rate_filter', { method: el.classList.contains('rate-mobile-category-select') ? 'category' : 'sort', category: serviceCategory(el.selectedOptions?.[0]?.textContent), sort_order: ['category', 'name_asc', 'name_desc', 'price_low', 'price_high'].includes(el.value) ? el.value : 'not_applicable' });
    if (el.closest('form.booking')) {
      var form = el.closest('form');
      Array.from(form.querySelectorAll('.booking-step')).forEach(function (section, i) {
        var fields = Array.from(section.querySelectorAll('[required]'));
        if (fields.length && fields.every(function (f) { return f.validity.valid; })) once('pickup_step_complete', { step_name: i === 1 ? 'schedule' : 'contact_details' }, 'step_' + i);
      });
    }
  }, true);
  document.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el.closest?.('form.booking') || !el.validity || el.validity.valid) return;
    var known = ['name', 'preferredDate', 'preferredSlot', 'addressLine1', 'addressLine2', 'city', 'pincode'];
    var field = known.includes(el.name) ? el.name : el.type === 'tel' ? 'phone' : 'other';
    once('pickup_validation_error', { field_name: field, error_type: 'invalid_field' }, 'invalid_' + field);
  }, true);
  document.addEventListener('scroll', function () {
    lastActivity = Date.now(); clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      var height = document.documentElement.scrollHeight - innerHeight;
      if (height <= 0) return;
      var percent = 100 * scrollY / height;
      [25, 50, 75, 90].forEach(function (n) { if (percent >= n) once('scroll_depth', { percent_scrolled: n }, 'scroll_' + n); });
    }, 150);
  }, { passive: true });
  function flushEngagement() {
    if (activeMs > 0) { emit('active_engagement', { engagement_time_msec: activeMs, step_name: funnelStep || 'browsing' }); activeMs = 0; }
  }
  setInterval(function () {
    var now = Date.now();
    if (consent && document.visibilityState === 'visible' && now - lastActivity < 60000) activeMs += Math.min(now - lastTick, 1000);
    lastTick = now;
    if (activeMs >= 15000) flushEngagement();
    if (path() !== lastPath) pageView();
  }, 1000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushEngagement(); });
  window.addEventListener('pagehide', flushEngagement);
  window.addEventListener('error', function () { once('website_error', { error_type: 'javascript' }); });
  window.addEventListener('unhandledrejection', function () { once('website_error', { error_type: 'unhandled_promise' }); });

  function serviceCategory(text) {
    var name = String(text || '').toLowerCase();
    return /curtain/.test(name) ? 'curtains' : /sofa|carpet|furnish/.test(name) ? 'home_furnishings' : /shoe/.test(name) ? 'shoes' : /iron/.test(name) ? 'ironing' : /dry.?clean/.test(name) ? 'dry_cleaning' : /all/.test(name) ? 'all_services' : 'other';
  }
  document.addEventListener('toggle', function (e) {
    if (e.target.matches?.('.dp-faq details') && e.target.open) {
      var index = Array.from(document.querySelectorAll('.dp-faq details')).indexOf(e.target);
      emit('faq_open', { section_name: 'faq_' + (index + 1) });
    }
  }, true);
  var observed = new WeakSet(), visible = new Map();
  var sectionObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var params = { section_name: entry.target.getAttribute('data-analytics-section'), category: serviceCategory(entry.target.querySelector('h2,h3')?.textContent) };
        visible.set(entry.target, { params: params, milliseconds: 0 });
        once('section_view', params, 'section_' + params.section_name);
      } else {
        var state = visible.get(entry.target);
        if (state?.milliseconds >= 1000) emit('section_engagement', Object.assign({}, state.params, { duration_ms: state.milliseconds }));
        visible.delete(entry.target);
      }
    });
  }, { threshold: 0.25 }) : null;
  function scanSections() {
    document.querySelectorAll('form.booking,.form-message,.confirmation-copy').forEach(function (el) { el.setAttribute('data-clarity-mask', 'true'); });
    document.querySelectorAll('main section,main article,.home-section,.service-card').forEach(function (el, i) {
      if (observed.has(el) || !sectionObserver) return;
      observed.add(el); el.setAttribute('data-analytics-section', 'section_' + (i + 1)); sectionObserver.observe(el);
    });
  }
  var scanPending = false;
  new MutationObserver(function () {
    if (scanPending) return;
    scanPending = true; setTimeout(function () { scanPending = false; scanSections(); }, 200);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(function () {
    if (!consent || !publicPage() || document.visibilityState !== 'visible' || Date.now() - lastActivity >= 60000) return;
    visible.forEach(function (state) {
      state.milliseconds += 1000;
      if (state.milliseconds >= 15000) { emit('section_engagement', Object.assign({}, state.params, { duration_ms: state.milliseconds })); state.milliseconds = 0; }
    });
  }, 1000);
  scanSections();

  // Observe only the public pickup API. Never inspect request bodies, headers or
  // form values; never await telemetry or alter the promise returned to the app.
  var originalFetch = window.fetch;
  window.fetch = function (input, init) {
    var promise = originalFetch.apply(this, arguments);
    try {
      var u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      var method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      var endpoint = u.pathname.match(/\/pickup-requests(\/send-otp|\/verify-otp)?$/);
      var trustedHost = ['hangers-cs.com', 'api.hangers-cs.com', 'crm.hangers-cs.com', 'mbfg6gyled.execute-api.ap-south-1.amazonaws.com'].includes(u.hostname);
      if (!publicPage() || path() !== '/book-pickup' || method !== 'POST' || !endpoint || !trustedHost) return promise;
      var operation = endpoint[1] === '/send-otp' ? 'otp_request' : endpoint[1] === '/verify-otp' ? 'otp_verify' : 'pickup_submit';
      var begin = performance.now();
      emit(operation + '_started'); funnelStep = operation;
      promise.then(function (response) {
        response.clone().json().then(function (body) {
          var ok = response.ok && body.success === true;
          emit(operation + (ok ? '_success' : '_failed'), { http_status: response.status, duration_ms: Math.round(performance.now() - begin), error_type: ok ? 'none' : 'api_rejected' });
          if (ok && operation === 'pickup_submit' && body.data?.request?.requestNumber) {
            var key = body.data.request.requestNumber;
            if (!bookingDone.has(key)) {
              bookingDone.add(key); funnelStep = 'confirmed';
              once('generate_lead', { lead_type: 'pickup', duration_ms: Math.round(performance.now() - started) }, 'lead_' + key);
            }
          }
        }).catch(function () { emit(operation + '_failed', { error_type: 'invalid_response', http_status: response.status }); });
      }, function () { emit(operation + '_failed', { error_type: 'network', duration_ms: Math.round(performance.now() - begin) }); }).catch(function () { /* Ignore a response that cannot be cloned. */ });
    } catch (_) { /* Measurement must never interrupt booking. */ }
    return promise;
  };
  window.hangersAnalytics = { version: VERSION, preferences: showConsent };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUi, { once: true }); else installUi();
})();
