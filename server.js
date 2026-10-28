const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const ROOT=__dirname,DATA_DIR=path.join(ROOT,'data'),DATA_FILE=path.join(DATA_DIR,'election.json');
const PORT=Number(process.env.PORT||8000),ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const candidates=[{id:'candidat-001',name:'Amara Diallo'},{id:'candidat-002',name:'Yann Kouassi'},{id:'candidat-003',name:'Inès Mbala'}];
if(ADMIN_PASSWORD.length<8){console.error('Configure ADMIN_PASSWORD avec au moins 8 caractères avant de démarrer.');process.exit(1)}
fs.mkdirSync(DATA_DIR,{recursive:true});
function emptyState(){return{open:false,votes:Object.fromEntries(candidates.map(c=>[c.id,0])),voters:{}}}
let state=fs.existsSync(DATA_FILE)?JSON.parse(fs.readFileSync(DATA_FILE,'utf8')):emptyState();
function persist(){const tmp=DATA_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,DATA_FILE)}
const idAliases={amara:'candidat-001',yann:'candidat-002',ines:'candidat-003'};
let migrated=false;
for(const [oldId,newId] of Object.entries(idAliases)){if(Object.hasOwn(state.votes,oldId)){state.votes[newId]=(Number(state.votes[newId])||0)+(Number(state.votes[oldId])||0);delete state.votes[oldId];migrated=true}}
if(migrated||!fs.existsSync(DATA_FILE))persist();
const sessions=new Map(),limits=new Map();
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(JSON.stringify(body))}
function ip(req){return req.headers['cf-connecting-ip']||req.socket.remoteAddress||'unknown'}
function limited(key,max,windowMs){const now=Date.now(),old=limits.get(key)||{start:now,count:0};if(now-old.start>windowMs){old.start=now;old.count=0}old.count++;limits.set(key,old);return old.count>max}
function body(req){return new Promise((resolve,reject)=>{let raw='',size=0;req.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){reject(Error('Requête trop volumineuse'));req.destroy()}else raw+=chunk});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(Error('Format JSON invalide'))}});req.on('error',reject)})}
function auth(req){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const expiry=sessions.get(token);if(!expiry||expiry<Date.now()){sessions.delete(token);return false}return true}
function normalizeId(s){return String(s||'').trim().toUpperCase()}
function tokenHash(s){return crypto.createHash('sha256').update(String(s)).digest('hex')}
function safeEqual(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
function total(){return Object.values(state.votes).reduce((sum,n)=>sum+n,0)}
function publicFiles(req,res){let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return json(res,400,{error:'Adresse invalide'})}const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/admin.css':'admin.css','/app.js':'app.js'};const file=files[pathname];if(!file)return json(res,404,{error:'Page introuvable'});const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});fs.createReadStream(path.join(ROOT,file)).pipe(res)}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&!req.url.startsWith('/api/'))return publicFiles(req,res);
  if(!req.url.startsWith('/api/'))return json(res,404,{error:'Adresse introuvable'});
  try{
    if(req.method==='GET'&&req.url==='/api/results')return json(res,200,{open:state.open,total:total(),votes:state.votes});
    if(req.method==='POST'&&req.url==='/api/vote'){
      if(limited('vote:'+ip(req),12,60000))return json(res,429,{error:'Trop de tentatives. Réessaie dans une minute.'});
      const input=await body(req),id=normalizeId(input.id),candidate=String(input.candidate||''),voter=state.voters[id];
      if(!state.open)return json(res,403,{error:'Le scrutin est fermé.'});
      if(!voter||!safeEqual(voter.codeHash,tokenHash(input.code||'')))return json(res,401,{error:'Identifiant ou code de vote invalide.'});
      if(voter.votedAt)return json(res,409,{error:'Ce code a déjà été utilisé.'});
      if(!Object.hasOwn(state.votes,candidate))return json(res,400,{error:'Choix de candidat invalide.'});
      voter.votedAt=new Date().toISOString();state.votes[candidate]++;persist();return json(res,200,{ok:true});
    }
    if(req.method==='POST'&&req.url==='/api/admin/login'){
      if(limited('login:'+ip(req),8,15*60*1000))return json(res,429,{error:'Trop de tentatives. Réessaie plus tard.'});
      const input=await body(req);if(!safeEqual(ADMIN_PASSWORD,String(input.password||'')))return json(res,401,{error:'Mot de passe incorrect.'});
      const token=crypto.randomBytes(32).toString('base64url');sessions.set(token,Date.now()+8*60*60*1000);return json(res,200,{token});
    }
    if(req.url.startsWith('/api/admin/')){
      if(!auth(req))return json(res,401,{error:'Connexion administrateur requise.'});
      for(const [token,expiry] of sessions)if(expiry<Date.now())sessions.delete(token);
      if(req.method==='GET'&&req.url==='/api/admin/overview')return json(res,200,{open:state.open,total:total(),votes:state.votes,voters:Object.values(state.voters).map(v=>({id:v.id,name:v.name,voted:!!v.votedAt,votedAt:v.votedAt?new Date(v.votedAt).toLocaleString('fr-FR'):null}))});
      if(req.method==='POST'&&req.url==='/api/admin/voters'){
        if(state.open||total()>0)return json(res,409,{error:'La liste ne peut être modifiée qu’avant le premier vote et lorsque le scrutin est fermé.'});
        const input=await body(req),entries=input.entries;if(!Array.isArray(entries)||entries.length<1||entries.length>2000)return json(res,400,{error:'Fournis entre 1 et 2 000 étudiants.'});
        const seen=new Set(),prepared=[];for(const entry of entries){const id=normalizeId(entry.id),name=String(entry.name||'').trim();if(!id||id.length>64||!name||name.length>120)return json(res,400,{error:'Chaque ligne doit contenir un identifiant et un nom valides.'});if(seen.has(id)||state.voters[id])return json(res,409,{error:`Identifiant en double : ${id}`});seen.add(id);prepared.push({id,name,code:crypto.randomBytes(9).toString('base64url')})}
        for(const v of prepared)state.voters[v.id]={id:v.id,name:v.name,codeHash:tokenHash(v.code),votedAt:null};persist();return json(res,201,{codes:prepared});
      }
      if(req.method==='POST'&&req.url==='/api/admin/election'){
        const input=await body(req);if(typeof input.open!=='boolean')return json(res,400,{error:'État de scrutin invalide.'});if(input.open&&Object.keys(state.voters).length===0)return json(res,409,{error:'Inscris d’abord la liste des électeurs.'});state.open=input.open;persist();return json(res,200,{open:state.open});
      }
    }
    return json(res,404,{error:'Requête introuvable'});
  }catch(error){console.error(error);return json(res,400,{error:error.message||'Erreur de traitement'})}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Site prêt sur http://localhost:${PORT}`));

