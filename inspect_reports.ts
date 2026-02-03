import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDocs() {
    const { data: reports, error } = await supabase
        .from('documents')
        .select('*')
        .eq('type', 'report');

    if (error) { console.error(error); return; }

    console.log("Found reports:", reports.length);
    if (reports.length > 0) {
        console.log("Sample Report Metadata:", JSON.stringify(reports[0].metadata, null, 2));
    }
}

checkDocs();
