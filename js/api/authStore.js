const STORAGE_KEY = 'rc_iot_session_v1';

class AuthStore {
  constructor() {
    this.listeners = new Set();
    this.state = this.#load();
  }

  #load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          token: parsed.token || null,
          user: parsed.user || null,
          guestSession: parsed.guestSession || null,
          activeVehicleId: Number(parsed.activeVehicleId) || 1,
          activeVehicleName: parsed.activeVehicleName || 'Excavadora · ID #1'
        };
      }
    } catch (_) {}
    return {
      token: null,
      user: null,
      guestSession: null,
      activeVehicleId: 1,
      activeVehicleName: 'Excavadora · ID #1'
    };
  }

  #save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (_) {}
    this.listeners.forEach(cb => cb(this.state));
  }

  onChange(cb) {
    this.listeners.add(cb);
  }

  getToken() {
    return this.state.token;
  }

  getUser() {
    return this.state.user;
  }

  getRole() {
    return (this.state.user?.rol || 'INVITADO').toUpperCase();
  }

  getGuestSession() {
    return this.state.guestSession;
  }

  getGuestToken() {
    return this.state.guestSession?.reserva?.token_sesion || null;
  }

  getActiveVehicleId() {
    return Number(this.state.activeVehicleId) || 1;
  }

  getActiveVehicleName() {
    return this.state.activeVehicleName || `Unidad #${this.getActiveVehicleId()}`;
  }

  setSession(loginResp) {
    this.state.token = loginResp.access_token;
    this.state.user = loginResp.usuario;
    this.state.guestSession = null;
    this.#save();
  }

  clearSession() {
    this.state.token = null;
    this.state.user = null;
    this.#save();
  }

  setGuestSession(reservaResp) {
    this.state.guestSession = reservaResp;
    if (reservaResp?.unidad?.id_vehiculo) {
      this.state.activeVehicleId = Number(reservaResp.unidad.id_vehiculo);
      this.state.activeVehicleName = `${reservaResp.unidad.nombre} · ID #${reservaResp.unidad.id_vehiculo}`;
    }
    this.#save();
  }

  clearGuestSession() {
    this.state.guestSession = null;
    this.#save();
  }

  setActiveVehicle(idVehiculo, nombre = null) {
    this.state.activeVehicleId = Number(idVehiculo) || 1;
    this.state.activeVehicleName = nombre || `Unidad #${this.state.activeVehicleId}`;
    this.#save();
  }
}

export const authStore = new AuthStore();
