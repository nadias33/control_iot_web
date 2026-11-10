import { api } from '../api/client.js';
import { wsManager } from '../websocket/wsManager.js';
import { CONFIG } from '../config.js';

// Función interna de formateo de fecha (Autosuficiente, no requiere imports externos)
function formatearFechaHora(fechaString) {
  if (!fechaString) return { fecha: '--/--/----', hora: '--:--:--' };
  try {
    const normalizada = fechaString.includes('T') ? fechaString : fechaString.replace(' ', 'T');
    const d = new Date(normalizada);
    if (isNaN(d.getTime())) return { fecha: fechaString, hora: '' };
    return {
      fecha: d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }),
      hora: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    };
  } catch (_) {
    return { fecha: String(fechaString), hora: '' };
  }
}

export class MonitoringView {
  constructor(onLog) {
    this.onLog = onLog;

    // Elementos de la tarjeta de Último Movimiento
    this.cardUltimoComando = document.getElementById('monUltimoComando');
    this.badgeCodigo = document.getElementById('monBadgeCodigo');
    this.txtFecha = document.getElementById('monTxtFecha');
    this.txtHora = document.getElementById('monTxtHora');
    this.txtOrigen = document.getElementById('monTxtOrigen');
    this.badgeTipoEvento = document.getElementById('monBadgeTipoEvento');

    // Elementos de la Tabla
    this.tableBody = document.getElementById('monTableBody');
    this.txtTablaEstado = document.getElementById('monTxtTablaEstado');
    this.btnRefrescarHistorial = document.getElementById('monBtnRefrescar');

    this.isSyncing = false;
    this.#init();
  }

  #init() {
    if (this.btnRefrescarHistorial) {
      this.btnRefrescarHistorial.addEventListener('click', () => this.cargarHistorialRest());
    }

    // Escuchar eventos en vivo de WebSocket
    wsManager.on('MOVIMIENTO_INDIVIDUAL', (data) => this.#onEventoMovimientoIndividual(data));
    wsManager.on('DEMO_MOVIMIENTO', (data) => this.#onEventoDemoMovimiento(data));
    wsManager.on('ESTADO_INICIAL', (data) => this.#onEventoEstadoInicial(data));

    // Resincronizar con RDS si se recupera la conexión WSS
    wsManager.onStatusChange((status) => {
      if (status === 'ONLINE') {
        this.sincronizarTodo();
      }
    });
  }

  async sincronizarTodo() {
    await Promise.all([
      this.cargarUltimoEstadoRest(),
      this.cargarHistorialRest()
    ]);
  }

  async cargarUltimoEstadoRest() {
    try {
      const estado = await api.getEstado();
      if (estado) {
        const { fecha, hora } = formatearFechaHora(estado.fecha_actualizacion);
        this.actualizarTarjetaUltimoMovimiento({
          comando: estado.comando || 'DETENER (REPOSO)',
          codigo: estado.codigo ?? 9,
          fecha: fecha,
          hora: hora,
          origen: 'RDS_ESTADO_ACTUAL',
          tipoBadge: 'REST Persistido'
        });
      }
    } catch (err) {
      this.onLog(`[MONITOREO REST] Error al cargar estado: ${err.message}`);
    }
  }

  async cargarHistorialRest() {
    if (this.isSyncing || !this.tableBody) return;
    this.isSyncing = true;
    if (this.txtTablaEstado) this.txtTablaEstado.textContent = 'Sincronizando con RDS...';

    try {
      const historial = await api.getHistorial();
      this.renderTabla(historial);
    } catch (err) {
      if (this.txtTablaEstado) this.txtTablaEstado.textContent = 'Error al consultar historial.';
      this.onLog(`[MONITOREO REST] Error historial: ${err.message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  renderTabla(registros) {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = '';

    if (!registros || registros.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-secondary">
            <i class="bi bi-inbox fs-4 d-block mb-1"></i>
            Sin movimientos registrados en RDS.
          </td>
        </tr>`;
      if (this.txtTablaEstado) this.txtTablaEstado.textContent = 'Historial vacío';
      return;
    }

    const maxDiez = registros.slice(0, 10);

    maxDiez.forEach((reg, index) => {
      const { fecha, hora } = formatearFechaHora(reg.fecha_hora);
      const tr = document.createElement('tr');
      tr.className = index === 0 ? 'table-active border-info' : '';

      tr.innerHTML = `
        <td class="fw-bold text-secondary text-center">${index + 1}</td>
        <td>
          <span class="fw-semibold text-light">${reg.comando || 'COMANDO #' + reg.id_comando}</span>
          ${reg.codigo ? `<span class="badge bg-secondary ms-1 small">Cód: ${reg.codigo}</span>` : ''}
        </td>
        <td><small class="text-light font-monospace">${fecha}</small></td>
        <td><small class="text-info font-monospace">${hora}</small></td>
        <td><span class="badge bg-dark border border-secondary text-secondary">${reg.origen || 'DESCONOCIDO'}</span></td>
      `;
      this.tableBody.appendChild(tr);
    });

    if (this.txtTablaEstado) {
      this.txtTablaEstado.textContent = `Mostrando ${maxDiez.length} de máx 10 movimientos persistidos`;
    }
  }

  actualizarTarjetaUltimoMovimiento({ comando, codigo, fecha, hora, origen, tipoBadge }) {
    if (this.cardUltimoComando) this.cardUltimoComando.textContent = comando;
    if (this.badgeCodigo) this.badgeCodigo.textContent = `CÓDIGO: ${codigo}`;
    if (this.txtFecha) this.txtFecha.textContent = fecha;
    if (this.txtHora) this.txtHora.textContent = hora;
    if (this.txtOrigen) this.txtOrigen.textContent = origen;
    if (this.badgeTipoEvento) this.badgeTipoEvento.textContent = tipoBadge;
  }

  #onEventoMovimientoIndividual(data) {
    if (data.id_vehiculo && Number(data.id_vehiculo) !== CONFIG.VEHICLE_ID) return;
    const { fecha, hora } = formatearFechaHora(data.timestamp || new Date().toISOString());

    this.actualizarTarjetaUltimoMovimiento({
      comando: data.comando,
      codigo: data.codigo,
      fecha: fecha,
      hora: hora,
      origen: data.origen || 'EXTERNO',
      tipoBadge: 'WSS en Tiempo Real'
    });

    setTimeout(() => this.cargarHistorialRest(), 300);
  }

  #onEventoDemoMovimiento(data) {
    const { fecha, hora } = formatearFechaHora(data.timestamp || new Date().toISOString());

    // Regla de Negocio: DEMO no va al historial
    this.actualizarTarjetaUltimoMovimiento({
      comando: `${data.comando} (Paso ${data.orden})`,
      codigo: data.codigo,
      fecha: fecha,
      hora: hora,
      origen: `DEMO_AUTOMATICA [${data.duracion_ms}ms]`,
      tipoBadge: 'WSS DEMO (No va a Historial)'
    });
  }

  #onEventoEstadoInicial(data) {
    if (data.datos) {
      const { fecha, hora } = formatearFechaHora(data.datos.fecha_actualizacion);
      this.actualizarTarjetaUltimoMovimiento({
        comando: data.datos.comando || 'DETENER',
        codigo: data.datos.codigo ?? 9,
        fecha: fecha,
        hora: hora,
        origen: 'RDS_CONEXION_INICIAL',
        tipoBadge: 'Último Estado RDS'
      });
    }
  }
}