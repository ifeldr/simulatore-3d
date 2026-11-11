/* Calcolatore costo stampa 3D da file STL, v1.10 per Jekyll / GitHub Pages (filamento e resina, italiano e inglese, euro e dollari) */
(function () {
  'use strict';
  // Percorso di questo script: serve per caricare la libreria Excel che sta nella stessa cartella
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

  /* ============ VALORI PREDEFINITI ============
     Non serve modificarli: prezzi e parametri si impostano in _data/calcolatore_3d.yml.
     Questi valori si usano solo se il file manca o se un campo non è valido. */
  var CONFIG = {
    contactEmail: 'preventivi@tuosito.it',  // dove arrivano le richieste
    vat: 0.22,                 // IVA
    machineRate: 0.30,         // € per ora di usura della stampante (l'energia è a parte)
    energyPrice: 0.30,         // € per kWh di energia elettrica (modificabile nella pagina)
    powerW: 120,               // consumo medio in stampa in watt, se non ci sono stampanti
    setupFee: 5.00,            // € fissi per ordine (preparazione, slicing, imballo)
    minOrder: 10.00,           // € imponibile minimo per ordine
    markup: 0.30,              // ricarico sul costo di materiale e macchina (0.30 = 30%)
    waste: 0.05,               // scarto materiale (spurghi, skirt, prove)
    failRate: 0.05,            // stampe fallite: quota di costo in più per le stampe da rifare (modificabile nella pagina)
    colorChange: { grams: 0.8, sec: 60 }, // filamento spurgato e tempo per ogni cambio colore
    maxFileMB: 80,             // dimensione massima di ogni file
    maxFiles: 20,              // numero massimo di file per preventivo
    buildVolume: [256, 256, 256], // area di stampa della stampante più grande, in mm
    wallThickness: 0.8,        // mm di pareti e strati pieni sopra/sotto (2 perimetri da 0,4)
    heatUpMinutes: 5,          // riscaldamento e preparazione per lavoro
    layerOverheadSec: 2,       // secondi persi a ogni cambio strato
    supports: { material: 0.15, time: 0.10 }, // maggiorazione con supporti
    usdRate: 1.12,             // cambio 1 € = X $ (da _data/calcolatore_3d.yml, cambio_eur_usd)
    printers: [],              // stampanti selezionabili (da _data/calcolatore_3d.yml); vuoto = nessun menu
    resin: {                   // stampa a resina
      wall: 2.0,               // mm di parete per i pezzi svuotati
      supports: 0.10,          // resina in più per i supporti
      post: 1.00,              // € per ogni stampa (piatto) per lavaggio e polimerizzazione (alcol, guanti, carta)
      plateFill: 0.6,          // quota del piatto realmente occupabile dai pezzi
      layerSec: 5              // secondi per strato, se la stampante non lo indica
    },
    quantityDiscounts: [       // sconto a partire da N pezzi
      { min: 10, pct: 0.05 },
      { min: 50, pct: 0.10 }
    ],
    // flow = mm³ al secondo di portata media reale (calibrala confrontando con il tuo slicer)
    qualities: [
      { id: 'draft',    label: 'Bozza',    layer: 0.28, flow: 9,   resinLayer: 0.10 },
      { id: 'standard', label: 'Standard', layer: 0.20, flow: 6,   resinLayer: 0.05, default: true },
      { id: 'fine',     label: 'Fine',     layer: 0.12, flow: 3.5, resinLayer: 0.03 }
    ],
    // density in g/cm³, speed = fattore di velocità rispetto al PLA, color = colore anteprima
    materials: [
      { id: 'pla',  name: 'PLA',             density: 1.24, pricePerKg: 25, speed: 1.0,  color: '#E9E4DA' },
      { id: 'petg', name: 'PETG',            density: 1.27, pricePerKg: 28, speed: 0.9,  color: '#7FB3CF' },
      { id: 'abs',  name: 'ABS',             density: 1.04, pricePerKg: 27, speed: 0.9,  color: '#A9AEB6' },
      { id: 'asa',  name: 'ASA (per esterni)', density: 1.07, pricePerKg: 32, speed: 0.9,  color: '#D8CDB4' },
      { id: 'tpu',  name: 'TPU (flessibile)',  density: 1.21, pricePerKg: 40, speed: 0.45, color: '#E5673E' }
    ]
  };
  /* ==================================================== */

  // ---------- Lingua ----------
  // I testi arrivano da _data/testi/<lingua>.yml tramite l'include (blocco c3d-lang).
  var LANG = { lang: 'it', locale: 'it-IT', js: {} };
  try {
    var langEl = document.getElementById('c3d-lang');
    if (langEl) { var lj = JSON.parse(langEl.textContent); if (lj && typeof lj === 'object') LANG = lj; LANG.js = LANG.js || {}; }
  } catch (e) {}
  var EN = LANG.lang === 'en';
  function T(key, vars) {
    var t = LANG.js[key];
    if (typeof t !== 'string') t = key;
    if (vars) Object.keys(vars).forEach(function (k) { t = t.split('{' + k + '}').join(vars[k]); });
    return t;
  }
  // Testo nella lingua della pagina: campo "<nome>_en" nella versione inglese, se presente
  function loc(r, campo) { return EN && r[campo + '_en'] ? String(r[campo + '_en']) : (r[campo] === undefined || r[campo] === null ? '' : String(r[campo])); }

  // Le impostazioni vere arrivano da _data/calcolatore_3d.yml tramite l'include di Jekyll.
  // Ogni valore mancante o non valido mantiene quello predefinito qui sopra.
  function applySiteData(d) {
    if (!d || typeof d !== 'object') return;
    function n(v, min, max) {
      if (typeof v === 'string') v = parseFloat(v.replace(',', '.'));
      return (typeof v === 'number' && isFinite(v)) ? Math.min(max, Math.max(min, v)) : undefined;
    }
    function pct(v, max) { var x = n(v, 0, max); return x === undefined ? undefined : x / 100; }
    function set(obj, key, v) { if (v !== undefined) obj[key] = v; }

    if (typeof d.email_preventivi === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email_preventivi.trim())) {
      CONFIG.contactEmail = d.email_preventivi.trim();
    }
    set(CONFIG, 'vat', pct(d.iva_percento, 100));
    set(CONFIG, 'usdRate', n(d.cambio_eur_usd, 0.01, 100));
    set(CONFIG, 'machineRate', n(d.costo_orario, 0, 1000));
    set(CONFIG, 'energyPrice', n(d.costo_energia_kwh, 0, 10));
    set(CONFIG, 'powerW', n(d.potenza_w, 0, 10000));
    set(CONFIG, 'setupFee', n(d.preparazione_ordine, 0, 100000));
    set(CONFIG, 'minOrder', n(d.ordine_minimo, 0, 100000));
    set(CONFIG, 'markup', pct(d.ricarico_percento, 1000));
    set(CONFIG, 'waste', pct(d.scarto_percento, 100));
    set(CONFIG, 'failRate', pct(d.stampe_fallite_percento, 100));
    set(CONFIG.colorChange, 'grams', n(d.cambio_colore_spurgo_g, 0, 100));
    set(CONFIG.colorChange, 'sec', n(d.cambio_colore_secondi, 0, 3600));
    var mf = n(d.max_file, 1, 100);
    set(CONFIG, 'maxFiles', mf === undefined ? undefined : Math.round(mf));
    set(CONFIG, 'maxFileMB', n(d.max_mb_per_file, 1, 500));
    if (Array.isArray(d.area_stampa_mm) && d.area_stampa_mm.length === 3) {
      var bv = d.area_stampa_mm.map(function (x) { return n(x, 1, 5000); });
      if (bv.every(function (x) { return x !== undefined; })) CONFIG.buildVolume = bv;
    }
    set(CONFIG, 'wallThickness', n(d.spessore_pareti_mm, 0.1, 10));
    set(CONFIG, 'heatUpMinutes', n(d.riscaldamento_minuti, 0, 240));
    set(CONFIG, 'layerOverheadSec', n(d.cambio_strato_secondi, 0, 60));
    set(CONFIG.supports, 'material', pct(d.supporti_materiale_percento, 500));
    set(CONFIG.supports, 'time', pct(d.supporti_tempo_percento, 500));
    set(CONFIG.resin, 'wall', n(d.resina_pareti_mm, 0.5, 20));
    set(CONFIG.resin, 'supports', pct(d.resina_supporti_percento, 500));
    set(CONFIG.resin, 'post', n(d.resina_post_lavorazione, 0, 1000));
    set(CONFIG.resin, 'plateFill', pct(d.resina_occupazione_piatto_percento, 100));

    if (Array.isArray(d.stampanti)) {
      var ps = d.stampanti.map(function (r, i) {
        if (!r || r.nome === undefined || r.nome === null || r.nome === '') return null;
        var area = Array.isArray(r.area_stampa_mm) && r.area_stampa_mm.length === 3
          ? r.area_stampa_mm.map(function (x) { return n(x, 1, 5000); }) : null;
        if (!area || area.some(function (x) { return x === undefined; })) area = CONFIG.buildVolume.slice();
        var rate = n(r.costo_orario, 0, 1000), sp = n(r.velocita, 0.1, 10), pw = n(r.potenza_w, 0, 10000), ls = n(r.secondi_strato, 0.5, 120);
        return {
          id: 'p' + (i + 1), model: String(r.nome), brand: r.marca ? String(r.marca) : T('otherBrand'),
          name: (r.marca ? String(r.marca) + ' ' : '') + String(r.nome), buildVolume: area,
          machineRate: rate === undefined ? CONFIG.machineRate : rate,
          speed: sp === undefined ? 1 : sp,
          powerW: pw === undefined ? CONFIG.powerW : pw,
          enclosed: r.chiusa === true,
          materials: Array.isArray(r.materiali) && r.materiali.length ? r.materiali.map(function (x) { return String(x); }) : null,
          note: loc(r, 'note'),
          tech: r.tecnologia === 'resina' ? 'resina' : 'filamento',
          layerSec: ls === undefined ? CONFIG.resin.layerSec : ls,
          default: r.predefinita === true
        };
      }).filter(Boolean);
      if (ps.length) {
        var pf = false;
        ps.forEach(function (x) { if (x.default && !pf) pf = true; else x.default = false; });
        if (!pf) ps[0].default = true;
        CONFIG.printers = ps;
      }
    }

    if (Array.isArray(d.sconti_quantita)) {
      CONFIG.quantityDiscounts = d.sconti_quantita.map(function (r) {
        var min = n(r && r.da_pezzi, 1, 100000), p = pct(r && r.sconto_percento, 100);
        return (min !== undefined && p !== undefined) ? { min: Math.round(min), pct: p } : null;
      }).filter(Boolean);
    }

    if (Array.isArray(d.qualita)) {
      var qs = d.qualita.map(function (r, i) {
        if (!r || r.nome === undefined || r.nome === null || r.nome === '') return null;
        var layer = n(r.strato_mm, 0.01, 2), flow = n(r.portata_mm3s, 0.1, 200);
        if (layer === undefined || flow === undefined) return null;
        var rl = n(r.strato_resina_mm, 0.01, 0.5);
        return { id: 'q' + (i + 1), label: loc(r, 'nome'), layer: layer, flow: flow,
                 resinLayer: rl === undefined ? (layer >= 0.24 ? 0.1 : layer >= 0.16 ? 0.05 : 0.03) : rl, default: r.predefinita === true };
      }).filter(Boolean);
      if (qs.length) {
        var found = false;
        qs.forEach(function (q) { if (q.default && !found) found = true; else q.default = false; });
        if (!found) qs[0].default = true;
        CONFIG.qualities = qs;
      }
    }

    if (Array.isArray(d.materiali)) {
      var ms = d.materiali.map(function (r, i) {
        if (!r || r.nome === undefined || r.nome === null || r.nome === '') return null;
        var dens = n(r.densita, 0.1, 25), price = n(r.prezzo_kg, 0, 100000);
        if (dens === undefined || price === undefined) return null;
        var speed = n(r.velocita, 0.05, 5);
        var color = (typeof r.colore === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(r.colore.trim())) ? r.colore.trim() : '#E9E4DA';
        return { id: 'm' + (i + 1), name: loc(r, 'nome'), baseName: String(r.nome), density: dens, pricePerKg: price,
                 speed: speed === undefined ? 1 : speed, color: color,
                 tech: r.tecnologia === 'resina' ? 'resina' : 'filamento' };
      }).filter(Boolean);
      if (ms.length) CONFIG.materials = ms;
    }
  }
  try {
    var cfgEl = document.getElementById('c3d-config');
    if (cfgEl) applySiteData(JSON.parse(cfgEl.textContent));
  } catch (e) {
    if (window.console) console.warn('Calcolatore 3D: impostazioni non leggibili, uso i valori predefiniti.', e);
  }

  var root = document.getElementById('c3d-calc');
  if (!root || root.getAttribute('data-ready')) return;
  root.setAttribute('data-ready', '1');

  function $(id) { return document.getElementById(id); }
  var el = {
    plate: $('c3d-plate'), canvas: $('c3d-canvas'), drop: $('c3d-drop'), pick: $('c3d-pick'),
    file: $('c3d-file'), overlay: $('c3d-overlay'), fname: $('c3d-fname'), dims: $('c3d-dims'),
    hint: $('c3d-hint'), msg: $('c3d-msg'), listWrap: $('c3d-list-wrap'), list: $('c3d-files'), add: $('c3d-add'),
    currency: $('c3d-currency'), energyUnit: $('c3d-energy-unit'),
    printer: $('c3d-printer'), brand: $('c3d-brand'), tech: $('c3d-tech'), techField: $('c3d-tech-field'),
    infillField: $('c3d-infill-field'), hollowField: $('c3d-hollow-field'), hollow: $('c3d-hollow'), energy: $('c3d-energy'), printerField: $('c3d-printer-field'), printerInfo: $('c3d-printer-info'),
    material: $('c3d-material'), applyAll: $('c3d-apply-all'), quality: $('c3d-quality'), infill: $('c3d-infill'),
    infillOut: $('c3d-infill-out'), unit: $('c3d-unit'), supports: $('c3d-supports'),
    empty: $('c3d-empty'), out: $('c3d-out'), pieces: $('c3d-pieces'), weight: $('c3d-weight'),
    time: $('c3d-time'), lines: $('c3d-lines'), total: $('c3d-total'), totalLabel: $('c3d-total-label'), summary: $('c3d-summary'), cta: $('c3d-cta'),
    price: $('c3d-price'), priceName: $('c3d-price-name'), priceUnit: $('c3d-price-unit'), priceHelp: $('c3d-price-help'), priceReset: $('c3d-price-reset'),
    thumb: $('c3d-thumb'), nothumb: $('c3d-nothumb'), fail: $('c3d-fail'),
    cmp: $('c3d-cmp'), cmpFile: $('c3d-cmp-file'), cmpHelp: $('c3d-cmp-help'), cmpList: $('c3d-cmp-list'), cmpMore: $('c3d-cmp-more'),
    xlsOut: $('c3d-xls-out'), xlsIn: $('c3d-xls-in'), xlsFile: $('c3d-xls-file'), xlsMsg: $('c3d-xls-msg')
  };

  // ---------- Valuta ----------
  // Tutti i calcoli sono in euro; gli importi vengono convertiti solo quando si mostrano.
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var currency = leggi('c3d-valuta');
  if (currency !== 'EUR' && currency !== 'USD') {
    var nl = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    currency = EN && /-US$/i.test(nl) ? 'USD' : 'EUR';
  }
  function rate() { return currency === 'USD' ? CONFIG.usdRate : 1; }
  var moneyFmt;
  function makeMoney() { moneyFmt = new Intl.NumberFormat(LANG.locale, { style: 'currency', currency: currency, currencyDisplay: 'narrowSymbol' }); }
  makeMoney();
  var money = { format: function (eur) { return moneyFmt.format(eur * rate()); } };
  var num1 = new Intl.NumberFormat(LANG.locale, { maximumFractionDigits: 1 });
  var num0 = new Intl.NumberFormat(LANG.locale, { maximumFractionDigits: 0 });
  var num2 = new Intl.NumberFormat(LANG.locale, { maximumFractionDigits: 2 });
  var num2f = new Intl.NumberFormat(LANG.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------- Opzioni dinamiche ----------
  CONFIG.materials.forEach(function (m) {
    var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; o.setAttribute('data-nome', m.name); o.setAttribute('data-tech', m.tech); el.material.appendChild(o);
  });
  CONFIG.qualities.forEach(function (q) {
    var id = 'c3d-q-' + q.id;
    var input = document.createElement('input');
    input.type = 'radio'; input.name = 'c3d-quality'; input.id = id; input.value = q.id; input.checked = !!q.default;
    var label = document.createElement('label'); label.htmlFor = id;
    var small = document.createElement('small');
    small.textContent = num2f.format(q.layer) + ' mm' +
      (CONFIG.printers.some(function (p) { return p.tech === 'resina'; }) ? T('resinLayer', { n: num2f.format(q.resinLayer) }) : '');
    label.appendChild(document.createTextNode(q.label)); label.appendChild(small);
    el.quality.appendChild(input); el.quality.appendChild(label);
  });

  // ---------- Stampante ----------
  // Tre menu collegati: tecnologia -> marca -> modello; il valore del menu modello è l'id della stampante.
  function techs() {
    var out = [];
    CONFIG.printers.forEach(function (p) { if (out.indexOf(p.tech) < 0) out.push(p.tech); });
    return out;
  }
  function techLabel(t) { return t === 'resina' ? T('resin') : T('filament'); }
  function fillTechs(techSel) {
    techs().forEach(function (t) {
      var o = document.createElement('option'); o.value = t; o.textContent = techLabel(t); techSel.appendChild(o);
    });
  }
  function fillBrands(techSel, brandSel) {
    brandSel.innerHTML = '';
    var out = [];
    CONFIG.printers.forEach(function (p) { if (p.tech === techSel.value && out.indexOf(p.brand) < 0) out.push(p.brand); });
    out.forEach(function (b) {
      var o = document.createElement('option'); o.value = b; o.textContent = b; brandSel.appendChild(o);
    });
  }
  function fillModels(techSel, brandSel, modelSel, keepId) {
    modelSel.innerHTML = '';
    CONFIG.printers.forEach(function (p) {
      if (p.tech !== techSel.value || p.brand !== brandSel.value) return;
      var o = document.createElement('option'); o.value = p.id; o.textContent = p.model; modelSel.appendChild(o);
    });
    if (keepId && modelSel.querySelector('option[value="' + keepId + '"]')) modelSel.value = keepId;
  }
  function setPicker(techSel, brandSel, modelSel, id) {
    var p = CONFIG.printers.filter(function (x) { return x.id === id; })[0] || CONFIG.printers[0];
    techSel.value = p.tech; fillBrands(techSel, brandSel);
    brandSel.value = p.brand; fillModels(techSel, brandSel, modelSel, p.id);
  }
  // Collega i tre menu: cambiando tecnologia o marca si propone il primo modello disponibile
  function wirePicker(techSel, brandSel, modelSel, onChange) {
    techSel.addEventListener('change', function () { fillBrands(techSel, brandSel); fillModels(techSel, brandSel, modelSel); onChange(); });
    brandSel.addEventListener('change', function () { fillModels(techSel, brandSel, modelSel); onChange(); });
    modelSel.addEventListener('change', onChange);
  }
  if (CONFIG.printers.length) {
    fillTechs(el.tech);
    el.techField.hidden = techs().length < 2;
    var pDef = CONFIG.printers.filter(function (p) { return p.default; })[0] || CONFIG.printers[0];
    setPicker(el.tech, el.brand, el.printer, pDef.id);
    el.printerField.hidden = false;
  }
  // Stampante per id; senza id restituisce quella scelta per i nuovi file
  function printer(id) {
    if (!CONFIG.printers.length) return null;
    if (id === undefined) id = el.printer.value;
    return CONFIG.printers.filter(function (p) { return p.id === id; })[0] || CONFIG.printers[0];
  }
  function printerOf(m) { return printer(m.printerId); }
  function buildVolume(p) { return p ? p.buildVolume : CONFIG.buildVolume; }
  function machineRate(p) { return p ? p.machineRate : CONFIG.machineRate; }
  function powerKW(p) { return (p ? p.powerW : CONFIG.powerW) / 1000; }
  // Costo dell'energia: il valore inserito nella pagina viene ricordato su questo browser
  // Il prezzo dell'energia si salva in euro e si mostra nella valuta scelta
  var energyEUR = parseFloat(leggi('c3d-energia'));
  if (!(isFinite(energyEUR) && energyEUR >= 0)) energyEUR = CONFIG.energyPrice;
  function showEnergy() {
    el.energy.value = String(Math.round(energyEUR * rate() * 1000) / 1000);
    el.energyUnit.textContent = (currency === 'USD' ? '$' : '€') + '/kWh';
  }
  showEnergy();
  function energyPrice() { return energyEUR; }

  // Stampe fallite: percentuale in più sul costo per coprire le stampe da rifare, ricordata su questo browser
  var failPct = parseFloat(leggi('c3d-fallite'));
  if (!(isFinite(failPct) && failPct >= 0 && failPct <= 100)) failPct = CONFIG.failRate * 100;
  function failRate() { return failPct / 100; }
  if (el.fail) el.fail.value = String(failPct);

  // Prezzo del materiale: chi usa il simulatore può mettere quello che paga davvero la bobina (o la resina).
  // Vale per tutti i file con quel materiale, si salva in euro su questo browser ed è indicato per nome
  // (non per posizione), così resta valido anche se l'elenco dei materiali cambia.
  var myPrices = {};
  try { var mp = JSON.parse(leggi('c3d-prezzi') || '{}'); if (mp && typeof mp === 'object') Object.keys(mp).forEach(function (k) { var v = +mp[k]; if (isFinite(v) && v >= 0) myPrices[k] = v; }); } catch (e) {}
  function matKey(mt) { return mt.baseName || mt.name; }
  function priceKg(mt) { var k = matKey(mt); return k in myPrices ? myPrices[k] : mt.pricePerKg; }
  function savePrices() { scrivi('c3d-prezzi', JSON.stringify(myPrices)); }
  function showPrice(force) {
    if (!el.price) return;
    var mt = matById(el.material.value), custom = matKey(mt) in myPrices;
    var sym = currency === 'USD' ? '$' : '€';
    if (force || document.activeElement !== el.price) el.price.value = String(Math.round(priceKg(mt) * rate() * 100) / 100);
    el.priceName.textContent = mt.tech === 'resina' ? T('priceResin') : T('priceSpool');
    el.priceUnit.textContent = sym + '/kg';
    el.price.classList.toggle('is-custom', custom);
    el.priceHelp.textContent = custom
      ? T('priceCustom', { material: mt.name, def: money.format(mt.pricePerKg) + '/kg' })
      : T('priceDefault', { material: mt.name });
    el.priceReset.hidden = !custom;
  }
  function printerSpeed(p) { return p ? p.speed : 1; }
  function techOf(p) { return p ? p.tech : 'filamento'; }
  // Un materiale è stampabile se la stampante non ha un elenco o se il nome compare nell'elenco
  // (basta la prima parola: "ASA" vale anche per "ASA (per esterni)").
  function primaParola(t) { return String(t).trim().split(/[\s(]/)[0].toLowerCase(); }
  function materialAllowed(mt, p) {
    if (mt.tech !== techOf(p)) return false;
    if (!p || !p.materials) return true;
    return p.materials.some(function (x) { return primaParola(x) === primaParola(mt.baseName || mt.name); });
  }
  function refreshMaterialOptions() {
    var sels = [{ sel: el.material, p: printer() }].concat(models.map(function (m) { return { sel: m.row.matSel, p: printerOf(m) }; }));
    sels.forEach(function (x) {
      var sel = x.sel;
      Array.prototype.forEach.call(sel.options, function (op) {
        var ok = materialAllowed(matById(op.value), x.p);
        var otherTech = matById(op.value).tech !== techOf(x.p);
        op.hidden = otherTech;
        op.disabled = !ok;
        op.textContent = op.getAttribute('data-nome') + (ok ? '' : (sel === el.material ? T('notAvailable') : ' ✗'));
      });
    });
    // Se il materiale scelto è dell'altra tecnologia, si passa al primo materiale adatto
    function firstFor(p) { return CONFIG.materials.filter(function (mt) { return materialAllowed(mt, p); })[0]; }
    if (!materialAllowed(matById(el.material.value), printer())) {
      var first = firstFor(printer());
      if (first) el.material.value = first.id;
    }
    models.forEach(function (m) {
      if (matById(m.materialId).tech !== techOf(printerOf(m))) {
        var f = firstFor(printerOf(m));
        if (f) { m.materialId = f.id; m.row.matSel.value = f.id; }
      }
      var resin = techOf(printerOf(m)) === 'resina';
      m.row.infLabel.hidden = resin || !!m.sliced; m.row.holLabel.hidden = !resin || !!m.sliced;
      if (m.row.ccLabel) m.row.ccLabel.hidden = resin || !!m.sliced;
    });
    showPrice();
    var resinDef = techOf(printer()) === 'resina';
    el.infillField.hidden = resinDef; el.hollowField.hidden = !resinDef;
    var p = printer();
    if (p) {
      var b = p.buildVolume.map(function (x) { return num0.format(x); }).join(' × ');
      el.printerInfo.textContent = T('buildArea', { dims: b }) + (p.tech === 'resina' ? '' : (p.enclosed ? T('enclosed') : '')) + (p.note ? '. ' + p.note : '');
    }
  }

  function setMsg(text, kind) {
    el.msg.textContent = text || '';
    el.msg.className = 'c3d-msg' + (kind ? ' is-' + kind : '');
  }

  // @@parse-start
  function parseSTL(buffer) {
    var dv = new DataView(buffer);
    var isBinary = false;
    if (buffer.byteLength >= 84) {
      var n = dv.getUint32(80, true);
      if (84 + n * 50 === buffer.byteLength) isBinary = true;
    }
    if (!isBinary) {
      var head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength)));
      if (!/^\s*solid/i.test(head) || !/facet|endsolid/i.test(head)) {
        if (buffer.byteLength >= 84) isBinary = true; // header binario che inizia per "solid"
      }
    }
    var pos;
    if (isBinary) {
      var count = dv.getUint32(80, true);
      if (count === 0 || 84 + count * 50 > buffer.byteLength) throw new Error(T('errBinary'));
      pos = new Float32Array(count * 9);
      for (var i = 0; i < count; i++) {
        var off = 84 + i * 50 + 12;
        for (var j = 0; j < 9; j++) pos[i * 9 + j] = dv.getFloat32(off + j * 4, true);
      }
    } else {
      var text = new TextDecoder().decode(new Uint8Array(buffer));
      var re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g, m, arr = [];
      while ((m = re.exec(text))) arr.push(+m[1], +m[2], +m[3]);
      if (arr.length < 9) throw new Error(T('errNoTriangles'));
      arr.length -= arr.length % 9;
      pos = new Float32Array(arr);
    }
    return pos;
  }

  function meshStats(pos) {
    var vol = 0, area = 0, tris = pos.length / 9;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < pos.length; i += 9) {
      var ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
      var bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
      var cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
      // volume con segno del tetraedro origine-triangolo
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
      for (var k = 0; k < 9; k += 3) {
        for (var d = 0; d < 3; d++) {
          var v = pos[i + k + d];
          if (v < min[d]) min[d] = v;
          if (v > max[d]) max[d] = v;
        }
      }
    }
    return { tris: tris, vol: Math.abs(vol), area: area, min: min, max: max,
             size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
  }

  // ---------- 3MF e G-code ----------
  // Un 3MF è un archivio ZIP: lo si apre nel browser con DecompressionStream, senza librerie esterne.
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  function readZip(buffer) {
    var b = new Uint8Array(buffer), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(T('err3mf'));
    var count = u16(b, eocd + 10), off = u32(b, eocd + 16), entries = {};
    // ZIP64: le posizioni stanno nel record "end of central directory" a 64 bit
    if (off === 0xFFFFFFFF || count === 0xFFFF) {
      var loc = eocd - 20;
      if (loc >= 0 && u32(b, loc) === 0x07064b50) {
        var z = u32(b, loc + 8);
        if (u32(b, z) === 0x06064b50) { count = u32(b, z + 32); off = u32(b, z + 48); }
      }
    }
    var dec = new TextDecoder();
    for (var n = 0; n < count && off + 46 <= b.length; n++) {
      if (u32(b, off) !== 0x02014b50) break;
      var method = u16(b, off + 10), csize = u32(b, off + 20), usize = u32(b, off + 24);
      var nlen = u16(b, off + 28), xlen = u16(b, off + 30), clen = u16(b, off + 32), lho = u32(b, off + 42);
      var name = dec.decode(b.subarray(off + 46, off + 46 + nlen));
      var x = off + 46 + nlen, xe = x + xlen;
      while (x + 4 <= xe) {   // campo extra ZIP64
        var id = u16(b, x), sz = u16(b, x + 2), p = x + 4;
        if (id === 1) {
          if (usize === 0xFFFFFFFF) { usize = u32(b, p) + u32(b, p + 4) * 4294967296; p += 8; }
          if (csize === 0xFFFFFFFF) { csize = u32(b, p) + u32(b, p + 4) * 4294967296; p += 8; }
          if (lho === 0xFFFFFFFF) { lho = u32(b, p) + u32(b, p + 4) * 4294967296; }
        }
        x += 4 + sz;
      }
      entries[name.replace(/^\/+/, '').toLowerCase()] = { name: name, method: method, csize: csize, usize: usize, lho: lho };
      off = xe + clen;
    }
    function get(path) {
      var e = entries[String(path).replace(/^\/+/, '').toLowerCase()];
      if (!e) return Promise.resolve(null);
      if (u32(b, e.lho) !== 0x04034b50) return Promise.reject(new Error(T('err3mf')));
      var start = e.lho + 30 + u16(b, e.lho + 26) + u16(b, e.lho + 28);
      var data = b.subarray(start, start + e.csize);
      if (e.method === 0) return Promise.resolve(data);
      if (e.method !== 8 || typeof DecompressionStream === 'undefined') return Promise.reject(new Error(T('err3mfBrowser')));
      var ds = new DecompressionStream('deflate-raw');
      var out = new Blob([data]).stream().pipeThrough(ds);
      return new Response(out).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    function text(path) { return get(path).then(function (d) { return d ? new TextDecoder().decode(d) : null; }); }
    return { names: Object.keys(entries).map(function (k) { return entries[k].name.replace(/^\/+/, ''); }), get: get, text: text };
  }

  function attrs(s) {
    var o = {}, re = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g, m;
    while ((m = re.exec(s))) o[(m[1] || m[3]).toLowerCase()] = m[1] ? m[2] : m[4];
    return o;
  }
  // Matrice 3MF (12 valori, convenzione a vettore riga): p' = p × M
  var IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  function parseMatrix(t) {
    if (!t) return IDENT;
    var v = String(t).trim().split(/\s+/).map(Number);
    return v.length === 12 && v.every(isFinite) ? v : IDENT;
  }
  function mulM(a, b) {   // prima a, poi b
    var r = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    for (var k = 0; k < 3; k++) r[9 + k] = a[9] * b[k] + a[10] * b[3 + k] + a[11] * b[6 + k] + b[9 + k];
    return r;
  }
  var UNITS = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

  function parseModelXML(xml) {
    var unitM = /<(?:\w+:)?model\b[^>]*\bunit\s*=\s*"(\w+)"/i.exec(xml);
    var file = { unit: UNITS[unitM ? unitM[1].toLowerCase() : 'millimeter'] || 1, objects: {}, build: [] };
    var reObj = /<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g, mo;
    while ((mo = reObj.exec(xml))) {
      var a = attrs(mo[1]), body = mo[2], obj = { comps: [] };
      if (/<(?:\w+:)?mesh\b/.test(body)) {
        var vs = [], ts = [], mv, mt;
        var reV = /<(?:\w+:)?vertex\b([^>]*)>/g;
        while ((mv = reV.exec(body))) {
          var va = mv[1];
          var x = /\bx\s*=\s*"([^"]*)"/.exec(va), y = /\by\s*=\s*"([^"]*)"/.exec(va), z = /\bz\s*=\s*"([^"]*)"/.exec(va);
          vs.push(x ? +x[1] : 0, y ? +y[1] : 0, z ? +z[1] : 0);
        }
        var reT = /<(?:\w+:)?triangle\b([^>]*)>/g;
        while ((mt = reT.exec(body))) {
          var ta = mt[1];
          var v1 = /\bv1\s*=\s*"(\d+)"/.exec(ta), v2 = /\bv2\s*=\s*"(\d+)"/.exec(ta), v3 = /\bv3\s*=\s*"(\d+)"/.exec(ta);
          if (v1 && v2 && v3) ts.push(+v1[1], +v2[1], +v3[1]);
        }
        obj.v = vs; obj.t = ts;
      }
      var reC = /<(?:\w+:)?component\b([^>]*)>/g, mc;
      while ((mc = reC.exec(body))) {
        var ca = attrs(mc[1]);
        obj.comps.push({ id: ca.objectid, path: ca['p:path'] || null, m: parseMatrix(ca.transform) });
      }
      if (a.id !== undefined) file.objects[a.id] = obj;
    }
    var bm = /<(?:\w+:)?build\b[^>]*>([\s\S]*?)<\/(?:\w+:)?build>/.exec(xml);
    if (bm) {
      var reI = /<(?:\w+:)?item\b([^>]*)>/g, mi;
      while ((mi = reI.exec(bm[1]))) {
        var ia = attrs(mi[1]);
        if (ia.printable === '0') continue;
        file.build.push({ id: ia.objectid, path: ia['p:path'] || null, m: parseMatrix(ia.transform) });
      }
    }
    return file;
  }

  // Unisce in un'unica mesh tutti gli oggetti da stampare del 3MF, con le loro trasformazioni
  function mesh3MF(zip) {
    var rootPath = '3D/3dmodel.model';
    var files = {};
    function load(path) {
      var key = String(path).replace(/^\/+/, '').toLowerCase();
      if (files[key]) return Promise.resolve(files[key]);
      return zip.text(key).then(function (xml) { files[key] = xml ? parseModelXML(xml) : null; return files[key]; });
    }
    return zip.text('_rels/.rels').then(function (rels) {
      var m = rels && /Target\s*=\s*"([^"]+\.model)"/i.exec(rels);
      if (m) rootPath = m[1];
      return load(rootPath);
    }).then(function (root) {
      if (!root) {
        var any = zip.names.filter(function (n) { return /\.model$/i.test(n); })[0];
        if (!any) return null;
        rootPath = any;
        return load(any);
      }
      return root;
    }).then(function (root) {
      if (!root) return null;
      // carica i file esterni richiamati dai componenti (Bambu Studio e Orca usano 3D/Objects/*.model)
      var paths = {};
      function collect(f) { Object.keys(f.objects).forEach(function (k) { f.objects[k].comps.forEach(function (c) { if (c.path) paths[c.path.replace(/^\/+/, '').toLowerCase()] = 1; }); }); }
      collect(root);
      return Promise.all(Object.keys(paths).map(load)).then(function () {
        Object.keys(files).forEach(function (k) { if (files[k]) collect(files[k]); });
        var extra = Object.keys(paths).filter(function (p) { return !(p in files); });
        return Promise.all(extra.map(load));
      }).then(function () {
        var out = [], rootKey = rootPath.replace(/^\/+/, '').toLowerCase();
        function emit(pathKey, id, M, depth) {
          var f = files[pathKey]; if (!f || depth > 20) return;
          var o = f.objects[id]; if (!o) return;
          var u = f.unit;
          if (o.v && o.t) {
            var det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
            var v = o.v, t = o.t;
            for (var i = 0; i + 2 < t.length; i += 3) {
              var idx = det < 0 ? [t[i], t[i + 2], t[i + 1]] : [t[i], t[i + 1], t[i + 2]];
              for (var j = 0; j < 3; j++) {
                var q = idx[j] * 3, x = v[q] * u, y = v[q + 1] * u, z = v[q + 2] * u;
                if (!isFinite(x)) continue;
                out.push(x * M[0] + y * M[3] + z * M[6] + M[9] * u,
                         x * M[1] + y * M[4] + z * M[7] + M[10] * u,
                         x * M[2] + y * M[5] + z * M[8] + M[11] * u);
              }
            }
          }
          o.comps.forEach(function (c) { emit(c.path ? c.path.replace(/^\/+/, '').toLowerCase() : pathKey, c.id, mulM(c.m, M), depth + 1); });
        }
        var rootFile = files[rootKey];
        if (rootFile.build.length) rootFile.build.forEach(function (it) { emit(it.path ? it.path.replace(/^\/+/, '').toLowerCase() : rootKey, it.id, it.m, 0); });
        else Object.keys(rootFile.objects).forEach(function (id) { emit(rootKey, id, IDENT, 0); });
        if (out.length < 9) return null;
        out.length -= out.length % 9;
        return new Float32Array(out);
      });
    });
  }

  // Durata scritta dagli slicer: "1d 2h 3m 4s", "2h 3m", "53m 45s", "01:02:03" o secondi
  function parseDuration(t) {
    t = String(t || '').trim();
    if (!t) return 0;
    var hms = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(t);
    if (hms) return +hms[1] * 3600 + +hms[2] * 60 + +hms[3];
    if (/^\d+(\.\d+)?$/.test(t)) return +t;
    var sec = 0, found = false, re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)\b/gi, m;
    while ((m = re.exec(t))) { found = true; sec += +m[1] * { d: 86400, h: 3600, m: 60, s: 1 }[m[2].toLowerCase()]; }
    return found ? sec : 0;
  }
  function sumList(t) {
    return String(t || '').split(/[,;]/).reduce(function (a, x) { var v = parseFloat(x); return a + (isFinite(v) ? v : 0); }, 0);
  }
  function firstOf(text, res) {
    for (var i = 0; i < res.length; i++) { var m = res[i].exec(text); if (m) return m[1].trim(); }
    return '';
  }

  // Legge tempo, filamento, materiale e stampante dai commenti del G-code
  // (PrusaSlicer, Bambu Studio, OrcaSlicer, SuperSlicer, Cura, Simplify3D, ideaMaker).
  // Il ';' iniziale è facoltativo, così vale anche per i metadati del G-code binario di Prusa (.bgcode).
  function parseGcodeMeta(text) {
    var L = '(?:^|\\n)[ \\t]*;?[ \\t]*';
    function R(s, f) { return new RegExp(L + s, f || 'i'); }
    var r = {};
    var dur = firstOf(text, [
      R('total estimated time[ \\t]*[:=][ \\t]*([^;\\n]+)'),
      R('[^\\n]*?;[ \\t]*total estimated time[ \\t]*[:=][ \\t]*([^;\\n]+)'),
      R('estimated printing time \\(normal mode\\)[ \\t]*[:=][ \\t]*([^\\n]+)'),
      R('estimated printing time[ \\t]*[:=][ \\t]*([^\\n]+)'),
      R('PRINT\\.TIME:[ \\t]*(\\d+)'),
      R('TIME:[ \\t]*(\\d+(?:\\.\\d+)?)[ \\t]*(?:\\r?\\n|$)'),
      R('Print Time:[ \\t]*(\\d+)'),
      R('Build time:[ \\t]*([^\\n]+)')
    ]);
    if (dur) {
      var s3d = /(\d+)\s*hours?\s*(\d+)\s*minutes?/i.exec(dur);
      r.sec = s3d ? +s3d[1] * 3600 + +s3d[2] * 60 : parseDuration(dur);
    }
    var g = firstOf(text, [
      R('total filament weight \\[g\\][ \\t]*[:=][ \\t]*([\\d.,; \\t]+)'),
      R('total filament used \\[g\\][ \\t]*[:=][ \\t]*([\\d.,; \\t]+)'),
      R('filament used \\[g\\][ \\t]*[:=][ \\t]*([\\d.,; \\t]+)'),
      R('Plastic weight:[ \\t]*([\\d.]+)[ \\t]*g')
    ]);
    if (g) r.grams = sumList(g);
    var cm3 = firstOf(text, [R('filament used \\[cm3\\][ \\t]*[:=][ \\t]*([\\d.,; \\t]+)'), R('total filament volume \\[cm\\^?3\\][ \\t]*[:=][ \\t]*([\\d.,; \\t]+)')]);
    if (cm3) r.cm3 = sumList(cm3);
    var mm = firstOf(text, [R('total filament length \\[mm\\][ \\t]*[:=][ \\t]*([\\d.,; \\t]+)'), R('filament used \\[mm\\][ \\t]*[:=][ \\t]*([\\d.,; \\t]+)'), R('Filament length:[ \\t]*([\\d.]+)[ \\t]*mm')]);
    if (mm) r.mm = sumList(mm);
    var cura = firstOf(text, [R('Filament used:[ \\t]*([\\d.,; \\t]+)m')]);
    if (cura && !r.mm) r.mm = sumList(cura) * 1000;
    var ideam = firstOf(text, [R('Material#1 Used:[ \\t]*([\\d.]+)')]);
    if (ideam && !r.mm) r.mm = +ideam;
    var dia = firstOf(text, [R('filament_diameter[ \\t]*[:=][ \\t]*([\\d.]+)')]);
    if (dia) r.diameter = +dia;
    r.material = firstOf(text, [R('filament_type[ \\t]*[:=][ \\t]*([^\\n]+)'), R('MATERIAL:[ \\t]*([^\\n]+)')]).split(/[;,]/)[0].replace(/["\[\]]/g, '').trim();
    r.printer = firstOf(text, [R('printer_model[ \\t]*[:=][ \\t]*([^\\n]+)'), R('TARGET_MACHINE\\.NAME:[ \\t]*([^\\n]+)'), R('printer_settings_id[ \\t]*[:=][ \\t]*([^\\n]+)'), R('Machine Name:[ \\t]*([^\\n]+)')]).replace(/["]/g, '').trim();
    return r;
  }

  // Miniatura PNG o JPG incorporata nel G-code (la più grande)
  function gcodeThumb(text) {
    var re = /;\s*thumbnail(?:_(PNG|JPG|QOI))?\s+begin\s+(\d+)x(\d+)[^\n]*\n([\s\S]*?);\s*thumbnail(?:_(?:PNG|JPG|QOI))?\s+end/gi, m, best = null;
    while ((m = re.exec(text))) {
      var kind = (m[1] || 'PNG').toUpperCase();
      if (kind === 'QOI') continue;
      var area = +m[2] * +m[3];
      if (!best || area > best.area) best = { area: area, kind: kind, data: m[4].replace(/[;\s]/g, '') };
    }
    return best ? 'data:image/' + (best.kind === 'JPG' ? 'jpeg' : 'png') + ';base64,' + best.data : null;
  }

  // Codici interni di Bambu Lab in slice_info.config
  var BAMBU_IDS = { 'N1': 'Bambu Lab A1 mini', 'N2S': 'Bambu Lab A1', 'C11': 'Bambu Lab P1P', 'C12': 'Bambu Lab P1S',
                    'BL-P001': 'Bambu Lab X1 Carbon', 'BL-P002': 'Bambu Lab X1', 'C13': 'Bambu Lab X1E', 'O1D': 'Bambu Lab H2D' };

  // 3MF: geometria per l'anteprima e, se il file è già stato processato dallo slicer, tempo e grammi reali
  function read3MF(buffer) {
    var zip = readZip(buffer);
    var lower = zip.names.map(function (n) { return n.toLowerCase(); });
    function has(n) { return lower.indexOf(n.toLowerCase()) >= 0; }
    var res = { fixedUnit: true };
    return Promise.all([
      zip.text('Metadata/slice_info.config'),
      zip.text('Metadata/project_settings.config'),
      zip.text('Metadata/Slic3r_PE.config')
    ]).then(function (t) {
      var info = t[0], proj = t[1], prusa = t[2];
      if (proj) {
        try {
          var j = JSON.parse(proj);
          if (j.printer_model) res.printerHint = String(j.printer_model);
          if (Array.isArray(j.filament_type) && j.filament_type.length) res.materialHint = String(j.filament_type[0]);
        } catch (e) {}
      }
      if (prusa) {
        var pm = parseGcodeMeta(prusa);
        if (pm.printer && !res.printerHint) res.printerHint = pm.printer;
        if (pm.material && !res.materialHint) res.materialHint = pm.material;
      }
      var gcodePromise = Promise.resolve(null);
      if (info) {
        var sec = 0, grams = 0, plates = 0, best = null, reP = /<plate\b[^>]*>([\s\S]*?)<\/plate>/g, mp;
        while ((mp = reP.exec(info))) {
          var body = mp[1], meta = {}, reM = /<metadata\b([^>]*)>/g, mm;
          while ((mm = reM.exec(body))) { var a = attrs(mm[1]); if (a.key) meta[a.key] = a.value; }
          var pr = parseFloat(meta.prediction), w = parseFloat(meta.weight);
          var fg = 0, reF = /<filament\b([^>]*)>/g, mf;
          while ((mf = reF.exec(body))) {
            var fa = attrs(mf[1]), ug = parseFloat(fa.used_g) || 0; fg += ug;
            if (fa.type && (!best || ug > best.g)) best = { g: ug, type: fa.type };
          }
          if (pr > 0) { sec += pr; grams += w > 0 ? w : fg; plates++; }
          if (meta.printer_model_id && BAMBU_IDS[meta.printer_model_id] && !res.printerHint) res.printerHint = BAMBU_IDS[meta.printer_model_id];
        }
        if (sec > 0) { res.sliced = { sec: sec, grams: grams, plates: plates }; if (best) res.materialHint = best.type; }
      }
      if (!res.sliced) {
        // G-code dentro il 3MF senza slice_info: si leggono i commenti del primo piatto
        var gname = zip.names.filter(function (n) { return /^metadata\/plate_\d+\.gcode$/i.test(n); })[0];
        if (gname) gcodePromise = zip.text(gname);
      }
      return gcodePromise;
    }).then(function (gtext) {
      if (gtext) {
        var gm = parseGcodeMeta(gtext);
        if (gm.sec > 0) {
          res.sliced = { sec: gm.sec, grams: gm.grams, cm3: gm.cm3, mm: gm.mm, diameter: gm.diameter, plates: 1 };
          if (gm.material) res.materialHint = gm.material;
          if (gm.printer) res.printerHint = gm.printer;
        }
      }
      var thumbName = ['Metadata/plate_1.png', 'Metadata/thumbnail.png', 'Thumbnails/thumbnail.png', 'Metadata/plate_1_small.png'].filter(has)[0];
      return Promise.all([mesh3MF(zip).catch(function () { return null; }), thumbName ? zip.get(thumbName) : null]);
    }).then(function (x) {
      res.pos = x[0];
      if (x[1]) res.thumb = URL.createObjectURL(new Blob([x[1]], { type: 'image/png' }));
      if (!res.pos && !res.sliced) throw new Error(T('err3mfEmpty'));
      return res;
    });
  }

  // G-code: si leggono solo l'inizio e la fine del file, dove gli slicer scrivono i dati riassuntivi
  function readGcode(file) {
    var CH = 1024 * 1024;
    var parts = file.size <= 2 * CH ? [file] : [file.slice(0, CH), file.slice(file.size - CH)];
    return Promise.all(parts.map(function (p) { return p.arrayBuffer(); })).then(function (bufs) {
      var bin = /\.bgcode$/i.test(file.name);
      var dec = new TextDecoder(bin ? 'latin1' : 'utf-8');
      var text = bufs.map(function (b) { return dec.decode(new Uint8Array(b)); }).join('\n');
      // Nel .bgcode i metadati sono testo tra blocchi binari: i byte non stampabili diventano a capo
      if (bin) text = text.replace(/[^\x20-\x7E\t]/g, '\n');
      var gm = parseGcodeMeta(text);
      if (!(gm.sec > 0) || !(gm.grams > 0 || gm.cm3 > 0 || gm.mm > 0)) throw new Error(bin ? T('errBgcode') : T('errGcode'));
      return {
        sliced: { sec: gm.sec, grams: gm.grams, cm3: gm.cm3, mm: gm.mm, diameter: gm.diameter, plates: 1 },
        materialHint: gm.material, printerHint: gm.printer, thumb: bin ? null : gcodeThumb(bufs.length ? dec.decode(new Uint8Array(bufs[0])) : '')
      };
    });
  }
  // @@parse-end
  // ---------- Stato: elenco dei modelli ----------
  var models = [];      // { id, name, pos, stats, qty, scale, unitHint, row }
  var selectedId = null;
  var nextId = 1;
  function current() {
    for (var i = 0; i < models.length; i++) if (models[i].id === selectedId) return models[i];
    return null;
  }

  function globals() {
    var q = el.quality.querySelector('input:checked');
    return {
      quality: CONFIG.qualities.filter(function (x) { return q && x.id === q.value; })[0] || CONFIG.qualities[0],
      unit: +el.unit.value || 1
    };
  }

  function matById(id) {
    return CONFIG.materials.filter(function (x) { return x.id === id; })[0] || CONFIG.materials[0];
  }

  // Stima per un singolo pezzo di un modello (costi già con ricarico, IVA esclusa)
  function unitOf(m, o) { return m.fixedUnit ? 1 : o.unit; }
  function estimatePiece(m, o) {
    var pr = printerOf(m);
    var mt = matById(m.materialId);
    if (m.sliced) return estimateSliced(m, pr, mt);
    var s = unitOf(m, o) * m.scale / 100;
    var V = m.stats.vol * s * s * s;
    var A = m.stats.area * s * s;
    var size = m.stats.size.map(function (d) { return d * s; });
    if (techOf(pr) === 'resina') return estimateResin(m, o, pr, mt, V, A, size);
    var shell = Math.min(V, A * CONFIG.wallThickness);
    var printed = shell + (V - shell) * m.infill / 100;
    if (m.supports) printed *= 1 + CONFIG.supports.material;
    var grams = printed / 1000 * mt.density;
    var sec = printed / (o.quality.flow * mt.speed * printerSpeed(pr)) + (size[2] / o.quality.layer) * CONFIG.layerOverheadSec;
    if (m.supports) sec *= 1 + CONFIG.supports.time;
    // Cambi colore: filamento spurgato e tempo per ogni cambio
    var cc = m.colorChanges || 0;
    grams += cc * CONFIG.colorChange.grams;
    sec += cc * CONFIG.colorChange.sec;
    var hours = sec / 3600;
    var k = 1 + CONFIG.markup;
    var a = size.slice().sort(function (x, y) { return x - y; });
    var b = buildVolume(pr).slice().sort(function (x, y) { return x - y; });
    return {
      V: V, size: size, grams: grams, hours: hours,
      mat: grams / 1000 * priceKg(mt) * (1 + CONFIG.waste) * k,
      mach: hours * machineRate(pr) * k,
      kwh: hours * powerKW(pr),
      energy: hours * powerKW(pr) * energyPrice(),
      fits: a[0] <= b[0] && a[1] <= b[1] && a[2] <= b[2]
    };
  }

  // File già processato dallo slicer: tempo e filamento sono quelli calcolati dallo slicer.
  // Scala, riempimento, supporti e qualità sono già decisi nel file e qui non contano.
  function estimateSliced(m, pr, mt) {
    var S = m.sliced;
    var grams = S.grams > 0 ? S.grams
      : S.cm3 > 0 ? S.cm3 * mt.density
      : S.mm > 0 ? S.mm * Math.PI * Math.pow((S.diameter || 1.75) / 2, 2) / 1000 * mt.density : 0;
    var hours = S.sec / 3600, k = 1 + CONFIG.markup;
    return {
      sliced: true, V: 0, size: m.stats ? m.stats.size.slice() : [], grams: grams, hours: hours,
      mat: grams / 1000 * priceKg(mt) * (1 + CONFIG.waste) * k,
      mach: hours * machineRate(pr) * k,
      kwh: hours * powerKW(pr),
      energy: hours * powerKW(pr) * energyPrice(),
      fits: true
    };
  }

  // Resina: il pezzo è pieno o svuotato (pareti di spessore fisso). Il tempo non dipende dal volume ma
  // dall'altezza: tutti i pezzi sullo stesso piatto si stampano insieme. Ore, macchina ed energia
  // vengono quindi calcolate per stampante in update() e ripartite tra i pezzi.
  function estimateResin(m, o, pr, mt, V, A, size) {
    var vol = m.hollow ? Math.min(V, A * CONFIG.resin.wall) : V;
    if (m.supports) vol *= 1 + CONFIG.resin.supports;
    var ml = vol / 1000;
    var grams = ml * mt.density;
    var k = 1 + CONFIG.markup;
    var a = size.slice().sort(function (x, y) { return x - y; });
    var b = buildVolume(pr).slice().sort(function (x, y) { return x - y; });
    return {
      resin: true, V: V, size: size, grams: grams, ml: ml,
      layers: Math.ceil(size[2] / o.quality.resinLayer), footprint: size[0] * size[1],
      hours: 0, mach: 0, kwh: 0, energy: 0, post: 0,
      mat: grams / 1000 * priceKg(mt) * (1 + CONFIG.waste) * k,
      fits: a[0] <= b[0] && a[1] <= b[1] && a[2] <= b[2]
    };
  }

  // Ripartisce il tempo di stampa a resina tra i pezzi della stessa stampante
  function allocateResin(list) {
    var groups = {};
    list.forEach(function (x) { if (x.r.resin) (groups[x.m.printerId] = groups[x.m.printerId] || []).push(x); });
    Object.keys(groups).forEach(function (id) {
      var g = groups[id], p = printer(id), bv = buildVolume(p);
      var foot = 0, maxLayers = 0, weight = 0;
      g.forEach(function (x) {
        foot += x.r.footprint * x.m.qty; maxLayers = Math.max(maxLayers, x.r.layers);
        weight += x.r.footprint * x.r.layers * x.m.qty;
      });
      var plates = Math.max(1, Math.ceil(foot / (bv[0] * bv[1] * CONFIG.resin.plateFill)));
      var hours = plates * maxLayers * (p ? p.layerSec : CONFIG.resin.layerSec) / 3600;
      var k = 1 + CONFIG.markup;
      g.forEach(function (x) {
        var share = weight ? x.r.footprint * x.r.layers / weight : 0;   // quota di un singolo pezzo
        x.r.hours = hours * share;
        x.r.mach = x.r.hours * machineRate(p) * k;
        x.r.kwh = x.r.hours * powerKW(p);
        x.r.energy = x.r.kwh * energyPrice();
        x.r.post = plates * CONFIG.resin.post * share;
      });
      g.plates = plates;
    });
    return groups;
  }

  function fmtTime(h) {
    var mins = Math.max(1, Math.round(h * 60));
    var hh = Math.floor(mins / 60), mm = mins % 60;
    return hh ? hh + ' h' + (mm ? ' ' + mm + ' min' : '') : mm + ' min';
  }
  function fmtSize(size) { if (!size || !size.length) return ''; return size.map(function (d) { return num1.format(d); }).join(' × ') + ' mm'; }

  var last = null;
  function update() {
    el.infillOut.textContent = el.infill.value + '%';
    var has = models.length > 0;
    el.empty.hidden = has; el.out.hidden = !has; el.cta.disabled = !has;
    if (el.xlsOut) el.xlsOut.disabled = !has;
    el.listWrap.hidden = !has; el.drop.hidden = has; el.overlay.hidden = !has;
    if (!has) { last = null; return; }

    var o = globals();
    var matBy = {}, matOrder = [];
    var wrongMat = 0;
    var energy = 0, kwh = 0;
    var pieces = 0, mat = 0, mach = 0, grams = 0, hours = 0, tooBig = 0, results = [];
    models.forEach(function (m) { pieces += m.qty; });
    var disc = 0;
    CONFIG.quantityDiscounts.forEach(function (d) { if (pieces >= d.min && d.pct > disc) disc = d.pct; });

    var items = models.map(function (m) { return { m: m, r: estimatePiece(m, o) }; });
    allocateResin(items);
    var post = 0;
    items.forEach(function (it) {
      var m = it.m, r = it.r;
      results.push(r);
      if (r.resin) post += r.post * m.qty;
      if (!(m.materialId in matBy)) { matBy[m.materialId] = 0; matOrder.push(m.materialId); }
      matBy[m.materialId] += r.mat * m.qty;
      mat += r.mat * m.qty; mach += r.mach * m.qty; energy += r.energy * m.qty; kwh += r.kwh * m.qty; grams += r.grams * m.qty; hours += r.hours * m.qty;
      if (!r.fits) tooBig++;
      var piecePrice = ((r.mat + r.mach) * (1 - disc) + r.energy + (r.post || 0)) * (1 + failRate()) * (1 + CONFIG.vat);
      m.row.meta.textContent = r.sliced
        ? T('slicedMeta', { time: fmtTime(r.hours), g: num1.format(r.grams), price: money.format(piecePrice) })
        : fmtSize(r.size) + ', ' + (r.resin ? T('mlResin', { n: num1.format(r.ml) }) : num1.format(r.grams) + ' g') + ', ' + T('each', { price: money.format(piecePrice) });
      var prName = printerOf(m) ? printerOf(m).name : T('thisPrinter');
      var warn = !r.fits ? T('warnTooBig', { printer: prName })
        : !materialAllowed(matById(m.materialId), printerOf(m)) ? T('warnMaterial', { material: matById(m.materialId).name, printer: prName })
        : (m.unitHint || '');
      if (!materialAllowed(matById(m.materialId), printerOf(m))) wrongMat++;
      m.row.warn.textContent = warn; m.row.warn.hidden = !warn;
      m.r = r;
      m.row.swatch.style.background = matById(m.materialId).color;
    });
    // Riscaldamento: una volta per ogni stampante usata nell'ordine
    var usate = {};
    models.forEach(function (m) { if (techOf(printerOf(m)) !== 'resina' && !m.sliced) usate[m.printerId || '-'] = printerOf(m); });
    Object.keys(usate).forEach(function (id) {
      var h = CONFIG.heatUpMinutes / 60;
      hours += h; kwh += h * powerKW(usate[id]); energy += h * powerKW(usate[id]) * energyPrice();
    });

    var discount = (mat + mach) * disc;
    var fail = (mat + mach - discount + energy + post) * failRate();
    var net = mat + mach - discount + energy + post + fail + CONFIG.setupFee;
    var minAdj = net < CONFIG.minOrder ? CONFIG.minOrder - net : 0;
    net += minAdj;
    var vat = net * CONFIG.vat, total = net + vat;
    el.applyAll.hidden = models.length < 2 || models.every(function (m) {
      if (m.sliced && techOf(printer()) === 'resina') return true;
      return m.materialId === el.material.value && m.infill === +el.infill.value && m.hollow === el.hollow.checked && m.supports === el.supports.checked &&
        (!CONFIG.printers.length || m.printerId === el.printer.value);
    });
    last = { o: o, total: total, grams: grams, pieces: pieces, disc: disc, hours: hours, kwh: kwh, items: items };

    el.pieces.textContent = num0.format(pieces);
    el.weight.textContent = grams >= 1000 ? num1.format(grams / 1000) + ' kg' : num1.format(grams) + ' g';
    el.time.textContent = fmtTime(hours);

    var rows = matOrder.map(function (id) { return [T('rowMaterial', { name: matById(id).name }), matBy[id]]; });
    rows.push([T('rowWear'), mach]);
    rows.push([T('rowEnergy', { kwh: kwh < 1 ? num2.format(kwh) : num1.format(kwh) }), energy]);
    if (post > 0) rows.push([T('rowPost'), post]);
    if (fail > 0) rows.push([T('rowFail', { pct: num1.format(failPct) }), fail]);
    if (discount > 0) rows.push([T('rowDiscount', { pct: num0.format(disc * 100) }), -discount]);
    if (CONFIG.setupFee > 0) rows.push([T('rowSetup'), CONFIG.setupFee]);
    if (minAdj > 0) rows.push([T('rowMinimum'), minAdj]);
    if (CONFIG.vat > 0) rows.push([T('rowVat', { pct: num0.format(CONFIG.vat * 100) }), vat]);
    el.lines.innerHTML = '';
    rows.forEach(function (row) {
      var div = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = row[0];
      var dd = document.createElement('dd'); dd.textContent = money.format(row[1]);
      div.appendChild(dt); div.appendChild(dd); el.lines.appendChild(div);
    });
    last.rows = rows;
    el.total.textContent = money.format(total);
    el.totalLabel.firstChild.nodeValue = CONFIG.vat > 0 ? T('totalVat') : T('total');
    el.summary.textContent = models.length === 1 ? T('oneFile') : T('manyFiles', { n: models.length });

    if (wrongMat) setMsg(wrongMat === 1 ? T('wrongMatOne') : T('wrongMatMany', { n: wrongMat }), 'warn');
    else if (tooBig) setMsg(tooBig === 1 ? T('tooBigOne') : T('tooBigMany', { n: tooBig }), 'warn');
    else if (notice) setMsg(notice, 'error');
    else if (!busy) setMsg('');

    var cur = current();
    if (cur) {
      el.fname.textContent = cur.name;
      el.dims.textContent = cur.sliced ? T('slicedFile') + (cur.sliced.plates > 1 ? ', ' + T('plates', { n: cur.sliced.plates }) : '') : fmtSize(cur.r.size);
      if (view && cur.pos) { applyViewScale(cur.sliced ? 1 : unitOf(cur, o) * cur.scale / 100); setMeshColor(matById(cur.materialId).color); }
    }
    renderCompare();
  }

  // ---------- Confronto rapido ----------
  // Il file selezionato con tutti i materiali della sua stampante, oppure con il suo materiale su tutte
  // le stampanti che lo supportano. Il costo è a pezzo, con il file stampato da solo (per la resina conta
  // il piatto) e senza il riscaldamento, che non dipende dal file. Toccando una riga la scelta passa al file.
  var cmpMode = leggi('c3d-confronto') === 'stampanti' ? 'stampanti' : 'materiali';
  var cmpAll = false;
  var CMP_MAX = 8;
  function soloEach(c, o) {
    var r = estimatePiece(c, o);
    if (r.resin) allocateResin([{ m: c, r: r }]);
    return { r: r, each: ((r.mat + r.mach) + r.energy + (r.post || 0)) * (1 + failRate()) * (1 + CONFIG.vat) };
  }
  function clone(m, k, v) { var c = {}; for (var x in m) c[x] = m[x]; c[k] = v; return c; }
  function renderCompare() {
    if (!el.cmp) return;
    var m = current();
    el.cmp.hidden = !m || !CONFIG.printers.length;
    if (m) el.cmpFile.textContent = m.name;
    if (el.cmp.hidden || !el.cmp.open) return;
    Array.prototype.forEach.call(el.cmp.querySelectorAll('[data-cmp]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cmp') === cmpMode)); });
    var o = globals(), pr = printerOf(m), mt = matById(m.materialId), tech = techOf(pr);
    var base = soloEach(m, o), rows = [];
    if (cmpMode === 'materiali') {
      CONFIG.materials.forEach(function (x) {
        if ((x.tech || 'filamento') !== tech || !materialAllowed(x, pr)) return;
        rows.push({ key: x.id, name: x.name, e: soloEach(clone(m, 'materialId', x.id), o), cur: x.id === m.materialId });
      });
      el.cmpHelp.textContent = T('cmpHelpMat', { printer: pr ? pr.name : '' });
    } else {
      CONFIG.printers.forEach(function (p) {
        if (techOf(p) !== tech || !materialAllowed(mt, p)) return;
        rows.push({ key: p.id, name: p.name, e: soloEach(clone(m, 'printerId', p.id), o), cur: p.id === m.printerId });
      });
      el.cmpHelp.textContent = T('cmpHelpPrinter', { material: mt.name });
    }
    if (m.sliced) el.cmpHelp.textContent += ' ' + T('cmpSliced');
    else if (tech === 'resina') el.cmpHelp.textContent += ' ' + T('cmpResin');
    // prima quelli in cui il pezzo entra, poi dal più economico
    rows.sort(function (a, b) { return (b.e.r.fits - a.e.r.fits) || (a.e.each - b.e.each); });
    var shown = rows;
    if (!cmpAll && rows.length > CMP_MAX) {
      shown = rows.slice(0, CMP_MAX);
      var curRow = rows.filter(function (x) { return x.cur; })[0];
      if (curRow && shown.indexOf(curRow) < 0) shown[CMP_MAX - 1] = curRow;
    }
    el.cmpList.textContent = '';
    if (!rows.length) { var none = document.createElement('li'); none.className = 'c3d-cmp-help'; none.textContent = T('cmpNone'); el.cmpList.appendChild(none); }
    shown.forEach(function (x) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'c3d-cmp-item';
      if (x.cur) b.setAttribute('aria-current', 'true');
      var nm = document.createElement('span'); nm.className = 'c3d-cmp-name';
      var t = document.createElement('span'); t.textContent = x.name;
      if (x.cur) { var tag = document.createElement('span'); tag.className = 'c3d-cmp-tag'; tag.textContent = T('cmpCurrent'); t.appendChild(tag); }
      if (!x.e.r.fits) { var w = document.createElement('span'); w.className = 'c3d-cmp-tag is-warn'; w.textContent = T('cmpNoFit'); t.appendChild(w); }
      var sm = document.createElement('small');
      sm.textContent = (x.e.r.resin ? T('mlResin', { n: num1.format(x.e.r.ml) }) : num1.format(x.e.r.grams) + ' g') + ' · ' + fmtTime(x.e.r.hours);
      nm.appendChild(t); nm.appendChild(sm);
      var cost = document.createElement('span'); cost.className = 'c3d-cmp-cost';
      cost.appendChild(document.createTextNode(money.format(x.e.each)));
      var d = document.createElement('small'), diff = x.e.each - base.each;
      if (x.cur) d.textContent = T('cmpEach');
      else if (Math.abs(diff) < 0.005) d.textContent = '=';
      else { d.textContent = (diff > 0 ? '+' : '−') + money.format(Math.abs(diff)); d.className = diff > 0 ? 'is-up' : 'is-down'; }
      cost.appendChild(d);
      b.appendChild(nm); b.appendChild(cost);
      b.setAttribute('aria-label', x.name + ', ' + money.format(x.e.each) + (x.cur ? ', ' + T('cmpCurrent') : ''));
      if (!x.cur) b.addEventListener('click', function () { applyCompare(m, x.key); });
      li.appendChild(b); el.cmpList.appendChild(li);
    });
    el.cmpMore.hidden = rows.length <= CMP_MAX;
    el.cmpMore.textContent = cmpAll ? T('cmpLess') : T('cmpMore', { n: rows.length });
  }
  function applyCompare(m, key) {
    if (cmpMode === 'materiali') { m.materialId = key; m.row.matSel.value = key; }
    else { m.printerId = key; if (m.row.prSel) setPicker(m.row.teSel, m.row.brSel, m.row.prSel, key); }
    refreshMaterialOptions(); updateGrid(); update();
    var now = el.cmpList.querySelector('.c3d-cmp-item[aria-current="true"]');
    if (now) now.focus({ preventScroll: true });
  }
  if (el.cmp) {
    if (leggi('c3d-confronto-aperto') === '1') el.cmp.open = true;
    el.cmp.addEventListener('toggle', function () { scrivi('c3d-confronto-aperto', el.cmp.open ? '1' : '0'); renderCompare(); });
    Array.prototype.forEach.call(el.cmp.querySelectorAll('[data-cmp]'), function (b) {
      b.addEventListener('click', function () { cmpMode = b.getAttribute('data-cmp'); cmpAll = false; scrivi('c3d-confronto', cmpMode); renderCompare(); });
    });
    el.cmpMore.addEventListener('click', function () { cmpAll = !cmpAll; renderCompare(); });
  }

  // ---------- Elenco file ----------
  function addRow(m) {
    var li = document.createElement('li'); li.className = 'c3d-file';
    var pick = document.createElement('button'); pick.type = 'button'; pick.className = 'c3d-file-pick';
    pick.setAttribute('aria-label', T('ariaShow', { name: m.name }));
    var name = document.createElement('span'); name.className = 'c3d-file-name'; name.title = m.name;
    var sw = document.createElement('span'); sw.className = 'c3d-swatch'; sw.setAttribute('aria-hidden', 'true');
    name.appendChild(sw); name.appendChild(document.createTextNode(m.name));
    var meta = document.createElement('span'); meta.className = 'c3d-file-meta';
    var warn = document.createElement('span'); warn.className = 'c3d-file-warn'; warn.hidden = true;
    pick.appendChild(name); pick.appendChild(meta); pick.appendChild(warn);

    function numField(labelText, value, min, max) {
      var wrap = document.createElement('label');
      var t = document.createElement('span'); t.className = 'c3d-vh c3d-vh-m'; t.textContent = labelText;
      var tn = document.createElement('span'); tn.className = 'c3d-vh'; tn.textContent = ' (' + m.name + ')'; t.appendChild(tn);
      var input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max; input.step = 1;
      input.value = value; input.inputMode = 'numeric';
      wrap.appendChild(t); wrap.appendChild(input);
      return { wrap: wrap, input: input };
    }
    var matWrap = document.createElement('label');
    var mtLabel = document.createElement('span'); mtLabel.className = 'c3d-vh c3d-vh-m'; mtLabel.textContent = T('xlsColMaterial');
    var mtName = document.createElement('span'); mtName.className = 'c3d-vh'; mtName.textContent = ' (' + m.name + ')'; mtLabel.appendChild(mtName);
    var matSel = document.createElement('select');
    CONFIG.materials.forEach(function (x) {
      var op = document.createElement('option'); op.value = x.id; op.textContent = x.name.replace(/\s*\(.*\)$/, '').replace(/^Resina\s+(\S)/i, function (_, c) { return c.toUpperCase(); }).replace(/\s+resin$/i, ''); op.title = x.name;
      op.setAttribute('data-nome', op.textContent);
      matSel.appendChild(op);
    });
    matSel.value = m.materialId;
    matSel.addEventListener('change', function () { m.materialId = matSel.value; update(); });
    matWrap.appendChild(mtLabel); matWrap.appendChild(matSel);
    var qty = numField(T('quantity'), m.qty, 1, 999);
    var scale = numField(T('scale'), m.scale, 1, 1000);
    qty.input.addEventListener('input', function () { m.qty = Math.max(1, Math.floor(+qty.input.value || 1)); update(); });
    scale.input.addEventListener('input', function () { m.scale = Math.max(1, +scale.input.value || 100); update(); });

    var extra = document.createElement('div'); extra.className = 'c3d-file-extra';
    var infLabel = document.createElement('label');
    infLabel.appendChild(document.createTextNode(T('infill')));
    var infHidden = document.createElement('span'); infHidden.className = 'c3d-vh'; infHidden.textContent = ' (' + m.name + ')';
    infLabel.appendChild(infHidden);
    var infSel = document.createElement('select');
    for (var p = 10; p <= 100; p += 5) {
      var op = document.createElement('option'); op.value = p; op.textContent = p + '%'; infSel.appendChild(op);
    }
    infSel.value = m.infill;
    infSel.addEventListener('change', function () { m.infill = +infSel.value; update(); });
    infLabel.appendChild(infSel);
    var supLabel = document.createElement('label');
    if (m.sliced) { scale.input.disabled = true; scale.input.title = T('slicedLocked'); }
    var supBox = document.createElement('input'); supBox.type = 'checkbox'; supBox.checked = m.supports;
    supBox.addEventListener('change', function () { m.supports = supBox.checked; update(); });
    supLabel.appendChild(supBox); supLabel.appendChild(document.createTextNode(T('supports')));
    var supHidden = document.createElement('span'); supHidden.className = 'c3d-vh'; supHidden.textContent = ' (' + m.name + ')';
    supLabel.appendChild(supHidden);
    var prSel = null, brSel = null, teSel = null;
    if (CONFIG.printers.length) {
      var prLabel = document.createElement('label');
      prLabel.appendChild(document.createTextNode(T('printer')));
      var prHidden = document.createElement('span'); prHidden.className = 'c3d-vh'; prHidden.textContent = ' (' + m.name + ')';
      prLabel.appendChild(prHidden);
      teSel = document.createElement('select'); teSel.className = 'c3d-file-tech';
      teSel.setAttribute('aria-label', T('ariaTech', { name: m.name }));
      fillTechs(teSel); if (techs().length < 2) teSel.hidden = true;
      brSel = document.createElement('select'); brSel.className = 'c3d-file-brand';
      brSel.setAttribute('aria-label', T('ariaBrand', { name: m.name }));
      prSel = document.createElement('select'); prSel.className = 'c3d-file-printer';
      prSel.setAttribute('aria-label', T('ariaModel', { name: m.name }));
      setPicker(teSel, brSel, prSel, m.printerId);
      if (m.sliced) { teSel.disabled = true; teSel.title = T('slicedTech'); }
      wirePicker(teSel, brSel, prSel, function () {
        m.printerId = prSel.value; refreshMaterialOptions();
        if (m.id === selectedId) updateGrid();
        update();
      });
      prLabel.appendChild(teSel); prLabel.appendChild(brSel); prLabel.appendChild(prSel);
      extra.appendChild(prLabel);
    }
    // Resina: al posto del riempimento si sceglie se il pezzo è pieno o svuotato
    var holLabel = document.createElement('label'); holLabel.hidden = true;
    holLabel.appendChild(document.createTextNode(T('interior')));
    var holHidden = document.createElement('span'); holHidden.className = 'c3d-vh'; holHidden.textContent = ' (' + m.name + ')';
    holLabel.appendChild(holHidden);
    var holSel = document.createElement('select');
    [['0', T('solid')], ['1', T('hollow')]].forEach(function (x) {
      var op = document.createElement('option'); op.value = x[0]; op.textContent = x[1]; holSel.appendChild(op);
    });
    holSel.value = m.hollow ? '1' : '0';
    holSel.addEventListener('change', function () { m.hollow = holSel.value === '1'; update(); });
    holLabel.appendChild(holSel);
    // Cambi colore (solo filamento, non per i file già processati dallo slicer)
    var ccLabel = document.createElement('label'); ccLabel.className = 'c3d-file-cc';
    ccLabel.title = T('ccHelp');
    ccLabel.appendChild(document.createTextNode(T('colorChanges')));
    var ccHidden = document.createElement('span'); ccHidden.className = 'c3d-vh'; ccHidden.textContent = ' (' + m.name + ')';
    ccLabel.appendChild(ccHidden);
    var ccIn = document.createElement('input'); ccIn.type = 'number'; ccIn.min = 0; ccIn.max = 9999; ccIn.step = 1; ccIn.inputMode = 'numeric';
    ccIn.value = m.colorChanges || 0;
    ccIn.addEventListener('input', function () { m.colorChanges = Math.min(9999, Math.max(0, Math.floor(+ccIn.value || 0))); update(); });
    ccLabel.appendChild(ccIn);
    extra.appendChild(infLabel); extra.appendChild(holLabel); extra.appendChild(supLabel); extra.appendChild(ccLabel);
    var slicedNote = null;
    if (m.sliced) {
      supLabel.hidden = true;
      slicedNote = document.createElement('span'); slicedNote.className = 'c3d-sliced-note'; slicedNote.textContent = T('slicedNote');
      extra.appendChild(slicedNote);
    }

    var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'c3d-file-remove';
    rm.setAttribute('aria-label', T('ariaRemove', { name: m.name })); rm.textContent = '×';
    rm.addEventListener('click', function () { removeModel(m.id); });
    pick.addEventListener('click', function () { select(m.id); });

    li.appendChild(pick); li.appendChild(matWrap); li.appendChild(qty.wrap); li.appendChild(scale.wrap); li.appendChild(rm); li.appendChild(extra);
    el.list.appendChild(li);
    m.row = { ccLabel: ccLabel, ccIn: ccIn, qtyIn: qty.input, scaleIn: scale.input, li: li, meta: meta, warn: warn, matSel: matSel, prSel: prSel, brSel: brSel, teSel: teSel, infLabel: infLabel, holLabel: holLabel, holSel: holSel, infSel: infSel, supBox: supBox, swatch: sw };
  }

  function markActive() {
    models.forEach(function (m) { m.row.li.classList.toggle('is-active', m.id === selectedId); });
  }

  function select(id) {
    selectedId = id; markActive();
    updateGrid(); update(); showPreview();
  }

  function removeModel(id) {
    models = models.filter(function (m) {
      if (m.id === id) { el.list.removeChild(m.row.li); return false; }
      return true;
    });
    if (selectedId === id) selectedId = models.length ? models[0].id : null;
    markActive();
    if (!models.length) { el.canvas.hidden = true; el.hint.hidden = true; clearMesh(); notice = ''; setMsg(''); if (el.thumb) el.thumb.hidden = true; if (el.nothumb) el.nothumb.hidden = true; }
    update();
    if (models.length) showPreview();
  }

  // ---------- Caricamento file (uno alla volta, in coda) ----------
  var queue = [], busy = false, errors = [], notice = '';
  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    var room = CONFIG.maxFiles - models.length - queue.length;
    if (room <= 0) { setMsg(T('maxFiles', { max: CONFIG.maxFiles }), 'error'); return; }
    if (files.length > room) { errors.push(T('onlyFirst', { n: room, max: CONFIG.maxFiles })); files = files.slice(0, room); }
    if (!busy) notice = '';
    queue = queue.concat(files);
    if (!busy) next();
  }

  function next() {
    var file = queue.shift();
    if (!file) {
      busy = false;
      notice = errors.join(' ');
      errors = [];
      update();
      if (!models.length && notice) setMsg(notice, 'error');
      return;
    }
    busy = true;
    setMsg(T('analyzing', { name: file.name }) + (queue.length ? T('queued', { n: queue.length }) : ''));
    var kind = /\.stl$/i.test(file.name) ? 'stl' : /\.3mf$/i.test(file.name) ? '3mf' : /\.(gcode|gco|g|bgcode)$/i.test(file.name) ? 'gcode' : '';
    if (!kind) { errors.push(T('notStl', { name: file.name })); return next(); }
    // Il G-code si legge solo in parte, quindi può essere grande; STL e 3MF vanno letti interi
    var maxMB = kind === '3mf' ? CONFIG.maxFileMB * 2 : CONFIG.maxFileMB;
    if (kind !== 'gcode' && file.size > maxMB * 1024 * 1024) { errors.push(T('tooLarge', { name: file.name, mb: maxMB })); return next(); }
    var job = kind === 'gcode' ? readGcode(file)
      : file.arrayBuffer().then(function (buf) { return kind === '3mf' ? read3MF(buf) : { pos: parseSTL(buf) }; });
    job.then(function (d) { addModel(file, d); }).catch(function (e) {
      errors.push(file.name + ': ' + ((e && e.message) || T('errInvalid')));
    }).then(function () { setTimeout(next, 0); });
  }

  // Le stampanti indicate nel file dello slicer si cercano tra quelle dell'elenco (vince il nome più lungo trovato)
  function compact(t) { return String(t || '').toLowerCase().replace(/original\s+prusa|bambu\s*lab/g, function (x) { return x.replace(/\s+/g, ''); }).replace(/[^a-z0-9]/g, ''); }
  function matchPrinterHint(hint) {
    var h = compact(hint);
    if (!h) return null;
    var withBrand = CONFIG.printers.filter(function (p) { return h.indexOf(compact(p.brand)) >= 0; });
    var pool = withBrand.length ? withBrand : CONFIG.printers;
    var best = null, bestLen = 0;
    pool.forEach(function (p) {
      var mdl = compact(p.model), full = compact(p.brand + p.model);
      var ok = h === mdl || h === full || h.indexOf(full) >= 0 || (h.indexOf(mdl) >= 0 && (withBrand.length || mdl.length >= 3));
      if (ok && mdl.length > bestLen) { best = p; bestLen = mdl.length; }
    });
    return best;
  }

  function addModel(file, d) {
    var stats = null, hint = '';
    if (d.pos) {
      stats = meshStats(d.pos);
      if (!(stats.vol > 0)) {
        if (!d.sliced) throw new Error(T('errNoVolume'));
        d.pos = null; stats = null;   // per il G-code bastano i dati dello slicer
      } else if (!d.fixedUnit) {
        var maxDim = Math.max.apply(null, stats.size);
        hint = maxDim < 5 ? T('hintSmall') : maxDim > 2000 ? T('hintLarge') : '';
      }
    }
    var m = { id: nextId++, name: file.name, pos: d.pos || null, stats: stats, sliced: d.sliced || null, thumb: d.thumb || null, fixedUnit: !!d.fixedUnit,
              qty: 1, scale: 100, materialId: el.material.value, printerId: CONFIG.printers.length ? el.printer.value : null, hollow: el.hollow.checked,
              infill: +el.infill.value || 20, supports: el.supports.checked, colorChanges: 0, unitHint: hint };
    // Stampante e materiale suggeriti dal file (un G-code è sempre a filamento)
    if (CONFIG.printers.length) {
      var hp = d.printerHint ? matchPrinterHint(d.printerHint) : null;
      if (hp && (!m.sliced || hp.tech !== 'resina')) m.printerId = hp.id;
      if (m.sliced && techOf(printerOf(m)) === 'resina') {
        var fp = CONFIG.printers.filter(function (p) { return p.tech !== 'resina' && p.default; })[0] || CONFIG.printers.filter(function (p) { return p.tech !== 'resina'; })[0];
        if (fp) m.printerId = fp.id;
      }
    }
    if (d.materialHint) {
      var hm = findMaterial('', d.materialHint, techOf(printerOf(m)));
      if (hm) m.materialId = hm.id;
    }
    var imp = takePending(m.name);
    if (imp) applySettings(m, imp);
    models.push(m); addRow(m); refreshMaterialOptions();
    if (selectedId === null) { selectedId = m.id; markActive(); update(); showPreview(); }
    else update();
  }

  el.pick.addEventListener('click', function () { el.file.click(); });
  el.add.addEventListener('click', function () { el.file.click(); });
  el.file.addEventListener('change', function () { handleFiles(el.file.files); el.file.value = ''; });
  var dropTargets = [el.plate, el.listWrap];
  dropTargets.forEach(function (t) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      t.addEventListener(ev, function (e) { e.preventDefault(); el.plate.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      t.addEventListener(ev, function (e) { e.preventDefault(); el.plate.classList.remove('is-over'); });
    });
    t.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });
  });

  el.material.addEventListener('change', function () { showPrice(); update(); });
  if (el.price) {
    el.price.addEventListener('input', function () {
      var v = parseFloat(String(el.price.value).replace(',', '.'));
      if (!(isFinite(v) && v >= 0)) return;
      var mt = matById(el.material.value), eur = v / rate();
      if (Math.abs(eur - mt.pricePerKg) < 0.005) delete myPrices[matKey(mt)]; else myPrices[matKey(mt)] = eur;
      savePrices(); showPrice(); update();
    });
    el.price.addEventListener('blur', function () { showPrice(true); });
    el.priceReset.addEventListener('click', function () {
      delete myPrices[matKey(matById(el.material.value))];
      savePrices(); showPrice(); update();
    });
  }
  // La stampante in alto vale per i nuovi file: quelli già caricati mantengono la loro (vedi "Applica a tutti")
  if (CONFIG.printers.length) wirePicker(el.tech, el.brand, el.printer, function () { refreshMaterialOptions(); update(); });
  el.hollow.addEventListener('change', update);
  el.applyAll.addEventListener('click', function () {
    models.forEach(function (m) {
      m.materialId = el.material.value; m.row.matSel.value = m.materialId;
      m.infill = +el.infill.value; m.row.infSel.value = m.infill;
      m.supports = el.supports.checked; m.row.supBox.checked = m.supports;
      m.hollow = el.hollow.checked; m.row.holSel.value = m.hollow ? '1' : '0';
      if (m.row.prSel && !(m.sliced && techOf(printer()) === 'resina')) { m.printerId = el.printer.value; setPicker(m.row.teSel, m.row.brSel, m.row.prSel, m.printerId); }
    });
    refreshMaterialOptions(); updateGrid();
    update();
  });
  [el.infill, el.unit, el.supports].forEach(function (c) { // i predefiniti aggiornano solo il pulsante "Applica a tutti"
    c.addEventListener('input', update); c.addEventListener('change', update);
  });
  el.quality.addEventListener('change', update);

  // ---------- Calcola ----------
  // Il prezzo si aggiorna già a ogni modifica: il pulsante ricalcola e porta il risultato in vista.
  el.cta.addEventListener('click', function () {
    if (!models.length) return;
    update();
    el.out.classList.remove('is-flash'); void el.out.offsetWidth; el.out.classList.add('is-flash');
    el.out.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  if (el.fail) el.fail.addEventListener('input', function () {
    var v = parseFloat(String(el.fail.value).replace(',', '.'));
    if (isFinite(v) && v >= 0 && v <= 100) { failPct = v; scrivi('c3d-fallite', String(v)); update(); }
  });
  el.energy.addEventListener('input', function () {
    var v = parseFloat(String(el.energy.value).replace(',', '.'));
    if (isFinite(v) && v >= 0) { energyEUR = v / rate(); scrivi('c3d-energia', String(energyEUR)); }
    update();
  });
  showPrice();
  el.currency.value = currency;
  el.currency.addEventListener('change', function () {
    currency = el.currency.value === 'USD' ? 'USD' : 'EUR';
    scrivi('c3d-valuta', currency);
    makeMoney(); showEnergy(); showPrice(true); update();
  });

  // ---------- Excel: scarica e importa le impostazioni ----------
  // Il file ha due fogli visibili (file e riepilogo) e uno nascosto con le impostazioni generali.
  // L'importazione legge il foglio dei file, quindi le modifiche fatte in Excel vengono riprese.
  // La libreria SheetJS si carica solo al primo uso, dalla stessa cartella di questo script.
  var XLSX_URL = (function () { try { return new URL('vendor/xlsx.full.min.js', SCRIPT_SRC || location.href).href; } catch (e) { return 'vendor/xlsx.full.min.js'; } })();
  var xlsxPromise = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = XLSX_URL; s.async = true;
      s.onload = function () { window.XLSX ? res(window.XLSX) : rej(new Error('XLSX')); };
      s.onerror = function () { xlsxPromise = null; rej(new Error('XLSX')); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }
  function xlsMsg(text, kind) {
    if (!el.xlsMsg) return;
    el.xlsMsg.textContent = text || ''; el.xlsMsg.hidden = !text;
    el.xlsMsg.className = 'c3d-xls-msg' + (kind ? ' is-' + kind : '');
  }
  // Colonne del foglio dei file: l'ordine è fisso e vale per tutte e due le lingue
  var COL = { file: 0, tech: 1, brand: 2, model: 3, material: 4, qty: 5, scale: 6, infill: 7, interior: 8, supports: 9,
              printerId: 22, materialId: 23, colorChanges: 24 };
  var SHEET_HIDDEN = 'c3d';

  function curFmt() { return currency === 'USD' ? '"$"#,##0.00' : '#,##0.00 "€"'; }
  function fileStamp() { var d = new Date(); function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }

  function exportExcel() {
    if (!models.length) return;
    update();
    xlsMsg(T('xlsLoading'));
    loadXLSX().then(function (X) {
      var o = last.o, R = rate(), cf = curFmt(), tf = '[h]:mm', yes = T('xlsYes'), no = T('xlsNo');
      // Foglio 1: un file per riga
      var head = [T('xlsColFile'), T('xlsColTech'), T('xlsColBrand'), T('xlsColModel'), T('xlsColMaterial'), T('quantity'), T('scale'),
        T('xlsColInfill'), T('interior'), T('supports'), T('xlsColSize'), T('xlsColGrams'), T('xlsColMl'), T('xlsColTime'),
        T('xlsColMatCost'), T('rowWear'), T('xlsColEnergy'), T('xlsColPost'), T('xlsColEach'), T('xlsColTotal'), T('xlsColKwh'), T('xlsColNote'),
        T('xlsColPrinterId'), T('xlsColMaterialId'), T('colorChanges')];
      var aoa = [head];
      models.forEach(function (m) {
        var r = m.r, p = printerOf(m), mt = matById(m.materialId), resin = !!r.resin;
        var each = ((r.mat + r.mach) * (1 - last.disc) + r.energy + (r.post || 0)) * (1 + failRate()) * (1 + CONFIG.vat);
        var note = !r.fits ? T('warnTooBig', { printer: p ? p.name : T('thisPrinter') })
          : !materialAllowed(mt, p) ? T('warnMaterial', { material: mt.name, printer: p ? p.name : T('thisPrinter') }) : '';
        var sl = !!r.sliced;
        if (sl) note = T('slicedFile') + (note ? '. ' + note : '');
        aoa.push([m.name, techLabel(techOf(p)), p ? p.brand : '', p ? p.model : '', mt.name, m.qty, sl ? '' : m.scale,
          resin || sl ? '' : m.infill, resin && !sl ? (m.hollow ? T('hollow') : T('solid')) : '', sl ? '' : (m.supports ? yes : no),
          r.size.map(function (d) { return num1.format(d); }).join(' × '),
          Math.round(r.grams * 10) / 10, resin ? Math.round(r.ml * 10) / 10 : '', r.hours / 24,
          r.mat * R, r.mach * R, r.energy * R, (r.post || 0) * R, each * R, each * m.qty * R, Math.round(r.kwh * 1000) / 1000, note,
          p ? printerCode(p) : '', mt.baseName || mt.name, resin || sl ? '' : (m.colorChanges || 0)]);
      });
      var n = models.length;
      var tot = [T('xlsTotal'), '', '', '', '', { f: 'SUM(F2:F' + (n + 1) + ')' }, '', '', '', '', '', '', '', '', '', '', '', '', '', { f: 'SUM(T2:T' + (n + 1) + ')' }];
      aoa.push(tot);
      var ws = X.utils.aoa_to_sheet(aoa);
      for (var i = 2; i <= n + 2; i++) {
        ['O', 'P', 'Q', 'R', 'S', 'T'].forEach(function (c) { var cell = ws[c + i]; if (cell && cell.t === 'n') cell.z = cf; });
        var tc = ws['N' + i]; if (tc && tc.t === 'n') tc.z = tf;
      }
      ws['T' + (n + 2)].z = cf;
      ws['!cols'] = [28, 11, 13, 20, 24, 7, 8, 12, 11, 9, 20, 12, 12, 10, 12, 12, 12, 12, 12, 13, 9, 40, 22, 16, 12].map(function (w) { return { wch: w }; });
      ws['!autofilter'] = { ref: 'A1:Y' + (n + 1) };

      // Foglio 2: riepilogo, con le stesse voci mostrate nella pagina
      var pDef = printer(), q = o.quality;
      var unitLabel = el.unit.options[el.unit.selectedIndex] ? el.unit.options[el.unit.selectedIndex].textContent : '';
      var sum = [
        [T('xlsTitle')], [location.href.split('#')[0]], [],
        [T('xlsDate'), new Date().toLocaleString(LANG.locale)],
        [T('xlsCurrency'), currency + (currency === 'USD' ? ' (' + T('xlsRate', { rate: CONFIG.usdRate }) + ')' : '')],
        [T('xlsEnergyPrice', { unit: (currency === 'USD' ? '$' : '€') + '/kWh' }), Math.round(energyEUR * R * 1000) / 1000],
        [T('xlsQuality'), q.label], [T('xlsUnit'), unitLabel],
        [T('xlsDefPrinter'), pDef ? pDef.name : ''], [T('xlsDefMaterial'), matById(el.material.value).name], [],
        [T('quantity'), last.pieces], [T('xlsWeight'), Math.round(last.grams * 10) / 10], [T('xlsTime'), last.hours / 24], []
      ];
      var firstMoney = sum.length + 1;
      (last.rows || []).forEach(function (row) { sum.push([row[0], row[1] * R]); });
      sum.push([T('total'), last.total * R]);
      var lastMoney = sum.length;
      // Prezzi dei materiali usati, con l'indicazione di quelli personalizzati
      sum.push([], [T('xlsPrices', { unit: (currency === 'USD' ? '$' : '€') + '/kg' })]);
      var priceFirst = sum.length + 1, seen = {};
      models.forEach(function (m) {
        var mt = matById(m.materialId); if (seen[mt.id]) return; seen[mt.id] = 1;
        sum.push([mt.name + (matKey(mt) in myPrices ? ' (' + T('xlsPriceMine') + ')' : ''), priceKg(mt) * R]);
      });
      var priceLast = sum.length;
      sum.push([], [T('xlsNoteEstimate')], [T('xlsNoteImport')]);
      var ws2 = X.utils.aoa_to_sheet(sum);
      ws2['B14'].z = tf;
      for (var j = firstMoney; j <= lastMoney; j++) if (ws2['B' + j]) ws2['B' + j].z = cf;
      for (var jj = priceFirst; jj <= priceLast; jj++) if (ws2['B' + jj]) ws2['B' + jj].z = cf;
      ws2['!cols'] = [{ wch: 42 }, { wch: 30 }];

      // Foglio 3 (nascosto): impostazioni generali in forma leggibile dal simulatore
      var ws3 = X.utils.aoa_to_sheet([
        ['chiave', 'valore'], ['versione', 1], ['qualita', q.id], ['unita', +el.unit.value || 1], ['energia_eur_kwh', energyEUR], ['valuta', currency],
        ['stampante', pDef ? printerCode(pDef) : ''], ['materiale', matById(el.material.value).baseName || matById(el.material.value).name], ['riempimento', +el.infill.value],
        ['svuotati', el.hollow.checked ? 1 : 0], ['supporti', el.supports.checked ? 1 : 0],
        ['prezzi_eur_kg', JSON.stringify(myPrices)], ['fallite_percento', failPct]
      ]);
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, T('xlsSheetFiles'));
      X.utils.book_append_sheet(wb, ws2, T('xlsSheetSummary'));
      X.utils.book_append_sheet(wb, ws3, SHEET_HIDDEN);
      wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] };
      X.writeFile(wb, T('xlsFileName', { date: fileStamp() }));
      xlsMsg('');
    }).catch(function () { xlsMsg(T('xlsLoadError'), 'error'); });
  }

  // ----- Importazione -----
  var pending = [];   // impostazioni di file non ancora caricati, applicate quando arriva l'STL con lo stesso nome
  function norm(t) { return String(t === undefined || t === null ? '' : t).trim().toLowerCase(); }
  function takePending(name) {
    for (var i = 0; i < pending.length; i++) if (norm(pending[i].name) === norm(name)) return pending.splice(i, 1)[0];
    return null;
  }
  // Codici stabili (non dipendono dall'ordine nel file YAML né dalla lingua)
  function printerCode(p) { return p.brand + ' | ' + p.model; }
  function isYes(v) { return v === true || /^(s[iì]|yes|y|x|1|true|vero)$/i.test(String(v).trim()); }
  // Prima le colonne visibili (così valgono le modifiche fatte in Excel), poi il codice nascosto in fondo alla riga
  function findPrinter(code, brand, model) {
    var b = norm(brand), md = norm(model);
    var p = md ? (CONFIG.printers.filter(function (x) { return norm(x.model) === md && (!b || norm(x.brand) === b); })[0] ||
      CONFIG.printers.filter(function (x) { return norm(x.name) === md || norm(x.name) === norm(brand + ' ' + model); })[0]) : null;
    return p || CONFIG.printers.filter(function (x) { return norm(printerCode(x)) === norm(code); })[0] || null;
  }
  function findMaterial(code, name, tech) {
    var ok = CONFIG.materials.filter(function (x) { return !tech || x.tech === tech; });
    var nm = norm(name);
    var mt = nm ? ok.filter(function (x) { return norm(x.name) === nm || norm(x.baseName) === nm; })[0] : null;
    if (mt) return mt;
    mt = ok.filter(function (x) { return norm(x.baseName || x.name) === norm(code); })[0];
    if (mt) return mt;
    return nm ? ok.filter(function (x) { return primaParola(x.name) === primaParola(nm) || primaParola(x.baseName || '') === primaParola(nm); })[0] || null : null;
  }
  function readRow(r) {
    var name = String(r[COL.file] === undefined ? '' : r[COL.file]).trim();
    if (!name || !/\.(stl|3mf|gcode|gco|g|bgcode)$/i.test(name)) return null;
    var s = { name: name };
    var p = CONFIG.printers.length ? findPrinter(r[COL.printerId] || '', r[COL.brand] || '', r[COL.model] || '') : null;
    if (p) s.printerId = p.id;
    var mt = findMaterial(r[COL.materialId] || '', r[COL.material] || '', p ? p.tech : null);
    if (mt) s.materialId = mt.id;
    var qn = parseInt(r[COL.qty], 10); if (qn >= 1) s.qty = Math.min(999, qn);
    var sc = parseFloat(String(r[COL.scale]).replace(',', '.')); if (sc >= 1) s.scale = Math.min(1000, sc);
    var inf = parseFloat(String(r[COL.infill]).replace(',', '.').replace('%', ''));
    if (isFinite(inf)) { if (inf > 0 && inf <= 1) inf *= 100; s.infill = Math.min(100, Math.max(10, Math.round(inf / 5) * 5)); }
    var it = norm(r[COL.interior]);
    if (it) s.hollow = /svuot|hollow|cav/.test(it);
    if (r[COL.supports] !== undefined && String(r[COL.supports]).trim() !== '') s.supports = isYes(r[COL.supports]);
    var ccv = parseInt(r[COL.colorChanges], 10); if (ccv >= 0) s.colorChanges = Math.min(9999, ccv);
    return s;
  }
  function applySettings(m, s) {
    (m.sliced ? ['printerId', 'materialId', 'qty'] : ['printerId', 'materialId', 'qty', 'scale', 'infill', 'hollow', 'supports', 'colorChanges']).forEach(function (k) { if (s[k] !== undefined) m[k] = s[k]; });
    if (m.sliced && CONFIG.printers.length && techOf(printerOf(m)) === 'resina') m.printerId = CONFIG.printers.filter(function (p) { return p.tech !== 'resina'; })[0].id;
    if (!m.row) return;
    m.row.qtyIn.value = m.qty; m.row.scaleIn.value = m.scale;
    m.row.matSel.value = m.materialId; m.row.infSel.value = m.infill;
    m.row.supBox.checked = m.supports; m.row.holSel.value = m.hollow ? '1' : '0'; m.row.ccIn.value = m.colorChanges || 0;
    if (m.row.prSel) setPicker(m.row.teSel, m.row.brSel, m.row.prSel, m.printerId);
  }
  function applyGlobals(g) {
    if (g.qualita) { var qi = el.quality.querySelector('input[value="' + String(g.qualita).replace(/"/g, '') + '"]'); if (qi) qi.checked = true; }
    if (g.unita !== undefined) {
      var uo = Array.prototype.filter.call(el.unit.options, function (op) { return +op.value === +g.unita; })[0];
      if (uo) el.unit.value = uo.value;
    }
    var en = parseFloat(g.energia_eur_kwh);
    if (isFinite(en) && en >= 0) { energyEUR = en; scrivi('c3d-energia', String(en)); }
    if (g.valuta === 'EUR' || g.valuta === 'USD') { currency = g.valuta; el.currency.value = currency; scrivi('c3d-valuta', currency); makeMoney(); }
    showEnergy();
    var gf = parseFloat(g.fallite_percento);
    if (isFinite(gf) && gf >= 0 && gf <= 100) { failPct = gf; scrivi('c3d-fallite', String(gf)); if (el.fail) el.fail.value = String(gf); }
    if (g.prezzi_eur_kg !== undefined && String(g.prezzi_eur_kg).trim() !== '') {
      try {
        var gpz = JSON.parse(String(g.prezzi_eur_kg)), nuovi = {};
        if (gpz && typeof gpz === 'object') {
          Object.keys(gpz).forEach(function (k) { var v = +gpz[k]; if (isFinite(v) && v >= 0 && v <= 10000) nuovi[k] = v; });
          myPrices = nuovi; savePrices();
        }
      } catch (e) {}
    }
    var gp = g.stampante && CONFIG.printers.length ? findPrinter(g.stampante, '', '') : null;
    if (gp) setPicker(el.tech, el.brand, el.printer, gp.id);
    var gm = g.materiale ? findMaterial(g.materiale, '', gp ? gp.tech : null) : null;
    if (gm) el.material.value = gm.id;
    if (g.riempimento !== undefined && isFinite(+g.riempimento)) el.infill.value = Math.min(100, Math.max(0, +g.riempimento));
    if (g.svuotati !== undefined) el.hollow.checked = isYes(g.svuotati);
    if (g.supporti !== undefined) el.supports.checked = isYes(g.supporti);
  }
  function importExcel(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { xlsMsg(T('xlsImportBad'), 'error'); return; }
    xlsMsg(T('xlsLoading'));
    Promise.all([loadXLSX(), file.arrayBuffer()]).then(function (res) {
      var X = res[0], wb;
      try { wb = X.read(new Uint8Array(res[1]), { type: 'array', cellFormula: false, cellHTML: false }); }
      catch (e) { xlsMsg(T('xlsImportBad'), 'error'); return; }
      // Impostazioni generali dal foglio nascosto, se c'è
      var g = {};
      if (wb.Sheets[SHEET_HIDDEN]) {
        X.utils.sheet_to_json(wb.Sheets[SHEET_HIDDEN], { header: 1, defval: '' }).slice(1).forEach(function (r) {
          var k = String(r[0]).trim();
          if (/^[a-z_]+$/.test(k)) g[k] = r[1];
        });
      }
      // Righe dei file: il primo foglio che contiene nomi di file .stl
      var list = [];
      wb.SheetNames.some(function (nm) {
        if (nm === SHEET_HIDDEN) return false;
        var rows = X.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: '', raw: true });
        var found = rows.slice(1).map(readRow).filter(Boolean);
        if (found.length) { list = found; return true; }
        return false;
      });
      if (!list.length && !Object.keys(g).length) { xlsMsg(T('xlsImportNone'), 'error'); return; }
      applyGlobals(g);
      // Ogni riga va al primo file caricato con lo stesso nome; le altre restano in attesa
      var used = {}, applied = 0;
      pending = [];
      list.forEach(function (s) {
        var m = models.filter(function (x) { return !used[x.id] && norm(x.name) === norm(s.name); })[0];
        if (m) { used[m.id] = true; applySettings(m, s); applied++; }
        else pending.push(s);
      });
      refreshMaterialOptions(); showPrice(true); updateGrid(); update();
      var txt = !list.length ? T('xlsImportGlobals') : applied ? T('xlsImportDone', { n: applied, tot: list.length }) : T('xlsImportWaiting', { tot: list.length });
      if (pending.length) {
        var names = pending.slice(0, 4).map(function (s) { return s.name; }).join(', ') + (pending.length > 4 ? '…' : '');
        txt += ' ' + T('xlsImportPending', { files: names });
      }
      xlsMsg(txt, pending.length ? 'warn' : 'ok');
    }).catch(function () { xlsMsg(T('xlsLoadError'), 'error'); });
  }
  if (el.xlsOut) el.xlsOut.addEventListener('click', exportExcel);
  if (el.xlsIn && el.xlsFile) {
    el.xlsIn.addEventListener('click', function () { el.xlsFile.click(); });
    el.xlsFile.addEventListener('change', function () { importExcel(el.xlsFile.files[0]); el.xlsFile.value = ''; });
  }

  // ---------- Anteprima 3D (three.js caricato solo quando serve) ----------
  var view = null;
  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var threePromise = null;
  function loadThree() {
    if (window.THREE && window.THREE.WebGLRenderer) return Promise.resolve(window.THREE);
    if (threePromise) return threePromise;
    threePromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = THREE_URL; s.async = true;
      s.onload = function () { window.THREE ? res(window.THREE) : rej(); };
      s.onerror = rej;
      document.head.appendChild(s);
    });
    return threePromise;
  }

  function showPreview() {
    var m = current();
    if (!m) return;
    // Senza geometria (G-code) si mostra la miniatura salvata dallo slicer, se c'è
    if (!m.pos) {
      el.canvas.hidden = true; el.hint.hidden = true;
      if (el.thumb) { el.thumb.hidden = !m.thumb; if (m.thumb) el.thumb.src = m.thumb; }
      if (el.nothumb) el.nothumb.hidden = !!m.thumb;
      update();
      return;
    }
    if (el.thumb) el.thumb.hidden = true;
    if (el.nothumb) el.nothumb.hidden = true;
    loadThree().then(function (T) {
      if (current() !== m) return; // selezione cambiata nel frattempo
      if (!view) initView(T);
      if (view.modelId !== m.id) setModelMesh(m);
      el.canvas.hidden = false; el.hint.hidden = false;
      resize(); update();
    }).catch(function () { el.canvas.hidden = true; }); // senza anteprima il calcolo funziona comunque
  }

  function initView(T) {
    var renderer = new T.WebGLRenderer({ canvas: el.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(35, 1, 0.1, 100000);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a2f38, 0.55));
    var key = new T.DirectionalLight(0xffffff, 0.9); key.position.set(0.8, 1.2, 0.6);
    camera.add(key); scene.add(camera);
    var group = new T.Group(); scene.add(group);
    view = { T: T, renderer: renderer, scene: scene, camera: camera, group: group, mesh: null, modelId: null,
             theta: -0.75, phi: 1.05, radius: 100, target: new T.Vector3(), s: 0, grid: null };
    updateGrid();

    var drag = null;
    el.canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      if (el.canvas.setPointerCapture) el.canvas.setPointerCapture(e.pointerId);
    });
    el.canvas.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      view.theta -= (e.clientX - drag.x) * 0.01;
      if (e.pointerType === 'mouse') view.phi = Math.min(1.5, Math.max(0.15, view.phi - (e.clientY - drag.y) * 0.01));
      drag.x = e.clientX; drag.y = e.clientY;
      placeCamera(); render();
    });
    function end() { drag = null; }
    el.canvas.addEventListener('pointerup', end);
    el.canvas.addEventListener('pointercancel', end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(el.plate);
    else window.addEventListener('resize', resize);
  }

  // Griglia del piatto con la misura della stampante scelta
  function updateGrid() {
    if (!view) return;
    var cur = current(), T = view.T, b = buildVolume(cur ? printerOf(cur) : printer()), lato = Math.max(b[0], b[1]);
    if (view.grid) { view.scene.remove(view.grid); view.grid.geometry.dispose(); }
    view.grid = new T.GridHelper(lato, Math.max(1, Math.round(lato / 10)), 0x5a6270, 0x3a404a);
    view.scene.add(view.grid); render();
  }

  function clearMesh() {
    if (!view || !view.mesh) return;
    view.group.remove(view.mesh); view.mesh.geometry.dispose(); view.mesh.material.dispose();
    view.mesh = null; view.modelId = null; render();
  }

  function setModelMesh(m) {
    var T = view.T, st = m.stats;
    clearMesh();
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(m.pos, 3));
    g.translate(-(st.min[0] + st.max[0]) / 2, -(st.min[1] + st.max[1]) / 2, -st.min[2]);
    g.computeVertexNormals();
    var mesh = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0xE9E4DA, roughness: 0.6, metalness: 0.02 }));
    mesh.rotation.x = -Math.PI / 2; // STL è Z-up, three.js è Y-up
    view.group.add(mesh); view.mesh = mesh; view.modelId = m.id;
    view.s = 0; // forza il riadattamento della camera
  }

  function setMeshColor(hex) { if (view && view.mesh) { view.mesh.material.color.set(hex); render(); } }

  function applyViewScale(s) {
    var m = current();
    if (!view || !view.mesh || !m || view.modelId !== m.id || view.s === s) return;
    view.s = s;
    view.group.scale.setScalar(s);
    var size = m.stats.size.map(function (d) { return d * s; });
    var diag = Math.sqrt(size[0] * size[0] + size[1] * size[1] + size[2] * size[2]);
    view.radius = Math.max(diag, 1) / (2 * Math.tan((view.camera.fov * Math.PI / 180) / 2)) * 1.25;
    view.target.set(0, size[2] / 2, 0);
    view.camera.near = view.radius / 100; view.camera.far = view.radius * 100;
    view.camera.updateProjectionMatrix();
    placeCamera(); render();
  }

  function placeCamera() {
    var c = view.camera, r = view.radius;
    c.position.set(
      view.target.x + r * Math.sin(view.phi) * Math.sin(view.theta),
      view.target.y + r * Math.cos(view.phi),
      view.target.z + r * Math.sin(view.phi) * Math.cos(view.theta)
    );
    c.lookAt(view.target);
  }

  function resize() {
    if (!view) return;
    var w = el.plate.clientWidth, h = el.plate.clientHeight;
    if (!w || !h) return;
    view.renderer.setSize(w, h, false);
    view.camera.aspect = w / h; view.camera.updateProjectionMatrix();
    render();
  }

  var raf = 0;
  function render() {
    if (!view || raf) return;
    raf = requestAnimationFrame(function () { raf = 0; view.renderer.render(view.scene, view.camera); });
  }

  refreshMaterialOptions();
  update();
})();
