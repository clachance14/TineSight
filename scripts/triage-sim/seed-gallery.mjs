/** Populated visual fixtures. Loopback simulator only; no live credentials. */
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
const base = 'http://127.0.0.1:9410'
const user = '11111111-1111-4111-8111-111111111111'
async function post(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(await response.text())
}
const sources = ['public/landing/sighting-1.jpg', 'public/landing/sighting-2.jpg', 'public/landing/sighting-3.jpg']
for (let i = 0; i < sources.length; i++) {
  for (const [variant, width] of [['thumbnails',400], ['medium',1080]]) {
    const buffer = await sharp(sources[i]).resize({ width, withoutEnlargement: true }).webp().toBuffer()
    const response = await fetch(`${base}/storage/v1/object/upload/sign/photos/${variant}/visual-${i}.webp`, {method:'PUT',body:buffer})
    if (!response.ok) throw new Error('Fixture storage failed')
  }
}
const photos=[], detections=[]
for(let i=0;i<1000;i++) {
  const id=randomUUID(), trophy=i%10===7, deer=trophy||i%10===6
  photos.push({id,user_id:user,file_size_bytes:null,original_filename:`CAM${String(i%20+1).padStart(2,'0')}_IMG${String(i+1).padStart(4,'0')}.jpg`,file_path:`${user}/${id}.jpg`,thumbnail_path:`thumbnails/visual-${i%3}.webp`,medium_path:`medium/visual-${i%3}.webp`,upload_completed_at:'2026-09-05T12:00:00Z',detection_status:'completed',variant_status:'ready',captured_at:new Date(Date.UTC(2026,8,1,0,i)).toISOString(),imported_at:'2026-09-05T12:00:00Z',camera_id:`33333333-3333-4333-8333-${String(i%20+1).padStart(12,'0')}`,triage_tier:trophy?'trophy':deer?'doe':i%10<6?'empty':'other',has_deer:deer,has_people:i%10===8,has_vehicles:i%10===9,best_score:trophy?130+i%70:null,classification:deer?'deer':'empty',confidence:.95})
  if(deer) for(let n=0;n<(i%3===0?3:1);n++) detections.push({id:randomUUID(),image_id:id,deer_id:null,deleted_at:null,class:'deer',sex:trophy?'buck':'doe',confidence:.95,is_trophy:trophy,score_gross:trophy?130+i%70:null,quality_status:'high_quality',estimated_point_range:'8-10',point_min:8,point_max:10,bbox_x:1500+n*1000,bbox_y:1000,bbox_width:4000,bbox_height:7000})
}
await post('/rest/v1/images',photos)
await post('/rest/v1/detections',detections)
console.log('Seeded 1,000 synthetic gallery records with three reused wildlife images; classifications are test data.')
