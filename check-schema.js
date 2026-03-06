
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const envPath = path.join(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
    console.error(".env.local not found!")
    process.exit(1)
}

const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
    const parts = line.split('=')
    if (parts.length >= 2) {
        const key = parts[0].trim()
        const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '')
        env[key] = value
    }
})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
    console.log("Checking orders table schema...")
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .limit(1)

    if (error) {
        console.error("SCHEMA CHECK ERROR:", error.message)
        return
    }

    const columns = data.length > 0 ? Object.keys(data[0]) : []
    if (columns.length === 0) {
        // If table is empty, we might need another way to check columns
        // but usually .select('*') on empty table returns empty array and no error
        // Let's try to get columns via a more direct metadata query if possible
        // or just assume if no error, columns might be different.
        // Actually, Supabase JS returns keys even for empty array if we use a specific approach? No.
        console.log("Table is empty, trying to insert a temporary row to check columns...")

        const { data: insertData, error: insertError } = await supabase
            .from('orders')
            .insert({ total_amount: 0, status: 'pending' })
            .select()

        if (insertError) {
            console.error("INSERT CHECK ERROR:", insertError.message)
            if (insertError.message.includes('payment_method')) {
                console.log("CONFIRMED: payment_method column is MISSING.")
            }
            return
        }

        const newColumns = Object.keys(insertData[0])
        console.log("Found columns:", newColumns.join(', '))
        checkRequired(newColumns)

        // Cleanup
        await supabase.from('orders').delete().eq('id', insertData[0].id)
    } else {
        console.log("Found columns:", columns.join(', '))
        checkRequired(columns)
    }
}

function checkRequired(columns) {
    const required = ['payment_method', 'payment_status']
    const missing = required.filter(c => !columns.includes(c))

    if (missing.length === 0) {
        console.log("SUCCESS: All required columns found!")
    } else {
        console.log("MISSING COLUMNS:", missing.join(', '))
        console.log("Please run CHECKOUT_FIX.sql in Supabase SQL Editor.")
    }
}

checkSchema()
