import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const fixtureUserId = '11111111-1111-4111-8111-111111111111'
export const fixtureRoot = path.resolve('.gstack/triage-runs/fixtures')

export async function makeFixtures(count = 1000, large = false) {
  const imageCache=new Map()
  const noise=large?Buffer.alloc(2048*1536*3):null
  if(noise){let seed=71237;for(let n=0;n<noise.length;n++){seed=(Math.imul(seed,1664525)+1013904223)|0;noise[n]=seed>>>24}}
  await mkdir(fixtureRoot,{recursive:true})
  const manifest=[]
  for(let i=0;i<count;i++) {
    const camera=Math.floor(i/50)%20+1
    const location=Math.floor((camera-1)/4)+1
    const filename=`${large?'LARGE_':''}CAM${String(camera).padStart(2,'0')}_IMG${String(i%50+1).padStart(4,'0')}.jpg`
    const directory=path.join(fixtureRoot,`Location${location}`,`Camera${camera}`)
    await mkdir(directory,{recursive:true})
    const file=path.join(directory,filename)
    const image=imageCache.get(large?camera:-1)??await (noise?sharp(noise,{raw:{width:2048,height:1536,channels:3}}):sharp({create:{width:640,height:480,channels:3,background:{r:35+camera*4,g:55+(i%80),b:45}}}))
      .withExif({IFD0:{Make:'TineSight Simulation',Model:`Camera ${camera}`,DateTime:'2026:09:01 12:00:00'}})
      .jpeg({quality:large?88:75}).toBuffer()
    if(large)imageCache.set(camera,image)
    const comment=Buffer.from(`TineSight synthetic capture ${i}${process.env.TRIAGE_FIXTURE_TAG??''}`)
    const marker=Buffer.alloc(4);marker[0]=255;marker[1]=254;marker.writeUInt16BE(comment.length+2,2)
    const uniqueImage=Buffer.concat([image.subarray(0,2),marker,comment,image.subarray(2)])
    await writeFile(file,uniqueImage)
    manifest.push({index:i,path:file,filename,camera,location,bytes:uniqueImage.length,kind:i%10<6?'empty':i%10===6?'doe':i%10===7?'buck':i%10===8?'person':'vehicle'})
  }
  await writeFile(path.join(fixtureRoot,large?'manifest-large.json':'manifest.json'),JSON.stringify(manifest,null,2))
  return manifest
}

if(process.argv[1]?.endsWith('/fixtures.mjs')) console.log(`Prepared ${(await makeFixtures(Number(process.argv[2]??1000),process.argv[3]==='large')).length} fixtures in ${fixtureRoot}`)
