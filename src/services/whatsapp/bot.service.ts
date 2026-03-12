import prisma from '../../config/database';
import { whatsappMessagesService } from './messages.service';
import { messageParser } from './parser.service';
import { MENSAJES, generarRadicado, formatearFecha, formatearHora, validarNombreCompleto } from './templates';
import { clientesService } from '../clientes.service';
import { serviciosService } from '../servicios.service';
import { empleadosService } from '../empleados.service';
import { citasService } from '../citas.service';
import { notificacionesService } from '../notificaciones.service';
import { ConversationState, ConversationContext } from '../../types';
import { botConfig } from '../../config/whatsapp';

type ServicioParaPlantilla = { nombre: string; precio: number; descripcion?: string };

export class WhatsAppBotService {
  async procesarMensaje(telefono: string, mensaje: string, esBoton: boolean = false, buttonId?: string) {
    try {
      if (messageParser.esComandoCancelacion(mensaje)) {
        await this.manejarCancelacionGlobal(telefono);
        return;
      }

      let conversacion = await this.obtenerConversacionActiva(telefono);
      if (!conversacion) {
        conversacion = await this.crearConversacion(telefono);
        await this.enviarMenuPrincipal(telefono);
        return;
      }

      if (!conversacion.cliente) {
        await this.finalizarConversacion(conversacion.id);
        await this.crearConversacion(telefono);
        await this.enviarMenuPrincipal(telefono);
        return;
      }

      await this.actualizarActividad(conversacion.id);
      const estado = conversacion.estado as ConversationState;
      const contexto: ConversationContext = JSON.parse(conversacion.contexto);
      const mensajeAProcesar = esBoton && buttonId ? buttonId : mensaje;
      await this.procesarEstado(telefono, mensajeAProcesar, estado, contexto, conversacion.id);
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
    }
  }

  private async enviarMenuPrincipal(telefono: string) {
    await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.BIENVENIDA(), [
      { id: 'menu_ubicacion', title: '📍 Ubicación' },
      { id: 'menu_precios', title: '💰 Precios' },
      { id: 'menu_agendar', title: '📅 Agendar' },
    ]);
    await whatsappMessagesService.enviarMensajeConBotones(telefono, 'También puedes:', [
      { id: 'menu_cancelar', title: '❌ Cancelar cita' },
    ]);
  }

  private async procesarEstado(telefono: string, mensaje: string, estado: ConversationState, contexto: ConversationContext, conversacionId: string) {
    switch (estado) {
      case 'INICIAL': await this.manejarInicial(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_VER_FOTOS_BARBEROS': await this.manejarVerFotosBarberos(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_BARBERO': await this.manejarSeleccionBarbero(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_NOMBRE': await this.manejarNombre(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_FECHA': await this.manejarFecha(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_FECHA_ESPECIFICA': await this.manejarFechaEspecifica(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_HORA': await this.manejarHora(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_RADICADO': await this.manejarRadicado(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_SELECCION_CITA_CANCELAR': await this.manejarSeleccionCitaCancelar(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_CONFIRMACION_CANCELACION': await this.manejarConfirmacionCancelacion(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_RESPUESTA_UBICACION': await this.manejarRespuestaSimple(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_RESPUESTA_LISTA_PRECIOS': await this.manejarRespuestaSimple(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_RESPUESTA_DESPUES_CITA': await this.manejarRespuestaSimple(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_RESPUESTA_NO_HAY_HORARIOS': await this.manejarRespuestaNoHayHorarios(telefono, mensaje, contexto, conversacionId); break;
      default:
        await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
        await this.actualizarConversacion(conversacionId, 'INICIAL', contexto);
    }
  }

  private async manejarInicial(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'menu_ubicacion') {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.UBICACION());
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Le puedo servir en algo más?', [
        { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_UBICACION', contexto);
      return;
    }

    if (mensaje === 'menu_precios') {
      const servicios = await serviciosService.listarActivos();
      const serviciosPlantilla: ServicioParaPlantilla[] = servicios.map(s => ({ nombre: s.nombre, precio: s.precio, descripcion: s.descripcion ?? undefined }));
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.LISTA_PRECIOS(serviciosPlantilla));
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Le puedo servir en algo más?', [
        { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_LISTA_PRECIOS', contexto);
      return;
    }

    if (mensaje === 'menu_agendar') {
      const barberos = await empleadosService.getAll(true);
      const imagenMosaico = process.env.BARBEROS_MOSAICO_URL;
      if (imagenMosaico) {
        await whatsappMessagesService.enviarImagen(telefono, imagenMosaico, '💈 *Nuestro Equipo de Profesionales*\n\nSelecciona tu barbero de confianza:');
        await new Promise(r => setTimeout(r, 800));
      } else {
        await whatsappMessagesService.enviarMensaje(telefono, '💈 *Nuestro Equipo de Profesionales*\n\nSelecciona tu barbero de confianza:');
        await new Promise(r => setTimeout(r, 500));
      }
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Deseas ver las fotos individuales de cada barbero?', [
        { id: 'ver_fotos_si', title: '👀 Sí, ver fotos' },
        { id: 'ver_fotos_no', title: '➡️ No, continuar' },
      ]);
      contexto.barberos = barberos.map(b => ({ id: b.id, nombre: b.nombre, fotoUrl: b.fotoUrl, especialidades: b.especialidades }));
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_VER_FOTOS_BARBEROS', contexto);
      return;
    }

    if (mensaje === 'menu_cancelar') {
      await this.buscarYMostrarCitasActivas(telefono, conversacionId, contexto);
      return;
    }

    await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    await this.enviarMenuPrincipal(telefono);
  }

  private async manejarVerFotosBarberos(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'ver_fotos_si') {
      for (const barbero of (contexto.barberos || [])) {
        if (barbero.fotoUrl) {
          const esp = barbero.especialidades ? `✂️ ${Array.isArray(barbero.especialidades) ? barbero.especialidades.join(', ') : barbero.especialidades}` : '';
          try {
            await whatsappMessagesService.enviarImagen(telefono, barbero.fotoUrl, `👨‍🦲 *${barbero.nombre}*\n${esp}`);
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) { console.error(`Error foto ${barbero.nombre}:`, e); }
        }
      }
      await new Promise(r => setTimeout(r, 500));
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, '✅ Perfecto, continuemos con tu cita');
      await new Promise(r => setTimeout(r, 500));
    }

    const barberos = contexto.barberos || await empleadosService.getAll(true);
    await whatsappMessagesService.enviarMensajeConLista(
      telefono, MENSAJES.ELEGIR_BARBERO_TEXTO(), 'Ver barberos',
      [{ title: 'Nuestros Profesionales', rows: barberos.map((b: any) => ({ id: `barbero_${b.id}`, title: b.nombre.substring(0, 24), description: (Array.isArray(b.especialidades) ? b.especialidades.join(', ') : String(b.especialidades || 'Barbero profesional')).substring(0, 72) })) }]
    );
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_BARBERO', contexto);
  }

  private async manejarRespuestaSimple(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'si_mas' || messageParser.esAfirmativo(mensaje)) {
      await this.enviarMenuPrincipal(telefono);
      await this.actualizarConversacion(conversacionId, 'INICIAL', contexto);
    } else if (mensaje === 'no_mas' || messageParser.esNegativo(mensaje)) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async manejarRespuestaNoHayHorarios(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'si_mas' || messageParser.esAfirmativo(mensaje)) {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_FECHA_TEXTO(), [
        { id: 'fecha_hoy', title: '📅 Hoy' }, { id: 'fecha_manana', title: '📅 Mañana' }, { id: 'fecha_otro_dia', title: '📅 Otro día' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_FECHA', contexto);
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
    }
  }

  private async manejarSeleccionBarbero(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje.startsWith('barbero_')) {
      const barberoId = mensaje.replace('barbero_', '');
      const barberos = await empleadosService.getAll(true);
      const barbero = barberos.find(b => b.id === barberoId);
      if (barbero) {
        contexto.empleadoId = barbero.id;
        contexto.empleadoNombre = barbero.nombre;
        await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.SOLICITAR_NOMBRE_COMPLETO());
        await this.actualizarConversacion(conversacionId, 'ESPERANDO_NOMBRE', contexto);
        return;
      }
    }
    if (messageParser.normalizarRespuesta(mensaje) === 'ninguno') {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async manejarNombre(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (validarNombreCompleto(mensaje)) {
      contexto.nombre = mensaje;
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_FECHA_TEXTO(), [
        { id: 'fecha_hoy', title: '📅 Hoy' }, { id: 'fecha_manana', title: '📅 Mañana' }, { id: 'fecha_otro_dia', title: '📅 Otro día' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_FECHA', contexto);
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.NOMBRE_INVALIDO());
    }
  }

  private async manejarFecha(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    let fecha: Date | null = null;
    if (mensaje === 'fecha_hoy') { fecha = new Date(); }
    else if (mensaje === 'fecha_manana') { fecha = new Date(); fecha.setDate(fecha.getDate() + 1); }
    else if (mensaje === 'fecha_otro_dia') {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.SOLICITAR_FECHA_ESPECIFICA());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_FECHA_ESPECIFICA', contexto);
      return;
    } else { fecha = messageParser.parsearFecha(mensaje); }

    if (fecha) await this.procesarFechaSeleccionada(telefono, fecha, contexto, conversacionId);
    else await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
  }

  private async manejarFechaEspecifica(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const fecha = messageParser.parsearFecha(mensaje);
    if (fecha) await this.procesarFechaSeleccionada(telefono, fecha, contexto, conversacionId);
    else await whatsappMessagesService.enviarMensaje(telefono, `🧑🏾‍🦲 No entendí la fecha "${mensaje}".\n\nIntente con:\n• Un día: "viernes", "sábado"\n• Una fecha: "25/12/2024"\n\nO escriba *"cancelar"* para salir.`);
  }

  private async procesarFechaSeleccionada(telefono: string, fecha: Date, contexto: ConversationContext, conversacionId: string) {
    const fechaLocal = new Date(fecha); fechaLocal.setHours(0, 0, 0, 0);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    if (fechaLocal < hoy) {
      await whatsappMessagesService.enviarMensaje(telefono, '🧑🏾‍🦲 Lo siento, no puedo agendar citas en fechas pasadas.\n\nPor favor seleccione una fecha válida.');
      return;
    }

    const maxFecha = new Date(hoy); maxFecha.setDate(maxFecha.getDate() + 7);
    if (fechaLocal > maxFecha) {
      await whatsappMessagesService.enviarMensaje(telefono, `🧑🏾‍🦲 Solo puede agendar con hasta *7 días* de anticipación.\n\nFecha límite: ${formatearFecha(maxFecha)}`);
      return;
    }

    contexto.fecha = fechaLocal.toISOString();
    await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.CONSULTANDO_AGENDA());

    let horarios = await citasService.calcularHorariosDisponibles(contexto.empleadoId!, fechaLocal, 50);

    const esHoy = fechaLocal.getTime() === hoy.getTime();
    if (esHoy) {
      const ahora = new Date();
      const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
      horarios = horarios.filter(h => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm > ahoraMin; });
    }

    if (horarios.length > 0) {
      const horariosFormateados = horarios.map((h, i) => ({ numero: i + 1, hora: formatearHora(h) }));
      contexto.horariosDisponibles = horariosFormateados;
      contexto.horariosRaw = horarios;
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.HORARIOS_DISPONIBLES(horariosFormateados));
      await whatsappMessagesService.enviarMensajeConBotones(telefono, 'O si prefieres otra fecha:', [
        { id: 'cambiar_fecha', title: '📅 Cambiar fecha' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_HORA', contexto);
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.NO_HAY_HORARIOS());
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Desea intentar con otra fecha?', [
        { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_NO_HAY_HORARIOS', contexto);
    }
  }

  private async manejarHora(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (messageParser.esComandoCancelacion(mensaje)) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
      return;
    }

    if (mensaje === 'cambiar_fecha') {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_FECHA_TEXTO(), [
        { id: 'fecha_hoy', title: '📅 Hoy' }, { id: 'fecha_manana', title: '📅 Mañana' }, { id: 'fecha_otro_dia', title: '📅 Otro día' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_FECHA', contexto);
      return;
    }

    let opcion: number | null = null;
    if (mensaje.startsWith('hora_')) {
      const idx = parseInt(mensaje.replace('hora_', ''));
      if (!isNaN(idx)) opcion = idx + 1;
    } else {
      opcion = messageParser.parsearOpcionNumerica(mensaje, contexto.horariosDisponibles?.length || 0);
    }

    if (opcion && contexto.horariosRaw) {
      const horaSeleccionada = contexto.horariosRaw[opcion - 1];
      contexto.hora = horaSeleccionada;

      const cliente = await clientesService.obtenerOCrear(telefono, contexto.nombre!);
      if (!cliente) { await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR()); return; }

      const fechaBase = new Date(contexto.fecha!);
      const [h, m] = horaSeleccionada.split(':').map(Number);
      const fechaHora = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate(), h, m, 0, 0);

      const radicado = generarRadicado();
      const servicios = await serviciosService.listarActivos();
      const servicioPred = process.env.SERVICIO_PREDETERMINADO || 'Corte Básico';
      const servicio = servicios.find(s => s.nombre.toLowerCase().includes(servicioPred.toLowerCase())) || servicios[0];

      if (!servicio) { await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR()); return; }

      try {
        const citaCreada = await citasService.create({
          radicado, clienteId: cliente.id, empleadoId: contexto.empleadoId!,
          servicioNombre: servicio.nombre, fechaHora, duracionMinutos: servicio.duracionMinutos, origen: 'WHATSAPP',
        });

        try { await notificacionesService.notificarCitaAgendada(citaCreada.id); } catch (e) { console.error('Error notificaciones:', e); }

        await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.CITA_CONFIRMADA({
          radicado, servicio: servicio.nombre, barbero: contexto.empleadoNombre!,
          fecha: formatearFecha(fechaHora), hora: formatearHora(horaSeleccionada),
        }));
        await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Le puedo servir en algo más?', [
          { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
        ]);
        await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', contexto);
      } catch (createError: any) {
        if (createError.message.includes('ya no está disponible') || createError.message.includes('ya está agendada') || createError.message.includes('no está disponible')) {
          await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.HORARIO_YA_OCUPADO());
          const horariosNuevos = await citasService.calcularHorariosDisponibles(contexto.empleadoId!, fechaBase, servicio.duracionMinutos);
          if (horariosNuevos.length > 0) {
            const fmt = horariosNuevos.map((hora, i) => ({ numero: i + 1, hora: formatearHora(hora) }));
            contexto.horariosDisponibles = fmt;
            contexto.horariosRaw = horariosNuevos;
            await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.HORARIOS_DISPONIBLES(fmt));
            await this.actualizarConversacion(conversacionId, 'ESPERANDO_HORA', contexto);
          } else {
            await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.NO_HAY_HORARIOS());
            await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Desea intentar con otra fecha?', [
              { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
            ]);
            await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_NO_HAY_HORARIOS', contexto);
          }
        } else { throw createError; }
      }
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.OPCION_INVALIDA());
    }
  }

  private async manejarRadicado(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'tengo_radicado' || messageParser.esAfirmativo(mensaje)) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.SOLICITAR_CODIGO_RADICADO());
      return;
    }
    if (mensaje === 'no_radicado' || messageParser.esNegativo(mensaje)) {
      await this.buscarYMostrarCitasActivas(telefono, conversacionId, contexto);
      return;
    }
    await this.buscarCitaPorRadicado(telefono, mensaje, contexto, conversacionId);
  }

  private async buscarYMostrarCitasActivas(telefono: string, conversacionId: string, contexto: ConversationContext) {
    await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.SIN_RADICADO_BUSCAR_CITAS());
    const citasActivas = await prisma.cita.findMany({
      where: { cliente: { telefono }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] }, fechaHora: { gte: new Date() } },
      include: { cliente: true, empleado: true },
      orderBy: { fechaHora: 'asc' }, take: 5,
    });

    if (citasActivas.length === 0) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.SIN_CITAS_ACTIVAS());
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Le puedo servir en algo más?', [
        { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', {});
      return;
    }

    const citasFormateadas = citasActivas.map((c, i) => ({ numero: i + 1, radicado: c.radicado, servicio: c.servicioNombre, fecha: formatearFecha(c.fechaHora), hora: formatearHora(c.fechaHora.toTimeString().substring(0, 5)) }));
    contexto.citasDisponibles = citasFormateadas;

    await whatsappMessagesService.enviarMensajeConLista(
      telefono, MENSAJES.MOSTRAR_CITAS_ACTIVAS_TEXTO(), 'Ver mis citas',
      [{ title: 'Citas Activas', rows: citasFormateadas.map(c => ({ id: `cita_${c.radicado}`, title: c.servicio.substring(0, 24), description: `${c.fecha} - ${c.hora}`.substring(0, 72) })) }]
    );
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_SELECCION_CITA_CANCELAR', contexto);
  }

  private async manejarSeleccionCitaCancelar(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const radicado = mensaje.startsWith('cita_') ? mensaje.replace('cita_', '') : mensaje;
    await this.buscarCitaPorRadicado(telefono, radicado, contexto, conversacionId);
  }

  private async buscarCitaPorRadicado(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const radicado = messageParser.extraerRadicado(mensaje);
    if (radicado) {
      const cita = await citasService.buscarPorRadicado(radicado);
      if (cita && cita.cliente.telefono === telefono) {
        await this.confirmarCancelacionCita(telefono, cita, contexto, conversacionId);
        return;
      }
    }

    const busquedaParcial = messageParser.extraerBusquedaParcial(mensaje);
    if (busquedaParcial) {
      const coincidentes = await prisma.cita.findMany({
        where: { cliente: { telefono }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] }, radicado: { contains: busquedaParcial, mode: 'insensitive' } },
        include: { cliente: true, empleado: true }, orderBy: { fechaHora: 'desc' }, take: 1,
      });
      if (coincidentes.length > 0) { await this.confirmarCancelacionCita(telefono, coincidentes[0], contexto, conversacionId); return; }
    }

    await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.RADICADO_NO_ENCONTRADO());
  }

  private async confirmarCancelacionCita(telefono: string, cita: any, contexto: ConversationContext, conversacionId: string) {
    contexto.radicado = cita.radicado;
    contexto.citaId = cita.id;
    await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.CONFIRMAR_CANCELACION({ radicado: cita.radicado, servicio: cita.servicioNombre, fecha: formatearFecha(cita.fechaHora), hora: formatearHora(cita.fechaHora.toTimeString().substring(0, 5)) }));
    await whatsappMessagesService.enviarMensajeConBotones(telefono, 'Por favor confirme:', [
      { id: 'confirmar_cancelar', title: '✅ Sí, cancelar' },
      { id: 'conservar_cita', title: '❌ No, conservar' },
    ]);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_CONFIRMACION_CANCELACION', contexto);
  }

  private async manejarConfirmacionCancelacion(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    const n = messageParser.normalizarRespuesta(mensaje);
    if (mensaje === 'confirmar_cancelar' || messageParser.esAfirmativo(n) || n.includes('cancelar')) {
      const citaCancelada = await citasService.cancelar(contexto.radicado!);
      try { await notificacionesService.notificarCitaCancelada(citaCancelada.id); } catch (e) { console.error('Error notificando cancelación:', e); }
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.CITA_CANCELADA());
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Le puedo servir en algo más?', [
        { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', {});
    } else {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Le puedo servir en algo más?', [
        { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', {});
    }
  }

  private async manejarCancelacionGlobal(telefono: string) {
    const conv = await this.obtenerConversacionActiva(telefono);
    if (conv) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.CANCELACION_CONFIRMADA());
      await this.finalizarConversacion(conv.id);
    } else {
      await this.enviarMenuPrincipal(telefono);
    }
  }

  private async obtenerConversacionActiva(telefono: string) {
    return prisma.conversacion.findFirst({ where: { telefono, activa: true }, include: { cliente: true } });
  }

  private async crearConversacion(telefono: string) {
    let cliente = await clientesService.buscarPorTelefono(telefono);
    if (!cliente) cliente = await clientesService.crear({ nombre: 'Cliente WhatsApp', telefono });
    return prisma.conversacion.create({
      data: { clienteId: cliente.id, telefono, estado: 'INICIAL', contexto: JSON.stringify({}), activa: true },
      include: { cliente: true },
    });
  }

  private async actualizarConversacion(id: string, estado: ConversationState, contexto: ConversationContext) {
    return prisma.conversacion.update({ where: { id }, data: { estado, contexto: JSON.stringify(contexto), lastActivity: new Date() } });
  }

  private async actualizarActividad(id: string) {
    return prisma.conversacion.update({ where: { id }, data: { lastActivity: new Date() } });
  }

  private async finalizarConversacion(id: string) {
    return prisma.conversacion.update({ where: { id }, data: { activa: false, estado: 'COMPLETADA' } });
  }
}

export const whatsappBotService = new WhatsAppBotService();

export async function limpiarConversacionesInactivas() {
  const fechaLimite = new Date(Date.now() - botConfig.timeoutConversacion);
  const result = await prisma.conversacion.updateMany({ where: { activa: true, lastActivity: { lt: fechaLimite } }, data: { activa: false } });
  if (result.count > 0) console.log(`✅ ${result.count} conversaciones inactivas limpiadas`);
}
