import { Request, Response } from 'express';
import { WhatsAppWebhookPayload } from '../types';
import { whatsappBotService } from '../services/whatsapp/bot.service';

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
    try {
      const body: WhatsAppWebhookPayload = req.body;
      if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          if (value.messages) {
            for (const message of value.messages) {
              await this.procesarMensaje(message);
            }
          }
        }
      }
      res.sendStatus(200);
    } catch (error) {
      console.error('Error procesando webhook:', error);
      res.sendStatus(500);
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
