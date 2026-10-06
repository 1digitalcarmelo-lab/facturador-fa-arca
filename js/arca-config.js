/* Facturador ARCA · configuración.
   modo "demo": todo funciona en el navegador con CAE de prueba (SIN VALIDEZ FISCAL). Sirve para mostrar y probar.
   modo "nube": factura de verdad a través de la función "arca" de Supabase.
   cuitRepresentante: el CUIT de Digital Carmelo, para quienes le delegan la factura electrónica (si factura con
   certificado propio no hace falta). */
window.ARCA_CONFIG = {
  modo: 'nube',
  supabaseUrl: 'https://rkkulnehklzqqmffvaqz.supabase.co',
  supabaseKey: 'sb_publishable_tKfKztMCb7iwDEIUdrgszA_qzPSPLZo',
  funcion: 'arca',
  cuitRepresentante: '',
  whatsapp: '5491176508119'
};
