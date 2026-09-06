/**
 * Isolated Supabase/Trigger HTTP simulator for actual Next API and browser runs.
 * Never loads .env, never forwards requests, binds loopback only. This is NOT a
 * Postgres/RLS or Gemini-accuracy test. Unknown endpoints fail visibly.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, appendFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fixtureUserId } from './fixtures.mjs'

const port=Number(process.env.TRIAGE_SIM_PORT??9410)
const origin=`http://127.0.0.1:${port}`
const logDir=path.resolve('.gstack/triage-runs/simulator')
await mkdir(logDir,{recursive:true})
const user={id:fixtureUserId,aud:'authenticated',role:'authenticated',email:'operator@triage.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Simulation Operator'},created_at:'2026-01-01T00:00:00Z'}
const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400,iat:Math.floor(Date.now()/1000)},'simulation-only'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
const session={access_token:jwt,token_type:'bearer',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,refresh_token:'simulation-refresh',user}
const tables={profiles:[{id:user.id,full_name:'Simulation Operator',trophy_threshold:130,role:'owner'}],images:[],detections:[],processing_batches:[],upload_sessions:[],cameras:[],locations:[],deer:[],match_candidates:[],trophy_clusters:[],filter_presets:[]}
for(let i=0;i<5;i++) tables.locations.push({id:`22222222-2222-4222-8222-${String(i+1).padStart(12,'0')}`,user_id:user.id,name:`Location ${i+1}`,area_name:`Location ${i+1}`,lat:35+i*.1,lng:-95,direction_compass:null,direction_notes:null})
for(let i=0;i<20;i++)tables.cameras.push({id:`33333333-3333-4333-8333-${String(i+1).padStart(12,'0')}`,user_id:user.id,name:`Camera ${i+1}`,make:'TineSight Simulation',model:'Synthetic',device_identifier:`SIM-${i+1}`,status:'active'})
const objects=new Map()
const jobs=[]
const faults=[]
let activeTransfers=0,maxTransfers=0,requestCount=0,transferDelayMs=15
const thumbnail=await sharp({create:{width:400,height:300,channels:3,background:'#354b3b'}}).webp().toBuffer()

async function log(event) {await appendFile(path.join(logDir,'events.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n')}
function json(res,status,value,headers={}) {res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*','access-control-expose-headers':'content-range',...headers});res.end(JSON.stringify(value))}
function split(value) {let depth=0,start=0,out=[];for(let i=0;i<value.length;i++){if('(['.includes(value[i]))depth++;if(')]'.includes(value[i]))depth--;if(value[i]===','&&depth===0){out.push(value.slice(start,i));start=i+1}}out.push(value.slice(start));return out}
function literal(v){if(v==='null')return null;if(v==='true')return true;if(v==='false')return false;if(/^-?\d+(\.\d+)?$/.test(v))return Number(v);return v.replace(/^"|"$/g,'')}
function predicate(actual,expr) {
  if(expr.startsWith('not.'))return !predicate(actual,expr.slice(4))
  const at=expr.indexOf('.'),op=expr.slice(0,at),raw=expr.slice(at+1),value=literal(raw)
  if(op==='eq')return actual===value
  if(op==='neq')return actual!==value
  if(op==='is')return value===null?actual==null:actual===value
  if(op==='in')return split(raw.slice(1,-1)).map(literal).includes(actual)
  if(op==='gte')return actual!=null&&actual>=value
  if(op==='lte')return actual!=null&&actual<=value
  if(op==='gt')return actual!=null&&actual>value
  if(op==='lt')return actual!=null&&actual<value
  if(op==='ilike'||op==='like')return String(actual??'').toLowerCase().includes(raw.replaceAll('*','').replaceAll('%','').toLowerCase())
  throw new Error(`Unsupported simulator predicate ${op}`)
}
function expression(row,expr){
  if(expr.startsWith('and('))return split(expr.slice(4,-1)).every(x=>expression(row,x))
  if(expr.startsWith('or('))return split(expr.slice(3,-1)).some(x=>expression(row,x))
  const at=expr.indexOf('.');return predicate(row[expr.slice(0,at)],expr.slice(at+1))
}
function enrich(table,row){
  if(table==='images')return {...row,detections:tables.detections.filter(d=>d.image_id===row.id),processing_batches:tables.processing_batches.find(b=>b.id===row.batch_id)??null,source_batch:tables.processing_batches.find(b=>b.id===row.batch_id)??null}
  if(table==='detections')return {...row,images:tables.images.find(i=>i.id===row.image_id)??null,deer:tables.deer.find(d=>d.id===row.deer_id)??null}
  return {...row}
}
function matches(table,row,params){
  // PostgREST left-embedded source rows become null when relation predicates
  // reject them. The outer not.is.null / batch_id.is.null decides membership.
  if(table==='images') {
    let source=tables.processing_batches.find(b=>b.id===row.batch_id)??null
    if(source)for(const [key,value] of params) {
      if(!key.startsWith('source_batch.'))continue
      const field=key.slice('source_batch.'.length)
      const accepted=field==='or'||field==='and'
        ? expression(source,`${field}${value}`)
        : predicate(source[field],value)
      if(!accepted){source=null;break}
    }
    row={...row,source_batch:source}
  }
  const nested=[...params].filter(([k])=>k.includes('.')&&!['order','select'].includes(k))
  for(const [key,expr]of params){
    if(['select','order','limit','offset','on_conflict','columns'].includes(key)||key.includes('.'))continue
    if(key==='or'||key==='and'){const vals=split(expr.slice(1,-1));if(!(key==='or'?vals.some(x=>expression(row,x)):vals.every(x=>expression(row,x))))return false;continue}
    if(key==='detections'){const ds=tables.detections.filter(d=>d.image_id===row.id&&d.deleted_at==null);if(expr==='is.null'&&ds.length)return false;continue}
    if(!predicate(row[key],expr))return false
  }
  if(table==='images'&&(params.get('select')?.includes('detections!inner')||nested.some(([k])=>k.startsWith('detections.')))){
    const ds=tables.detections.filter(d=>d.image_id===row.id)
    if(!ds.some(d=>nested.filter(([k])=>k.startsWith('detections.')).every(([k,v])=>predicate(d[k.split('.').at(-1)],v))))return false
  }
  return true
}
function filtered(table,params){
  const rows=tables[table].filter(row=>matches(table,row,params))
  if(params.has('order'))rows.sort((a,b)=>{for(const item of split(params.get('order'))){const [key,direction,...opts]=item.split('.');const av=a[key],bv=b[key],asc=direction!=='desc';if(av==null||bv==null){if(av==null&&bv==null)continue;const nullFirst=opts.includes('nullsfirst')||(!opts.includes('nullslast')&&!asc);return av==null?(nullFirst?-1:1):(nullFirst?1:-1)}if(av!==bv)return(av<bv?-1:1)*(asc?1:-1)}return 0})
  return rows
}
function defaultRow(table,input){
  const now=new Date().toISOString();const row={id:randomUUID(),created_at:now,updated_at:now,...input}
  if(table==='images')return {is_cancelled:false,detection_status:'pending',variant_status:'pending',is_archived:false,deleted_at:null,captured_at:null,imported_at:now,classification:null,confidence:null,best_score:null,thumbnail_path:null,medium_path:null,camera_id:null,upload_completed_at:null,has_deer:false,has_hogs:false,has_cows:false,has_goats:false,has_people:false,has_vehicles:false,review_status:'unreviewed',triage_tier:'unprocessed',...row}
  if(table==='processing_batches')return {status:'pending',processed_images:0,successful_images:0,failed_images:0,cancelled_at:null,upload_session_id:null,...row}
  if(table==='upload_sessions')return {status:'uploading',total_images:0,total_batches:0,processed_images:0,failed_images:0,completed_at:null,...row}
  return row
}
function aggregate(){for(const s of tables.upload_sessions){const bs=tables.processing_batches.filter(b=>b.upload_session_id===s.id);s.total_batches=bs.length;s.total_images=bs.reduce((n,b)=>n+b.total_images,0);s.processed_images=bs.reduce((n,b)=>n+b.processed_images,0);if(s.status==='cancelled'||s.cancelled_at)continue;if(!bs.length)continue;if(!s.upload_finished_at){s.status='uploading';continue}if(bs.length)s.status=bs.every(b=>['completed','failed','cancelled'].includes(b.status))?'completed':bs.some(b=>b.status==='processing')?'processing':'uploading'}}
function processBatch(batchId){
  const b=tables.processing_batches.find(x=>x.id===batchId);if(!b||b.cancelled_at)return
  b.status='processing'
  const photos=tables.images.filter(x=>x.batch_id===batchId&&x.upload_completed_at)
  for(const [index,p]of photos.entries())setTimeout(()=>{
    if(b.cancelled_at)return
    if(!objects.has(`photos/${p.file_path}`)){p.detection_status='failed';b.failed_images++;b.processed_images++;void log({event:'missing_original',photoId:p.id});return}
    const ordinal=tables.images.indexOf(p),tier=ordinal%10,hasDeer=tier===6||tier===7
    Object.assign(p,{detection_status:'completed',variant_status:'ready',triage_tier:tier<6?'empty':tier===6?'doe':tier===7?'trophy':'other',thumbnail_path:`thumbnails/${p.id}.webp`,medium_path:`medium/${p.id}.webp`,classification:hasDeer?'deer':null,has_deer:hasDeer,has_people:tier===8,has_vehicles:tier===9,best_score:tier===7?130+ordinal%70:null,confidence:0.95})
    if(tier>=6)tables.detections.push({id:randomUUID(),image_id:p.id,deer_id:null,deleted_at:null,class:tier<8?'deer':tier===8?'person':'vehicle',sex:tier===7?'buck':tier===6?'doe':null,confidence:.95,size_class:tier===7?'trophy':null,is_trophy:tier===7,score_gross:p.best_score,quality_status:'high_quality',estimated_point_range:'8-10',point_min:8,point_max:10,bbox_x:1500,bbox_y:1000,bbox_width:6000,bbox_height:7000})
    objects.set(`photos/${p.thumbnail_path}`,thumbnail);objects.set(`photos/${p.medium_path}`,thumbnail)
    b.successful_images++;b.processed_images++;if(b.processed_images>=photos.length)b.status='completed';aggregate();void log({event:'simulated_analysis_completed',photoId:p.id,batchId,kind:tier})
  },30+index*4)
}

const server=http.createServer(async(req,res)=>{
  const start=performance.now(),url=new URL(req.url,origin);requestCount++
  const trace=randomUUID();res.on('finish',()=>void log({event:'request',trace,method:req.method,path:url.pathname,status:res.statusCode,ms:Math.round(performance.now()-start),queryBytes:url.search.length}))
  res.setHeader('access-control-allow-origin','*');res.setHeader('access-control-allow-headers','*');res.setHeader('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS')
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  try{
    if(url.href.length>8192)return json(res,414,{message:'Simulated 8KB URI limit'})
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const buffer=Buffer.concat(chunks)
    let body={};if(buffer.length&&req.headers['content-type']?.includes('json'))body=JSON.parse(buffer.toString())
    const fault=faults.find(f=>f.remaining>0&&url.pathname.includes(f.path)&&(!f.method||f.method===req.method))
    if(fault){fault.remaining--;return json(res,fault.status,{message:'Injected simulation failure',error:'Injected simulation failure'},{'retry-after':'1'})}
    if(url.pathname==='/__sim/state')return json(res,200,{requestCount,maxTransfers,objects:objects.size,jobs,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),sessions:tables.upload_sessions,images:tables.images.map(p=>({id:p.id,file_path:p.file_path,status:p.detection_status,archived:p.is_archived,camera_id:p.camera_id,batch_id:p.batch_id,source_folder:p.exif_data?.source_folder,content_sha256:p.content_sha256})),batches:tables.processing_batches,faults})
    if(url.pathname==='/__sim/fault'&&req.method==='POST'){faults.push(body);return json(res,200,{ok:true})}
    if(url.pathname==='/__sim/config'&&req.method==='POST'){transferDelayMs=Math.max(0,Math.min(30000,Number(body.transferDelayMs??15)));return json(res,200,{transferDelayMs})}
    if(url.pathname==='/__sim/session')return json(res,200,session)
    if(url.pathname==='/auth/v1/token')return json(res,200,session)
    if(url.pathname==='/auth/v1/user')return json(res,200,user)
    if(url.pathname==='/auth/v1/logout')return json(res,200,{})
    if(url.pathname.startsWith('/api/v1/tasks/')&&url.pathname.endsWith('/trigger')){
      const payload=typeof body.payload==='string'?(JSON.parse(body.payload).json??JSON.parse(body.payload)):body.payload;const id=`run_${randomUUID()}`;jobs.push({id,task:url.pathname.split('/')[4],payload});if(payload?.batchId)processBatch(payload.batchId);return json(res,200,{id})
    }
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      const name=url.pathname.split('/').at(-1)
      if(name==='finalize_upload_batch'){
        const b=tables.processing_batches.find(b=>b.id===body.p_batch_id&&b.user_id===user.id)
        if(!b||b.status==='cancelled')throw new Error('Batch unavailable')
        const s=tables.upload_sessions.find(s=>s.id===b.upload_session_id)
        if(s?.status==='cancelled')throw new Error('Session cancelled')
        const uploaded=body.p_uploaded_ids??[],failed=body.p_failed_ids??[]
        for(const id of [...uploaded,...failed])if(!tables.images.some(p=>p.id===id&&p.batch_id===b.id&&p.user_id===user.id))throw new Error('Invalid photo IDs')
        for(const id of uploaded){const p=tables.images.find(p=>p.id===id);if(objects.get(`photos/${p.file_path}`)?.length!==p.file_size_bytes)throw new Error('Original photo transfer is incomplete')}
        for(const id of uploaded)tables.images.find(p=>p.id===id).upload_completed_at=new Date().toISOString()
        for(const id of failed){const p=tables.images.find(p=>p.id===id);if(!p.upload_completed_at&&p.detection_status!=='failed'){p.detection_status='failed';b.failed_images++;b.processed_images++}}
        const ids=tables.images.filter(p=>p.batch_id===b.id&&p.upload_completed_at).map(p=>p.id)
        b.status=ids.length?'processing':'failed';aggregate();return json(res,200,{image_ids:ids})
      }
      if(name==='finish_upload_session'){
        const s=tables.upload_sessions.find(s=>s.id===body.p_session_id&&s.user_id===user.id&&s.status!=='cancelled')
        if(!s)throw new Error('Session unavailable');s.upload_finished_at=new Date().toISOString();aggregate();return json(res,200,null)
      }
      if(name==='get_uploaded_content_hashes')return json(res,200,[...new Set(tables.images.filter(p=>p.user_id===user.id&&p.upload_completed_at&&body.p_hashes.includes(p.content_sha256)).map(p=>p.content_sha256))])
      if(name==='get_photo_triage_counts'){const scoped=tables.images.filter(p=>p.user_id===user.id&&p.upload_completed_at&&body.p_photo_ids.includes(p.id));const counts={all:scoped.length,security:0,priority:0};for(const p of scoped){counts[p.triage_tier]=(counts[p.triage_tier]??0)+1;if(p.has_people||p.has_vehicles)counts.security++;if(p.triage_tier==='trophy'||p.has_people||p.has_vehicles)counts.priority++}return json(res,200,Object.entries(counts).map(([tier,photo_count])=>({tier,photo_count})))}
      if(name==='get_photo_stats') {
        const photos=tables.images.filter(p=>p.is_cancelled!==true&&p.user_id===body.p_user_id&&(!body.p_batch_id||p.batch_id===body.p_batch_id)&&(!body.p_upload_session_id||tables.processing_batches.some(b=>b.id===p.batch_id&&b.upload_session_id===body.p_upload_session_id))&&p.deleted_at==null)
        const detections=tables.detections.filter(d=>photos.some(p=>p.id===d.image_id)&&d.deleted_at==null)
        return json(res,200,[{total_photos:photos.length,analyzed_photos:photos.filter(p=>p.detection_status==='completed').length,photos_with_deer:photos.filter(p=>p.has_deer).length,empty_photos:photos.filter(p=>p.detection_status==='completed'&&!p.has_deer&&!p.has_people&&!p.has_vehicles).length,failed_photos:photos.filter(p=>p.detection_status==='failed').length,pending_photos:photos.filter(p=>p.detection_status==='pending').length,processing_photos:photos.filter(p=>p.detection_status==='processing').length,buck_count:detections.filter(d=>d.sex==='buck').length,doe_count:detections.filter(d=>d.sex==='doe').length,unknown_count:0,trophy_count:detections.filter(d=>d.is_trophy).length,standard_count:0,basket_count:0,spike_count:0,unknown_size_count:0}])
      }
      if(name==='get_filtered_detection_images'){const ds=tables.detections.filter(d=>d.deleted_at==null&&Object.entries(body).every(([k,v])=>v==null||k==='p_user_id'||predicate(d[k.replace('p_','')],`eq.${v}`)));const ids=[...new Set(ds.map(d=>d.image_id))];return json(res,200,[{image_ids:ids,total_count:ids.length}])}
      throw new Error(`Unsupported RPC ${name}`)
    }
    if(url.pathname.startsWith('/rest/v1/')){
      const table=url.pathname.split('/')[3];if(!tables[table])throw new Error(`Unsupported table ${table}`)
      let rows=filtered(table,url.searchParams)
      if(req.method==='POST'){
        // PostgREST upsert: honor on_conflict + Prefer resolution so repeated profile
        // setup on login never duplicates the fixture row (maybeSingle would 406).
        const incoming=Array.isArray(body)?body:[body];const prefer=req.headers.prefer??'';const key=url.searchParams.get('on_conflict')??(prefer.includes('resolution=')?'id':null)
        rows=[];for(const x of incoming){const existing=key?tables[table].find(r=>r[key]===x[key]):undefined
          if(existing&&prefer.includes('ignore-duplicates')){rows.push(existing);continue}
          if(existing){Object.assign(existing,x,{updated_at:new Date().toISOString()});rows.push(existing);continue}
          const row=defaultRow(table,x);tables[table].push(row);rows.push(row)}
      }
      if(req.method==='PATCH'){rows.forEach(x=>Object.assign(x,body,{updated_at:new Date().toISOString()}))}
      if(req.method==='DELETE'){tables[table]=tables[table].filter(x=>!rows.includes(x))}
      aggregate();const total=rows.length,offset=Number(url.searchParams.get('offset')??0),limit=Math.min(1000,Number(url.searchParams.get('limit')??1000));rows=rows.slice(offset,offset+limit).map(r=>enrich(table,r))
      const single=req.headers.accept?.includes('vnd.pgrst.object+json')
      if(single&&rows.length!==1)return json(res,406,{code:'PGRST116',details:`The result contains ${rows.length} rows`,message:'Cannot coerce the result to a single JSON object'})
      if(req.method==='HEAD'){res.writeHead(200,{'content-range':`*/${total}`});res.end();return}
      return json(res,req.method==='POST'?201:200,single?rows[0]:rows,{'content-range':`${offset}-${Math.max(offset,offset+rows.length-1)}/${total}`})
    }
    const storage=url.pathname.replace('/storage/v1','')
    if(storage.startsWith('/object/upload/sign/')&&req.method==='POST')return json(res,200,{url:`${storage}?token=simulation`})
    if(storage.startsWith('/object/upload/sign/')&&req.method==='PUT'){
      const key=decodeURIComponent(storage.slice('/object/upload/sign/'.length));activeTransfers++;maxTransfers=Math.max(maxTransfers,activeTransfers);await new Promise(r=>setTimeout(r,transferDelayMs));objects.set(key,buffer);activeTransfers--;return json(res,200,{Key:key,Id:randomUUID()})
    }
    if(storage.startsWith('/object/sign/')&&req.method==='POST'){
      const key=storage.slice('/object/sign/'.length)
      if(body.paths)return json(res,200,body.paths.map(p=>({path:p,signedURL:`/object/sign/${key}/${p}?token=simulation`,error:null})))
      return json(res,200,{signedURL:`/object/sign/${key}?token=simulation`})
    }
    if(storage.startsWith('/object/info/')){
      const key=decodeURIComponent(storage.slice('/object/info/'.length));if(!objects.has(key))return json(res,404,{message:'Object not found',statusCode:'404'});return json(res,200,{id:key,name:key,size:objects.get(key).length,metadata:{size:objects.get(key).length,mimetype:'image/jpeg'},content_type:'image/jpeg'})
    }
    if(storage.startsWith('/object/list/')&&req.method==='POST'){
      const bucket=storage.slice('/object/list/'.length),prefix=`${bucket}/${body.prefix??''}`;const rows=[...objects].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>({name:k.slice(prefix.length).replace(/^\//,''),id:k,metadata:{size:v.length}}));return json(res,200,rows.slice(body.offset??0,(body.offset??0)+(body.limit??100)))
    }
    if(storage.startsWith('/object/sign/')&&req.method==='GET'){
      const key=decodeURIComponent(storage.slice('/object/sign/'.length)),data=objects.get(key);if(!data)return json(res,404,{message:'Object not found'});res.writeHead(200,{'content-type':key.endsWith('.webp')?'image/webp':'image/jpeg'});res.end(data);return
    }
    throw new Error(`Unsupported endpoint ${req.method} ${url.pathname}`)
  }catch(error){await log({event:'simulator_error',message:error.message});json(res,400,{message:error.message,error:error.message})}
})
server.listen(port,'127.0.0.1',()=>console.log(`Isolated triage simulator: ${origin}; logs ${logDir}; no external network forwarding`))
