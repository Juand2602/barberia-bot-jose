import { Router, Request, Response } from 'express';
import { verificarAdmin, generarToken } from '../middleware/auth';
import { empleadosService } from '../services/empleados.service';
import { serviciosService } from '../services/servicios.service';
import { citasService } from '../services/citas.service';
import { barberiaConfig } from '../config/whatsapp';
import prisma from '../config/database';

const router = Router();

// ==================== AUTH ====================
router.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === adminUser && password === adminPass) {
    const token = generarToken();
    res.json({ token, message: 'Login exitoso' });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

// ==================== BARBEROS ====================
router.get('/barberos', verificarAdmin, async (req, res) => {
  try {
    const barberos = await empleadosService.getAll();
    res.json(barberos);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/barberos', verificarAdmin, async (req, res) => {
  try {
    const barbero = await empleadosService.create(req.body);
    res.status(201).json(barbero);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/barberos/:id', verificarAdmin, async (req, res) => {
  try {
    const barbero = await empleadosService.update(req.params.id, req.body);
    res.json(barbero);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete('/barberos/:id', verificarAdmin, async (req, res) => {
  try {
    await empleadosService.delete(req.params.id);
    res.json({ message: 'Barbero desactivado' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== SERVICIOS ====================
router.get('/servicios', verificarAdmin, async (req, res) => {
  try {
    const servicios = await serviciosService.listarTodos();
    res.json(servicios);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/servicios', verificarAdmin, async (req, res) => {
  try {
    const servicio = await serviciosService.crear(req.body);
    res.status(201).json(servicio);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/servicios/:id', verificarAdmin, async (req, res) => {
  try {
    const servicio = await serviciosService.actualizar(req.params.id, req.body);
    res.json(servicio);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete('/servicios/:id', verificarAdmin, async (req, res) => {
  try {
    await serviciosService.eliminar(req.params.id);
    res.json({ message: 'Servicio desactivado' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CITAS ====================
router.get('/citas', verificarAdmin, async (req, res) => {
  try {
    const { fecha, empleadoId, estado } = req.query;
    const filters: any = {};
    if (fecha) {
      const d = new Date(fecha as string);
      filters.fechaInicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      filters.fechaFin = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    }
    if (empleadoId) filters.empleadoId = empleadoId as string;
    if (estado) filters.estado = estado as string;
    const citas = await citasService.getAll(Object.keys(filters).length > 0 ? filters : undefined);
    res.json(citas);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/citas/proximas', verificarAdmin, async (req, res) => {
  try {
    const citas = await citasService.getProximas(50);
    res.json(citas);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/citas/:id/estado', verificarAdmin, async (req, res) => {
  try {
    const cita = await citasService.cambiarEstado(req.params.id, req.body);
    res.json(cita);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ==================== CONFIGURACIÓN ====================
router.get('/config', verificarAdmin, async (_req, res) => {
  res.json({
    nombre: process.env.BARBERIA_NOMBRE || barberiaConfig.nombre,
    direccion: process.env.BARBERIA_DIRECCION || barberiaConfig.direccion,
    horaApertura: process.env.BARBERIA_HORA_APERTURA || barberiaConfig.horaApertura,
    horaCierre: process.env.BARBERIA_HORA_CIERRE || barberiaConfig.horaCierre,
    servicioPredeterminado: process.env.SERVICIO_PREDETERMINADO || barberiaConfig.servicioPredeterminado,
    mosaicoUrl: process.env.BARBEROS_MOSAICO_URL || '',
    jefeBarberTelefono: process.env.JEFE_BARBERO_TELEFONO || '',
    administradoraTelefono: process.env.ADMINISTRADORA_TELEFONO || '',
  });
});

// ==================== DASHBOARD ====================
router.get('/dashboard', verificarAdmin, async (_req, res) => {
  try {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

    const [citasHoy, citasProximas, totalBarberos, totalServicios] = await Promise.all([
      prisma.cita.count({ where: { fechaHora: { gte: inicioDia, lte: finDia }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } } }),
      prisma.cita.count({ where: { fechaHora: { gte: new Date() }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } } }),
      prisma.empleado.count({ where: { activo: true } }),
      prisma.servicio.count({ where: { activo: true } }),
    ]);

    res.json({ citasHoy, citasProximas, totalBarberos, totalServicios });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==================== CALENDARIO ====================
router.get('/calendar/auth/:empleadoId', verificarAdmin, async (req, res) => {
  try {
    const { googleCalendarService } = await import('../services/google-calendar.service');
    const url = googleCalendarService.getAuthUrl(req.params.empleadoId);
    res.json({ url });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/calendar/callback', async (req, res) => {
  try {
    const { code, state: empleadoId } = req.query;
    const { googleCalendarService } = await import('../services/google-calendar.service');
    await googleCalendarService.handleCallback(code as string, empleadoId as string);
    res.send('<html><body><h2>✅ Google Calendar conectado exitosamente.</h2><p>Puedes cerrar esta ventana.</p></body></html>');
  } catch (e: any) {
    res.status(500).send(`<html><body><h2>❌ Error: ${e.message}</h2></body></html>`);
  }
});

export default router;
