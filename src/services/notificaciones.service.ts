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

    // Notificar al empleado/dueño (usando plantilla oficial aprobada para evitar restricción de 24h)
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

    console.log(`✅ Notificación oficial enviada al barbero para cita ${cita.radicado}`);
  }

  async notificarCitaCancelada(citaId: string) {
    const cita = await prisma.cita.findUnique({
      where: { id: citaId },
      include: { cliente: true, empleado: true },
    });
    if (!cita) return;

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

    console.log(`✅ Notificación oficial de cancelación enviada para cita ${cita.radicado}`);
  }

  /**
   * Envía recordatorio individual de cita a un cliente usando la plantilla oficial de Meta
   */
  async notificarRecordatorioCliente(citaId: string) {
    const cita = await prisma.cita.findUnique({
      where: { id: citaId },
      include: { cliente: true, empleado: true },
    });
    if (!cita) return;

    const telefono = cita.cliente.telefono;
    if (!telefono || telefono.startsWith('proxy_')) {
      await this.marcarRecordatorioEnNotas(cita.id, cita.notas, '[RECORDATORIO_OMITIDO_PROXY]');
      return;
    }

    try {
      await whatsappMessagesService.enviarPlantilla(
        telefono,
        'recordatorio_cita_cliente',
        'es',
        [
          cita.cliente.nombre,
          cita.empleado.nombre,
          formatearFecha(cita.fechaHora),
          formatearHora(cita.fechaHora.toTimeString().substring(0, 5)),
          cita.servicioNombre,
          cita.radicado,
        ]
      );
      await this.marcarRecordatorioEnNotas(cita.id, cita.notas, '[RECORDATORIO_ENVIADO]');
      console.log(`⏰ Recordatorio enviado a ${cita.cliente.nombre} (${telefono}) para cita ${cita.radicado}`);
    } catch (e) {
      console.error(`❌ Error enviando recordatorio para cita ${cita.radicado}:`, e);
    }
  }

  /**
   * Busca citas confirmadas en las próximas 2 horas que no hayan recibido recordatorio
   * y envía la plantilla oficial de WhatsApp de forma automática
   */
  async enviarRecordatoriosProximos() {
    const ahora = new Date();
    // Ventana de anticipación: citas en las próximas 2 horas (120 minutos)
    const limiteSuperior = new Date(ahora.getTime() + 2 * 60 * 60 * 1000);

    const citas = await prisma.cita.findMany({
      where: {
        estado: 'CONFIRMADA',
        fechaHora: {
          gte: ahora,
          lte: limiteSuperior,
        },
        OR: [
          { notas: null },
          { NOT: { notas: { contains: '[RECORDATORIO_ENVIADO]' } } },
        ],
      },
      include: { cliente: true, empleado: true },
      orderBy: { fechaHora: 'asc' },
    });

    if (citas.length === 0) return;

    for (const cita of citas) {
      if (cita.notas && (cita.notas.includes('[RECORDATORIO_ENVIADO]') || cita.notas.includes('[RECORDATORIO_OMITIDO_PROXY]'))) {
        continue;
      }
      await this.notificarRecordatorioCliente(cita.id);
    }
  }

  private async marcarRecordatorioEnNotas(citaId: string, notasActuales: string | null, marca: string) {
    const notasLimpias = notasActuales ? `${notasActuales} ${marca}`.trim() : marca;
    try {
      await prisma.cita.update({
        where: { id: citaId },
        data: { notas: notasLimpias },
      });
    } catch (e) {
      console.error(`Error actualizando notas de recordatorio para cita ${citaId}:`, e);
    }
  }
}

export const notificacionesService = new NotificacionesService();
