/** Loopback fixtures only. Verifies actual modal image load/fallback, not markup alone. */
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const run=(...args)=>execFileSync('/home/clachance14/.claude/skills/gstack/browse/dist/browse',args,{env:{...process.env,BROWSE_STATE_FILE:'/tmp/tinesight-photos-ui-browser/browse.json'},encoding:'utf8'}).trim()
const js=code=>run('js',code)
const wait=()=>new Promise(r=>setTimeout(r,150))
async function until(check){for(let i=0;i<80;i++){if(check())return;await wait()}throw new Error('Preview check timed out')}
const photoId=JSON.parse(js('JSON.stringify(location.pathname.split("/").at(-1))'))
const base='http://127.0.0.1:9410/rest/v1/'
const detections=await (await fetch(`${base}detections?image_id=eq.${photoId}`)).json()
const detection=detections[0]
const [photo]=await (await fetch(`${base}images?id=eq.${photoId}`)).json()
assert(detection&&photo)
async function patch(table,id,values){const result=await fetch(`${base}${table}?id=eq.${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(values)});assert(result.ok)}
async function open(){run('reload');await until(()=>js('Boolean(document.querySelector("aside [data-detection-interactive]"))')==='true');await new Promise(r=>setTimeout(r,600));js('document.querySelector("aside [data-detection-interactive]").click()');await until(()=>js('Boolean(document.querySelector("[data-deer-preview]"))')==='true')}
const loaded=()=>js('(()=>{const img=document.querySelector("[data-deer-preview] img");return Boolean(img?.complete&&img.naturalWidth>0)})()')==='true'
const evidence=[]
try {
 run('viewport','1280x800')
 await patch('detections',detection.id,{crop_file_path:null});await open();await until(loaded)
 assert.equal(js('document.querySelector("[data-deer-preview] img").src.includes("/medium/")'),'true')
 evidence.push('missing saved crop uses loaded medium preview')
 await patch('detections',detection.id,{crop_file_path:'missing/deer-preview.webp'});await open();await until(loaded)
 assert.equal(js('document.querySelector("[data-deer-preview] img").src.includes("/medium/")'),'true')
 evidence.push('404 saved crop falls back to loaded medium preview')
 await patch('detections',detection.id,{crop_file_path:photo.medium_path});await open();await until(loaded)
 assert.equal(js('document.querySelector("[data-deer-preview] img").classList.contains("object-contain")'),'true')
 evidence.push('available saved crop displays directly')
 await patch('detections',detection.id,{crop_file_path:null});await patch('images',photo.id,{medium_path:'missing/photo-preview.webp'});await open()
 await until(()=>js('document.querySelector("[data-deer-preview]")?.textContent.includes("unavailable")')==='true')
 evidence.push('failed fallback shows explicit unavailable state')
} finally {
 await patch('detections',detection.id,{crop_file_path:detection.crop_file_path??null})
 await patch('images',photo.id,{medium_path:photo.medium_path})
 await open();await until(loaded)
}
run('viewport','390x844');assert.equal(Number(js('document.documentElement.scrollWidth')),390);assert(loaded())
run('screenshot','.gstack/triage-runs/photos-ui/deer-preview-mobile.png')
evidence.push('mobile modal loads preview without horizontal overflow')
await writeFile('.gstack/triage-runs/photos-ui/deer-preview-acceptance.json',JSON.stringify(evidence,null,2)+'\n')
console.log('PASS',JSON.stringify(evidence))
