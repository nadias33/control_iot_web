/**
 * Configuración centralizada de la aplicación de control IoT.
 * Apunta al servidor público AWS EC2 (HTTPS/WSS en puerto 8000).
 */
export const API_BASE_URL = 'https://52.202.139.21:8000';
export const WS_BASE_URL = 'wss://52.202.139.21:8000';

export const CONFIG = {
  // Identificador del vehículo configurado en RDS
  VEHICLE_ID: 1,

  // URLs base unificadas hacia AWS EC2
  API_BASE_URL,
  WS_BASE_URL,

  // URL WebSocket Seguro (WSS puerto 8000) segregado por vehículo
  WS_URL: `${WS_BASE_URL}/ws/vehiculos/1`,

  getWsUrl(vehicleId = this.VEHICLE_ID, authOpts = {}) {
    const base = `${WS_BASE_URL}/ws/vehiculos/${vehicleId}`;
    const params = new URLSearchParams();
    if (authOpts?.token) {
      params.set('token', authOpts.token);
    } else if (authOpts?.guestToken) {
      params.set('guest_token', authOpts.guestToken);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  },

  // Intervalo de reconexión automática del WebSocket (3 segundos)
  WS_RECONNECT_INTERVAL_MS: 3000,

  // Intervalo de comprobación periódica de salud de la API (en milisegundos)
  HEALTH_CHECK_INTERVAL_MS: 15000,

  // Tiempo de espera máximo para peticiones Fetch (ms)
  REQUEST_TIMEOUT_MS: 6000,

  // Mapeo canónico de comandos hacia códigos reales del control NO. 555-104 (+ DETENER)
  COMANDOS: {
    AVANZAR: 1,
    RETROCEDER: 2,
    GIRAR_IZQUIERDA: 3,
    GIRAR_IZQ: 3,
    GIRAR_DERECHA: 4,
    GIRAR_DER: 4,
    SUBIR_GARRA: 5,
    SUBIR_BRAZO: 5,
    BAJAR_GARRA: 6,
    BAJAR_BRAZO: 6,
    LUZ: 7,
    SONIDO: 8,
    DETENER: 9,
    CABINA_IZQUIERDA: 10,
    CABINA_IZQ: 10,
    CABINA_DERECHA: 11,
    CABINA_DER: 11,
    VELOCIDAD: 12,
    DEMO_AUTO: 13
  }
};