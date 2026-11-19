import { CONFIG } from '../config.js';

/**
 * Componente SliderControl de Grado Industrial / Telemática IoT
 * Soporta orientación 'vertical' y 'horizontal'.
 * Incluye auto-retorno elástico (spring-to-center / dead-man switch),
 * umbrales de activación configurables, debouncing y feedback táctil.
 */
export class SliderControl {
  constructor(options) {
    this.track = document.getElementById(options.trackId);
    this.thumb = document.getElementById(options.thumbId);
    this.valueLabel = options.valueLabelId ? document.getElementById(options.valueLabelId) : null;
    this.orientation = options.orientation || 'vertical'; // 'vertical' | 'horizontal'
    this.name = options.name || 'SLIDER';
    this.onCommand = options.onCommand; // callback(comandoId, nombreComando, valorNormalizado)
    
    // Mapeo de comandos para las 3 posiciones: POSITIVO, NEUTRO, NEGATIVO
    this.mapping = options.mapping || {
      POSITIVE: { id: CONFIG.COMANDOS.AVANZAR, name: 'AVANZAR' },
      NEUTRAL: { id: CONFIG.COMANDOS.DETENER, name: 'DETENER' },
      NEGATIVE: { id: CONFIG.COMANDOS.RETROCEDER, name: 'RETROCEDER' }
    };

    this.active = false;
    this.pointerId = null;
    this.currentZone = 'NEUTRAL';
    this.normalizedValue = 0; // -1.0 a +1.0
    this.threshold = options.threshold || 0.25; // 25% de desplazamiento para activar
    this.lastSentTime = 0;
    this.throttleMs = options.throttleMs || 80;

    this.#initEvents();
  }

  #initEvents() {
    if (!this.track || !this.thumb) return;

    this.track.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.#onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.#onPointerUp(e));

    // Prevenir scroll nativo al tocar el slider
    this.track.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.track.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  #onPointerDown(e) {
    this.active = true;
    this.pointerId = e.pointerId;
    this.thumb.classList.add('active');
    this.track.classList.add('track-active');
    try {
      this.track.setPointerCapture(e.pointerId);
    } catch (_) {}

    this.#processPointer(e.clientX, e.clientY);
  }

  #onPointerMove(e) {
    if (!this.active || (this.pointerId !== null && e.pointerId !== this.pointerId)) return;
    this.#processPointer(e.clientX, e.clientY);
  }

  #onPointerUp(e) {
    if (!this.active) return;
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;

    this.active = false;
    this.pointerId = null;
    this.thumb.classList.remove('active');
    this.track.classList.remove('track-active');

    // Retorno automático al centro (Spring return / dead-man)
    this.resetToCenter();
  }

  resetToCenter() {
    this.normalizedValue = 0;
    this.#updateThumbVisual(0);

    if (this.currentZone !== 'NEUTRAL') {
      this.currentZone = 'NEUTRAL';
      this.#triggerHaptic(10);
      if (this.onCommand) {
        this.onCommand(this.mapping.NEUTRAL.id, this.mapping.NEUTRAL.name, 0);
      }
    }

    if (this.valueLabel) {
      this.valueLabel.textContent = '0%';
      this.valueLabel.className = 'slider-value-badge badge bg-dark border border-secondary text-secondary';
    }
  }

  #processPointer(clientX, clientY) {
    const rect = this.track.getBoundingClientRect();
    let norm = 0;

    if (this.orientation === 'vertical') {
      // En pantalla Y crece hacia abajo:
      // Arriba = Positivo (+1), Abajo = Negativo (-1), Centro = 0
      const centerY = rect.top + rect.height / 2;
      const maxDelta = rect.height / 2 - 16;
      const deltaY = centerY - clientY; // Positivo hacia arriba
      norm = Math.max(-1, Math.min(1, deltaY / maxDelta));
    } else {
      // Horizontal: Derecha = Positivo (+1), Izquierda = Negativo (-1), Centro = 0
      const centerX = rect.left + rect.width / 2;
      const maxDelta = rect.width / 2 - 16;
      const deltaX = clientX - centerX; // Positivo a la derecha
      norm = Math.max(-1, Math.min(1, deltaX / maxDelta));
    }

    this.normalizedValue = norm;
    this.#updateThumbVisual(norm);
    this.#evaluateZone(norm);
  }

  #updateThumbVisual(norm) {
    const rect = this.track.getBoundingClientRect();

    if (this.orientation === 'vertical') {
      const maxTravel = (rect.height / 2) - 22;
      const offsetY = -norm * maxTravel; // norm > 0 (arriba) -> transform Y negativo
      this.thumb.style.transform = `translate(-50%, calc(-50% + ${offsetY}px))`;
    } else {
      const maxTravel = (rect.width / 2) - 22;
      const offsetX = norm * maxTravel;
      this.thumb.style.transform = `translate(calc(-50% + ${offsetX}px), -50%)`;
    }

    // Actualizar etiqueta digital de porcentaje
    if (this.valueLabel) {
      const pct = Math.round(norm * 100);
      const absPct = Math.abs(pct);
      if (absPct < 5) {
        this.valueLabel.textContent = 'CENTRO';
        this.valueLabel.className = 'slider-value-badge badge bg-dark border border-secondary text-secondary';
      } else if (norm > 0) {
        this.valueLabel.textContent = `+${absPct}%`;
        this.valueLabel.className = 'slider-value-badge badge bg-info text-dark fw-bold';
      } else {
        this.valueLabel.textContent = `-${absPct}%`;
        this.valueLabel.className = 'slider-value-badge badge bg-warning text-dark fw-bold';
      }
    }
  }

  #evaluateZone(norm) {
    let newZone = 'NEUTRAL';
    let target = this.mapping.NEUTRAL;

    if (norm >= this.threshold) {
      newZone = 'POSITIVE';
      target = this.mapping.POSITIVE;
    } else if (norm <= -this.threshold) {
      newZone = 'NEGATIVE';
      target = this.mapping.NEGATIVE;
    }

    const now = Date.now();
    // Emitir si cambió de zona o si transcurrió el throttle
    if (newZone !== this.currentZone || (now - this.lastSentTime >= this.throttleMs && newZone !== 'NEUTRAL')) {
      const changed = newZone !== this.currentZone;
      this.currentZone = newZone;
      this.lastSentTime = now;

      if (changed) {
        this.#triggerHaptic(15);
      }

      if (this.onCommand) {
        this.onCommand(target.id, target.name, norm);
      }
    }
  }

  #triggerHaptic(duration = 10) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(duration);
      }
    } catch (_) {}
  }
}
