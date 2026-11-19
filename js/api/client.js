import { API_BASE_URL, CONFIG } from '../config.js';

export class ApiClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  #classifyFetchError(error) {
    if (error?.name === 'AbortError') {
      return new Error(`Tiempo de espera agotado al conectar con el servidor AWS (${this.baseUrl})`);
    }
    const msg = String(error?.message || '');
    if (error instanceof TypeError || /failed to fetch|networkerror|load failed|err_cert/i.test(msg)) {
      const sslErr = new Error(
        `Fallo de red/SSL/CORS al conectar con ${this.baseUrl}. Si es certificado autofirmado, abre ${this.baseUrl}/docs en otra pestaña para autorizarlo y recarga.`
      );
      sslErr.isSslOrNetworkError = true;
      return sslErr;
    }
    return error;
  }

  /**
   * Petición genérica con soporte para timeout, SSL y manejo de errores
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
      throw this.#classifyFetchError(error);
    }
  }

  // Diagnóstico desacoplado de API AWS y Amazon RDS (con fallback si /health no existe)
  async getHealth(vehicleId = CONFIG.VEHICLE_ID) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 200) {
        const data = await response.json();
        return { apiOk: true, rdsOk: data?.rds !== 'no_disponible', data };
      }

      if (response.status === 503) {
        let data = null;
        try {
          data = await response.json();
        } catch (_) {}
        return {
          apiOk: true,
          rdsOk: false,
          detail: data?.detail || 'Dependencia Amazon RDS no disponible',
          data
        };
      }

      if (response.status === 404) {
        const vehiculo = await this.checkHealth(vehicleId);
        return {
          apiOk: true,
          rdsOk: Boolean(vehiculo && (vehiculo.id_vehiculo || vehiculo.nombre)),
          data: vehiculo
        };
      }

      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.#classifyFetchError(error);
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

  // Obtener historial de movimientos registrados en Amazon RDS (Máx 10)
  async getHistorial(vehicleId = CONFIG.VEHICLE_ID) {
    return await this.#request(`/vehiculos/${vehicleId}/historial`);
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