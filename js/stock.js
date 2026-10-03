/* Módulo Stock + Códigos de barras para el Facturador (Pack Gestión Comercial).
   Se carga después del script principal y amplía sus funciones. Todo queda en este dispositivo. */

// ---------- Datos ----------
db.movements = db.movements || [];
db.products.forEach(p => {
  if (p.stock === undefined) p.stock = null;         // null = no controla stock
  if (p.minStock === undefined) p.minStock = 0;
});
if (!db.stockSeeded && !db.sales.length && db.products.some(p => p.id === 'p1')) {
  // Datos de ejemplo del modo demo: stock inicial para que se vea el módulo funcionando
  const demo = { p1: [12, 3], p2: [2, 3], p3: [null, 0] };
  db.products.forEach(p => { if (demo[p.id]) { p.stock = demo[p.id][0]; p.minStock = demo[p.id][1]; } });
}
db.stockSeeded = true;
save();

const tracked = p => p && p.stock !== null && p.stock !== undefined && p.stock !== '';
const stockState = p => !tracked(p) ? 'off' : p.stock <= 0 ? 'out' : (p.minStock > 0 && p.stock <= p.minStock) ? 'low' : 'ok';
function stockBadge(p) {
  const s = stockState(p);
  if (s === 'off') return '<span class="badge sk-off">Sin control de stock</span>';
  if (s === 'out') return `<span class="badge sk-out">● Sin stock${p.stock < 0 ? ' (' + p.stock + ')' : ''}</span>`;
  if (s === 'low') return `<span class="badge sk-low">● Stock bajo · ${p.stock}</span>`;
  return `<span class="badge sk-ok">● ${p.stock} disponible${p.stock === 1 ? '' : 's'}</span>`;
}
function addMovement(p, qty, type, note, saleNumber) {
  if (!tracked(p) || !qty) return;
  p.stock = (+p.stock || 0) + qty;
  db.movements.push({ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 5), date: new Date().toISOString(), productId: p.id, name: p.name, qty, type, note: note || '', sale: saleNumber || '', after: p.stock });
  if (db.movements.length > 3000) db.movements = db.movements.slice(-3000);
}

// ---------- Códigos ----------
function eanCheck(d12) { let s = 0; for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1); return String((10 - (s % 10)) % 10); }
function analyzeCode(raw) {
  const c = String(raw || '').trim();
  if (!c) return { empty: true };
  if (/^\d{12,13}$/.test(c)) {
    if (c.length === 12) return { value: c + eanCheck(c), format: 'EAN13' };
    if (eanCheck(c.slice(0, 12)) !== c[12]) return { error: 'El último número no coincide: revisá el código (debería terminar en ' + eanCheck(c.slice(0, 12)) + ').' };
    return { value: c, format: 'EAN13' };
  }
  if (/^\d{8}$/.test(c)) return { value: c, format: 'EAN8' };
  if (/[^\x20-\x7E]/.test(c)) return { error: 'Usá letras sin tilde, números o guiones.' };
  return { value: c, format: 'CODE128' };
}
// Códigos internos: EAN-13 con prefijo 20 (rango reservado por GS1 para uso dentro del propio comercio)
function newInternalCode() {
  const used = new Set(db.products.map(p => String(p.sku || '')));
  db.codeSeq = db.codeSeq || 1;
  let code;
  do { const base = '20' + String(db.codeSeq++).padStart(10, '0'); code = base + eanCheck(base); } while (used.has(code));
  save();
  return code;
}
function barcodeSvg(code, h) {
  const a = analyzeCode(code);
  if (!a.value || typeof JsBarcode === 'undefined') return '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  let ok = true;
  try {
    JsBarcode(svg, a.value, { format: a.format, width: 2, height: h || 50, margin: 0, marginLeft: 20, marginRight: 20, marginTop: 3, marginBottom: 3, fontSize: 17, textMargin: 2, font: 'monospace', background: '#ffffff', valid: v => { ok = v; } });
  } catch (e) { ok = false; }
  if (!ok) return '';
  const w = svg.getAttribute('width'), hh = svg.getAttribute('height');
  svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(hh)}`); svg.removeAttribute('width'); svg.removeAttribute('height');
  return svg.outerHTML;
}
function findByCode(raw) {
  const c = String(raw || '').trim().toLowerCase();
  if (!c) return null;
  const a = analyzeCode(raw);
  return db.products.find(p => {
    const s = String(p.sku || '').trim().toLowerCase();
    return s && (s === c || (a.value && s === a.value.toLowerCase()) || (/^\d{13}$/.test(s) && s.slice(0, 12) === c));
  }) || null;
}

// ---------- Escáner (lector USB/Bluetooth o cámara del celular) ----------
const canCamera = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
async function scanWithCamera(onCode) {
  let stream;
  try {
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'qr_code'] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h3>Apuntá al código de barras</h3><button class="btn ghost" id="cam-close">×</button></div><video id="cam-video" playsinline muted style="width:100%;border-radius:14px;background:#000;max-height:60vh"></video><p class="muted" style="margin-top:10px">Acercá el celu hasta que el código se vea nítido. Se agrega solo.</p>`;
    document.getElementById('modal').classList.add('show');
    const video = document.getElementById('cam-video');
    video.srcObject = stream; await video.play();
    let done = false;
    const stop = () => { done = true; stream.getTracks().forEach(t => t.stop()); closeModal(); };
    document.getElementById('cam-close').onclick = stop;
    const loop = async () => {
      if (done) return;
      try { const r = await detector.detect(video); if (r && r[0]) { stop(); onCode(r[0].rawValue); return; } } catch (e) {}
      setTimeout(loop, 250);
    };
    loop();
  } catch (e) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    toast('No se pudo usar la cámara. Revisá el permiso o escribí el código.');
  }
}
function scanBox(id, placeholder, onCode) {
  return `<div class="scan-box"><span class="scan-ic" aria-hidden="true">▥</span><input id="${id}" placeholder="${placeholder}" autocomplete="off" inputmode="text" enterkeyhint="done"><button type="button" class="btn secondary small" data-scan-add="${id}">Agregar</button>${canCamera ? `<button type="button" class="btn secondary small" data-scan-cam="${id}" title="Escanear con la cámara">📷</button>` : ''}</div>`;
}
function bindScan(id, onCode) {
  const inp = document.getElementById(id); if (!inp) return;
  const go = () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; onCode(v); inp.focus(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  document.querySelector(`[data-scan-add="${id}"]`)?.addEventListener('click', go);
  document.querySelector(`[data-scan-cam="${id}"]`)?.addEventListener('click', () => scanWithCamera(onCode));
}

// ---------- Nueva venta: escanear y descontar stock ----------
function addProductToSale(p) {
  items = items.filter(x => x.name || x.price);
  const it = items.find(x => x.productId === p.id);
  if (it) it.qty = (+it.qty || 0) + 1;
  else items.push({ productId: p.id, name: p.name, description: p.description || '', qty: 1, price: p.price });
  renderItems(); updateSummary(); window.syncAdjustment?.();
  const inCart = items.filter(x => x.productId === p.id).reduce((a, x) => a + (+x.qty || 0), 0);
  if (tracked(p) && inCart > p.stock) toast(`Atención: de "${p.name}" te quedan ${p.stock}.`);
  else toast(`Agregado: ${p.name}`);
}
function saleScan(code) {
  const p = findByCode(code);
  if (p) return addProductToSale(p);
  toast('No hay ningún producto con ese código.');
  if (confirm(`No encontré el código ${code}.\n¿Querés crear un producto nuevo con ese código?`)) openProductModal('', { sku: code });
}
function renderItems() {
  const el = document.getElementById('items-list'); if (!el) return;
  el.innerHTML = items.map((it, i) => {
    const p = it.productId ? db.products.find(x => x.id === it.productId) : null;
    const hint = p && tracked(p) ? `<small class="stock-hint ${p.stock - it.qty < 0 ? 'is-out' : ''}">Stock: ${p.stock}${p.stock - it.qty < 0 ? ' · no alcanza' : ''}</small>` : '';
    return `<div class="item-row"><div class="field"><label>Producto</label><select onchange="pickProduct(${i},this.value)">${productOptions(it.productId)}</select></div><div class="field"><label>Nombre</label><input value="${esc(it.name)}" placeholder="Producto o servicio" oninput="items[${i}].name=this.value" />${hint}</div><div class="field"><label>Cant.</label><input type="number" min="1" value="${it.qty}" oninput="items[${i}].qty=+this.value||1;updateSummary()" onchange="renderItems()" /></div><div class="field"><label>Precio unitario</label><input type="number" min="0" value="${it.price}" oninput="items[${i}].price=+this.value||0;updateSummary()" /></div><div class="item-total">${money(it.qty * it.price)}</div><button class="icon-btn" onclick="removeItem(${i})" title="Eliminar">×</button></div>`;
  }).join('');
}
function productOptions(sel) {
  return '<option value="">Elegir producto…</option>' + db.products.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} · ${money(p.price)}${tracked(p) ? ' · stock ' + p.stock : ''}</option>`).join('');
}
function pickProduct(i, id) {
  const p = db.products.find(x => x.id === id);
  if (p) { items[i] = { ...items[i], productId: p.id, name: p.name, description: p.description || '', price: p.price }; renderItems(); updateSummary(); window.syncAdjustment?.(); }
}
const _completeSale = completeSale;
completeSale = function () {
  const short = items.filter(x => x.productId).map(x => ({ x, p: db.products.find(p => p.id === x.productId) }))
    .filter(({ x, p }) => tracked(p) && (+x.qty || 0) > p.stock);
  if (short.length && !confirm('No alcanza el stock de:\n' + short.map(({ x, p }) => `• ${p.name}: pedís ${x.qty}, hay ${p.stock}`).join('\n') + '\n\n¿Confirmar la venta igual?')) return;
  const before = db.sales.length;
  _completeSale();
  if (db.sales.length === before) return;
  const sale = db.sales[db.sales.length - 1];
  sale.items.forEach(x => { const p = db.products.find(pp => pp.id === x.productId); if (p) addMovement(p, -(+x.qty || 0), 'venta', '', sale.number); });
  sale.stockApplied = true;
  save();
};
function deleteSale(id) {
  const s = db.sales.find(x => x.id === id); if (!s) return;
  if (!confirm('¿Eliminar este comprobante? Esta acción no se puede deshacer.')) return;
  if (s.stockApplied && s.items.some(x => x.productId) && confirm('¿Devolver al stock los productos de esta venta?')) {
    s.items.forEach(x => { const p = db.products.find(pp => pp.id === x.productId); if (p) addMovement(p, +x.qty || 0, 'anulación', 'Comprobante eliminado', s.number); });
  }
  db.sales = db.sales.filter(x => x.id !== id); save(); renderHistory(); renderDashboard(); toast('Comprobante eliminado.');
}

// ---------- Productos ----------
function renderProducts() {
  const el = document.getElementById('products-list');
  el.innerHTML = db.products.length ? db.products.map(p => `<div class="mini-card"><h4>${esc(p.name)}</h4><p>${esc(p.description || 'Sin descripción')}</p><p><strong>${money(p.price)}</strong>${p.cost ? ' <span class="muted">· costo ' + money(p.cost) + '</span>' : ''}${p.sku ? ' · <span class="code-chip">' + esc(p.sku) + '</span>' : ' · <span class="muted">sin código</span>'}</p><p>${stockBadge(p)}</p><div class="mini-actions"><button class="btn secondary small" onclick="openMoveModal('${p.id}')">± Stock</button><button class="btn secondary small" onclick="openProductModal('${p.id}')">Editar</button><button class="btn danger small" onclick="deleteProduct('${p.id}')">Eliminar</button></div></div>`).join('') : '<div class="empty">No hay productos guardados.</div>';
}
function openProductModal(id = '', preset = {}) {
  const p = db.products.find(x => x.id === id) || { name: '', description: '', price: '', sku: preset.sku || '', stock: 0, minStock: 0 };
  const isTracked = id ? tracked(p) : true;
  document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h3>${id ? 'Editar producto' : 'Nuevo producto'}</h3><button class="btn ghost" onclick="closeModal()">×</button></div>
  <div class="form-grid"><div class="field full"><label>Nombre</label><input id="m-name" value="${esc(p.name)}"></div>
  <div class="field full"><label>Descripción (opcional)</label><input id="m-desc" value="${esc(p.description)}"></div>
  <div class="field"><label>Precio</label><input id="m-price" type="number" min="0" value="${p.price}"></div>
  <div class="field"><label>Código de barras</label><div class="code-input"><input id="m-sku" value="${esc(p.sku)}" placeholder="Escaneá o escribí el código"><button type="button" class="btn secondary small" id="m-gen" title="Crear un código para este producto">Crear código</button></div></div>
  <div class="field full"><div class="code-preview" id="m-code-prev"></div><small class="muted" id="m-code-msg"></small></div>
  <div class="field full"><label class="check-row"><input type="checkbox" id="m-track" ${isTracked ? 'checked' : ''}> Controlar el stock de este producto</label><small class="muted">Destildalo para servicios o productos que no se cuentan.</small></div>
  <div class="field stock-f"><label>${id ? 'Stock actual' : 'Stock inicial'}</label><input id="m-stock" type="number" step="1" value="${tracked(p) ? p.stock : 0}"></div>
  <div class="field stock-f"><label>Avisarme cuando queden</label><input id="m-min" type="number" min="0" step="1" value="${p.minStock || 0}"><small class="muted">Con 0 no avisa.</small></div></div>
  <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn primary" onclick="saveProduct('${id}')">Guardar producto</button></div>`;
  document.getElementById('modal').classList.add('show');
  const sku = document.getElementById('m-sku'), track = document.getElementById('m-track');
  const prev = () => {
    const a = analyzeCode(sku.value), msg = document.getElementById('m-code-msg');
    document.getElementById('m-code-prev').innerHTML = a.value ? barcodeSvg(sku.value, 44) : '';
    const dup = sku.value.trim() && db.products.find(x => x.id !== id && String(x.sku || '').trim() === (a.value || sku.value.trim()));
    msg.textContent = a.error || (dup ? `⚠ Ese código ya lo tiene "${dup.name}".` : a.empty ? 'Si el producto no tiene código, tocá "Crear código" y después imprimilo desde Stock › Códigos para escanear.' : a.format === 'EAN13' && a.value.startsWith('2') ? 'Código interno del comercio (válido para tus etiquetas y tu lector).' : '');
    msg.style.color = a.error || dup ? 'var(--red)' : '';
  };
  const toggle = () => document.querySelectorAll('.stock-f').forEach(e => e.style.display = track.checked ? '' : 'none');
  sku.addEventListener('input', prev); track.addEventListener('change', toggle);
  document.getElementById('m-gen').onclick = () => { sku.value = newInternalCode(); prev(); };
  prev(); toggle();
}
function saveProduct(id) {
  const old = db.products.find(x => x.id === id);
  const skuRaw = document.getElementById('m-sku').value.trim(), a = analyzeCode(skuRaw);
  if (a.error) { toast(a.error); return; }
  const sku = a.value || '';
  if (sku && db.products.some(x => x.id !== id && String(x.sku || '').trim() === sku)) { toast('Ese código ya lo tiene otro producto.'); return; }
  const track = document.getElementById('m-track').checked;
  const p = { ...(old || {}), id: id || 'p' + Date.now(), name: document.getElementById('m-name').value.trim(), description: document.getElementById('m-desc').value.trim(), price: +document.getElementById('m-price').value || 0, sku, minStock: Math.max(0, parseInt(document.getElementById('m-min').value, 10) || 0) };
  if (!p.name) { toast('Escribí un nombre.'); return; }
  const target = Math.round(+document.getElementById('m-stock').value || 0);
  if (!track) p.stock = null;
  if (id) db.products = db.products.map(x => x.id === id ? p : x); else db.products.push(p);
  if (track) {
    if (!tracked(old)) { p.stock = 0; addMovement(p, target, id ? 'ajuste' : 'alta', id ? 'Empieza a controlar stock' : 'Stock inicial'); if (!target) p.stock = 0; }
    else if (target !== old.stock) addMovement(p, target - old.stock, 'ajuste', 'Corrección manual');
  }
  save(); closeModal(); renderProducts(); if (document.getElementById('stock-view').classList.contains('active')) renderStock(); toast('Producto guardado.');
}

// ---------- Movimientos ----------
function openMoveModal(id, type = 'entrada') {
  const p = db.products.find(x => x.id === id); if (!p) return;
  if (!tracked(p)) { if (confirm(`"${p.name}" no controla stock. ¿Activarlo?`)) openProductModal(id); return; }
  document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h3>${esc(p.name)}</h3><button class="btn ghost" onclick="closeModal()">×</button></div>
  <p>${stockBadge(p)}</p>
  <div class="seg-row" id="mv-type">${[['entrada', '＋ Entrada'], ['salida', '− Salida'], ['ajuste', '= Conteo']].map(([v, t]) => `<button type="button" data-v="${v}" class="${v === type ? 'on' : ''}">${t}</button>`).join('')}</div>
  <div class="form-grid" style="margin-top:14px"><div class="field"><label id="mv-qlabel">Cantidad</label><input id="mv-qty" type="number" min="0" step="1" value="1"></div><div class="field"><label>Motivo (opcional)</label><input id="mv-note" placeholder="Ej.: compra a proveedor, rotura, regalo"></div></div>
  <p class="muted" id="mv-prev"></p>
  <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn primary" id="mv-ok">Registrar</button></div>`;
  document.getElementById('modal').classList.add('show');
  let t = type;
  const q = document.getElementById('mv-qty');
  const upd = () => {
    const n = Math.max(0, parseInt(q.value, 10) || 0);
    document.getElementById('mv-qlabel').textContent = t === 'ajuste' ? 'Cantidad que contaste' : 'Cantidad';
    const after = t === 'entrada' ? p.stock + n : t === 'salida' ? p.stock - n : n;
    document.getElementById('mv-prev').textContent = `Va a quedar en ${after}.`;
  };
  document.querySelectorAll('#mv-type button').forEach(b => b.onclick = () => { t = b.dataset.v; document.querySelectorAll('#mv-type button').forEach(x => x.classList.toggle('on', x === b)); if (t === 'ajuste') q.value = p.stock; upd(); });
  q.addEventListener('input', upd); q.focus(); q.select(); upd();
  document.getElementById('mv-ok').onclick = () => {
    const n = Math.max(0, parseInt(q.value, 10) || 0), note = document.getElementById('mv-note').value.trim();
    const delta = t === 'entrada' ? n : t === 'salida' ? -n : n - p.stock;
    if (!delta) { toast('No hay cambios para registrar.'); return; }
    addMovement(p, delta, t, note); save(); closeModal(); refreshStockViews(); toast(`Listo: ${p.name} quedó en ${p.stock}.`);
  };
}
function refreshStockViews() {
  if (document.getElementById('stock-view')?.classList.contains('active')) renderStock();
  if (document.getElementById('products-view')?.classList.contains('active')) renderProducts();
  if (document.getElementById('dashboard-view')?.classList.contains('active')) renderDashboard();
}

// ---------- Vista Stock ----------
let stockFilter = { q: '', low: false };
function renderStock() {
  const v = document.getElementById('stock-view');
  const tr = db.products.filter(tracked);
  const units = tr.reduce((a, p) => a + Math.max(0, p.stock), 0);
  const low = tr.filter(p => stockState(p) === 'low').length, out = tr.filter(p => stockState(p) === 'out').length;
  const q = stockFilter.q.toLowerCase();
  const list = db.products.filter(p => (!q || p.name.toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q)) && (!stockFilter.low || ['low', 'out'].includes(stockState(p))));
  const moves = db.movements.slice(-30).reverse();
  const typeTxt = { venta: 'Venta', entrada: 'Entrada', salida: 'Salida', ajuste: 'Conteo', alta: 'Alta', 'anulación': 'Anulación' };
  v.innerHTML = `<div class="welcome suite-hero"><div><h2>Stock</h2><p>Cuánto tenés de cada producto. Cada venta lo descuenta sola.</p></div><div class="toolbar"><button class="btn secondary" onclick="openLabelsModal()">▥ Códigos para escanear</button><button class="btn primary" onclick="openProductModal()">＋ Nuevo producto</button></div></div>
  <div class="stats four"><div class="stat"><div><span>Productos con stock</span><strong>${tr.length}</strong></div><div class="stat-icon">▦</div></div><div class="stat"><div><span>Unidades en total</span><strong>${units}</strong></div><div class="stat-icon">∑</div></div><div class="stat ${low ? 'is-warn' : ''}"><div><span>Stock bajo</span><strong>${low}</strong></div><div class="stat-icon">!</div></div><div class="stat ${out ? 'is-bad' : ''}"><div><span>Sin stock</span><strong>${out}</strong></div><div class="stat-icon">○</div></div></div>
  <div class="card" style="margin-bottom:18px"><div class="card-head"><div><h3>Registrar entrada o salida rápida</h3><div class="muted">Escaneá el código con el lector (o escribilo y Enter). Cada lectura suma o resta 1.</div></div></div>
  <div class="seg-row" id="qk-type"><button type="button" data-v="entrada" class="on">＋ Entrada (llegó mercadería)</button><button type="button" data-v="salida">− Salida (rotura, uso, regalo)</button></div>
  <div style="margin-top:12px">${scanBox('stock-scan', 'Escaneá o escribí el código y Enter')}</div><div class="muted" id="qk-last" style="margin-top:8px"></div></div>
  <div class="card" style="margin-bottom:18px"><div class="card-head"><div><h3>Tus productos</h3></div><div class="toolbar"><input id="sk-q" placeholder="Buscar por nombre o código" value="${esc(stockFilter.q)}"><label class="check-row"><input type="checkbox" id="sk-low" ${stockFilter.low ? 'checked' : ''}> Solo stock bajo</label><button class="btn secondary small" onclick="exportStock()">⤓ Excel</button></div></div>
  <div class="table-wrap"><table class="stock-table"><thead><tr><th>Producto</th><th>Código</th><th>Stock</th><th>Aviso</th><th>Acciones</th></tr></thead><tbody>${list.length ? list.map(p => `<tr><td><strong>${esc(p.name)}</strong><br><span class="muted">${money(p.price)}</span></td><td>${p.sku ? `<span class="code-chip">${esc(p.sku)}</span>` : '<button class="btn ghost small" onclick="quickCode(\'' + p.id + '\')">Crear código</button>'}</td><td>${stockBadge(p)}</td><td>${tracked(p) && p.minStock ? '≤ ' + p.minStock : '—'}</td><td><button class="btn ghost" onclick="openMoveModal('${p.id}','entrada')">＋ Entrada</button><button class="btn ghost" onclick="openMoveModal('${p.id}','salida')">− Salida</button><button class="btn ghost" onclick="openMoveModal('${p.id}','ajuste')">= Conteo</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty">No hay productos con ese filtro.</td></tr>'}</tbody></table></div></div>
  <div class="card"><div class="card-head"><div><h3>Últimos movimientos</h3><div class="muted">Ventas, entradas, salidas y conteos.</div></div></div>${moves.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th>Cantidad</th><th>Queda</th></tr></thead><tbody>${moves.map(m => `<tr><td>${dateText(m.date)}</td><td>${esc(m.name)}${m.note ? `<br><span class="muted">${esc(m.note)}</span>` : ''}</td><td>${typeTxt[m.type] || m.type}${m.sale ? ' #' + m.sale : ''}</td><td><strong class="${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${m.qty}</strong></td><td>${m.after}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Todavía no hay movimientos.</div>'}</div>`;
  let qt = 'entrada';
  document.querySelectorAll('#qk-type button').forEach(b => b.onclick = () => { qt = b.dataset.v; document.querySelectorAll('#qk-type button').forEach(x => x.classList.toggle('on', x === b)); document.getElementById('stock-scan').focus(); });
  bindScan('stock-scan', code => {
    const p = findByCode(code);
    if (!p) { toast('No hay ningún producto con ese código.'); if (confirm(`No encontré el código ${code}.\n¿Crear un producto nuevo con ese código?`)) openProductModal('', { sku: code }); return; }
    if (!tracked(p)) { toast(`"${p.name}" no controla stock.`); return; }
    addMovement(p, qt === 'entrada' ? 1 : -1, qt, 'Lectura rápida'); save();
    const last = `${qt === 'entrada' ? '＋1' : '−1'} ${p.name} → quedan ${p.stock}`;
    renderStock(); document.getElementById('qk-last').textContent = last;
    document.querySelectorAll('#qk-type button').forEach(x => x.classList.toggle('on', x.dataset.v === qt));
    document.getElementById('stock-scan').focus();
    // mantener el tipo elegido después de redibujar
    document.querySelectorAll('#qk-type button').forEach(b => b.onclick = () => { qt = b.dataset.v; document.querySelectorAll('#qk-type button').forEach(x => x.classList.toggle('on', x === b)); });
  });
  const sq = document.getElementById('sk-q');
  sq.addEventListener('input', () => { stockFilter.q = sq.value; const pos = sq.selectionStart; renderStock(); const n = document.getElementById('sk-q'); n.focus(); n.setSelectionRange(pos, pos); });
  document.getElementById('sk-low').onchange = e => { stockFilter.low = e.target.checked; renderStock(); };
}
function quickCode(id) { const p = db.products.find(x => x.id === id); if (!p) return; p.sku = newInternalCode(); save(); renderStock(); toast('Código creado: ' + p.sku); }
function exportStock() {
  const rows = [['Producto', 'Código', 'Precio', 'Stock', 'Avisar con'], ...db.products.map(p => [p.name, p.sku || '', p.price, tracked(p) ? p.stock : '', tracked(p) ? p.minStock : ''])];
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'stock-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ---------- Etiquetas con código de barras ----------
function openLabelsModal() {
  const ps = db.products;
  if (!ps.length) { toast('Primero cargá productos.'); return; }
  document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h3>Códigos para escanear</h3><button class="btn ghost" onclick="closeModal()">×</button></div>
  <p class="muted">Para pegar en los productos que no traen código, así los escaneás al vender y al contar el stock. Salen en hoja A4 (24 por hoja). Los productos sin código reciben uno automáticamente.</p>
  <div class="notice" style="margin:4px 0 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between"><span>¿Etiquetas para mostrar, con tu marca, precio, ofertas o en planchas autoadhesivas? Hacelas en <b>Genera-etiquetas</b> con estos mismos productos.</span><button type="button" class="btn secondary small" onclick="closeModal();abrirLlevarProductos()">⇄ Llevar mis productos</button></div>
  <div class="label-list">${ps.map(p => `<label class="label-item"><span><strong>${esc(p.name)}</strong><br><span class="muted">${p.sku ? esc(p.sku) : 'sin código (se crea uno)'}</span></span><input type="number" min="0" max="500" value="${p.sku && p.sku.startsWith('20') ? Math.max(0, tracked(p) ? p.stock : 1) : 0}" data-lbl="${p.id}"></label>`).join('')}</div>
  <label class="check-row" style="margin-top:10px"><input type="checkbox" id="lbl-price"> Mostrar también el precio</label>
  <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn primary" id="lbl-go">Imprimir o guardar PDF</button></div>`;
  document.getElementById('modal').classList.add('show');
  document.getElementById('lbl-go').onclick = () => {
    const list = [];
    document.querySelectorAll('[data-lbl]').forEach(i => {
      const n = Math.max(0, Math.min(500, parseInt(i.value, 10) || 0)); if (!n) return;
      const p = db.products.find(x => x.id === i.dataset.lbl); if (!p.sku) p.sku = newInternalCode();
      for (let k = 0; k < n; k++) list.push(p);
    });
    if (!list.length) { toast('Poné al menos una cantidad.'); return; }
    save(); closeModal(); printLabels(list, document.getElementById('lbl-price')?.checked !== false);
  };
}
function printLabels(list, showPrice) {
  const W = 62, H = 33, GAP = 2, COLS = 3, ROWS = 8, PER = COLS * ROWS;
  const x0 = (210 - (COLS * W + (COLS - 1) * GAP)) / 2, y0 = (297 - (ROWS * H + (ROWS - 1) * GAP)) / 2;
  const biz = db.settings.name || '';
  const cache = {};
  let html = '';
  for (let s = 0; s < list.length; s += PER) {
    html += '<div class="lbl-sheet">';
    list.slice(s, s + PER).forEach((p, i) => {
      const c = i % COLS, r = Math.floor(i / COLS);
      cache[p.sku] = cache[p.sku] || barcodeSvg(p.sku, 46);
      html += `<div class="lbl" style="left:${x0 + c * (W + GAP)}mm;top:${y0 + r * (H + GAP)}mm;width:${W}mm;height:${H}mm">${biz ? `<div class="lbl-biz">${esc(biz)}</div>` : ''}<div class="lbl-name">${esc(p.name)}</div>${showPrice ? `<div class="lbl-price">${money(p.price)}</div>` : ''}<div class="lbl-bar">${cache[p.sku]}</div></div>`;
    });
    html += '</div>';
  }
  const area = document.getElementById('labels-print');
  area.innerHTML = html;
  document.body.classList.add('print-labels');
  setTimeout(() => window.print(), 150);
}
window.addEventListener('afterprint', () => { document.body.classList.remove('print-labels'); const a = document.getElementById('labels-print'); if (a) a.innerHTML = ''; });

// ---------- Copia de seguridad ----------
function downloadBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'facturador-dc', version: 2, fecha: new Date().toISOString(), data: db })], { type: 'application/json' }));
  a.download = 'copia-' + (db.settings.name || 'mi-negocio').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-') + '-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  db.lastBackup = new Date().toISOString(); save(); fillSettings(); toast('Copia descargada. Guardala en un lugar seguro.');
}
function restoreBackup(e) {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => {
    let j; try { j = JSON.parse(t); } catch (err) { toast('Ese archivo no es una copia válida.'); return; }
    const d = j && j.data;
    if (!d || !Array.isArray(d.products) || !Array.isArray(d.sales)) { toast('Ese archivo no es una copia del Facturador.'); return; }
    if (!confirm(`Esta copia es del ${new Date(j.fecha).toLocaleString('es-AR')} y tiene ${d.products.length} productos y ${d.sales.length} ventas.\nReemplaza TODO lo que hay ahora en este dispositivo. ¿Seguir?`)) return;
    localStorage.setItem(KEY, JSON.stringify(d)); location.reload();
  });
}

// ---------- Inicio, configuración y navegación ----------
const _renderDashboard = renderDashboard;
renderDashboard = function () {
  _renderDashboard();
  const box = document.getElementById('stock-alert'); if (!box) return;
  const alert = db.products.filter(p => ['low', 'out'].includes(stockState(p)));
  box.innerHTML = alert.length ? `<div class="card stock-alert"><div class="card-head"><div><h3>⚠ Reponer pronto</h3><div class="muted">${alert.length} producto${alert.length === 1 ? '' : 's'} con stock bajo o sin stock</div></div><button class="btn secondary small" onclick="stockFilter.low=true;showView('stock')">Ver stock</button></div><div class="alert-chips">${alert.slice(0, 8).map(p => `<button class="alert-chip" onclick="openMoveModal('${p.id}','entrada')">${esc(p.name)} ${stockBadge(p)}</button>`).join('')}</div></div>` : '';
};
const _fillSettings = fillSettings;
fillSettings = function () {
  _fillSettings();
  const el = document.getElementById('backup-info');
  if (el) el.textContent = db.lastBackup ? 'Última copia: ' + dateText(db.lastBackup) : 'Todavía no descargaste ninguna copia.';
};
const _showView = showView;
viewTitles.stock = 'Stock';
showView = function (v) { _showView(v); if (v === 'stock') renderStock(); if (v === 'new-sale' && matchMedia('(pointer:fine)').matches) setTimeout(() => document.getElementById('sale-scan')?.focus({ preventScroll: true }), 50); };

// Inyectar la interfaz nueva
(function injectUI() {
  const nav = document.querySelector('.nav');
  const prodBtn = nav.querySelector('[data-view="products"]');
  const b = document.createElement('button'); b.dataset.view = 'stock'; b.innerHTML = '<span>▥</span><span>Stock</span>';
  prodBtn.after(b); b.addEventListener('click', () => showView('stock'));
  const sec = document.createElement('section'); sec.id = 'stock-view'; sec.className = 'view';
  document.getElementById('products-view').after(sec);
  // Escáner en Nueva venta
  const items = document.getElementById('items-list');
  const wrap = document.createElement('div'); wrap.className = 'sale-scan'; wrap.innerHTML = scanBox('sale-scan', 'Escaneá o escribí el código y Enter');
  items.before(wrap); bindScan('sale-scan', saleScan);
  // Aviso de stock en Inicio
  const stats = document.querySelector('#dashboard-view .stats');
  const alert = document.createElement('div'); alert.id = 'stock-alert'; stats.after(alert);
  const quick = document.querySelector('#dashboard-view .grid-2 .card:last-child div[style*="grid"]');
  if (quick) { const q = document.createElement('button'); q.className = 'btn secondary'; q.textContent = '▥ Controlar stock'; q.onclick = () => showView('stock'); quick.prepend(q); }
  // Copia de seguridad en Configuración
  const danger = document.querySelector('#settings-view .btn.danger');
  const bk = document.createElement('div');
  bk.innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><h3>Copia de seguridad</h3><p class="muted">Tus productos, stock, clientes y ventas se guardan solo en este dispositivo. Descargá una copia seguido (por ejemplo, una vez por semana) por si cambiás de celu o se borra el navegador.</p><div class="toolbar"><button class="btn primary small" onclick="downloadBackup()">⤓ Descargar copia</button><label class="btn secondary small" for="backup-file">⤒ Restaurar copia</label><input type="file" id="backup-file" accept=".json,application/json" hidden onchange="restoreBackup(event)"></div><p class="muted" id="backup-info" style="margin-top:8px"></p>`;
  danger.parentNode.insertBefore(bk, danger.previousElementSibling.previousElementSibling.previousElementSibling);
  // Área de impresión de etiquetas
  const lp = document.createElement('div'); lp.id = 'labels-print'; document.body.appendChild(lp);
})();

renderDashboard(); initSale(); renderItems();
