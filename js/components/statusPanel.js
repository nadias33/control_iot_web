import { wsManager } from '../websocket/wsManager.js';
import { api } from '../api/client.js';
import { CONFIG } from '../config.js';

export class StatusPanel {
  constructor() {
    this.elWSS = document.getElementById('statusWSS');
    this.elAPI = document.getElementById('statusAPI');
    this.elRDS = document.getElementById('statusRDS');
  }

  init() {
    // 1. Vincular estado del WebSocket (WSS)
    wsManager.onStatusChange((status) => {
      this.#renderWSS(status);
    });

    // 2. Iniciar comprobación periódica de la API AWS
    this.checkApiStatus();
    setInterval(() => this.checkApiStatus(), CONFIG.HEALTH_CHECK_INTERVAL_MS);
  }

  #renderWSS(status) {
    if (status === 'ONLINE') {
      this.elWSS.className = 'status-indicator status-online mt-1';
      this.elWSS.innerHTML = '<i class="bi bi-check-circle-fill"></i> <span class="status-text">En línea</span>';
    } else if (status === 'CONNECTING') {
      this.elWSS.className = 'status-indicator status-connecting mt-1';
      this.elWSS.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> <span class="status-text">Conectando...</span>';
    } else {
      this.elWSS.className = 'status-indicator status-offline mt-1';
      this.elWSS.innerHTML = '<i class="bi bi-x-circle-fill"></i> <span class="status-text">Desconectado</span>';
    }
  }

  async checkApiStatus() {
    this.elAPI.className = 'status-indicator status-checking mt-1';
    this.elAPI.innerHTML = '<i class="bi bi-cloud-arrow-down spin"></i> <span class="status-text">Comprobando</span>';

    try {
      const data = await api.checkHealth();
      if (data && (data.id_vehiculo || data.nombre)) {
        this.elAPI.className = 'status-indicator status-online mt-1';
        this.elAPI.innerHTML = '<i class="bi bi-check-circle-fill"></i> <span class="status-text">Disponible</span>';
        
        // Amazon RDS: Si la API respondió con los datos reales del vehículo desde la base, 
        // confirmamos disponibilidad de datos; si no hay comprobación directa, queda como 'Sin verificar'
        this.#renderRDS('AVAILABLE');
      } else {
        throw new Error('Respuesta no válida');
      }
    } catch (_) {
      this.elAPI.className = 'status-indicator status-offline mt-1';
      this.elAPI.innerHTML = '<i class="bi bi-x-circle-fill"></i> <span class="status-text">No disponible</span>';
      this.#renderRDS('UNVERIFIED');
    }
  }

  #renderRDS(status) {
    if (status === 'AVAILABLE') {
      this.elRDS.className = 'status-indicator status-online mt-1';
      this.elRDS.innerHTML = '<i class="bi bi-database-check"></i> <span class="status-text">Disponible</span>';
    } else {
      this.elRDS.className = 'status-indicator status-unverified mt-1';
      this.elRDS.innerHTML = '<i class="bi bi-database-dash"></i> <span class="status-text">Sin verificar</span>';
    }
  }
}