import { API_BASE_URL, CONFIG } from '../config.js';
import { authStore } from './authStore.js';

export class ApiClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.onUnauthorized = null;
  }

  #buildAuthHeaders() {
    const headers = {};
    const token = authStore.getToken();
    const guestToken = authStore.getGuestToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (guestToken) {
      headers['X-Guest-Token'] = guestToken;
    }
    return headers;
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
      'Content-Type': 'application/json',
      ...this.#buildAuthHeaders()
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
        if (response.status === 401 && authStore.getToken() && typeof this.onUnauthorized === 'function') {
          this.onUnauthorized(errorData?.detail || 'Sesión expirada');
        }
        const errorMsg = errorData?.detail || `Error HTTP ${response.status}: ${response.statusText}`;
        const httpErr = new Error(errorMsg);
        httpErr.status = response.status;
        throw httpErr;
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
        headers: { 'Accept': 'application/json', ...this.#buildAuthHeaders() },
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

  // ==========================================
  // MÓDULO 4.3: AUTENTICACIÓN, ADMIN, DEMOS E INVITADO
  // ==========================================
  async login(username, password) {
    return await this.#request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async logout() {
    return await this.#request('/api/v1/auth/logout', { method: 'POST' });
  }

  async getMe() {
    return await this.#request('/api/v1/auth/me');
  }

  async getAdminDashboard() {
    return await this.#request('/api/v1/admin/dashboard');
  }

  async getAdminAuditoria(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return await this.#request(`/api/v1/admin/auditoria${qs ? '?' + qs : ''}`);
  }

  async getAdminModelos() {
    return await this.#request('/api/v1/admin/modelos');
  }

  async createAdminModelo(payload) {
    return await this.#request('/api/v1/admin/modelos', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateAdminModelo(idModelo, payload) {
    return await this.#request(`/api/v1/admin/modelos/${idModelo}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async updateModeloComandos(idModelo, comandos) {
    return await this.#request(`/api/v1/admin/modelos/${idModelo}/comandos`, {
      method: 'PUT',
      body: JSON.stringify({ comandos })
    });
  }

  async getAdminUnidades(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return await this.#request(`/api/v1/admin/unidades${qs ? '?' + qs : ''}`);
  }

  async createAdminUnidad(payload) {
    return await this.#request('/api/v1/admin/unidades', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateAdminUnidad(idVehiculo, payload) {
    return await this.#request(`/api/v1/admin/unidades/${idVehiculo}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async deactivateAdminUnidad(idVehiculo) {
    return await this.#request(`/api/v1/admin/unidades/${idVehiculo}/desactivar`, {
      method: 'PATCH'
    });
  }

  async getAdminClientes(search = '') {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return await this.#request(`/api/v1/admin/clientes${qs}`);
  }

  async createAdminCliente(payload) {
    return await this.#request('/api/v1/admin/clientes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateAdminCliente(idUsuario, payload) {
    return await this.#request(`/api/v1/admin/clientes/${idUsuario}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async assignAdminUnidad(payload) {
    return await this.#request('/api/v1/admin/asignaciones', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getMisVehiculos() {
    return await this.#request('/api/v1/usuario/mis-vehiculos');
  }

  async setSoporteAutorizado(idVehiculo, soporteAutorizado, notasSoporte = '') {
    return await this.#request(`/api/v1/usuario/mis-vehiculos/${idVehiculo}/soporte`, {
      method: 'PATCH',
      body: JSON.stringify({
        soporte_autorizado: Boolean(soporteAutorizado),
        notas_soporte: notasSoporte
      })
    });
  }

  async getDemosEditor(idVehiculo = null) {
    const qs = idVehiculo ? `?id_vehiculo=${Number(idVehiculo)}` : '';
    return await this.#request(`/api/v1/demos-editor${qs}`);
  }

  async getDemoEditorDetalle(idDemo) {
    return await this.#request(`/api/v1/demos-editor/${idDemo}`);
  }

  async createDemoEditor(payload) {
    return await this.#request('/api/v1/demos-editor', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateDemoEditor(idDemo, payload) {
    return await this.#request(`/api/v1/demos-editor/${idDemo}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async deleteDemoEditor(idDemo) {
    return await this.#request(`/api/v1/demos-editor/${idDemo}`, {
      method: 'DELETE'
    });
  }

  async getInvitadoCatalogo() {
    return await this.#request('/api/v1/invitado/catalogo');
  }

  async createInvitadoReserva(payload) {
    return await this.#request('/api/v1/invitado/reservas', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getInvitadoReservaActual() {
    return await this.#request('/api/v1/invitado/reservas/actual');
  }

  async postInvitadoMovimiento(idComando, origen = 'INVITADO_DEMO') {
    return await this.#request('/api/v1/invitado/movimiento', {
      method: 'POST',
      body: JSON.stringify({ id_comando: Number(idComando), origen })
    });
  }

  async finalizarInvitadoReserva() {
    return await this.#request('/api/v1/invitado/reservas/finalizar', {
      method: 'POST'
    });
  }
}

export const api = new ApiClient();