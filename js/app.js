import { CONFIG } from './config.js';
import { api } from './api/client.js';
import { wsManager } from './websocket/wsManager.js';
import { StatusPanel } from './components/statusPanel.js';
import { Joystick } from './components/joystick.js';
import { ButtonsController } from './components/buttons.js';
import { DemoControl } from './components/demoControl.js';
import { MonitoringView } from './components/monitoringView.js'; // <-- Importamos Monitoreo

class App {
  constructor() {
    this.terminal = document.getElementById('terminalLog');
    this.txtDireccion = document.getElementById('txtDireccionActual');
    this.badgeOperacion = document.getElementById('badgeOperacion');
    this.btnLimpiar = document.getElementById('btnLimpiarLogs');

    // Botones de Navegación y Vistas
    this.tabControl = document.getElementById('tabNavControl');
    this.tabMonitoreo = document.getElementById('tabNavMonitoreo');
    this.viewControl = document.getElementById('viewControl');
    this.viewMonitoreo = document.getElementById('viewMonitoreo');

    this.isSending = false;
  }

  init() {
    this.log(`Iniciando plataforma telemática para vehículo #${CONFIG.VEHICLE_ID}...`);

    // 1. Iniciar Navegación entre Vistas (Control y Monitoreo)
    this.#setupNavigation();

    // 2. Iniciar Panel de 3 Estados (Compartido en ambas vistas)
    const statusPanel = new StatusPanel();
    statusPanel.init();

    // 3. Conectar Canal WebSocket Seguro (WSS Único)
    wsManager.connect();
    this.#setupWebSocketListeners();

    // 4. Iniciar Controles de CONTROL (Joystick, Botones y DEMO)
    new Joystick('joystickZone', 'joystickHandle', (comandoId, dirNombre) => {
      this.txtDireccion.textContent = dirNombre;
      this.ejecutarComando(comandoId, `JOYSTICK_${dirNombre}`);
    });

    new ButtonsController((comandoId, nombreCmd) => {
      this.ejecutarComando(comandoId, `BOTON_${nombreCmd}`);
    });

    new DemoControl((msg) => this.log(msg));

    // 5. Iniciar Vista de MONITOREO (Tarjeta de último estado y tabla de 10 registros)
    this.monitoringView = new MonitoringView((msg) => this.log(msg));

    // Botón para limpiar logs
    this.btnLimpiar.addEventListener('click', () => {
      this.terminal.innerHTML = '<div class="text-secondary small">[LOG LIMPIO]</div>';
    });
  }

  #setupNavigation() {
    // Al hacer clic en pestaña CONTROL
    this.tabControl.addEventListener('click', () => {
      this.tabControl.classList.add('active');
      this.tabMonitoreo.classList.remove('active');
      this.viewControl.classList.remove('d-none');
      this.viewMonitoreo.classList.add('d-none');
    });

    // Al hacer clic en pestaña MONITOREO
    this.tabMonitoreo.addEventListener('click', async () => {
      this.tabMonitoreo.classList.add('active');
      this.tabControl.classList.remove('active');
      this.viewMonitoreo.classList.remove('d-none');
      this.viewControl.classList.add('d-none');

      // Consultar RDS para actualizar último estado y los 10 registros
      await this.monitoringView.sincronizarTodo();
    });
  }

  async ejecutarComando(idComando, origen) {
    if (this.isSending && idComando !== CONFIG.COMANDOS.DETENER) {
      return;
    }

    this.isSending = true;
    this.badgeOperacion.className = 'badge bg-warning text-dark';
    this.badgeOperacion.textContent = 'ENVIANDO...';

    try {
      this.log(`[REST POST] Enviando comando #${idComando} (${origen})...`);
      const resp = await api.postMovimiento(idComando, origen);
      
      this.badgeOperacion.className = 'badge bg-success';
      this.badgeOperacion.textContent = 'ACEPTADO';
      this.log(`[REST OK] Aceptado por API: ${resp.evento?.comando || 'Correcto'}`);
    } catch (err) {
      this.badgeOperacion.className = 'badge bg-danger';
      this.badgeOperacion.textContent = 'ERROR';
      this.log(`[REST ERROR] ${err.message}`);
      this.#showToast('Error de Comando', err.message);
    } finally {
      this.isSending = false;
    }
  }

  #setupWebSocketListeners() {
    wsManager.on('MOVIMIENTO_INDIVIDUAL', (data) => {
      this.log(`[WSS EVENTO] Movimiento: ${data.comando} (Cód: ${data.codigo})`);
      this.badgeOperacion.className = 'badge bg-info text-dark';
      this.badgeOperacion.textContent = data.comando;
    });

    wsManager.on('ESTADO_INICIAL', (data) => {
      this.log(`[WSS INICIAL] Último estado: ${data.datos?.comando || 'REPOSO'}`);
    });
  }

  log(mensaje) {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'text-light text-truncate mb-1';
    line.innerHTML = `<span class="text-secondary">[${time}]</span> ${mensaje}`;
    this.terminal.appendChild(line);
    this.terminal.scrollTop = this.terminal.scrollHeight;
  }

  #showToast(title, message) {
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    const toastEl = document.getElementById('liveToast');
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
  }
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});