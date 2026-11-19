import { API_BASE_URL, CONFIG } from '../config.js';

export class WebSocketManager {
  constructor(vehicleId = CONFIG.VEHICLE_ID) {
    this.vehicleId = Number(vehicleId) || CONFIG.VEHICLE_ID;
    this.url = CONFIG.getWsUrl(this.vehicleId);
    this.socket = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.listeners = new Map();
    this.statusListeners = new Set();
    this.isConnected = false;
    this.hasConnectedOnce = false;
    this.sslHintEmitted = false;
    this.pingTimer = null;
  }

  // Enviar mensaje o comando a través del socket WSS
  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket.send(payload);
        return true;
      } catch (err) {
        console.error('[WSS] Error enviando mensaje:', err);
        return false;
      }
    }
    return false;
  }

  #startHeartbeat() {
    this.#stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ tipo: 'PING' }));
        } catch (_) {}
      }
    }, 25000);
  }

  #stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  #clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // Suscribirse a cambios en el estado de conexión
  onStatusChange(callback) {
    this.statusListeners.add(callback);
    callback(this.isConnected ? 'ONLINE' : 'CONNECTING');
  }

  // Suscribirse a tipos específicos de mensajes
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);
  }

  #emitStatus(status) {
    this.statusListeners.forEach(cb => cb(status));
  }

  #emitMessage(eventType, data) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).forEach(cb => cb(data));
    }
    // Canal comodín
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => cb({ eventType, data }));
    }
  }

  connect(vehicleId = this.vehicleId) {
    this.#clearReconnectTimer();
    const targetId = Number(vehicleId) || CONFIG.VEHICLE_ID;
    const targetUrl = CONFIG.getWsUrl(targetId);

    if (
      this.socket &&
      this.url === targetUrl &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      const oldSocket = this.socket;
      oldSocket.onopen = null;
      oldSocket.onmessage = null;
      oldSocket.onclose = null;
      oldSocket.onerror = null;
      try {
        oldSocket.close();
      } catch (_) {}
      this.isConnected = false;
      this.#stopHeartbeat();
    }

    this.vehicleId = targetId;
    this.url = targetUrl;
    this.#emitStatus('CONNECTING');

    try {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.isConnected = true;
        this.hasConnectedOnce = true;
        this.sslHintEmitted = false;
        this.reconnectAttempts = 0;
        this.#startHeartbeat();
        this.#emitStatus('ONLINE');
      };

      socket.onmessage = (event) => {
        if (this.socket !== socket) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.tipo === 'PONG') return; // Heartbeat response
          const tipo = payload.tipo || payload.evento || 'DESCONOCIDO';
          this.#emitMessage(tipo, payload);
        } catch (err) {
          console.warn('[WSS] Mensaje no es JSON válido:', event.data);
        }
      };

      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.isConnected = false;
        this.#stopHeartbeat();
        this.#emitStatus('OFFLINE');
        this.#scheduleReconnect();
      };

      socket.onerror = (err) => {
        if (this.socket !== socket) return;
        console.error('[WSS] Error en sesión WebSocket:', err);
        if (!this.hasConnectedOnce && !this.sslHintEmitted) {
          this.sslHintEmitted = true;
          this.#emitMessage('SSL_OR_NETWORK_ERROR', {
            url: this.url,
            docsUrl: `${API_BASE_URL}/docs`
          });
        }
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    } catch (e) {
      this.isConnected = false;
      this.#emitStatus('OFFLINE');
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    if (this.reconnectTimer || this.isConnected) return;
    this.reconnectAttempts++;
    const delay = CONFIG.WS_RECONNECT_INTERVAL_MS || 3000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isConnected) {
        this.connect(this.vehicleId);
      }
    }, delay);
  }
}

export const wsManager = new WebSocketManager();