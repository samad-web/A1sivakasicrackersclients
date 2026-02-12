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
    { name: 'November', month: '2025-11' },
    { name: 'December', month: '2025-12' },
    { name: 'January', month: '2026-01' },
    { name: 'Febraury', month: '2026-02' },
    { name: 'March', month: '2026-03' },
    { name: 'April', month: '2026-04' },
    { name: 'May', month: '2026-05' },
    { name: 'June', month: '2026-06' },
    { name: 'July', month: '2026-07' },
    { name: 'August', month: '2026-08' },
    { name: 'September', month: '2026-09' },
];

async function pushData() {
    console.log('Reading JSON data...');
    const rawData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log(`Processing ${rawData.length} customers...`);

    const allRecords = [];

    for (const row of rawData) {
        const baseData = {
            receipt_no: String(row['Receipt No'] || '').trim(),
            scheme: String(row['Scheme'] || '').trim(),
            value: Number(row['Value']) || 0,
            name: String(row['Name'] || '').trim(),
            number: String(row['Number'] || '').trim(),
            secondary_number: row['Secondary Number'] ? String(row['Secondary Number']).trim() : null,
            type: String(row['Type'] || '').trim(),
            district: String(row['District'] || '').trim(),
        };

        if (!baseData.receipt_no && !baseData.name) continue;

        for (const col of MONTH_COLUMNS) {
            const status = String(row[col.name] || '').toLowerCase();
            const isCompleted = status.includes('completed') || status === 'paid' || status === 'yes' || status === 'v';

            allRecords.push({
                ...baseData,
                current_month: col.month,
                payment_verified: isCompleted,
                order_completed: isCompleted,
            });
        }
    }

    console.log(`Prepared ${allRecords.length} records. Starting batch upload...`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
        const batch = allRecords.slice(i, i + BATCH_SIZE);
        console.log(`Uploading batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allRecords.length / BATCH_SIZE)}...`);

        const { error } = await supabase
            .from('orders')
            .upsert(batch, { onConflict: 'receipt_no,current_month,name,number' });

        if (error) {
            console.error('Error in batch:', JSON.stringify(error, null, 2));
        }
    }

    console.log('Data push complete!');
}

pushData().catch(console.error);
