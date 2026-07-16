import { Router } from 'express';
import { authenticate, adminOnly, regularAdminOnly } from '../middleware/authenticate.js';
import {
  activateUser,
  createUser,
  deactivateUser,
  deleteUser,
  getUserById,
  listUsers,
  logoutUserDevices,
  updateUser,
} from '../services/userService.js';

const router = Router();

router.use(authenticate, adminOnly, regularAdminOnly);

router.get('/', async (req, res) => {
  try {
    const users = await listUsers({ status: req.query.status }, req.admin);
    res.json({ users });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const username =
      req.body.username != null ? String(req.body.username).trim() : '';
    const password = req.body.password != null ? String(req.body.password) : '';
    const phone = req.body.phone != null ? String(req.body.phone).trim() : undefined;
    const email = req.body.email != null ? String(req.body.email).trim() : undefined;
    const { status } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const user = await createUser({
      username,
      phone: phone || undefined,
      email: email || undefined,
      password,
      status,
      createdBy: req.admin,
    });
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await getUserById(req.params.id, req.admin);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { username, email, phone, zoomDisplayName, status } = req.body;
    const user = await updateUser(
      req.params.id,
      { username, email, phone, zoomDisplayName, status },
      req.admin
    );
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/activate', async (req, res) => {
  try {
    const user = await activateUser(req.params.id, req.admin);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/deactivate', async (req, res) => {
  try {
    const user = await deactivateUser(req.params.id, req.admin);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/logout', async (req, res) => {
  try {
    const user = await logoutUserDevices(req.params.id, req.admin);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await deleteUser(req.params.id, req.admin);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
