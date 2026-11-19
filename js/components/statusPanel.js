import { wsManager } from '../websocket/wsManager.js';
import { api } from '../api/client.js';
import { CONFIG } from '../config.js';

export class StatusPanel {
  constructor(onLog = null) {
    this.onLog = onLog;
    this.elWSS = document.getElementById('statusWSS');
    this.elAPI = document.getElementById('statusAPI');
    this.elRDS = document.getElementById('statusRDS');
    this.sslNoticeLogged = false;
    this.rdsNoticeLogged = false;
  }

  init() {
    // 1. Vincular estado del WebSocket (WSS)
    wsManager.onStatusChange((status) => {
      this.#renderWSS(status);
    });

    // 2. Iniciar comprobación periódica de la API AWS y Amazon RDS
    this.checkApiStatus();
    setInterval(() => this.checkApiStatus(), CONFIG.HEALTH_CHECK_INTERVAL_MS);
  }

  #renderWSS(status) {
    if (!this.elWSS) return;
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
    if (!this.elAPI || !this.elRDS) return;
    this.elAPI.className = 'status-indicator status-checking mt-1';
    this.elAPI.innerHTML = '<i class="bi bi-cloud-arrow-down spin"></i> <span class="status-text">Comprobando</span>';

    try {
      const res = await api.getHealth();
      if (res && res.apiOk) {
        this.elAPI.className = 'status-indicator status-online mt-1';
        this.elAPI.innerHTML = '<i class="bi bi-check-circle-fill"></i> <span class="status-text">Disponible</span>';
        this.sslNoticeLogged = false;

        if (res.rdsOk) {
          this.rdsNoticeLogged = false;
          this.#renderRDS('AVAILABLE');
        } else {
          this.#renderRDS('UNAVAILABLE');
          if (!this.rdsNoticeLogged && this.onLog) {
            this.rdsNoticeLogged = true;
            this.onLog(`[RDS ERROR] ${res.detail || 'Base de datos Amazon RDS sin respuesta'}`);
          }
        }
      } else {
        throw new Error('Respuesta no válida');
      }
    } catch (err) {
      this.elAPI.className = 'status-indicator status-offline mt-1';
      this.elAPI.innerHTML = '<i class="bi bi-x-circle-fill"></i> <span class="status-text">No disponible</span>';
      this.#renderRDS('UNVERIFIED');

      if (err?.isSslOrNetworkError && !this.sslNoticeLogged && this.onLog) {
        this.sslNoticeLogged = true;
        this.onLog(`[AVISO SSL] ${err.message}`);
      }
    }
  }

  #renderRDS(status) {
    if (!this.elRDS) return;
    if (status === 'AVAILABLE') {
      this.elRDS.className = 'status-indicator status-online mt-1';
      this.elRDS.innerHTML = '<i class="bi bi-database-check"></i> <span class="status-text">Disponible</span>';
    } else if (status === 'UNAVAILABLE') {
      this.elRDS.className = 'status-indicator status-offline mt-1';
      this.elRDS.innerHTML = '<i class="bi bi-database-x"></i> <span class="status-text">No disponible</span>';
    } else {
      this.elRDS.className = 'status-indicator status-unverified mt-1';
      this.elRDS.innerHTML = '<i class="bi bi-database-dash"></i> <span class="status-text">Sin verificar</span>';
    }
  }
}