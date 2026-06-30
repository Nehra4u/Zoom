import { Router } from 'express';
import { authenticateClient } from '../middleware/authenticate.js';
import { User } from '../models/User.js';
import { issueZoomCredentialsForUser } from '../services/zoomTokenService.js';

const router = Router();

router.post('/zoom', authenticateClient, async (req, res) => {
  try {
    const user = await User.findById(req.client.sub);
    if (!user || user.status === 'deleted') {
      return res.status(404).json({ error: 'User not found' });
    }

    const credentials = await issueZoomCredentialsForUser(user);
    res.json(credentials);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
