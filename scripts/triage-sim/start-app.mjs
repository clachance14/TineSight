/** Start real Next app using ONLY loopback fixture services and invalid live keys. */
import { spawn } from 'node:child_process'
const port=process.env.TRIAGE_SIM_PORT??'9410'
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${port}`,NEXT_PUBLIC_SUPABASE_ANON_KEY:'simulation-anon',SUPABASE_SERVICE_ROLE_KEY:'simulation-service',TRIGGER_API_URL:`http://127.0.0.1:${port}`,TRIGGER_SECRET_KEY:'tr_dev_simulation',GEMINI_API_KEY:'simulation-disabled',NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'}
const mode=process.argv[2]??'dev'
if(!['dev','start','build','verify'].includes(mode))throw new Error('Use dev, start, build, or verify')
const args=mode==='verify'?['scripts/triage-goal.mjs','verify']:mode==='build'?['node_modules/next/dist/bin/next','build']:['node_modules/next/dist/bin/next',mode,'--hostname','127.0.0.1','--port',process.env.TRIAGE_APP_PORT??'3410']
const child=spawn(process.execPath,args,{stdio:'inherit',env})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>process.exitCode=code??1)
