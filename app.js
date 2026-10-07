var $=function(id){return document.getElementById(id)};
var db=true,projects=[],cur=null,timer=null,OLD="travel-expenses-v1",loaded=false,screen="list",pt=null,pm="";
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function peso(n){return "₱"+n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}
function today(){return new Date().toISOString().slice(0,10)}
function sd(d){return d?new Date(d+"T00:00:00").toLocaleDateString("en-PH",{month:"short",day:"numeric"}):""}
function total(p){return(p.rows||[]).reduce(function(s,r){return s+(+r.a||0)},0)}
function blank(){return{d:cur&&cur.rows.length?cur.rows[cur.rows.length-1].d:(cur&&cur.start)||today(),e:"",p:"",a:0}}
function status(t){var e=$("st");if(e)e.textContent=t}
function dayNo(d){if(!cur||!cur.start||!d)return"";var n=Math.round((new Date(d)-new Date(cur.start))/864e5)+1;return n>=1?"Day "+n:"Bago mag-start"}

/* storage */
var enc=new TextEncoder(),dec=new TextDecoder(),CR=!!(window.crypto&&crypto.subtle);
function b64(buf){var s="",a=new Uint8Array(buf);for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)}
function unb64(s){var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
function derive(pin,salt){return crypto.subtle.importKey("raw",enc.encode(pin),"PBKDF2",false,["deriveKey"]).then(function(m){return crypto.subtle.deriveKey({name:"PBKDF2",salt:unb64(salt),iterations:200000,hash:"SHA-256"},m,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])})}
function seal(key,obj){var iv=crypto.getRandomValues(new Uint8Array(12));return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,enc.encode(JSON.stringify(obj))).then(function(ct){return{iv:b64(iv),ct:b64(ct)}})}
function unseal(key,iv,ct){return crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(iv)},key,unb64(ct)).then(function(b){return JSON.parse(dec.decode(b))})}
var SB="https://hbiidlfifbrlwotlfkfj.supabase.co/rest/v1/travel_projects",KEY="sb_publishable_nE-e9JgRbFfK3c6TNfJefg_KFVNYOqW";
function api(method,qs,body,prefer){var h={apikey:KEY};if(body)h["Content-Type"]="application/json";if(prefer)h.Prefer=prefer;
  return fetch(SB+qs,{method:method,headers:h,body:body?JSON.stringify(body):undefined}).then(function(r){if(!r.ok)throw new Error(r.status);return r.status===204?null:r.text().then(function(t){return t?JSON.parse(t):null})})}
function upsert(d){var lk=!!d.locked;
  return api("POST","?on_conflict=id",{id:cur.id,name:d.name,start_date:d.start||null,days:d.days,locked:lk,salt:lk?d.salt:null,iv:lk?d.iv:null,ct:lk?d.ct:null,people:lk?[]:(d.people||[]),rows:lk?[]:(d.rows||[]),updated_at:new Date(d.updated).toISOString()},"resolution=merge-duplicates,return=minimal")}
function canRefresh(){var f=document.getElementById("newf");return screen==="list"&&!(f&&!f.hidden)}
function put(){
  if(!cur)return Promise.resolve();cur.updated=Date.now();
  var m={name:cur.name,start:cur.start,days:cur.days,tpl:"travel",created:cur.created,updated:cur.updated},body={people:cur.people,rows:cur.rows};
  if(!db){var c=JSON.parse(JSON.stringify(Object.assign({id:cur.id},m,body)));projects=projects.filter(function(x){return x.id!==c.id}).concat([c]);status("Hindi naka-save");return Promise.resolve()}
  status("Saving…");
  var q=cur.key?seal(cur.key,body).then(function(x){m.locked=true;m.salt=cur.salt;m.iv=x.iv;m.ct=x.ct;return m}):Promise.resolve(Object.assign(m,body));
  return q.then(upsert).then(function(){status("Saved")},function(){status("Hindi na-save. Subukan ulit.")})}
function ask(msg,yes,no){screen="ask";$("app").innerHTML='<div class="card"><h2>'+esc(msg)+'</h2><div class="bar"><button id="yes">Oo, ituloy</button><button class="ghost" id="no">Cancel</button></div></div>';$("yes").onclick=yes;$("no").onclick=no}
function queue(){status("Saving…");clearTimeout(timer);timer=setTimeout(function(){timer=null;put()},500)}
function flush(){if(timer){clearTimeout(timer);timer=null;return put()}return Promise.resolve()}

/* list view */
function oldData(){try{var s=localStorage.getItem(OLD);if(s){var o=JSON.parse(s);if(o&&o.rows&&(o.people.length||o.rows.some(function(r){return r.e||r.a})))return o}}catch(e){}return null}
function renderList(){
  cur=null;screen="list";
  var ps=projects.slice().sort(function(a,b){return(b.updated||0)-(a.updated||0)});
  var old=oldData();
  var list=ps.map(function(p){return '<div class="item"><div><div class="name">'+esc(p.name)+'</div><div class="muted">'+(p.start?'Start '+esc(sd(p.start))+' · ':'')+(p.days||"")+' days · '+(p.locked?'🔒 May PIN · ':'')+'Huling edit '+esc(new Date(p.updated||p.created||0).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}))+'</div></div><div class="bar" style="margin:0"><button data-open="'+esc(p.id)+'">Open</button><button class="ghost" data-del="'+esc(p.id)+'">Delete</button></div></div>'}).join("");
  $("app").innerHTML=
  '<div class="card"><h2>Template</h2><div class="item" style="border:none;padding:0"><div><div class="name">Travel Expenses</div><div class="muted">Date, expense, pangalan, at total ng bawat tao at ng lahat. May Day 1, Day 2… base sa start date.</div></div><button id="newp">Create project</button></div>'+
  '<div class="form" id="newf" hidden><div><label for="nn">Project name</label><input id="nn" placeholder="e.g. Davao trip, Oct 2026"></div><div><label for="ns">Start date</label><input type="date" id="ns" value="'+today()+'"></div><div><label for="nd">Days</label><input type="number" id="nd" min="1" value="9"></div>'+(CR?'<div style="grid-column:1/-1"><label for="np">PIN (optional)</label><input id="np" type="password" autocomplete="off" placeholder="Walang PIN = bukas sa lahat ng staff"><div class="muted" style="font-size:14px;margin-top:4px">Ang may PIN lang ang makakapag-open at edit. Mas ligtas kung 6 na numero o mas mahaba. Kapag nakalimutan ang PIN, hindi na mababawi ang laman.</div></div>':'')+'<div class="bar" style="margin:0"><button id="mk">Create</button><button class="ghost" id="nc">Cancel</button></div></div></div>'+
  (old?'<div class="card"><div class="item" style="border:none;padding:0"><div class="muted">May nakitang dating laman ng unang page na ito.</div><button class="ghost" id="imp">I-save bilang project</button></div></div>':'')+
  '<div class="card"><h2>Projects</h2>'+(!loaded?'<div class="muted">Loading…</div>':list||'<div class="muted">Wala pang project. Pindutin ang Create project sa itaas.</div>')+'</div>'}

function create(){
  var n=$("nn").value.trim();if(!n){$("nn").focus();return}
  var s=$("ns").value||today(),d=Math.max(1,parseInt($("nd").value)||9),pin=$("np")?$("np").value:"";
  if(pin&&pin.length<4){$("np").value="";$("np").placeholder="Hindi bababa sa 4 na character";$("np").focus();return}
  makeProject({name:n,start:s,days:d,people:[],rows:[{d:s,e:"",p:"",a:0}]},pin)}
function makeProject(o,pin){
  var now=Date.now();o.id="p"+now.toString(36);o.tpl="travel";o.created=now;o.updated=now;
  var go=function(){cur=o;put().then(renderProject)};
  if(pin&&db&&CR){o.salt=b64(crypto.getRandomValues(new Uint8Array(16)));derive(pin,o.salt).then(function(k){o.key=k;go()})}else go()}
function openProject(p){cur=JSON.parse(JSON.stringify(p));cur.people=cur.people||[];cur.rows=cur.rows&&cur.rows.length?cur.rows:[{d:cur.start||today(),e:"",p:"",a:0}];renderProject()}
function find(id){return projects.filter(function(x){return x.id===id})[0]}
function delProject(q){
  if(!db){projects=projects.filter(function(x){return x.id!==q.id});renderList();return}
  return api("DELETE","?id=eq."+encodeURIComponent(q.id)).then(function(){projects=projects.filter(function(x){return x.id!==q.id});renderList()},function(){renderList();$("banner").innerHTML='<div class="banner">Hindi nabura. Subukan ulit.</div>'})}
function renderPin(p,mode){pt=p;pm=mode;screen="pin";
  $("app").innerHTML='<div class="card"><h2>'+esc(p.name)+'</h2><p class="muted">'+(mode==="del"?'Ilagay ang PIN para mabura ang project na ito.':'May PIN ang project na ito. Ilagay ito para ma-open.')+'</p><div class="addp"><input id="pinin" type="password" autocomplete="off" placeholder="PIN" style="flex:1 1 200px;width:auto"><button id="pgo">'+(mode==="del"?'Delete project':'Open')+'</button><button class="ghost" id="pcancel">Cancel</button></div><div class="muted" id="pmsg2"></div></div>';$("pinin").focus()}
function tryPin(){var v=$("pinin").value,m=$("pmsg2");if(!v)return;m.textContent="Chine-check…";
  derive(v,pt.salt).then(function(k){return unseal(k,pt.iv,pt.ct).then(function(body){
    if(pm==="del")return delProject(pt);
    var o=JSON.parse(JSON.stringify(pt));delete o.iv;delete o.ct;delete o.locked;
    o.people=body.people||[];o.rows=body.rows&&body.rows.length?body.rows:[{d:o.start||today(),e:"",p:"",a:0}];o.key=k;
    cur=o;renderProject()})}).catch(function(){var m2=$("pmsg2");if(m2)m2.textContent="Mali ang PIN. Subukan ulit."})}
function pinBox(){return '<h2>'+(cur.key?'May PIN ang project na ito':'Walang PIN ang project na ito')+'</h2><div class="addp"><input id="pnew" type="password" autocomplete="off" placeholder="'+(cur.key?'Bagong PIN':'Maglagay ng PIN')+'" style="flex:1 1 200px;width:auto"><button id="pset">'+(cur.key?'Palitan PIN':'Set PIN')+'</button>'+(cur.key?'<button class="ghost" id="prem">Alisin ang PIN</button>':'')+'</div><div class="muted" style="font-size:14px" id="pmsg">Hindi bababa sa 4 na character. Kapag nakalimutan ang PIN, hindi na mababawi ang laman.</div>'}
function changePin(rem){
  if(rem){delete cur.key;delete cur.salt;put();$("pinbox").innerHTML=pinBox();$("pinb").textContent="PIN";$("pmsg").textContent="Inalis na ang PIN. Bukas na ito sa lahat ng staff.";return}
  var v=$("pnew").value;if(v.length<4){$("pmsg").textContent="Hindi bababa sa 4 na character.";return}
  cur.salt=b64(crypto.getRandomValues(new Uint8Array(16)));
  derive(v,cur.salt).then(function(k){cur.key=k;put();$("pinbox").innerHTML=pinBox();$("pinb").textContent="🔒 PIN";$("pmsg").textContent="Na-set na ang PIN."})}
function exportCsv(){
  var q=function(v){v=String(v==null?"":v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  var L=[["Day","Date","Expense","Name","Amount"]],by={},all=0;
  cur.rows.forEach(function(r){var a=+r.a||0,k=r.p||"(walang pangalan)";all+=a;by[k]=(by[k]||0)+a;L.push([dayNo(r.d),r.d,r.e,r.p,a])});
  L.push([]);L.push(["","","","Total per person",""]);
  Object.keys(by).forEach(function(k){L.push(["","","",k,by[k]])});
  L.push([]);L.push(["","","","TOTAL",all]);
  var data="\uFEFF"+L.map(function(r){return r.map(q).join(",")}).join("\r\n");
  var fn=(cur.name||"travel-expenses").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"-")+".csv";
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type:"text/csv;charset=utf-8"}));a.download=fn;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)}

/* project view */
function renderProject(){
  screen="proj";
  $("app").innerHTML=
  '<div class="top noprint"><button class="ghost" id="back">← All projects</button><span class="bar" style="margin:0"><span class="status" id="st">'+(db?'Saved':'Hindi naka-save')+'</span><button class="ghost" id="csv">Download CSV</button>'+(CR&&db?'<button class="ghost" id="pinb">'+(cur.key?'🔒 PIN':'PIN')+'</button>':'')+'</span></div><div class="card noprint" id="pinbox" hidden></div>'+
  '<div class="card head"><div><label for="pname">Project name</label><input id="pname" value="'+esc(cur.name)+'"></div><div><label for="pstart">Start date</label><input type="date" id="pstart" value="'+esc(cur.start)+'"></div><div><label for="pdays">Days</label><input type="number" min="1" id="pdays" value="'+esc(cur.days)+'"></div></div>'+
  '<div class="card noprint"><h2>Names</h2><div class="addp"><input id="pn" placeholder="Magdagdag ng pangalan" aria-label="Name" style="flex:1 1 200px;width:auto"><button id="padd">Add name</button></div><div class="chips" id="chips"></div></div>'+
  '<div class="card"><h2>Expenses</h2><div class="scroll"><table><thead><tr><th style="width:80px">Day</th><th style="width:150px">Date</th><th>Expense</th><th style="width:150px">Name</th><th class="amt" style="width:120px">Amount (₱)</th><th class="noprint" style="width:44px"></th></tr></thead><tbody id="rows"></tbody></table></div><div class="bar noprint"><button id="radd">Add expense</button></div></div>'+
  '<div class="card"><h2>Total per person</h2><div class="scroll"><table class="sum"><tbody id="sum"></tbody></table></div><h2 style="margin-top:16px">Total per day</h2><div class="scroll"><table class="sum"><tbody id="dsum"></tbody></table></div><div class="grand"><span class="muted">Total na gastos ng lahat</span><b id="grand">₱0.00</b></div></div>'+
  '<div class="bar noprint"><button class="ghost" id="print">Print</button></div>';
  chips();rows()}
function chips(){$("chips").innerHTML=cur.people.length?cur.people.map(function(p,i){return '<span class="chip">'+esc(p)+'<button data-rp="'+i+'" aria-label="Remove '+esc(p)+'">×</button></span>'}).join(""):'<span class="muted">Wala pang pangalan.</span>'}
function rows(){
  $("rows").innerHTML=cur.rows.map(function(r,i){
    var o='<option value="">—</option>'+cur.people.map(function(p){return '<option'+(p===r.p?' selected':'')+'>'+esc(p)+'</option>'}).join("");
    return '<tr><td class="day">'+esc(dayNo(r.d))+'</td><td><input type="date" data-i="'+i+'" data-f="d" value="'+esc(r.d)+'" aria-label="Date"></td><td><input data-i="'+i+'" data-f="e" value="'+esc(r.e)+'" placeholder="Hal. plane ticket, meals, taxi" aria-label="Expense"></td><td><select data-i="'+i+'" data-f="p" aria-label="Name">'+o+'</select></td><td class="amt"><input type="number" min="0" step="0.01" data-i="'+i+'" data-f="a" value="'+(r.a||"")+'" placeholder="0.00" aria-label="Amount"></td><td class="noprint"><button class="ghost" data-rr="'+i+'" aria-label="Delete expense">×</button></td></tr>'}).join("");
  totals()}
function totals(){
  var by={},none=0,all=0,days={};
  cur.people.forEach(function(p){by[p]=0});
  cur.rows.forEach(function(r){var a=+r.a||0;all+=a;if(r.p&&r.p in by)by[r.p]+=a;else none+=a;if(r.d)days[r.d]=(days[r.d]||0)+a});
  var h=cur.people.map(function(p){return '<tr><td>'+esc(p)+'</td><td class="amt">'+peso(by[p])+'</td></tr>'}).join("");
  if(none>0)h+='<tr><td class="muted">Walang pangalan</td><td class="amt">'+peso(none)+'</td></tr>';
  $("sum").innerHTML=h||'<tr><td class="muted">Mag-add ng pangalan at expense para lumabas ang total.</td></tr>';
  var dh=Object.keys(days).sort().map(function(d){return '<tr><td>'+esc(dayNo(d))+' <span class="muted">('+esc(sd(d))+')</span></td><td class="amt">'+peso(days[d])+'</td></tr>'}).join("");
  $("dsum").innerHTML=dh||'<tr><td class="muted">Wala pang expense.</td></tr>';
  $("grand").textContent=peso(all)}
function addPerson(){var v=$("pn").value.trim();if(!v)return;
  if(cur.people.some(function(p){return p.toLowerCase()===v.toLowerCase()})){$("pn").select();return}
  cur.people.push(v);$("pn").value="";queue();chips();rows();$("pn").focus()}

/* events */
document.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;var id=b.id,ds=b.dataset;
  if(id==="newp"){$("newf").hidden=false;$("nn").focus()}
  else if(id==="nc")$("newf").hidden=true;
  else if(id==="mk")create();
  else if(id==="imp"){var o=oldData();makeProject({name:o.trip||"Travel expenses (dati)",start:o.date||today(),days:9,people:o.people,rows:o.rows})}
  else if(ds.open){var p=find(ds.open);if(p){if(p.locked)renderPin(p,"open");else openProject(p)}}
  else if(ds.del){var q=find(ds.del);if(q){if(q.locked)renderPin(q,"del");else ask('Burahin ang "'+q.name+'"? Hindi na ito mababalik.',function(){delProject(q)},renderList)}}
  else if(id==="pgo")tryPin();
  else if(id==="pcancel")renderList();
  else if(id==="pinb"){var bx=$("pinbox");bx.hidden=!bx.hidden;if(!bx.hidden)bx.innerHTML=pinBox()}
  else if(id==="pset"||id==="prem")changePin(id==="prem");
  else if(id==="csv")exportCsv();
  else if(id==="back")flush().then(renderList);
  else if(id==="padd")addPerson();
  else if(id==="radd"){cur.rows.push(blank());queue();rows()}
  else if(id==="print")window.print();
  else if(ds.rp!==undefined){var i=+ds.rp,p2=cur.people[i];
    var n=cur.rows.filter(function(r){return r.p===p2&&(+r.a||r.e)}).length;
    var rm=function(){cur.rows=cur.rows.filter(function(r){return r.p!==p2});if(!cur.rows.length)cur.rows.push(blank());cur.people.splice(i,1);queue();renderProject()};
    if(n)ask("May "+n+" expense si "+p2+". Buburahin din ba ang mga ito?",rm,renderProject);else rm()}
  else if(ds.rr!==undefined){cur.rows.splice(+ds.rr,1);if(!cur.rows.length)cur.rows.push(blank());queue();rows()}});
document.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target.id==="pn")addPerson();if(e.key==="Enter"&&e.target.id==="nn")create();if(e.key==="Enter"&&e.target.id==="pinin")tryPin();if(e.key==="Enter"&&e.target.id==="pnew")changePin(false)});
document.addEventListener("input",function(e){var t=e.target;if(!cur)return;
  if(t.id==="pname"){cur.name=t.value;queue()}
  else if(t.id==="pstart"){cur.start=t.value;queue();rows()}
  else if(t.id==="pdays"){cur.days=Math.max(1,parseInt(t.value)||1);queue()}
  else if(t.dataset.i!==undefined){var f=t.dataset.f,r=cur.rows[+t.dataset.i];
    r[f]=f==="a"?(parseFloat(t.value)||0):t.value;queue();totals();
    if(f==="d"){var c=t.closest("tr").querySelector(".day");if(c)c.textContent=dayNo(r.d)}}});
window.addEventListener("pagehide",function(){flush()});

/* start */
function load(){return api("GET","?select=*&order=updated_at.desc").then(function(rs){
  projects=rs.map(function(r){return{id:r.id,name:r.name,start:r.start_date,days:r.days,locked:r.locked,salt:r.salt,iv:r.iv,ct:r.ct,people:r.people||[],rows:r.rows||[],created:Date.parse(r.created_at),updated:Date.parse(r.updated_at),tpl:"travel"}});
  loaded=true;$("banner").innerHTML="";if(canRefresh())renderList()},
  function(){loaded=true;$("banner").innerHTML='<div class="banner">Hindi ma-load ang mga project. I-check ang internet o i-refresh ang page.</div>';if(canRefresh())renderList()})}
renderList();load();
setInterval(function(){if(canRefresh())load()},20000);
