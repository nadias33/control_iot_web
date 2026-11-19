import { CONFIG } from './config.js';
import { api } from './api/client.js';
import { wsManager } from './websocket/wsManager.js';
import { StatusPanel } from './components/statusPanel.js';
import { SliderControl } from './components/sliderControl.js';
import { ButtonsController } from './components/buttons.js';
import { DemoControl } from './components/demoControl.js';
import { MonitoringView } from './components/monitoringView.js';

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

    this.sliderTraction = null;
    this.sliderSteering = null;
    this.isSending = false;
  }

  init() {
    this.log(`Plataforma telemática iniciada para vehículo #${CONFIG.VEHICLE_ID}...`);

    // 1. Iniciar Navegación entre Vistas (Control, Monitoreo y Administración)
    this.#setupNavigation();

    // 2. Iniciar Panel de 3 Estados (WSS, API, RDS)
    const statusPanel = new StatusPanel((msg) => this.log(msg));
    statusPanel.init();

    // 3. Conectar Canal WebSocket Seguro (WSS Bidireccional)
    wsManager.connect();
    this.#setupWebSocketListeners();

    // 4. Instanciar los DOS CONTROLES TIPO SLIDER (DESLIZADORES TÁCTILES CON CENTRADO)
    // Slider 1 (Izquierdo): Tracción (Avanzar / Detener / Retroceder)
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

    // Slider 2 (Derecho): Dirección (Girar Izquierda / Recto / Girar Derecha)
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

    // 5. Botones auxiliares superiores (Cabina L1/R1) y Parada de Emergencia STOP
    new ButtonsController((comandoId, nombreCmd) => {
      // Si se pulsó STOP de emergencia, restablecer ambos sliders al centro físico
      if (comandoId === CONFIG.COMANDOS.DETENER) {
        if (this.sliderTraction) this.sliderTraction.resetToCenter();
        if (this.sliderSteering) this.sliderSteering.resetToCenter();
        this.#updateDirectionDisplay('EMERGENCY STOP (REPOSO)', 0);
      }
      this.ejecutarComando(comandoId, `CONTROL_${nombreCmd}`);
    });

    // 6. Módulo DEMO
    new DemoControl((msg) => this.log(msg));

    // 7. Vista de MONITOREO (Telemetría en tiempo real y tabla de 10 registros persistidos)
    this.monitoringView = new MonitoringView((msg) => this.log(msg));

    // Botón para limpiar logs
    if (this.btnLimpiar) {
      this.btnLimpiar.addEventListener('click', () => {
        this.terminal.innerHTML = '<div class="text-secondary small">[LOG LIMPIO]</div>';
      });
    }
  }

  #setupNavigation() {
    const tabs = [
      { btn: this.tabControl, view: this.viewControl },
      { btn: this.tabMonitoreo, view: this.viewMonitoreo, onOpen: () => this.monitoringView.sincronizarTodo() },
      { btn: this.tabAdmin, view: this.viewAdmin }
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

        if (onOpen) await onOpen();
      });
    });
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
        const resp = await api.postMovimiento(idComando, origen);
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
