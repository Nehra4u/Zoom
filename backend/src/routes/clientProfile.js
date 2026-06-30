import { Router } from 'express';
import { authenticateClient } from '../middleware/authenticate.js';
import { User } from '../models/User.js';

const router = Router();

router.post('/profile', authenticateClient, async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        status: 'VALIDATION_ERROR',
        message: 'Name is required.',
        errors: { name: 'Name is required.' },
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        status: 'VALIDATION_ERROR',
        message: 'Phone number is required.',
        errors: { phone: 'Phone number is required.' },
      });
    }

    const user = await User.findById(req.client.sub);
    if (!user || user.status === 'deleted') {
      return res.status(404).json({
        success: false,
        status: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    user.name = name.trim();
    user.phone = phone.trim();
    user.profileComplete = true;
    if (user.status === 'pending') {
      user.status = 'active';
    }
    await user.save();

    res.json({
      success: true,
      status: 'SUCCESS',
      message: 'Profile updated successfully.',
      user: {
        userId: user._id.toString(),
        name: user.name,
        phone: user.phone,
        profileComplete: true,
        active: user.status === 'active',
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      status: 'SERVER_ERROR',
      message: err.message,
    });
  }
});

export default router;
