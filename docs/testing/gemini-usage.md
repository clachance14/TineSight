# Gemini token usage logging

Every `generateContent` attempt through `lib/gemini/client.ts` emits a JSON
`gemini_usage` event to server stdout (captured in Trigger.dev job logs for
background processing). Search job logs for `gemini_usage`.

Events include operation, requested model, logical call ID, unique request ID,
attempt number, timestamp, duration, response/error status, and provider token
counts: prompt, candidate output, thinking, cached input, tool-use prompt, total.
Upload analysis includes batch/image IDs and crop detection IDs; fingerprint and
comparison jobs include image/detection IDs. Concurrent photos retain separate
attribution. No prompts, images, response bodies, or credentials are in these events.

Logging occurs before JSON parsing/schema validation. Retries and model fallbacks
have separate events; count request IDs once when aggregating. A `response` status
means the provider returned, not that application validation or processing succeeded.
Missing counts are null, not zero. Failed requests may have unknown token usage;
these logs cannot reconstruct usage the provider never returned. A process crash
before a request settles can also leave no event. Total tokens are provider-reported;
do not add thinking or cached tokens to that total again.

Successful fingerprint calls now also write `batch_metrics` when the image belongs
to a batch. The saved `detections.antler_fingerprint.token_usage` contains the exact
provider breakdown; `api_cost` contains the calculated standard API list cost in USD
and integer nanodollars. Both are returned in the job result. The saved model and
generation timestamp come from the server, not model-generated metadata.

`gemini_usage` runtime events also include calculated costs for supported models.
The rate calculation covers standard text/image calls to Gemini 3 Flash Preview
and Gemini 3.8 Flash, including 3.8's introductory pricing expiry. Unsupported
models, unverified 3.8 cache pricing, or unreconciled counts return a null cost.
These are list-rate calculations, not invoice totals: credits, taxes, hosting,
other calls, and provider usage that was never returned are excluded.

Do not add `batch_metrics` totals to runtime events: those requests overlap.
The fingerprint JSON describes the latest saved fingerprint; runtime events retain
individual attempts subject to runtime log retention. Historical thinking usage
requires recovering the original provider logs; it cannot be inferred reliably.
No schema migration is required for this persistence.

Verification: `node --test lib/gemini/usage.test.ts lib/gemini/retry.test.ts`.
Tests use synthetic responses, including retries, fallback, malformed output,
missing metadata, logger failure, and concurrent photo attribution; no paid calls.
