// Reglas de Factura C y Nota de Crédito C (ARCA, WSFEv1). Sin dependencias: se prueban con deno test o node.
export const CBTE = { FACTURA_C: 11, NC_C: 13 } as const;
export class Problema extends Error {
  constructor(public mensaje: string, public status = 400, public detalle?: unknown) { super(mensaje); }
}
// Las respuestas de ARCA traen a veces un objeto y a veces una lista
export const lista = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
// ---------------------------------------------------------------- Reglas de Factura C
export const redondear = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const yyyymmdd = (d: string) => d.replaceAll("-", "");
export const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // Argentina, UTC-3
export const DOC = { CUIT: 80, CUIL: 86, DNI: 96, CONSUMIDOR_FINAL: 99 } as const;

export function diasEntre(a: string, b: string) { return Math.round((Date.parse(a) - Date.parse(b)) / 86400_000); }

export function armarDetalle(cfg: any, p: any, numero: number) {
  const concepto = [1, 2, 3].includes(Number(p.concepto)) ? Number(p.concepto) : 1;
  const fecha = p.fecha || hoyAR();
  const dif = diasEntre(hoyAR(), fecha);
  const margen = concepto === 1 ? 5 : 10;
  if (dif > margen || dif < -margen) throw new Problema(`La fecha de la factura puede ser hasta ${margen} días antes o después de hoy.`);

  const items = lista(p.items).filter((i: any) => i && String(i.descripcion || "").trim() && Number(i.cantidad) > 0);
  if (!items.length) throw new Problema("La factura necesita al menos un ítem con cantidad y precio.");
  const total = redondear(items.reduce((a: number, i: any) => a + redondear(Number(i.cantidad) * Number(i.precio)), 0) - redondear(p.descuento || 0));
  if (!(total > 0)) throw new Problema("El total tiene que ser mayor a cero.");

  const r = p.receptor || {};
  let docTipo = Number(r.docTipo) || DOC.CONSUMIDOR_FINAL;
  let docNro = String(r.docNro || "").replace(/\D/g, "");
  if (docTipo === DOC.CONSUMIDOR_FINAL || !docNro) { docTipo = DOC.CONSUMIDOR_FINAL; docNro = "0"; }
  if (docTipo === DOC.CUIT && docNro.length !== 11) throw new Problema("El CUIT del cliente tiene que tener 11 números.");
  const condicion = Number(r.condicionIva) || 5; // 5 = Consumidor Final

  const det: Record<string, unknown> = {
    Concepto: concepto, DocTipo: docTipo, DocNro: Number(docNro),
    CbteDesde: numero, CbteHasta: numero, CbteFch: Number(yyyymmdd(fecha)),
    ImpTotal: total, ImpTotConc: 0, ImpNeto: total, ImpOpEx: 0, ImpIVA: 0, ImpTrib: 0,
    MonId: "PES", MonCotiz: 1, CondicionIVAReceptorId: condicion,
  };
  if (concepto !== 1) {
    const desde = p.servicio?.desde || fecha, hasta = p.servicio?.hasta || fecha, vto = p.servicio?.vencimiento || fecha;
    if (hasta < desde) throw new Problema("En servicios, la fecha 'hasta' no puede ser anterior a 'desde'.");
    if (vto < fecha) throw new Problema("El vencimiento del pago no puede ser anterior a la fecha de la factura.");
    Object.assign(det, { FchServDesde: yyyymmdd(desde), FchServHasta: yyyymmdd(hasta), FchVtoPago: yyyymmdd(vto) });
  }
  if (p.tipo === "NC") {
    const a = p.asociado || {};
    if (!a.numero || !a.ptoVta || !a.fecha) throw new Problema("La nota de crédito tiene que indicar la factura que anula.");
    det.CbtesAsoc = { CbteAsoc: [{ Tipo: CBTE.FACTURA_C, PtoVta: Number(a.ptoVta), Nro: Number(a.numero), Cuit: cfg.cuit, CbteFch: yyyymmdd(a.fecha) }] };
  }
  return { det, total, items, concepto, docTipo, docNro, condicion, fecha };
}

// QR obligatorio (especificación de ARCA): https://www.afip.gob.ar/fe/qr/?p=<base64 del JSON>
export function urlQR(c: { fecha: string; cuit: string; ptoVta: number; tipo: number; numero: number; total: number; docTipo: number; docNro: string; cae: string }) {
  const data = {
    ver: 1, fecha: c.fecha, cuit: Number(c.cuit), ptoVta: c.ptoVta, tipoCmp: c.tipo, nroCmp: c.numero,
    importe: c.total, moneda: "PES", ctz: 1, tipoDocRec: c.docTipo, nroDocRec: Number(c.docNro), tipoCodAut: "E", codAut: Number(c.cae),
  };
  return "https://www.afip.gob.ar/fe/qr/?p=" + btoa(JSON.stringify(data));
}

