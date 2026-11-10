import { CONFIG } from '../config.js';

export class ButtonsController {
  constructor(onExecuteCommand) {
    this.onExecuteCommand = onExecuteCommand;
    this.btnDetener = document.getElementById('btnDetener');
    this.cmdButtons = document.querySelectorAll('.btn-cmd');
    this.#init();
  }

  #init() {
    // 1. Botón Prioritario DETENER (STOP)
    if (this.btnDetener) {
      this.btnDetener.addEventListener('click', () => {
        this.onExecuteCommand(CONFIG.COMANDOS.DETENER, 'DETENER (EMERGENCIA)');
      });
    }

    // 2. Botones de herramientas, cabina y gatillos L1/R1
    this.cmdButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const codigo = btn.dataset.codigo;
        const nombre = btn.dataset.nombre || 'COMANDO';
        if (codigo) {
          this.onExecuteCommand(Number(codigo), nombre);
        }
      });
    });
  }

  setDisabled(disabled) {
    this.cmdButtons.forEach(btn => {
      btn.disabled = disabled;
    });
    if (this.btnDetener) {
      this.btnDetener.disabled = disabled;
    }
  }
}