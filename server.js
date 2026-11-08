import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import os from 'os';
import supabase from './db/supabase.js';

// Import routes
import authRoutes from './routes/auth.js';
import packageRoutes from './routes/packages.js';
import orderRoutes from './routes/orders.js';
import contentRoutes from './routes/content.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200 // limit each IP to 200 requests per windowMs
});
app.use('/api/', limiter);

// CORS configuration - Network Access
app.use(cors({
  origin: '*', // Allow all origins for local network access
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (support both backend/uploads and ../uploads)
const uploadsPath = path.join(__dirname, 'uploads');
const fallbackUploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/uploads', express.static(fallbackUploadsPath));

const publicPath = path.join(__dirname, 'public');
const fallbackPublicPath = path.join(__dirname, '../public');
app.use('/public', express.static(publicPath));
app.use('/public', express.static(fallbackPublicPath));

// Supabase Connection Verification
(async () => {
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error && error.code === 'PGRST205') {
      console.log('⚠️  Supabase connected! Note: Tables not created yet. Please run supabase-schema.sql in Supabase SQL Editor.');
    } else if (error) {
      console.warn('⚠️  Supabase check:', error.message);
    } else {
      console.log('✅ Supabase connected & tables verified successfully!');
    }
  } catch (err) {
    console.error('❌ Supabase connection error:', err.message);
  }
})();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running with Supabase' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;

// Get local IP address
const networkInterfaces = os.networkInterfaces();
const localIP = Object.values(networkInterfaces)
  .flatMap(nic => nic?.filter(family => family.family === 'IPv4' && !family.internal)?.[0]?.address)
  .find(ip => ip);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Network Access: http://${localIP || 'localhost'}:${PORT}`);
  console.log(`🏠 Local Access: http://localhost:${PORT}`);
  console.log(`📱 Mobile Access: http://[YOUR_LOCAL_IP]:${PORT}`);
  console.log(`\n💡 To find your IP, run: ipconfig (Windows) or ifconfig (Mac/Linux)\n`);
});
