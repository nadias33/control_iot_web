import { api } from '../api/client.js';
import { authStore } from '../api/authStore.js';
import { wsManager } from '../websocket/wsManager.js';

export class AdminView {
  constructor({ onLog, onSelectVehicle, onDemosChanged, onGoToControl }) {
    this.onLog = onLog || (() => {});
    this.onSelectVehicle = onSelectVehicle || (() => {});
    this.onDemosChanged = onDemosChanged || (() => {});
    this.onGoToControl = onGoToControl || (() => {});

    this.alertBox = document.getElementById('adminAlertBox');
    this.subButtons = document.querySelectorAll('#adminRoleSubnav .admin-tab-btn');
    this.panels = {
      invitado: document.getElementById('panelInvitado'),
      usuario: document.getElementById('panelUsuario'),
      admin: document.getElementById('panelAdmin')
    };

    // Invitado
    this.invCatalogoGrid = document.getElementById('invCatalogoGrid');
    this.invReservaBox = document.getElementById('invReservaActivaBox');
    this.invReservaTitulo = document.getElementById('invReservaTitulo');
    this.invCountdown = document.getElementById('invCountdown');
    this.invComandosTxt = document.getElementById('invComandosPermitidosTxt');
    this.guestTimerId = null;

    // Usuario + Editor Demos
    this.usrVehiculosList = document.getElementById('usrMisVehiculosList');
    this.editDemoVehiculo = document.getElementById('editDemoVehiculo');
    this.stepComandoSelect = document.getElementById('stepComandoSelect');
    this.demoPasosLista = document.getElementById('demoPasosLista');
    this.badgeDemoTotal = document.getElementById('badgeDemoTotalDuracion');
    this.usrDemosBody = document.getElementById('usrDemosTableBody');
    this.editorPasos = [];
    this.comandosCache = new Map();

    // Admin
    this.crudTabs = document.querySelectorAll('#adminCrudTabs button[data-crud]');
    this.crudPanels = {
      dashboard: document.getElementById('crudDashboard'),
      modelos: document.getElementById('crudModelos'),
      unidades: document.getElementById('crudUnidades'),
      clientes: document.getElementById('crudClientes'),
      auditoria: document.getElementById('crudAuditoria')
    };

    this.activeSection = 'invitado';
    this.activeCrud = 'dashboard';
    this.modelosCache = [];
    this.unidadesCache = [];
    this.clientesCache = [];
    this.selectedModeloCmdId = null;
    this.#init();
  }

  #esc(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  #showAlert(msg, type = 'warning') {
    if (!this.alertBox) return;
    if (!msg) {
      this.alertBox.classList.add('d-none');
      return;
    }
    this.alertBox.className = `alert alert-${type} py-1 px-2 mb-2 small`;
    this.alertBox.textContent = msg;
    this.alertBox.classList.remove('d-none');
  }

  #init() {
    // Subnavegación de secciones (Exhibición / Mis Vehículos / Gestión Comercial)
    this.subButtons.forEach(btn => {
      btn.addEventListener('click', () => this.switchSection(btn.dataset.section));
    });

    // Subtabs CRUD Admin
    this.crudTabs.forEach(btn => {
      btn.addEventListener('click', () => this.#switchCrudTab(btn.dataset.crud));
    });

    // Botones de Invitado
    document.getElementById('btnRefrescarCatalogo')?.addEventListener('click', () => this.cargarCatalogoPublico());
    document.getElementById('btnInvIrControl')?.addEventListener('click', () => this.onGoToControl());
    document.getElementById('btnInvStop')?.addEventListener('click', async () => {
      try {
        await api.postInvitadoMovimiento(9, 'INVITADO_STOP');
        this.onLog('[INVITADO] Parada segura DETENER enviada.');
      } catch (err) {
        this.#showAlert(err.message, 'danger');
      }
    });
    document.getElementById('btnInvFinalizar')?.addEventListener('click', () => this.finalizarReservaInvitado());

    wsManager.on('INVITADO_SESION_EXPIRADA', () => {
      this.#stopGuestTimer();
      authStore.clearGuestSession();
      this.#renderReservaActiva();
      this.#showAlert('Tu tiempo de prueba en exhibición finalizó y el vehículo fue detenido con seguridad.', 'info');
      this.onLog('[INVITADO] Sesión temporal expirada en servidor.');
      this.cargarCatalogoPublico();
    });

    // Mis vehículos y Editor de Demos
    document.getElementById('btnRefrescarMisVehiculos')?.addEventListener('click', () => this.cargarSeccionUsuario());
    this.editDemoVehiculo?.addEventListener('change', () => this.#cargarComandosUnidadEditor());
    document.getElementById('btnAgregarPasoDemo')?.addEventListener('click', () => this.#agregarPasoEditor());
    document.getElementById('btnNuevaDemo')?.addEventListener('click', () => this.#resetEditorDemo());
    document.getElementById('btnCancelarEdicionDemo')?.addEventListener('click', () => this.#resetEditorDemo());
    document.getElementById('formDemoEditor')?.addEventListener('submit', (e) => this.#guardarDemoEditor(e));

    // Formularios Admin (Modelos, Comandos de Modelo, Unidades, Clientes, Asignaciones, Auditoría)
    document.getElementById('formAdminModelo')?.addEventListener('submit', (e) => this.#guardarModelo(e));
    document.getElementById('btnCancelarModelo')?.addEventListener('click', () => this.#resetModeloForm());
    document.getElementById('btnCerrarModeloComandos')?.addEventListener('click', () => {
      document.getElementById('panelModeloComandos')?.classList.add('d-none');
      this.selectedModeloCmdId = null;
    });
    document.getElementById('btnGuardarModeloComandos')?.addEventListener('click', () => this.#guardarModeloComandos());

    document.getElementById('formAdminUnidad')?.addEventListener('submit', (e) => this.#guardarUnidad(e));
    document.getElementById('btnCancelarUnidad')?.addEventListener('click', () => this.#resetUnidadForm());
    document.getElementById('btnBuscarUnidades')?.addEventListener('click', () => this.#cargarUnidadesAdmin());
    document.getElementById('uniEstadoFilter')?.addEventListener('change', () => this.#cargarUnidadesAdmin());

    document.getElementById('formAdminCliente')?.addEventListener('submit', (e) => this.#guardarCliente(e));
    document.getElementById('btnCancelarCliente')?.addEventListener('click', () => this.#resetClienteForm());
    document.getElementById('btnBuscarClientes')?.addEventListener('click', () => this.#cargarClientesAdmin());
    document.getElementById('formAdminAsignacion')?.addEventListener('submit', (e) => this.#asignarUnidad(e));
    document.getElementById('btnRefrescarAuditoria')?.addEventListener('click', () => this.#cargarAuditoria());

    document.querySelectorAll('.btn-quick-crud').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.crud === 'demos') {
          this.switchSection('usuario');
        } else {
          this.#switchCrudTab(btn.dataset.crud);
        }
      });
    });

    this.syncRoleVisibility();
  }

  syncRoleVisibility() {
    const rol = authStore.getRole();
    const btnInv = document.getElementById('btnSubInvitado');
    const btnUsr = document.getElementById('btnSubUsuario');
    const btnAdm = document.getElementById('btnSubAdmin');
    const tipoWrap = document.getElementById('editDemoTipoWrapper');
    if (tipoWrap) {
      tipoWrap.classList.toggle('d-none', rol !== 'ADMINISTRADOR');
    }

    if (rol === 'ADMINISTRADOR') {
      btnInv?.classList.remove('d-none');
      btnUsr?.classList.remove('d-none');
      btnAdm?.classList.remove('d-none');
      this.switchSection('admin', false);
    } else if (rol === 'USUARIO') {
      btnInv?.classList.remove('d-none');
      btnUsr?.classList.remove('d-none');
      btnAdm?.classList.add('d-none');
      this.switchSection('usuario', false);
    } else {
      btnInv?.classList.remove('d-none');
      btnUsr?.classList.add('d-none');
      btnAdm?.classList.add('d-none');
      this.switchSection('invitado', false);
    }
    this.#renderReservaActiva();
  }

  async openAdminView() {
    this.#showAlert('');
    this.syncRoleVisibility();
    await this.refreshActiveSection();
  }

  switchSection(section, refresh = true) {
    if (!this.panels[section]) return;
    this.activeSection = section;
    this.subButtons.forEach(b => b.classList.toggle('active', b.dataset.section === section));
    Object.entries(this.panels).forEach(([key, el]) => {
      el?.classList.toggle('d-none', key !== section);
    });
    if (refresh) {
      this.refreshActiveSection();
    }
  }

  async refreshActiveSection() {
    this.#showAlert('');
    if (this.activeSection === 'invitado') {
      await this.cargarCatalogoPublico();
    } else if (this.activeSection === 'usuario') {
      await this.cargarSeccionUsuario();
    } else if (this.activeSection === 'admin') {
      await this.#cargarCrudActual();
    }
  }

  #switchCrudTab(crud) {
    if (crud === 'demos') {
      this.switchSection('usuario');
      return;
    }
    if (!this.crudPanels[crud]) return;
    this.activeCrud = crud;
    this.crudTabs.forEach(b => b.classList.toggle('active', b.dataset.crud === crud));
    Object.entries(this.crudPanels).forEach(([key, el]) => {
      el?.classList.toggle('d-none', key !== crud);
    });
    this.#cargarCrudActual();
  }

  async #cargarCrudActual() {
    if (authStore.getRole() !== 'ADMINISTRADOR') return;
    try {
      if (this.activeCrud === 'dashboard') {
        await this.#cargarDashboard();
      } else if (this.activeCrud === 'modelos') {
        await this.#cargarModelosAdmin();
      } else if (this.activeCrud === 'unidades') {
        await Promise.all([this.#cargarModelosSelect(), this.#cargarUnidadesAdmin()]);
      } else if (this.activeCrud === 'clientes') {
        await Promise.all([this.#cargarClientesAdmin(), this.#cargarSelectsAsignacion()]);
      } else if (this.activeCrud === 'auditoria') {
        await this.#cargarAuditoria();
      }
    } catch (err) {
      this.#showAlert(err.message, 'danger');
      this.onLog(`[ADMIN ERROR] ${err.message}`);
    }
  }

  // ==========================================
  // SECCIÓN INVITADO
  // ==========================================
  async cargarCatalogoPublico() {
    if (!this.invCatalogoGrid) return;
    this.invCatalogoGrid.innerHTML = '<div class="col-12 text-center text-secondary small py-2">Consultando catálogo en RDS...</div>';
    try {
      const cat = await api.getInvitadoCatalogo();
      this.#renderReservaActiva();
      const modelos = cat.modelos || [];
      const unidades = cat.unidades_exhibicion || [];

      if (modelos.length === 0 && unidades.length === 0) {
        this.invCatalogoGrid.innerHTML = '<div class="col-12 text-center text-secondary small py-2">Sin modelos disponibles actualmente.</div>';
        return;
      }

      const htmlModelos = modelos.map(m => `
        <div class="col-12 col-sm-6">
          <div class="p-2 rounded border border-secondary border-opacity-25 bg-dark bg-opacity-50 h-100">
            <div class="d-flex justify-content-between align-items-center">
              <strong class="text-info small">${this.#esc(m.nombre_modelo)}</strong>
              <span class="badge bg-black border border-secondary text-secondary font-monospace" style="font-size:0.6rem;">${this.#esc(m.codigo_modelo)}</span>
            </div>
            <p class="text-secondary mb-0 mt-1" style="font-size:0.68rem;">${this.#esc(m.descripcion || 'Vehículo IoT teledirigido.')}</p>
          </div>
        </div>
      `).join('');

      const htmlExhibicion = unidades.length === 0
        ? '<div class="col-12 text-secondary small">No hay unidades físicas marcadas en exhibición en este momento.</div>'
        : unidades.map(u => {
            const ocupada = Boolean(u.ocupada_exhibicion);
            return `
              <div class="col-12">
                <div class="p-2 rounded border ${ocupada ? 'border-warning' : 'border-info'} border-opacity-50 bg-black bg-opacity-50 d-flex justify-content-between align-items-center gap-2">
                  <div>
                    <div class="fw-bold text-light small">${this.#esc(u.nombre)} <span class="text-secondary">(${this.#esc(u.nombre_modelo)})</span></div>
                    <span class="badge ${ocupada ? 'bg-warning text-dark' : 'bg-success'}">${ocupada ? 'Ocupada por otro invitado' : 'Disponible para prueba'}</span>
                  </div>
                  <button class="btn btn-sm ${ocupada ? 'btn-outline-secondary' : 'btn-info fw-bold text-dark'} btn-reservar-inv"
                          data-id="${Number(u.id_vehiculo)}" data-nombre="${this.#esc(u.nombre)}" ${ocupada ? 'disabled' : ''}>
                    <i class="bi bi-play-circle me-1"></i>Probar (120s)
                  </button>
                </div>
              </div>
            `;
          }).join('');

      this.invCatalogoGrid.innerHTML = `${htmlModelos}<div class="col-12 mt-2"><small class="text-uppercase text-secondary fw-bold" style="font-size:0.64rem;">Unidades físicas en exhibición</small></div>${htmlExhibicion}`;

      this.invCatalogoGrid.querySelectorAll('.btn-reservar-inv').forEach(btn => {
        btn.addEventListener('click', () => this.#solicitarReservaInvitado(Number(btn.dataset.id), btn.dataset.nombre));
      });
    } catch (err) {
      this.invCatalogoGrid.innerHTML = `<div class="col-12 text-danger small">${this.#esc(err.message)}</div>`;
    }
  }

  async #solicitarReservaInvitado(idVehiculo, nombreUnidad) {
    try {
      this.#showAlert('');
      const resp = await api.createInvitadoReserva({
        id_vehiculo: idVehiculo,
        alias_invitado: 'Invitado Web',
        duracion_segundos: 120
      });
      authStore.setGuestSession(resp);
      this.#renderReservaActiva();
      this.onSelectVehicle(idVehiculo, `${nombreUnidad} (Exhibición)`);
      this.onLog(`[INVITADO] Reserva temporal asignada sobre unidad #${idVehiculo} (120s).`);
      await this.cargarCatalogoPublico();
    } catch (err) {
      this.#showAlert(err.message, 'danger');
      await this.cargarCatalogoPublico();
    }
  }

  async finalizarReservaInvitado() {
    this.#stopGuestTimer();
    try {
      if (authStore.getGuestToken()) {
        await api.finalizarInvitadoReserva();
      }
      this.onLog('[INVITADO] Reserva temporal liberada y vehículo detenido.');
    } catch (err) {
      this.onLog(`[INVITADO WARN] ${err.message}`);
    } finally {
      authStore.clearGuestSession();
      this.#renderReservaActiva();
      await this.cargarCatalogoPublico();
    }
  }

  #renderReservaActiva() {
    if (!this.invReservaBox) return;
    const gs = authStore.getGuestSession();
    if (!gs || !gs.reserva) {
      this.invReservaBox.classList.add('d-none');
      this.#stopGuestTimer();
      return;
    }

    this.invReservaBox.classList.remove('d-none');
    this.invReservaTitulo.textContent = `Unidad reservada: ${gs.unidad?.nombre || 'Exhibición #' + gs.reserva.id_vehiculo}`;
    const nombresCmds = (gs.comandos_permitidos || []).map(c => c.nombre).join(', ');
    this.invComandosTxt.textContent = `Comandos permitidos: ${nombresCmds || 'Tracción, Giro y DETENER'}`;

    const expDate = new Date(String(gs.reserva.fecha_expiracion).replace(' ', 'T'));
    const fallbackEnd = Date.now() + (Number(gs.reserva.segundos_restantes || 120) * 1000);
    const endMs = isNaN(expDate.getTime()) ? fallbackEnd : Math.min(expDate.getTime(), fallbackEnd);
    this.#startGuestTimer(endMs);
  }

  #startGuestTimer(endMs) {
    this.#stopGuestTimer();
    const tick = () => {
      const rest = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
      if (this.invCountdown) {
        this.invCountdown.textContent = `${rest} s`;
      }
      if (rest <= 0) {
        this.#stopGuestTimer();
        authStore.clearGuestSession();
        this.#renderReservaActiva();
        this.cargarCatalogoPublico();
      }
    };
    tick();
    this.guestTimerId = setInterval(tick, 1000);
  }

  #stopGuestTimer() {
    if (this.guestTimerId) {
      clearInterval(this.guestTimerId);
      this.guestTimerId = null;
    }
  }

  // ==========================================
  // SECCIÓN USUARIO: MIS VEHÍCULOS Y EDITOR DE DEMOS
  // ==========================================
  async cargarSeccionUsuario() {
    if (!authStore.getToken()) return;
    try {
      const unidades = await api.getMisVehiculos();
      this.#renderMisVehiculos(unidades);
      await this.#cargarDemosEditorTabla();
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  #renderMisVehiculos(unidades) {
    if (!this.usrVehiculosList || !this.editDemoVehiculo) return;
    if (!unidades || unidades.length === 0) {
      this.usrVehiculosList.innerHTML = '<div class="text-secondary small">No tienes unidades físicas asignadas todavía.</div>';
      this.editDemoVehiculo.innerHTML = '<option value="">Sin unidades</option>';
      return;
    }

    this.usrVehiculosList.innerHTML = unidades.map(u => {
      const isOwner = authStore.getRole() === 'USUARIO';
      return `
        <div class="p-2 rounded border border-secondary border-opacity-50 bg-dark bg-opacity-50 d-flex flex-column gap-1">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong class="text-light small">${this.#esc(u.nombre)}</strong>
              <span class="badge bg-info bg-opacity-25 text-info font-monospace ms-1">${this.#esc(u.numero_serie || 'ID #' + u.id_vehiculo)}</span>
            </div>
            <button class="btn btn-info btn-sm py-0 px-2 fw-bold text-dark btn-usar-unidad"
                    data-id="${Number(u.id_vehiculo)}" data-nombre="${this.#esc(u.nombre)}">
              Operar
            </button>
          </div>
          <div class="d-flex justify-content-between align-items-center text-secondary" style="font-size:0.68rem;">
            <span>Modelo: ${this.#esc(u.nombre_modelo)} · Estado: ${this.#esc(u.estado_comercial)}</span>
            ${isOwner ? `
              <label class="form-check form-switch mb-0">
                <input class="form-check-input chk-soporte" type="checkbox" data-id="${Number(u.id_vehiculo)}" ${u.soporte_autorizado ? 'checked' : ''}>
                <span class="form-check-label text-warning">Soporte Admin</span>
              </label>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.usrVehiculosList.querySelectorAll('.btn-usar-unidad').forEach(btn => {
      btn.addEventListener('click', () => {
        this.onSelectVehicle(Number(btn.dataset.id), btn.dataset.nombre);
        this.onGoToControl();
      });
    });

    this.usrVehiculosList.querySelectorAll('.chk-soporte').forEach(chk => {
      chk.addEventListener('change', async () => {
        try {
          await api.setSoporteAutorizado(Number(chk.dataset.id), chk.checked, 'Autorización desde Mis Vehículos');
          this.onLog(`[SOPORTE] Consentimiento Admin actualizado para unidad #${chk.dataset.id}: ${chk.checked}`);
        } catch (err) {
          chk.checked = !chk.checked;
          this.#showAlert(err.message, 'danger');
        }
      });
    });

    this.editDemoVehiculo.innerHTML = unidades.map(u =>
      `<option value="${Number(u.id_vehiculo)}">${this.#esc(u.nombre)} (#${Number(u.id_vehiculo)})</option>`
    ).join('');
    this.#cargarComandosUnidadEditor();
  }

  async #cargarComandosUnidadEditor() {
    const idVehiculo = Number(this.editDemoVehiculo?.value);
    if (!idVehiculo || !this.stepComandoSelect) return;
    try {
      let cmds = this.comandosCache.get(idVehiculo);
      if (!cmds) {
        cmds = await api.getComandos(idVehiculo);
        this.comandosCache.set(idVehiculo, cmds);
      }
      const activos = (cmds || []).filter(c => c.activo);
      this.stepComandoSelect.innerHTML = activos.map(c =>
        `<option value="${Number(c.id_comando)}" data-nombre="${this.#esc(c.nombre)}">${this.#esc(c.nombre)} (Cód ${Number(c.codigo)})</option>`
      ).join('');
    } catch (err) {
      this.stepComandoSelect.innerHTML = '<option value="">Sin comandos</option>';
    }
  }

  #agregarPasoEditor() {
    const opt = this.stepComandoSelect?.selectedOptions?.[0];
    if (!opt || !opt.value) return;
    if (this.editorPasos.length >= 20) {
      this.#showAlert('Máximo 20 pasos por DEMO por seguridad física.', 'warning');
      return;
    }
    const duracion = Math.max(100, Math.min(5000, Number(document.getElementById('stepDuracionMs')?.value) || 800));
    const pausa = Math.max(0, Math.min(3000, Number(document.getElementById('stepPausaMs')?.value) || 0));

    this.editorPasos.push({
      id_comando: Number(opt.value),
      nombre: opt.dataset.nombre || opt.textContent,
      duracion_ms: duracion,
      pausa_ms: pausa
    });
    this.#renderPasosEditor();
  }

  #renderPasosEditor() {
    if (!this.demoPasosLista) return;
    let totalMs = 0;
    this.editorPasos.forEach(p => { totalMs += p.duracion_ms + p.pausa_ms; });
    if (this.badgeDemoTotal) {
      this.badgeDemoTotal.textContent = `Total: ${totalMs} ms`;
      this.badgeDemoTotal.className = totalMs > 60000
        ? 'badge bg-danger text-white font-monospace'
        : 'badge bg-dark border border-info text-info font-monospace';
    }

    if (this.editorPasos.length === 0) {
      this.demoPasosLista.innerHTML = '<div class="text-secondary small text-center py-2">Sin pasos agregados</div>';
      return;
    }

    this.demoPasosLista.innerHTML = this.editorPasos.map((p, idx) => `
      <div class="d-flex justify-content-between align-items-center px-2 py-1 rounded bg-black border border-secondary border-opacity-25 small">
        <span class="text-light text-truncate">
          <strong class="text-info">#${idx + 1}</strong> ${this.#esc(p.nombre)}
          <span class="text-secondary font-monospace">(${p.duracion_ms}ms + ${p.pausa_ms}ms)</span>
        </span>
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary py-0 px-1 btn-step-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="btn btn-outline-secondary py-0 px-1 btn-step-down" data-idx="${idx}" ${idx === this.editorPasos.length - 1 ? 'disabled' : ''}>▼</button>
          <button type="button" class="btn btn-outline-danger py-0 px-1 btn-step-del" data-idx="${idx}">×</button>
        </div>
      </div>
    `).join('');

    this.demoPasosLista.querySelectorAll('.btn-step-up').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.idx);
      [this.editorPasos[i - 1], this.editorPasos[i]] = [this.editorPasos[i], this.editorPasos[i - 1]];
      this.#renderPasosEditor();
    }));
    this.demoPasosLista.querySelectorAll('.btn-step-down').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.idx);
      [this.editorPasos[i + 1], this.editorPasos[i]] = [this.editorPasos[i], this.editorPasos[i + 1]];
      this.#renderPasosEditor();
    }));
    this.demoPasosLista.querySelectorAll('.btn-step-del').forEach(b => b.addEventListener('click', () => {
      this.editorPasos.splice(Number(b.dataset.idx), 1);
      this.#renderPasosEditor();
    }));
  }

  #resetEditorDemo() {
    document.getElementById('editDemoId').value = '';
    document.getElementById('editDemoNombre').value = '';
    document.getElementById('editDemoDesc').value = '';
    this.editorPasos = [];
    this.#renderPasosEditor();
  }

  async #guardarDemoEditor(e) {
    e.preventDefault();
    if (this.editorPasos.length === 0) {
      this.#showAlert('Agrega al menos un movimiento a la DEMO antes de guardar.', 'warning');
      return;
    }

    const idDemo = document.getElementById('editDemoId').value;
    const pasosPayload = this.editorPasos.map((p, i) => ({
      id_comando: p.id_comando,
      orden: i + 1,
      duracion_ms: p.duracion_ms,
      pausa_ms: p.pausa_ms
    }));

    try {
      this.#showAlert('');
      if (idDemo) {
        await api.updateDemoEditor(Number(idDemo), {
          nombre: document.getElementById('editDemoNombre').value.trim(),
          descripcion: document.getElementById('editDemoDesc').value.trim(),
          activo: true,
          pasos: pasosPayload
        });
        this.onLog(`[DEMO EDITOR] DEMO #${idDemo} actualizada en RDS.`);
      } else {
        const selectTipo = document.getElementById('editDemoTipo');
        const tipo = (authStore.getRole() === 'ADMINISTRADOR' && selectTipo)
          ? selectTipo.value
          : 'PRIVADA_USUARIO';
        await api.createDemoEditor({
          id_vehiculo: Number(this.editDemoVehiculo.value),
          nombre: document.getElementById('editDemoNombre').value.trim(),
          descripcion: document.getElementById('editDemoDesc').value.trim(),
          tipo_demo: tipo,
          pasos: pasosPayload
        });
        this.onLog('[DEMO EDITOR] Nueva DEMO guardada en RDS.');
      }
      this.#resetEditorDemo();
      await this.#cargarDemosEditorTabla();
      this.onDemosChanged();
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  async #cargarDemosEditorTabla() {
    if (!this.usrDemosBody) return;
    try {
      const demos = await api.getDemosEditor();
      if (!demos || demos.length === 0) {
        this.usrDemosBody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary">Sin DEMOs registradas</td></tr>';
        return;
      }
      const userId = authStore.getUser()?.id_usuario;
      const isAdmin = authStore.getRole() === 'ADMINISTRADOR';
      this.usrDemosBody.innerHTML = demos.map(d => {
        const editable = isAdmin || (d.tipo_demo === 'PRIVADA_USUARIO' && Number(d.id_creador) === Number(userId));
        return `
          <tr>
            <td class="fw-semibold text-light">${this.#esc(d.nombre)}</td>
            <td><span class="badge ${d.tipo_demo === 'FABRICA' ? 'bg-primary' : 'bg-info text-dark'}">${this.#esc(d.tipo_demo)}</span></td>
            <td>${this.#esc(d.nombre_vehiculo)}</td>
            <td class="text-end">
              ${editable ? `
                <button class="btn btn-outline-warning btn-sm py-0 px-1 btn-edit-demo" data-id="${Number(d.id_demo)}">Editar</button>
                <button class="btn btn-outline-danger btn-sm py-0 px-1 btn-del-demo" data-id="${Number(d.id_demo)}">×</button>
              ` : '<span class="text-secondary small">Solo lectura</span>'}
            </td>
          </tr>
        `;
      }).join('');

      this.usrDemosBody.querySelectorAll('.btn-edit-demo').forEach(btn => {
        btn.addEventListener('click', () => this.#cargarDemoEnFormulario(Number(btn.dataset.id)));
      });
      this.usrDemosBody.querySelectorAll('.btn-del-demo').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api.deleteDemoEditor(Number(btn.dataset.id));
            await this.#cargarDemosEditorTabla();
            this.onDemosChanged();
          } catch (err) {
            this.#showAlert(err.message, 'danger');
          }
        });
      });
    } catch (err) {
      this.usrDemosBody.innerHTML = `<tr><td colspan="4" class="text-danger">${this.#esc(err.message)}</td></tr>`;
    }
  }

  async #cargarDemoEnFormulario(idDemo) {
    try {
      const det = await api.getDemoEditorDetalle(idDemo);
      document.getElementById('editDemoId').value = det.id_demo;
      this.editDemoVehiculo.value = det.id_vehiculo;
      await this.#cargarComandosUnidadEditor();
      document.getElementById('editDemoNombre').value = det.nombre;
      document.getElementById('editDemoDesc').value = det.descripcion || '';
      this.editorPasos = (det.pasos || []).map(p => ({
        id_comando: Number(p.id_comando),
        nombre: p.comando || `CMD #${p.id_comando}`,
        duracion_ms: Number(p.duracion_ms),
        pausa_ms: Number(p.pausa_ms || 0)
      }));
      this.#renderPasosEditor();
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  // ==========================================
  // SECCIÓN ADMINISTRADOR COMERCIAL
  // ==========================================
  async #cargarDashboard() {
    const grid = document.getElementById('adminMetricsGrid');
    const tbody = document.getElementById('dashUnidadesResumenBody');
    if (!grid) return;
    const [resp, unidades] = await Promise.all([api.getAdminDashboard(), api.getAdminUnidades()]);
    const m = resp.metricas || {};
    const cards = [
      { label: 'Modelos', val: m.total_modelos ?? 'Sin datos', color: 'text-info' },
      { label: 'Unidades', val: m.total_unidades ?? 'Sin datos', color: 'text-light' },
      { label: 'Vendidas', val: m.unidades_vendidas ?? 'Sin datos', color: 'text-success' },
      { label: 'Exhibición', val: m.unidades_exhibicion ?? 'Sin datos', color: 'text-warning' },
      { label: 'Disponibles', val: m.unidades_disponibles ?? 'Sin datos', color: 'text-primary' },
      { label: 'Clientes', val: m.total_clientes ?? 'Sin datos', color: 'text-info' },
      { label: 'DEMOs', val: m.total_demos ?? 'Sin datos', color: 'text-light' },
      { label: 'Invitados Activos', val: m.sesiones_invitado_activas ?? 'Sin datos', color: 'text-warning' }
    ];
    grid.innerHTML = cards.map(c => `
      <div class="col-6 col-sm-3">
        <div class="metric-tile">
          <div class="fw-bold fs-5 ${c.color}">${this.#esc(c.val)}</div>
          <div class="text-secondary" style="font-size:0.65rem;">${this.#esc(c.label)}</div>
        </div>
      </div>
    `).join('');

    if (tbody) {
      tbody.innerHTML = !unidades || unidades.length === 0
        ? '<tr><td colspan="6" class="text-center text-secondary">Sin unidades registradas</td></tr>'
        : unidades.slice(0, 8).map(u => {
            const wssTxt = u.clientes_wss > 0
              ? `<span class="badge bg-success">${Number(u.clientes_wss)} WSS</span>`
              : '<span class="text-secondary">Sin verificar</span>';
            return `
              <tr>
                <td class="font-monospace">#${Number(u.id_vehiculo)}</td>
                <td>${this.#esc(u.nombre)} <small class="text-secondary">(${this.#esc(u.numero_serie || 'S/N')})</small></td>
                <td>${this.#esc(u.nombre_modelo)}</td>
                <td><span class="badge bg-secondary">${this.#esc(u.estado_comercial)}</span></td>
                <td>${this.#esc(u.propietario_username || 'Empresa')}</td>
                <td>${wssTxt}</td>
              </tr>
            `;
          }).join('');
    }
  }

  async #cargarModelosSelect() {
    const sel = document.getElementById('uniModeloId');
    if (!sel) return;
    const modelos = await api.getAdminModelos();
    sel.innerHTML = modelos.map(m =>
      `<option value="${Number(m.id_modelo)}">${this.#esc(m.nombre_modelo)} (${this.#esc(m.codigo_modelo)})</option>`
    ).join('');
  }

  #resetModeloForm() {
    document.getElementById('modId').value = '';
    document.getElementById('modCodigo').value = '';
    document.getElementById('modNombre').value = '';
    document.getElementById('modDesc').value = '';
    document.getElementById('modActivo').checked = true;
    document.getElementById('modFormTitulo').textContent = 'Registrar Modelo Comercial';
    document.getElementById('btnCancelarModelo')?.classList.add('d-none');
  }

  async #cargarModelosAdmin() {
    const tbody = document.getElementById('adminModelosBody');
    if (!tbody) return;
    const modelos = await api.getAdminModelos();
    this.modelosCache = modelos || [];
    tbody.innerHTML = this.modelosCache.length === 0
      ? '<tr><td colspan="5" class="text-center text-secondary">Sin modelos</td></tr>'
      : this.modelosCache.map(m => `
        <tr>
          <td class="font-monospace text-info">${this.#esc(m.codigo_modelo)}</td>
          <td>
            <div class="text-light fw-semibold">${this.#esc(m.nombre_modelo)}</div>
            <small class="text-secondary">${m.activo ? 'Activo' : 'Inactivo'}</small>
          </td>
          <td>${Number(m.total_unidades || 0)}</td>
          <td>${Number(m.total_comandos || 0)}</td>
          <td class="text-end">
            <button type="button" class="btn btn-outline-info btn-sm py-0 px-1 btn-edit-mod" data-id="${Number(m.id_modelo)}">Editar</button>
            <button type="button" class="btn btn-outline-warning btn-sm py-0 px-1 btn-cmds-mod" data-id="${Number(m.id_modelo)}">Comandos</button>
          </td>
        </tr>
      `).join('');

    tbody.querySelectorAll('.btn-edit-mod').forEach(btn => {
      btn.addEventListener('click', () => {
        const mod = this.modelosCache.find(x => Number(x.id_modelo) === Number(btn.dataset.id));
        if (!mod) return;
        document.getElementById('modId').value = mod.id_modelo;
        document.getElementById('modCodigo').value = mod.codigo_modelo;
        document.getElementById('modNombre').value = mod.nombre_modelo;
        document.getElementById('modDesc').value = mod.descripcion || '';
        document.getElementById('modActivo').checked = Boolean(mod.activo);
        document.getElementById('modFormTitulo').textContent = `Editando Modelo #${mod.id_modelo}`;
        document.getElementById('btnCancelarModelo')?.classList.remove('d-none');
      });
    });

    tbody.querySelectorAll('.btn-cmds-mod').forEach(btn => {
      btn.addEventListener('click', () => {
        const mod = this.modelosCache.find(x => Number(x.id_modelo) === Number(btn.dataset.id));
        if (mod) this.#abrirConfigComandosModelo(mod);
      });
    });
  }

  #abrirConfigComandosModelo(mod) {
    this.selectedModeloCmdId = Number(mod.id_modelo);
    const panel = document.getElementById('panelModeloComandos');
    const tbody = document.getElementById('adminModeloComandosBody');
    const title = document.getElementById('modCmdTitulo');
    if (!panel || !tbody) return;

    title.textContent = `Capacidades: ${mod.nombre_modelo} (${mod.codigo_modelo})`;
    const base = [
      { codigo_comando: 1, nombre_comando: 'AVANZAR', descripcion: 'Avance frontal' },
      { codigo_comando: 2, nombre_comando: 'RETROCEDER', descripcion: 'Retroceso' },
      { codigo_comando: 3, nombre_comando: 'CABINA_IZQ', descripcion: 'Giro cabina izquierda' },
      { codigo_comando: 4, nombre_comando: 'CABINA_DER', descripcion: 'Giro cabina derecha' },
      { codigo_comando: 5, nombre_comando: 'GIRAR_DER', descripcion: 'Giro derecha' },
      { codigo_comando: 6, nombre_comando: 'GIRAR_IZQ', descripcion: 'Giro izquierda' },
      { codigo_comando: 7, nombre_comando: 'SUBIR_BRAZO', descripcion: 'Elevar brazo' },
      { codigo_comando: 8, nombre_comando: 'BAJAR_BRAZO', descripcion: 'Bajar brazo' },
      { codigo_comando: 9, nombre_comando: 'DETENER', descripcion: 'Parada prioritaria obligatoria' },
      { codigo_comando: 10, nombre_comando: 'ABRIR_PALA', descripcion: 'Abrir pala' },
      { codigo_comando: 11, nombre_comando: 'CERRAR_PALA', descripcion: 'Cerrar pala' }
    ];
    const existentes = new Map((mod.comandos || []).map(c => [Number(c.codigo_comando), c]));

    tbody.innerHTML = base.map(b => {
      const actual = existentes.get(b.codigo_comando);
      const isStop = b.codigo_comando === 9;
      const hab = isStop ? true : Boolean(actual ? actual.habilitado : false);
      const inv = isStop ? true : Boolean(actual ? actual.permitido_invitado : false);
      return `
        <tr>
          <td class="font-monospace">${b.codigo_comando}</td>
          <td>${this.#esc(actual?.nombre_comando || b.nombre_comando)}</td>
          <td class="text-center">
            <input type="checkbox" class="form-check-input chk-mod-hab" data-cod="${b.codigo_comando}"
                   data-nombre="${this.#esc(actual?.nombre_comando || b.nombre_comando)}"
                   data-desc="${this.#esc(actual?.descripcion || b.descripcion)}"
                   ${hab ? 'checked' : ''} ${isStop ? 'disabled' : ''}>
          </td>
          <td class="text-center">
            <input type="checkbox" class="form-check-input chk-mod-inv" data-cod="${b.codigo_comando}"
                   ${inv ? 'checked' : ''} ${isStop ? 'disabled' : ''}>
          </td>
        </tr>
      `;
    }).join('');
    panel.classList.remove('d-none');
  }

  async #guardarModeloComandos() {
    if (!this.selectedModeloCmdId) return;
    const tbody = document.getElementById('adminModeloComandosBody');
    const payload = [];
    tbody?.querySelectorAll('.chk-mod-hab').forEach(chk => {
      const cod = Number(chk.dataset.cod);
      const invChk = tbody.querySelector(`.chk-mod-inv[data-cod="${cod}"]`);
      if (chk.checked || cod === 9) {
        payload.push({
          codigo_comando: cod,
          nombre_comando: chk.dataset.nombre,
          descripcion: chk.dataset.desc,
          habilitado: true,
          permitido_invitado: cod === 9 ? true : Boolean(invChk?.checked)
        });
      }
    });
    try {
      await api.updateModeloComandos(this.selectedModeloCmdId, payload);
      this.onLog(`[ADMIN] Comandos actualizados para modelo #${this.selectedModeloCmdId}.`);
      document.getElementById('panelModeloComandos')?.classList.add('d-none');
      await this.#cargarModelosAdmin();
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  async #guardarModelo(e) {
    e.preventDefault();
    const modId = document.getElementById('modId').value;
    const payload = {
      codigo_modelo: document.getElementById('modCodigo').value.trim(),
      nombre_modelo: document.getElementById('modNombre').value.trim(),
      descripcion: document.getElementById('modDesc').value.trim(),
      activo: document.getElementById('modActivo').checked
    };
    try {
      if (modId) {
        await api.updateAdminModelo(Number(modId), payload);
        this.onLog(`[ADMIN] Modelo #${modId} actualizado en RDS.`);
      } else {
        await api.createAdminModelo(payload);
        this.onLog('[ADMIN] Modelo comercial registrado en RDS.');
      }
      this.#resetModeloForm();
      await this.#cargarModelosAdmin();
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  #resetUnidadForm() {
    document.getElementById('uniId').value = '';
    document.getElementById('uniSerie').value = '';
    document.getElementById('uniNombre').value = '';
    document.getElementById('uniMicro').value = 'ESP8266';
    document.getElementById('uniEstadoCom').value = 'disponible';
    document.getElementById('uniFormTitulo').textContent = 'Registrar Unidad Física';
    document.getElementById('btnGuardarUnidad').textContent = 'Alta';
    document.getElementById('btnCancelarUnidad')?.classList.add('d-none');
  }

  async #cargarUnidadesAdmin() {
    const tbody = document.getElementById('adminUnidadesBody');
    if (!tbody) return;
    const q = document.getElementById('uniSearchInput')?.value?.trim() || '';
    const est = document.getElementById('uniEstadoFilter')?.value || '';
    const params = {};
    if (q) params.search = q;
    if (est) params.estado_comercial = est;
    const unidades = await api.getAdminUnidades(params);
    this.unidadesCache = unidades || [];
    tbody.innerHTML = this.unidadesCache.length === 0
      ? '<tr><td colspan="7" class="text-center text-secondary">Sin unidades</td></tr>'
      : this.unidadesCache.map(u => {
          const wssCell = u.clientes_wss > 0
            ? `<span class="badge bg-success">${Number(u.clientes_wss)} en línea</span>`
            : '<span class="text-secondary">Sin verificar</span>';
          return `
            <tr>
              <td class="font-monospace">#${Number(u.id_vehiculo)}</td>
              <td>
                <div class="fw-semibold text-light">${this.#esc(u.nombre)}</div>
                <small class="text-secondary font-monospace">${this.#esc(u.numero_serie || 'Sin serie')}</small>
              </td>
              <td>${this.#esc(u.nombre_modelo)}</td>
              <td><span class="badge bg-secondary">${this.#esc(u.estado_comercial)}</span></td>
              <td>${this.#esc(u.propietario_username || 'Empresa')}</td>
              <td>${wssCell}</td>
              <td class="text-end text-nowrap">
                <button type="button" class="btn btn-outline-info btn-sm py-0 px-1 btn-edit-uni" data-id="${Number(u.id_vehiculo)}">Editar</button>
                ${u.activo ? `<button type="button" class="btn btn-outline-danger btn-sm py-0 px-1 btn-baja-uni" data-id="${Number(u.id_vehiculo)}">Baja</button>` : '<span class="text-secondary ms-1">Inactiva</span>'}
              </td>
            </tr>
          `;
        }).join('');

    tbody.querySelectorAll('.btn-edit-uni').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = this.unidadesCache.find(x => Number(x.id_vehiculo) === Number(btn.dataset.id));
        if (!u) return;
        document.getElementById('uniId').value = u.id_vehiculo;
        if (u.id_modelo) document.getElementById('uniModeloId').value = String(u.id_modelo);
        document.getElementById('uniSerie').value = u.numero_serie || '';
        document.getElementById('uniNombre').value = u.nombre || '';
        document.getElementById('uniMicro').value = u.microcontrolador || 'ESP8266';
        document.getElementById('uniEstadoCom').value = u.estado_comercial || 'disponible';
        document.getElementById('uniFormTitulo').textContent = `Editando Unidad #${u.id_vehiculo}`;
        document.getElementById('btnGuardarUnidad').textContent = 'Guardar';
        document.getElementById('btnCancelarUnidad')?.classList.remove('d-none');
      });
    });

    tbody.querySelectorAll('.btn-baja-uni').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.deactivateAdminUnidad(Number(btn.dataset.id));
          this.onLog(`[ADMIN] Unidad #${btn.dataset.id} dada de baja lógica (historial conservado).`);
          await this.#cargarUnidadesAdmin();
        } catch (err) {
          this.#showAlert(err.message, 'danger');
        }
      });
    });
  }

  async #guardarUnidad(e) {
    e.preventDefault();
    const uniId = document.getElementById('uniId').value;
    const payload = {
      id_modelo: Number(document.getElementById('uniModeloId').value),
      numero_serie: document.getElementById('uniSerie').value.trim(),
      nombre: document.getElementById('uniNombre').value.trim(),
      microcontrolador: document.getElementById('uniMicro').value.trim() || 'ESP8266',
      estado_comercial: document.getElementById('uniEstadoCom').value
    };
    try {
      if (uniId) {
        await api.updateAdminUnidad(Number(uniId), { ...payload, activo: payload.estado_comercial !== 'inactivo' });
        this.onLog(`[ADMIN] Unidad #${uniId} actualizada en RDS.`);
      } else {
        await api.createAdminUnidad(payload);
        this.onLog('[ADMIN] Unidad física creada en RDS con sus capacidades de modelo.');
      }
      this.#resetUnidadForm();
      await this.#cargarUnidadesAdmin();
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  #resetClienteForm() {
    document.getElementById('cliId').value = '';
    const uIn = document.getElementById('cliUsername');
    uIn.value = '';
    uIn.readOnly = false;
    document.getElementById('cliNombre').value = '';
    document.getElementById('cliEmail').value = '';
    document.getElementById('cliTelefono').value = '';
    const pIn = document.getElementById('cliPassword');
    pIn.value = '';
    pIn.required = true;
    pIn.placeholder = 'Contraseña (6+)';
    document.getElementById('cliActivo').checked = true;
    document.getElementById('cliFormTitulo').textContent = 'Alta de Comprador';
    document.getElementById('btnGuardarCliente').textContent = 'Crear Comprador';
    document.getElementById('btnCancelarCliente')?.classList.add('d-none');
  }

  async #cargarClientesAdmin() {
    const tbody = document.getElementById('adminClientesBody');
    if (!tbody) return;
    const search = document.getElementById('cliSearchInput')?.value?.trim() || '';
    const clientes = await api.getAdminClientes(search);
    this.clientesCache = clientes || [];
    tbody.innerHTML = this.clientesCache.length === 0
      ? '<tr><td colspan="6" class="text-center text-secondary">Sin clientes</td></tr>'
      : this.clientesCache.map(c => `
        <tr>
          <td class="text-info font-monospace">${this.#esc(c.username)}</td>
          <td>
            <div class="text-light">${this.#esc(c.nombre_completo)}</div>
            <small class="text-secondary">${this.#esc(c.email)}</small>
          </td>
          <td><span class="badge bg-dark border border-secondary">${this.#esc(c.rol)}</span></td>
          <td>${Number(c.total_unidades || 0)}</td>
          <td><span class="badge ${c.activo ? 'bg-success' : 'bg-secondary'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td class="text-end">
            <button type="button" class="btn btn-outline-info btn-sm py-0 px-1 btn-edit-cli" data-id="${Number(c.id_usuario)}">Editar</button>
          </td>
        </tr>
      `).join('');

    tbody.querySelectorAll('.btn-edit-cli').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = this.clientesCache.find(x => Number(x.id_usuario) === Number(btn.dataset.id));
        if (!c) return;
        document.getElementById('cliId').value = c.id_usuario;
        const uIn = document.getElementById('cliUsername');
        uIn.value = c.username;
        uIn.readOnly = true;
        document.getElementById('cliNombre').value = c.nombre_completo;
        document.getElementById('cliEmail').value = c.email;
        document.getElementById('cliTelefono').value = c.telefono || '';
        const pIn = document.getElementById('cliPassword');
        pIn.value = '';
        pIn.required = false;
        pIn.placeholder = 'Nueva clave (opcional)';
        document.getElementById('cliActivo').checked = Boolean(c.activo);
        document.getElementById('cliFormTitulo').textContent = `Editando @${c.username}`;
        document.getElementById('btnGuardarCliente').textContent = 'Actualizar';
        document.getElementById('btnCancelarCliente')?.classList.remove('d-none');
      });
    });
  }

  async #cargarSelectsAsignacion() {
    const selUni = document.getElementById('asigUnidadId');
    const selCli = document.getElementById('asigClienteId');
    if (!selUni || !selCli) return;
    const [unidades, clientes] = await Promise.all([api.getAdminUnidades(), api.getAdminClientes()]);
    selUni.innerHTML = unidades
      .filter(u => u.activo && u.estado_comercial !== 'inactivo')
      .map(u => `<option value="${Number(u.id_vehiculo)}">#${Number(u.id_vehiculo)} ${this.#esc(u.nombre)} (${this.#esc(u.estado_comercial)})</option>`)
      .join('');
    selCli.innerHTML = clientes
      .filter(c => c.activo && c.rol === 'USUARIO')
      .map(c => `<option value="${Number(c.id_usuario)}">${this.#esc(c.nombre_completo)} (@${this.#esc(c.username)})</option>`)
      .join('');
  }

  async #guardarCliente(e) {
    e.preventDefault();
    const cliId = document.getElementById('cliId').value;
    try {
      if (cliId) {
        const pw = document.getElementById('cliPassword').value;
        await api.updateAdminCliente(Number(cliId), {
          email: document.getElementById('cliEmail').value.trim(),
          nombre_completo: document.getElementById('cliNombre').value.trim(),
          telefono: document.getElementById('cliTelefono').value.trim() || null,
          activo: document.getElementById('cliActivo').checked,
          password: pw || null
        });
        this.onLog(`[ADMIN] Cliente #${cliId} actualizado.`);
      } else {
        await api.createAdminCliente({
          username: document.getElementById('cliUsername').value.trim(),
          nombre_completo: document.getElementById('cliNombre').value.trim(),
          email: document.getElementById('cliEmail').value.trim(),
          telefono: document.getElementById('cliTelefono').value.trim() || null,
          password: document.getElementById('cliPassword').value,
          id_rol: 2
        });
        this.onLog('[ADMIN] Comprador dado de alta.');
      }
      this.#resetClienteForm();
      await Promise.all([this.#cargarClientesAdmin(), this.#cargarSelectsAsignacion()]);
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  async #asignarUnidad(e) {
    e.preventDefault();
    try {
      await api.assignAdminUnidad({
        id_vehiculo: Number(document.getElementById('asigUnidadId').value),
        id_usuario: Number(document.getElementById('asigClienteId').value),
        soporte_autorizado: false
      });
      this.onLog('[ADMIN] Unidad asignada a cliente comprador (acceso anterior revocado).');
      await Promise.all([this.#cargarClientesAdmin(), this.#cargarSelectsAsignacion()]);
    } catch (err) {
      this.#showAlert(err.message, 'danger');
    }
  }

  async #cargarAuditoria() {
    const tbody = document.getElementById('adminAuditoriaBody');
    if (!tbody) return;
    const accion = document.getElementById('auditAccionInput')?.value?.trim() || '';
    const resultado = document.getElementById('auditResultadoFilter')?.value || '';
    const params = { limit: 50 };
    if (accion) params.accion = accion;
    if (resultado) params.resultado = resultado;

    const rows = await api.getAdminAuditoria(params);
    tbody.innerHTML = rows.length === 0
      ? '<tr><td colspan="6" class="text-center text-secondary">Sin eventos registrados</td></tr>'
      : rows.map(r => {
          const fechaStr = String(r.fecha_hora || '').replace('T', ' ').slice(0, 19);
          return `
            <tr>
              <td class="font-monospace text-secondary">${this.#esc(fechaStr)}</td>
              <td class="text-info font-monospace">${this.#esc(r.actor_username)}</td>
              <td>${this.#esc(r.accion)}</td>
              <td>${this.#esc(r.recurso)}${r.id_recurso ? ' #' + Number(r.id_recurso) : ''}</td>
              <td><span class="badge ${r.resultado === 'EXITO' ? 'bg-success' : 'bg-danger'}">${this.#esc(r.resultado)}</span></td>
              <td class="text-secondary">${this.#esc(r.detalles || '')}</td>
            </tr>
          `;
        }).join('');
  }
}
