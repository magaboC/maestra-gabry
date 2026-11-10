import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'https://maestragabry.netlify.app'}});
const store=()=>getStore({name:'maestra-gabry-visite',region:'eu-central-1'});
const safePage=p=>typeof p==='string'&&p.startsWith('/')&&p.length<150&&!p.includes('..')?p.split('?')[0]:'/';
const validSecret=(value,expected)=>{if(!expected||!value)return false;const a=Buffer.from(value),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)};
async function readDay(s,key){return await s.getWithMetadata(key,{type:'json',consistency:'strong'});}
async function daily(s){const r=await s.list({prefix:'days/'});const entries=await Promise.all(r.blobs.map(async b=>({date:b.key.slice(5),data:await s.get(b.key,{type:'json',consistency:'strong'})})));return entries.filter(x=>x.data).sort((a,b)=>b.date.localeCompare(a.date));}
export default async function handler(request){
 const url=new URL(request.url);
 try{
  if(request.method==='POST'){
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin&&origin!=='https://maestragabry.netlify.app')return json({error:'Origine non consentita'},403);
   const body=await request.json().catch(()=>({}));if(body.action!=='pageview')return json({error:'Richiesta non valida'},400);
   const page=safePage(body.page),visit=body.visit===true;
   const date=new Date().toISOString().slice(0,10),key='days/'+date,s=store();
   for(let attempt=0;attempt<12;attempt++){
    const current=await readDay(s,key);
    const previous=current?.data||{visits:0,pageviews:0,pages:{}};
    const next={visits:(previous.visits||0)+(visit?1:0),pageviews:(previous.pageviews||0)+1,pages:{...previous.pages,[page]:(previous.pages?.[page]||0)+1}};
    const options=current?{onlyIfMatch:current.etag}:{onlyIfNew:true};
    const result=await s.setJSON(key,next,options);
    if(result.modified)return json({ok:true});
   }
   return json({error:'Riprova più tardi'},503);
  }
  if(request.method==='GET'){
   const privateMode=url.searchParams.get('private')==='1';
   if(privateMode&&!validSecret(request.headers.get('x-stats-password'),process.env.STATS_PASSWORD))return json({error:'Password errata o non configurata'},401);
   const days=await daily(store());
   const visits=days.reduce((n,x)=>n+(x.data.visits||0),0),pageviews=days.reduce((n,x)=>n+(x.data.pageviews||0),0);
   if(!privateMode)return json({visits});
   const pages={};for(const x of days)for(const [p,n] of Object.entries(x.data.pages||{}))pages[p]=(pages[p]||0)+n;
   return json({visits,pageviews,days:days.map(x=>({date:x.date,visits:x.data.visits||0,pageviews:x.data.pageviews||0})),pages:Object.entries(pages).sort((a,b)=>b[1]-a[1]).map(([page,views])=>({page,views}))});
  }
  return json({error:'Metodo non consentito'},405);
 }catch(e){console.error('Visite function:',e);return json({error:'Statistiche temporaneamente non disponibili'},503);}
}
export const config={path:'/api/visite'};
