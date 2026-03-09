export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text: { body: string };
  type: string;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WhatsAppMessage[];
        statuses?: any[];
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      };
      field: string;
    }>;
  }>;
}

export type ConversationState =
  | 'INICIAL'
  | 'ESPERANDO_BARBERO'
  | 'ESPERANDO_NOMBRE'
  | 'ESPERANDO_FECHA'
  | 'ESPERANDO_FECHA_ESPECIFICA'
  | 'ESPERANDO_VER_FOTOS_BARBEROS'
  | 'ESPERANDO_HORA'
  | 'ESPERANDO_RADICADO'
  | 'ESPERANDO_SELECCION_CITA_CANCELAR'
  | 'ESPERANDO_CONFIRMACION_CANCELACION'
  | 'ESPERANDO_RESPUESTA_UBICACION'
  | 'ESPERANDO_RESPUESTA_LISTA_PRECIOS'
  | 'ESPERANDO_RESPUESTA_DESPUES_CITA'
  | 'ESPERANDO_RESPUESTA_NO_HAY_HORARIOS'
  | 'COMPLETADA';

export interface ConversationContext {
  nombre?: string;
  empleadoId?: string;
  empleadoNombre?: string;
  fecha?: string;
  hora?: string;
  radicado?: string;
  citaId?: string;
  horariosDisponibles?: Array<{ numero: number; hora: string }>;
  horariosRaw?: string[];
  citasDisponibles?: Array<{
    numero: number;
    radicado: string;
    servicio: string;
    fecha: string;
    hora: string;
  }>;
  barberos?: Array<{
    id: string;
    nombre: string;
    fotoUrl?: string | null;
    especialidades?: string | null;
  }>;
  flujo?: string;
}
