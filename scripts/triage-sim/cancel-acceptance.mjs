/** Real browser/API cancellation with delayed loopback originals; synthetic services. */
import{execFileSync}from'node:child_process'
import{writeFile}from'node:fs/promises'
import assert from'node:assert/strict'
const env={...process.env,BROWSE_STATE_FILE:'/tmp/tinesight-goal-browser/browse.json'}
const run=(...args)=>execFileSync('/home/clachance14/.claude/skills/gstack/browse/dist/browse',args,{env,encoding:'utf8',timeout:30000}).trim()
const state=async()=>await(await fetch('http://127.0.0.1:9410/__sim/state')).json()
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(check,label){for(let n=0;n<120;n++){if(await check())return;await sleep(250)}throw Error(label)}
const evidence=[]
try{
await fetch('http://127.0.0.1:9410/__sim/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({transferDelayMs:2000})})
run('viewport','1280x800');run('goto','http://127.0.0.1:5410/upload')
await until(()=>run('text').includes('Select Files'),'file selector')
execFileSync(process.execPath,['scripts/triage-sim/select-files.mjs','50'],{env})
await until(()=>run('text').includes('50 photos selected'),'prepared originals')
// Current flow: the location step opens on selection; skip it, then start from the review step.
run('click','button:has-text("Skip location")');await until(()=>run('text').includes('Upload 50 photos'),'review step')
const handoffsBefore=(await state()).jobs.filter(x=>x.task==='batch-process').length
run('click','button:has-text("Upload 50 photos")')
await until(async()=>{const x=(await state()).sessions.at(-1);return x?.total_images===50&&x.processed_images>=25&&x.processed_images<50},'partial50photo upload')
const before=await state(),id=before.sessions.at(-1).id
run('click','button:has-text("Cancel")')
evidence.push({check:'pending-only cancel preserves completed photos',session:before.sessions.at(-1),dialog:run('text')})
run('click','text=Cancel & Delete')
// The run opens the gallery on start; once cancelled, the processing bar and its
// dialog disappear there and nothing offers a retry of deleted originals.
await until(()=>!run('text').includes('Keep Processing')&&run('js',"Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Cancel')")!=='true','cancelled UI')
const text=run('text');assert(!text.includes('Retry failed photos'));assert(!text.includes('signal is aborted'));assert(!text.includes('Upload failed'));assert(!text.includes('Keep Processing'))
await sleep(2500)
const after=await state(),session=after.sessions.find(x=>x.id===id)
assert.equal(session.status,'cancelled');assert.equal(session.processed_images,25)
// Exactly the first batch handed off before the cancel; nothing afterwards (other runs in the simulator are not this run's).
assert.equal(after.jobs.filter(x=>x.task==='batch-process').length-handoffsBefore,1)
evidence.push({check:'cancelled UI stays terminal, completed25 retained, no later analysis handoff',text,session,jobs:after.jobs.map(x=>x.task)})
run('screenshot','.gstack/triage-runs/simulator/cancel-ui-after.png')
console.log('PASS cancellation retains25 completed photos, stops remaining25, and offers no invalid retry')
}finally{await writeFile('.gstack/triage-runs/simulator/cancel-acceptance.json',JSON.stringify(evidence,null,2)+'\n')}
