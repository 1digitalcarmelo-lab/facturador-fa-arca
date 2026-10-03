/* Facturador ARCA · configuración.
   modo "demo": todo funciona en el navegador con CAE de prueba (SIN VALIDEZ FISCAL). Sirve para mostrar y probar.
   modo "nube": factura de verdad a través de la función "arca" de Supabase (la sube Alexis).
   cuitRepresentante: el CUIT de Digital Carmelo, al que cada cliente le delega la factura electrónica en ARCA. */
window.ARCA_CONFIG = {
  modo: 'demo',
  supabaseUrl: 'https://rkkulnehklzqqmffvaqz.supabase.co',
  supabaseKey: 'sb_publishable_tKfKztMCb7iwDEIUdrgszA_qzPSPLZo',
  funcion: 'arca',
  cuitRepresentante: '',          // ej.: '30-12345678-9' (completar antes de pasar a "nube")
  whatsapp: '5491176508119'
};
