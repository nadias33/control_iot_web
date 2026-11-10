import { CONFIG } from '../config.js';

export class ApiClient {
  constructor(baseUrl = CONFIG.API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Petición genérica con soporte para timeout y manejo de errores
   */
  async #request(endpoint, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    const defaultHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const config = {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
      signal: controller.signal
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (_) {}
        const errorMsg = errorData?.detail || `Error HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Tiempo de espera agotado al conectar con el servidor AWS');
      }
      throw error;
    }
  }

  // Comprobar salud del servidor / consulta ligera del vehículo
  async checkHealth(vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}`);
  }

  // Obtener comandos del catálogo
  async getComandos(vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}/comandos`);
  }

  // Obtener estado actual del vehículo
  async getEstado(vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}/estado`);
  }

  // Obtener catálogo de DEMOs
  async getDemos(vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}/demos`);
  }

  // Ejecutar movimiento individual mediante POST
  async postMovimiento(idComando, origen = 'WEB_CONTROL', vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}/movimiento`, {
      method: 'POST',
      body: JSON.stringify({
        id_comando: Number(idComando),
        origen: origen
      })
    });
  }

  // Iniciar ejecución de DEMO mediante POST
  async postIniciarDemo(idDemo, vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}/demos/${idDemo}/iniciar`, {
      method: 'POST'
    });
  }

  // Cancelar ejecución de DEMO mediante POST
  async postCancelarDemo(vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}/demos/cancelar`, {
      method: 'POST'
    });
  }
}

export const api = new ApiClient();