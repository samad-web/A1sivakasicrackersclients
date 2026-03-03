import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env file natively in Node 22
try {
    process.loadEnvFile('.env');
} catch (err) {
    console.warn('Warning: Could not load .env file natively. Ensure variables are in environment.');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const JSON_PATH = './25 and 26 Ckers Customer  - Automation.json';

const MONTH_COLUMNS = [
    { jsonKey: 'November', dbName: 'November' },
    { jsonKey: 'December', dbName: 'December' },
    { jsonKey: 'January', dbName: 'January' },
    { jsonKey: 'Febraury', dbName: 'February' },
    { jsonKey: 'March', dbName: 'March' },
    { jsonKey: 'April', dbName: 'April' },
    { jsonKey: 'May', dbName: 'May' },
    { jsonKey: 'June', dbName: 'June' },
    { jsonKey: 'July', dbName: 'July' },
    { jsonKey: 'August', dbName: 'August' },
    { jsonKey: 'September', dbName: 'September' },
];

async function pushData() {
    console.log('Reading JSON data...');
    const rawData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log(`Processing ${rawData.length} customers...`);

    for (const row of rawData) {
        const baseOrder = {
            receipt_no: String(row['Receipt No'] || '').trim(),
            scheme: String(row['Scheme'] || '').trim(),
            value: Number(row['Value']) || 0,
            name: String(row['Name'] || '').trim(),
            number: String(row['Number'] || '').trim(),
            secondary_number: row['Secondary Number'] ? String(row['Secondary Number']).trim() : null,
            type: String(row['Type'] || '').trim(),
            district: String(row['District'] || '').trim(),
            current_month: '2026-02', // Standard month to satisfy legacy current_month logic
        };

        if (!baseOrder.receipt_no && !baseOrder.name) continue;

        console.log(`Pushing order: ${baseOrder.name} (${baseOrder.receipt_no})...`);

        // 1. Upsert Order
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .upsert(baseOrder, { onConflict: 'receipt_no,name,number' })
            .select('id')
            .single();

        if (orderError) {
            console.error(`Error upserting order ${baseOrder.receipt_no}:`, JSON.stringify(orderError, null, 2));
            continue;
        }

        const orderId = orderData.id;

        // 2. Prepare Monthly Payments
        const monthlyPayments = MONTH_COLUMNS.map(col => {
            const status = String(row[col.jsonKey] || '').toLowerCase();
            const isCompleted = status.includes('completed') || status === 'paid' || status === 'yes' || status === 'v';

            return {
                order_id: orderId,
                month_name: col.dbName,
                payment_status: isCompleted ? 'Completed' : 'Pending',
                payment_date: isCompleted ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            };
        });

        // 3. Upsert Monthly Payments in batch for this order
        const { error: paymentError } = await supabase
            .from('monthly_payments')
            .upsert(monthlyPayments, { onConflict: 'order_id,month_name' });

        if (paymentError) {
            console.error(`Error upserting payments for ${baseOrder.receipt_no}:`, JSON.stringify(paymentError, null, 2));
        }
    }

    console.log('Data push complete!');
}

pushData().catch(console.error);
