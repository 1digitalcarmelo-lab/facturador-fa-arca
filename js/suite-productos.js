/* Suite Potenciadora · "Llevar mis productos"  (versión 1)
   Es el MISMO archivo en todas las apps de negocio (Calculador, Facturador, Etiquetas, Caja Diaria).
   Si se cambia, se copia igual en todas.

   Qué hace: guarda los productos (y, si la app los tiene, los clientes y los datos del negocio)
   en un archivo con un formato común, y lo lee en cualquier otra app de la Suite sin duplicar:
   si el producto ya existe (mismo código, o mismo nombre y variante) lo actualiza.
   Ese mismo formato es el de la tabla de productos de la nube, así sirve también para subir
   a la nube lo que cada uno tenga cargado en su dispositivo.

   Cada app usa:  SuitePack.abrir({ app, productos:{...}, clientes:{...}, negocio:{...}, alTerminar })
   (ver la explicación de cada parte en "abrir"). Todo funciona sin internet y sin servidor. */
(function (w) {
  'use strict';
  var FORMATO = 'dc-suite', VERSION = 1;
  var APPS = {
    calculador: { nombre: 'Calculador de precios', url: 'https://calculador-de-precios.netlify.app/' },
    facturador: { nombre: 'Facturador', url: 'https://facturador.digitalcarmelo.com/' },
    etiquetas: { nombre: 'Genera-etiquetas', url: 'https://genera-etiquetas.netlify.app/' },
    caja: { nombre: 'Caja Diaria', url: 'https://control-caja-diaria.netlify.app/' }
  };

  // ---------- Normalizar ----------
  function txt(v) { return v == null ? '' : String(v).trim(); }
  function norm(s) { return txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' '); }
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var t = String(v).replace(/[$\s]/g, '');
    if (!t) return null;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');      // 12.500,50
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');                    // 12,500.50
    else t = t.replace(',', '.');
    var n = Number(t);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  function digitos(s) { return txt(s).replace(/\D/g, ''); }

  // Producto en el formato común. Los campos vacíos quedan en null / '' (no pisan nada al importar).
  function producto(p) {
    p = p || {};
    var stock = p.stock === null || p.stock === undefined || p.stock === '' ? null : num(p.stock);
    return {
      nombre: txt(p.nombre), variante: txt(p.variante), codigo: txt(p.codigo), descripcion: txt(p.descripcion), categoria: txt(p.categoria),
      precio: num(p.precio), precioAntes: num(p.precioAntes), costo: num(p.costo),
      stock: stock == null ? null : Math.round(stock),
      precios: p.precios && typeof p.precios === 'object' ? p.precios : null,
      actualizado: txt(p.actualizado) || null
    };
  }
  function cliente(c) {
    c = c || {};
    return { nombre: txt(c.nombre), telefono: txt(c.telefono), email: txt(c.email), documento: txt(c.documento), direccion: txt(c.direccion), localidad: txt(c.localidad), notas: txt(c.notas) };
  }
  function negocio(n) {
    n = n || {};
    return { nombre: txt(n.nombre), telefono: txt(n.telefono), email: txt(n.email), direccion: txt(n.direccion), instagram: txt(n.instagram), cuit: txt(n.cuit), logo: /^data:image\//.test(txt(n.logo)) ? txt(n.logo) : '' };
  }

  // ---------- ¿Es el mismo producto / cliente? ----------
  // Nombre completo para comparar: "Remera" + "M" = "Remera M" = "Remera · M"
  function completo(p) { return norm(txt(p.nombre) + ' ' + txt(p.variante)).replace(/[·|\/\-–—]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function mismoProducto(a, b) {
    var ca = norm(a.codigo), cb = norm(b.codigo);
    if (ca && cb) return ca === cb;                        // si los dos tienen código, manda el código
    return !!completo(a) && completo(a) === completo(b);
  }
  function mismoCliente(a, b) {
    var ta = digitos(a.telefono).slice(-8), tb = digitos(b.telefono).slice(-8);
    if (ta.length >= 6 && ta === tb) return true;
    if (norm(a.email) && norm(a.email) === norm(b.email)) return true;
    if (norm(a.documento) && digitos(a.documento) && digitos(a.documento) === digitos(b.documento)) return true;
    return !!norm(a.nombre) && norm(a.nombre) === norm(b.nombre) && !(ta && tb && ta !== tb);
  }

  // Compara lo que llega con lo que hay. Solo cuenta como cambio un campo que llega con valor y es distinto.
  var CAMPOS_P = ['nombre', 'variante', 'codigo', 'descripcion', 'categoria', 'precio', 'precioAntes', 'costo', 'stock'];
  var CAMPOS_C = ['nombre', 'telefono', 'email', 'documento', 'direccion', 'localidad', 'notas'];
  function diferencias(actual, nuevo, campos) {
    var d = {};
    campos.forEach(function (k) {
      var v = nuevo[k];
      if (v === null || v === undefined || v === '') return;
      var a = actual[k];
      if (typeof v === 'number') { if (num(a) !== v) d[k] = v; }
      else if (norm(a) !== norm(v)) d[k] = v;
    });
    return d;
  }

  // Plan de importación (no cambia nada todavía)
  function planificar(actuales, entrantes, mismo, campos) {
    var plan = { nuevos: [], cambios: [], iguales: 0, precios: 0 };
    var usados = {};
    entrantes.forEach(function (e) {
      var idx = -1;
      for (var i = 0; i < actuales.length; i++) { if (!usados[i] && mismo(actuales[i], e)) { idx = i; break; } }
      if (idx < 0) {
        // ya vino repetido en el mismo archivo
        if (plan.nuevos.some(function (n) { return mismo(n, e); })) return;
        plan.nuevos.push(e); return;
      }
      usados[idx] = 1;
      var d = diferencias(actuales[idx], e, campos);
      // "Remera M" sin variante es el mismo nombre que "Remera" + variante "M": no se pisa el nombre
      var a = actuales[idx];
      if (d.nombre && !e.variante && a.variante && [' ', ' · ', ' - '].some(function (j) { return norm(a.nombre + j + a.variante) === norm(e.nombre); })) delete d.nombre;
      if (Object.keys(d).length) { plan.cambios.push({ i: idx, campos: d, entrante: e }); if ('precio' in d) plan.precios++; }
      else plan.iguales++;
    });
    return plan;
  }

  // ---------- Leer archivos ----------
  function partirCsv(texto) {
    texto = String(texto || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var primera = texto.split('\n')[0] || '';
    var sep = primera.indexOf('\t') >= 0 ? '\t' : (primera.split(';').length > primera.split(',').length ? ';' : ',');
    var filas = [], fila = [], campo = '', comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
        else campo += ch;
      } else if (ch === '"' && !campo) comillas = true;
      else if (ch === sep) { fila.push(campo.trim()); campo = ''; }
      else if (ch === '\n') { fila.push(campo.trim()); filas.push(fila); fila = []; campo = ''; }
      else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
    return filas.filter(function (f) { return f.some(function (c) { return c; }); });
  }
  function desdeCsv(texto) {
    var filas = partirCsv(texto);
    if (!filas.length) return [];
    var head = filas[0].map(norm);
    var buscar = function (re, no) { for (var i = 0; i < head.length; i++) if (re.test(head[i]) && !(no && no.test(head[i]))) return i; return -1; };
    var col = {
      nombre: buscar(/nombre|producto|articulo|item|detalle/),
      precio: buscar(/precio|valor|venta|pvp/, /antes|anterior|lista|tachad|costo|compra/),
      antes: buscar(/antes|anterior|tachad/),
      codigo: buscar(/codigo|sku|ean|barra/),
      variante: buscar(/talle|variante|color|medida|sabor|modelo/),
      costo: buscar(/costo|compra/),
      stock: buscar(/stock|existencia|disponible|cantidad/),
      categoria: buscar(/categoria|rubro|familia/),
      descripcion: buscar(/descrip/)
    };
    if (col.nombre < 0 && col.descripcion >= 0) { col.nombre = col.descripcion; col.descripcion = -1; }
    var conTitulos = col.nombre >= 0 || col.precio >= 0 || col.codigo >= 0;
    if (!conTitulos) col = { nombre: 0, precio: 1, codigo: 2, variante: 3, stock: -1, antes: -1, costo: -1, categoria: -1, descripcion: -1 };
    else filas.shift();
    return filas.map(function (f) {
      var g = function (k) { return col[k] >= 0 ? f[col[k]] : ''; };
      return producto({ nombre: g('nombre'), precio: g('precio'), precioAntes: g('antes'), codigo: g('codigo'), variante: g('variante'), costo: g('costo'), stock: g('stock'), categoria: g('categoria'), descripcion: g('descripcion') });
    }).filter(function (p) { return p.nombre || p.codigo; });
  }
  // Devuelve { productos, clientes, negocio, origen, fecha } o lanza un Error con un mensaje claro
  function leerTexto(texto, nombreArchivo) {
    var t = String(texto || '').replace(/^﻿/, '').trim();
    if (!t) throw new Error('El archivo está vacío.');
    if (t[0] === '{' || t[0] === '[') {
      var j;
      try { j = JSON.parse(t); } catch (e) { throw new Error('No pude leer ese archivo.'); }
      if (j && j.formato === FORMATO) {
        return { origen: j.origen || '', fecha: j.fecha || '', negocio: j.negocio ? negocio(j.negocio) : null, productos: (j.productos || []).map(producto).filter(function (p) { return p.nombre || p.codigo; }), clientes: (j.clientes || []).map(cliente).filter(function (c) { return c.nombre; }) };
      }
      // Copia de seguridad del Facturador: también sirve para traer productos y clientes
      if (j && j.app === 'facturador-dc' && j.data && Array.isArray(j.data.products)) {
        var d = j.data, s = d.settings || {};
        return {
          origen: 'facturador', fecha: j.fecha || '',
          negocio: negocio({ nombre: s.name, telefono: s.phone, email: s.email, direccion: s.address, cuit: s.tax, logo: s.logo }),
          productos: d.products.map(function (p) { return producto({ nombre: p.name, descripcion: p.description, precio: p.price, codigo: p.sku, stock: p.stock, costo: p.cost }); }),
          clientes: (d.clients || []).map(function (c) { return cliente({ nombre: c.name, telefono: c.phone, email: c.email, documento: c.tax, notas: c.notes }); })
        };
      }
      throw new Error('Ese archivo no es de la Suite. Descargalo con el botón "Llevar mis productos" de otra app.');
    }
    var ps = desdeCsv(t);
    if (!ps.length) throw new Error('No encontré productos en ese archivo.');
    return { origen: 'planilla', fecha: '', negocio: null, productos: ps, clientes: [] };
  }

  // ---------- Armar el archivo ----------
  function armar(app, productos, clientes, neg) {
    return {
      formato: FORMATO, version: VERSION, origen: app, fecha: new Date().toISOString(),
      negocio: neg ? negocio(neg) : null,
      productos: (productos || []).map(producto).filter(function (p) { return p.nombre || p.codigo; }),
      clientes: (clientes || []).map(cliente).filter(function (c) { return c.nombre; })
    };
  }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'mi-negocio'; }
  function nombreArchivo(pack) { return 'productos-' + slug(pack.negocio && pack.negocio.nombre) + '-' + new Date().toISOString().slice(0, 10) + '.json'; }
  function blobDe(pack) { return new Blob([JSON.stringify(pack, null, 1)], { type: 'application/json' }); }
  function descargar(pack) {
    var a = document.createElement('a');
    a.download = nombreArchivo(pack); a.href = URL.createObjectURL(blobDe(pack));
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function puedeCompartir() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })); } catch (e) { return false; }
  }
  function compartir(pack) {
    var f = new File([JSON.stringify(pack, null, 1)], nombreArchivo(pack), { type: 'application/json' });
    return navigator.share({ files: [f], title: 'Mis productos', text: 'Archivo para la Suite Potenciadora: abrilo con "Llevar mis productos" → "Traer".' });
  }

  // ---------- Panel ----------
  var CSS = '.sp-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(7,8,31,.55);display:flex;align-items:flex-end;justify-content:center;padding:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '@media(min-width:640px){.sp-ov{align-items:center;padding:24px}}' +
    '.sp-box{background:#fff;color:#1b1c3a;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:22px 20px 20px}' +
    '@media(min-width:640px){.sp-box{border-radius:20px;padding:26px}}' +
    '.sp-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:4px}.sp-h h3{margin:0;font-size:20px;line-height:1.2;color:#0d0e32;font-family:Cinzel,Georgia,serif;letter-spacing:.01em}' +
    '.sp-x{border:0;background:#f1f0ea;border-radius:50%;width:34px;height:34px;font-size:18px;cursor:pointer;color:#0d0e32;flex:0 0 auto}' +
    '.sp-lead{margin:2px 0 16px;color:#5b5d78;font-size:14px;line-height:1.5}' +
    '.sp-sec{border:1px solid #e7e3d6;border-radius:16px;padding:16px;margin-top:12px}.sp-sec h4{margin:0 0 4px;font-size:15.5px;color:#0d0e32}.sp-sec p{margin:0 0 12px;color:#5b5d78;font-size:13.5px;line-height:1.5}' +
    '.sp-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
    '.sp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid #0d0e32;background:#fff;color:#0d0e32;font-family:inherit;font-weight:600;font-size:14.5px;line-height:1;cursor:pointer;text-decoration:none}' +
    '.sp-btn--p{background:#0d0e32;color:#fcca55;border-color:#0d0e32}.sp-btn--g{background:#d3ac49;border-color:#d3ac49;color:#0d0e32}.sp-btn:disabled{opacity:.45;cursor:not-allowed}' +
    '.sp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.sp-chip{font-size:12.5px;padding:6px 10px;border-radius:999px;background:#f6f3ea;color:#3b3d5c;text-decoration:none;border:1px solid #ebe5d3}.sp-chip b{color:#0d0e32}' +
    '.sp-res{margin-top:12px;background:#f7f5ee;border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.55}.sp-res ul{margin:6px 0 0;padding-left:18px}.sp-res .sp-err{color:#a4473a}' +
    '.sp-ok{background:#e7f3ea;color:#22553a}.sp-small{font-size:12.5px;color:#6b6d86;margin-top:10px}';
  function css() { if (document.getElementById('sp-css')) return; var s = document.createElement('style'); s.id = 'sp-css'; s.textContent = CSS; document.head.appendChild(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }

  /* cfg = {
       app: 'calculador' | 'facturador' | 'etiquetas' | 'caja',
       productos: { lista: () => [items de la app], leer: item => {formato común}, crear: canon => item nuevo (la app lo agrega),
                    actualizar: (item, campos, canon) => void, campos?: ['precio', ...] (cuáles acepta esta app) },
       clientes:  { lista, leer, crear, actualizar } (opcional),
       negocio:   { leer: () => {formato común}, completar: datos => void } (opcional: solo completa lo que está vacío),
       aviso?: 'texto corto extra', alTerminar?: resumen => void }  */
  function abrir(cfg) {
    css();
    var P = cfg.productos, C = cfg.clientes, N = cfg.negocio;
    var misP = function () { return (P.lista() || []).map(P.leer); };
    var misC = function () { return C ? (C.lista() || []).map(C.leer) : []; };
    var otras = Object.keys(APPS).filter(function (k) { return k !== cfg.app && APPS[k].url; });
    var ov = document.createElement('div'); ov.className = 'sp-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Llevar mis productos');
    var np = misP().filter(function (p) { return p.nombre || p.codigo; }).length, nc = misC().length;
    ov.innerHTML = '<div class="sp-box">' +
      '<div class="sp-h"><h3>Llevar mis productos</h3><button type="button" class="sp-x" data-sp-close aria-label="Cerrar">✕</button></div>' +
      '<p class="sp-lead">Cargá tus productos una sola vez y usalos en todas las apps de la Suite. Si un producto ya está, se actualiza: no se duplica.</p>' +
      '<div class="sp-sec"><h4>1 · Llevarlos a otra app</h4><p>' + (np ? 'Bajá un archivo con tus <b>' + plural(np, 'producto', 'productos') + '</b>' + (nc ? ' y <b>' + plural(nc, 'cliente', 'clientes') + '</b>' : '') + '. Después abrí la otra app y tocá <b>Traer</b>.' : 'Todavía no tenés productos cargados acá.') + '</p>' +
      '<div class="sp-row"><button type="button" class="sp-btn sp-btn--p" data-sp-down' + (np || nc ? '' : ' disabled') + '>⤓ Descargar archivo</button>' + (puedeCompartir() ? '<button type="button" class="sp-btn" data-sp-share' + (np || nc ? '' : ' disabled') + '>↗ Enviar al otro dispositivo</button>' : '') + '</div>' +
      (otras.length ? '<div class="sp-chips">' + otras.map(function (k) { return '<a class="sp-chip" href="' + APPS[k].url + '" target="_blank" rel="noopener">Abrir <b>' + esc(APPS[k].nombre) + '</b> ↗</a>'; }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="sp-sec"><h4>2 · Traerlos de otra app</h4><p>Elegí el archivo que bajaste de otra app de la Suite. También sirve una planilla de Excel guardada como CSV (con columnas como nombre, precio, código).</p>' +
      '<div class="sp-row"><label class="sp-btn sp-btn--g">⤒ Elegir archivo<input type="file" accept=".json,.csv,.txt,application/json,text/csv" hidden data-sp-file></label></div>' +
      '<div data-sp-res></div></div>' +
      (cfg.aviso ? '<p class="sp-small">' + cfg.aviso + '</p>' : '') +
      '</div>';
    document.body.appendChild(ov);
    var cerrar = function () { ov.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-sp-close]')) cerrar(); });
    var pack = function () { return armar(cfg.app, misP(), misC(), N ? N.leer() : null); };
    ov.querySelector('[data-sp-down]').addEventListener('click', function () { descargar(pack()); });
    var sh = ov.querySelector('[data-sp-share]');
    if (sh) sh.addEventListener('click', function () { compartir(pack()).catch(function () {}); });
    var res = ov.querySelector('[data-sp-res]');
    ov.querySelector('[data-sp-file]').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      f.text().then(function (t) {
        var datos;
        try { datos = leerTexto(t, f.name); } catch (err) { res.innerHTML = '<div class="sp-res"><span class="sp-err">' + esc(err.message) + '</span></div>'; return; }
        mostrarPlan(datos);
      });
    });
    function mostrarPlan(datos) {
      var campos = P.campos || CAMPOS_P;
      var pp = planificar(misP(), datos.productos, mismoProducto, campos);
      var pc = C ? planificar(misC(), datos.clientes, mismoCliente, CAMPOS_C) : null;
      var de = APPS[datos.origen] ? ' de <b>' + esc(APPS[datos.origen].nombre) + '</b>' : datos.origen === 'planilla' ? ' de tu planilla' : '';
      var lineas = [];
      if (pp.nuevos.length) lineas.push(plural(pp.nuevos.length, 'producto nuevo', 'productos nuevos'));
      if (pp.cambios.length) lineas.push(plural(pp.cambios.length, 'producto se actualiza', 'productos se actualizan') + (pp.precios ? ' (' + plural(pp.precios, 'cambia de precio', 'cambian de precio') + ')' : ''));
      if (pp.iguales) lineas.push(plural(pp.iguales, 'ya estaba igual', 'ya estaban iguales'));
      if (pc && pc.nuevos.length) lineas.push(plural(pc.nuevos.length, 'cliente nuevo', 'clientes nuevos'));
      if (pc && pc.cambios.length) lineas.push(plural(pc.cambios.length, 'cliente se actualiza', 'clientes se actualizan'));
      var hay = pp.nuevos.length || pp.cambios.length || (pc && (pc.nuevos.length || pc.cambios.length));
      res.innerHTML = '<div class="sp-res">El archivo' + de + ' trae ' + plural(datos.productos.length, 'producto', 'productos') + (datos.clientes.length && C ? ' y ' + plural(datos.clientes.length, 'cliente', 'clientes') : '') + '.' +
        (lineas.length ? '<ul>' + lineas.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '') +
        (hay ? '<div class="sp-row" style="margin-top:10px"><button type="button" class="sp-btn sp-btn--p" data-sp-ok>Traer</button><button type="button" class="sp-btn" data-sp-no>Cancelar</button></div>' : '<p style="margin:8px 0 0">No hay nada nuevo para traer.</p>') + '</div>';
      if (!hay) { completarNegocio(datos.negocio); return; }
      res.querySelector('[data-sp-no]').onclick = function () { res.innerHTML = ''; };
      res.querySelector('[data-sp-ok]').onclick = function () {
        var negOk = completarNegocio(datos.negocio);   // primero el negocio: algunas apps lo usan al crear productos
        var lista = P.lista();
        pp.cambios.forEach(function (c) { P.actualizar(lista[c.i], c.campos, c.entrante); });
        pp.nuevos.forEach(function (p) { P.crear(p); });
        if (pc) {
          var lc = C.lista();
          pc.cambios.forEach(function (c) { C.actualizar(lc[c.i], c.campos, c.entrante); });
          pc.nuevos.forEach(function (c) { C.crear(c); });
        }
        var resumen = { nuevos: pp.nuevos.length, actualizados: pp.cambios.length, precios: pp.precios, clientesNuevos: pc ? pc.nuevos.length : 0, clientesActualizados: pc ? pc.cambios.length : 0, negocio: negOk, origen: datos.origen };
        res.innerHTML = '<div class="sp-res sp-ok">Listo. ' + [pp.nuevos.length ? plural(pp.nuevos.length, 'producto nuevo', 'productos nuevos') : '', pp.cambios.length ? plural(pp.cambios.length, 'actualizado', 'actualizados') : '', pc && pc.nuevos.length ? plural(pc.nuevos.length, 'cliente nuevo', 'clientes nuevos') : '', negOk ? 'datos del negocio completados' : ''].filter(Boolean).join(' · ') + '.</div>';
        if (cfg.alTerminar) cfg.alTerminar(resumen);
      };
    }
    function completarNegocio(n) {
      if (!N || !n) return false;
      var actual = negocio(N.leer()), falta = {};
      Object.keys(n).forEach(function (k) { if (n[k] && !actual[k]) falta[k] = n[k]; });
      if (!Object.keys(falta).length) return false;
      N.completar(falta);
      return true;
    }
    return { cerrar: cerrar };
  }

  w.SuitePack = {
    FORMATO: FORMATO, VERSION: VERSION, APPS: APPS,
    abrir: abrir, producto: producto, cliente: cliente, negocio: negocio, num: num, norm: norm,
    leerTexto: leerTexto, armar: armar, planificar: planificar, mismoProducto: mismoProducto, mismoCliente: mismoCliente,
    CAMPOS_P: CAMPOS_P, CAMPOS_C: CAMPOS_C
  };
})(window);
