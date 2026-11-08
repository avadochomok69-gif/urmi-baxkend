import express from 'express';
import supabase from '../db/supabase.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Get all settings
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let query = supabase.from('settings').select('*');
    if (category) query = query.eq('category', category);

    const { data: settings, error } = await query;

    if (error) throw error;

    // Convert to key-value object
    const settingsObj = {};
    (settings || []).forEach(s => {
      let val = s.value;
      if (typeof val === 'string' && (val.startsWith('"') && val.endsWith('"'))) {
        try { val = JSON.parse(val); } catch (e) {}
      }
      settingsObj[s.key] = val;
    });

    res.json({
      success: true,
      settings: settingsObj
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

// Get setting by key
router.get('/:key', async (req, res) => {
  try {
    const { data: setting, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', req.params.key)
      .single();

    if (error || !setting) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    let val = setting.value;
    if (typeof val === 'string' && (val.startsWith('"') && val.endsWith('"'))) {
      try { val = JSON.parse(val); } catch (e) {}
    }

    res.json({
      success: true,
      setting: {
        key: setting.key,
        value: val
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch setting',
      error: error.message
    });
  }
});

// Update or create setting
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { key, value, label, category } = req.body;

    const { data: setting, error } = await supabase
      .from('settings')
      .upsert({
        key,
        value: typeof value === 'object' ? value : JSON.stringify(value),
        label,
        category: category || 'general',
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Setting updated successfully',
      setting
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update setting',
      error: error.message
    });
  }
});

// Bulk update settings
router.post('/bulk', protect, adminOnly, async (req, res) => {
  try {
    const { settings } = req.body;

    const upserts = Object.entries(settings || {}).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? value : JSON.stringify(value),
      updated_at: new Date().toISOString()
    }));

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('settings')
        .upsert(upserts, { onConflict: 'key' });

      if (error) throw error;
    }

    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
});

export default router;
