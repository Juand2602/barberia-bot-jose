import prisma from '../../config/database';
import { whatsappMessagesService } from './messages.service';
import { messageParser } from './parser.service';
import { MENSAJES, generarRadicado, formatearFecha, formatearHora, validarNombreCompleto, NOMBRE_PLACEHOLDER_CLIENTE } from './templates';
import { clientesService } from '../clientes.service';
import { serviciosService } from '../servicios.service';
import { empleadosService } from '../empleados.service';
import { citasService } from '../citas.service';
import { notificacionesService } from '../notificaciones.service';
import { ConversationState, ConversationContext } from '../../types';
import { botConfig, barberiaConfig } from '../../config/whatsapp';

// Ids de botones/filas del bot (menu_agendar, hora_3, cita_RAD-XXXX...): una sola palabra con
// guion bajo. Si llega uno que el estado actual no espera (doble toque, botón de un mensaje
// viejo) se ignora sin responder, en vez de enviar un mensaje que no aporta.
const ID_INTERACTIVO = /^\S+_\S+$/;

// Botones de salida para pasos donde el usuario escribe texto libre. Los ids 'volver' y 'menu'
// los resuelve el manejo global de navegación (parser.esComandoVolver / esComandoMenu).
const botonesNavegacion = () => [
  { id: 'volver', title: '← Volver' },
  { id: 'menu', title: '📋 Menú principal' },
];

type ServicioParaPlantilla = { nombre: string; precio: number; descripcion?: string };

export class WhatsAppBotService {
  async procesarMensaje(telefono: string, mensaje: string, esBoton: boolean = false, buttonId?: string) {
    try {
      if (messageParser.esComandoMenu(mensaje)) {
        await this.manejarComandoMenu(telefono);
        return;
      }

      // "volver"/"atras" (escrito o como id de un botón/fila): un paso atrás desde cualquier estado
      if (messageParser.esComandoVolver(mensaje)) {
        await this.manejarComandoVolver(telefono);
        return;
      }

      if (messageParser.esComandoCancelacion(mensaje)) {
        await this.manejarCancelacionGlobal(telefono);
        return;
      }

      let conversacion = await this.obtenerConversacionActiva(telefono);
      if (!conversacion) {
        conversacion = await this.crearConversacion(telefono);
        await this.enviarMenuPrincipal(telefono, this.nombreClienteReal(conversacion.cliente.nombre));
        return;
      }

      if (!conversacion.cliente) {
        await this.finalizarConversacion(conversacion.id);
        const nuevaConversacion = await this.crearConversacion(telefono);
        await this.enviarMenuPrincipal(telefono, this.nombreClienteReal(nuevaConversacion.cliente.nombre));
        return;
      }

      await this.actualizarActividad(conversacion.id);
      const estado = conversacion.estado as ConversationState;
      const contexto: ConversationContext = JSON.parse(conversacion.contexto);

      // El jefe agenda a nombre de un cliente distinto cada vez: su propio nombre guardado en BD
      // no debe usarse para saltar la pregunta del nombre de ESE cliente.
      const telefonoJefe = process.env.JEFE_BARBERO_TELEFONO;
      if (!telefonoJefe || telefono !== telefonoJefe) {
        contexto._nombreClienteDb = conversacion.cliente.nombre;
      }

      const mensajeAProcesar = esBoton && buttonId ? buttonId : mensaje;
      await this.procesarEstado(telefono, mensajeAProcesar, estado, contexto, conversacion.id);
    } catch (error: any) {
      // Solo el mensaje/respuesta, no el objeto completo: un error de Axios trae sockets y
      // structs internas de Node que generan miles de líneas de log por cada fallo.
      console.error('Error procesando mensaje:', error?.response?.data || error?.message || error);
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR());
    }
  }

  private nombreClienteReal(nombre?: string | null): string | undefined {
    if (!nombre) return undefined;
    const normalizado = nombre.trim();
    if (!normalizado || normalizado.toLowerCase() === NOMBRE_PLACEHOLDER_CLIENTE.toLowerCase()) {
      return undefined;
    }
    return normalizado;
  }

  private async enviarMenuPrincipal(telefono: string, nombreCliente?: string) {
    // El saludo lleva el nombre real (si ya agendó antes) en todos los menús, no solo al iniciar
    // la conversación: si no llega como parámetro se consulta por teléfono.
    const nombre = nombreCliente ?? this.nombreClienteReal(
      (await prisma.cliente.findUnique({ where: { telefono }, select: { nombre: true } }))?.nombre
    );

    await whatsappMessagesService.enviarMensajeConLista(
      telefono,
      MENSAJES.BIENVENIDA(undefined, nombre),
      'Ver opciones',
      [{
        title: 'Menú principal',
        rows: [
          { id: 'menu_agendar', title: '📅 Agendar cita', description: 'Reserva tu turno' },
          { id: 'menu_cancelar', title: '❌ Cancelar cita', description: 'Cancela una cita activa' },
          { id: 'menu_ubicacion', title: '📍 Ubicación', description: 'Cómo llegar a la barbería' },
          { id: 'menu_precios', title: '💰 Precios', description: 'Conoce nuestros servicios' },
        ],
      }]
    );
  }

  private async procesarEstado(telefono: string, mensaje: string, estado: ConversationState, contexto: ConversationContext, conversacionId: string) {
    switch (estado) {
      case 'INICIAL': await this.manejarInicial(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_BARBERO': await this.manejarSeleccionBarbero(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_NOMBRE': await this.manejarNombre(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_FECHA': await this.manejarFecha(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_FECHA_ESPECIFICA': await this.manejarFechaEspecifica(telefono, mensaje, contexto, conversacionId); break;
      case 'ESPERANDO_HORA': await this.manejarHora(telefono, mensaje, contexto, conversacionId); break;
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
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.UBICACION(), [
        { id: 'menu_agendar', title: '📅 Agendar Cita' },
        { id: 'menu_principal', title: '📋 Menú Principal' },
        { id: 'menu_salir', title: '👋 Salir' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_UBICACION', contexto);
      return;
    }

    if (mensaje === 'menu_precios') {
      const servicios = await serviciosService.listarActivos();
      const serviciosPlantilla: ServicioParaPlantilla[] = servicios.map(s => ({ nombre: s.nombre, precio: s.precio, descripcion: s.descripcion ?? undefined }));
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.LISTA_PRECIOS(serviciosPlantilla), [
        { id: 'menu_agendar', title: '📅 Agendar Cita' },
        { id: 'menu_principal', title: '📋 Menú Principal' },
        { id: 'menu_salir', title: '👋 Salir' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_LISTA_PRECIOS', contexto);
      return;
    }

    if (mensaje === 'menu_agendar') {
      await this.iniciarAgendamiento(telefono, contexto, conversacionId);
      return;
    }

    if (mensaje === 'menu_cancelar') {
      await this.buscarYMostrarCitasActivas(telefono, conversacionId, contexto);
      return;
    }

    // Texto libre en el menú: basta con reenviar el menú (1 mensaje), sin "opción inválida" aparte.
    await this.enviarMenuPrincipal(telefono);
  }

  private async iniciarAgendamiento(telefono: string, contexto: ConversationContext, conversacionId: string) {
    const barberos = await empleadosService.getAll(true);

    if (barberos.length === 1) {
      // Un solo barbero activo: se omite la lista y se va directo a pedir el nombre (1 mensaje
      // menos). Si más adelante se activa un segundo barbero, la lista vuelve a aparecer sola.
      contexto.empleadoId = barberos[0].id;
      contexto.empleadoNombre = barberos[0].nombre;
      await this.pedirNombreOAvanzar(telefono, contexto, conversacionId);
      return;
    }

    await whatsappMessagesService.enviarMensajeConLista(
      telefono, MENSAJES.ELEGIR_BARBERO_TEXTO(), 'Ver barberos',
      [
        { title: 'Nuestros Profesionales', rows: barberos.map(b => ({ id: `barbero_${b.id}`, title: b.nombre.substring(0, 24), description: (Array.isArray(b.especialidades) ? b.especialidades.join(', ') : String(b.especialidades || 'Barbero profesional')).substring(0, 72) })) },
        { title: 'Otras opciones', rows: [{ id: 'menu', title: '📋 Volver al menú' }] },
      ]
    );
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_BARBERO', contexto);
  }

  private async manejarRespuestaSimple(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje === 'menu_agendar') {
      await this.manejarInicial(telefono, 'menu_agendar', contexto, conversacionId);
      return;
    }

    if (mensaje === 'menu_principal' || mensaje === 'si_mas' || messageParser.esAfirmativo(mensaje)) {
      await this.enviarMenuPrincipal(telefono);
      await this.actualizarConversacion(conversacionId, 'INICIAL', contexto);
    } else if (mensaje === 'menu_salir' || mensaje === 'no_mas' || messageParser.esNegativo(mensaje)) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
    } else {
      await this.enviarOpcionInvalida(telefono, mensaje);
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
        await this.pedirNombreOAvanzar(telefono, contexto, conversacionId);
        return;
      }
    }
    // "ninguno" ya no despide ni cierra la conversación: lleva al menú, en silencio.
    if (messageParser.normalizarRespuesta(mensaje) === 'ninguno') {
      await this.manejarComandoMenu(telefono);
    } else {
      await this.enviarOpcionInvalida(telefono, mensaje);
    }
  }

  private async manejarNombre(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (ID_INTERACTIVO.test(mensaje)) {
      console.log(`ℹ️ Botón/fila fuera de contexto ignorado: ${mensaje}`);
      return;
    }

    if (validarNombreCompleto(mensaje)) {
      contexto.nombre = mensaje.trim();
      await this.avanzarAFecha(telefono, contexto, conversacionId);
    } else {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.NOMBRE_INVALIDO(), botonesNavegacion());
    }
  }

  // Nombre ya conocido: el registrado en BD (no el placeholder, y nunca para el jefe agendando a
  // nombre de otro) o el que el usuario ya escribió en esta conversación.
  private nombreClienteConocido(contexto: ConversationContext): string | undefined {
    const nombreBD = contexto._nombreClienteDb
      && contexto._nombreClienteDb.trim().toLowerCase() !== NOMBRE_PLACEHOLDER_CLIENTE.toLowerCase()
      && validarNombreCompleto(contexto._nombreClienteDb)
      ? contexto._nombreClienteDb
      : undefined;
    return nombreBD ?? (contexto.nombre && validarNombreCompleto(contexto.nombre) ? contexto.nombre : undefined);
  }

  private async pedirNombreOAvanzar(telefono: string, contexto: ConversationContext, conversacionId: string) {
    const nombreConocido = this.nombreClienteConocido(contexto);
    if (nombreConocido) {
      contexto.nombre = nombreConocido;
      await this.avanzarAFecha(telefono, contexto, conversacionId);
    } else {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_NOMBRE_COMPLETO(), botonesNavegacion());
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_NOMBRE', contexto);
    }
  }

  private async avanzarAFecha(telefono: string, contexto: ConversationContext, conversacionId: string) {
    await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.SOLICITAR_FECHA_TEXTO(), [
      { id: 'fecha_hoy', title: '📅 Hoy' }, { id: 'fecha_manana', title: '📅 Mañana' }, { id: 'fecha_otro_dia', title: '📅 Otro día' },
    ]);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_FECHA', contexto);
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
    else await this.enviarOpcionInvalida(telefono, mensaje);
  }

  private async manejarFechaEspecifica(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (ID_INTERACTIVO.test(mensaje)) {
      console.log(`ℹ️ Botón/fila fuera de contexto ignorado: ${mensaje}`);
      return;
    }

    const fecha = messageParser.parsearFecha(mensaje);
    if (fecha) await this.procesarFechaSeleccionada(telefono, fecha, contexto, conversacionId);
    else await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.FECHA_NO_ENTENDIDA(mensaje), botonesNavegacion());
  }

  private async procesarFechaSeleccionada(telefono: string, fecha: Date, contexto: ConversationContext, conversacionId: string) {
    const fechaLocal = new Date(fecha); fechaLocal.setHours(0, 0, 0, 0);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    if (fechaLocal < hoy) {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '🧑🏾‍🦲 Lo siento, no puedo agendar citas en fechas pasadas.\n\nPor favor elija una fecha válida.', botonesNavegacion());
      return;
    }

    const maxFecha = new Date(hoy); maxFecha.setDate(maxFecha.getDate() + 7);
    if (fechaLocal > maxFecha) {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, `🧑🏾‍🦲 Solo puede agendar con hasta *7 días* de anticipación.\n\nFecha límite: ${formatearFecha(maxFecha)}`, botonesNavegacion());
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
      await this.enviarHorariosDisponibles(telefono, horarios, contexto, conversacionId);
    } else {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.NO_HAY_HORARIOS());
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '¿Desea intentar con otra fecha?', [
        { id: 'si_mas', title: '✅ Sí' }, { id: 'no_mas', title: '❌ No' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_NO_HAY_HORARIOS', contexto);
    }
  }

  // Máx. 10 filas por lista de Meta: 9 turnos + la fila "Cambiar fecha". Con más turnos, un solo
  // mensaje con la lista numerada en el cuerpo y el botón de cambiar fecha (1 mensaje, no 2).
  private async enviarHorariosDisponibles(telefono: string, horarios: string[], contexto: ConversationContext, conversacionId: string) {
    const horariosFormateados = horarios.map((h, i) => ({ numero: i + 1, hora: formatearHora(h) }));
    contexto.horariosDisponibles = horariosFormateados;
    contexto.horariosRaw = horarios;

    if (horarios.length <= 9) {
      await whatsappMessagesService.enviarMensajeConLista(
        telefono,
        MENSAJES.HORARIOS_DISPONIBLES_TEXTO(),
        'Ver horarios',
        [{
          title: 'Turnos disponibles',
          rows: [
            ...horariosFormateados.map((h, idx) => ({ id: `hora_${idx}`, title: h.hora })),
            { id: 'cambiar_fecha', title: '📅 Cambiar fecha' },
          ],
        }]
      );
    } else {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.HORARIOS_DISPONIBLES(horariosFormateados), [
        { id: 'cambiar_fecha', title: '📅 Cambiar fecha' },
      ]);
    }

    await this.actualizarConversacion(conversacionId, 'ESPERANDO_HORA', contexto);
  }

  private async manejarHora(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (messageParser.esComandoCancelacion(mensaje)) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.DESPEDIDA());
      await this.finalizarConversacion(conversacionId);
      return;
    }

    if (mensaje === 'cambiar_fecha') {
      await this.avanzarAFecha(telefono, contexto, conversacionId);
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

      const telefonoJefe = process.env.JEFE_BARBERO_TELEFONO;
      const esJefe = telefonoJefe && telefono === telefonoJefe;
      const cliente = esJefe
        ? await clientesService.obtenerOCrearDesdeJefe(contexto.nombre!, telefono)
        : await clientesService.obtenerOCrear(telefono, contexto.nombre!);
      if (!cliente) { await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR()); return; }

      const fechaBase = new Date(contexto.fecha!);
      const [h, m] = horaSeleccionada.split(':').map(Number);
      const fechaHora = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), fechaBase.getDate(), h, m, 0, 0);

      const radicado = generarRadicado();
      const servicios = await serviciosService.listarActivos();
      const servicio = servicios.find(s => s.nombre.toLowerCase().includes(barberiaConfig.servicioPredeterminado.toLowerCase())) || servicios[0];

      if (!servicio) { await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.ERROR_SERVIDOR()); return; }

      try {
        const citaCreada = await citasService.create({
          radicado, clienteId: cliente.id, empleadoId: contexto.empleadoId!,
          servicioNombre: servicio.nombre, fechaHora, duracionMinutos: servicio.duracionMinutos, origen: 'WHATSAPP',
        });

        try { await notificacionesService.notificarCitaAgendada(citaCreada.id); } catch (e) { console.error('Error notificaciones:', e); }

        await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.CITA_CONFIRMADA({
          radicado, servicio: servicio.nombre, barbero: contexto.empleadoNombre!,
          fecha: formatearFecha(fechaHora), hora: formatearHora(horaSeleccionada),
        }), [
          { id: 'menu_agendar', title: '📅 Agendar otra' },
          { id: 'menu_principal', title: '📋 Menú Principal' },
          { id: 'menu_salir', title: '👋 No, gracias' },
        ]);
        await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', contexto);
      } catch (createError: any) {
        if (createError.message.includes('ya no está disponible') || createError.message.includes('ya está agendada') || createError.message.includes('no está disponible')) {
          await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.HORARIO_YA_OCUPADO());
          const horariosNuevos = await citasService.calcularHorariosDisponibles(contexto.empleadoId!, fechaBase, servicio.duracionMinutos);
          if (horariosNuevos.length > 0) {
            await this.enviarHorariosDisponibles(telefono, horariosNuevos, contexto, conversacionId);
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
      await this.enviarOpcionInvalida(telefono, mensaje);
    }
  }

  private async buscarYMostrarCitasActivas(telefono: string, conversacionId: string, contexto: ConversationContext) {
    const citasActivas = await prisma.cita.findMany({
      where: { cliente: { telefono }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] }, fechaHora: { gte: new Date() } },
      include: { cliente: true, empleado: true },
      orderBy: { fechaHora: 'asc' }, take: 5,
    });

    if (citasActivas.length === 0) {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.SIN_CITAS_ACTIVAS(), [
        { id: 'menu_agendar', title: '📅 Agendar Cita' },
        { id: 'menu_principal', title: '📋 Menú Principal' },
        { id: 'menu_salir', title: '👋 Salir' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', contexto);
      return;
    }

    const citasFormateadas = citasActivas.map((c, i) => ({ numero: i + 1, radicado: c.radicado, servicio: c.servicioNombre, fecha: formatearFecha(c.fechaHora), hora: formatearHora(c.fechaHora.toTimeString().substring(0, 5)) }));
    contexto.citasDisponibles = citasFormateadas;

    await whatsappMessagesService.enviarMensajeConLista(
      telefono, MENSAJES.MOSTRAR_CITAS_ACTIVAS_TEXTO(), 'Ver mis citas',
      [
        { title: 'Citas Activas', rows: citasFormateadas.map(c => ({ id: `cita_${c.radicado}`, title: c.servicio.substring(0, 24), description: `${c.fecha} - ${c.hora}`.substring(0, 72) })) },
        { title: 'Otras opciones', rows: [{ id: 'menu', title: '📋 Volver al menú' }] },
      ]
    );
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_SELECCION_CITA_CANCELAR', contexto);
  }

  private async manejarSeleccionCitaCancelar(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    if (mensaje.startsWith('cita_')) {
      await this.buscarCitaPorRadicado(telefono, mensaje.replace('cita_', ''), contexto, conversacionId);
      return;
    }

    if (ID_INTERACTIVO.test(mensaje)) {
      console.log(`ℹ️ Botón/fila fuera de contexto ignorado: ${mensaje}`);
      return;
    }

    await this.buscarCitaPorRadicado(telefono, mensaje, contexto, conversacionId);
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

    await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.RADICADO_NO_ENCONTRADO(), [
      { id: 'menu', title: '📋 Menú principal' },
    ]);
  }

  private async confirmarCancelacionCita(telefono: string, cita: any, contexto: ConversationContext, conversacionId: string) {
    contexto.radicado = cita.radicado;
    contexto.citaId = cita.id;
    await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.CONFIRMAR_CANCELACION({ radicado: cita.radicado, servicio: cita.servicioNombre, fecha: formatearFecha(cita.fechaHora), hora: formatearHora(cita.fechaHora.toTimeString().substring(0, 5)) }), [
      { id: 'confirmar_cancelar', title: '✅ Sí, cancelar' },
      { id: 'conservar_cita', title: '❌ No, conservar' },
    ]);
    await this.actualizarConversacion(conversacionId, 'ESPERANDO_CONFIRMACION_CANCELACION', contexto);
  }

  private async manejarConfirmacionCancelacion(telefono: string, mensaje: string, contexto: ConversationContext, conversacionId: string) {
    // Cancelar es irreversible: un botón/fila de OTRO mensaje (p. ej. "menu_cancelar" del menú, o
    // "cita_..." de la lista) nunca debe contar como respuesta aquí. Antes "menu_cancelar" activaba
    // la cancelación porque su id contiene "cancelar", y cualquier id con un "1" (p. ej. "hora_1")
    // se leía como afirmativo. Solo valen los botones de esta pregunta o una respuesta escrita clara.
    if (/^\S+_\S+$/.test(mensaje) && mensaje !== 'confirmar_cancelar' && mensaje !== 'conservar_cita') {
      console.log(`ℹ️ Botón/fila fuera de contexto ignorado: ${mensaje}`);
      return;
    }

    const palabras = messageParser.normalizarRespuesta(mensaje).split(/[^a-z0-9]+/).filter(Boolean);
    const dice = (...claves: string[]) => claves.some(c => palabras.includes(c));
    const niega = dice('no', 'nop', 'nope', 'negativo', 'conservar');
    const confirma = mensaje === 'confirmar_cancelar' || (!niega && dice('si', 'yes', 'ok', 'claro', 'sip', 'sep', 'confirmo', 'confirmar', 'cancelar'));

    if (confirma) {
      const citaCancelada = await citasService.cancelar(contexto.radicado!);
      try { await notificacionesService.notificarCitaCancelada(citaCancelada.id); } catch (e) { console.error('Error notificando cancelación:', e); }
      await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.CITA_CANCELADA(), [
        { id: 'menu_agendar', title: '📅 Agendar Cita' },
        { id: 'menu_principal', title: '📋 Menú Principal' },
        { id: 'menu_salir', title: '👋 Salir' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', contexto);
    } else if (mensaje === 'conservar_cita' || niega) {
      await whatsappMessagesService.enviarMensajeConBotones(telefono, '💈 Perfecto, conservamos su cita. ¿Le puedo servir en algo más?', [
        { id: 'menu_agendar', title: '📅 Agendar Cita' },
        { id: 'menu_principal', title: '📋 Menú Principal' },
        { id: 'menu_salir', title: '👋 Salir' },
      ]);
      await this.actualizarConversacion(conversacionId, 'ESPERANDO_RESPUESTA_DESPUES_CITA', contexto);
    } else {
      await this.enviarOpcionInvalida(telefono, mensaje);
    }
  }

  private async enviarOpcionInvalida(telefono: string, mensaje: string) {
    if (ID_INTERACTIVO.test(mensaje)) {
      console.log(`ℹ️ Botón/fila fuera de contexto ignorado: ${mensaje}`);
      return;
    }

    await whatsappMessagesService.enviarMensajeConBotones(telefono, MENSAJES.OPCION_INVALIDA(), botonesNavegacion());
  }

  private async manejarCancelacionGlobal(telefono: string) {
    const conv = await this.obtenerConversacionActiva(telefono);
    if (conv) {
      await whatsappMessagesService.enviarMensaje(telefono, MENSAJES.CANCELACION_CONFIRMADA());
      await this.finalizarConversacion(conv.id);
    } else {
      // Sin conversación activa (nunca escribió, o venció): abre una nueva junto con el menú, para
      // que el siguiente toque del menú tenga dónde apoyarse.
      await this.manejarComandoMenu(telefono);
    }
  }

  private async manejarComandoMenu(telefono: string) {
    const conversacion = await this.obtenerConversacionActiva(telefono);
    if (conversacion) {
      await this.actualizarConversacion(conversacion.id, 'INICIAL', {});
    } else {
      await this.crearConversacion(telefono);
    }
    await this.enviarMenuPrincipal(telefono);
  }

  private async manejarComandoVolver(telefono: string) {
    const conversacion = await this.obtenerConversacionActiva(telefono);
    if (!conversacion) {
      await this.manejarComandoMenu(telefono);
      return;
    }

    const contexto: ConversationContext = JSON.parse(conversacion.contexto);
    const telefonoJefe = process.env.JEFE_BARBERO_TELEFONO;
    if (conversacion.cliente && (!telefonoJefe || telefono !== telefonoJefe)) {
      contexto._nombreClienteDb = conversacion.cliente.nombre;
    }

    await this.volverPaso(telefono, conversacion.estado as ConversationState, contexto, conversacion.id);
  }

  // Un paso atrás según el estado actual. Agendar: barbero(s) → (nombre) → fecha → hora.
  // Cancelar: citas → confirmación. Cualquier otro estado vuelve al menú principal.
  private async volverPaso(telefono: string, estado: ConversationState, contexto: ConversationContext, conversacionId: string) {
    switch (estado) {
      case 'ESPERANDO_NOMBRE':
      case 'ESPERANDO_FECHA':
        await this.iniciarAgendamiento(telefono, contexto, conversacionId);
        return;
      case 'ESPERANDO_FECHA_ESPECIFICA':
      case 'ESPERANDO_HORA':
      case 'ESPERANDO_RESPUESTA_NO_HAY_HORARIOS':
        await this.avanzarAFecha(telefono, contexto, conversacionId);
        return;
      case 'ESPERANDO_CONFIRMACION_CANCELACION':
        await this.buscarYMostrarCitasActivas(telefono, conversacionId, contexto);
        return;
      default:
        await this.enviarMenuPrincipal(telefono);
        await this.actualizarConversacion(conversacionId, 'INICIAL', {});
    }
  }

  private async obtenerConversacionActiva(telefono: string) {
    const conversacion = await prisma.conversacion.findFirst({
      where: { telefono, activa: true },
      include: { cliente: true },
      orderBy: { lastActivity: 'desc' },
    });

    if (!conversacion) return null;

    // Expiración exacta al recibir el mensaje: no depende de que el cron (cada 5 min) ya haya
    // corrido (evita la ventana de hasta 5 min tras el timeout, y el caso de un servidor caído o
    // reiniciado). El cron queda solo como limpieza. Una conversación vencida se cierra y se trata
    // como nueva.
    if (Date.now() - conversacion.lastActivity.getTime() > botConfig.timeoutConversacion) {
      await this.finalizarConversacion(conversacion.id);
      return null;
    }

    return conversacion;
  }

  private async crearConversacion(telefono: string) {
    const cliente = await clientesService.buscarOCrearAtomico(telefono, NOMBRE_PLACEHOLDER_CLIENTE);
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
