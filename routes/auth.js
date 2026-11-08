import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import supabase from '../db/supabase.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Register user
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const normalizedPhone = phone ? phone.trim() : null;

    // Check if user exists
    let query = supabase.from('users').select('id, email, phone');
    if (normalizedEmail && normalizedPhone) {
      query = query.or(`email.eq.${normalizedEmail},phone.eq.${normalizedPhone}`);
    } else if (normalizedEmail) {
      query = query.eq('email', normalizedEmail);
    } else if (normalizedPhone) {
      query = query.eq('phone', normalizedPhone);
    }

    const { data: existingUsers, error: checkError } = await query;

    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or phone'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user in Supabase
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        name: name.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        password: hashedPassword,
        role: 'customer',
        is_verified: false,
        purchases: [],
        accessible_content: []
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    const token = generateToken(newUser.id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: newUser.id,
        _id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide password'
      });
    }

    const identifier = (email || phone || '').toLowerCase().trim();

    // Find user by email or phone
    const { data: users, error: findError } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${identifier},phone.eq.${identifier}`);

    const user = users && users.length > 0 ? users[0] : null;

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Get current user
router.get('/me', protect, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        whatsapp: user.whatsapp,
        telegram: user.telegram,
        role: user.role,
        accessibleContent: user.accessible_content || []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user data',
      error: error.message
    });
  }
});

// Create or get guest user for order
router.post('/guest', async (req, res) => {
  try {
    const { name, whatsapp, telegram, email, phone } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const normalizedPhone = phone ? phone.trim() : null;

    let existingUser = null;
    if (normalizedEmail || normalizedPhone) {
      let query = supabase.from('users').select('*');
      if (normalizedEmail && normalizedPhone) {
        query = query.or(`email.eq.${normalizedEmail},phone.eq.${normalizedPhone}`);
      } else if (normalizedEmail) {
        query = query.eq('email', normalizedEmail);
      } else {
        query = query.eq('phone', normalizedPhone);
      }
      const { data: users } = await query;
      if (users && users.length > 0) existingUser = users[0];
    }

    let user = existingUser;

    if (!user) {
      const { data: createdUser, error: insertError } = await supabase
        .from('users')
        .insert({
          name: name.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          whatsapp: whatsapp ? whatsapp.trim() : null,
          telegram: telegram ? telegram.trim() : null,
          role: 'customer',
          is_verified: false,
          purchases: [],
          accessible_content: []
        })
        .select()
        .single();

      if (insertError) throw insertError;
      user = createdUser;
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

export default router;
