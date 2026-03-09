import prisma from '../config/database';

export class ServiciosService {
  async listarActivos() {
    return prisma.servicio.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
  }

  async listarTodos() {
    return prisma.servicio.findMany({ orderBy: { nombre: 'asc' } });
  }

  async obtenerPorId(id: string) {
    return prisma.servicio.findUnique({ where: { id } });
  }

  async crear(data: { nombre: string; descripcion?: string; precio: number; duracionMinutos: number }) {
    return prisma.servicio.create({ data: { ...data, activo: true } });
  }

  async actualizar(id: string, data: Partial<{ nombre: string; descripcion: string; precio: number; duracionMinutos: number; activo: boolean }>) {
    return prisma.servicio.update({ where: { id }, data });
  }

  async eliminar(id: string) {
    return prisma.servicio.update({ where: { id }, data: { activo: false } });
  }
}

export const serviciosService = new ServiciosService();
