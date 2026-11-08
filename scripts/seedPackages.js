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

const samplePackages = [
  {
    title: '1 Hour Video Call',
    title_bn: '১ ঘন্টা ভিডিও কল',
    description: 'Enjoy a private 1-hour video call session',
    description_bn: 'একান্ত ১ ঘন্টার ভিডিও কল সেশন উপভোগ করুন',
    category: 'calling',
    price: 500,
    duration: '1 Hour',
    is_active: true,
    features: [
      'Private video call',
      'Screen sharing available',
      'Recording allowed'
    ],
    content_items: [],
    item_count: 0,
    sort_order: 1
  },
  {
    title: '2 Hour Video Call',
    title_bn: '২ ঘন্টা ভিডিও কল',
    description: 'Extended 2-hour video call session with more time',
    description_bn: 'বর্ধিত ২ ঘন্টার ভিডিও কল সেশন',
    category: 'calling',
    price: 900,
    duration: '2 Hours',
    is_active: true,
    features: [
      'Private video call',
      'Extended time',
      'Special requests allowed'
    ],
    content_items: [],
    item_count: 0,
    sort_order: 2
  },
  {
    title: 'Bold Photo Collection',
    title_bn: 'বোল্ড ফটো কালেকশন',
    description: 'Exclusive collection of bold photos',
    description_bn: 'এক্সক্লুসিভ বোল্ড ফটো কালেকশন',
    category: 'photo',
    price: 300,
    is_active: true,
    features: [
      '20+ HD photos',
      'Downloadable',
      'Lifetime access'
    ],
    content_items: [],
    item_count: 20,
    sort_order: 3
  },
  {
    title: 'Premium Photo Bundle',
    title_bn: 'প্রিমিয়াম ফটো বান্ডেল',
    description: 'Premium collection of exclusive photos',
    description_bn: 'প্রিমিয়াম এক্সক্লুসিভ ফটো কালেকশন',
    category: 'photo',
    price: 500,
    is_active: true,
    features: [
      '50+ HD photos',
      'High quality',
      'Behind the scenes'
    ],
    content_items: [],
    item_count: 50,
    sort_order: 4
  },
  {
    title: 'Premium Video Collection',
    title_bn: 'প্রিমিয়াম ভিডিও কালেকশন',
    description: 'Exclusive premium video content',
    description_bn: 'এক্সক্লুসিভ প্রিমিয়াম ভিডিও কন্টেন্ট',
    category: 'video',
    price: 700,
    is_active: true,
    features: [
      '10+ HD videos',
      'Full HD quality',
      'Downloadable'
    ],
    content_items: [],
    item_count: 10,
    sort_order: 5
  },
  {
    title: 'Exclusive Video Bundle',
    title_bn: 'এক্সক্লুসিভ ভিডিও বান্ডেল',
    description: 'Complete exclusive video collection',
    description_bn: 'সম্পূর্ণ এক্সক্লুসিভ ভিডিও কালেকশন',
    category: 'video',
    price: 1200,
    is_active: true,
    features: [
      '20+ videos',
      '4K quality',
      'Special content',
      'Lifetime access'
    ],
    content_items: [],
    item_count: 20,
    sort_order: 6
  }
];

async function seedPackages() {
  try {
    console.log('Connecting to Supabase...');

    const { count } = await supabase
      .from('packages')
      .select('*', { count: 'exact', head: true });

    if (count > 0) {
      console.log(`⚠️  ${count} packages already exist in Supabase! Clearing old packages...`);
      await supabase.from('packages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { error: insertError } = await supabase
      .from('packages')
      .insert(samplePackages);

    if (insertError) throw insertError;

    console.log('\n✅ Sample packages created successfully in Supabase!');
    console.log('================================');
    console.log(`Created ${samplePackages.length} packages:`);
    console.log('- 2 Calling packages');
    console.log('- 2 Photo packages');
    console.log('- 2 Video packages');
    console.log('================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding packages:', error.message);
    process.exit(1);
  }
}

seedPackages();
