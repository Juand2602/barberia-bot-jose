import { barberiaConfig } from '../../config/whatsapp';

export const MENSAJES = {
  BIENVENIDA: (nombreBarberia: string = barberiaConfig.nombre) =>
    `💈 Hola, te saluda *${nombreBarberia}*, es un gusto atenderte 💈

*¿Necesitas información de...?*

Selecciona una opción usando los botones:

Escribe *"cancelar"* en cualquier momento para salir del proceso.`,

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
    `💈 ¿Con cual de nuestros profesionales desea su cita?\n\nSelecciona un barbero de la lista o escribe "ninguno" si ninguno te conviene.\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

  SOLICITAR_NOMBRE_COMPLETO: () =>
    `💈 ¿Podría indicarme su *nombre y apellido* por favor?\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

  NOMBRE_INVALIDO: () =>
    `💈 Por favor lea con atención y responda correctamente\n\nIntente de nuevo por favor\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

  SOLICITAR_FECHA_TEXTO: () =>
    `💈 ¿Para cuando desea su cita?\n\nSeleccione una opción usando los botones.\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

  SOLICITAR_FECHA_ESPECIFICA: () =>
    `💈 Por favor indique la *fecha* deseada:\n\nPuede escribir:\n\n📅 Un día de la semana (ej: *"viernes", "sábado"*)\n\n📅 Una fecha específica (ej: *"25/12/2024"*)\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

  CONSULTANDO_AGENDA: () => `💈 Un momento por favor, voy a consultar la agenda...`,

  HORARIOS_DISPONIBLES: (horarios: Array<{ numero: number; hora: string }>) => {
    let mensaje = `Tengo los siguientes turnos disponibles:\n\n`;
    horarios.forEach(h => { mensaje += `✂️ ${h.numero}. ${h.hora}\n\n`; });
    mensaje += `💈 Por favor envíeme el *número del turno* que desea.\n\n`;
    mensaje += `Si no desea ninguno de los turnos disponibles envíeme la palabra *Cancelar*`;
    return mensaje;
  },

  NO_HAY_HORARIOS: () => `💈 Lo siento, no hay turnos disponibles para ese día.`,

  HORARIO_YA_OCUPADO: () =>
    `💈 Lo siento, ese horario ya ha sido ocupado por otro cliente.\n\nPor favor seleccione otro horario de la lista disponible.`,

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

  SOLICITAR_RADICADO: () =>
    `💈 Para cancelar su cita necesito el código de radicado\n\n¿Tiene con usted el código de su cita?\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

  SIN_RADICADO_BUSCAR_CITAS: () => `💈 No hay problema, déjeme buscar sus citas activas...`,

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
    `📋 *Sus citas activas:*\n\nSelecciona la cita que deseas cancelar de la lista o envía el código de radicado directamente.`,

  SIN_CITAS_ACTIVAS: () =>
    `💈 No encontré citas activas asociadas a su número de teléfono\n\nSi está seguro de que tiene una cita, por favor verifique el código de radicado y envíemelo directamente`,

  SOLICITAR_CODIGO_RADICADO: () =>
    `💈 Por favor envíeme el código de su cita\n\n💡 También puede enviar solo los *números* (ej: 123456) y lo buscaré\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

  RADICADO_NO_ENCONTRADO: () =>
    `💈 No encontré ninguna cita con ese código\n\nPor favor verifique e intente nuevamente, o responda *"no"* para ver sus citas activas\n\nEscribe *"cancelar"* en cualquier momento para salir del proceso.`,

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
    `💈 Por favor lea con atención y responda correctamente\n\nIntente de nuevo por favor`,

  ERROR_SERVIDOR: () =>
    `💈 Lo siento, hubo un problema técnico. Por favor intente nuevamente en unos momentos.`,

  CANCELACION_CONFIRMADA: () =>
    `💈 Proceso cancelado. Si necesita ayuda en el futuro, no dude en contactarnos.`,
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

export const validarNombreCompleto = (nombre: string): boolean => {
  const palabras = nombre.trim().split(/\s+/);
  return palabras.length >= 2 && palabras.every(p => p.length >= 2);
};
