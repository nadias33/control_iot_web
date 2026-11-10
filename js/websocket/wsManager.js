import { CONFIG } from '../config.js';

export class WebSocketManager {
  constructor(url = CONFIG.WS_URL) {
    this.url = url;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 10000;
    this.listeners = new Map();
    this.statusListeners = new Set();
    this.isConnected = false;
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

  connect() {
    this.#emitStatus('CONNECTING');
    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.#emitStatus('ONLINE');
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const tipo = payload.tipo || payload.evento || 'DESCONOCIDO';
          this.#emitMessage(tipo, payload);
        } catch (err) {
          console.warn('[WSS] Mensaje no es JSON válido:', event.data);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.#emitStatus('OFFLINE');
        this.#scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.error('[WSS] Error en sesión WebSocket:', err);
        this.socket.close();
      };
    } catch (e) {
      this.isConnected = false;
      this.#emitStatus('OFFLINE');
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, delay);
  }
}

export const wsManager = new WebSocketManager();