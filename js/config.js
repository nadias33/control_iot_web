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

  getWsUrl(vehicleId = this.VEHICLE_ID) {
    return `${WS_BASE_URL}/ws/vehiculos/${vehicleId}`;
  },

  // Intervalo de reconexión automática del WebSocket (3 segundos)
  WS_RECONNECT_INTERVAL_MS: 3000,

  // Intervalo de comprobación periódica de salud de la API (en milisegundos)
  HEALTH_CHECK_INTERVAL_MS: 15000,

  // Tiempo de espera máximo para peticiones Fetch (ms)
  REQUEST_TIMEOUT_MS: 6000,

  // Mapeo canónico de comandos hacia códigos de tu base de datos
  COMANDOS: {
    AVANZAR: 1,
    RETROCEDER: 2,
    CABINA_IZQ: 3,
    CABINA_DER: 4,
    GIRAR_DER: 5,
    GIRAR_IZQ: 6,
    SUBIR_BRAZO: 7,
    BAJAR_BRAZO: 8,
    DETENER: 9,
    ABRIR_PALA: 10,
    CERRAR_PALA: 11
  }
};