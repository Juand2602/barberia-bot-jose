export const whatsappConfig = {
  apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
  token: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.WHATSAPP_PHONE_ID || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'mi_token_secreto',
};

export const barberiaConfig = {
  nombre: process.env.BARBERIA_NOMBRE || 'Mi Barbería',
  direccion: process.env.BARBERIA_DIRECCION || 'Dirección no configurada',
  horaApertura: process.env.BARBERIA_HORA_APERTURA || '09:00',
  horaCierre: process.env.BARBERIA_HORA_CIERRE || '20:00',
  duracionServicioDefecto: 30,
  servicioPredeterminado: process.env.SERVICIO_PREDETERMINADO || 'Corte Básico',
};

export const botConfig = {
  timeoutConversacion: parseInt(process.env.TIMEOUT_CONVERSACION || '300000'),
};
