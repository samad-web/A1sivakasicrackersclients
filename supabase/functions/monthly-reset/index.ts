import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentRecord {
    id: string
    order_id: string
    month_name: string
    payment_status: string
    payment_date: string | null
    payment_amount: number
    notes: string | null
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const startTime = Date.now()

    try {
        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        console.log('Monthly reset job started')

        // Get the current month (first day of this month)
        const now = new Date()
        const resetMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const resetMonthStr = resetMonth.toISOString().split('T')[0] // YYYY-MM-DD format

        console.log(`Reset month: ${resetMonthStr}`)

        // Check if reset already ran this month (idempotency check)
        const { data: existingLog, error: logCheckError } = await supabase
            .from('monthly_reset_logs')
            .select('id, status')
            .eq('reset_month', resetMonthStr)
            .eq('status', 'success')
            .maybeSingle()

        if (logCheckError) {
            console.error('Error checking existing logs:', logCheckError)
            throw new Error(`Failed to check existing logs: ${logCheckError.message}`)
        }

        if (existingLog) {
            console.log('Reset already completed for this month - skipping (idempotent)')

            // Log the skipped attempt
            await supabase.from('monthly_reset_logs').insert({
                reset_month: resetMonthStr,
                archived_count: 0,
                reset_count: 0,
                status: 'skipped',
                error_message: 'Reset already completed for this month',
                execution_time_ms: Date.now() - startTime
            })

            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Reset already completed this month',
                    skipped: true
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Determine the previous month name (the month we're resetting)
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const prevMonthName = prevMonth.toLocaleDateString('en-US', { month: 'long' })
        console.log(`Resetting payments for previous month: ${prevMonthName}`)

        // Step 1: Fetch completed payments for PREVIOUS month only to archive
        const { data: completedPayments, error: fetchError } = await supabase
            .from('monthly_payments')
            .select('*')
            .eq('payment_status', 'Completed')
            .eq('month_name', prevMonthName)

        if (fetchError) {
            console.error('Error fetching completed payments:', fetchError)
            throw new Error(`Failed to fetch payments: ${fetchError.message}`)
        }

        console.log(`Found ${completedPayments?.length || 0} completed payments to archive for ${prevMonthName}`)

        let archivedCount = 0
        let resetCount = 0

        // Step 2: Archive completed payments for previous month
        if (completedPayments && completedPayments.length > 0) {
            const archiveRecords = completedPayments.map((payment: PaymentRecord) => ({
                archive_date: resetMonthStr,
                order_id: payment.order_id,
                month_name: payment.month_name,
                payment_status: payment.payment_status,
                payment_date: payment.payment_date,
                payment_amount: payment.payment_amount,
                notes: payment.notes,
            }))

            const { error: archiveError } = await supabase
                .from('monthly_archives')
                .insert(archiveRecords)

            if (archiveError) {
                console.error('Error archiving payments:', archiveError)
                throw new Error(`Failed to archive payments: ${archiveError.message}`)
            }

            archivedCount = completedPayments.length
            console.log(`Archived ${archivedCount} payment records`)
        }

        // Step 3: Reset ONLY previous month's payments to "Pending" (preserve advance-paid months)
        const { error: resetError, count } = await supabase
            .from('monthly_payments')
            .update({
                payment_status: 'Pending',
                payment_date: null,
                notes: null,
            })
            .eq('month_name', prevMonthName)
            .neq('payment_status', 'Empty')
            .select('*', { count: 'exact', head: true })

        if (resetError) {
            console.error('Error resetting payments:', resetError)
            throw new Error(`Failed to reset payments: ${resetError.message}`)
        }

        resetCount = count || 0
        console.log(`Reset ${resetCount} payment records to Pending for ${prevMonthName}`)

        // Step 3b: Reset orders.payment_verified ONLY for orders that don't have current month paid
        // This preserves payment_verified for advance-paid users
        const currentMonthName = now.toLocaleDateString('en-US', { month: 'long' })

        const { data: advancePaidOrders } = await supabase
            .from('monthly_payments')
            .select('order_id')
            .eq('month_name', currentMonthName)
            .eq('payment_status', 'Completed')

        const advancePaidIds = (advancePaidOrders || []).map((r: { order_id: string }) => r.order_id)

        // Set payment_verified=false for all orders first
        const { error: resetAllFlagsError } = await supabase
            .from('orders')
            .update({ payment_verified: false })
            .eq('payment_verified', true)

        if (resetAllFlagsError) {
            console.error('Error resetting payment_verified flags:', resetAllFlagsError)
            throw new Error(`Failed to reset order flags: ${resetAllFlagsError.message}`)
        }

        // Then set payment_verified=true for orders that have current month Completed (advance + direct payers)
        if (advancePaidIds.length > 0) {
            const { error: setPaidFlagsError } = await supabase
                .from('orders')
                .update({ payment_verified: true })
                .in('id', advancePaidIds)

            if (setPaidFlagsError) {
                console.error('Error setting payment_verified for paid orders:', setPaidFlagsError)
                throw new Error(`Failed to set paid flags: ${setPaidFlagsError.message}`)
            }
        }

        console.log(`Synced orders.payment_verified to current month status (${advancePaidIds.length} orders set to true)`)

        // Step 4: Log the successful operation
        const executionTime = Date.now() - startTime
        const { error: logError } = await supabase
            .from('monthly_reset_logs')
            .insert({
                reset_month: resetMonthStr,
                archived_count: archivedCount,
                reset_count: resetCount,
                status: 'success',
                execution_time_ms: executionTime,
            })

        if (logError) {
            console.error('Error logging operation:', logError)
            // Don't throw - operation succeeded even if logging failed
        }

        console.log(`Monthly reset completed successfully in ${executionTime}ms`)

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Monthly reset completed successfully',
                data: {
                    reset_month: resetMonthStr,
                    archived_count: archivedCount,
                    reset_count: resetCount,
                    execution_time_ms: executionTime,
                },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Monthly reset failed:', error)

        // Log the failure
        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            const now = new Date()
            const resetMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            const resetMonthStr = resetMonth.toISOString().split('T')[0]

            await supabase.from('monthly_reset_logs').insert({
                reset_month: resetMonthStr,
                archived_count: 0,
                reset_count: 0,
                status: 'failed',
                error_message: error instanceof Error ? error.message : String(error),
                execution_time_ms: Date.now() - startTime,
            })
        } catch (logError) {
            console.error('Failed to log error:', logError)
        }

        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
