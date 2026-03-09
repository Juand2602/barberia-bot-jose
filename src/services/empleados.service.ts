import prisma from '../config/database';

export class EmpleadosService {
  async getAll(activo?: boolean) {
    const where: any = {};
    if (activo !== undefined) where.activo = activo;

    const empleados = await prisma.empleado.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });

    return empleados.map(emp => ({
      ...emp,
      especialidades: JSON.parse(emp.especialidades || '[]'),
      horarioLunes: emp.horarioLunes ? JSON.parse(emp.horarioLunes) : null,
      horarioMartes: emp.horarioMartes ? JSON.parse(emp.horarioMartes) : null,
      horarioMiercoles: emp.horarioMiercoles ? JSON.parse(emp.horarioMiercoles) : null,
      horarioJueves: emp.horarioJueves ? JSON.parse(emp.horarioJueves) : null,
      horarioViernes: emp.horarioViernes ? JSON.parse(emp.horarioViernes) : null,
      horarioSabado: emp.horarioSabado ? JSON.parse(emp.horarioSabado) : null,
      horarioDomingo: emp.horarioDomingo ? JSON.parse(emp.horarioDomingo) : null,
    }));
  }

  async getById(id: string) {
    const empleado = await prisma.empleado.findUnique({ where: { id } });
    if (!empleado) throw new Error('Empleado no encontrado');

    return {
      ...empleado,
      especialidades: JSON.parse(empleado.especialidades || '[]'),
      horarioLunes: empleado.horarioLunes ? JSON.parse(empleado.horarioLunes) : null,
      horarioMartes: empleado.horarioMartes ? JSON.parse(empleado.horarioMartes) : null,
      horarioMiercoles: empleado.horarioMiercoles ? JSON.parse(empleado.horarioMiercoles) : null,
      horarioJueves: empleado.horarioJueves ? JSON.parse(empleado.horarioJueves) : null,
      horarioViernes: empleado.horarioViernes ? JSON.parse(empleado.horarioViernes) : null,
      horarioSabado: empleado.horarioSabado ? JSON.parse(empleado.horarioSabado) : null,
      horarioDomingo: empleado.horarioDomingo ? JSON.parse(empleado.horarioDomingo) : null,
    };
  }

  async create(data: any) {
    if (!data.nombre?.trim()) throw new Error('El nombre del empleado es obligatorio.');
    if (!data.telefono?.trim()) throw new Error('El teléfono del empleado es obligatorio.');

    const nombreNorm = data.nombre.trim();
    const telefonoNorm = data.telefono.trim();

    const existeNombre = await prisma.empleado.findFirst({ where: { nombre: nombreNorm } });
    if (existeNombre) throw new Error('Ya existe un empleado con ese nombre.');

    const existeTel = await prisma.empleado.findFirst({ where: { telefono: telefonoNorm } });
    if (existeTel) throw new Error('Ya existe un empleado con ese número de teléfono.');

    return prisma.empleado.create({
      data: {
        nombre: nombreNorm,
        telefono: telefonoNorm,
        fotoUrl: data.fotoUrl || null,
        especialidades: JSON.stringify(data.especialidades || []),
        horarioLunes: data.horarioLunes ? JSON.stringify(data.horarioLunes) : null,
        horarioMartes: data.horarioMartes ? JSON.stringify(data.horarioMartes) : null,
        horarioMiercoles: data.horarioMiercoles ? JSON.stringify(data.horarioMiercoles) : null,
        horarioJueves: data.horarioJueves ? JSON.stringify(data.horarioJueves) : null,
        horarioViernes: data.horarioViernes ? JSON.stringify(data.horarioViernes) : null,
        horarioSabado: data.horarioSabado ? JSON.stringify(data.horarioSabado) : null,
        horarioDomingo: data.horarioDomingo ? JSON.stringify(data.horarioDomingo) : null,
      },
    });
  }

  async update(id: string, data: any) {
    const updateData: any = {};
    if (data.nombre !== undefined) updateData.nombre = data.nombre.trim();
    if (data.telefono !== undefined) updateData.telefono = data.telefono.trim();
    if (data.fotoUrl !== undefined) updateData.fotoUrl = data.fotoUrl || null;
    if (data.especialidades !== undefined) updateData.especialidades = JSON.stringify(data.especialidades || []);
    if (data.activo !== undefined) updateData.activo = data.activo;
    if (data.horarioLunes !== undefined) updateData.horarioLunes = data.horarioLunes ? JSON.stringify(data.horarioLunes) : null;
    if (data.horarioMartes !== undefined) updateData.horarioMartes = data.horarioMartes ? JSON.stringify(data.horarioMartes) : null;
    if (data.horarioMiercoles !== undefined) updateData.horarioMiercoles = data.horarioMiercoles ? JSON.stringify(data.horarioMiercoles) : null;
    if (data.horarioJueves !== undefined) updateData.horarioJueves = data.horarioJueves ? JSON.stringify(data.horarioJueves) : null;
    if (data.horarioViernes !== undefined) updateData.horarioViernes = data.horarioViernes ? JSON.stringify(data.horarioViernes) : null;
    if (data.horarioSabado !== undefined) updateData.horarioSabado = data.horarioSabado ? JSON.stringify(data.horarioSabado) : null;
    if (data.horarioDomingo !== undefined) updateData.horarioDomingo = data.horarioDomingo ? JSON.stringify(data.horarioDomingo) : null;

    return prisma.empleado.update({ where: { id }, data: updateData });
  }

  async delete(id: string) {
    return prisma.empleado.update({ where: { id }, data: { activo: false } });
  }

  async verificarDisponibilidad(empleadoId: string, fecha: Date, duracionMinutos: number) {
    const empleado = await this.getById(empleadoId);
    const diasSemana = ['horarioDomingo', 'horarioLunes', 'horarioMartes', 'horarioMiercoles', 'horarioJueves', 'horarioViernes', 'horarioSabado'];
    const horarioDia = (empleado as any)[diasSemana[fecha.getDay()]];

    if (!horarioDia?.inicio || !horarioDia?.fin) {
      return { disponible: false, motivo: 'El empleado no trabaja este día' };
    }

    const [horaInicio, minInicio] = horarioDia.inicio.split(':').map(Number);
    const [horaFin, minFin] = horarioDia.fin.split(':').map(Number);
    const minutosActuales = fecha.getHours() * 60 + fecha.getMinutes();
    const minutosInicio = horaInicio * 60 + minInicio;
    const minutosFin = horaFin * 60 + minFin;

    if (minutosActuales < minutosInicio || minutosActuales + duracionMinutos > minutosFin) {
      return { disponible: false, motivo: `Horario laboral: ${horarioDia.inicio} - ${horarioDia.fin}` };
    }

    return { disponible: true };
  }
}

export const empleadosService = new EmpleadosService();
