/* Facturador · conexión con el resto de la Suite ("Llevar mis productos").
   Usa js/suite-productos.js (el mismo archivo en todas las apps). Se carga después de stock.js. */
(function () {
  'use strict';
  // "Remera" + variante "M" se guarda como "Remera M"; al exportar se vuelven a separar
  function nombreYVariante(p) {
    if (p.variant && p.baseName && p.name === p.baseName + ' ' + p.variant) return { nombre: p.baseName, variante: p.variant };
    return { nombre: p.name, variante: '' };
  }
  function ponerNombre(p, nombre, variante) {
    p.name = [nombre, variante].filter(Boolean).join(' ');
    if (variante) { p.baseName = nombre; p.variant = variante; } else { delete p.baseName; delete p.variant; }
  }
  function codigoLibre(code, id) {
    const a = analyzeCode(code);
    if (!a.value) return '';
    return db.products.some(x => x.id !== id && String(x.sku || '').trim() === a.value) ? '' : a.value;
  }
  function refrescar() {
    save();
    updateAvatar();
    const activa = document.querySelector('.view.active');
    const v = activa ? activa.id.replace('-view', '') : '';
    if (v === 'products') renderProducts();
    if (v === 'clients') renderClients();
    if (v === 'stock') renderStock();
    if (v === 'dashboard') renderDashboard();
    if (v === 'settings') fillSettings();
    populateClientSelect();
  }
  function abrir() {
    SuitePack.abrir({
      app: 'facturador',
      aviso: 'Del Facturador viajan tus productos (precio, código y stock), tus clientes y los datos de tu negocio. Las ventas no viajan: quedan acá.',
      productos: {
        lista: () => db.products,
        campos: ['nombre', 'variante', 'codigo', 'descripcion', 'precio', 'precioAntes', 'costo', 'stock'],
        leer: p => {
          const nv = nombreYVariante(p);
          return SuitePack.producto({ nombre: nv.nombre, variante: nv.variante, codigo: p.sku, descripcion: p.description, precio: p.price, precioAntes: p.before, costo: p.cost, stock: tracked(p) ? p.stock : null });
        },
        crear: c => {
          const p = { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), name: '', description: c.descripcion || '', price: c.precio || 0, sku: '', stock: null, minStock: 0 };
          ponerNombre(p, c.nombre, c.variante);
          p.sku = c.codigo ? codigoLibre(c.codigo, p.id) : '';
          if (c.costo != null) p.cost = c.costo;
          if (c.precioAntes != null) p.before = c.precioAntes;
          db.products.push(p);
          if (c.stock != null) { p.stock = 0; addMovement(p, c.stock, 'alta', 'Traído de otra app'); }
        },
        actualizar: (p, k) => {
          if ('nombre' in k || 'variante' in k) { const nv = nombreYVariante(p); ponerNombre(p, k.nombre != null ? k.nombre : nv.nombre, k.variante != null ? k.variante : nv.variante); }
          if ('codigo' in k) { const c = codigoLibre(k.codigo, p.id); if (c) p.sku = c; }
          if ('descripcion' in k) p.description = k.descripcion;
          if ('precio' in k) p.price = k.precio;
          if ('precioAntes' in k) p.before = k.precioAntes;
          if ('costo' in k) p.cost = k.costo;
          if ('stock' in k) {
            if (!tracked(p)) { p.stock = 0; p.minStock = p.minStock || 0; }
            addMovement(p, k.stock - p.stock, 'ajuste', 'Traído de otra app');
          }
        }
      },
      clientes: {
        lista: () => db.clients,
        leer: c => SuitePack.cliente({ nombre: c.name, telefono: c.phone, email: c.email, documento: c.tax, direccion: c.address, notas: c.notes }),
        crear: c => { db.clients.push({ id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6), name: c.nombre, phone: c.telefono, email: c.email, tax: c.documento, address: c.direccion, notes: c.notas }); },
        actualizar: (c, k) => {
          const m = { nombre: 'name', telefono: 'phone', email: 'email', documento: 'tax', direccion: 'address', notas: 'notes' };
          Object.keys(k).forEach(x => { if (m[x]) c[m[x]] = k[x]; });
        }
      },
      negocio: {
        leer: () => { const s = db.settings; return { nombre: s.name === 'Mi negocio' ? '' : s.name, telefono: s.phone, email: s.email, direccion: s.address, cuit: s.tax, logo: s.logo }; },
        completar: d => {
          const s = db.settings, m = { nombre: 'name', telefono: 'phone', email: 'email', direccion: 'address', cuit: 'tax', logo: 'logo' };
          Object.keys(d).forEach(x => { if (m[x]) s[m[x]] = d[x]; });
        }
      },
      alTerminar: refrescar
    });
  }
  window.abrirLlevarProductos = abrir;

  // Botón "Llevar mis productos" en Productos y en Clientes
  ['products-view', 'clients-view'].forEach(id => {
    const hero = document.querySelector('#' + id + ' .welcome');
    const btn = hero && hero.querySelector('.btn.primary');
    if (!btn) return;
    const box = document.createElement('div'); box.className = 'toolbar'; box.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn secondary'; b.textContent = '⇄ Llevar mis productos';
    b.title = 'Pasá tus productos y clientes a otra app de la Suite, o traelos de ahí';
    b.addEventListener('click', abrir);
    btn.replaceWith(box); box.append(b, btn);
  });
})();
