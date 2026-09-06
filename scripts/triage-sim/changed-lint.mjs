/** Check ESLint findings on changed lines, without concealing the existing baseline. */
import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'
function git(args){const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout}
const tracked=git(['diff','--name-only','--diff-filter=ACMR','-z']).split('\0').filter(Boolean)
const added=new Set(git(['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean))
const externalPrefixes=['components/landing/','components/auth/','app/(auth)/']
const externalFiles=new Set(['app/page.tsx'])
const isExternal=f=>externalFiles.has(f)||externalPrefixes.some(prefix=>f.startsWith(prefix))
const changedFiles=[...new Set([...tracked,...added])]
const externalChanges=changedFiles.filter(isExternal)
const files=changedFiles.filter(f=>!isExternal(f)).filter(f=>/\.(ts|tsx|mjs|cjs)$/.test(f)&&!f.startsWith('docs/'))
const ranges=new Map()
for(const f of files){if(added.has(f)){ranges.set(path.resolve(f),[[1,Infinity]]);continue}const diff=git(['diff','--unified=0','--',f]);const lines=[...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map(m=>[Number(m[1]),Number(m[1])+Number(m[2]??1)-1]);ranges.set(path.resolve(f),lines)}
const dir=path.resolve('.gstack/triage-runs/final');mkdirSync(dir,{recursive:true})
const run=spawnSync(process.execPath,['node_modules/eslint/bin/eslint.js',...files,'--format','json'],{encoding:'utf8',maxBuffer:32*1024*1024})
writeFileSync(path.join(dir,'eslint-full.json'),run.stdout);writeFileSync(path.join(dir,'eslint-stderr.log'),run.stderr)
if(run.error)throw run.error
let results;try{results=JSON.parse(run.stdout)}catch{throw new Error(`ESLint did not return JSON (exit ${run.status}): ${run.stderr.slice(0,500)}`)}
const findings=[];let baseline=0
for(const file of results)for(const message of file.messages){if(message.severity===0)continue;const changed=message.fatal||(ranges.get(file.filePath)??[]).some(([start,end])=>message.line>=start&&message.line<=end);if(changed)findings.push({file:path.relative(process.cwd(),file.filePath),...message});else baseline++}
const report={files:files.length,externalChanges,changedFindings:findings,otherFindings:baseline,eslintExit:run.status}
writeFileSync(path.join(dir,'eslint-changed.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=findings.length?1:run.status===2?2:0
