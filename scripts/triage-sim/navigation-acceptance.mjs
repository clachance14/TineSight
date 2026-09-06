import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const binary='/home/clachance14/.claude/skills/gstack/browse/dist/browse'
const env={...process.env,BROWSE_STATE_FILE:'/tmp/tinesight-goal-browser/browse.json'}
const run=(...args)=>execFileSync(binary,args,{env,encoding:'utf8',timeout:30000}).trim()
const state=async()=>await(await fetch('http://127.0.0.1:9410/__sim/state')).json()
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function until(check,label){for(let n=0;n<120;n++){if(await check())return;await pause(250)}throw Error(label)}
const evidence=[]
try{
run('viewport','1280x800');run('goto','http://127.0.0.1:5410/upload')
await until(()=>run('text').includes('Select Files'),'file selector')
execFileSync(process.execPath,['scripts/triage-sim/select-files.mjs','50','.gstack/triage-runs/fixtures/navigation-manifest.json'],{env,encoding:'utf8'})
await until(()=>run('text').includes('50 photos selected'),'prepared originals')
// Current flow: the location step opens on selection; skip it, then start from the review step.
run('click','button:has-text("Skip location")');await until(()=>run('text').includes('Upload 50 photos'),'review step')
run('click','button:has-text("Upload 50 photos")')
await until(async()=>{const s=await state();return s.sessions.at(-1)?.status==='uploading'&&s.sessions.at(-1)?.total_images===50},'active50photo run')
const before=await state();const id=before.sessions.at(-1).id
assert(before.sessions.at(-1).processed_images<50)
run('click','nav a[href="/photos"]:visible')
evidence.push({check:'SPA navigation while upload active',session:before.sessions.at(-1),url:run('js','location.pathname'),text:run('text')})
run('screenshot','.gstack/triage-runs/simulator/navigation-active.png')
run('click','nav a[href="/upload"]:visible')
evidence.push({check:'return during upload',text:run('text')})
await until(async()=>{const s=await state();return s.sessions.find(x=>x.id===id)?.status==='completed'},'background-owned upload completes')
const after=await state(),session=after.sessions.find(x=>x.id===id)
assert.equal(session.processed_images,50);assert.equal(session.failed_images,0)
evidence.push({check:'all50 originals completed after route unmount',session,text:run('text')})
console.log('PASS active upload survives SPA navigation and completes50 photos')
}finally{await writeFile('.gstack/triage-runs/simulator/navigation-acceptance.json',JSON.stringify(evidence,null,2)+'\n')}
