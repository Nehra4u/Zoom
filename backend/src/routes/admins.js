import { Router } from 'express';
import { authenticate, superAdminOnly } from '../middleware/authenticate.js';
import {
  activateAdmin,
  createAdmin,
  deactivateAdmin,
  deleteAdmin,
  getAdminById,
  listAdmins,
  updateAdmin,
} from '../services/adminService.js';
import { listZoomAccountUsers } from '../services/zoomApi.js';

const router = Router();

router.use(authenticate, superAdminOnly);

router.get('/', async (req, res) => {
  try {
    const admins = await listAdmins({
      status: req.query.status,
      role: req.query.role,
    });
    res.json({ admins });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, password, role, zoomHostUserId } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const admin = await createAdmin({
      name,
      email,
      phone,
      password,
      role: role ?? 'admin',
      zoomHostUserId,
      createdBy: req.admin,
    });
    res.status(201).json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/zoom-users', async (_req, res) => {
  try {
    const users = await listZoomAccountUsers();
    res.json({ users });
  } catch (err) {
    res.status(err.status || 503).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const admin = await getAdminById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { name, email, phone, role, zoomHostUserId } = req.body;
    const admin = await updateAdmin(req.params.id, { name, email, phone, role, zoomHostUserId }, req.admin);
    res.json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/activate', async (req, res) => {
  try {
    const admin = await activateAdmin(req.params.id, req.admin);
    res.json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/deactivate', async (req, res) => {
  try {
    const admin = await deactivateAdmin(req.params.id, req.admin);
    res.json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const admin = await deleteAdmin(req.params.id, req.admin);
    res.json({ admin });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
