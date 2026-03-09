export class MessageParserService {
  parsearFecha(texto: string): Date | null {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const textoLower = texto.toLowerCase().trim();

    if (textoLower === 'hoy') return hoy;
    if (textoLower === 'mañana' || textoLower === 'manana') {
      const d = new Date(hoy); d.setDate(d.getDate() + 1); return d;
    }
    if (textoLower === 'pasado mañana' || textoLower === 'pasado manana') {
      const d = new Date(hoy); d.setDate(d.getDate() + 2); return d;
    }

    const fechaRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;
    const match = textoLower.match(fechaRegex);
    if (match) {
      const [, dia, mes, año] = match;
      const añoCompleto = año.length === 2 ? 2000 + parseInt(año) : parseInt(año);
      const fecha = new Date(añoCompleto, parseInt(mes) - 1, parseInt(dia));
      if (!isNaN(fecha.getTime()) && fecha >= hoy) return fecha;
    }

    const diasSemana: Record<string, number> = {
      lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
      jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 0,
    };
    const diaSemana = diasSemana[textoLower];
    if (diaSemana !== undefined) {
      const fecha = new Date(hoy);
      const diaActual = fecha.getDay();
      let diff = diaSemana - diaActual;
      if (diff <= 0) diff += 7;
      fecha.setDate(fecha.getDate() + diff);
      return fecha;
    }

    return null;
  }

  parsearOpcionNumerica(texto: string, max: number): number | null {
    const textoLimpio = texto.replace(/[^\d\s]/g, '').trim();
    const numero = parseInt(textoLimpio);
    if (isNaN(numero) || numero < 1 || numero > max) return null;
    return numero;
  }

  normalizarRespuesta(texto: string): string {
    return texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  esAfirmativo(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['si', 'sí', 'yes', 'ok', '1', 'cierto', 'claro', 'de acuerdo', 'sip', 'sep'].some(a => n.includes(a));
  }

  esNegativo(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['no', '2', 'nop', 'nope', 'negativo', 'nó'].some(neg => n.includes(neg));
  }

  esComandoCancelacion(texto: string): boolean {
    const n = this.normalizarRespuesta(texto);
    return ['cancelar', 'salir', 'exit', 'atras', 'volver'].includes(n);
  }

  extraerRadicado(texto: string): string | null {
    const t = texto.trim().toUpperCase().replace(/\s+/g, '');
    const m1 = t.match(/RAD[-\s]?([A-Z0-9]{6})/i);
    if (m1) return `RAD-${m1[1]}`;
    const m2 = t.match(/RAD[-\s]?(\d{8})[-\s]?([A-Z0-9]{4})/i);
    if (m2) return `RAD-${m2[1]}-${m2[2]}`;
    const m3 = t.match(/^([A-Z0-9]{6})$/);
    if (m3) return `RAD-${m3[1]}`;
    const m4 = t.match(/^(\d{8})[-\s]?([A-Z0-9]{4})$/);
    if (m4) return `RAD-${m4[1]}-${m4[2]}`;
    if (t.includes('RAD')) {
      const m5 = t.match(/RAD[-\s]?([A-Z0-9-]+)/);
      if (m5 && m5[1].length >= 6) return `RAD-${m5[1].replace(/-/g, '')}`;
    }
    return null;
  }

  extraerBusquedaParcial(texto: string): string | null {
    const t = texto.trim().toUpperCase().replace(/\s+/g, '').replace(/^RAD[-\s]?/, '');
    if (t.length >= 4 && /[A-Z0-9]{4,}/.test(t)) return t;
    return null;
  }
}

export const messageParser = new MessageParserService();
