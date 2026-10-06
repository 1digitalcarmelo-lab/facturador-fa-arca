// Facturador ARCA · función de Supabase que habla con ARCA (factura electrónica) a través de Afip SDK.
// Nunca expone el token de Afip SDK ni los certificados al navegador.
//
// Secretos: en el Vault de Supabase, leídos con la función public.arca_secreto (solo service_role).
//   arca_afipsdk_token     token de la cuenta de Afip SDK
//   arca_entorno           "prod" o "dev" (homologación con el CUIT de prueba de Afip SDK). Si falta: prod
//   arca_cert_<cuit>, arca_key_<cuit>   certificado propio de un CUIT (factura con su propio certificado)
//   arca_cert_dc, arca_key_dc, arca_cuit_dc   certificado de Digital Carmelo para CUITs que le delegan el servicio
// ARCA_EN_SUITE (variable de entorno): "true" si el Facturador ARCA viene incluido en la Suite; por defecto no.
//
// Seguridad: un usuario solo puede facturar por un CUIT habilitado para él en public.arca_cuits
// (esa tabla la carga Digital Carmelo; desde el navegador no se puede escribir).
//
// Acciones (POST JSON { action, ... }):
//   estado       → servidores de ARCA (FEDummy)
//   condiciones  → condiciones frente al IVA del receptor válidas para Factura C
//   verificar    → prueba que el certificado/delegación y el punto de venta funcionen
//   emitir       → Factura C (11) o Nota de Crédito C (13): pide el CAE y guarda el comprobante

import { createClient } from "npm:@supabase/supabase-js@2";
import { armarDetalle, urlQR, hoyAR, redondear, CBTE, lista, Problema } from "./reglas.ts";

const AFIPSDK = "https://app.afipsdk.com/api/v1/afip";
const PRODUCT = "facturador-arca";
const DEV_CUIT = "20409378472"; // CUIT de prueba de Afip SDK para homologación

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------------------------------------------------------------- Secretos (Vault)
const secretos = new Map<string, { v: string | null; t: number }>();
async function secreto(nombre: string): Promise<string | null> {
  const c = secretos.get(nombre);
  if (c && c.t > Date.now() - 10 * 60_000) return c.v;
  const { data, error } = await admin.rpc("arca_secreto", { p_nombre: nombre });
  if (error) throw new Problema("No pudimos leer la configuración de ARCA.", 500, error.message);
  const v = (data as string | null) || null;
  secretos.set(nombre, { v, t: Date.now() });
  return v;
}
async function entorno(): Promise<"prod" | "dev"> {
  return ((await secreto("arca_entorno")) || "prod").trim() === "dev" ? "dev" : "prod";
}

// ---------------------------------------------------------------- Afip SDK
async function afip(path: string, body: Record<string, unknown>) {
  const token = await secreto("arca_afipsdk_token");
  if (!token) throw new Problema("Falta configurar la cuenta de Afip SDK.", 500);
  const r = await fetch(`${AFIPSDK}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ environment: await entorno(), ...body }),
  });
  const t = await r.text();
  let data: any;
  try { data = JSON.parse(t); } catch { data = { message: t }; }
  if (!r.ok) throw new Problema(traducirError(data?.message || data?.data_errors || t), 502, data);
  return data;
}

// Credenciales (ticket de acceso) por CUIT que firma: el propio o el de DC si el cliente le delegó.
const tickets = new Map<string, { token: string; sign: string; exp: number }>();
async function firmante(cuit: string): Promise<{ firma: string; cert?: string; key?: string }> {
  if ((await entorno()) === "dev") return { firma: DEV_CUIT };
  const cert = await secreto(`arca_cert_${cuit}`);
  if (cert) {
    const key = await secreto(`arca_key_${cuit}`);
    if (!key) throw new Problema("Falta la clave del certificado de este CUIT.", 500);
    return { firma: cuit, cert, key };
  }
  const dc = await secreto("arca_cuit_dc");
  const dcCert = await secreto("arca_cert_dc"), dcKey = await secreto("arca_key_dc");
  if (!dc || !dcCert || !dcKey) throw new Problema("Este CUIT todavía no tiene certificado cargado. Escribinos por WhatsApp.", 400);
  return { firma: dc.replace(/\D/g, ""), cert: dcCert, key: dcKey };
}
async function credenciales(cuit: string) {
  const f = await firmante(cuit);
  const t = tickets.get(f.firma);
  if (t && t.exp > Date.now() + 60_000) return t;
  const body: Record<string, unknown> = { wsid: "wsfe", tax_id: f.firma };
  if (f.cert) { body.cert = f.cert; body.key = f.key; }
  const r = await afip("auth", body);
  const nuevo = { token: r.token, sign: r.sign, exp: Date.parse(r.expiration) || Date.now() + 3600_000 };
  tickets.set(f.firma, nuevo);
  return nuevo;
}
async function wsfe(method: string, cuit: string, params: Record<string, unknown> = {}) {
  if (method === "FEDummy") return afip("requests", { method, wsid: "wsfe", params: {} });
  const dev = (await entorno()) === "dev";
  const c = await credenciales(cuit);
  const auth = { Token: c.token, Sign: c.sign, Cuit: Number(dev ? DEV_CUIT : cuit) };
  return afip("requests", { method, wsid: "wsfe", params: { Auth: auth, ...params } });
}

function erroresDe(result: any) {
  return lista(result?.Errors?.Err).map((e: any) => ({ code: e.Code, msg: e.Msg }));
}
function traducirError(m: unknown): string {
  const s = typeof m === "string" ? m : JSON.stringify(m);
  if (/600|ValidacionDeToken|no autorizado/i.test(s)) return "ARCA no autoriza a facturar por este CUIT. Revisá el certificado o la delegación del servicio de factura electrónica.";
  if (/10015|punto de venta/i.test(s)) return "El punto de venta no existe o no es de tipo Web Services. Revisalo en ARCA.";
  return s.length > 300 ? s.slice(0, 300) + "…" : s;
}

// ---------------------------------------------------------------- Acceso
async function usuario(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Problema("Iniciá sesión para facturar.", 401);
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: u, error } = await userClient.auth.getUser(jwt);
  if (error || !u?.user) throw new Problema("Tu sesión venció. Volvé a entrar.", 401);
  const { data: acc, error: e2 } = await userClient.rpc("get_my_product_access", { p_product_slug: PRODUCT });
  if (e2) throw new Problema("No pudimos verificar tu acceso.", 500, e2);
  const a = lista(acc)[0] as any;
  let ok = !!a?.can_access && a.access_state !== "trial_active"; // la prueba gratis no emite facturas reales
  if (ok && a.access_source === "suite" && env("ARCA_EN_SUITE") !== "true") {
    // La Suite no incluye ARCA salvo que se active: tiene que haber un acceso propio al producto
    const { data: own } = await admin.from("user_product_access").select("plan,status").eq("user_id", u.user.id).eq("product_slug", PRODUCT).maybeSingle();
    ok = !!own && ["full", "legacy_full"].includes(own.plan) && own.status === "active";
  }
  if (!ok) throw new Problema("El Facturador ARCA no está activo en tu cuenta. Escribinos por WhatsApp para sumarlo.", 403);
  return u.user;
}

// ---------------------------------------------------------------- Servidor
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  try {
    const p = await req.json().catch(() => ({}));
    const action = String(p.action || "");

    const user = await usuario(req); // todo pide sesión: la cuenta de Afip SDK tiene un cupo mensual de pedidos
    const ENV = await entorno();

    if (action === "estado") {
      const r = await wsfe("FEDummy", DEV_CUIT);
      const s = r?.FEDummyResult || {};
      return json({ ok: s.AppServer === "OK" && s.DbServer === "OK" && s.AuthServer === "OK", ambiente: ENV, servidores: s });
    }
    const { data: cfg } = await admin.from("arca_config").select("*").eq("user_id", user.id).maybeSingle();
    if (!cfg?.cuit || !cfg?.pto_vta) throw new Problema("Primero completá tus datos fiscales (CUIT y punto de venta).");
    const cuit = String(cfg.cuit).replace(/\D/g, "");
    const ptoVta = Number(cfg.pto_vta);
    if (ENV === "prod") {
      const { data: hab } = await admin.from("arca_cuits").select("cuit").eq("user_id", user.id).eq("cuit", cuit).eq("activo", true).maybeSingle();
      if (!hab) throw new Problema(`El CUIT ${cuit} todavía no está habilitado en tu cuenta. Escribinos por WhatsApp para activarlo.`, 403);
    }

    if (action === "condiciones") {
      const r = await wsfe("FEParamGetCondicionIvaReceptor", cuit, { ClaseCmp: "C" });
      const items = lista(r?.FEParamGetCondicionIvaReceptorResult?.ResultGet?.CondicionIvaReceptor).map((c: any) => ({ id: Number(c.Id), nombre: c.Desc }));
      return json({ ok: true, condiciones: items });
    }

    if (action === "verificar") {
      const r = await wsfe("FECompUltimoAutorizado", cuit, { PtoVta: ptoVta, CbteTipo: CBTE.FACTURA_C });
      const res = r?.FECompUltimoAutorizadoResult || {};
      const errs = erroresDe(res);
      if (errs.length) throw new Problema(traducirError(errs.map((e) => `${e.code}: ${e.msg}`).join(" · ")), 400, errs);
      await admin.from("arca_config").update({ verificado_at: new Date().toISOString() }).eq("user_id", user.id);
      return json({ ok: true, ambiente: ENV, ultimoNumero: Number(res.CbteNro) || 0 });
    }

    if (action === "emitir") {
      const tipo = p.tipo === "NC" ? CBTE.NC_C : CBTE.FACTURA_C;
      for (let intento = 0; intento < 2; intento++) {
        const ult = await wsfe("FECompUltimoAutorizado", cuit, { PtoVta: ptoVta, CbteTipo: tipo });
        const ultRes = ult?.FECompUltimoAutorizadoResult || {};
        const e1 = erroresDe(ultRes);
        if (e1.length) throw new Problema(traducirError(e1.map((e) => `${e.code}: ${e.msg}`).join(" · ")), 400, e1);
        const numero = (Number(ultRes.CbteNro) || 0) + 1;
        const d = armarDetalle({ cuit: Number(ENV === "prod" ? cuit : DEV_CUIT) }, p, numero);
        const r = await wsfe("FECAESolicitar", cuit, {
          FeCAEReq: { FeCabReq: { CantReg: 1, PtoVta: ptoVta, CbteTipo: tipo }, FeDetReq: { FECAEDetRequest: [d.det] } },
        });
        const res = r?.FECAESolicitarResult || {};
        const det = lista(res?.FeDetResp?.FECAEDetResponse)[0] as any || {};
        const errs = erroresDe(res);
        const obs = lista(det?.Observaciones?.Obs).map((o: any) => ({ code: o.Code, msg: o.Msg }));
        if (det.Resultado !== "A") {
          // 10016: el número ya lo usó otra factura emitida al mismo tiempo → se reintenta una vez
          if (intento === 0 && [...errs, ...obs].some((e) => String(e.code) === "10016")) continue;
          throw new Problema("ARCA rechazó el comprobante: " + [...errs, ...obs].map((e) => e.msg).join(" · "), 422, { errs, obs });
        }
        const cae = String(det.CAE), caeVto = String(det.CAEFchVto);
        const comprobante = {
          user_id: user.id, ambiente: ENV, cuit, pto_vta: ptoVta, cbte_tipo: tipo, cbte_nro: numero, cbte_fch: d.fecha,
          concepto: d.concepto, doc_tipo: d.docTipo, doc_nro: d.docNro, receptor_nombre: String(p.receptor?.nombre || "Consumidor final").slice(0, 120),
          receptor_domicilio: String(p.receptor?.domicilio || "").slice(0, 160), condicion_iva_receptor: d.condicion,
          imp_total: d.total, items: d.items, descuento: redondear(p.descuento || 0), servicio: p.servicio || null,
          asociado: p.tipo === "NC" ? p.asociado : null, venta_ref: p.ventaRef || null,
          cae, cae_vto: `${caeVto.slice(0, 4)}-${caeVto.slice(4, 6)}-${caeVto.slice(6, 8)}`, observaciones: obs,
        };
        const { data: guardado, error: eg } = await admin.from("arca_comprobantes").insert(comprobante).select().single();
        if (eg) console.error("No se pudo guardar el comprobante (el CAE igual es válido)", eg, comprobante);
        const qr = urlQR({ fecha: d.fecha, cuit, ptoVta, tipo, numero, total: d.total, docTipo: d.docTipo, docNro: d.docNro, cae });
        return json({ ok: true, ambiente: ENV, comprobante: { ...(guardado || comprobante), qr } });
      }
    }

    throw new Problema("Acción desconocida.");
  } catch (e) {
    if (e instanceof Problema) return json({ ok: false, error: e.mensaje, detalle: e.detalle ?? null }, e.status);
    console.error(e);
    return json({ ok: false, error: "No pudimos comunicarnos con ARCA. Probá de nuevo en unos minutos." }, 500);
  }
});
