return (async()=>{
const result={started:new Date().toISOString(),pages:[],scroll:[],errors:[]};
let cursor=null,ids=[];
for(let n=0;n<25;n++){
 const q=new URLSearchParams({limit:'50',sortBy:'captured_at',sortDirection:'desc'});if(cursor)q.set('cursor',cursor);
 const start=performance.now(),r=await fetch('/api/photos?'+q),data=await r.json();
 if(!r.ok){result.errors.push({status:r.status,data});break}
 result.pages.push({count:data.photos.length,total:data.total,ms:Math.round(performance.now()-start)});ids.push(...data.photos.map(p=>p.id));cursor=data.nextCursor;if(!cursor)break;
}
result.totalIDs=ids.length;result.uniqueIDs=new Set(ids).size;
const scroller=document.querySelector('div.overflow-auto');
for(let n=0;n<22;n++){
 if(!scroller)break;scroller.scrollTop=scroller.scrollHeight;await new Promise(r=>setTimeout(r,200));
 result.scroll.push({step:n,position:scroller.scrollTop,height:scroller.scrollHeight,dom:document.querySelectorAll('*').length,images:document.images.length,text:document.body.innerText.match(/Showing[^\n]+/)?.[0]});
}
result.finished=new Date().toISOString();return result;
})()
