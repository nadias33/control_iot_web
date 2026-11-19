import { CONFIG } from './config.js';
import { api } from './api/client.js';
import { authStore } from './api/authStore.js';
import { wsManager } from './websocket/wsManager.js';
import { StatusPanel } from './components/statusPanel.js';
import { SliderControl } from './components/sliderControl.js';
import { ButtonsController } from './components/buttons.js';
import { DemoControl } from './components/demoControl.js';
import { MonitoringView } from './components/monitoringView.js';
import { AdminView } from './components/adminView.js';

class App {
  constructor() {
    this.terminal = document.getElementById('terminalLog');
    this.txtDireccion = document.getElementById('txtDireccionActual');
    this.badgeOperacion = document.getElementById('badgeOperacion');
    this.btnLimpiar = document.getElementById('btnLimpiarLogs');
    this.hudDigitalCenter = document.getElementById('hudDigitalCenter');

    // Botones de Navegación y Vistas (3 pestañas)
    this.tabControl = document.getElementById('tabNavControl');
    this.tabMonitoreo = document.getElementById('tabNavMonitoreo');
    this.tabAdmin = document.getElementById('tabNavAdministracion');
    this.viewControl = document.getElementById('viewControl');
    this.viewMonitoreo = document.getElementById('viewMonitoreo');
    this.viewAdmin = document.getElementById('viewAdmin');

    // Sesión y selector multi-unidad
    this.badgeRol = document.getElementById('badgeRolActivo');
    this.txtUsuario = document.getElementById('txtUsuarioActivo');
    this.txtVehiculoNombre = document.getElementById('txtVehiculoNombre');
    this.selectVehiculo = document.getElementById('selectVehiculoActivo');
    this.btnAbrirLogin = document.getElementById('btnAbrirLogin');
    this.btnCerrarSesion = document.getElementById('btnCerrarSesion');
    this.loginModal = null;

    this.sliderTraction = null;
    this.sliderSteering = null;
    this.demoControl = null;
    this.monitoringView = null;
    this.adminView = null;
    this.isSending = false;
  }

  #getWsAuthOpts() {
    const token = authStore.getToken();
    const guestToken = authStore.getGuestToken();
    return { token, guestToken };
  }

  init() {
    CONFIG.VEHICLE_ID = authStore.getActiveVehicleId();
    if (this.txtVehiculoNombre) {
      this.txtVehiculoNombre.textContent = authStore.getActiveVehicleName();
    }
    this.log(`Plataforma telemática iniciada para vehículo #${CONFIG.VEHICLE_ID}...`);

    // 1. Iniciar Navegación entre Vistas (Control, Monitoreo y Administración)
    this.#setupNavigation();

    // 2. Configurar Sesión Multi-Rol y Modal de Login
    this.#setupSessionUI();

    // 3. Iniciar Panel de 3 Estados (WSS, API, RDS)
    const statusPanel = new StatusPanel((msg) => this.log(msg));
    statusPanel.init();

    // 4. Conectar Canal WebSocket Seguro único (WSS Bidireccional)
    wsManager.connect(CONFIG.VEHICLE_ID, this.#getWsAuthOpts());
    this.#setupWebSocketListeners();

    // 5. Instanciar los DOS CONTROLES TIPO SLIDER (DESLIZADORES TÁCTILES CON CENTRADO)
    this.sliderTraction = new SliderControl({
      trackId: 'sliderTrackTraction',
      thumbId: 'sliderThumbTraction',
      valueLabelId: 'sliderValTraction',
      orientation: 'vertical',
      name: 'TRACCIÓN',
      threshold: 0.22,
      mapping: {
        POSITIVE: { id: CONFIG.COMANDOS.AVANZAR, name: 'AVANZAR' },
        NEUTRAL: { id: CONFIG.COMANDOS.DETENER, name: 'DETENER' },
        NEGATIVE: { id: CONFIG.COMANDOS.RETROCEDER, name: 'RETROCEDER' }
      },
      onCommand: (idCmd, nombre, norm) => {
        this.#updateDirectionDisplay(`TRACCIÓN: ${nombre}`, norm);
        this.ejecutarComando(idCmd, `SLIDER_TRACCION_${nombre}`);
      }
    });

    this.sliderSteering = new SliderControl({
      trackId: 'sliderTrackSteering',
      thumbId: 'sliderThumbSteering',
      valueLabelId: 'sliderValSteering',
      orientation: 'vertical',
      name: 'DIRECCIÓN',
      threshold: 0.22,
      mapping: {
        POSITIVE: { id: CONFIG.COMANDOS.GIRAR_IZQ, name: 'GIRAR_IZQ' },
        NEUTRAL: { id: CONFIG.COMANDOS.DETENER, name: 'RECTO' },
        NEGATIVE: { id: CONFIG.COMANDOS.GIRAR_DER, name: 'GIRAR_DER' }
      },
      onCommand: (idCmd, nombre, norm) => {
        this.#updateDirectionDisplay(`DIRECCIÓN: ${nombre}`, norm);
        this.ejecutarComando(idCmd, `SLIDER_DIRECCION_${nombre}`);
      }
    });

    // 6. Botones auxiliares superiores (Cabina L1/R1) y Parada de Emergencia STOP
    new ButtonsController((comandoId, nombreCmd) => {
      if (comandoId === CONFIG.COMANDOS.DETENER) {
        if (this.sliderTraction) this.sliderTraction.resetToCenter();
        if (this.sliderSteering) this.sliderSteering.resetToCenter();
        this.#updateDirectionDisplay('EMERGENCY STOP (REPOSO)', 0);
      }
      this.ejecutarComando(comandoId, `CONTROL_${nombreCmd}`);
    });

    // 7. Módulo DEMO
    this.demoControl = new DemoControl((msg) => this.log(msg));

    // 8. Vista de MONITOREO (Telemetría en tiempo real y tabla de 10 registros persistidos)
    this.monitoringView = new MonitoringView((msg) => this.log(msg));

    // 9. Vista de ADMINISTRACIÓN (4.3: Exhibición Invitado | Mis Vehículos & Demos | Gestión Comercial)
    this.adminView = new AdminView({
      onLog: (msg) => this.log(msg),
      onSelectVehicle: (idVehiculo, nombre) => this.cambiarVehiculoActivo(idVehiculo, nombre),
      onDemosChanged: () => this.demoControl?.resetYcargarDemos(),
      onGoToControl: () => this.tabControl?.click()
    });

    // Botón para limpiar logs
    if (this.btnLimpiar) {
      this.btnLimpiar.addEventListener('click', () => {
        this.terminal.innerHTML = '<div class="text-secondary small">[LOG LIMPIO]</div>';
      });
    }

    if (authStore.getToken()) {
      this.#sincronizarUnidadesUsuario();
    }
  }

  #setupNavigation() {
    const mainEl = document.querySelector('main.app-main');
    const tabs = [
      { btn: this.tabControl, view: this.viewControl },
      { btn: this.tabMonitoreo, view: this.viewMonitoreo, onOpen: () => this.monitoringView.sincronizarTodo() },
      { btn: this.tabAdmin, view: this.viewAdmin, onOpen: () => this.adminView.openAdminView() }
    ];

    tabs.forEach(({ btn, view, onOpen }) => {
      if (!btn || !view) return;
      btn.addEventListener('click', async () => {
        tabs.forEach(t => {
          t.btn?.classList.remove('active');
          t.view?.classList.add('d-none');
        });
        btn.classList.add('active');
        view.classList.remove('d-none');
        if (mainEl) {
          mainEl.classList.toggle('admin-wide', view === this.viewAdmin);
        }

        if (onOpen) await onOpen();
      });
    });
  }

  #setupSessionUI() {
    const modalEl = document.getElementById('modalLogin');
    if (modalEl && typeof bootstrap !== 'undefined') {
      this.loginModal = new bootstrap.Modal(modalEl);
    }

    this.btnAbrirLogin?.addEventListener('click', () => {
      document.getElementById('loginErrorBox')?.classList.add('d-none');
      this.loginModal?.show();
    });

    this.btnCerrarSesion?.addEventListener('click', async () => {
      try {
        if (authStore.getToken()) await api.logout();
      } catch (_) {}
      authStore.clearSession();
      this.log('[AUTH] Sesión cerrada. Modo Invitado activo.');
      this.#onAuthChanged();
    });

    document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('loginErrorBox');
      const btnSubmit = document.getElementById('btnSubmitLogin');
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      errBox?.classList.add('d-none');
      if (btnSubmit) btnSubmit.disabled = true;

      try {
        const resp = await api.login(username, password);
        authStore.setSession(resp);
        this.loginModal?.hide();
        e.target.reset();
        this.log(`[AUTH OK] Bienvenido ${resp.usuario.nombre_completo} (${resp.usuario.rol})`);
        await this.#onAuthChanged();
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message;
          errBox.classList.remove('d-none');
        }
      } finally {
        if (btnSubmit) btnSubmit.disabled = false;
      }
    });

    this.selectVehiculo?.addEventListener('change', () => {
      const opt = this.selectVehiculo.selectedOptions?.[0];
      if (!opt || !opt.value) return;
      this.cambiarVehiculoActivo(Number(opt.value), opt.dataset.nombre || opt.textContent);
    });

    api.onUnauthorized = (msg) => {
      authStore.clearSession();
      this.log(`[AUTH] ${msg}`);
      this.#onAuthChanged();
    };

    this.#renderSessionStrip();
  }

  #renderSessionStrip() {
    const rol = authStore.getRole();
    const user = authStore.getUser();
    if (this.badgeRol) {
      this.badgeRol.textContent = rol;
      this.badgeRol.className = rol === 'ADMINISTRADOR'
        ? 'badge bg-warning text-dark text-uppercase'
        : rol === 'USUARIO'
          ? 'badge bg-info text-dark text-uppercase'
          : 'badge bg-secondary text-uppercase';
    }
    if (this.txtUsuario) {
      this.txtUsuario.textContent = user ? `${user.nombre_completo} (@${user.username})` : 'Modo exhibición pública';
    }
    this.btnAbrirLogin?.classList.toggle('d-none', Boolean(user));
    this.btnCerrarSesion?.classList.toggle('d-none', !user);
    if (!user) {
      this.selectVehiculo?.classList.add('d-none');
    }
  }

  async #onAuthChanged() {
    this.#renderSessionStrip();
    this.adminView?.syncRoleVisibility();
    if (authStore.getToken()) {
      await this.#sincronizarUnidadesUsuario();
    } else {
      this.cambiarVehiculoActivo(1, 'Excavadora · ID #1');
    }
    if (!this.viewAdmin?.classList.contains('d-none')) {
      await this.adminView?.openAdminView();
    }
  }

  async #sincronizarUnidadesUsuario() {
    try {
      const unidades = await api.getMisVehiculos();
      if (!this.selectVehiculo) return;
      if (!unidades || unidades.length === 0) {
        this.selectVehiculo.classList.add('d-none');
        wsManager.connect(CONFIG.VEHICLE_ID, this.#getWsAuthOpts());
        return;
      }

      this.selectVehiculo.innerHTML = '';
      unidades.forEach(u => {
        const opt = document.createElement('option');
        opt.value = String(Number(u.id_vehiculo));
        opt.dataset.nombre = `${u.nombre} · ID #${Number(u.id_vehiculo)}`;
        opt.textContent = `#${Number(u.id_vehiculo)} ${u.nombre}`;
        this.selectVehiculo.appendChild(opt);
      });
      this.selectVehiculo.classList.remove('d-none');

      const ownsCurrent = unidades.some(u => Number(u.id_vehiculo) === Number(CONFIG.VEHICLE_ID));
      const target = ownsCurrent ? unidades.find(u => Number(u.id_vehiculo) === Number(CONFIG.VEHICLE_ID)) : unidades[0];
      this.selectVehiculo.value = String(target.id_vehiculo);
      this.cambiarVehiculoActivo(Number(target.id_vehiculo), `${target.nombre} · ID #${Number(target.id_vehiculo)}`);
    } catch (err) {
      this.log(`[UNIDADES] ${err.message}`);
    }
  }

  cambiarVehiculoActivo(idVehiculo, nombre = null) {
    const targetId = Number(idVehiculo) || 1;
    const label = nombre || `Unidad · ID #${targetId}`;
    CONFIG.VEHICLE_ID = targetId;
    authStore.setActiveVehicle(targetId, label);
    if (this.txtVehiculoNombre) {
      this.txtVehiculoNombre.textContent = label;
    }
    if (this.selectVehiculo && this.selectVehiculo.querySelector(`option[value="${targetId}"]`)) {
      this.selectVehiculo.value = String(targetId);
    }
    this.log(`[UNIDAD] Cambiando canal activo a vehículo #${targetId} (${label})...`);
    this.monitoringView?.resetParaCambioVehiculo();
    wsManager.connect(targetId, this.#getWsAuthOpts());
    this.demoControl?.resetYcargarDemos();
  }

  #updateDirectionDisplay(texto, norm) {
    if (this.txtDireccion) {
      this.txtDireccion.textContent = texto;
    }
    if (this.hudDigitalCenter) {
      if (Math.abs(norm) < 0.1 || texto.includes('REPOSO') || texto.includes('RECTO')) {
        this.hudDigitalCenter.textContent = 'NEUTRO';
        this.hudDigitalCenter.className = 'digital-hud-value text-secondary';
      } else {
        this.hudDigitalCenter.textContent = texto.split(': ')[1] || texto;
        this.hudDigitalCenter.className = 'digital-hud-value text-info';
      }
    }
  }

  async ejecutarComando(idComando, origen) {
    if (this.isSending && idComando !== CONFIG.COMANDOS.DETENER) {
      return;
    }

    this.isSending = true;
    this.badgeOperacion.className = 'badge bg-warning text-dark';
    this.badgeOperacion.textContent = 'ENVIANDO...';

    try {
      this.log(`[ORDEN] #${idComando} (${origen})...`);

      // Enviar primero por canal WebSocket Seguro si está en línea (ultra-baja latencia)
      let enviadoPorWs = false;
      if (wsManager.isConnected) {
        enviadoPorWs = wsManager.send({
          tipo: 'MOVIMIENTO_INDIVIDUAL',
          id_comando: Number(idComando),
          origen: origen
        });
      }

      // Si WSS no está listo o como respaldo, enviar por REST POST a FastAPI/RDS
      if (!enviadoPorWs) {
        const resp = (authStore.getGuestToken() && !authStore.getToken())
          ? await api.postInvitadoMovimiento(idComando, origen)
          : await api.postMovimiento(idComando, origen);
        this.log(`[REST OK] Aceptado por API: ${resp.evento?.comando || 'Correcto'}`);
      } else {
        this.log(`[WSS TX] Comando #${idComando} transmitido por WebSocket`);
      }

      this.badgeOperacion.className = 'badge bg-success';
      this.badgeOperacion.textContent = 'ACTIVO';
    } catch (err) {
      this.badgeOperacion.className = 'badge bg-danger';
      this.badgeOperacion.textContent = 'ERROR';
      this.log(`[ERROR COMANDO] ${err.message}`);
      this.#showToast('Error de Comando', err.message);
    } finally {
      this.isSending = false;
    }
  }

  #setupWebSocketListeners() {
    // Sincronización en tiempo real de movimientos individuales
    wsManager.on('MOVIMIENTO_INDIVIDUAL', (data) => {
      this.log(`[WSS RX] ${data.comando} (Cód: ${data.codigo}) [${data.origen || 'EXT'}]`);
      this.badgeOperacion.className = 'badge bg-info text-dark';
      this.badgeOperacion.textContent = data.comando;
      if (this.hudDigitalCenter) {
        this.hudDigitalCenter.textContent = data.comando;
        this.hudDigitalCenter.className = 'digital-hud-value text-info';
      }
    });

    // Sincronización de estado inicial al conectar WSS
    wsManager.on('ESTADO_INICIAL', (data) => {
      const cmd = data.datos?.comando || 'REPOSO';
      this.log(`[WSS SYNC] Estado del vehículo: ${cmd}`);
      if (this.hudDigitalCenter) {
        this.hudDigitalCenter.textContent = cmd;
      }
    });

    wsManager.on('ERROR_COMANDO', (data) => {
      const detalle = data?.detalle || 'Comando rechazado por el servidor';
      this.badgeOperacion.className = 'badge bg-danger';
      this.badgeOperacion.textContent = 'ERROR';
      this.log(`[WSS ERROR COMANDO] ${detalle}`);
      this.#showToast('Error de Comando', detalle);
    });

    wsManager.on('ERROR_RDS', (data) => {
      this.log(`[RDS ERROR] ${data?.detalle || 'Fallo al consultar Amazon RDS'}`);
    });

    wsManager.on('SSL_OR_NETWORK_ERROR', (data) => {
      this.log(
        `[AVISO SSL/WSS] No se pudo abrir WebSocket (${data.url}). Si usas certificado autofirmado, abre ${data.docsUrl} en el navegador para autorizarlo y recarga.`
      );
    });

    wsManager.on('WSS_FORBIDDEN', (data) => {
      const msg = `Acceso denegado (código ${data.code}) al canal WSS de la unidad #${data.vehicleId}.`;
      this.log(`[WSS SEGURIDAD] ${msg}`);
      this.#showToast('Acceso WSS Restringido', msg);
    });
  }

  log(mensaje) {
    if (!this.terminal) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'text-light text-truncate mb-1';
    const ts = document.createElement('span');
    ts.className = 'text-secondary';
    ts.textContent = `[${time}]`;
    line.appendChild(ts);
    line.appendChild(document.createTextNode(` ${mensaje}`));
    this.terminal.appendChild(line);
    this.terminal.scrollTop = this.terminal.scrollHeight;
  }

  #showToast(title, message) {
    const titleEl = document.getElementById('toastTitle');
    const msgEl = document.getElementById('toastMessage');
    const toastEl = document.getElementById('liveToast');
    if (titleEl && msgEl && toastEl) {
      titleEl.textContent = title;
      msgEl.textContent = message;
      const toast = new bootstrap.Toast(toastEl);
      toast.show();
    }
  }
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
