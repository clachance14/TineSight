import {readFileSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const files=JSON.parse(readFileSync(process.argv[3]??'.gstack/triage-runs/fixtures/manifest.json')).slice(0,Number(process.argv[2]??1000)).map(x=>x.path)
const result=spawnSync('/home/clachance14/.claude/skills/gstack/browse/dist/browse',['upload','input[type=file]:not([webkitdirectory])',...files],{env:{...process.env,BROWSE_STATE_FILE:'/tmp/tinesight-goal-browser/browse.json'},encoding:'utf8',maxBuffer:1024*1024})
writeFileSync('.gstack/triage-runs/simulator/file-selection.log',result.stdout+result.stderr)
console.log(`Selected ${files.length} files; browser exit ${result.status}`)
process.exit(result.status??1)
