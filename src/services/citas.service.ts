import prisma from '../config/database';
import { empleadosService } from './empleados.service';
import { googleCalendarService } from './google-calendar.service';

const HORA_ALMUERZO_INICIO = '13:00';
const HORA_ALMUERZO_FIN = '14:30';

export class CitasService {
  async getAll(filters?: { fechaInicio?: Date; fechaFin?: Date; empleadoId?: string; estado?: string }) {
    const where: any = {};
    if (filters) {
      if (filters.fechaInicio || filters.fechaFin) {
        where.fechaHora = {};
        if (filters.fechaInicio) where.fechaHora.gte = filters.fechaInicio;
        if (filters.fechaFin) where.fechaHora.lte = filters.fechaFin;
      }
      if (filters.empleadoId) where.empleadoId = filters.empleadoId;
      if (filters.estado) where.estado = filters.estado;
    }
    return prisma.cita.findMany({
      where,
      include: { cliente: true, empleado: true },
      orderBy: { fechaHora: 'asc' },
    });
  }

  async getByFecha(fecha: Date, empleadoId?: string) {
    const inicioDia = new Date(fecha); inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fecha); finDia.setHours(23, 59, 59, 999);
    const where: any = { fechaHora: { gte: inicioDia, lte: finDia } };
    if (empleadoId) where.empleadoId = empleadoId;
    return prisma.cita.findMany({
      where, include: { cliente: true, empleado: true }, orderBy: { fechaHora: 'asc' },
    });
  }

  async getProximas(limite: number = 20, empleadoId?: string) {
    const where: any = { fechaHora: { gte: new Date() }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } };
    if (empleadoId) where.empleadoId = empleadoId;
    return prisma.cita.findMany({
      where, include: { cliente: true, empleado: true },
      orderBy: { fechaHora: 'asc' }, take: limite,
    });
  }

  async getById(id: string) {
    const cita = await prisma.cita.findUnique({ where: { id }, include: { cliente: true, empleado: true } });
    if (!cita) throw new Error('Cita no encontrada');
    return cita;
  }

  async buscarPorRadicado(radicado: string) {
    return prisma.cita.findUnique({ where: { radicado }, include: { cliente: true, empleado: true } });
  }

  private seSolapaConAlmuerzo(inicioMin: number, duracion: number): boolean {
    const [aih, aim] = HORA_ALMUERZO_INICIO.split(':').map(Number);
    const [afh, afm] = HORA_ALMUERZO_FIN.split(':').map(Number);
    const aIni = aih * 60 + aim, aFin = afh * 60 + afm;
    return inicioMin < aFin && inicioMin + duracion > aIni;
  }

  async create(data: any) {
    const fechaHora = new Date(data.fechaHora);
    if (fechaHora < new Date()) throw new Error('No se pueden crear citas en el pasado');

    const horaMin = fechaHora.getHours() * 60 + fechaHora.getMinutes();
    if (this.seSolapaConAlmuerzo(horaMin, data.duracionMinutos)) {
      throw new Error('No se pueden agendar citas durante la hora de almuerzo (1:30 PM - 2:30 PM)');
    }

    const citaExistente = await this.verificarCitaExistente(data.empleadoId, fechaHora, data.duracionMinutos);
    if (citaExistente) throw new Error('Lo siento, ese horario ya no está disponible. Por favor elige otro horario.');

    const empleado = await empleadosService.getById(data.empleadoId);
    const diasMap: any = { 0: 'horarioDomingo', 1: 'horarioLunes', 2: 'horarioMartes', 3: 'horarioMiercoles', 4: 'horarioJueves', 5: 'horarioViernes', 6: 'horarioSabado' };
    const horarioDia = (empleado as any)[diasMap[fechaHora.getDay()]];
    if (!horarioDia) throw new Error('El empleado no trabaja ese día');

    const [horaInicio, minInicio] = horarioDia.inicio.split(':').map(Number);
    const [horaFin, minFin] = horarioDia.fin.split(':').map(Number);
    if (horaMin < horaInicio * 60 + minInicio || horaMin + data.duracionMinutos > horaFin * 60 + minFin) {
      throw new Error('La hora está fuera del horario laboral del empleado');
    }

    const cita = await prisma.cita.create({
      data: {
        radicado: data.radicado || `CIT-${Date.now()}`,
        clienteId: data.clienteId,
        empleadoId: data.empleadoId,
        servicioNombre: data.servicioNombre,
        fechaHora,
        duracionMinutos: data.duracionMinutos,
        origen: data.origen || 'MANUAL',
        notas: data.notas || null,
        estado: data.origen === 'WHATSAPP' ? 'CONFIRMADA' : 'PENDIENTE',
      },
      include: { cliente: true, empleado: true },
    });

    try { await googleCalendarService.crearEvento(cita.id); } catch (e) { console.error('Error Google Calendar:', e); }

    return cita;
  }

  async cancelar(radicado: string) {
    const cita = await prisma.cita.update({
      where: { radicado },
      data: { estado: 'CANCELADA', motivoCancelacion: 'Cancelado por WhatsApp' },
    });
    try { await googleCalendarService.actualizarEvento(cita.id); } catch (e) {}
    return cita;
  }

  async cambiarEstado(id: string, data: { estado: string; motivoCancelacion?: string }) {
    const cita = await prisma.cita.update({
      where: { id },
      data: { estado: data.estado, motivoCancelacion: data.motivoCancelacion || null },
      include: { cliente: true, empleado: true },
    });
    try { await googleCalendarService.actualizarEvento(id); } catch (e) {}
    return cita;
  }

  async verificarCitaExistente(empleadoId: string, fechaHora: Date, duracionMinutos: number) {
    const finServicio = new Date(fechaHora.getTime() + duracionMinutos * 60000);
    const inicioDia = new Date(fechaHora); inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fechaHora); finDia.setHours(23, 59, 59, 999);

    const citasDelDia = await prisma.cita.findMany({
      where: { empleadoId, estado: { in: ['PENDIENTE', 'CONFIRMADA'] }, fechaHora: { gte: inicioDia, lte: finDia } },
    });

    for (const c of citasDelDia) {
      const finC = new Date(c.fechaHora.getTime() + c.duracionMinutos * 60000);
      if (fechaHora < finC && finServicio > c.fechaHora) return c;
    }
    return null;
  }

  async calcularHorariosDisponibles(empleadoId: string, fecha: Date, duracionMinutos: number = 30): Promise<string[]> {
    const citasExistentes = await this.getByFecha(fecha, empleadoId).then(c => c.filter(ci => ['PENDIENTE', 'CONFIRMADA'].includes(ci.estado)));
    const empleado = await empleadosService.getById(empleadoId);
    if (!empleado) return [];

    const diasMap: any = { 0: 'horarioDomingo', 1: 'horarioLunes', 2: 'horarioMartes', 3: 'horarioMiercoles', 4: 'horarioJueves', 5: 'horarioViernes', 6: 'horarioSabado' };
    const horarioDia = (empleado as any)[diasMap[fecha.getDay()]];
    if (!horarioDia) return [];

    const [hi, mi] = horarioDia.inicio.split(':').map(Number);
    const [hf, mf] = horarioDia.fin.split(':').map(Number);

    const slots: string[] = [];
    let horaActual = hi * 60 + mi;
    const horaFinTotal = hf * 60 + mf;
    while (horaActual + duracionMinutos <= horaFinTotal) {
      const h = Math.floor(horaActual / 60), m = horaActual % 60;
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      horaActual += duracionMinutos;
    }

    const rangosOcupados: Array<{ inicio: number; fin: number }> = citasExistentes.map(c => ({
      inicio: c.fechaHora.getHours() * 60 + c.fechaHora.getMinutes(),
      fin: c.fechaHora.getHours() * 60 + c.fechaHora.getMinutes() + c.duracionMinutos,
    }));

    const [aih, aim] = HORA_ALMUERZO_INICIO.split(':').map(Number);
    const [afh, afm] = HORA_ALMUERZO_FIN.split(':').map(Number);
    rangosOcupados.push({ inicio: aih * 60 + aim, fin: afh * 60 + afm });

    try {
      const bloqueos = await googleCalendarService.obtenerHorariosBloqueados(empleadoId, fecha);
      bloqueos.forEach(b => {
        rangosOcupados.push({ inicio: b.inicio.getHours() * 60 + b.inicio.getMinutes(), fin: b.fin.getHours() * 60 + b.fin.getMinutes() });
      });
    } catch (e) { console.error('Error Google Calendar bloqueos:', e); }

    return slots.filter(slot => {
      const [h, m] = slot.split(':').map(Number);
      const ini = h * 60 + m, fin = ini + duracionMinutos;
      return !rangosOcupados.some(r => ini < r.fin && fin > r.inicio);
    });
  }
}

export const citasService = new CitasService();
