/** Requires the populated loopback app and existing authenticated gstack session. */
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const run=(...args)=>execFileSync('/home/clachance14/.claude/skills/gstack/browse/dist/browse',args,{env:{...process.env,BROWSE_STATE_FILE:'/tmp/tinesight-photos-ui-browser/browse.json'},encoding:'utf8'}).trim()
for(const viewport of ['390x844','640x800','768x800','1024x800','1280x800']) {
  run('viewport',viewport)
  run('js','document.querySelector("main").scrollTop=650')
  const result=JSON.parse(run('js',`JSON.stringify((()=>{
    const main=document.querySelector('main').getBoundingClientRect()
    const toolbar=document.querySelector('[data-photo-toolbar]').getBoundingClientRect()
    return {gap:toolbar.top-main.top,left:toolbar.left-main.left,right:main.right-toolbar.right}
  })())`))
  assert(Math.abs(result.gap)<1,`${viewport}: exposed ${result.gap}px above toolbar`)
  assert(Math.abs(result.left)<1&&Math.abs(result.right)<1,`${viewport}: uncovered toolbar sides`)
  console.log('PASS',viewport,result)
}
