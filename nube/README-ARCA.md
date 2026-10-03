# Facturador ARCA · parte de la nube

Factura C (11) y Nota de Crédito C (13) para monotributistas, por ARCA (WSFEv1) a través de **Afip SDK** (app.afipsdk.com).

## Cómo funciona
- La app llama a la función `arca` de Supabase. El navegador nunca ve el token de Afip SDK ni el certificado.
- Modelo **delegación**: cada cliente delega el web service *Facturación Electrónica* al CUIT de Digital Carmelo. DC factura en nombre del cliente con **un solo certificado** (el de DC).
- La función pide el último número (`FECompUltimoAutorizado`), arma el comprobante, pide el CAE (`FECAESolicitar`) y lo guarda en `arca_comprobantes`. Ya incluye `CondicionIVAReceptorId`, que ARCA exige desde el 1/9/2026.
- Acceso: `get_my_product_access('facturador-arca')`. La prueba gratis no emite facturas reales. La Suite **no** lo incluye, salvo que se ponga `ARCA_EN_SUITE=true`.

## Archivos
- `sql/001_arca.sql`: producto `facturador-arca`, tablas `arca_config` y `arca_comprobantes`, con RLS.
- `supabase/functions/arca/index.ts` y `reglas.ts`: la función.
- `pruebas/arca_test.ts`: pruebas con ARCA, Afip SDK y Supabase simulados (`deno test -A nube/pruebas/arca_test.ts`).

## Puesta en marcha
1. **Afip SDK:** crear la cuenta (plan Free para probar) y copiar el *access token*.
2. **Supabase:**
   - Aplicar `sql/001_arca.sql`.
   - Desplegar la función `arca` con verify_jwt activado.
   - Cargar los secretos `AFIPSDK_TOKEN` y `ARCA_ENV=dev`.
3. **App:** en `js/arca-config.js` poner `modo: 'nube'`. En `dev` factura contra homologación con el CUIT de prueba 20409378472: los comprobantes salen marcados "SIN VALIDEZ FISCAL · HOMOLOGACIÓN".
4. **Producción:**
   - Certificado de producción de DC: en ARCA, *Administración de Certificados Digitales*, o con la automatización de Afip SDK.
   - Autorizar *Facturación Electrónica* para el alias de DC.
   - Secretos `ARCA_ENV=prod`, `DC_CUIT`, `DC_CERT`, `DC_KEY` (PEM).
   - En `arca-config.js`, completar `cuitRepresentante` con el CUIT de DC.
5. **Por cada cliente nuevo:**
   - El cliente crea el punto de venta *Factura Electrónica - Monotributo - Web Services* y delega *Facturación Electrónica* al CUIT de DC.
   - DC entra a *Aceptación de Designación* y acepta.
   - En *Administrador de Relaciones*, eligiendo como representado el CUIT del cliente, DC asocia el servicio a su alias.
   - El cliente carga sus datos fiscales en la app y toca *Verificar conexión*.
6. **Activar el acceso** del cliente en `user_product_access` (product_slug `facturador-arca`, plan `full`, status `active`).

## Para revisar con un contador antes de producción
- A partir de qué monto hay que identificar al consumidor final (DNI) en Factura C.
- Si hace falta alguna leyenda extra para monotributistas (régimen de transparencia fiscal).
