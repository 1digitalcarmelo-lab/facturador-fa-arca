// Facturador ARCA · función de Supabase que habla con ARCA (factura electrónica) a través de Afip SDK.
// Nunca expone el token de Afip SDK ni el certificado al navegador.
//
// Variables de entorno (Supabase › Edge Functions › Secrets):
//   AFIPSDK_TOKEN      token de la cuenta de Afip SDK (app.afipsdk.com)
//   ARCA_ENV           "dev" (homologación, CUIT de prueba) o "prod"
//   DC_CUIT            CUIT de Digital Carmelo: es quien tiene el certificado y recibe las delegaciones (solo prod)
//   DC_CERT, DC_KEY    certificado y clave privada de producción de DC, en texto PEM (solo prod)
//   ARCA_EN_SUITE      "true" si el Facturador ARCA viene incluido en la Suite; por defecto no
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  (los pone Supabase solo)
//
// Acciones (POST JSON { action, ... }):
//   estado       → servidores de ARCA (FEDummy)
//   condiciones  → condiciones frente al IVA del receptor válidas para Factura C
//   verificar    → prueba que la delegación y el punto de venta del cliente funcionen
//   emitir       → Factura C (11) o Nota de Crédito C (13): pide el CAE y guarda el comprobante

import { createClient } from "npm:@supabase/supabase-js@2";
import { armarDetalle, urlQR, hoyAR, redondear, CBTE, lista, Problema } from "./reglas.ts";

const AFIPSDK = "https://app.afipsdk.com/api/v1/afip";
const PRODUCT = "facturador-arca";
const DEV_CUIT = "20409378472"; // CUIT de prueba de Afip SDK para homologación

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const ENV = env("ARCA_ENV", "dev") === "prod" ? "prod" : "dev";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------------------------------------------------------------- Afip SDK
async function afip(path: string, body: Record<string, unknown>) {
  const r = await fetch(`${AFIPSDK}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("AFIPSDK_TOKEN")}` },
    body: JSON.stringify({ environment: ENV, ...body }),
  });
  const t = await r.text();
  let data: any;
  try { data = JSON.parse(t); } catch { data = { message: t }; }
  if (!r.ok) throw new Problema(traducirError(data?.message || data?.data_errors || t), 502, data);
  return data;
}

let ta: { token: string; sign: string; exp: number } | null = null;
async function credenciales() {
  if (ta && ta.exp > Date.now() + 60_000) return ta;
  const body: Record<string, unknown> = { wsid: "wsfe", tax_id: ENV === "prod" ? env("DC_CUIT") : DEV_CUIT };
  if (ENV === "prod") { body.cert = env("DC_CERT"); body.key = env("DC_KEY"); }
  const r = await afip("auth", body);
  ta = { token: r.token, sign: r.sign, exp: Date.parse(r.expiration) || Date.now() + 3600_000 };
  return ta;
}
async function wsfe(method: string, cuit: string, params: Record<string, unknown> = {}) {
  const c = await credenciales();
  const auth = { Token: c.token, Sign: c.sign, Cuit: Number(ENV === "prod" ? cuit : DEV_CUIT) };
  return afip("requests", { method, wsid: "wsfe", params: method === "FEDummy" ? {} : { Auth: auth, ...params } });
}

function erroresDe(result: any) {
  return lista(result?.Errors?.Err).map((e: any) => ({ code: e.Code, msg: e.Msg }));
}
function traducirError(m: unknown): string {
  const s = typeof m === "string" ? m : JSON.stringify(m);
  if (/600|ValidacionDeToken|no autorizado/i.test(s)) return "ARCA no autoriza a facturar por este CUIT. Revisá que la delegación del servicio de factura electrónica esté hecha y aceptada.";
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
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
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

    if (action === "estado") {
      const r = await wsfe("FEDummy", DEV_CUIT);
      const s = r?.FEDummyResult || {};
      return json({ ok: s.AppServer === "OK" && s.DbServer === "OK" && s.AuthServer === "OK", ambiente: ENV, servidores: s });
    }

    const user = await usuario(req);
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: cfg } = await admin.from("arca_config").select("*").eq("user_id", user.id).maybeSingle();

    if (action === "condiciones") {
      const r = await wsfe("FEParamGetCondicionIvaReceptor", cfg?.cuit || DEV_CUIT, { ClaseCmp: "C" });
      const items = lista(r?.FEParamGetCondicionIvaReceptorResult?.ResultGet?.CondicionIvaReceptor).map((c: any) => ({ id: Number(c.Id), nombre: c.Desc }));
      return json({ ok: true, condiciones: items });
    }

    if (!cfg?.cuit || !cfg?.pto_vta) throw new Problema("Primero completá tus datos fiscales (CUIT y punto de venta).");
    const cuit = String(cfg.cuit).replace(/\D/g, "");
    const ptoVta = Number(cfg.pto_vta);

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
