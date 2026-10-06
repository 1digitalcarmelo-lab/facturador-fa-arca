/* Facturador ARCA · Factura C y Nota de Crédito C para monotributistas.
   Se carga después del Facturador (index.html), stock.js y la conexión con la Suite.
   En modo "demo" todo se simula en el navegador (CAE de prueba, SIN VALIDEZ FISCAL).
   En modo "nube" cada comprobante se pide a ARCA por la función "arca" de Supabase. */
(function () {
  'use strict';
  const CFG = Object.assign({ modo: 'demo' }, window.ARCA_CONFIG || {});
  const DEMO = CFG.modo !== 'nube';
  const TIPO = { FC: 11, NC: 13 };
  const NOMBRE_TIPO = { 11: 'Factura C', 13: 'Nota de Crédito C' };
  const DOC = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI', 99: 'Consumidor final' };
  // Condiciones frente al IVA del receptor válidas para comprobantes C (si la nube responde, se usan las de ARCA)
  const CONDICIONES = [
    { id: 5, nombre: 'Consumidor Final' }, { id: 6, nombre: 'Responsable Monotributo' }, { id: 13, nombre: 'Monotributista Social' },
    { id: 16, nombre: 'Monotributo Trabajador Independiente Promovido' }, { id: 1, nombre: 'IVA Responsable Inscripto' },
    { id: 4, nombre: 'IVA Sujeto Exento' }, { id: 7, nombre: 'Sujeto No Categorizado' }, { id: 15, nombre: 'IVA No Alcanzado' },
    { id: 9, nombre: 'Cliente del Exterior' }, { id: 8, nombre: 'Proveedor del Exterior' }, { id: 10, nombre: 'IVA Liberado – Ley N° 19.640' },
  ];

  db.fiscal = db.fiscal || {};
  // Demo para visitantes: datos de ejemplo y un tope de comprobantes de prueba
  const VISITA = new URLSearchParams(location.search).has('demo');
  if (VISITA && !db.fiscal.cuit) Object.assign(db.fiscal, { cuit: '20123456786', ptoVta: 1, razonSocial: 'Tu Negocio (ejemplo)', domicilio: 'Av. Siempre Viva 123, Buenos Aires', condicion: 'monotributo', categoria: 'A', tope: 10000000 });
  db.comprobantes = db.comprobantes || [];

  // ---------------------------------------------------------------- utilidades
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const pad = (n, l) => String(n).padStart(l, '0');
  const soloNum = (s) => String(s || '').replace(/\D/g, '');
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`; };
  const masDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fechaAR = (f) => f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : '';
  const cuitFmt = (c) => { c = soloNum(c); return c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c; };
  function cuitValido(c) {
    c = soloNum(c); if (c.length !== 11) return false;
    const m = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < 10; i++) s += +c[i] * m[i];
    let v = 11 - (s % 11); if (v === 11) v = 0; if (v === 10) v = 9; return v === +c[10];
  }
  const condicionTexto = (id) => (db.fiscal.condiciones || CONDICIONES).find((x) => +x.id === +id)?.nombre || '';
  const configurado = () => !!(db.fiscal.cuit && db.fiscal.razonSocial && db.fiscal.domicilio && db.fiscal.ptoVta);
  function urlQR(c) {
    const data = { ver: 1, fecha: c.fecha, cuit: +soloNum(c.cuit), ptoVta: +c.ptoVta, tipoCmp: +c.cbteTipo, nroCmp: +c.numero, importe: r2(c.total), moneda: 'PES', ctz: 1, tipoDocRec: +c.receptor.docTipo, nroDocRec: +(c.receptor.docNro || 0), tipoCodAut: 'E', codAut: +c.cae };
    return 'https://www.afip.gob.ar/fe/qr/?p=' + btoa(JSON.stringify(data));
  }
  function qrSvg(texto, px) {
    if (typeof qrcode === 'undefined') return '';
    const q = qrcode(0, 'M'); q.addData(texto); q.make();
    const n = q.getModuleCount(), m = 2, s = n + m * 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg viewBox="0 0 ${s} ${s}" width="${px}" height="${px}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  // ---------------------------------------------------------------- nube (Supabase)
  let sb = null;
  async function nube() {
    if (!sb) { const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'); sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } }); }
    return sb;
  }
  async function llamar(action, payload) {
    const s = await nube();
    const { data, error } = await s.functions.invoke(CFG.funcion || 'arca', { body: Object.assign({ action }, payload || {}) });
    if (error) {
      let msg = 'No pudimos comunicarnos con ARCA. Probá de nuevo en unos minutos.';
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    if (!data || data.ok === false) throw new Error((data && data.error) || 'ARCA no respondió.');
    return data;
  }
  async function guardarConfigNube() {
    const s = await nube();
    const { data: u } = await s.auth.getUser();
    if (!u || !u.user) throw new Error('Iniciá sesión para guardar tus datos fiscales.');
    const f = db.fiscal;
    const { error } = await s.from('arca_config').upsert({ user_id: u.user.id, cuit: soloNum(f.cuit), razon_social: f.razonSocial, domicilio: f.domicilio, iibb: f.iibb || null, inicio_actividades: f.inicio || null, pto_vta: +f.ptoVta, condicion: f.condicion || 'monotributo', categoria: f.categoria || null, tope_anual: f.tope ? +f.tope : null, updated_at: new Date().toISOString() });
    if (error) throw new Error('No se pudieron guardar los datos fiscales: ' + error.message);
  }

  // Trae los datos fiscales guardados en la nube (otro celular/compu) y lo facturado en los últimos 12 meses
  const COND = { monotributo: 'Responsable Monotributo', social: 'Monotributista Social' };
  let facturado12 = null;
  async function sincronizar() {
    if (DEMO) return;
    try {
      const s = await nube();
      const { data: u } = await s.auth.getUser();
      if (!u || !u.user) return;
      const { data: c } = await s.from('arca_config').select('*').eq('user_id', u.user.id).maybeSingle();
      if (c) {
        Object.assign(db.fiscal, { cuit: c.cuit, ptoVta: c.pto_vta, razonSocial: c.razon_social, domicilio: c.domicilio, iibb: c.iibb || '', inicio: c.inicio_actividades || '', condicion: c.condicion, categoria: c.categoria || '', tope: c.tope_anual || '' });
        save();
      }
      const desde = masDias(hoy(), -365);
      const { data: cs } = await s.from('arca_comprobantes').select('cbte_tipo,imp_total').eq('ambiente', 'prod').gte('cbte_fch', desde);
      facturado12 = (cs || []).reduce((a, x) => a + (x.cbte_tipo === TIPO.NC ? -1 : 1) * Number(x.imp_total), 0);
      if (document.getElementById('arca-view')?.classList.contains('active')) renderArca();
    } catch (e) { /* sin conexión: se usa lo guardado en este dispositivo */ }
  }
  function topeHtml() {
    const f = db.fiscal;
    const local = db.comprobantes.filter((c) => !c.demo && c.fecha >= masDias(hoy(), -365)).reduce((a, c) => a + (c.tipo === 'NC' ? -c.total : c.total), 0);
    const total = facturado12 != null ? facturado12 : local;
    if (!(+f.tope > 0)) return `<p class="muted" style="margin:12px 0 0">Facturado en los últimos 12 meses: <strong>${money(total)}</strong>. Cargá el tope de tu categoría en <em>Datos fiscales</em> para ver cuánto te queda.</p>`;
    const pct = Math.min(100, Math.round(total / f.tope * 100));
    const color = pct >= 90 ? '#c0392b' : pct >= 75 ? '#e08a00' : '#2a9d5c';
    return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><strong>Tope de la categoría ${esc(f.categoria || '')}</strong><span class="muted">${money(total)} de ${money(+f.tope)} · ${pct}%</span></div>
      <div style="height:10px;border-radius:6px;background:rgba(0,0,0,.08);margin-top:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${color};border-radius:6px"></div></div>
      <small class="muted">Te quedan ${money(Math.max(0, f.tope - total))} para facturar en los próximos 12 meses móviles${pct >= 90 ? ' · ⚠ estás cerca del tope: consultá si te conviene recategorizarte' : ''}.</small></div>`;
  }

  // ---------------------------------------------------------------- emitir
  function siguienteDemo(cbteTipo) { return db.comprobantes.filter((c) => c.demo && c.cbteTipo === cbteTipo).reduce((a, c) => Math.max(a, c.numero), 0) + 1; }
  async function emitir(p) {
    const cbteTipo = p.tipo === 'NC' ? TIPO.NC : TIPO.FC;
    const items = p.items.filter((i) => String(i.descripcion || '').trim() && +i.cantidad > 0).map((i) => ({ descripcion: String(i.descripcion).trim(), cantidad: +i.cantidad, precio: r2(i.precio) }));
    const total = r2(items.reduce((a, i) => a + r2(i.cantidad * i.precio), 0) - r2(p.descuento));
    if (!items.length) throw new Error('Agregá al menos un ítem.');
    if (!(total > 0)) throw new Error('El total tiene que ser mayor a cero.');
    let c = { id: 'cb' + Date.now() + Math.random().toString(36).slice(2, 5), cbteTipo, tipo: p.tipo === 'NC' ? 'NC' : 'FC', fecha: p.fecha, concepto: p.concepto, servicio: p.servicio || null, receptor: p.receptor, items, descuento: r2(p.descuento), total, ventaId: p.ventaId || null, asociado: p.asociado || null, cuit: db.fiscal.cuit, ptoVta: +db.fiscal.ptoVta, emisor: { ...db.fiscal } };
    delete c.emisor.condiciones;
    if (DEMO) {
      await new Promise((r) => setTimeout(r, 450));
      c.numero = siguienteDemo(cbteTipo);
      c.cae = '7' + String(Date.now()).slice(-9) + pad(Math.floor(Math.random() * 1e4), 4);
      c.caeVto = masDias(c.fecha, 10);
      c.demo = true;
    } else {
      const res = await llamar('emitir', { tipo: c.tipo, fecha: c.fecha, concepto: c.concepto, servicio: c.servicio, receptor: c.receptor, items, descuento: c.descuento, asociado: c.asociado, ventaRef: c.ventaId });
      const k = res.comprobante;
      c.numero = +k.cbte_nro; c.cae = String(k.cae); c.caeVto = k.cae_vto; c.ptoVta = +k.pto_vta; c.fecha = k.cbte_fch || c.fecha; c.ambiente = res.ambiente; c.remoteId = k.id || null;
      if (res.ambiente !== 'prod') c.demo = true; // homologación: tampoco tiene validez fiscal
    }
    c.qr = urlQR(c);
    db.comprobantes.push(c);
    if (c.tipo === 'NC' && c.asociado) { const f = db.comprobantes.find((x) => x.id === c.asociado.id); if (f) f.anuladaPor = c.id; }
    if (c.ventaId) { const s = db.sales.find((x) => x.id === c.ventaId); if (s && c.tipo === 'FC') s.fiscalId = c.id; }
    save();
    return c;
  }

  // ---------------------------------------------------------------- vista ARCA
  function etiquetaModo() {
    if (DEMO) return '<span class="badge partial">● Modo demostración · sin validez fiscal</span>';
    return configurado() ? '<span class="badge paid">● Conectado a ARCA</span>' : '<span class="badge pending">● Conexión en preparación</span>';
  }
  function renderArca() {
    const v = document.getElementById('arca-view');
    const f = db.fiscal;
    const lista = db.comprobantes.slice().reverse();
    v.innerHTML = `<div class="welcome suite-hero"><div><h2>Facturas ARCA</h2><p>Factura C y Nota de Crédito C para monotributistas, con CAE y QR.</p></div><div class="toolbar" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end"><button class="btn secondary" onclick="arcaDatos()">⚙ Datos fiscales</button>${configurado() ? '<button class="btn primary" onclick="arcaNueva()">＋ Factura sin venta</button>' : ''}</div></div>
    <div class="card" style="margin-bottom:18px">${configurado()
      ? `<div class="card-head"><div><h3>${esc(f.razonSocial)}</h3><div class="muted">CUIT ${cuitFmt(f.cuit)} · Punto de venta ${pad(f.ptoVta, 5)} · ${COND[f.condicion] || COND.monotributo}</div></div>${etiquetaModo()}</div>
         <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><button class="btn secondary small" id="arca-verif">↻ Verificar conexión con ARCA</button><span class="muted" id="arca-verif-msg">${f.verificado ? 'Última verificación: ' + esc(f.verificado) : ''}</span></div>
         ${topeHtml()}
         ${DEMO ? '<p class="notice" style="margin-top:14px">Estás en <strong>modo demostración</strong>: los comprobantes llevan un CAE de prueba y la leyenda "SIN VALIDEZ FISCAL". Sirve para mostrar la app y practicar. Cuando tu cuenta esté conectada a ARCA, las facturas salen con CAE real.</p>' : ''}`
      : `<div class="card-head"><div><h3>Estamos preparando tu conexión con ARCA</h3><div class="muted">Tus datos fiscales los cargamos nosotros. Cuando esté lista, vas a ver acá tu CUIT y tu punto de venta.</div></div>${etiquetaModo()}</div><a class="btn primary" style="margin-top:6px;text-decoration:none" href="${waAyuda()}" target="_blank" rel="noopener noreferrer">Escribirnos por WhatsApp</a>`}</div>
    <div class="card"><div class="card-head"><div><h3>Comprobantes emitidos</h3><div class="muted">${lista.length} comprobante${lista.length === 1 ? '' : 's'}</div></div></div>
    ${lista.length ? `<div class="table-wrap"><table><thead><tr><th>Comprobante</th><th>Cliente</th><th>Total</th><th>CAE</th><th></th></tr></thead><tbody>${lista.map((c) => `<tr><td><strong>${NOMBRE_TIPO[c.cbteTipo]} ${pad(c.ptoVta, 5)}-${pad(c.numero, 8)}</strong><br><span class="muted">${fechaAR(c.fecha)}${c.demo ? ' · prueba' : ''}</span></td><td>${esc(c.receptor.nombre || 'Consumidor final')}${c.anuladaPor ? '<br><span class="badge pending">Anulada con NC</span>' : ''}</td><td><strong>${money(c.tipo === 'NC' ? -c.total : c.total)}</strong></td><td><span class="code-chip">${esc(c.cae)}</span></td><td><button class="btn ghost" onclick="arcaVer('${c.id}')">Ver</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Todavía no emitiste comprobantes. Abrí una venta y tocá <strong>Emitir Factura C</strong>.</div>'}</div>`;
    const b = document.getElementById('arca-verif');
    if (b) b.onclick = verificar;
  }
  function guiaHtml() {
    const rep = CFG.cuitRepresentante ? `<strong>${esc(CFG.cuitRepresentante)}</strong> (Digital Carmelo)` : 'el CUIT de Digital Carmelo que te pasamos por WhatsApp';
    return `<ol class="arca-guia">
      <li><strong>Creá un punto de venta para factura electrónica.</strong> Entrá a <em>arca.gob.ar</em> con tu Clave Fiscal → <em>Administración de puntos de venta y domicilios</em> → <em>Agregar</em>. Elegí un número libre (por ejemplo 3) y en Sistema: <em>Factura Electrónica - Monotributo - Web Services</em>. Anotá el número.</li>
      <li><strong>Autorizanos a facturar por vos.</strong> En ARCA entrá a <em>Administrador de Relaciones de Clave Fiscal</em> → <em>Nueva relación</em> → <em>Buscar</em> → <em>ARCA</em> → <em>WebServices</em> → <em>Facturación Electrónica</em>. En Representante poné ${rep} y confirmá. Es seguro: solo nos permite emitir facturas, no ver ni cambiar nada más.</li>
      <li><strong>Cargá tus datos acá y verificá.</strong> Tocá <em>Datos fiscales</em>, completá CUIT, razón social, domicilio y el punto de venta, y después <em>Verificar conexión</em>. Avisanos por WhatsApp y aceptamos la delegación.</li></ol>`;
  }
  async function verificar() {
    const m = document.getElementById('arca-verif-msg');
    m.textContent = 'Verificando…';
    try {
      if (DEMO) { await new Promise((r) => setTimeout(r, 400)); m.textContent = 'Modo demostración: la conexión real se verifica cuando tu cuenta esté conectada a ARCA.'; return; }
      const r = await llamar('verificar');
      db.fiscal.verificado = new Date().toLocaleString('es-AR'); save();
      m.textContent = `✓ Conexión correcta. Último comprobante en ARCA: ${r.ultimoNumero}.`;
    } catch (e) { m.textContent = '⚠ ' + e.message; }
  }

  // ---------------------------------------------------------------- datos fiscales
  function waAyuda(texto) {
    return 'https://wa.me/' + (CFG.whatsapp || '5491176508119') + '?text=' + encodeURIComponent(texto || 'Hola Digital Carmelo 👋 Tengo una consulta sobre mi Facturador ARCA.');
  }
  window.arcaDatos = function () {
    const f = db.fiscal;
    const fila = (k, v) => `<div class="field"><label>${k}</label><div style="padding:10px 12px;border:1px solid var(--line,#e6e3ef);border-radius:12px;background:rgba(0,0,0,.02)">${v ? esc(String(v)) : '<span class="muted">—</span>'}</div></div>`;
    document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h3>Datos fiscales</h3><button class="btn ghost" onclick="closeModal()">×</button></div>
      <p class="muted" style="margin-top:-6px">Así salen impresos en cada factura. Los cargamos nosotros al conectar tu CUIT con ARCA.</p>
      <div class="form-grid">
        ${fila('CUIT', cuitFmt(f.cuit || ''))}${fila('Punto de venta', f.ptoVta ? pad(f.ptoVta, 5) : '')}
        <div class="field full">${fila('Razón social', f.razonSocial).replace(/^<div class="field">|<\/div>$/g, '')}</div>
        <div class="field full">${fila('Domicilio comercial', f.domicilio).replace(/^<div class="field">|<\/div>$/g, '')}</div>
        ${fila('Ingresos Brutos', f.iibb)}${fila('Inicio de actividades', fechaAR(f.inicio || ''))}
        ${fila('Condición frente al IVA', COND[f.condicion] || COND.monotributo)}${fila('Categoría', f.categoria)}
      </div>
      <p class="muted" style="margin:12px 0 0">¿Cambió algo (domicilio, categoría, punto de venta)? Escribinos y lo actualizamos.</p>
      <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Cerrar</button><a class="btn primary" style="text-decoration:none" target="_blank" rel="noopener noreferrer" href="${waAyuda('Hola Digital Carmelo 👋 Necesito actualizar mis datos fiscales del Facturador ARCA.')}">Pedir un cambio</a></div>`;
    document.getElementById('modal').classList.add('show');
  };

  // ---------------------------------------------------------------- formulario de factura
  function itemsDeVenta(s) {
    const it = s.items.map((i) => ({ descripcion: i.name + (i.description ? ' · ' + i.description : ''), cantidad: +i.qty || 1, precio: +i.price || 0 }));
    if (+s.surcharge > 0) it.push({ descripcion: 'Recargo', cantidad: 1, precio: r2(s.surcharge) });
    return it;
  }
  function receptorDeVenta(s) {
    const tax = soloNum(s.client && s.client.tax);
    const docTipo = tax.length === 11 ? 80 : tax.length >= 7 ? 96 : 99;
    return { docTipo, docNro: docTipo === 99 ? '' : tax, nombre: (s.client && s.client.name) || '', condicionIva: docTipo === 80 ? 6 : 5, domicilio: '' };
  }
  function abrirFormulario(base) {
    if (!configurado()) { toast('Primero cargá tus datos fiscales.'); showView('arca'); arcaDatos(); return; }
    const st = { items: base.items.length ? base.items : [{ descripcion: '', cantidad: 1, precio: 0 }], descuento: r2(base.descuento || 0), receptor: base.receptor, concepto: 1, fecha: hoy(), servicio: { desde: hoy(), hasta: hoy(), vencimiento: hoy() } };
    const conds = db.fiscal.condiciones || CONDICIONES;
    const pintar = () => {
      const total = r2(st.items.reduce((a, i) => a + r2((+i.cantidad || 0) * (+i.precio || 0)), 0) - st.descuento);
      const r = st.receptor;
      document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h3>Emitir Factura C</h3><button class="btn ghost" onclick="closeModal()">×</button></div>
      ${DEMO ? '<p class="notice" style="margin:-4px 0 12px">Modo demostración: el CAE es de prueba y la factura sale con la leyenda SIN VALIDEZ FISCAL.</p>' : ''}
      <h4 style="margin:4px 0 8px">Cliente</h4>
      <div class="form-grid">
        <div class="field"><label>Identificación</label><select id="ef-doc">${[[99, 'Consumidor final (sin identificar)'], [96, 'DNI'], [80, 'CUIT'], [86, 'CUIL']].map(([v, t]) => `<option value="${v}" ${+r.docTipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field" ${+r.docTipo === 99 ? 'style="display:none"' : ''}><label>Número</label><input id="ef-nro" inputmode="numeric" value="${esc(r.docNro || '')}"></div>
        <div class="field"><label>Nombre o razón social</label><input id="ef-nom" value="${esc(r.nombre || '')}" placeholder="Consumidor final"></div>
        <div class="field"><label>Condición frente al IVA</label><select id="ef-cond">${conds.map((c) => `<option value="${c.id}" ${+r.condicionIva === +c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
        <div class="field full"><label>Domicilio (opcional)</label><input id="ef-domr" value="${esc(r.domicilio || '')}"></div>
      </div>
      <h4 style="margin:16px 0 8px">Comprobante</h4>
      <div class="form-grid three">
        <div class="field"><label>Concepto</label><select id="ef-conc">${[[1, 'Productos'], [2, 'Servicios'], [3, 'Productos y servicios']].map(([v, t]) => `<option value="${v}" ${st.concepto === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Fecha</label><input id="ef-fecha" type="date" value="${st.fecha}"></div>
        <div class="field"><label>Descuento ($)</label><input id="ef-desc" type="number" min="0" step="0.01" value="${st.descuento}"></div>
      </div>
      <div class="form-grid three" id="ef-serv" ${st.concepto === 1 ? 'style="display:none"' : ''}>
        <div class="field"><label>Servicio desde</label><input id="ef-sd" type="date" value="${st.servicio.desde}"></div>
        <div class="field"><label>Servicio hasta</label><input id="ef-sh" type="date" value="${st.servicio.hasta}"></div>
        <div class="field"><label>Vencimiento del pago</label><input id="ef-sv" type="date" value="${st.servicio.vencimiento}"></div>
      </div>
      <h4 style="margin:16px 0 8px">Detalle</h4>
      <div id="ef-items">${st.items.map((i, k) => `<div class="item-row arca-item"><div class="field"><label>Descripción</label><input data-k="${k}" data-f="descripcion" value="${esc(i.descripcion)}"></div><div class="field"><label>Cant.</label><input data-k="${k}" data-f="cantidad" type="number" min="0" step="0.01" value="${i.cantidad}"></div><div class="field"><label>Precio unit.</label><input data-k="${k}" data-f="precio" type="number" min="0" step="0.01" value="${i.precio}"></div><div class="item-total">${money(r2((+i.cantidad || 0) * (+i.precio || 0)))}</div><button class="icon-btn" data-del="${k}" title="Quitar">×</button></div>`).join('')}</div>
      <button class="btn secondary small" id="ef-add">＋ Agregar ítem</button>
      <div class="sum-line total-line" style="margin-top:14px"><span>Total de la factura</span><strong id="ef-total">${money(total)}</strong></div>
      <p class="muted" style="font-size:13px">Una factura emitida no se puede borrar ni editar: si hay un error, se anula con una Nota de Crédito C.</p>
      <p id="ef-msg" style="color:var(--red);font-weight:600;margin:6px 0 0"></p>
      <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn primary" id="ef-ok">🧾 Emitir Factura C por ${money(total)}</button></div>`;
      const g = (id) => document.getElementById(id);
      const leer = () => {
        st.receptor = { docTipo: +g('ef-doc').value, docNro: soloNum(g('ef-nro').value), nombre: g('ef-nom').value.trim(), condicionIva: +g('ef-cond').value, domicilio: g('ef-domr').value.trim() };
        st.concepto = +g('ef-conc').value; st.fecha = g('ef-fecha').value || hoy(); st.descuento = r2(g('ef-desc').value);
        st.servicio = { desde: g('ef-sd').value, hasta: g('ef-sh').value, vencimiento: g('ef-sv').value };
        document.querySelectorAll('#ef-items [data-k]').forEach((inp) => { const it = st.items[+inp.dataset.k]; it[inp.dataset.f] = inp.dataset.f === 'descripcion' ? inp.value : +inp.value; });
      };
      ['ef-doc', 'ef-conc'].forEach((id) => g(id).addEventListener('change', () => { leer(); if (id === 'ef-doc' && st.receptor.docTipo === 80 && st.receptor.condicionIva === 5) st.receptor.condicionIva = 6; pintar(); }));
      document.querySelectorAll('#ef-items input, #ef-desc').forEach((inp) => inp.addEventListener('change', () => { leer(); pintar(); }));
      document.querySelectorAll('#ef-items [data-del]').forEach((b) => b.onclick = () => { leer(); st.items.splice(+b.dataset.del, 1); if (!st.items.length) st.items.push({ descripcion: '', cantidad: 1, precio: 0 }); pintar(); });
      g('ef-add').onclick = () => { leer(); st.items.push({ descripcion: '', cantidad: 1, precio: 0 }); pintar(); };
      g('ef-ok').onclick = async () => {
        leer();
        const r = st.receptor, msg = g('ef-msg');
        if (r.docTipo === 80 && !cuitValido(r.docNro)) { msg.textContent = 'Revisá el CUIT del cliente.'; return; }
        if ((r.docTipo === 96 || r.docTipo === 86) && r.docNro.length < 7) { msg.textContent = 'Revisá el número de documento.'; return; }
        if (r.docTipo === 99) { r.docNro = ''; if (r.condicionIva !== 5) r.condicionIva = 5; }
        const btn = g('ef-ok'); btn.disabled = true; btn.textContent = DEMO ? 'Generando…' : 'Pidiendo el CAE a ARCA…';
        try {
          const c = await emitir({ tipo: 'FC', fecha: st.fecha, concepto: st.concepto, servicio: st.concepto === 1 ? null : st.servicio, receptor: Object.assign({}, r, { nombre: r.nombre || 'Consumidor final' }), items: st.items, descuento: st.descuento, ventaId: base.ventaId });
          closeModal(); verComprobante(c.id); toast(`${NOMBRE_TIPO[c.cbteTipo]} ${pad(c.ptoVta, 5)}-${pad(c.numero, 8)} emitida.`);
        } catch (e) { msg.textContent = e.message; btn.disabled = false; btn.textContent = 'Intentar de nuevo'; }
      };
    };
    pintar();
    document.getElementById('modal').classList.add('show');
  }
  window.arcaFacturarVenta = function (id) {
    const s = db.sales.find((x) => x.id === id); if (!s) return;
    if (s.fiscalId) { verComprobante(s.fiscalId); return; }
    abrirFormulario({ items: itemsDeVenta(s), descuento: s.discount || 0, receptor: receptorDeVenta(s), ventaId: s.id });
  };
  window.arcaNueva = function () { abrirFormulario({ items: [], descuento: 0, receptor: { docTipo: 99, docNro: '', nombre: '', condicionIva: 5, domicilio: '' } }); };

  // ---------------------------------------------------------------- comprobante (pantalla e impresión)
  function comprobanteHtml(c) {
    const e = c.emisor || db.fiscal;
    const r = c.receptor;
    const doc = +r.docTipo === 99 ? 'Consumidor final' : `${DOC[r.docTipo]}: ${+r.docTipo === 80 ? cuitFmt(r.docNro) : r.docNro}`;
    const sub = r2(c.items.reduce((a, i) => a + r2(i.cantidad * i.precio), 0));
    const asoc = c.asociado ? `<p class="af-asoc">Anula: Factura C ${pad(c.asociado.ptoVta, 5)}-${pad(c.asociado.numero, 8)} del ${fechaAR(c.asociado.fecha)}</p>` : '';
    return `<div class="af ${c.demo ? 'af--demo' : ''}">
      ${c.demo ? '<div class="af-marca">SIN VALIDEZ FISCAL · ' + (DEMO ? 'DEMOSTRACIÓN' : 'HOMOLOGACIÓN') + '</div>' : ''}
      <div class="af-orig">ORIGINAL</div>
      <div class="af-head">
        <div class="af-em"><h2>${esc(e.razonSocial)}</h2><p><b>Domicilio comercial:</b> ${esc(e.domicilio)}</p><p><b>Condición frente al IVA:</b> ${COND[e.condicion] || COND.monotributo}</p></div>
        <div class="af-letra"><b>C</b><small>COD. ${pad(c.cbteTipo, 3)}</small></div>
        <div class="af-datos"><h2>${c.cbteTipo === 13 ? 'NOTA DE CRÉDITO' : 'FACTURA'}</h2>
          <p><b>Punto de venta:</b> ${pad(c.ptoVta, 5)} &nbsp; <b>Comp. Nro:</b> ${pad(c.numero, 8)}</p>
          <p><b>Fecha de emisión:</b> ${fechaAR(c.fecha)}</p><p><b>CUIT:</b> ${cuitFmt(e.cuit)}</p>
          <p><b>Ingresos Brutos:</b> ${esc(e.iibb || '-')}</p><p><b>Inicio de actividades:</b> ${fechaAR(e.inicio) || '-'}</p></div>
      </div>
      ${+c.concepto !== 1 && c.servicio ? `<div class="af-serv"><b>Período facturado desde:</b> ${fechaAR(c.servicio.desde)} &nbsp; <b>hasta:</b> ${fechaAR(c.servicio.hasta)} &nbsp; <b>Vencimiento del pago:</b> ${fechaAR(c.servicio.vencimiento)}</div>` : ''}
      <div class="af-rec"><p><b>${doc}</b></p><p><b>Apellido y nombre / Razón social:</b> ${esc(r.nombre || 'Consumidor final')}</p><p><b>Condición frente al IVA:</b> ${esc(condicionTexto(r.condicionIva))}</p>${r.domicilio ? `<p><b>Domicilio:</b> ${esc(r.domicilio)}</p>` : ''}</div>
      ${asoc}
      <table class="af-tabla"><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th></tr></thead><tbody>${c.items.map((i) => `<tr><td>${esc(i.descripcion)}</td><td>${i.cantidad}</td><td>${money(i.precio)}</td><td>${money(r2(i.cantidad * i.precio))}</td></tr>`).join('')}</tbody></table>
      <div class="af-tot">${c.descuento ? `<p><span>Subtotal</span><b>${money(sub)}</b></p><p><span>Descuento</span><b>-${money(c.descuento)}</b></p>` : ''}<p class="af-total"><span>Importe total</span><b>${money(c.total)}</b></p></div>
      <div class="af-pie"><div class="af-qr">${qrSvg(c.qr, 110)}</div><div><p class="af-aut">Comprobante autorizado</p><p><b>CAE N°:</b> ${esc(c.cae)}</p><p><b>Fecha de vto. de CAE:</b> ${fechaAR(c.caeVto)}</p><p class="muted" style="font-size:11px">Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación.</p></div></div>
    </div>`;
  }
  let actual = null;
  function verComprobante(id) {
    const c = db.comprobantes.find((x) => x.id === id); if (!c) return;
    actual = c;
    const v = document.getElementById('arca-doc-view');
    const fac = c.tipo === 'FC';
    v.innerHTML = `<div class="welcome suite-hero no-print"><div><h2>${NOMBRE_TIPO[c.cbteTipo]} ${pad(c.ptoVta, 5)}-${pad(c.numero, 8)}</h2><p>${c.anuladaPor ? 'Anulada con nota de crédito.' : fac ? 'Imprimila, guardala en PDF o mandásela a tu cliente.' : 'Nota de crédito emitida.'}</p></div><div class="toolbar" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end"><button class="btn secondary" onclick="arcaImprimir()">⎙ Imprimir / PDF</button><button class="btn secondary" onclick="arcaWhatsApp()">↗ WhatsApp</button>${fac && !c.anuladaPor ? '<button class="btn danger" onclick="arcaAnular()">Anular con Nota de Crédito</button>' : ''}<button class="btn secondary" onclick="showView(\'arca\')">Volver</button></div></div>
      <div class="card"><div id="arca-doc">${comprobanteHtml(c)}</div></div>`;
    showView('arca-doc');
  }
  window.arcaVer = verComprobante;
  window.arcaImprimir = function () {
    const area = document.getElementById('arca-print');
    area.innerHTML = comprobanteHtml(actual);
    document.body.classList.add('print-arca');
    setTimeout(() => window.print(), 150);
  };
  window.addEventListener('afterprint', () => { document.body.classList.remove('print-arca'); const a = document.getElementById('arca-print'); if (a) a.innerHTML = ''; });
  window.arcaWhatsApp = function () {
    const c = actual, e = c.emisor || db.fiscal;
    const t = `${e.razonSocial}\n${NOMBRE_TIPO[c.cbteTipo]} ${pad(c.ptoVta, 5)}-${pad(c.numero, 8)} del ${fechaAR(c.fecha)}\nTotal: ${money(c.total)}\nCAE: ${c.cae}${c.demo ? '\n(SIN VALIDEZ FISCAL · prueba)' : ''}\nVerificala en ARCA: ${c.qr}`;
    const tel = soloNum(db.sales.find((s) => s.id === c.ventaId)?.client?.phone);
    window.open('https://wa.me/' + (tel ? (tel.startsWith('54') ? tel : '549' + tel.replace(/^0/, '')) : '') + '?text=' + encodeURIComponent(t), '_blank');
  };
  window.arcaAnular = function () {
    const f = actual;
    if (!confirm(`Se va a emitir una Nota de Crédito C por ${money(f.total)} que anula la Factura C ${pad(f.ptoVta, 5)}-${pad(f.numero, 8)}.\nNo se puede deshacer. ¿Seguir?`)) return;
    emitir({ tipo: 'NC', fecha: hoy(), concepto: f.concepto, servicio: f.servicio, receptor: f.receptor, items: f.items, descuento: f.descuento, ventaId: f.ventaId, asociado: { id: f.id, ptoVta: f.ptoVta, numero: f.numero, fecha: f.fecha } })
      .then((nc) => { const s = db.sales.find((x) => x.id === f.ventaId); if (s) { s.fiscalId = null; save(); } verComprobante(nc.id); toast('Nota de crédito emitida. La factura quedó anulada.'); })
      .catch((e) => alert('No se pudo emitir la nota de crédito: ' + e.message));
  };

  // ---------------------------------------------------------------- integración con el Facturador
  const _renderReceipt = renderReceipt;
  renderReceipt = function (s) {
    _renderReceipt(s);
    const box = document.getElementById('receipt-content');
    const c = s.fiscalId && db.comprobantes.find((x) => x.id === s.fiscalId);
    const bar = document.createElement('div');
    bar.className = 'arca-bar no-print';
    bar.innerHTML = c ? `<span>🧾 Facturada: <strong>Factura C ${pad(c.ptoVta, 5)}-${pad(c.numero, 8)}</strong>${c.demo ? ' (prueba)' : ''}</span><button class="btn secondary small" onclick="arcaVer('${c.id}')">Ver factura</button>`
      : `<span>Este comprobante es interno. ¿Le hacés la factura de ARCA?</span><button class="btn primary small" onclick="arcaFacturarVenta('${s.id}')">🧾 Emitir Factura C</button>`;
    box.prepend(bar);
  };
  const _renderHistory = renderHistory;
  renderHistory = function () {
    _renderHistory();
    document.querySelectorAll('#history-table tbody tr').forEach((tr) => {
      const btn = tr.querySelector('[onclick^="openSale"]'); if (!btn) return;
      const id = btn.getAttribute('onclick').match(/openSale\('([^']+)'/)[1];
      const s = db.sales.find((x) => x.id === id); if (!s) return;
      const c = s.fiscalId && db.comprobantes.find((x) => x.id === s.fiscalId);
      const cell = tr.children[0];
      cell.insertAdjacentHTML('beforeend', c ? `<br><span class="badge paid">Factura C ${pad(c.numero, 8)}</span>` : '');
      const acc = tr.lastElementChild;
      acc.insertAdjacentHTML('afterbegin', c ? `<button class="btn ghost" onclick="arcaVer('${c.id}')">Factura</button>` : `<button class="btn ghost" onclick="arcaFacturarVenta('${s.id}')">Facturar</button>`);
    });
  };
  // Un comprobante con factura no se elimina desde el historial (la factura sigue existiendo en ARCA)
  const _deleteSale = deleteSale;
  deleteSale = function (id) {
    const s = db.sales.find((x) => x.id === id);
    if (s && s.fiscalId) { alert('Esta venta tiene una Factura C emitida. Para anularla, emití la Nota de Crédito desde la factura.'); return; }
    _deleteSale(id);
  };
  const _showView = showView;
  viewTitles.arca = 'Facturas ARCA'; viewTitles['arca-doc'] = 'Factura';
  showView = function (v) { _showView(v); if (v === 'arca') renderArca(); const a = document.getElementById('arca-aviso'); if (a) a.hidden = configurado(); };

  (function injectUI() {
    const nav = document.querySelector('.nav');
    const hist = nav.querySelector('[data-view="history"]');
    const b = document.createElement('button'); b.dataset.view = 'arca'; b.innerHTML = '<span>🧾</span><span>ARCA</span>';
    hist.after(b); b.addEventListener('click', () => showView('arca'));
    const sec = document.createElement('section'); sec.id = 'arca-view'; sec.className = 'view';
    const doc = document.createElement('section'); doc.id = 'arca-doc-view'; doc.className = 'view';
    document.getElementById('history-view').after(sec, doc);
    const pa = document.createElement('div'); pa.id = 'arca-print'; document.body.appendChild(pa);
    // Inicio: aviso si falta conectar
    const stats = document.querySelector('#dashboard-view .stats');
    if (stats) {
      const n = document.createElement('div'); n.id = 'arca-aviso'; n.className = 'card no-print'; n.style.marginBottom = '18px'; n.hidden = configurado();
      n.innerHTML = '<div class="card-head"><div><h3>🧾 Conectá tu CUIT con ARCA</h3><div class="muted">Cargá tus datos fiscales para emitir Factura C con CAE.</div></div><button class="btn primary small" onclick="showView(\'arca\')">Empezar</button></div>';
      stats.after(n);
    }
    // Condiciones de IVA oficiales (solo en la nube; si falla, quedan las de la lista)
    sincronizar();
    if (!DEMO && !db.fiscal.condiciones) llamar('condiciones').then((r) => { if (r.condiciones && r.condiciones.length) { db.fiscal.condiciones = r.condiciones; save(); } }).catch(() => {});
  })();

  // ---------------------------------------------------------------- demo para visitantes: solo mirar
  // Se ven facturas de ejemplo; cualquier otra acción invita a pedir el acceso por WhatsApp.
  if (VISITA) {
    const WA = 'https://wa.me/' + (CFG.whatsapp || '5491176508119') + '?text=' + encodeURIComponent('Hola Digital Carmelo 👋 Estoy viendo el Facturador ARCA de Digital Carmelo y quiero saber cómo puedo incorporarlo a mi cuenta.');
    const pedirAcceso = function () {
      document.getElementById('modal-content').innerHTML = `<div class="modal-head"><h3>🧾 Facturador ARCA</h3><button class="btn ghost" onclick="closeModal()">×</button></div>
        <p>Estás viendo la <strong>demo</strong>. Para emitir tus facturas con CAE, cargar tus datos fiscales y usar todas las funciones, pedinos el acceso: te ayudamos a conectar tu CUIT con ARCA.</p>
        <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Seguir mirando</button><a class="btn primary" href="${WA}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Quiero sumarlo</a></div>`;
      document.getElementById('modal').classList.add('show');
    };
    window.arcaPedirAcceso = pedirAcceso;
    // Comprobantes de ejemplo (solo en este navegador, sin validez fiscal)
    if (!db.comprobantes.length) {
      const f = hoy(), em = { ...db.fiscal };
      const ej = (n, nombre, items, concepto) => {
        const total = r2(items.reduce((a, i) => a + i.cantidad * i.precio, 0));
        const c = { id: 'ej' + n, cbteTipo: TIPO.FC, tipo: 'FC', fecha: f, concepto, servicio: concepto === 2 ? { desde: f, hasta: f, vencimiento: f } : null, receptor: { docTipo: 99, docNro: '', nombre, condicionIva: 5, domicilio: '' }, items, descuento: 0, total, cuit: em.cuit, ptoVta: em.ptoVta, emisor: em, numero: n, cae: '7' + String(4123456789012 + n), caeVto: masDias(f, 10), demo: true };
        c.qr = urlQR(c); return c;
      };
      db.comprobantes.push(ej(1, 'María González', [{ descripcion: 'Cobertura fotográfica de evento', cantidad: 1, precio: 180000 }], 2),
        ej(2, 'Consumidor final', [{ descripcion: 'Cuadro 30x40', cantidad: 2, precio: 25000 }, { descripcion: 'Revelado 10x15', cantidad: 20, precio: 600 }], 1));
      save();
    }
    window.arcaDatos = pedirAcceso; window.arcaNueva = pedirAcceso; window.arcaFacturarVenta = pedirAcceso; window.arcaAnular = pedirAcceso;
    const _sv = showView;
    showView = function (v) { if (v === 'arca' || v === 'arca-doc') return _sv(v); pedirAcceso(); };
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#arca-verif')) { e.stopImmediatePropagation(); pedirAcceso(); } }, true);
    setTimeout(() => _sv('arca'), 0);
  }

  window.__arca = { urlQR, cuitValido, emitir, comprobanteHtml, DEMO };
})();
