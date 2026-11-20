import { CONFIG } from '../config.js';

export class ButtonsController {
  constructor(onExecuteCommand) {
    this.onExecuteCommand = onExecuteCommand;
    this.viewControl = document.getElementById('viewControl') || document;
    this.btnDetener = document.getElementById('btnDetener');
    this.stopCommandId = CONFIG.COMANDOS.DETENER;
    this.#init();
  }

  /** Actualiza el id_comando real de parada resuelto desde RDS. */
  setStopCommandId(idComando) {
    if (Number(idComando) > 0) {
      this.stopCommandId = Number(idComando);
    }
  }

  #init() {
    // 1. Botón Prioritario DETENER (STOP)
    if (this.btnDetener) {
      this.btnDetener.addEventListener('click', () => {
        document.querySelector('.fn-switch[data-cmd-key="DEMO_AUTO"]')?.classList.remove('is-on');
        try {
          navigator.vibrate?.(18);
        } catch (_) {}
        this.onExecuteCommand(this.stopCommandId, 'DETENER (EMERGENCIA)');
      });
    }

    // 2. Delegación de eventos sobre #viewControl para switches y botones dinámicos (.btn-cmd)
    this.viewControl.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.btn-cmd');
      if (!btn || btn.disabled) return;

      const codigo = Number(btn.dataset.codigo);
      const nombre = btn.dataset.nombre || btn.dataset.cmdKey || 'COMANDO';
      if (!codigo || Number.isNaN(codigo)) return;

      if (btn.classList.contains('fn-switch')) {
        btn.classList.toggle('is-on');
      }

      btn.classList.add('cmd-active');
      setTimeout(() => btn.classList.remove('cmd-active'), 220);

      try {
        navigator.vibrate?.(12);
      } catch (_) {}

      this.onExecuteCommand(codigo, nombre);
    });
  }

  setDisabled(disabled) {
    document.querySelectorAll('#viewControl .btn-cmd').forEach(btn => {
      btn.disabled = disabled;
    });
    if (this.btnDetener) {
      this.btnDetener.disabled = disabled;
    }
  }
}