import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createAdmin() {
  try {
    console.log('Connecting to Supabase...');

    // Check if admin already exists
    const { data: existingAdmin, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'admin@urmi.com')
      .single();

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log('Email:', existingAdmin.email);
      console.log('Name:', existingAdmin.name);
      process.exit(0);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    // Create admin user in Supabase
    const { data: newAdmin, error: insertError } = await supabase
      .from('users')
      .insert({
        name: 'Admin',
        email: 'admin@urmi.com',
        password: hashedPassword,
        role: 'admin',
        is_verified: true,
        purchases: [],
        accessible_content: []
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log('\n✅ Admin user created successfully in Supabase!');
    console.log('================================');
    console.log('Email: admin@urmi.com');
    console.log('Password: admin123');
    console.log('================================');
    console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
}

createAdmin();
