import { CONFIG } from '../config.js';

export class Joystick {
  constructor(containerId, handleId, onCommandChange, customMapping = null) {
    this.container = document.getElementById(containerId);
    this.handle = document.getElementById(handleId);
    this.onCommandChange = onCommandChange; // Callback (idComando, direccionNombre, dirKey)

    // Mapeo configurable de 4 ejes cardinales
    this.mapping = customMapping || {
      UP: { id: CONFIG.COMANDOS.AVANZAR, name: 'AVANZAR' },
      DOWN: { id: CONFIG.COMANDOS.RETROCEDER, name: 'RETROCEDER' },
      LEFT: { id: CONFIG.COMANDOS.GIRAR_IZQUIERDA, name: 'GIRAR_IZQUIERDA' },
      RIGHT: { id: CONFIG.COMANDOS.GIRAR_DERECHA, name: 'GIRAR_DERECHA' }
    };

    this.stopCommandId = CONFIG.COMANDOS.DETENER;
    this.active = false;
    this.pointerId = null;
    this.neutralThreshold = 16;
    this.currentDirection = 'NEUTRAL';
    this.center = { x: 0, y: 0 };
    this.radius = 52;

    this.#syncRimLabels();
    this.#initEvents();
  }

  /** Actualiza el id_comando real de DETENER resuelto desde RDS. */
  setStopCommandId(idComando) {
    if (Number(idComando) > 0) {
      this.stopCommandId = Number(idComando);
    }
  }

  /** Actualiza dinámicamente las 4 direcciones cardinales del joystick desde RDS. */
  setMapping(newMapping) {
    if (!newMapping || typeof newMapping !== 'object') return;
    this.mapping = {
      ...this.mapping,
      ...newMapping
    };
    this.#syncRimLabels();
  }

  #syncRimLabels() {
    if (!this.container) return;
    ['UP', 'DOWN', 'LEFT', 'RIGHT'].forEach((dir) => {
      const labelEl = this.container.querySelector(`[data-dir-label="${dir}"]`);
      if (!labelEl) return;
      const entry = this.mapping[dir];
      const enabled = Boolean(entry && Number(entry.id) > 0);
      labelEl.classList.toggle('is-disabled', !enabled);
      if (entry?.name) {
        labelEl.title = enabled ? entry.name : `${entry.name} no disponible`;
      }
    });
  }

  #initEvents() {
    if (!this.container || !this.handle) return;
    this.container.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.#onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.#onPointerUp(e));

    // Evitar desplazamiento accidental en pantallas táctiles
    this.container.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.container.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  #onPointerDown(e) {
    if (this.active && this.pointerId !== null && e.pointerId !== this.pointerId) return;
    this.active = true;
    this.pointerId = e.pointerId;
    this.handle.classList.remove('returning');
    this.handle.classList.add('active');
    this.container.classList.add('active');

    try {
      this.container.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = this.container.getBoundingClientRect();
    const knobHalf = (this.handle.offsetWidth || 54) / 2;
    this.radius = Math.max(24, (rect.width / 2) - knobHalf - 4);
    this.neutralThreshold = Math.max(16, this.radius * 0.28);
    this.center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    this.#updatePosition(e.clientX, e.clientY);
  }

  #onPointerMove(e) {
    if (!this.active || (this.pointerId !== null && e.pointerId !== this.pointerId)) return;
    this.#updatePosition(e.clientX, e.clientY);
  }

  #onPointerUp(e) {
    if (!this.active) return;
    if (this.pointerId !== null && e?.pointerId !== undefined && e.pointerId !== this.pointerId) return;

    this.active = false;
    this.pointerId = null;
    this.resetToCenter(false);
  }

  resetToCenter(silent = false) {
    this.active = false;
    this.pointerId = null;
    if (this.handle) {
      this.handle.classList.remove('active');
      this.handle.classList.add('returning');
      this.handle.style.transform = 'translate(0px, 0px)';
    }
    if (this.container) {
      this.container.classList.remove('active');
      this.container.dataset.dir = 'NEUTRAL';
    }

    const prevDir = this.currentDirection;
    this.currentDirection = 'NEUTRAL';
    if (!silent && prevDir !== 'NEUTRAL' && this.onCommandChange) {
      this.onCommandChange(this.stopCommandId, 'DETENER', 'NEUTRAL');
    }
  }

  #updatePosition(clientX, clientY) {
    const dx = clientX - this.center.x;
    const dy = clientY - this.center.y;
    const distance = Math.hypot(dx, dy);

    const angle = Math.atan2(dy, dx);
    const clampedDist = Math.min(distance, this.radius);

    const x = clampedDist * Math.cos(angle);
    const y = clampedDist * Math.sin(angle);

    this.handle.style.transform = `translate(${x}px, ${y}px)`;

    this.#evaluateDirection(clampedDist, angle);
  }

  #evaluateDirection(distance, angle) {
    if (distance < this.neutralThreshold) {
      if (this.container) this.container.dataset.dir = 'NEUTRAL';
      if (this.currentDirection !== 'NEUTRAL') {
        this.currentDirection = 'NEUTRAL';
        if (this.onCommandChange) {
          this.onCommandChange(this.stopCommandId, 'DETENER', 'NEUTRAL');
        }
      }
      return;
    }

    let deg = angle * (180 / Math.PI);
    if (deg < 0) deg += 360;

    let dirKey = 'RIGHT';
    if (deg >= 45 && deg < 135) {
      dirKey = 'DOWN';
    } else if (deg >= 135 && deg < 225) {
      dirKey = 'LEFT';
    } else if (deg >= 225 && deg < 315) {
      dirKey = 'UP';
    }

    if (this.container) {
      this.container.dataset.dir = dirKey;
    }

    const target = this.mapping[dirKey];
    if (target?.id && dirKey !== this.currentDirection) {
      this.currentDirection = dirKey;
      try {
        navigator.vibrate?.(12);
      } catch (_) {}
      if (this.onCommandChange) {
        this.onCommandChange(Number(target.id), target.name, dirKey);
      }
    }
  }
}