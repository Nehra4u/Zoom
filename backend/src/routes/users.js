import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/authenticate.js';
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

router.use(authenticate, adminOnly);

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
    const { name, email, phone, password, zoomDisplayName, status } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const user = await createUser({
      name,
      email,
      phone,
      password,
      zoomDisplayName,
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
    const { name, email, phone, zoomDisplayName, status } = req.body;
    const user = await updateUser(
      req.params.id,
      { name, email, phone, zoomDisplayName, status },
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
