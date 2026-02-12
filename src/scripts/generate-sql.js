import fs from 'fs';
import path from 'path';

const JSON_PATH = 'C:/Users/mas20/Desktop/work/A1_Phase2/25 and 26 Ckers Customer  - Automation.json';
const OUTPUT_PATH = 'C:/Users/mas20/Desktop/work/A1_Phase2/supabase_data_import.sql';

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

function escape(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    return `'${String(val).replace(/'/g, "''")}'`;
}

async function run() {
    console.log('Reading JSON data...');
    const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    console.log(`Processing ${data.length} customers...`);

    const sqlLines = [
        '-- Data Import Script',
        'BEGIN;',
        ''
    ];

    for (const row of data) {
        const base = {
            receipt_no: String(row['Receipt No'] || '').trim(),
            scheme: String(row['Scheme'] || '').trim(),
            value: Number(row['Value']) || 0,
            name: String(row['Name'] || '').trim(),
            number: String(row['Number'] || '').trim(),
            secondary_number: row['Secondary Number'] ? String(row['Secondary Number']).trim() : null,
            type: String(row['Type'] || '').trim(),
            district: String(row['District'] || '').trim(),
        };

        if (!base.receipt_no && !base.name) continue;

        for (const col of MONTH_COLUMNS) {
            const status = String(row[col.name] || '').toLowerCase();
            const isCompleted = status.includes('completed') || status === 'paid' || status === 'yes' || status === 'v';

            sqlLines.push(
                `INSERT INTO public.orders (receipt_no, scheme, value, name, number, secondary_number, type, district, current_month, payment_verified, order_completed)`,
                `VALUES (`,
                `  ${escape(base.receipt_no)}, ${escape(base.scheme)}, ${escape(base.value)}, ${escape(base.name)},`,
                `  ${escape(base.number)}, ${escape(base.secondary_number)}, ${escape(base.type)}, ${escape(base.district)},`,
                `  ${escape(col.month)}, ${isCompleted}, ${isCompleted}`,
                `) ON CONFLICT (receipt_no, current_month, name, number) DO UPDATE SET`,
                `  scheme = EXCLUDED.scheme, value = EXCLUDED.value, secondary_number = EXCLUDED.secondary_number, type = EXCLUDED.type, district = EXCLUDED.district, payment_verified = EXCLUDED.payment_verified, order_completed = EXCLUDED.order_completed;`,
                ''
            );
        }
    }

    sqlLines.push('COMMIT;');

    console.log(`Writing SQL to ${OUTPUT_PATH}...`);
    fs.writeFileSync(OUTPUT_PATH, sqlLines.join('\n'));
    console.log('Done!');
}

run().catch(console.error);
