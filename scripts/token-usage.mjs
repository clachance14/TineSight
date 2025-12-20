import './env.mjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all metrics
const { data, error } = await supabase
  .from('batch_metrics')
  .select('*')
  .order('created_at', { ascending: false });

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

// Aggregate by call type
const totals = {
  detection: { calls: 0, promptTokens: 0, responseTokens: 0, totalTokens: 0, rateLimited: 0 },
  classification: { calls: 0, promptTokens: 0, responseTokens: 0, totalTokens: 0, rateLimited: 0 }
};

let grandTotal = 0;

data.forEach(row => {
  const type = row.gemini_call_type || 'unknown';
  if (!totals[type]) {
    totals[type] = { calls: 0, promptTokens: 0, responseTokens: 0, totalTokens: 0, rateLimited: 0 };
  }
  totals[type].calls++;
  totals[type].promptTokens += row.prompt_tokens || 0;
  totals[type].responseTokens += row.response_tokens || 0;
  totals[type].totalTokens += row.total_tokens || 0;
  if (row.is_rate_limited) totals[type].rateLimited++;
  grandTotal += row.total_tokens || 0;
});

console.log('\n=== Gemini Token Usage (All Time) ===\n');
console.log('Total records:', data.length);
console.log('');

Object.entries(totals).forEach(([type, stats]) => {
  if (stats.calls > 0) {
    console.log(type.toUpperCase() + ':');
    console.log('  API Calls:', stats.calls.toLocaleString());
    console.log('  Prompt Tokens:', stats.promptTokens.toLocaleString());
    console.log('  Response Tokens:', stats.responseTokens.toLocaleString());
    console.log('  Total Tokens:', stats.totalTokens.toLocaleString());
    console.log('  Rate Limited:', stats.rateLimited);
    console.log('  Avg Tokens/Call:', Math.round(stats.totalTokens / stats.calls).toLocaleString());
    console.log('');
  }
});

console.log('=== GRAND TOTAL ===');
console.log('Total Tokens:', grandTotal.toLocaleString());
console.log('');

// Show recent activity by day
const byDay = {};
data.forEach(row => {
  const day = row.created_at?.split('T')[0] || 'unknown';
  if (!byDay[day]) byDay[day] = { calls: 0, tokens: 0 };
  byDay[day].calls++;
  byDay[day].tokens += row.total_tokens || 0;
});

console.log('=== Usage by Day ===');
Object.entries(byDay)
  .sort(([a], [b]) => b.localeCompare(a))
  .slice(0, 7)
  .forEach(([day, stats]) => {
    console.log(`${day}: ${stats.calls.toLocaleString()} calls, ${stats.tokens.toLocaleString()} tokens`);
  });
