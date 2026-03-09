import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/database';
import { addMinutes, startOfDay, endOfDay } from 'date-fns';

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(empleadoId: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
      state: empleadoId,
      prompt: 'consent',
    });
  }

  async handleCallback(code: string, empleadoId: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    await prisma.empleado.update({
      where: { id: empleadoId },
      data: {
        googleAccessToken: tokens.access_token!,
        googleRefreshToken: tokens.refresh_token || undefined,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarioSincronizado: true,
      },
    });
    return { success: true };
  }

  private async renovarTokenSiEsNecesario(empleadoId: string): Promise<boolean> {
    try {
      const empleado = await prisma.empleado.findUnique({
        where: { id: empleadoId },
        select: { googleAccessToken: true, googleRefreshToken: true, googleTokenExpiry: true, nombre: true },
      });
      if (!empleado?.googleAccessToken || !empleado?.googleRefreshToken) return false;

      const ahora = new Date();
      const margen = 5 * 60 * 1000;
      const expiraProonto = empleado.googleTokenExpiry
        ? empleado.googleTokenExpiry.getTime() - ahora.getTime() < margen
        : true;

      if (expiraProonto) {
        this.oauth2Client.setCredentials({ refresh_token: empleado.googleRefreshToken });
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        await prisma.empleado.update({
          where: { id: empleadoId },
          data: {
            googleAccessToken: credentials.access_token!,
            googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
            ...(credentials.refresh_token && { googleRefreshToken: credentials.refresh_token }),
          },
        });
      }
      return true;
    } catch (error: any) {
      if (error.code === 'invalid_grant' || error.message?.includes('invalid_grant')) {
        await this.desconectarCalendario(empleadoId);
      }
      return false;
    }
  }

  private async getCalendarClient(empleadoId: string): Promise<calendar_v3.Calendar | null> {
    const tokenValido = await this.renovarTokenSiEsNecesario(empleadoId);
    if (!tokenValido) return null;

    const empleado = await prisma.empleado.findUnique({
      where: { id: empleadoId },
      select: { googleAccessToken: true, googleRefreshToken: true, googleTokenExpiry: true },
    });
    if (!empleado?.googleAccessToken || !empleado?.googleRefreshToken) return null;

    this.oauth2Client.setCredentials({
      access_token: empleado.googleAccessToken,
      refresh_token: empleado.googleRefreshToken,
      expiry_date: empleado.googleTokenExpiry?.getTime(),
    });
    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  private async ejecutarConReintentos<T>(
    empleadoId: string,
    operacion: (calendar: calendar_v3.Calendar) => Promise<T>,
    nombre: string
  ): Promise<T | null> {
    try {
      const calendar = await this.getCalendarClient(empleadoId);
      if (!calendar) return null;
      return await operacion(calendar);
    } catch (error: any) {
      if (error.code === 401 || error.code === 403 || error.message?.includes('invalid_grant')) {
        const renovado = await this.renovarTokenSiEsNecesario(empleadoId);
        if (renovado) {
          const calendar = await this.getCalendarClient(empleadoId);
          if (calendar) {
            try { return await operacion(calendar); } catch { return null; }
          }
        }
      }
      console.error(`❌ Error en ${nombre}:`, error.message);
      return null;
    }
  }

  async crearEvento(citaId: string) {
    const cita = await prisma.cita.findUnique({
      where: { id: citaId }, include: { cliente: true, empleado: true },
    });
    if (!cita) throw new Error('Cita no encontrada');

    const inicio = new Date(cita.fechaHora);
    const fin = addMinutes(inicio, cita.duracionMinutos);

    const evento: calendar_v3.Schema$Event = {
      summary: `${cita.servicioNombre} - ${cita.cliente.nombre}`,
      description: `Cliente: ${cita.cliente.nombre}\nTeléfono: ${cita.cliente.telefono}\nServicio: ${cita.servicioNombre}\nRadicado: ${cita.radicado}`,
      start: { dateTime: inicio.toISOString(), timeZone: 'America/Bogota' },
      end: { dateTime: fin.toISOString(), timeZone: 'America/Bogota' },
      colorId: '2',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'popup', minutes: 10 }] },
    };

    const resultado = await this.ejecutarConReintentos(cita.empleadoId, async (cal) => {
      const r = await cal.events.insert({ calendarId: 'primary', requestBody: evento });
      return r.data;
    }, 'crearEvento');

    if (resultado) {
      await prisma.cita.update({ where: { id: citaId }, data: { googleEventId: resultado.id! } });
    }
  }

  async actualizarEvento(citaId: string) {
    const cita = await prisma.cita.findUnique({
      where: { id: citaId }, include: { cliente: true, empleado: true },
    });
    if (!cita || !cita.googleEventId) return;

    const inicio = new Date(cita.fechaHora);
    const fin = addMinutes(inicio, cita.duracionMinutos);
    let colorId = cita.estado === 'CANCELADA' ? '11' : cita.estado === 'COMPLETADA' ? '10' : '2';

    const evento: calendar_v3.Schema$Event = {
      summary: `${cita.servicioNombre} - ${cita.cliente.nombre}`,
      description: `Cliente: ${cita.cliente.nombre}\nEstado: ${cita.estado}\nRadicado: ${cita.radicado}`,
      start: { dateTime: inicio.toISOString(), timeZone: 'America/Bogota' },
      end: { dateTime: fin.toISOString(), timeZone: 'America/Bogota' },
      colorId,
    };

    await this.ejecutarConReintentos(cita.empleadoId, async (cal) => {
      await cal.events.update({ calendarId: 'primary', eventId: cita.googleEventId!, requestBody: evento });
      return true;
    }, 'actualizarEvento');
  }

  async obtenerHorariosBloqueados(empleadoId: string, fecha: Date): Promise<Array<{ inicio: Date; fin: Date }>> {
    const resultado = await this.ejecutarConReintentos(empleadoId, async (cal) => {
      const r = await cal.events.list({
        calendarId: 'primary',
        timeMin: startOfDay(fecha).toISOString(),
        timeMax: endOfDay(fecha).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      return r.data.items || [];
    }, 'obtenerHorariosBloqueados');

    if (!resultado) return [];

    const palabrasClave = ['bloqueado', 'bloqueo', 'ocupado', 'no disponible', 'cerrado', 'personal', 'privado', 'fuera de oficina', 'vacaciones', 'día libre', 'break', 'descanso'];

    return resultado
      .filter(e => {
        const texto = `${e.summary || ''} ${e.description || ''}`.toLowerCase();
        return palabrasClave.some(p => texto.includes(p)) && !e.summary?.includes('RAD-');
      })
      .map(e => {
        if (e.start?.dateTime && e.end?.dateTime) {
          return { inicio: new Date(e.start.dateTime), fin: new Date(e.end.dateTime) };
        }
        if (e.start?.date) {
          const inicio = new Date(e.start.date); inicio.setHours(0, 0, 0, 0);
          const fin = new Date(e.end?.date || e.start.date); fin.setHours(23, 59, 59, 999);
          return { inicio, fin };
        }
        return null;
      })
      .filter((e): e is { inicio: Date; fin: Date } => e !== null);
  }

  async desconectarCalendario(empleadoId: string) {
    await prisma.empleado.update({
      where: { id: empleadoId },
      data: { googleAccessToken: null, googleRefreshToken: null, googleTokenExpiry: null, googleCalendarId: null, calendarioSincronizado: false },
    });
  }
}

export const googleCalendarService = new GoogleCalendarService();
