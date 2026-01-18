import './env.mjs';
import { runs } from '@trigger.dev/sdk/v3';

const runId = process.argv[2] || 'run_cmjof4mbli5gn2nnee8ubw1g2';

for (let i = 0; i < 5; i++) {
  const run = await runs.retrieve(runId);
  console.log(`Attempt ${i+1}:`, {
    status: run.status,
    taskIdentifier: run.taskIdentifier,
    env: run.env?.slug,
    version: run.version
  });
  
  if (run.status === 'COMPLETED' || run.status === 'FAILED') {
    console.log("Output:", run.output);
    break;
  }
  await new Promise(r => setTimeout(r, 3000));
}
