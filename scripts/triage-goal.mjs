#!/usr/bin/env node
/** Durable goal ledger + repeatable checks. No credentials, deployments or DB writes. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerPath = path.join(root, 'docs/goals/photo-triage.json')
const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))
const [command = 'status', id, status, ...evidence] = process.argv.slice(2)
if (command === 'status' || command === 'next') {
  const items = command === 'next' ? ledger.items.filter(x => x.status !== 'done').slice(0,5) : ledger.items
  console.log(ledger.objective)
  for (const item of items) console.log(`${item.id} [${item.status}] ${item.group}: ${item.title}`)
  console.log(`${ledger.items.filter(x => x.status === 'done').length}/${ledger.items.length} done`)
} else if (command === 'record') {
  const item = ledger.items.find(x => x.id === id)
  if (!item || !['pending','active','done','blocked'].includes(status) || !evidence.length) {
    throw new Error('Usage: triage-goal.mjs record T01 active|done|blocked|pending "evidence or reason"')
  }
  item.status = status
  item.evidence.push({at: new Date().toISOString(), note:evidence.join(' ')})
  await writeFile(ledgerPath, JSON.stringify(ledger,null,2)+'\n')
  console.log(`${id}: ${status}`)
} else if (command === 'verify') {
  const output = path.join(root,'.gstack','triage-runs',new Date().toISOString().replaceAll(':','-'))
  await mkdir(output,{recursive:true})
  const results=[]
  for (const name of ['test:unit','type-check','build','changed-lint']) {
    let text=''
    const child=name==='changed-lint'
      ?spawn(process.execPath,['scripts/triage-sim/changed-lint.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']})
      :spawn('npm',['run',name],{cwd:root,stdio:['ignore','pipe','pipe']})
    for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{text+=chunk;process.stdout.write(chunk)})
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)})
    await writeFile(path.join(output,`${name.replace(':','-')}.log`),text)
    results.push({name,code})
    if (code !== 0) break
  }
  await writeFile(path.join(output,'checks.json'),JSON.stringify(results,null,2)+'\n')
  console.log(`Evidence: ${output}`)
  process.exitCode=results.some(x=>x.code!==0)?1:0
} else {
  throw new Error('Commands: status, next, record, verify. Simulation: node scripts/triage-sim/server.mjs')
}
