// Pruebas de la función ARCA con ARCA, Afip SDK y Supabase simulados.  deno test -A nube/pruebas/arca_test.ts
import { armarDetalle, urlQR, hoyAR } from "../supabase/functions/arca/reglas.ts";

function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
const venta = (extra: any = {}) => ({ items: [{ descripcion: "Remera", cantidad: 2, precio: 18500 }, { descripcion: "Taza", cantidad: 1, precio: 9500.5 }], ...extra });

Deno.test("Factura C a consumidor final", () => {
  const d = armarDetalle({ cuit: 20409378472 }, venta(), 7);
  eq(d.det.ImpTotal, 46500.5, "total"); eq(d.det.ImpNeto, 46500.5, "neto = total en C"); eq(d.det.ImpIVA, 0, "sin IVA");
  eq(d.det.DocTipo, 99, "consumidor final"); eq(d.det.DocNro, 0, "doc 0"); eq(d.det.CondicionIVAReceptorId, 5, "condición CF");
  eq(d.det.CbteDesde, 7, "número"); assert(!("Iva" in d.det), "C no lleva IVA"); assert(!("FchServDesde" in d.det), "productos sin fechas de servicio");
});
Deno.test("Descuento y redondeo", () => {
  const d = armarDetalle({}, venta({ descuento: 500.25 }), 1);
  eq(d.det.ImpTotal, 46000.25, "total con descuento");
});
Deno.test("Servicios piden fechas", () => {
  const d = armarDetalle({}, venta({ concepto: 2 }), 1);
  assert(d.det.FchServDesde && d.det.FchVtoPago, "fechas de servicio");
});
Deno.test("Cliente con CUIT", () => {
  const d = armarDetalle({}, venta({ receptor: { docTipo: 80, docNro: "30-71234567-1", condicionIva: 6 } }), 1);
  eq(d.det.DocTipo, 80, "cuit"); eq(d.det.DocNro, 30712345671, "nro limpio"); eq(d.det.CondicionIVAReceptorId, 6, "monotributo");
  let err = ""; try { armarDetalle({}, venta({ receptor: { docTipo: 80, docNro: "123" } }), 1); } catch (e) { err = (e as any).mensaje; }
  assert(/11 números/.test(err), "CUIT corto rechazado");
});
Deno.test("Fecha fuera de rango y total cero", () => {
  let err = ""; try { armarDetalle({}, venta({ fecha: "2020-01-01" }), 1); } catch (e) { err = (e as any).mensaje; }
  assert(/días/.test(err), "fecha vieja rechazada");
  err = ""; try { armarDetalle({}, { items: [] }, 1); } catch (e) { err = (e as any).mensaje; }
  assert(/ítem/.test(err), "sin ítems");
});
Deno.test("Nota de crédito asocia la factura", () => {
  const d = armarDetalle({ cuit: 20409378472 }, venta({ tipo: "NC", asociado: { ptoVta: 3, numero: 7, fecha: hoyAR() } }), 1);
  const a = (d.det.CbtesAsoc as any).CbteAsoc[0];
  eq([a.Tipo, a.PtoVta, a.Nro, a.Cuit], [11, 3, 7, 20409378472], "asociado");
});
Deno.test("QR de ARCA", () => {
  const u = urlQR({ fecha: "2026-10-03", cuit: "20409378472", ptoVta: 3, tipo: 11, numero: 7, total: 46500.5, docTipo: 99, docNro: "0", cae: "76123456789012" });
  assert(u.startsWith("https://www.afip.gob.ar/fe/qr/?p="), "prefijo");
  const j = JSON.parse(atob(u.split("p=")[1]));
  eq([j.ver, j.cuit, j.ptoVta, j.tipoCmp, j.nroCmp, j.importe, j.moneda, j.tipoCodAut, j.codAut], [1, 20409378472, 3, 11, 7, 46500.5, "PES", "E", 76123456789012], "campos QR");
});

// ---------------------------------------------------------------- La función completa, con todo simulado
Deno.test("Función: emitir Factura C y Nota de Crédito", async () => {
  Deno.env.set("SUPABASE_URL", "https://x.supabase.co"); Deno.env.set("SUPABASE_ANON_KEY", "anon"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service"); Deno.env.set("AFIPSDK_TOKEN", "tok");
  let handler: (r: Request) => Promise<Response> = async () => new Response();
  (Deno as any).serve = (h: any) => { handler = h; return {}; };
  let ultimo = 6; let acceso = { access_state: "product_full", can_access: true, access_source: "product" };
  const pedidos: any[] = []; const guardados: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init.body ? JSON.parse(init.body) : null;
    const res = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
    if (url.includes("app.afipsdk.com/api/v1/afip/auth")) return res({ token: "T", sign: "S", expiration: new Date(Date.now() + 3600e3).toISOString() });
    if (url.includes("app.afipsdk.com/api/v1/afip/requests")) {
      pedidos.push(body);
      if (body.method === "FECompUltimoAutorizado") return res({ FECompUltimoAutorizadoResult: { PtoVta: 3, CbteTipo: body.params.CbteTipo, CbteNro: ultimo } });
      if (body.method === "FECAESolicitar") { ultimo++; return res({ FECAESolicitarResult: { FeCabResp: { Resultado: "A" }, FeDetResp: { FECAEDetResponse: [{ Resultado: "A", CAE: "76123456789012", CAEFchVto: "20261013" }] } } }); }
      if (body.method === "FEDummy") return res({ FEDummyResult: { AppServer: "OK", DbServer: "OK", AuthServer: "OK" } });
    }
    if (url.includes("/auth/v1/user")) return res({ id: "u1", email: "a@b.c", aud: "authenticated" });
    if (url.includes("/rest/v1/rpc/get_my_product_access")) return res([acceso]);
    if (url.includes("/rest/v1/arca_config")) {
      if ((init.method || "GET") === "GET") return res({ user_id: "u1", cuit: "20111111112", pto_vta: 3, razon_social: "Test", domicilio: "Calle 1" });
      return res([], 200);
    }
    if (url.includes("/rest/v1/arca_comprobantes")) { guardados.push(body); return res({ id: "c1", ...body }); }
    return res({ message: "no simulado " + url }, 404);
  };
  try {
    await import("../supabase/functions/arca/index.ts");
    const call = async (b: any) => { const r = await handler(new Request("http://x", { method: "POST", headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" }, body: JSON.stringify(b) })); return { status: r.status, j: await r.json() }; };
    const est = await call({ action: "estado" }); assert(est.j.ok && est.j.ambiente === "dev", "estado");
    const v = await call({ action: "verificar" }); assert(v.j.ok && v.j.ultimoNumero === 6, "verificar " + JSON.stringify(v.j));
    const f = await call({ action: "emitir", ...venta(), ventaRef: "s1" });
    assert(f.j.ok, "emitir " + JSON.stringify(f.j)); eq(f.j.comprobante.cbte_nro, 7, "número siguiente"); eq(f.j.comprobante.cae_vto, "2026-10-13", "vto");
    assert(f.j.comprobante.qr.includes("afip.gob.ar/fe/qr"), "qr");
    const sol = pedidos.find((p) => p.method === "FECAESolicitar");
    eq(sol.params.Auth.Cuit, 20409378472, "en dev factura con el CUIT de prueba"); eq(sol.environment, "dev", "ambiente");
    const nc = await call({ action: "emitir", tipo: "NC", ...venta(), asociado: { ptoVta: 3, numero: 7, fecha: hoyAR() } });
    assert(nc.j.ok, "nc " + JSON.stringify(nc.j)); eq(nc.j.comprobante.cbte_tipo, 13, "tipo NC");
    eq(guardados.length, 2, "se guardaron los dos");
    acceso = { access_state: "trial_active", can_access: true, access_source: "trial" };
    const t = await call({ action: "emitir", ...venta() }); eq(t.status, 403, "la prueba gratis no emite");
    acceso = { access_state: "suite_full", can_access: true, access_source: "suite" };
    const s = await call({ action: "emitir", ...venta() }); eq(s.status, 403, "la Suite sola no incluye ARCA");
  } finally { globalThis.fetch = realFetch; }
});
