import { Request, Response } from 'express';
import { WhatsAppWebhookPayload } from '../types';
import { whatsappBotService } from '../services/whatsapp/bot.service';

const mensajesProcesados = new Set<string>();

export class WebhookController {
  async verificar(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'mi_token_secreto';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verificado');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }

  async recibirMensaje(req: Request, res: Response) {
    // Responder 200 inmediatamente para evitar reintentos de WhatsApp
    res.sendStatus(200);

    try {
      const body: WhatsAppWebhookPayload = req.body;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (value.messages) {
            for (const message of value.messages) {
              // Ignorar mensajes ya procesados (reintentos del webhook)
              if (mensajesProcesados.has(message.id)) {
                console.log(`⚠️ Mensaje duplicado ignorado: ${message.id}`);
                continue;
              }
              mensajesProcesados.add(message.id);
              // Limpiar el set cada 1000 entradas para evitar uso excesivo de memoria
              if (mensajesProcesados.size > 1000) mensajesProcesados.clear();

              this.procesarMensaje(message);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error procesando webhook:', error);
    }
  }

  private async procesarMensaje(message: any) {
    try {
      const telefono = message.from;
      if (message.type === 'text') {
        const texto = message.text?.body;
        if (texto) await whatsappBotService.procesarMensaje(telefono, texto, false);
      } else if (message.type === 'interactive') {
        if (message.interactive?.button_reply) {
          const { id } = message.interactive.button_reply;
          await whatsappBotService.procesarMensaje(telefono, id, true, id);
        } else if (message.interactive?.list_reply) {
          const { id } = message.interactive.list_reply;
          await whatsappBotService.procesarMensaje(telefono, id, true, id);
        }
      }
    } catch (error) {
      console.error('Error procesando mensaje individual:', error);
    }
  }
}

export const webhookController = new WebhookController();
