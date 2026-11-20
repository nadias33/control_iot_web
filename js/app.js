import { CONFIG } from './config.js';
import { api } from './api/client.js';
import { authStore } from './api/authStore.js';
import { wsManager } from './websocket/wsManager.js';
import { StatusPanel } from './components/statusPanel.js';
import { Joystick } from './components/joystick.js';
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
    this.selectedLoginRole = 'USUARIO';

    this.joyLeft = null;
    this.joyRight = null;
    this.buttonsController = null;
    this.stopCommandId = CONFIG.COMANDOS.DETENER;
    this.syncedCommandsVehicleId = null;
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

    // 5. Instanciar DUAL JOYSTICK 360° (Chasis/Cabina Izq + Orugas/Garra Der)
    this.joyLeft = new Joystick('joyLeftZone', 'joyLeftHandle', (idCmd, nombre, dirKey) => {
      if (dirKey === 'NEUTRAL') {
        this.#updateDirectionDisplay('REPOSO (CENTRO)', 0);
        this.ejecutarComando(idCmd, 'JOYSTICK_CENTRO_DETENER');
      } else {
        this.#updateDirectionDisplay(`CHASIS: ${nombre}`, 1);
        this.ejecutarComando(idCmd, `JOY_IZQ_${nombre}`);
      }
    }, {
      UP: { id: CONFIG.COMANDOS.AVANZAR, name: 'AVANZAR' },
      DOWN: { id: CONFIG.COMANDOS.RETROCEDER, name: 'RETROCEDER' },
      LEFT: { id: CONFIG.COMANDOS.CABINA_IZQUIERDA, name: 'CABINA_IZQUIERDA' },
      RIGHT: { id: CONFIG.COMANDOS.CABINA_DERECHA, name: 'CABINA_DERECHA' }
    });

    this.joyRight = new Joystick('joyRightZone', 'joyRightHandle', (idCmd, nombre, dirKey) => {
      if (dirKey === 'NEUTRAL') {
        this.#updateDirectionDisplay('REPOSO (CENTRO)', 0);
        this.ejecutarComando(idCmd, 'JOYSTICK_CENTRO_DETENER');
      } else {
        this.#updateDirectionDisplay(`EXCAVADORA: ${nombre}`, 1);
        this.ejecutarComando(idCmd, `JOY_DER_${nombre}`);
      }
    }, {
      UP: { id: CONFIG.COMANDOS.SUBIR_GARRA, name: 'SUBIR_GARRA' },
      DOWN: { id: CONFIG.COMANDOS.BAJAR_GARRA, name: 'BAJAR_GARRA' },
      LEFT: { id: CONFIG.COMANDOS.GIRAR_IZQUIERDA, name: 'GIRAR_IZQUIERDA' },
      RIGHT: { id: CONFIG.COMANDOS.GIRAR_DERECHA, name: 'GIRAR_DERECHA' }
    });

    // 6. Switches de funciones (Luz, Música, Velocidad, Demo) y Parada de Emergencia STOP
    this.buttonsController = new ButtonsController((comandoId, nombreCmd) => {
      if (Number(comandoId) === Number(this.stopCommandId)) {
        this.joyLeft?.resetToCenter(true);
        this.joyRight?.resetToCenter(true);
        this.#updateDirectionDisplay('EMERGENCY STOP (REPOSO)', 0);
      } else {
        this.#updateDirectionDisplay(`FUNCIÓN: ${nombreCmd}`, 1);
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
      onGoToControl: () => this.tabControl?.click(),
      onOpenLogin: (role) => this.#openLoginModal(role),
      onEnterGuestMode: (alias) => this.activarModoInvitado(alias)
    });

    // Botón para limpiar logs
    if (this.btnLimpiar) {
      this.btnLimpiar.addEventListener('click', () => {
        this.terminal.innerHTML = '<div class="text-secondary small">[LOG LIMPIO]</div>';
      });
    }

    // Reintentar sincronizar catálogo de comandos si WSS entra en línea antes de completarse
    wsManager.onStatusChange((status) => {
      if (status === 'ONLINE' && this.syncedCommandsVehicleId !== Number(CONFIG.VEHICLE_ID)) {
        this.#sincronizarComandosVehiculo();
      }
    });

    this.#sincronizarComandosVehiculo();

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

    document.querySelectorAll('#loginRoleTabs [data-role-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.#selectLoginRoleTab(btn.dataset.roleTab);
      });
    });

    document.getElementById('btnConfirmGuestMode')?.addEventListener('click', async () => {
      const alias = document.getElementById('loginGuestAlias')?.value?.trim() || '';
      this.loginModal?.hide();
      await this.activarModoInvitado(alias);
    });

    this.btnAbrirLogin?.addEventListener('click', () => {
      this.#openLoginModal('USUARIO');
    });

    this.btnCerrarSesion?.addEventListener('click', async () => {
      try {
        if (authStore.getGuestToken()) {
          await this.adminView?.finalizarReservaInvitado();
        }
        if (authStore.getToken()) await api.logout();
      } catch (_) {}
      authStore.clearSession();
      this.log('[AUTH] Sesión cerrada. Modo Invitado activo.');
      await this.#onAuthChanged();
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

    authStore.onChange(() => this.#renderSessionStrip());
    this.#renderSessionStrip();
  }

  #selectLoginRoleTab(role = 'USUARIO') {
    const normalized = ['USUARIO', 'ADMINISTRADOR', 'INVITADO'].includes(role) ? role : 'USUARIO';
    this.selectedLoginRole = normalized;

    document.querySelectorAll('#loginRoleTabs [data-role-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.roleTab === normalized);
    });

    const formEl = document.getElementById('formLogin');
    const guestPane = document.getElementById('modalGuestPane');
    const hintEl = document.getElementById('loginRoleHint');
    const userInput = document.getElementById('loginUsername');
    const submitBtn = document.getElementById('btnSubmitLogin');
    const guestAliasInput = document.getElementById('loginGuestAlias');
    document.getElementById('loginErrorBox')?.classList.add('d-none');

    const roleUiConfig = {
      USUARIO: {
        isGuest: false,
        hint: 'Acceso de cliente comprador (ej. <code>comprador1</code>) para operar tus vehículos asignados y editar DEMOs.',
        placeholder: 'Ej. comprador1',
        btnText: 'Entrar como Usuario',
        btnClass: 'btn btn-info btn-sm w-100 fw-bold text-dark'
      },
      ADMINISTRADOR: {
        isGuest: false,
        hint: 'Acceso administrativo (ej. <code>admin</code>) para gestionar modelos, unidades físicas, clientes y bitácora.',
        placeholder: 'Ej. admin',
        btnText: 'Entrar como Administrador',
        btnClass: 'btn btn-warning btn-sm w-100 fw-bold text-dark'
      },
      INVITADO: {
        isGuest: true,
        hint: 'Modo exhibición pública sin contraseña para explorar el catálogo y probar unidades disponibles.',
        placeholder: '',
        btnText: '',
        btnClass: ''
      }
    };

    const cfg = roleUiConfig[normalized];
    formEl?.classList.toggle('d-none', cfg.isGuest);
    guestPane?.classList.toggle('d-none', !cfg.isGuest);
    if (hintEl) hintEl.innerHTML = cfg.hint;

    if (cfg.isGuest) {
      if (guestAliasInput) guestAliasInput.value = authStore.getGuestAlias();
    } else {
      if (userInput) userInput.placeholder = cfg.placeholder;
      if (submitBtn) {
        submitBtn.textContent = cfg.btnText;
        submitBtn.className = cfg.btnClass;
      }
    }
  }

  #openLoginModal(preferredRole = 'USUARIO') {
    this.#selectLoginRoleTab(preferredRole);
    this.loginModal?.show();
  }

  async activarModoInvitado(alias = '') {
    const hadToken = Boolean(authStore.getToken());
    if (hadToken) {
      try {
        await api.logout();
      } catch (_) {}
      authStore.clearSession();
    }
    if (alias && alias.trim()) {
      authStore.setGuestAlias(alias);
    }

    if (hadToken) {
      await this.#onAuthChanged();
    } else {
      this.#renderSessionStrip();
      this.adminView?.syncRoleVisibility();
    }

    if (this.viewAdmin?.classList.contains('d-none')) {
      this.tabAdmin?.click();
    } else {
      this.adminView?.switchSection('invitado');
    }
    this.log(`[AUTH] Modo Invitado activo (${authStore.getGuestAlias()}).`);
  }

  #renderSessionStrip() {
    const rol = authStore.getRole();
    const user = authStore.getUser();
    const guestSession = authStore.getGuestSession();
    const guestAlias = authStore.getGuestAlias();

    if (this.badgeRol) {
      this.badgeRol.textContent = rol;
      this.badgeRol.className = rol === 'ADMINISTRADOR'
        ? 'badge bg-warning text-dark text-uppercase'
        : rol === 'USUARIO'
          ? 'badge bg-info text-dark text-uppercase'
          : 'badge bg-secondary text-uppercase';
    }
    if (this.txtUsuario) {
      if (user) {
        this.txtUsuario.textContent = `${user.nombre_completo} (@${user.username})`;
      } else if (guestSession?.reserva) {
        const alias = guestSession.reserva.alias_invitado || guestAlias;
        const vehId = guestSession.unidad?.id_vehiculo || guestSession.reserva.id_vehiculo;
        this.txtUsuario.textContent = `Exhibición activa: ${alias} · unidad #${vehId}`;
      } else {
        this.txtUsuario.textContent = `Modo invitado · ${guestAlias}`;
      }
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
        this.#sincronizarComandosVehiculo();
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
    this.syncedCommandsVehicleId = null;
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
    this.#sincronizarComandosVehiculo();
  }

  async #sincronizarComandosVehiculo() {
    const targetVehicleId = Number(CONFIG.VEHICLE_ID) || 1;
    const ALIAS_MAP = {
      AVANZAR: ['AVANZAR', 'ADELANTE', 'FORWARD'],
      RETROCEDER: ['RETROCEDER', 'ATRAS', 'BACKWARD'],
      GIRAR_IZQUIERDA: ['GIRAR_IZQUIERDA', 'GIRAR_IZQ', 'TRACK_LEFT'],
      GIRAR_DERECHA: ['GIRAR_DERECHA', 'GIRAR_DER', 'TRACK_RIGHT'],
      SUBIR_GARRA: ['SUBIR_GARRA', 'UNINSTALL', 'DESCARGAR', 'SUBIR_BRAZO', 'DESENGANCHE'],
      BAJAR_GARRA: ['BAJAR_GARRA', 'DIG', 'CAVAR', 'BAJAR_BRAZO', 'EXCAVAR'],
      LUZ: ['LUZ', 'LUCES', 'LIGHT', 'LUCES_SONIDO', 'ABRIR_PALA'],
      SONIDO: ['SONIDO', 'MUSICA', 'MUSIC', 'BOCINA', 'CLAXON', 'CERRAR_PALA'],
      DETENER: ['DETENER', 'STOP', 'PARAR'],
      CABINA_IZQUIERDA: ['CABINA_IZQUIERDA', 'CABINA_IZQ', 'GIRAR_CABINA_IZQ', 'GIRAR_CABINA_IZQUIERDA', 'TURNTABLE_LEFT'],
      CABINA_DERECHA: ['CABINA_DERECHA', 'CABINA_DER', 'GIRAR_CABINA_DER', 'GIRAR_CABINA_DERECHA', 'TURNTABLE_RIGHT'],
      VELOCIDAD: ['VELOCIDAD', 'SPEED', 'LUCES_SONIDO'],
      DEMO_AUTO: ['DEMO_AUTO', 'ONE_KEY_DEMO', 'DEMO', 'AUTODEMO']
    };
    const normalizar = (texto) => String(texto || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

    try {
      const lista = await api.getComandos(targetVehicleId);
      if (targetVehicleId !== Number(CONFIG.VEHICLE_ID)) return;

      const activos = (Array.isArray(lista) ? lista : []).filter(
        c => c && (c.activo === undefined || Boolean(c.activo))
      );

      const resolvedByKey = new Map();
      const claimedIds = new Set();

      // 1. Emparejamiento exacto por nombre normalizado y alias
      Object.entries(ALIAS_MAP).forEach(([key, aliases]) => {
        const match = activos.find(c => aliases.includes(normalizar(c.nombre)));
        if (match) {
          resolvedByKey.set(key, match);
          claimedIds.add(Number(match.id_comando));
        }
      });

      // 2. Respaldo por código numérico solo para comandos no reclamados
      Object.keys(ALIAS_MAP).forEach((key) => {
        if (resolvedByKey.has(key)) return;
        const expectedCode = CONFIG.COMANDOS[key];
        if (!expectedCode) return;
        const match = activos.find(
          c => Number(c.codigo) === Number(expectedCode) && !claimedIds.has(Number(c.id_comando))
        );
        if (match) {
          resolvedByKey.set(key, match);
          claimedIds.add(Number(match.id_comando));
        }
      });

      const resolverComando = (key) => resolvedByKey.get(key) || null;

      // Sincronizar STOP y Dual Joystick con los id_comando reales en RDS
      const stopCmd = resolverComando('DETENER');
      this.stopCommandId = stopCmd ? Number(stopCmd.id_comando) : CONFIG.COMANDOS.DETENER;
      this.buttonsController?.setStopCommandId(this.stopCommandId);
      this.joyLeft?.setStopCommandId(this.stopCommandId);
      this.joyRight?.setStopCommandId(this.stopCommandId);

      const cmdAvanzar = resolverComando('AVANZAR');
      const cmdRetroceder = resolverComando('RETROCEDER');
      const cmdCabIzq = resolverComando('CABINA_IZQUIERDA');
      const cmdCabDer = resolverComando('CABINA_DERECHA');
      this.joyLeft?.setMapping({
        UP: cmdAvanzar ? { id: Number(cmdAvanzar.id_comando), name: cmdAvanzar.nombre } : { id: null, name: 'AVANZAR' },
        DOWN: cmdRetroceder ? { id: Number(cmdRetroceder.id_comando), name: cmdRetroceder.nombre } : { id: null, name: 'RETROCEDER' },
        LEFT: cmdCabIzq ? { id: Number(cmdCabIzq.id_comando), name: cmdCabIzq.nombre } : { id: null, name: 'CABINA_IZQUIERDA' },
        RIGHT: cmdCabDer ? { id: Number(cmdCabDer.id_comando), name: cmdCabDer.nombre } : { id: null, name: 'CABINA_DERECHA' }
      });

      const cmdSubirGarra = resolverComando('SUBIR_GARRA');
      const cmdBajarGarra = resolverComando('BAJAR_GARRA');
      const cmdIzq = resolverComando('GIRAR_IZQUIERDA');
      const cmdDer = resolverComando('GIRAR_DERECHA');
      this.joyRight?.setMapping({
        UP: cmdSubirGarra ? { id: Number(cmdSubirGarra.id_comando), name: cmdSubirGarra.nombre } : { id: null, name: 'SUBIR_GARRA' },
        DOWN: cmdBajarGarra ? { id: Number(cmdBajarGarra.id_comando), name: cmdBajarGarra.nombre } : { id: null, name: 'BAJAR_GARRA' },
        LEFT: cmdIzq ? { id: Number(cmdIzq.id_comando), name: cmdIzq.nombre } : { id: null, name: 'GIRAR_IZQUIERDA' },
        RIGHT: cmdDer ? { id: Number(cmdDer.id_comando), name: cmdDer.nombre } : { id: null, name: 'GIRAR_DERECHA' }
      });

      const usedIds = new Set(
        [stopCmd, cmdAvanzar, cmdRetroceder, cmdCabIzq, cmdCabDer, cmdSubirGarra, cmdBajarGarra, cmdIzq, cmdDer]
          .filter(Boolean)
          .map(c => Number(c.id_comando))
      );

      // Sincronizar switches de función (.btn-cmd[data-cmd-key])
      document.querySelectorAll('#viewControl .btn-cmd[data-cmd-key]').forEach((btn) => {
        const key = btn.dataset.cmdKey;
        const match = resolverComando(key);
        if (match) {
          btn.disabled = false;
          btn.dataset.codigo = String(match.id_comando);
          btn.dataset.nombre = match.nombre;
          btn.title = `${match.nombre} (Cód: ${match.codigo})`;
          usedIds.add(Number(match.id_comando));
        } else {
          btn.disabled = true;
          btn.title = `Comando ${key} no disponible en unidad #${targetVehicleId}`;
        }
      });

      // Renderizar comandos adicionales propios del vehículo si existen en RDS
      const extraRow = document.getElementById('excavatorExtraRow');
      if (extraRow) {
        extraRow.querySelectorAll('.dynamic-cmd-btn').forEach(el => el.remove());
        const extras = activos.filter(c => !usedIds.has(Number(c.id_comando)));
        extraRow.classList.toggle('d-none', extras.length === 0);
        extras.forEach((extra) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'excavator-btn excavator-btn-aux dynamic-cmd-btn btn-cmd';
          btn.dataset.codigo = String(extra.id_comando);
          btn.dataset.nombre = extra.nombre;
          btn.title = `${extra.nombre} (Cód: ${extra.codigo})`;

          const icon = document.createElement('i');
          icon.className = 'bi bi-lightning-charge-fill';
          const labelSpan = document.createElement('span');
          labelSpan.textContent = extra.nombre;

          btn.appendChild(icon);
          btn.appendChild(labelSpan);
          extraRow.appendChild(btn);
        });
      }

      const badgeCount = document.getElementById('badgeMovimientosCount');
      if (badgeCount) {
        badgeCount.textContent = (activos.length === 13 && stopCmd)
          ? '12 mov. + STOP'
          : `${activos.length} cmds RDS`;
      }

      this.syncedCommandsVehicleId = targetVehicleId;
      this.log(`[CONTROL] ${activos.length} movimientos sincronizados desde RDS para vehículo #${targetVehicleId}.`);
    } catch (err) {
      this.log(`[CONTROL] Mapeo local de respaldo activo (${err.message}).`);
    }
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
    if (this.isSending && Number(idComando) !== Number(this.stopCommandId)) {
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
        this.monitoringView?.sincronizarTodo();
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
