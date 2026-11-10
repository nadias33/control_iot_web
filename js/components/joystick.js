import { CONFIG } from '../config.js';

export class Joystick {
  constructor(containerId, handleId, onCommandChange) {
    this.container = document.getElementById(containerId);
    this.handle = document.getElementById(handleId);
    this.onCommandChange = onCommandChange; // Callback (idComando, direccionNombre)

    this.active = false;
    this.radius = 75; // Radio máximo de desplazamiento
    this.neutralThreshold = 25; // Zona neutral en píxeles
    this.currentDirection = 'NEUTRAL';
    this.center = { x: 0, y: 0 };

    this.#initEvents();
  }

  #initEvents() {
    this.container.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', () => this.#onPointerUp());
    window.addEventListener('pointercancel', () => this.#onPointerUp());
  }

  #onPointerDown(e) {
    this.active = true;
    this.handle.classList.add('active');
    const rect = this.container.getBoundingClientRect();
    this.center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    this.#updatePosition(e.clientX, e.clientY);
  }

  #onPointerMove(e) {
    if (!this.active) return;
    this.#updatePosition(e.clientX, e.clientY);
  }

  #onPointerUp() {
    if (!this.active) return;
    this.active = false;
    this.handle.classList.remove('active');
    // Retorno al centro
    this.handle.style.transform = 'translate(0px, 0px)';
    
    // Regla: Al soltar, restablecer centro y solicitar DETENER
    if (this.currentDirection !== 'NEUTRAL') {
      this.currentDirection = 'NEUTRAL';
      this.onCommandChange(CONFIG.COMANDOS.DETENER, 'DETENER (CENTRO)');
    }
  }

  #updatePosition(clientX, clientY) {
    const dx = clientX - this.center.x;
    const dy = clientY - this.center.y;
    const distance = Math.hypot(dx, dy);

    // Limitar al radio máximo
    const angle = Math.atan2(dy, dx);
    const clampedDist = Math.min(distance, this.radius);

    const x = clampedDist * Math.cos(angle);
    const y = clampedDist * Math.sin(angle);

    this.handle.style.transform = `translate(${x}px, ${y}px)`;

    // Determinar dirección cardinal si sale de la zona neutral
    this.#evaluateDirection(clampedDist, angle);
  }

  #evaluateDirection(distance, angle) {
    if (distance < this.neutralThreshold) {
      if (this.currentDirection !== 'NEUTRAL') {
        this.currentDirection = 'NEUTRAL';
        this.onCommandChange(CONFIG.COMANDOS.DETENER, 'ZONA NEUTRAL');
      }
      return;
    }

    // Convertir ángulo a grados (0 a 360)
    let deg = angle * (180 / Math.PI);
    if (deg < 0) deg += 360;

    let newDir = 'NEUTRAL';
    let comandoId = CONFIG.COMANDOS.DETENER;

    // Cuadrantes direccionales
    if (deg >= 45 && deg < 135) {
      newDir = 'RETROCEDER';
      comandoId = CONFIG.COMANDOS.RETROCEDER;
    } else if (deg >= 135 && deg < 225) {
      newDir = 'GIRAR_IZQ';
      comandoId = CONFIG.COMANDOS.GIRAR_IZQ;
    } else if (deg >= 225 && deg < 315) {
      newDir = 'AVANZAR';
      comandoId = CONFIG.COMANDOS.AVANZAR;
    } else {
      newDir = 'GIRAR_DER';
      comandoId = CONFIG.COMANDOS.GIRAR_DER;
    }

    // Evitar ráfagas repetitivas: emitir solo si cambia de dirección efectiva
    if (newDir !== this.currentDirection) {
      this.currentDirection = newDir;
      this.onCommandChange(comandoId, newDir);
    }
  }
}