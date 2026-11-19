import { CONFIG } from '../config.js';

export class Joystick {
  constructor(containerId, handleId, onCommandChange, customMapping = null) {
    this.container = document.getElementById(containerId);
    this.handle = document.getElementById(handleId);
    this.onCommandChange = onCommandChange; // Callback (idComando, direccionNombre)

    // Mapeo configurable (por defecto Tracción: Avanzar, Retroceder, Girar Izq/Der)
    this.mapping = customMapping || {
      UP: { id: CONFIG.COMANDOS.AVANZAR, name: 'AVANZAR' },
      DOWN: { id: CONFIG.COMANDOS.RETROCEDER, name: 'RETROCEDER' },
      LEFT: { id: CONFIG.COMANDOS.GIRAR_IZQ, name: 'GIRAR_IZQ' },
      RIGHT: { id: CONFIG.COMANDOS.GIRAR_DER, name: 'GIRAR_DER' }
    };

    this.active = false;
    this.neutralThreshold = 18; // Zona neutral en píxeles
    this.currentDirection = 'NEUTRAL';
    this.center = { x: 0, y: 0 };
    this.radius = 65;

    this.#initEvents();
  }

  #initEvents() {
    if (!this.container || !this.handle) return;
    this.container.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', () => this.#onPointerUp());
    window.addEventListener('pointercancel', () => this.#onPointerUp());
  }

  #onPointerDown(e) {
    this.active = true;
    this.handle.classList.add('active');
    const rect = this.container.getBoundingClientRect();
    this.radius = (rect.width / 2) - 12;
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
    // Retorno automático al centro
    this.handle.style.transform = 'translate(0px, 0px)';
    
    // Regla: Al soltar la palanca, restablecer centro y solicitar DETENER
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

    // Cuadrantes direccionales en coordenadas de pantalla (Y crece hacia abajo)
    if (deg >= 45 && deg < 135) {
      newDir = this.mapping.DOWN.name;
      comandoId = this.mapping.DOWN.id;
    } else if (deg >= 135 && deg < 225) {
      newDir = this.mapping.LEFT.name;
      comandoId = this.mapping.LEFT.id;
    } else if (deg >= 225 && deg < 315) {
      newDir = this.mapping.UP.name;
      comandoId = this.mapping.UP.id;
    } else {
      newDir = this.mapping.RIGHT.name;
      comandoId = this.mapping.RIGHT.id;
    }

    // Emitir solo si cambia de dirección efectiva
    if (newDir !== this.currentDirection) {
      this.currentDirection = newDir;
      this.onCommandChange(comandoId, newDir);
    }
  }
}