import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/authenticate.js';
import { listAuditLogs } from '../services/auditLogService.js';
import { getReconciliationStatus, reconcileSessionState } from '../services/reconciliationService.js';

const router = Router();

router.use(authenticate, adminOnly);

router.get('/', async (req, res) => {
  try {
    const isSuperAdmin = req.admin.role === 'super_admin';
    const logs = await listAuditLogs({
      actorId: req.admin.sub,
      isSuperAdmin,
      filters: {
        action: req.query.action,
        targetUserId: req.query.targetUserId,
        limit: req.query.limit,
      },
    });
    res.json({ logs, scope: isSuperAdmin ? 'all' : 'own' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/reconcile', async (req, res) => {
  try {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    const result = await reconcileSessionState();
    res.json({ result, status: getReconciliationStatus() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
