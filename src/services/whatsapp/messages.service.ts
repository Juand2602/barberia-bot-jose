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
  private async sendRequest(endpoint: string, data: any, retries = 2): Promise<any> {
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
      console.error('Error enviando mensaje WhatsApp:', error.response?.data || error.message);
      if ((error.code === 'ECONNABORTED' || error.response?.status >= 500) && retries > 0) {
        return this.sendRequest(endpoint, data, retries - 1);
      }
      throw error;
    }
  }

  async enviarMensaje(telefono: string, mensaje: string): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'text',
      text: { body: mensaje },
    });
  }

  async enviarImagen(telefono: string, imageUrl: string, caption?: string): Promise<any> {
    const payload: any = {
      messaging_product: 'whatsapp',
      to: telefono,
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
      to: telefono,
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
      to: telefono,
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

  async marcarComoLeido(messageId: string): Promise<any> {
    return this.sendRequest('messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }
}

export const whatsappMessagesService = new WhatsAppMessagesService();
