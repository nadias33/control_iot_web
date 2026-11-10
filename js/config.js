/**
 * Configuración centralizada de la aplicación de control IoT
 * Apunta a tu servidor público AWS EC2 (con HTTPS y WSS).
 */
export const CONFIG = {
  // Identificador del vehículo configurado en RDS
  VEHICLE_ID: 1,

  // URL Base de la API en AWS EC2 (HTTPS)
  API_BASE_URL: 'https://52.202.139.21',

  // URL WebSocket Seguro (WSS) segregado por vehículo
  WS_URL: 'wss://52.202.139.21/ws/vehiculos/1',

  // Intervalo de comprobación periódica de salud de la API (en milisegundos)
  HEALTH_CHECK_INTERVAL_MS: 15000,

  // Tiempo de espera máximo para peticiones Fetch (ms)
  REQUEST_TIMEOUT_MS: 5000,

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