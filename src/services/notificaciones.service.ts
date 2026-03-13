import prisma from '../config/database';
import { whatsappMessagesService } from './whatsapp/messages.service';
import { formatearFecha, formatearHora } from './whatsapp/templates';

export class NotificacionesService {
  async notificarCitaAgendada(citaId: string) {
    const cita = await prisma.cita.findUnique({
      where: { id: citaId },
      include: { cliente: true, empleado: true },
    });
    if (!cita) return;

    const mensaje = `🆕 *NUEVA CITA AGENDADA*

📋 *Radicado:* ${cita.radicado}
👤 *Cliente:* ${cita.cliente.nombre}
📱 *Teléfono:* ${cita.cliente.telefono}
✂️ *Servicio:* ${cita.servicioNombre}
👨‍🦲 *Barbero:* ${cita.empleado.nombre}
📅 *Fecha:* ${formatearFecha(cita.fechaHora)}
⏰ *Hora:* ${formatearHora(cita.fechaHora.toTimeString().substring(0, 5))}
🌐 *Origen:* ${cita.origen === 'WHATSAPP' ? 'WhatsApp Bot' : 'Manual'}

_Notificación automática del sistema_ 💈`;

    // Notificar al empleado (usando plantilla para evitar restricción de 24h)
    if (cita.empleado.telefono) {
      try {
        await whatsappMessagesService.enviarPlantilla(
          cita.empleado.telefono,
          'notificacion_cita',
          'es',
          [
            cita.empleado.nombre,
            cita.cliente.nombre,
            cita.cliente.telefono,
            formatearFecha(cita.fechaHora),
            formatearHora(cita.fechaHora.toTimeString().substring(0, 5)),
            cita.servicioNombre,
            cita.radicado,
          ]
        );
      } catch (e) { console.error('Error notificando empleado:', e); }
    }

    // Notificar al jefe barbero (solo si no es el mismo barbero de la cita)
    const telefonoJefe = process.env.JEFE_BARBERO_TELEFONO;
    if (telefonoJefe && telefonoJefe !== cita.empleado.telefono) {
      try {
        await whatsappMessagesService.enviarMensaje(telefonoJefe, `👔 *Notificación Jefe Barbero*\n\n${mensaje}`);
      } catch (e) { console.error('Error notificando jefe:', e); }
    }

    // Notificar a la administradora
    const telefonoAdmin = process.env.ADMINISTRADORA_TELEFONO;
    if (telefonoAdmin) {
      try {
        await whatsappMessagesService.enviarMensaje(telefonoAdmin, `👩‍💼 *Notificación Administradora*\n\n${mensaje}`);
      } catch (e) { console.error('Error notificando administradora:', e); }
    }

    console.log(`✅ Notificaciones enviadas para cita ${cita.radicado}`);
  }

  async notificarCitaCancelada(citaId: string) {
    const cita = await prisma.cita.findUnique({
      where: { id: citaId },
      include: { cliente: true, empleado: true },
    });
    if (!cita) return;

    const mensaje = `❌ *CITA CANCELADA*

📋 *Radicado:* ${cita.radicado}
👤 *Cliente:* ${cita.cliente.nombre}
✂️ *Servicio:* ${cita.servicioNombre}
👨‍🦲 *Barbero:* ${cita.empleado.nombre}
📅 *Fecha:* ${formatearFecha(cita.fechaHora)}
⏰ *Hora:* ${formatearHora(cita.fechaHora.toTimeString().substring(0, 5))}
${cita.motivoCancelacion ? `📝 *Motivo:* ${cita.motivoCancelacion}` : ''}

_Notificación automática del sistema_ 💈`;

    if (cita.empleado.telefono) {
      try {
        await whatsappMessagesService.enviarPlantilla(
          cita.empleado.telefono,
          'aviso_cancelacion',
          'es',
          [
            cita.empleado.nombre,
            cita.cliente.nombre,
            cita.cliente.telefono,
            formatearFecha(cita.fechaHora),
            formatearHora(cita.fechaHora.toTimeString().substring(0, 5)),
            cita.servicioNombre,
            cita.radicado,
          ]
        );
      } catch (e) { console.error('Error notificando empleado cancelación:', e); }
    }
    const telefonoJefe = process.env.JEFE_BARBERO_TELEFONO;
    if (telefonoJefe && telefonoJefe !== cita.empleado.telefono) {
      try { await whatsappMessagesService.enviarMensaje(telefonoJefe, mensaje); } catch (e) {}
    }
    const telefonoAdmin = process.env.ADMINISTRADORA_TELEFONO;
    if (telefonoAdmin) {
      try { await whatsappMessagesService.enviarMensaje(telefonoAdmin, mensaje); } catch (e) {}
    }
  }
}

export const notificacionesService = new NotificacionesService();
