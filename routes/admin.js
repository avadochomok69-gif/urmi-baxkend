import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import supabase from '../db/supabase.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { mapPackage } from './packages.js';
import { mapOrder } from './orders.js';
import { mapContent } from './content.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// Dashboard stats
router.get('/dashboard/stats', protect, adminOnly, async (req, res) => {
  try {
    const [
      { count: totalCustomers },
      { count: totalOrders },
      { count: pendingOrders },
      { count: approvedOrders },
      { count: activePackages },
      { data: approvedOrdersList }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('packages').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('orders').select('payment_info').eq('status', 'approved')
    ]);

    const totalRevenue = (approvedOrdersList || []).reduce((sum, o) => {
      const amount = Number(o.payment_info?.amount) || 0;
      return sum + amount;
    }, 0);

    res.json({
      success: true,
      stats: {
        totalCustomers: totalCustomers || 0,
        totalOrders: totalOrders || 0,
        totalRevenue,
        pendingOrders: pendingOrders || 0,
        approvedOrders: approvedOrders || 0,
        activePackages: activePackages || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
});

// Get all orders
router.get('/orders', protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from('orders')
      .select('*, packages(*), users(name, email, phone, whatsapp, telegram)', { count: 'exact' });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data: orders, count, error } = await query;

    if (error) throw error;

    const formatted = (orders || []).map(mapOrder);

    res.json({
      success: true,
      orders: formatted,
      totalPages: Math.ceil((count || 0) / limitNum),
      currentPage: pageNum,
      total: count || 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// Approve order
router.patch('/orders/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, packages(*)')
      .eq('id', req.params.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select('*, packages(*), users(name, email, phone)')
      .single();

    if (updateError) throw updateError;

    // Grant content access for photo/video packages
    const pkg = order.packages;
    if (pkg && (pkg.category === 'photo' || pkg.category === 'video') && order.customer_id) {
      const contentItems = pkg.content_items || [];
      if (contentItems.length > 0) {
        const { data: user } = await supabase
          .from('users')
          .select('accessible_content')
          .eq('id', order.customer_id)
          .single();

        let accessible = user?.accessible_content || [];
        for (const contentId of contentItems) {
          if (!accessible.some(a => a.contentId === contentId)) {
            accessible.push({
              contentId,
              packageId: pkg.id,
              grantedAt: new Date().toISOString()
            });
          }
        }

        await supabase
          .from('users')
          .update({ accessible_content: accessible })
          .eq('id', order.customer_id);
      }
    }

    res.json({
      success: true,
      message: 'Order approved successfully',
      order: mapOrder(updatedOrder)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to approve order',
      error: error.message
    });
  }
});

// Reject order
router.patch('/orders/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const { adminNotes } = req.body;

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        admin_notes: adminNotes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select('*, packages(*), users(name, email, phone)')
      .single();

    if (error || !updatedOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order rejected',
      order: mapOrder(updatedOrder)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject order',
      error: error.message
    });
  }
});

// Get all customers
router.get('/customers', protect, adminOnly, async (req, res) => {
  try {
    const { data: customers, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'customer')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (customers || []).map(u => ({
      ...u,
      _id: u.id,
      id: u.id,
      createdAt: u.created_at
    }));

    res.json({
      success: true,
      count: formatted.length,
      customers: formatted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message
    });
  }
});

// Get all packages (admin)
router.get('/packages', protect, adminOnly, async (req, res) => {
  try {
    const { data: packages, error } = await supabase
      .from('packages')
      .select('*')
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

// Create package
router.post('/packages', protect, adminOnly, upload.single('thumbnail'), async (req, res) => {
  try {
    let features = [];
    let contentItems = [];

    if (req.body.features) {
      try { features = typeof req.body.features === 'string' ? JSON.parse(req.body.features) : req.body.features; } catch(e) {}
    }
    if (req.body.contentItems) {
      try { contentItems = typeof req.body.contentItems === 'string' ? JSON.parse(req.body.contentItems) : req.body.contentItems; } catch(e) {}
    }

    const packageData = {
      title: req.body.title,
      title_bn: req.body.titleBn,
      description: req.body.description,
      description_bn: req.body.descriptionBn,
      category: req.body.category,
      price: Number(req.body.price) || 0,
      duration: req.body.duration || null,
      is_active: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
      features,
      content_items: contentItems,
      item_count: Number(req.body.itemCount) || 0,
      sort_order: Number(req.body.sortOrder) || 0
    };

    if (req.file) {
      packageData.thumbnail = `/uploads/${req.file.filename}`;
    }

    const { data: createdPkg, error } = await supabase
      .from('packages')
      .insert(packageData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Package created successfully',
      package: mapPackage(createdPkg)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create package',
      error: error.message
    });
  }
});

// Update package
router.put('/packages/:id', protect, adminOnly, upload.single('thumbnail'), async (req, res) => {
  try {
    const updateData = { updated_at: new Date().toISOString() };

    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.titleBn !== undefined) updateData.title_bn = req.body.titleBn;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.descriptionBn !== undefined) updateData.description_bn = req.body.descriptionBn;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.price !== undefined) updateData.price = Number(req.body.price);
    if (req.body.duration !== undefined) updateData.duration = req.body.duration;
    if (req.body.isActive !== undefined) updateData.is_active = Boolean(req.body.isActive);
    if (req.body.sortOrder !== undefined) updateData.sort_order = Number(req.body.sortOrder);
    if (req.body.itemCount !== undefined) updateData.item_count = Number(req.body.itemCount);

    if (req.body.features) {
      try { updateData.features = typeof req.body.features === 'string' ? JSON.parse(req.body.features) : req.body.features; } catch(e) {}
    }
    if (req.body.contentItems) {
      try { updateData.content_items = typeof req.body.contentItems === 'string' ? JSON.parse(req.body.contentItems) : req.body.contentItems; } catch(e) {}
    }
    if (req.file) {
      updateData.thumbnail = `/uploads/${req.file.filename}`;
    }

    const { data: updatedPkg, error } = await supabase
      .from('packages')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !updatedPkg) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    res.json({
      success: true,
      message: 'Package updated successfully',
      package: mapPackage(updatedPkg)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update package',
      error: error.message
    });
  }
});

// Delete package
router.delete('/packages/:id', protect, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Package deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete package',
      error: error.message
    });
  }
});

// Get all content
router.get('/content', protect, adminOnly, async (req, res) => {
  try {
    const { data: contents, error } = await supabase
      .from('content')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (contents || []).map(mapContent);

    res.json({
      success: true,
      count: formatted.length,
      content: formatted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch content',
      error: error.message
    });
  }
});

// Create content
router.post('/content', protect, adminOnly, upload.array('files', 10), async (req, res) => {
  try {
    const files = (req.files || []).map(file => ({
      url: `/uploads/${file.filename}`,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype
    }));

    let packages = [];
    if (req.body.packages) {
      try { packages = typeof req.body.packages === 'string' ? JSON.parse(req.body.packages) : req.body.packages; } catch(e) {}
    }

    const contentData = {
      title: req.body.title,
      title_bn: req.body.titleBn,
      description: req.body.description,
      description_bn: req.body.descriptionBn,
      type: req.body.type || 'photo',
      category: req.body.category || 'premium',
      files,
      packages,
      is_published: req.body.isPublished !== undefined ? Boolean(req.body.isPublished) : false,
      views: 0
    };

    if (req.body.thumbnail) {
      contentData.thumbnail = req.body.thumbnail;
    } else if (files.length > 0) {
      contentData.thumbnail = files[0].url;
    }

    const { data: content, error } = await supabase
      .from('content')
      .insert(contentData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Content created successfully',
      content: mapContent(content)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create content',
      error: error.message
    });
  }
});

// Update content
router.put('/content/:id', protect, adminOnly, async (req, res) => {
  try {
    const updateData = { updated_at: new Date().toISOString() };
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.titleBn !== undefined) updateData.title_bn = req.body.titleBn;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.descriptionBn !== undefined) updateData.description_bn = req.body.descriptionBn;
    if (req.body.type !== undefined) updateData.type = req.body.type;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.thumbnail !== undefined) updateData.thumbnail = req.body.thumbnail;
    if (req.body.isPublished !== undefined) updateData.is_published = Boolean(req.body.isPublished);

    const { data: content, error } = await supabase
      .from('content')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    res.json({
      success: true,
      message: 'Content updated successfully',
      content: mapContent(content)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update content',
      error: error.message
    });
  }
});

// Delete content
router.delete('/content/:id', protect, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase
      .from('content')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Content deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete content',
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
// PACKAGE MEDIA MANAGEMENT
// ─────────────────────────────────────────────

// Get all media for a package (admin sees all)
router.get('/packages/:id/media', protect, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('package_media')
      .select('*')
      .eq('package_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ success: true, media: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch media', error: error.message });
  }
});

// Upload media item(s) to a package
router.post('/packages/:id/media', protect, adminOnly, upload.array('files', 20), async (req, res) => {
  try {
    const { id: packageId } = req.params;
    const { titles, mediaType } = req.body; // titles = JSON array, mediaType = 'demo' | 'exclusive'

    // Verify package exists
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('id')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    let parsedTitles = [];
    if (titles) {
      try { parsedTitles = JSON.parse(titles); } catch(e) { parsedTitles = []; }
    }

    const mediaInserts = req.files.map((file, idx) => ({
      package_id: packageId,
      title: parsedTitles[idx] || file.originalname,
      file_url: `/uploads/${file.filename}`,
      file_type: file.mimetype.startsWith('video/') ? 'video' : 'photo',
      media_type: mediaType === 'exclusive' ? 'exclusive' : 'demo',
      file_size: file.size,
      original_name: file.originalname
    }));

    const { data, error } = await supabase
      .from('package_media')
      .insert(mediaInserts)
      .select();

    if (error) throw error;

    res.status(201).json({ success: true, message: 'Media uploaded successfully', media: data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to upload media', error: error.message });
  }
});

// Update a media item (title, media_type toggle)
router.patch('/packages/:id/media/:mediaId', protect, adminOnly, async (req, res) => {
  try {
    const { title, mediaType } = req.body;
    const updateData = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (mediaType !== undefined) updateData.media_type = mediaType;

    const { data, error } = await supabase
      .from('package_media')
      .update(updateData)
      .eq('id', req.params.mediaId)
      .eq('package_id', req.params.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'Media item not found' });
    }

    res.json({ success: true, message: 'Media updated', media: data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update media', error: error.message });
  }
});

// Delete a media item
router.delete('/packages/:id/media/:mediaId', protect, adminOnly, async (req, res) => {
  try {
    // Get file info first to delete from disk
    const { data: mediaItem } = await supabase
      .from('package_media')
      .select('file_url')
      .eq('id', req.params.mediaId)
      .single();

    // Delete from DB
    const { error } = await supabase
      .from('package_media')
      .delete()
      .eq('id', req.params.mediaId)
      .eq('package_id', req.params.id);

    if (error) throw error;

    // Delete file from disk if local
    if (mediaItem?.file_url && mediaItem.file_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../', mediaItem.file_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ success: true, message: 'Media deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete media', error: error.message });
  }
});

// ─────────────────────────────────────────────
// ORDER APPROVAL — GRANT ACCESS (new endpoint)
// ─────────────────────────────────────────────
router.patch('/orders/:id/grant-access', protect, adminOnly, async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, packages(*)')
      .eq('id', req.params.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Order already approved' });
    }

    // Update order status
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select('*, packages(*)')
      .single();

    if (updateError) throw updateError;

    // Grant package access in user_package_access table
    if (order.customer_id) {
      // Upsert access record
      const { error: accessError } = await supabase
        .from('user_package_access')
        .upsert({
          user_id: order.customer_id,
          package_id: order.package_id,
          order_id: order.id,
          granted_at: new Date().toISOString()
        }, { onConflict: 'user_id,package_id' });

      if (accessError) {
        console.error('Failed to grant package access:', accessError.message);
      }
    }

    res.json({
      success: true,
      message: 'Access granted successfully',
      order: mapOrder(updatedOrder)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to grant access', error: error.message });
  }
});

export default router;
