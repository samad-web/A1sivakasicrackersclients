// Access layer for the reminder engine. Its tables/RPCs are added by the
// 20260719120000_reminder_engine migration and are NOT in the generated Database types,
// so the few calls that touch them reach the client through narrow `unknown` casts
// (localized here rather than sprinkled across components).
import { supabase } from './client';

// NOTE: the edge function is deployed in Supabase under the name `reminders-start-`
// (with a trailing hyphen — a typo at creation time). The repo dir and this code would
// normally use `reminders-start`; we match the deployed name so invoke() resolves. If the
// function is ever redeployed under the correct name, change this single constant back.
const START_FN = 'reminders-start-';

export interface ReminderRun {
  id: string;
  month_name: string;
  is_test: boolean;
  status: 'running' | 'completed' | 'failed' | 'canceled';
  total_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface StartResult {
  run_id?: string;
  total?: number;
  pending?: number;
  skipped?: number;
  test?: boolean;
  month_name?: string;
  error?: string;
}

/**
 * Cast the CLIENT, never the method. `const rpc = supabase.rpc` detaches the function from
 * its instance, so `this` is undefined and supabase-js throws
 * "Cannot read properties of undefined (reading 'rest')" — which, called from AuthProvider,
 * strands the whole app on its loading spinner.
 */
type LooseClient = {
  rpc: (fn: string) => Promise<{ data: boolean | null }>;
  from: (t: string) => {
    select: (c: string) => { eq: (col: string, val: string) => {
      maybeSingle: () => Promise<{ data: ReminderRun | null }>;
    } };
  };
};
const loose = supabase as unknown as LooseClient;

/** Is the signed-in user an admin? (public.is_admin RPC) */
export async function checkIsAdmin(): Promise<boolean> {
  const { data } = await loose.rpc('is_admin');
  return data === true;
}

/** Fetch a run's live progress row. */
export async function fetchRun(runId: string): Promise<ReminderRun | null> {
  const { data } = await loose.from('reminder_runs').select('*').eq('id', runId).maybeSingle();
  return data;
}

/** Read the error message out of a FunctionsHttpError's Response body, if present. */
async function invokeErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = error.context as Response | undefined;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch { /* fall through */ }
  }
  return error.message;
}

/** Trigger a real run for everyone unpaid in the month. */
export async function startReminders(monthName: string): Promise<StartResult> {
  const { data, error } = await supabase.functions.invoke(START_FN, {
    body: { month_name: monthName },
  });
  if (error) return { error: await invokeErrorMessage(error) };
  return data as StartResult;
}

/** Trigger a single test send to a phone number (verifies delivery before a real run). */
export async function startTestReminder(phone: string, monthName: string): Promise<StartResult> {
  const { data, error } = await supabase.functions.invoke(START_FN, {
    body: { month_name: monthName, test_phone: phone },
  });
  if (error) return { error: await invokeErrorMessage(error) };
  return data as StartResult;
}
