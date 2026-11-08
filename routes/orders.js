import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import supabase from '../db/supabase.js';
import { protect } from '../middleware/auth.js';
import { mapPackage } from './packages.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer for payment screenshot
const screenshotStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/screenshots');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'screenshot-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadScreenshot = multer({
  storage: screenshotStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files allowed for payment screenshot'));
  }
});

export const mapOrder = (o) => {
  if (!o) return null;
  const pkg = o.packages || o.package;
  return {
    ...o,
    id: o.id,
    _id: o.id,
    customer: o.customer_id,
    customerInfo: o.customer_info || {},
    paymentInfo: o.payment_info || {},
    bookingInfo: o.booking_info || {},
    adminNotes: o.admin_notes,
    package: pkg ? mapPackage(pkg) : null,
    status: o.status,
    createdAt: o.created_at,
    updatedAt: o.updated_at
  };
};

// Create new order (supports multipart for screenshot)
router.post('/', protect, uploadScreenshot.single('paymentScreenshot'), async (req, res) => {
  try {
    const { packageId, customerInfo, paymentInfo } = req.body;

    // Validate package
    const { data: package_, error: pkgError } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !package_) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Verify payment amount matches package price
    if (Number(paymentInfo.amount) !== Number(package_.price)) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount does not match package price'
      });
    }

    // Handle payment screenshot
    let paymentScreenshotUrl = null;
    if (req.file) {
      paymentScreenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    }

    // Parse paymentInfo if it came as JSON string (multipart)
    let parsedPaymentInfo = paymentInfo;
    if (typeof paymentInfo === 'string') {
      try { parsedPaymentInfo = JSON.parse(paymentInfo); } catch(e) {}
    }
    let parsedCustomerInfo = customerInfo;
    if (typeof customerInfo === 'string') {
      try { parsedCustomerInfo = JSON.parse(customerInfo); } catch(e) {}
    }

    // Create order in Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id: req.user.id,
        package_id: packageId,
        customer_info: {
          name: parsedCustomerInfo?.name || customerInfo?.name,
          whatsapp: parsedCustomerInfo?.whatsapp || customerInfo?.whatsapp,
          telegram: parsedCustomerInfo?.telegram || customerInfo?.telegram,
          email: req.user.email,
          phone: req.user.phone
        },
        payment_info: {
          method: parsedPaymentInfo?.method || paymentInfo?.method,
          transactionId: parsedPaymentInfo?.transactionId || paymentInfo?.transactionId,
          amount: parsedPaymentInfo?.amount || paymentInfo?.amount,
          screenshotUrl: paymentScreenshotUrl
        },
        status: 'pending'
      })
      .select('*, packages(*)')
      .single();

    if (orderError) throw orderError;

    // Update user contact info & purchases
    const currentPurchases = req.user.purchases || [];
    const updatedPurchases = [...currentPurchases, order.id];

    await supabase
      .from('users')
      .update({
        whatsapp: customerInfo.whatsapp || req.user.whatsapp,
        telegram: customerInfo.telegram || req.user.telegram,
        purchases: updatedPurchases
      })
      .eq('id', req.user.id);

    res.status(201).json({
      success: true,
      message: 'Order created successfully. Your payment is pending verification.',
      order: mapOrder(order)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// Get user's orders
router.get('/my-orders', protect, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, packages(*)')
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (orders || []).map(mapOrder);

    res.json({
      success: true,
      count: formatted.length,
      orders: formatted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// Get order by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, packages(*), users(name, email, phone)')
      .eq('id', req.params.id)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns this order or is admin
    if (order.customer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    res.json({
      success: true,
      order: mapOrder(order)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

// Check if user has access to a package
router.get('/access/:packageId', protect, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_package_access')
      .select('id, granted_at')
      .eq('user_id', req.user.id)
      .eq('package_id', req.params.packageId)
      .single();

    res.json({
      success: true,
      hasAccess: !error && !!data,
      accessInfo: data || null
    });
  } catch (error) {
    res.json({ success: true, hasAccess: false, accessInfo: null });
  }
});

export default router;
