/**
 * Utilidad para el formateo seguro y accesible de fechas y horas.
 */
export class DateFormatter {
  static format(dateString) {
    if (!dateString) {
      return { fecha: '--/--/----', hora: '--:--:--' };
    }

    try {
      // Manejar formato MySQL (YYYY-MM-DD HH:MM:SS) o ISO
      const normalizedString = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
      const date = new Date(normalizedString);

      if (isNaN(date.getTime())) {
        return { fecha: dateString, hora: '' };
      }

      const fecha = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const hora = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return { fecha, hora };
    } catch (_) {
      return { fecha: String(dateString), hora: '' };
    }
  }
}