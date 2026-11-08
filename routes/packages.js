import express from 'express';
import supabase from '../db/supabase.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

export const mapPackage = (p) => {
  if (!p) return null;
  return {
    ...p,
    id: p.id,
    _id: p.id,
    titleBn: p.title_bn || p.titleBn || '',
    descriptionBn: p.description_bn || p.descriptionBn || '',
    isActive: p.is_active !== undefined ? p.is_active : (p.isActive ?? true),
    contentItems: p.content_items || p.contentItems || [],
    itemCount: p.item_count !== undefined ? p.item_count : (p.itemCount || 0),
    sortOrder: p.sort_order !== undefined ? p.sort_order : (p.sortOrder || 0),
    createdAt: p.created_at || p.createdAt,
    updatedAt: p.updated_at || p.updatedAt
  };
};

// Get all active packages
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: packages, error } = await query;

    if (error) throw error;

    const formatted = (packages || []).map(mapPackage);

    res.json({
      success: true,
      count: formatted.length,
      packages: formatted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages',
      error: error.message
    });
  }
});

// Get package by ID
router.get('/:id', async (req, res) => {
  try {
    const { data: package_, error } = await supabase
      .from('packages')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !package_) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    res.json({
      success: true,
      package: mapPackage(package_)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package',
      error: error.message
    });
  }
});

// Get packages by category
router.get('/category/:category', async (req, res) => {
  try {
    const { data: packages, error } = await supabase
      .from('packages')
      .select('*')
      .eq('category', req.params.category)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (packages || []).map(mapPackage);

    res.json({
      success: true,
      count: formatted.length,
      packages: formatted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages',
      error: error.message
    });
  }
});

// Get package media (public: returns all demo + exclusive only if user has access)
router.get('/:id/media', async (req, res) => {
  try {
    // Get all media for this package
    const { data: allMedia, error } = await supabase
      .from('package_media')
      .select('*')
      .eq('package_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Check if user is authenticated and has purchased this package
    let hasAccess = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(
          authHeader.split(' ')[1],
          process.env.JWT_SECRET
        );
        const { data: accessRow } = await supabase
          .from('user_package_access')
          .select('id')
          .eq('user_id', decoded.id)
          .eq('package_id', req.params.id)
          .single();
        hasAccess = !!accessRow;

        // Also check if admin
        if (!hasAccess) {
          const { data: userRow } = await supabase
            .from('users')
            .select('role')
            .eq('id', decoded.id)
            .single();
          hasAccess = userRow?.role === 'admin';
        }
      } catch (e) {
        // Token invalid or expired — treat as unauthenticated
      }
    }

    // Map media: exclusive items get a locked flag if no access
    const media = (allMedia || []).map(item => {
      if (item.media_type === 'exclusive' && !hasAccess) {
        return {
          ...item,
          file_url: null, // hide URL
          locked: true
        };
      }
      return { ...item, locked: false };
    });

    res.json({
      success: true,
      media,
      hasAccess
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package media',
      error: error.message
    });
  }
});

export default router;
