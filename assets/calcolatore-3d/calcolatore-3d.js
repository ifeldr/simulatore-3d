/* Calcolatore costo stampa 3D da file STL, v1.4 per Jekyll / GitHub Pages */
(function () {
  'use strict';

  /* ============ VALORI PREDEFINITI ============
     Non serve modificarli: prezzi e parametri si impostano in _data/calcolatore_3d.yml.
     Questi valori si usano solo se il file manca o se un campo non è valido. */
  var CONFIG = {
    contactEmail: 'preventivi@tuosito.it',  // dove arrivano le richieste
    vat: 0.22,                 // IVA
    machineRate: 1.80,         // € per ora di stampa (energia, usura, ammortamento)
    setupFee: 5.00,            // € fissi per ordine (preparazione, slicing, imballo)
    minOrder: 10.00,           // € imponibile minimo per ordine
    markup: 0.30,              // ricarico sul costo di materiale e macchina (0.30 = 30%)
    waste: 0.05,               // scarto materiale (spurghi, skirt, prove)
    maxFileMB: 80,             // dimensione massima di ogni file
    maxFiles: 20,              // numero massimo di file per preventivo
    buildVolume: [256, 256, 256], // area di stampa della stampante più grande, in mm
    wallThickness: 0.8,        // mm di pareti e strati pieni sopra/sotto (2 perimetri da 0,4)
    heatUpMinutes: 5,          // riscaldamento e preparazione per lavoro
    layerOverheadSec: 2,       // secondi persi a ogni cambio strato
    supports: { material: 0.15, time: 0.10 }, // maggiorazione con supporti
    quantityDiscounts: [       // sconto a partire da N pezzi
      { min: 10, pct: 0.05 },
      { min: 50, pct: 0.10 }
    ],
    // flow = mm³ al secondo di portata media reale (calibrala confrontando con il tuo slicer)
    qualities: [
      { id: 'draft',    label: 'Bozza',    layer: 0.28, flow: 9 },
      { id: 'standard', label: 'Standard', layer: 0.20, flow: 6, default: true },
      { id: 'fine',     label: 'Fine',     layer: 0.12, flow: 3.5 }
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
    set(CONFIG, 'machineRate', n(d.costo_orario, 0, 1000));
    set(CONFIG, 'setupFee', n(d.preparazione_ordine, 0, 100000));
    set(CONFIG, 'minOrder', n(d.ordine_minimo, 0, 100000));
    set(CONFIG, 'markup', pct(d.ricarico_percento, 1000));
    set(CONFIG, 'waste', pct(d.scarto_percento, 100));
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
        return { id: 'q' + (i + 1), label: String(r.nome), layer: layer, flow: flow, default: r.predefinita === true };
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
        return { id: 'm' + (i + 1), name: String(r.nome), density: dens, pricePerKg: price,
                 speed: speed === undefined ? 1 : speed, color: color };
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
    material: $('c3d-material'), applyAll: $('c3d-apply-all'), quality: $('c3d-quality'), infill: $('c3d-infill'),
    infillOut: $('c3d-infill-out'), unit: $('c3d-unit'), supports: $('c3d-supports'),
    empty: $('c3d-empty'), out: $('c3d-out'), pieces: $('c3d-pieces'), weight: $('c3d-weight'),
    time: $('c3d-time'), lines: $('c3d-lines'), total: $('c3d-total'), summary: $('c3d-summary'), cta: $('c3d-cta')
  };

  var money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  var num1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
  var num0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

  // ---------- Opzioni dinamiche ----------
  CONFIG.materials.forEach(function (m) {
    var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; el.material.appendChild(o);
  });
  CONFIG.qualities.forEach(function (q) {
    var id = 'c3d-q-' + q.id;
    var input = document.createElement('input');
    input.type = 'radio'; input.name = 'c3d-quality'; input.id = id; input.value = q.id; input.checked = !!q.default;
    var label = document.createElement('label'); label.htmlFor = id;
    var small = document.createElement('small'); small.textContent = q.layer.toFixed(2).replace('.', ',') + ' mm';
    label.appendChild(document.createTextNode(q.label)); label.appendChild(small);
    el.quality.appendChild(input); el.quality.appendChild(label);
  });

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
      if (count === 0 || 84 + count * 50 > buffer.byteLength) throw new Error('File STL binario non valido o incompleto.');
      pos = new Float32Array(count * 9);
      for (var i = 0; i < count; i++) {
        var off = 84 + i * 50 + 12;
        for (var j = 0; j < 9; j++) pos[i * 9 + j] = dv.getFloat32(off + j * 4, true);
      }
    } else {
      var text = new TextDecoder().decode(new Uint8Array(buffer));
      var re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g, m, arr = [];
      while ((m = re.exec(text))) arr.push(+m[1], +m[2], +m[3]);
      if (arr.length < 9) throw new Error('Nessun triangolo trovato nel file.');
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
  function estimatePiece(m, o) {
    var mt = matById(m.materialId);
    var s = o.unit * m.scale / 100;
    var V = m.stats.vol * s * s * s;
    var A = m.stats.area * s * s;
    var size = m.stats.size.map(function (d) { return d * s; });
    var shell = Math.min(V, A * CONFIG.wallThickness);
    var printed = shell + (V - shell) * m.infill / 100;
    if (m.supports) printed *= 1 + CONFIG.supports.material;
    var grams = printed / 1000 * mt.density;
    var sec = printed / (o.quality.flow * mt.speed) + (size[2] / o.quality.layer) * CONFIG.layerOverheadSec;
    if (m.supports) sec *= 1 + CONFIG.supports.time;
    var hours = sec / 3600;
    var k = 1 + CONFIG.markup;
    var a = size.slice().sort(function (x, y) { return x - y; });
    var b = CONFIG.buildVolume.slice().sort(function (x, y) { return x - y; });
    return {
      V: V, size: size, grams: grams, hours: hours,
      mat: grams / 1000 * mt.pricePerKg * (1 + CONFIG.waste) * k,
      mach: hours * CONFIG.machineRate * k,
      fits: a[0] <= b[0] && a[1] <= b[1] && a[2] <= b[2]
    };
  }

  function fmtTime(h) {
    var mins = Math.max(1, Math.round(h * 60));
    var hh = Math.floor(mins / 60), mm = mins % 60;
    return hh ? hh + ' h' + (mm ? ' ' + mm + ' min' : '') : mm + ' min';
  }
  function fmtSize(size) { return size.map(function (d) { return num1.format(d); }).join(' × ') + ' mm'; }

  var last = null;
  function update() {
    el.infillOut.textContent = el.infill.value + '%';
    var has = models.length > 0;
    el.empty.hidden = has; el.out.hidden = !has; el.cta.disabled = !has;
    el.listWrap.hidden = !has; el.drop.hidden = has; el.overlay.hidden = !has;
    if (!has) { last = null; return; }

    var o = globals();
    var matBy = {}, matOrder = [];
    var pieces = 0, mat = 0, mach = 0, grams = 0, hours = 0, tooBig = 0, results = [];
    models.forEach(function (m) { pieces += m.qty; });
    var disc = 0;
    CONFIG.quantityDiscounts.forEach(function (d) { if (pieces >= d.min && d.pct > disc) disc = d.pct; });

    models.forEach(function (m) {
      var r = estimatePiece(m, o);
      results.push(r);
      if (!(m.materialId in matBy)) { matBy[m.materialId] = 0; matOrder.push(m.materialId); }
      matBy[m.materialId] += r.mat * m.qty;
      mat += r.mat * m.qty; mach += r.mach * m.qty; grams += r.grams * m.qty; hours += r.hours * m.qty;
      if (!r.fits) tooBig++;
      var piecePrice = (r.mat + r.mach) * (1 - disc) * (1 + CONFIG.vat);
      m.row.meta.textContent = fmtSize(r.size) + ', ' + num1.format(r.grams) + ' g, ' + money.format(piecePrice) + ' a pezzo';
      var warn = !r.fits ? 'Supera l\'area di stampa: riduci la scala o lo dividiamo in parti.' : (m.unitHint || '');
      m.row.warn.textContent = warn; m.row.warn.hidden = !warn;
      m.r = r;
      m.row.swatch.style.background = matById(m.materialId).color;
    });
    hours += CONFIG.heatUpMinutes / 60;

    var discount = (mat + mach) * disc;
    var net = mat + mach - discount + CONFIG.setupFee;
    var minAdj = net < CONFIG.minOrder ? CONFIG.minOrder - net : 0;
    net += minAdj;
    var vat = net * CONFIG.vat, total = net + vat;
    el.applyAll.hidden = models.length < 2 || models.every(function (m) {
      return m.materialId === el.material.value && m.infill === +el.infill.value && m.supports === el.supports.checked;
    });
    last = { o: o, total: total, grams: grams, pieces: pieces, disc: disc };

    el.pieces.textContent = num0.format(pieces);
    el.weight.textContent = grams >= 1000 ? num1.format(grams / 1000) + ' kg' : num1.format(grams) + ' g';
    el.time.textContent = fmtTime(hours);

    var rows = matOrder.map(function (id) { return ['Materiale ' + matById(id).name, matBy[id]]; });
    rows.push(['Tempo di stampa', mach]);
    if (discount > 0) rows.push(['Sconto quantità ' + num0.format(disc * 100) + '%', -discount]);
    rows.push(['Preparazione ordine', CONFIG.setupFee]);
    if (minAdj > 0) rows.push(['Adeguamento a ordine minimo', minAdj]);
    rows.push(['IVA ' + num0.format(CONFIG.vat * 100) + '%', vat]);
    el.lines.innerHTML = '';
    rows.forEach(function (row) {
      var div = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = row[0];
      var dd = document.createElement('dd'); dd.textContent = money.format(row[1]);
      div.appendChild(dt); div.appendChild(dd); el.lines.appendChild(div);
    });
    el.total.textContent = money.format(total);
    el.summary.textContent = models.length === 1 ? '1 file' : models.length + ' file';

    if (tooBig) setMsg(tooBig === 1 ? 'Un file supera l\'area di stampa (' + CONFIG.buildVolume.join(' × ') + ' mm).'
      : tooBig + ' file superano l\'area di stampa (' + CONFIG.buildVolume.join(' × ') + ' mm).', 'warn');
    else if (notice) setMsg(notice, 'error');
    else if (!busy) setMsg('');

    var cur = current();
    if (cur) {
      el.fname.textContent = cur.name;
      el.dims.textContent = fmtSize(cur.r.size);
      if (view) { applyViewScale(o.unit * cur.scale / 100); setMeshColor(matById(cur.materialId).color); }
    }
  }

  // ---------- Elenco file ----------
  function addRow(m) {
    var li = document.createElement('li'); li.className = 'c3d-file';
    var pick = document.createElement('button'); pick.type = 'button'; pick.className = 'c3d-file-pick';
    pick.setAttribute('aria-label', 'Mostra ' + m.name + ' in anteprima');
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
    var mtLabel = document.createElement('span'); mtLabel.className = 'c3d-vh c3d-vh-m'; mtLabel.textContent = 'Materiale';
    var mtName = document.createElement('span'); mtName.className = 'c3d-vh'; mtName.textContent = ' (' + m.name + ')'; mtLabel.appendChild(mtName);
    var matSel = document.createElement('select');
    CONFIG.materials.forEach(function (x) {
      var op = document.createElement('option'); op.value = x.id; op.textContent = x.name.replace(/\s*\(.*\)$/, ''); op.title = x.name;
      matSel.appendChild(op);
    });
    matSel.value = m.materialId;
    matSel.addEventListener('change', function () { m.materialId = matSel.value; update(); });
    matWrap.appendChild(mtLabel); matWrap.appendChild(matSel);
    var qty = numField('Pezzi', m.qty, 1, 999);
    var scale = numField('Scala %', m.scale, 1, 1000);
    qty.input.addEventListener('input', function () { m.qty = Math.max(1, Math.floor(+qty.input.value || 1)); update(); });
    scale.input.addEventListener('input', function () { m.scale = Math.max(1, +scale.input.value || 100); update(); });

    var extra = document.createElement('div'); extra.className = 'c3d-file-extra';
    var infLabel = document.createElement('label');
    infLabel.appendChild(document.createTextNode('Riempimento'));
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
    var supBox = document.createElement('input'); supBox.type = 'checkbox'; supBox.checked = m.supports;
    supBox.addEventListener('change', function () { m.supports = supBox.checked; update(); });
    supLabel.appendChild(supBox); supLabel.appendChild(document.createTextNode('Supporti'));
    var supHidden = document.createElement('span'); supHidden.className = 'c3d-vh'; supHidden.textContent = ' (' + m.name + ')';
    supLabel.appendChild(supHidden);
    extra.appendChild(infLabel); extra.appendChild(supLabel);

    var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'c3d-file-remove';
    rm.setAttribute('aria-label', 'Rimuovi ' + m.name); rm.textContent = '×';
    rm.addEventListener('click', function () { removeModel(m.id); });
    pick.addEventListener('click', function () { select(m.id); });

    li.appendChild(pick); li.appendChild(matWrap); li.appendChild(qty.wrap); li.appendChild(scale.wrap); li.appendChild(rm); li.appendChild(extra);
    el.list.appendChild(li);
    m.row = { li: li, meta: meta, warn: warn, matSel: matSel, infSel: infSel, supBox: supBox, swatch: sw };
  }

  function markActive() {
    models.forEach(function (m) { m.row.li.classList.toggle('is-active', m.id === selectedId); });
  }

  function select(id) {
    selectedId = id; markActive();
    update(); showPreview();
  }

  function removeModel(id) {
    models = models.filter(function (m) {
      if (m.id === id) { el.list.removeChild(m.row.li); return false; }
      return true;
    });
    if (selectedId === id) selectedId = models.length ? models[0].id : null;
    markActive();
    if (!models.length) { el.canvas.hidden = true; el.hint.hidden = true; clearMesh(); notice = ''; setMsg(''); }
    update();
    if (models.length) showPreview();
  }

  // ---------- Caricamento file (uno alla volta, in coda) ----------
  var queue = [], busy = false, errors = [], notice = '';
  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    var room = CONFIG.maxFiles - models.length - queue.length;
    if (room <= 0) { setMsg('Puoi caricare al massimo ' + CONFIG.maxFiles + ' file per preventivo.', 'error'); return; }
    if (files.length > room) { errors.push('Caricati solo i primi ' + room + ' file: il limite è ' + CONFIG.maxFiles + '.'); files = files.slice(0, room); }
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
    setMsg('Analisi di ' + file.name + '…' + (queue.length ? ' (altri ' + queue.length + ' in coda)' : ''));
    if (!/\.stl$/i.test(file.name)) { errors.push(file.name + ': non è un file .stl.'); return next(); }
    if (file.size > CONFIG.maxFileMB * 1024 * 1024) { errors.push(file.name + ': supera ' + CONFIG.maxFileMB + ' MB.'); return next(); }
    var reader = new FileReader();
    reader.onerror = function () { errors.push(file.name + ': impossibile leggerlo.'); next(); };
    reader.onload = function () {
      try {
        var pos = parseSTL(reader.result);
        var stats = meshStats(pos);
        if (!(stats.vol > 0)) throw new Error('il modello non ha volume, verifica che la mesh sia chiusa.');
        var maxDim = Math.max.apply(null, stats.size);
        var hint = maxDim < 5 ? 'Misura meno di 5 mm: controlla l\'unità dei file.'
          : maxDim > 2000 ? 'Supera i 2 metri: controlla l\'unità dei file.' : '';
        var m = { id: nextId++, name: file.name, pos: pos, stats: stats, qty: 1, scale: 100, materialId: el.material.value,
                  infill: +el.infill.value || 20, supports: el.supports.checked, unitHint: hint };
        models.push(m); addRow(m);
        if (selectedId === null) { selectedId = m.id; markActive(); update(); showPreview(); }
        else update();
      } catch (e) {
        errors.push(file.name + ': ' + (e.message || 'file STL non valido.'));
      }
      setTimeout(next, 0);
    };
    reader.readAsArrayBuffer(file);
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

  el.material.addEventListener('change', update);
  el.applyAll.addEventListener('click', function () {
    models.forEach(function (m) {
      m.materialId = el.material.value; m.row.matSel.value = m.materialId;
      m.infill = +el.infill.value; m.row.infSel.value = m.infill;
      m.supports = el.supports.checked; m.row.supBox.checked = m.supports;
    });
    update();
  });
  [el.infill, el.unit, el.supports].forEach(function (c) { // i predefiniti aggiornano solo il pulsante "Applica a tutti"
    c.addEventListener('input', update); c.addEventListener('change', update);
  });
  el.quality.addEventListener('change', update);

  // ---------- Richiesta preventivo ----------
  el.cta.addEventListener('click', function () {
    if (!models.length || !last) return;
    var o = last.o;
    var lines = [
      'Buongiorno,',
      'vorrei un preventivo per questa stampa 3D (allego i file a questa email):',
      ''
    ];
    models.forEach(function (m, i) {
      lines.push((i + 1) + '. ' + m.name + ': ' + matById(m.materialId).name + ', ' + m.qty + ' pz, riempimento ' + m.infill + '%, ' + (m.supports ? 'con' : 'senza') + ' supporti, scala ' + m.scale + '%, ' + fmtSize(m.r.size) + ', ' + num1.format(m.r.grams) + ' g a pezzo');
    });
    lines.push('',
      'Qualità: ' + o.quality.label + ' (' + o.quality.layer + ' mm)',
      'Pezzi totali: ' + last.pieces,
      'Prezzo stimato: ' + money.format(last.total) + ' IVA inclusa',
      '', 'Nome:', 'Telefono:');
    window.location.href = 'mailto:' + CONFIG.contactEmail +
      '?subject=' + encodeURIComponent('Preventivo stampa 3D: ' + models.length + (models.length === 1 ? ' file' : ' file')) +
      '&body=' + encodeURIComponent(lines.join('\n'));
  });

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
    scene.add(new T.GridHelper(CONFIG.buildVolume[0], Math.round(CONFIG.buildVolume[0] / 10), 0x5a6270, 0x3a404a));
    var group = new T.Group(); scene.add(group);
    view = { T: T, renderer: renderer, scene: scene, camera: camera, group: group, mesh: null, modelId: null,
             theta: -0.75, phi: 1.05, radius: 100, target: new T.Vector3(), s: 0 };

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

  update();
})();
