/** Existing gstack browser; loopback app only. No live services or new browser dependency. */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.TRIAGE_ACCEPTANCE_URL??'http://127.0.0.1:5410'
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Acceptance requires loopback app')
const binary=process.env.TRIAGE_BROWSE_BINARY??'/home/clachance14/.claude/skills/gstack/browse/dist/browse'
const env={...process.env,BROWSE_STATE_FILE:'/tmp/tinesight-goal-browser/browse.json'}
const evidence=[]
const run=(...args)=>execFileSync(binary,args,{env,encoding:'utf8',timeout:30000}).trim()
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(check,label){for(let n=0;n<60;n++){if(check())return;await sleep(250)}throw new Error(`Timed out: ${label}`)}
function location(){return run('js','window.location.pathname + window.location.search')}
function focus(selector){run('js',`document.querySelector(${JSON.stringify(selector)}).focus()`)}
await mkdir('.gstack/triage-runs/simulator',{recursive:true})
try {
 run('viewport','1280x800')
 run('goto',base+'/photos?triageView=trophy&sortBy=captured_at&sortDirection=desc')
 await until(()=>run('snapshot','-i').includes('Open CAM'),'trophy grid')
 focus('[aria-label^="Open CAM"]');run('press','Enter')
 await until(()=>location().includes('/photos/')&&run('snapshot','-i').includes('Next photo'),'detail navigation')
 const first=location(), tree=run('snapshot','-i')
 for(const label of ['Back to filtered photos','Previous photo','Next photo','Delete photo'])assert(tree.includes(label),label)
 assert(first.includes('triageView=trophy')&&first.includes('sortDirection=desc'))
 evidence.push({check:'keyboard opens photo and named detail controls',url:first,tree})
 focus('a[aria-label="Next photo"]');run('press','Enter')
 await until(()=>location()!==first&&run('snapshot','-i').includes('Previous photo'),'keyboard next photo')
 const second=location();assert(second.includes('triageView=trophy')&&second.includes('sortDirection=desc'))
 evidence.push({check:'keyboard next retains filters',url:second})
 run('viewport','390x844')
 assert(run('is','visible','a[aria-label="Previous photo"]').includes('true'))
 focus('a[aria-label="Previous photo"]');run('press','Enter')
 await until(()=>location()===first,'mobile previous')
 evidence.push({check:'mobile has keyboard/tap navigation alternative',url:location()})
 const before=location()
 run('js',`return (async()=>{const el=document.querySelector('.touch-pan-y');const rect=el.getBoundingClientRect();const event=(type,x,end=false)=>{const t=new Touch({identifier:1,target:el,clientX:x,clientY:rect.top+80});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:end?[]:[t],changedTouches:[t],targetTouches:end?[]:[t]}))};event('touchstart',rect.left+320);await new Promise(r=>setTimeout(r,30));event('touchmove',rect.left+80);await new Promise(r=>setTimeout(r,30));event('touchend',rect.left+60,true);return 'dispatched synthetic swipe'})()`)
 await until(()=>location()!==before,'mobile swipe')
 assert(location().includes('triageView=trophy'))
 evidence.push({check:'synthetic browser touch swipe retains filters',url:location(),limit:'Synthetic TouchEvents, not physical device gesture testing'})
 run('screenshot','.gstack/triage-runs/simulator/detail-accessibility-after.png')
 focus('a[aria-label="Back to filtered photos"]');run('press','Enter')
 await until(()=>location().startsWith('/photos?'),'keyboard back')
 assert(location().includes('triageView=trophy'))
 evidence.push({check:'keyboard back retains filters',url:location()})
 console.log('PASS keyboard/detail/mobile synthetic-touch acceptance')
} finally {await writeFile('.gstack/triage-runs/simulator/keyboard-acceptance.json',JSON.stringify(evidence,null,2)+'\n')}
