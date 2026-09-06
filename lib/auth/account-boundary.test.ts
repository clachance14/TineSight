import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { createAccountBoundary, authNavigation } from './account-boundary.ts'

test('account switch removes private cached photos before the next account reads them', async () => {
  const client = new QueryClient({defaultOptions:{queries:{staleTime:60_000}}})
  let resets=0
  const notify=createAccountBoundary(client,()=>{resets++})
  notify('A')
  client.setQueryData(['photos','infinite',{}],{owner:'A'})
  notify(null)
  notify('B')
  const result=await client.fetchQuery({queryKey:['photos','infinite',{}],queryFn:async()=>({owner:'B'})})
  assert.equal(result.owner,'B')
  assert.equal(resets,2)
  client.clear()
})

test('token refresh for the same account preserves its cache and selection', () => {
  const client=new QueryClient()
  let resets=0
  const notify=createAccountBoundary(client,()=>{resets++})
  notify('A');client.setQueryData(['photos'],[1]);notify('A')
  assert.deepEqual(client.getQueryData(['photos']),[1])
  assert.equal(resets,0)
  client.clear()
})

test('first auth notification preserves data fetched during hydration',()=>{
 const client=new QueryClient();client.setQueryData(['photos'],{owner:'old'})
 const notify=createAccountBoundary(client,()=>{})
 notify('B');assert.deepEqual(client.getQueryData(['photos']),{owner:'old'});client.clear()
})

test('effect remount cannot forget the identity of a retained QueryClient',()=>{
 const client=new QueryClient();createAccountBoundary(client,()=>{})('A');client.setQueryData(['photos'],{owner:'A'})
 let changes=0
 const notify=createAccountBoundary(client,()=>{},()=>{changes++})
 notify('B');assert.equal(client.getQueryData(['photos']),undefined);assert.equal(changes,1);client.clear()
})

test('real mounted query observers require account subtree teardown',async()=>{
 const {QueryObserver}=await import('@tanstack/react-query')
 const client=new QueryClient();let unsubscribe=()=>{};let current:any
 const notify=createAccountBoundary(client,()=>{},()=>{
   unsubscribe()
   current=new QueryObserver(client,{queryKey:['photos'],queryFn:async()=>({owner:'B'}),staleTime:Infinity})
   unsubscribe=current.subscribe(()=>{})
 })
 notify('A');client.setQueryData(['photos'],{owner:'A'})
 current=new QueryObserver(client,{queryKey:['photos'],queryFn:async()=>({owner:'A'}),staleTime:Infinity});unsubscribe=current.subscribe(()=>{})
 notify('B')
 assert.notEqual(current.getCurrentResult().data?.owner,'A')
 await new Promise(resolve=>setTimeout(resolve,0))
 assert.equal(current.getCurrentResult().data?.owner,'B')
 unsubscribe();client.clear()
})

test('account swap aborts query signals and ignores late old-user results',async()=>{
 const client=new QueryClient();const notify=createAccountBoundary(client,()=>{})
 notify('A');let resolve!: (value:unknown)=>void;let aborted=false
 const pending=client.fetchQuery({queryKey:['photos'],queryFn:({signal})=>{signal.addEventListener('abort',()=>{aborted=true});return new Promise(done=>{resolve=done})}}).catch(()=>null)
 notify('B');resolve({owner:'A'});await pending
 assert.equal(aborted,true);assert.equal(client.getQueryData(['photos']),undefined)
 client.clear()
})

test('auth completion can distinguish first sign-in from a private account swap', () => {
  const client = new QueryClient()
  const changes: Array<[string | null, string | null]> = []
  const notify = createAccountBoundary(client, () => {}, (next, previous) => {
    changes.push([next, previous])
  })
  notify(null)
  client.setQueryData(['photos'], { owner: 'stale' })
  notify('A')
  assert.equal(client.getQueryData(['photos']), undefined)
  notify('B')
  notify(null)
  assert.deepEqual(changes, [['A', null], ['B', 'A'], [null, 'B']])
  client.clear()
})

test('auth forms finish before navigation while private switches force a document reload', () => {
  assert.equal(authNavigation('A', true), 'form')
  assert.equal(authNavigation('B', true), 'form')
  assert.equal(authNavigation('B', false), 'reload')
  assert.equal(authNavigation(null, true), 'form')
  assert.equal(authNavigation(null, false, true), 'reload')
  assert.equal(authNavigation(null, false), 'login')
})
