import axios, { AxiosResponse } from 'axios';
import { whatsappConfig } from '../../config/whatsapp';

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ListSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

export class WhatsAppMessagesService {
  // Espacio mínimo entre mensajes consecutivos a un mismo destinatario, para reducir el riesgo
  // de chocar con el rate limit de WhatsApp por par negocio-cliente (código 131056). Si esto
  // sigue apareciendo en los logs, subir este valor.
  private static readonly INTERVALO_MINIMO_MS = 400;
  private ultimoEnvioPorDestinatario = new Map<string, number>();

  // Los BSUID (identificador de WhatsApp para usuarios con "username") tienen forma "US.1234...",
  // a diferencia de un número de teléfono que es solo dígitos. Para enviarles un mensaje, la API
  // requiere `recipient` en vez de `to`.
  private destinatario(telefono: string): { to: string } | { recipient: string } {
    return /^[A-Z]{2}\./.test(telefono) ? { recipient: telefono } : { to: telefono };
  }

  private async esperarEspacioMinimo(destinatario: string) {
    const ultimo = this.ultimoEnvioPorDestinatario.get(destinatario);
    if (ultimo !== undefined) {
      const transcurrido = Date.now() - ultimo;
      if (transcurrido < WhatsAppMessagesService.INTERVALO_MINIMO_MS) {
        await new Promise(resolve => setTimeout(resolve, WhatsAppMessagesService.INTERVALO_MINIMO_MS - transcurrido));
      }
    }
    this.ultimoEnvioPorDestinatario.set(destinatario, Date.now());
    // Evitar que el mapa crezca sin límite en un proceso de larga duración
    if (this.ultimoEnvioPorDestinatario.size > 1000) this.ultimoEnvioPorDestinatario.clear();
  }

  private async sendRequest(endpoint: string, data: any, retries = 2): Promise<any> {
    const destinatario = data.to || data.recipient;
    if (destinatario) await this.esperarEspacioMinimo(destinatario);

    try {
      const url = `${whatsappConfig.apiUrl}/${whatsappConfig.phoneId}/${endpoint}`;
      const response: AxiosResponse = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${whatsappConfig.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      return response.data;
    } catch (error: any) {
      const codigoError = error.response?.data?.error?.code;
      if (codigoError === 131056 || codigoError === 130429) {
        console.warn(`⏱️ Rate limit de WhatsApp al enviar a ${destinatario}: código ${codigoError} - ${error.response?.data?.error?.message}. Si se repite seguido, subir INTERVALO_MINIMO_MS en messages.service.ts.`);
      } else {
        console.error('Error enviando mensaje WhatsApp:', error.response?.data || error.message);
      }
      if ((error.code === 'ECONNABORTED' || error.response?.status >= 500) && retries > 0) {
        return this.sendRequest(endpoint, data, retries - 1);
      }
      throw error;
    }
  }

  async enviarMensaje(telefono: string, mensaje: string): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      ...this.destinatario(telefono),
      type: 'text',
      text: { body: mensaje },
    });
  }

  async enviarImagen(telefono: string, imageUrl: string, caption?: string): Promise<any> {
    const payload: any = {
      messaging_product: 'whatsapp',
      ...this.destinatario(telefono),
      type: 'image',
      image: { link: imageUrl },
    };
    if (caption) payload.image.caption = caption.substring(0, 1024);
    return this.sendRequest('messages', payload);
  }

  async enviarMensajeConBotones(telefono: string, mensaje: string, botones: ReplyButton[]): Promise<any> {
    if (botones.length > 3) throw new Error('WhatsApp solo permite máximo 3 botones por mensaje');
    botones.forEach(b => { if (b.title.length > 20) b.title = b.title.substring(0, 20); });

    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      ...this.destinatario(telefono),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: mensaje },
        action: {
          buttons: botones.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    });
  }

  async enviarMensajeConLista(
    telefono: string,
    mensaje: string,
    buttonText: string,
    sections: ListSection[]
  ): Promise<any> {
    if (buttonText.length > 20) buttonText = buttonText.substring(0, 20);

    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      ...this.destinatario(telefono),
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: mensaje },
        action: {
          button: buttonText,
          sections: sections.map(s => ({
            title: s.title,
            rows: s.rows.map(r => ({
              id: r.id,
              title: r.title.substring(0, 24),
              description: r.description?.substring(0, 72),
            })),
          })),
        },
      },
    });
  }

  async enviarPlantilla(telefono: string, nombrePlantilla: string, idioma: string, parametros: string[]): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      ...this.destinatario(telefono),
      type: 'template',
      template: {
        name: nombrePlantilla,
        language: { code: idioma },
        components: [
          {
            type: 'body',
            parameters: parametros.map(valor => ({ type: 'text', text: valor })),
          },
        ],
      },
    });
  }

  async marcarComoLeido(messageId: string): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }
}

export const whatsappMessagesService = new WhatsAppMessagesService();
