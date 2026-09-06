/** Real browser run of the "Choose photos" (simple) uploader against the loopback simulator. */
import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const binary='/home/clachance14/.claude/skills/gstack/browse/dist/browse'
const env={...process.env,BROWSE_STATE_FILE:'/tmp/tinesight-goal-browser/browse.json'}
const run=(...args)=>execFileSync(binary,args,{env,encoding:'utf8',timeout:30000}).trim()
const state=async()=>await(await fetch('http://127.0.0.1:9410/__sim/state')).json()
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(check,label){for(let n=0;n<120;n++){if(await check())return;await pause(250)}throw Error(label)}
const count=Number(process.argv[2]??30)
const manifest=process.argv[3]??'.gstack/triage-runs/fixtures/manifest.json'
const evidence=[]
try{
run('viewport','1280x800');run('goto','http://127.0.0.1:5410/upload')
await until(()=>run('text').includes('Choose photos'),'upload page')
run('click','button[role="tab"]:has-text("Choose photos")')
await until(()=>run('text').includes('No location assigned')||run('text').includes('Photo group location'),'simple tab')
const before=(await state()).sessions.length
execFileSync(process.execPath,['scripts/triage-sim/select-files.mjs',String(count),manifest],{env,encoding:'utf8'})
await until(()=>run('text').includes('Skip'),'location step')
run('click','button:has-text("Skip")')
await until(()=>run('text').includes(`Upload ${count} photos`),'review step')
run('click',`button:has-text("Upload ${count} photos")`)
await until(async()=>{const s=await state();return s.sessions.length>before&&s.sessions.at(-1)?.total_images===count},'session with every photo reserved')
const id=(await state()).sessions.at(-1).id
await until(async()=>{const s=await state();return s.sessions.find(x=>x.id===id)?.status==='completed'},'simple upload completes')
const after=await state(),session=after.sessions.find(x=>x.id===id)
assert.equal(session.processed_images,count);assert.equal(session.failed_images,0)
assert.equal(session.upload_finished_at!==undefined&&session.upload_finished_at!==null,true,'session close acknowledged')
const text=run('text');assert(!text.includes('Upload failed'));assert(!text.includes('signal is aborted'))
evidence.push({check:`simple uploader completes ${count} originals through the shared run`,session,url:run('js','location.pathname'),jobs:after.jobs.map(x=>x.task)})
run('screenshot','.gstack/triage-runs/simulator/simple-upload-after.png')
console.log(`PASS simple uploader completes ${count} photos, closes its session, and hands off processing`)
}finally{await writeFile('.gstack/triage-runs/simulator/simple-upload-acceptance.json',JSON.stringify(evidence,null,2)+'\n')}
