import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

router.get('/', (req, res) => webhookController.verificar(req, res));
router.post('/', (req, res) => webhookController.recibirMensaje(req, res));

export default router;
