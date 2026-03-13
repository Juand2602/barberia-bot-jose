import prisma from '../config/database';

export class ClientesService {
  async buscarPorTelefono(telefono: string) {
    return prisma.cliente.findUnique({ where: { telefono } });
  }

  async crear(data: { nombre: string; telefono: string; email?: string }) {
    return prisma.cliente.create({
      data: {
        nombre: data.nombre.trim(),
        telefono: data.telefono.trim(),
        email: data.email?.trim() || null,
        activo: true,
      },
    });
  }

  async getAll(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search } },
      ];
    }
    return prisma.cliente.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async update(id: string, data: any) {
    return prisma.cliente.update({
      where: { id },
      data: {
        ...(data.nombre && { nombre: data.nombre.trim() }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
    });
  }

  private esNombreMasCompleto(nombreAnterior: string, nombreNuevo: string): boolean {
    const ant = nombreAnterior.toLowerCase().trim();
    const nvo = nombreNuevo.toLowerCase().trim();
    const genericos = ['cliente whatsapp', 'cliente', 'usuario', 'user', 'sin nombre'];
    if (genericos.includes(ant)) return true;
    if (genericos.includes(nvo)) return false;
    const palAnt = ant.split(/\s+/).filter(p => p.length >= 2);
    const palNvo = nvo.split(/\s+/).filter(p => p.length >= 2);
    if (palNvo.length > palAnt.length) {
      if (palAnt.every(p => nvo.includes(p))) return true;
    }
    return false;
  }

  async obtenerOCrear(telefono: string, nombre?: string) {
    let cliente = await this.buscarPorTelefono(telefono);
    if (!cliente && nombre) {
      cliente = await this.crear({ nombre, telefono });
    } else if (cliente && nombre && this.esNombreMasCompleto(cliente.nombre, nombre)) {
      cliente = await this.update(cliente.id, { nombre });
    }
    return cliente;
  }

  async crearClienteDesdeJefe(nombreCliente: string, telefonoJefe: string) {
    const telefonoSintetico = `proxy_${telefonoJefe}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return this.crear({ nombre: nombreCliente, telefono: telefonoSintetico });
  }
}

export const clientesService = new ClientesService();
