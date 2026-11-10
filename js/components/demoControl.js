import { api } from '../api/client.js';
import { wsManager } from '../websocket/wsManager.js';

export class DemoControl {
  constructor(onLog) {
    this.onLog = onLog;
    this.selectDemo = document.getElementById('selectDemo');
    this.btnIniciar = document.getElementById('btnIniciarDemo');
    this.btnCancelar = document.getElementById('btnCancelarDemo');
    this.badgeEstado = document.getElementById('badgeDemoEstado');
    this.progressContainer = document.getElementById('demoProgressContainer');
    this.progressBar = document.getElementById('demoProgressBar');
    this.txtPaso = document.getElementById('txtDemoPaso');
    this.isDemoRunning = false;

    this.#init();
  }

  async #init() {
    this.btnIniciar.addEventListener('click', () => this.#iniciarDemo());
    this.btnCancelar.addEventListener('click', () => this.#cancelarDemo());

    // Escuchar eventos de DEMO emitidos por WebSocket
    wsManager.on('DEMO_INICIO', (data) => this.#onDemoInicio(data));
    wsManager.on('DEMO_MOVIMIENTO', (data) => this.#onDemoMovimiento(data));
    wsManager.on('DEMO_FIN', () => this.#onDemoFin('Finalizada'));
    wsManager.on('DEMO_CANCELADA', () => this.#onDemoFin('Cancelada'));

    await this.cargarDemos();
  }

  async cargarDemos() {
    try {
      const demos = await api.getDemos();
      this.selectDemo.innerHTML = '';
      if (!demos || demos.length === 0) {
        this.selectDemo.innerHTML = '<option value="">Sin DEMOs registradas</option>';
        this.btnIniciar.disabled = true;
        return;
      }

      demos.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id_demo;
        opt.textContent = `${d.nombre} (ID: ${d.id_demo})`;
        this.selectDemo.appendChild(opt);
      });

      this.btnIniciar.disabled = false;
    } catch (err) {
      this.selectDemo.innerHTML = '<option value="">Error al cargar DEMOs</option>';
      this.onLog(`[ERROR DEMO] ${err.message}`);
    }
  }

  async #iniciarDemo() {
    const idDemo = this.selectDemo.value;
    if (!idDemo) return;

    try {
      this.btnIniciar.disabled = true;
      this.onLog(`[DEMO] Solicitando inicio de DEMO #${idDemo}...`);
      await api.postIniciarDemo(idDemo);
    } catch (err) {
      this.btnIniciar.disabled = false;
      this.onLog(`[ERROR DEMO] ${err.message}`);
    }
  }

  async #cancelarDemo() {
    try {
      this.btnCancelar.disabled = true;
      this.onLog('[DEMO] Solicitando cancelación...');
      await api.postCancelarDemo();
    } catch (err) {
      this.onLog(`[ERROR DEMO] ${err.message}`);
    }
  }

  #onDemoInicio(data) {
    this.isDemoRunning = true;
    this.badgeEstado.className = 'badge bg-warning text-dark';
    this.badgeEstado.textContent = 'En ejecución';
    this.btnIniciar.disabled = true;
    this.btnCancelar.disabled = false;
    this.progressContainer.classList.remove('d-none');
    this.progressBar.style.width = '5%';
    this.txtPaso.textContent = `Iniciando DEMO #${data.id_demo}...`;
    this.onLog(`[WSS DEMO] Inicio recibido. Total movimientos: ${data.total_movimientos || 'N'}`);
  }

  #onDemoMovimiento(data) {
    this.txtPaso.textContent = `Paso #${data.orden}: ${data.comando} (${data.duracion_ms}ms)`;
    this.progressBar.style.width = '60%';
    this.onLog(`[WSS DEMO] Movimiento #${data.orden}: ${data.comando} [${data.duracion_ms}ms]`);
  }

  #onDemoFin(motivo) {
    this.isDemoRunning = false;
    this.badgeEstado.className = 'badge bg-secondary';
    this.badgeEstado.textContent = motivo;
    this.btnIniciar.disabled = false;
    this.btnCancelar.disabled = true;
    this.progressBar.style.width = '100%';
    setTimeout(() => {
      this.progressContainer.classList.add('d-none');
      this.progressBar.style.width = '0%';
    }, 2000);
    this.onLog(`[WSS DEMO] Secuencia ${motivo.toLowerCase()} exitosamente.`);
  }
}