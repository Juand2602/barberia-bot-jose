import { barberiaConfig } from '../../config/whatsapp';

export const NOMBRE_PLACEHOLDER_CLIENTE = 'Cliente WhatsApp';

export const MENSAJES = {
  BIENVENIDA: (nombreBarberia: string = barberiaConfig.nombre, nombreCliente?: string) =>
    `💈 Hola${nombreCliente ? ` ${nombreCliente}` : ''}, te saluda *${nombreBarberia}*, es un gusto atenderte 💈

*¿Necesitas información de...?*

Toca *Ver opciones* para elegir:`,

  UBICACION: (direccion: string = barberiaConfig.direccion) =>
    `💈 Estamos ubicados en *${direccion}*`,

  LISTA_PRECIOS: (servicios: Array<{ nombre: string; precio: number; descripcion?: string }>) => {
    let mensaje = `💈 *Estos son nuestros servicios:*\n\n`;
    servicios.forEach(s => {
      mensaje += `✂️ ${s.nombre} ${formatearPrecio(s.precio)}`;
      if (s.descripcion) mensaje += ` (${s.descripcion})`;
      mensaje += `\n\n`;
    });
    return mensaje.trim();
  },

  ELEGIR_BARBERO_TEXTO: () =>
    `💈 ¿Con cual de nuestros profesionales desea su cita?`,

  SOLICITAR_NOMBRE_COMPLETO: () =>
    `💈 ¿Podría indicarme su *nombre y apellido* por favor?`,

  NOMBRE_INVALIDO: () =>
    `💈 Necesito su *nombre y apellido*, por ejemplo: *Juan Pérez*.`,

  SOLICITAR_FECHA_TEXTO: () =>
    `💈 ¿Para cuando desea su cita?`,

  SOLICITAR_FECHA_ESPECIFICA: () =>
    `💈 Indique la *fecha* deseada (hasta con 7 días de anticipación):\n\n📅 Un día de la semana (ej: *viernes*)\n\n📅 Una fecha (ej: *${ejemploFecha()}*)`,

  FECHA_NO_ENTENDIDA: (texto: string) =>
    `🧑🏾‍🦲 No entendí la fecha "${texto}".\n\nIntente con un día de la semana (ej: *viernes*) o una fecha (ej: *${ejemploFecha()}*).`,

  CONSULTANDO_AGENDA: () => `💈 Un momento por favor, voy a consultar la agenda...`,

  HORARIOS_DISPONIBLES: (horarios: Array<{ numero: number; hora: string }>) => {
    let mensaje = `Tengo los siguientes turnos disponibles:\n\n`;
    horarios.forEach(h => { mensaje += `✂️ ${h.numero}. ${h.hora}\n\n`; });
    mensaje += `💈 Por favor envíeme el *número del turno* que desea.\n\n`;
    mensaje += `Si no desea ninguno de los turnos disponibles envíeme la palabra *Cancelar*`;
    return mensaje;
  },

  HORARIOS_DISPONIBLES_TEXTO: () =>
    `💈 Tengo los siguientes turnos disponibles.\n\nSelecciona un horario de la lista.`,

  NO_HAY_HORARIOS: () => `💈 Lo siento, no hay turnos disponibles para ese día.`,

  HORARIO_YA_OCUPADO: () =>
    `💈 Lo siento, ese horario acaba de ser ocupado por otro cliente.`,

  CITA_CONFIRMADA: (datos: { radicado: string; servicio: string; barbero: string; fecha: string; hora: string }) =>
    `✅ *Su cita ha sido agendada exitosamente*

✂️ Servicio: ${datos.servicio}
👤 Barbero: ${datos.barbero}
📅 Fecha: ${datos.fecha}
⏰ Hora: ${datos.hora}

━━━━━━━━━━━━━━━━
📋 *Código de cita:*

*${datos.radicado}*
━━━━━━━━━━━━━━━━

💡 _Guárdalo para modificar o cancelar tu cita_

¡Le esperamos! 💈`,

  MOSTRAR_CITAS_ACTIVAS: (citas: Array<{ numero: number; radicado: string; servicio: string; fecha: string; hora: string }>) => {
    let mensaje = `📋 *Sus citas activas:*\n\n`;
    citas.forEach(c => {
      mensaje += `${c.numero}. ${c.servicio}\n`;
      mensaje += `   📅 ${c.fecha}\n`;
      mensaje += `   ⏰ ${c.hora}\n`;
      mensaje += `   🔖 ${c.radicado}\n\n`;
    });
    mensaje += `💈 Envíe el *número* de la cita que desea cancelar\n\n_O puede enviar el código de la cita_`;
    return mensaje;
  },

  MOSTRAR_CITAS_ACTIVAS_TEXTO: () =>
    `📋 *Sus citas activas:*\n\nSelecciona la cita que deseas cancelar.`,

  SIN_CITAS_ACTIVAS: () =>
    `💈 No encontré citas activas asociadas a su número de teléfono\n\nSi está seguro de que tiene una cita, por favor verifique el código de radicado y envíemelo directamente`,

  RADICADO_NO_ENCONTRADO: () =>
    `💈 No encontré ninguna cita con ese código. Elige una cita de la lista o vuelve al menú.`,

  CONFIRMAR_CANCELACION: (datos: { radicado: string; servicio: string; fecha: string; hora: string }) =>
    `⚠️ *¿Está seguro que desea cancelar esta cita?*

✂️ Servicio: ${datos.servicio}
📅 Fecha: ${datos.fecha}
⏰ Hora: ${datos.hora}
🔖 Código: ${datos.radicado}`,

  CITA_CANCELADA: () =>
    `✅ *Su cita ha sido cancelada exitosamente*\n\n💈 Si desea agendar una nueva cita, puede escribirnos cuando guste`,

  DESPEDIDA: () =>
    `💈 Ha sido un placer servirle, espero que mi atención haya sido de su agrado, le deseo un feliz resto de día`,

  OPCION_INVALIDA: () =>
    `💈 No entendí su respuesta. Por favor use las opciones del mensaje anterior.`,

  ERROR_SERVIDOR: () =>
    `💈 Lo siento, hubo un problema técnico. Por favor intente nuevamente en unos momentos.`,

  CANCELACION_CONFIRMADA: () =>
    `💈 Proceso cancelado. Si necesita ayuda en el futuro, no dude en contactarnos.`,
};

// Fecha de ejemplo (dentro de 3 días, DD/MM/AAAA) para los textos de ayuda: nunca queda desactualizada.
const ejemploFecha = (): string => {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export const formatearPrecio = (precio: number): string =>
  `${(precio / 1000).toLocaleString('es-CO')} mil pesos`;

export const formatearFecha = (fecha: Date): string => {
  const opciones: Intl.DateTimeFormatOptions = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Bogota',
  };
  return new Date(fecha).toLocaleDateString('es-CO', opciones);
};

export const formatearHora = (hora: string): string => {
  const [hh, mm] = hora.split(':');
  const horas = parseInt(hh);
  const periodo = horas >= 12 ? 'PM' : 'AM';
  const horas12 = horas % 12 || 12;
  return `${horas12}:${mm} ${periodo}`;
};

export const generarRadicado = (): string => {
  const timestamp = Date.now().toString();
  const numeros = timestamp.slice(-6);
  const codigo = parseInt(numeros).toString(36).toUpperCase().padStart(6, '0');
  return `RAD-${codigo}`;
};

// Palabras de navegación/comandos que nunca son parte de un nombre (sin acentos ni mayúsculas).
const PALABRAS_NO_NOMBRE = new Set([
  'menu', 'volver', 'atras', 'cancelar', 'salir', 'exit', 'ninguno',
  'agendar', 'cita', 'fecha', 'hola', 'gracias', 'hoy', 'manana',
]);

export const validarNombreCompleto = (nombre: string): boolean => {
  const texto = nombre.trim();

  // Solo letras (con acentos), espacios, puntos, apóstrofes y guiones: rechaza "12 pm", "25/12", "menu_agendar"
  if (!/^[\p{L}][\p{L}\s.'’-]*$/u.test(texto)) return false;

  const palabras = texto.split(/\s+/);
  if (palabras.length < 2 || !palabras.every(p => p.length >= 2)) return false;

  return !palabras.some(p =>
    PALABRAS_NO_NOMBRE.has(p.toLowerCase().normalize('NFD').replace(/[̀-ͯ.'’-]/g, ''))
  );
};
