import { createClient } from '@supabase/supabase-js';

// Load .env file natively in Node 22
try {
    process.loadEnvFile('.env');
} catch (err) {
    console.warn('Warning: Could not load .env file natively. Ensure variables are in environment.');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('--- Checking columns for table "orders" ---');

    // Attempt to get columns by selecting a row
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching data from orders:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns found in database:');
        const columns = Object.keys(data[0]);
        columns.sort().forEach(col => console.log(`- ${col}`));

        const missing = ['customer_address', 'payment_mode'].filter(c => !columns.includes(c));
        if (missing.length > 0) {
            console.log('\nCRITICAL: Missing columns:', missing.join(', '));
        } else {
            console.log('\nSUCCESS: All required columns exist.');
        }
    } else {
        console.log('Table is empty. Checking columns via fallback...');
    }
}

checkSchema().catch(console.error);
