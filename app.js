/* Gestionale studio — Riccardo Brollo Architetto
   Un solo file, nessuna compilazione: si modifica e si ripubblica. */
(function(){
"use strict";
const CFG = window.GESTIONALE_CONFIG || {};
const $ = s => document.querySelector(s);

/* ---------------- costanti ---------------- */
const CATS = [
  {id:'pa',  name:'pratiche e P.A.'},
  {id:'can', name:'cantiere e sicurezza'},
  {id:'cont',name:'contabilità di cantiere'},
  {id:'prog',name:'progetto e disegno'},
  {id:'cli', name:'clienti e sopralluoghi'},
  {id:'amm', name:'parcelle e amministrazione'},
  {id:'stu', name:'studio e personale'}
];
const CATMAP = Object.fromEntries(CATS.map(c => [c.id, c]));
const TIPI_PRATICA = ['CILA','CILAS','SCIA','SCIA alternativa al PdC','Permesso di costruire','Accertamento di conformità / sanatoria',
  'SCA (agibilità)','Autorizzazione paesaggistica','Accesso agli atti','Pratica catastale','Altro'];
const STATI_PRATICA = ['in preparazione','depositata','integrazioni richieste','conclusa'];
const STATI_PROGETTO = ['attivo','in pausa','chiuso'];
const TABLES = ['membri','clienti','progetti','pratiche','attivita'];
const VIEWS = [['scrivania','scrivania'],['oggi','oggi'],['mappa','mappa'],['settimana','prossimi 7 giorni'],['attesa','in attesa di altri'],['fatte','completate'],
  ['progetti','progetti'],['pratiche','pratiche edilizie'],['clienti','clienti'],['studio','persone e accessi'],['calendario','calendario']];

/* ---------------- utilità ---------------- */
const pad = n => String(n).padStart(2,'0');
const ds = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today = () => ds(new Date());
const parse = s => { const [a,b,c] = String(s).slice(0,10).split('-').map(Number); return new Date(a,b-1,c); };
const addDays = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return ds(d); };
const diff = s => Math.round((parse(s) - parse(today())) / 864e5);
const fmtDate = s => parse(s).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
const dueTxt = o => dueLabel(o.scadenza) + (o.scadenza_ora ? ' alle ' + o.scadenza_ora : '');
function dueLabel(s){
  const n = diff(s);
  if(n < 0) return n === -1 ? 'scaduta ieri' : 'scaduta da '+(-n)+' gg';
  if(n === 0) return 'scade oggi';
  if(n === 1) return 'domani';
  if(n < 7) return parse(s).toLocaleDateString('it-IT',{weekday:'long'});
  return parse(s).toLocaleDateString('it-IT',{day:'numeric',month:'short'});
}
const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); });
const lsGet = k => { try { return localStorage.getItem('gest-'+k); } catch(e){ return null; } };
const lsSet = (k,v) => { try { localStorage.setItem('gest-'+k, v); } catch(e){} };
const cmpIt = (a,b) => String(a||'').localeCompare(String(b||''), 'it', {sensitivity:'base'});

function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if(attrs) for(const k in attrs){
    const v = attrs[k];
    if(v == null || v === false) continue;
    if(k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if(k === 'value') e.value = v;
    else if(k === 'checked' || k === 'selected') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for(const c of kids.flat()){ if(c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const catStyle = id => `--c:var(--c-${id});--cs:var(--c-${id}-s);--ci:var(--c-${id}-ink)`;
let toastT;
function toast(msg){ msg = cap(String(msg)); let t = $('.toast'); if(!t){ t = h('div',{class:'toast'}); document.body.append(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(()=>t.remove(), 2600); }
const cap = s => s ? s.charAt(0).toLocaleUpperCase('it-IT') + s.slice(1) : s;
const CAP_SEL = '.mp-foot span,.fd-due,.cal-m,.cal-wd,.cal-hint,.tbar-d,.fd-t,.fd-s,.fd-l li,.fo-t,.fo-s,.ctx-t,.ctx-l,.ctx-i,.shelf .acts,h1,h2 .t,h3,.nl-t,.nl-h,.ng-t,.chip,.btn,.tab span,.scope button,.stat-l,.eyebrow,.acts,.acts button,.f > label,.f > .lb,.tog,.qd button,.link,.meta .cat,.meta span,.tt,.mp-t,.mp-m,.empty,.side-app,.kv .k,.pill,.seg button,.quick button,.me-r,.waitline span,.waitline button,.cnt span,.prat-st,.prat-m .mono,.prat-dl,.tile-foot .due,.card .sub,.hub-l span,.map-key span,.prio-t,.login p,.confirm,.day,.sub,option';
function capAll(root){
  root.querySelectorAll(CAP_SEL).forEach(el => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n; while((n = w.nextNode())){ const t = n.nodeValue; const i = t.search(/\S/); if(i >= 0){ n.nodeValue = t.slice(0,i) + cap(t.slice(i)); break; } }
  });
  root.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i => i.placeholder = cap(i.placeholder));
}
const errMsg = e => (e && (e.message || e.error_description)) || 'errore sconosciuto';

/* ---------------- dati ---------------- */
const D = {}; TABLES.forEach(t => D[t] = new Map());
let sb = null, me = null, sessionEmail = '', syncState = '';
let scope = 'studio'; // un'unica vista per tutto lo studio: niente filtro "le mie"
let catFilter = null, showClosed = false, showConcluse = false, clientQuery = '';

const list = t => [...D[t].values()];
const get = (t,id) => id ? D[t].get(id) : null;
const membri = () => list('membri').sort((a,b)=>cmpIt(a.nome||a.email, b.nome||b.email));
const progetti = () => list('progetti').sort((a,b)=>cmpIt(a.nome,b.nome));
const clienti = () => list('clienti').sort((a,b)=>cmpIt(a.nome,b.nome));
const nomeMembro = m => m ? (m.nome || m.email.split('@')[0]) : '';
const iniziali = m => { const n = nomeMembro(m).trim().split(/\s+/); return ((n[0]||'')[0]||'' ) + ((n[1]||'')[0]||''); };

async function loadAll(){
  const res = await Promise.all(TABLES.map(t => sb.from(t).select('*')));
  res.forEach((r,i) => {
    if(r.error) throw r.error;
    const m = new Map(); (r.data||[]).forEach(x => m.set(x.id, x)); D[TABLES[i]] = m;
  });
}
async function reload(t){ const r = await sb.from(t).select('*'); if(!r.error){ const m = new Map(); r.data.forEach(x=>m.set(x.id,x)); D[t]=m; render(); } }

async function save(t, row){
  row = {...row};
  if(!row.id) row.id = uuid();
  D[t].set(row.id, row); render();
  const {error} = await sb.from(t).upsert(row);
  if(error){ toast('Non salvato: '+errMsg(error)); await reload(t); return null; }
  return row;
}
async function remove(t, id){
  D[t].delete(id); render();
  const {error} = await sb.from(t).delete().eq('id', id);
  if(error){ toast('Non eliminato: '+errMsg(error)); await reload(t); }
}

let liveCh = null;
function goLive(){
  if(liveCh) return;
  liveCh = sb.channel('gestionale')
    .on('postgres_changes', {event:'*', schema:'public'}, p => {
      const t = p.table; if(!D[t]) return;
      if(p.eventType === 'DELETE'){ if(p.old && p.old.id) D[t].delete(p.old.id); }
      else if(p.new && p.new.id) D[t].set(p.new.id, p.new);
      if(t === 'membri') me = findMe();
      scheduleRender();
    })
    .subscribe(status => { syncState = status === 'SUBSCRIBED' ? 'live' : (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') ? 'off' : syncState; scheduleRender(); });
}
let rq = false;
function scheduleRender(){ if(rq) return; rq = true; requestAnimationFrame(()=>{ rq = false; render(); }); }
const findMe = () => list('membri').find(m => m.email === sessionEmail && m.attivo) || null;

/* ---------------- regole sulle attività ---------------- */
const isDone = a => a.ogni_giorno ? a.fatta_oggi === today() : !!a.fatta;
const isWaiting = a => !!(a.attesa_chi || a.attesa_cosa) && !isDone(a);
const parentOf = a => a && a.per_scadenza ? get('attivita', a.per_scadenza) : null;
const effDue = a => a.scadenza || ((parentOf(a) || {}).scadenza) || null;
const figli = s => list('attivita').filter(c => c.per_scadenza === s.id);
const inToday = a => {
  if(a.ogni_giorno) return true;
  if(a.fatta) return false;
  const td = today(), due = effDue(a);
  return (a.in_oggi && a.in_oggi <= td) || (due && due <= td);
};
const mine = () => true;
const sortA = (a,b) => { const o = x => x.__pratica ? x.p : x; const ka = (a.scadenza||'9999')+(o(a).scadenza_ora||'~')+(a.created_at||''), kb = (b.scadenza||'9999')+(o(b).scadenza_ora||'~')+(b.created_at||''); return ka<kb?-1:ka>kb?1:0; };
const att = () => list('attivita').filter(mine).filter(a => !catFilter || (a.categoria||'stu') === catFilter);
const praticheAperte = () => list('pratiche').filter(p => p.stato !== 'conclusa');

/* ---------------- routing ---------------- */
let route = {view:'scrivania', id:null, desk:true};
function readHash(){
  const hh = decodeURIComponent(location.hash.slice(1));
  const [v, id] = hh.split('/');
  const parts = hh.split('/');
  if(v === 'scrivania'){ const sub = parts[1] || 'scrivania';
    route = sub === 'progetto' && parts[2] ? {view:'progetto', id:parts[2], desk:true} : {view: VIEWFN[sub] ? sub : 'scrivania', id:null, desk:true}; }
  else if(v === 'progetto' && id) route = {view:'progetto', id};
  else route = VIEWS.some(x=>x[0]===v) ? {view:v, id:null} : {view:'scrivania', id:null, desk:true};
}
addEventListener('hashchange', () => { const wasDesk = route.desk; readHash(); if(!(wasDesk && route.desk)) renderKeepScroll = false; ovScroll = 0; render(); renderKeepScroll = true; if(!route.desk || !wasDesk) scrollTo(0,0); });

/* ---------------- render ---------------- */
const LABEL = Object.fromEntries(VIEWS);
const NAV_GROUPS = [
  ['',             ['scrivania','mappa','calendario']],
  ['anagrafiche',  ['progetti','pratiche','clienti']],
  ['impostazioni', ['studio']]
];
const NAV_HINT = {scrivania:'le cartelle di lavoro', calendario:'scadenze e collegamento al tuo calendario', oggi:'la giornata e la timeline', mappa:'tutto quello che c’è da fare, in un colpo d’occhio', settimana:'le scadenze in arrivo',
  attesa:'cose ferme per altri', fatte:'lo storico', progetti:'incarichi e cantieri', pratiche:'CILA, SCIA, PdC…',
  clienti:'anagrafica', studio:'chi usa il gestionale'};
const TABS = ['scrivania','oggi','mappa','progetti'];
const ICONS = {
  scrivania:'<path d="M3 7.5h7l1.5-2H21v14H3z"/><path d="M3 10.5h18"/>',
  oggi:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  mappa:'<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  progetti:'<path d="M3.5 6.5h6l2 2h9v11h-17z"/>',
  pratiche:'<path d="M14 3H5.5v18h13V7.5z"/><path d="M14 3v4.5h4.5M9 13h6M9 16.5h6"/>',
  altro:'<path d="M4 7h16M4 12h16M4 17h16"/>'
};
function icon(n){ const s = h('span',{class:'ico','aria-hidden':'true'}); s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square">'+ICONS[n]+'</svg>'; return s; }
const ICON_IMG = () => { const s = h('span',{class:'ic-img','aria-hidden':'true'}); s.innerHTML = '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><circle cx="5.5" cy="6.5" r="1.3"/><path d="M2 12l4-3.5 3 2.5 2-1.5 3.5 3"/></svg>'; return s; };
const ARROW = () => { const s = h('span',{class:'arr','aria-hidden':'true'}); s.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 21 L21 3 M8 3 H21 V16"/></svg>'; return s; };
function logo(){
  return h('a',{class:'logo',href:'#scrivania','aria-label':'Scrivania'},
    h('img',{src:'img/spirale.png',alt:'',width:'34',height:'34'}), h('span',{class:'rba'},'RBA'));
}
let counts = {}, lateCount = 0, pendingRender = false;
function newLabel(){
  return ({clienti:'nuovo cliente', pratiche:'nuova pratica', progetti:'nuovo progetto'})[route.view]
    || (route.view==='studio' && me.ruolo==='admin' ? 'aggiungi persona' : 'nuova attività');
}
const syncText = () => syncState==='live' ? 'sincronizzato' : syncState==='off' ? 'non sincronizzato: ricarica' : 'collegamento…';
function meBox(){
  return h('div',{class:'me'}, h('span',{class:'who'},iniziali(me).toUpperCase()),
    h('div',{style:'min-width:0'}, h('div',{class:'me-n'},nomeMembro(me)),
      h('div',{class:'me-r mono'}, me.ruolo==='admin'?'amministratore':'membro', ' · ', h('span',{class:syncState==='off'?'err':null},syncText()))));
}
function render(){
  const app = $('#app');
  if(!sb) return;
  if((drag && drag.on) || mapDragging){ pendingRender = true; return; }
  if(!sessionEmail) return renderLogin(app);
  if(!me) return renderNonMembro(app);
  const sy = scrollY;
  app.innerHTML = '';
  document.body.classList.add('in');
  const open = att().filter(a => !isDone(a));
  lateCount = open.filter(a => !a.ogni_giorno && a.scadenza && diff(a.scadenza) < 0).length;
  counts = {
    oggi: att().filter(a => inToday(a) && !isDone(a)).length,
    mappa: open.filter(a => !a.ogni_giorno).length,
    settimana: open.filter(a => !a.ogni_giorno && effDue(a) && diff(effDue(a)) < 7).length + praticheAperte().filter(p=>p.scadenza && diff(p.scadenza)<7).length,
    progetti: progetti().filter(p => p.stato === 'attivo').length,
    attesa: open.filter(isWaiting).length,
    pratiche: praticheAperte().length,
    clienti: list('clienti').length, fatte: 0, studio: list('membri').filter(m=>m.attivo).length
  };
  const active = route.desk ? 'scrivania' : route.view==='progetto' ? 'progetti' : route.view;
  const pageView = route.desk ? 'scrivania' : route.view;
  const prevOv = $('.fo'); if(prevOv) ovScroll = prevOv.scrollTop;
  let n = 0;
  // menu: una riga in basso (computer); logo e "Menu" in basso (telefono), che apre le voci come sul sito
  const VOCI = [['mappa','Mappa'],['progetti','Progetti'],['pratiche','Pratiche'],['clienti','Clienti']];
  const dataBreve = new Date().toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'}).replace('.','');
  const bbar = h('nav',{class:'bbar','aria-label':'Menu'},
    h('span',{class:'bb-logo'}, logo(), lateCount ? h('i',{class:'bb-dot',title:'Qualcosa è scaduto'}) : null),
    h('div',{class:'bb-items'}, VOCI.map(([id, lab]) => h('a',{href:'#'+id, class:'bb-i'+(active===id?' on':''), title:NAV_HINT[id]||null}, h('span',null,lab), ARROW()))),
    h('button',{class:'bb-acc'+(active==='studio'?' on':''),title:nomeMembro(me),'aria-label':'Account',onclick:e=>{ e.stopPropagation(); accPop(e.currentTarget); }}, iniziali(me).toUpperCase()),
    h('button',{class:'bb-menu','aria-expanded':String(navOpen),onclick:()=>setNav(!navOpen)}, h('span',{class:'m-open'},'Menu'), h('span',{class:'m-close'},'Chiudi')));
  const mpanel = h('div',{class:'mpanel',onclick:e=>{ if(e.target.closest('a')) setNav(false); }},
    h('nav',null, VOCI.map(([id, lab]) => h('a',{href:'#'+id, class:active===id?'on':null}, lab, ARROW()))),
    h('div',{class:'mp-foot'}, h('span',null, nomeMembro(me)), h('a',{class:'link',href:'#studio'},'persone'), h('button',{class:'link',onclick:()=>{ setNav(false); logout(); }},'esci')));
  let title = LABEL[pageView] || '', eyebrow = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  if(pageView==='progetto'){ const p = get('progetti',route.id); title = p ? p.nome : 'progetto'; eyebrow = h('a',{href:'#progetti'},'← progetti'); }
  const content = h('div',{class:'content'+(['oggi','scrivania','calendario'].includes(pageView)?' wide':'')+(pageView==='mappa'?' full':'')},
  );
  if(!['scrivania','mappa'].includes(pageView)) content.append(
    h('header',{class:'top'+(pageView==='progetto'?' long':'')},
      h('div',{class:'top-t'}, h('h1',null,title)),
      ['progetti','pratiche','clienti','studio','calendario','progetto'].includes(pageView) || pageView === 'oggi' ? h('button',{class:'btn pri',onclick:fabAction}, newLabel(), ARROW()) : null));
  if(['oggi','settimana','attesa','fatte'].includes(pageView)){
    if(pageView !== 'fatte') content.append(quickAdd());
    const lg = h('div',{class:'legend'+(catFilter?' filtered':'')});
    CATS.forEach(c => lg.append(h('button',{class:'chip'+(catFilter===c.id?' on':''),style:catStyle(c.id),
      onclick:()=>{catFilter = catFilter===c.id?null:c.id; render();}}, c.name)));
    lg.append(h('span',{class:'chip hatch',title:'le attività che aspettano qualcun altro hanno il fondo tratteggiato'},'in attesa di altri'));
    content.append(lg);
  }
  const main = h('main'); content.append(main);
  const curView = route.view; if(route.desk) route.view = 'scrivania';
  VIEWFN[route.view](main);
  route.view = curView;
  app.append(h('div',{class:'top-date'}, dataBreve), h('div',{class:'shell'}, content), h('div',{class:'nav-scrim',onclick:()=>setNav(false)}), mpanel, bbar);
  document.body.classList.toggle('nav-open', navOpen);
  document.body.dataset.view = pageView;
  if(route.desk && route.view !== 'scrivania'){ app.append(deskOverlay()); const fo = $('.fo'); if(fo) fo.scrollTop = ovScroll; document.body.classList.add('ov-open'); } else document.body.classList.remove('ov-open');
  if(!$('.fab')) document.body.append(h('button',{class:'fab','aria-label':'nuovo',onclick:fabAction},'+'));
  capAll(app);
  if(renderKeepScroll){ scrollTo(0, sy); }
}
let renderKeepScroll = true;
let navOpen = false;
function closeAcc(){ const p = $('.acc-pop'); if(p) p.remove(); }
function accPop(btn){
  if($('.acc-pop')) return closeAcc();
  const r = btn.getBoundingClientRect();
  const pop = h('div',{class:'acc-pop',style:`right:${Math.max(8, innerWidth - r.right)}px;bottom:${innerHeight - r.top + 10}px`},
    h('div',{class:'acc-n'}, nomeMembro(me)), h('div',{class:'acc-e'}, me.email),
    h('div',{class:'acc-r'}, me.ruolo === 'admin' ? 'amministratore' : 'membro', ' · ', syncText()),
    h('a',{class:'acc-i',href:'#studio',onclick:closeAcc}, 'persone e accessi', ARROW()),
    h('button',{class:'acc-i',onclick:()=>{ closeAcc(); logout(); }}, 'esci'));
  document.body.append(pop);
}
document.addEventListener('pointerdown', e => { if(!e.target.closest('.acc-pop,.bb-acc')) closeAcc(); }, true);
addEventListener('hashchange', closeAcc);
function setNav(v){ navOpen = v; document.body.classList.toggle('nav-open', v); const b = $('.bb-menu'); if(b) b.setAttribute('aria-expanded', String(v)); }
const VIEWFN = {scrivania:vScrivania, oggi:vOggi, mappa:vMappa, settimana:vSett, progetti:vProgetti, progetto:vProgetto, attesa:vAttesa, pratiche:vPratiche, clienti:vClienti, fatte:vFatte, studio:vStudio, generali:vGenerali, calendario:vCalendario};
function sheetAltro(){
  openSheet(h('h3',null,'menu'),
    NAV_GROUPS.map(([g,ids]) => h('div',{class:'f'}, h('span',{class:'lb mono'},g),
      h('div',{class:'list'}, ids.filter(id=>!TABS.includes(id)).map(id => h('a',{class:'nl',href:'#'+id,onclick:closeSheet},
        h('span',{class:'nl-t'},LABEL[id], h('span',{class:'nl-h'},NAV_HINT[id])), counts[id] ? h('span',{class:'nl-c mono'},counts[id]) : null))))),
    h('div',{class:'f'}, meBox()),
    h('div',{class:'btns'}, h('button',{class:'btn',onclick:()=>{closeSheet(); logout();}},'esci'), h('button',{class:'btn',onclick:closeSheet},'chiudi')));
}

/* ---------------- trascinamento (mouse e dito) ---------------- */
let drag = null, justDragged = false;
function draggable(el, a){
  el.classList.add('dr'); el.dataset.id = a.id;
  el.addEventListener('pointerdown', e => {
    if(e.button !== 0) return;
    const grip = e.target.closest('.grip');
    if(!grip && (e.pointerType !== 'mouse' || e.target.closest('button,a,input,select,textarea'))) return;
    drag = {a, el, x0:e.clientX, y0:e.clientY, on:false, zone:null, idx:0};
    if(grip) e.preventDefault();
  });
}
function dragZoneAt(x, y){
  const t = document.elementFromPoint(x, y);
  return t ? t.closest('[data-drop]') : null;
}
addEventListener('pointermove', e => {
  if(!drag) return;
  if(!drag.on){
    if(Math.hypot(e.clientX-drag.x0, e.clientY-drag.y0) < 6) return;
    drag.on = true;
    const r = drag.el.getBoundingClientRect();
    drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
    drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('ghost'); drag.ghost.style.width = r.width+'px';
    document.body.append(drag.ghost); drag.el.classList.add('dragging'); document.body.classList.add('is-dragging');
    drag.timer = setInterval(() => { if(!drag) return; const y = drag.y;
      if(y < 80) scrollBy(0, -14); else if(y > innerHeight - 80) scrollBy(0, 14); }, 16);
  }
  e.preventDefault();
  drag.y = e.clientY;
  drag.ghost.style.transform = `translate(${e.clientX-drag.dx}px,${e.clientY-drag.dy}px) rotate(-1.5deg)`;
  document.querySelectorAll('.over,.ins').forEach(x=>x.classList.remove('over','ins'));
  const z = dragZoneAt(e.clientX, e.clientY); drag.zone = z;
  if(!z) return;
  z.classList.add('over');
  if(z.dataset.sort !== undefined){
    const kids = [...z.querySelectorAll(':scope > .dr:not(.dragging)')];
    let i = kids.findIndex(k => { const r = k.getBoundingClientRect(); return e.clientY < r.top + r.height/2; });
    if(i < 0) i = kids.length;
    drag.idx = i; drag.kids = kids;
    if(kids[i]) kids[i].classList.add('ins'); else z.classList.add('ins');
  }
}, {passive:false});
function endDrag(drop){
  const d = drag; drag = null;
  if(!d || !d.on) return;
  clearInterval(d.timer); d.ghost.remove(); d.el.classList.remove('dragging'); document.body.classList.remove('is-dragging');
  document.querySelectorAll('.over,.ins').forEach(x=>x.classList.remove('over','ins'));
  justDragged = true; setTimeout(()=>justDragged=false, 50);
  if(drop && d.zone) onDrop(d.a, d.zone.dataset.drop, d.idx, (d.kids||[]).map(k=>k.dataset.id));
  pendingRender = false; render();
}
addEventListener('pointerup', () => endDrag(true));
addEventListener('pointercancel', () => endDrag(false));
addEventListener('click', e => { if(justDragged){ e.stopPropagation(); e.preventDefault(); } }, true);
function onDrop(a, where, idx, order){
  const td = today();
  if(where.startsWith('slot:')){
    save('attivita', {...a, in_oggi: td, ora_oggi: where.slice(5)});
    toast('alle '+where.slice(5));
  } else if(where === 'inbox'){
    const ids = order.filter(id => id !== a.id); ids.splice(idx, 0, a.id);
    ids.forEach((id, i) => {
      const x = id === a.id ? {...a, ora_oggi:null, in_oggi: a.in_oggi && a.in_oggi <= td ? a.in_oggi : td} : get('attivita', id);
      if(x && (x.ordine !== (i+1)*10 || id === a.id)) save('attivita', {...x, ordine:(i+1)*10});
    });
  } else if(where.startsWith('prj:')){
    const pid = where.slice(4) || null;
    if((a.progetto_id||null) !== pid){ save('attivita', {...a, progetto_id: pid}); toast(pid ? 'spostata in '+get('progetti',pid).nome : 'tolta dal progetto'); }
  }
}
function fabAction(){
  if(route.desk && route.view === 'progetto') return sheetAttivita(null,{progetto_id:route.id});
  if(route.view === 'calendario') return sheetAttivita(null,{scadenza:today()});
  if(route.view === 'clienti') return sheetCliente();
  if(route.view === 'pratiche') return sheetPratica();
  if(route.view === 'progetti') return sheetProgetto();
  if(route.view === 'studio') return me.ruolo==='admin' ? sheetMembro() : sheetAttivita();
  sheetAttivita(null, route.view==='progetto' ? {progetto_id: route.id} : null);
}
function quickAdd(){
  const inp = h('input',{type:'text',placeholder: route.view==='oggi' ? 'scrivi una cosa da fare oggi e premi invio' : 'aggiungi un’attività e premi invio',enterkeyhint:'done'});
  const f = h('form',{class:'quick',autocomplete:'off',onsubmit:e=>{
    e.preventDefault(); const v = inp.value.trim(); if(!v) return;
    save('attivita', nuovaAttivita({titolo:v, progetto_id: route.view==='progetto'?route.id:null,
      in_oggi: route.view==='oggi'?today():null}));
    inp.value=''; toast(route.view==='oggi'?'aggiunta a oggi':'aggiunta');
  }}, inp, h('button',{type:'button',onclick:()=>{ const v=inp.value.trim(); inp.value='';
      sheetAttivita(null,{titolo:v, progetto_id: route.view==='progetto'?route.id:null}); }},'dettagli'));
  return f;
}
function nuovaAttivita(p){
  return Object.assign({id:uuid(), titolo:'', progetto_id:null, categoria: catFilter || lastCat, scadenza:null, ogni_giorno:false,
    fatta:false, fatta_il:null, fatta_oggi:null, in_oggi:null, ora_oggi:null, ordine:null, priorita:'media', allegati:[], scadenza_ora:null, per_scadenza:null, attesa_chi:'', attesa_cosa:'', note:'',
    assegnata_a: me.id, creata_da: me.id, created_at: new Date().toISOString()}, p||{});
}

function section(el, title, items, opts={}){
  if(!items.length && !opts.keep) return;
  const box = h('section',{class:'grp'+(opts.late?' late':'')});
  box.append(h('h2',null, h('span',{class:'t'},title), items.length ? h('span',{class:'n'},items.length) : null,
    opts.add ? h('button',{class:'shelf-add',title:opts.add.title,'aria-label':opts.add.title,onclick:opts.add.fn},'+') : null, opts.acts||null));
  const lst = h('div',{class: items.length && items.every(x=>x.__pratica) && !opts.row ? 'plist' : 'list'});
  if(!items.length && opts.emptyText) lst.append(h('div',{class:'empty sm'},opts.emptyText));
  items.forEach(x => lst.append(opts.row ? opts.row(x) : x.__pratica ? rowPratica(x.p) : rowAtt(x)));
  box.append(lst); el.append(box);
  return box;
}
const empty = (el, t) => el.append(h('div',{class:'empty'}, t));
const asP = p => ({__pratica:true, p, scadenza:p.scadenza, created_at:p.created_at});
function stat(lab, n, opts={}){
  return h(opts.href?'a':'div',{class:'stat '+(opts.cls||''),href:opts.href||null},
    h('div',{class:'stat-n'}, String(n)), h('div',{class:'stat-l mono'},lab));
}
const PRIO = ['bassa','media','alta'];
const prioOf = a => PRIO.includes(a.priorita) ? a.priorita : 'media';
const byOrdine = (a,b) => ((a.ordine ?? 1e9) - (b.ordine ?? 1e9)) || sortA(a,b);

/* ----- oggi: da sistemare + timeline ----- */
const ORE = []; for(let m = 7*60; m < 21*60; m += 30) ORE.push(pad(Math.floor(m/60))+':'+pad(m%60));
function vOggi(el){
  const td = today();
  const all = att().filter(inToday);
  const daily = all.filter(a=>a.ogni_giorno).sort(sortA);
  const timed = att().filter(a => !a.ogni_giorno && a.in_oggi === td && a.ora_oggi && (!a.fatta || (a.fatta_il && ds(new Date(a.fatta_il)) === td)) && !isWaiting(a));
  const inbox = all.filter(a => !a.ogni_giorno && !isWaiting(a) && !(a.in_oggi === td && a.ora_oggi)).sort(byOrdine);
  const wait = all.filter(a => !a.ogni_giorno && isWaiting(a)).sort(sortA);
  const prat = catFilter && catFilter!=='pa' ? [] : praticheAperte().filter(p=>p.scadenza && diff(p.scadenza)<=0).sort(sortA).map(asP);
  const doneToday = att().filter(a=>!a.ogni_giorno && a.fatta && a.fatta_il && ds(new Date(a.fatta_il))===td && !(a.in_oggi===td && a.ora_oggi));
  const late = inbox.filter(a=>a.scadenza && diff(a.scadenza)<0).length + prat.filter(x=>diff(x.scadenza)<0).length;


  const left = h('div',{class:'day-l'});
  const ib = h('section',{class:'grp'},
    h('h2',null, h('span',{class:'t'},'da sistemare'), h('span',{class:'n mono'}, String(inbox.length)),
      h('span',{class:'acts mono'},'trascina sulla timeline')));
  const ibList = h('div',{class:'list drop','data-drop':'inbox','data-sort':''});
  if(!inbox.length) ibList.append(h('div',{class:'empty sm'},'Scrivi qui sopra le cose da fare oggi, come ti vengono in mente. Poi trascinale sull’orario.'));
  inbox.forEach(a => ibList.append(rowAtt(a, {drag:true})));
  ib.append(ibList); left.append(ib);
  section(left,'pratiche in scadenza',prat,{late:prat.some(x=>diff(x.scadenza)<0)});
  section(left,'ogni giorno',daily);
  section(left,'in attesa di altri',wait);
  section(left,'fatte oggi',doneToday);

  const now = new Date(), nowSlot = pad(now.getHours())+':'+(now.getMinutes()<30?'00':'30');
  const tl = h('div',{class:'timeline'});
  const extra = timed.filter(a => !ORE.includes(a.ora_oggi));
  ORE.forEach(t => {
    const its = timed.filter(a => a.ora_oggi === t || (t === ORE[0] && extra.includes(a)));
    tl.append(h('div',{class:'slot'+(t.endsWith(':00')?' hr':'')+(t===nowSlot?' now':''),'data-drop':'slot:'+t},
      h('div',{class:'slot-t mono'}, t.endsWith(':00') ? t : ''),
      h('div',{class:'slot-b'}, its.sort(sortA).map(a => rowAtt(a, {drag:true, compact:true})))));
  });
  const right = h('div',{class:'day-r'}, h('section',{class:'grp'},
    h('h2',null, h('span',{class:'t'},'timeline'), h('span',{class:'n mono'}, String(timed.length)),
      h('span',{class:'acts mono'}, now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}))), tl));
  el.append(h('div',{class:'day'}, left, right));
}

/* ----- scrivania: la home, fatta di cartelle ----- */
const FOLDER_COLORS = ['#4FA65E','#C8A2B8','#58A8BA','#F7D5AE','#F0CBC1','#BD8F33','#E5F0D6','#EC9E55','#DCEDF2','#E7DAEA'];
const SHORT_DAY = s => { const n = diff(s); return n < 0 ? 'Scaduta' : n === 0 ? 'Oggi' : n === 1 ? 'Domani' : parse(s).toLocaleDateString('it-IT',{weekday:'short'}).replace('.',''); };
let openFrom = null;
function tabSvg(){
  const s = h('span',{class:'fd-tab','aria-hidden':'true'});
  s.innerHTML = '<svg viewBox="0 0 100 18" preserveAspectRatio="none"><path vector-effect="non-scaling-stroke" d="M0.5,18 V5 Q0.5,0.5 5,0.5 H40 L49,17.5 H100"/></svg>';
  return s;
}
function folder(o){
  return h('a',{class:'folder'+(o.hot?' hot':'')+(o.color==='#111'?' dark':'')+(o.ghost?' fd-new':''),href:o.href||'#',style:`--f:${o.color||'#fff'}`,
      onclick:e=>{ const r = e.currentTarget.getBoundingClientRect(); openFrom = {x:r.left + r.width/2, y:r.top + r.height/2};
        if(o.onclick){ e.preventDefault(); o.onclick(); } }},
    tabSvg(),
    h('div',{class:'fd-top'}, o.hot ? h('span',{class:'fd-sq',title:'Qualcosa è scaduto'}) : h('span'), o.count != null ? h('span',{class:'fd-n'}, o.count) : null),
    h('div',{class:'fd-t'}, o.title),
    o.sub ? h('div',{class:'fd-s'}, o.sub) : null,
    o.items && o.items.length ? h('ul',{class:'fd-l'}, o.items.slice(0,3).map(t => h('li',null,t))) : null,
    h('div',{class:'fd-f'}, h('span',{class:'fd-due'}, o.foot||''), h('span',{class:'fd-a'}, ARROW())));
}
function vScrivania(el){
  const td = today(), open = att().filter(a => !isDone(a));
  const firstDue = xs => xs.map(x => x.scadenza).filter(Boolean).sort()[0];
  const lateOf = xs => xs.filter(x => x.scadenza && diff(x.scadenza) < 0).length;
  const lateTxt = n => n ? n + (n === 1 ? ' scaduta' : ' scadute') : null;
  const todays = att().filter(a => inToday(a) && !isDone(a) && !a.ogni_giorno);
  const timed = todays.filter(a => a.in_oggi === td && a.ora_oggi).sort((a,b)=>cmpIt(a.ora_oggi,b.ora_oggi));
  const week = open.filter(a => !a.ogni_giorno && effDue(a) && diff(effDue(a)) < 7).sort((x,y) => cmpIt(effDue(x), effDue(y)) || sortA(x,y));
  const wait = open.filter(isWaiting).sort(sortA);
  const pr = praticheAperte().sort(sortA), integr = pr.filter(p => p.stato === 'integrazioni richieste').length;
  /* Regola unica per ogni cartella: numero = quante cose contiene; riga sotto il titolo = cosa scotta (solo se c'è);
     elenco = le prime cose dentro; piede = la scadenza più vicina. */
  const F = (o, xs, extraHot) => { const late = lateOf(xs), due = firstDue(xs);
    return folder({...o, count: xs.length, hot: late > 0 || !!extraHot, sub: [lateTxt(late), extraHot].filter(Boolean).join(' · ') || null,
      foot: due ? dueLabel(due) : ''}); };
  const shelf = (title, kids, add) => h('section',{class:'shelf'},
    h('h2',null, h('span',{class:'t'},title), add ? h('button',{class:'shelf-add',onclick:add.fn,title:add.title,'aria-label':add.title},'+') : null),
    h('div',{class:'folders'}, kids));
  const W = {alta:0, media:1, bassa:2};
  const ps = progetti().filter(p => p.stato === 'attivo');
  const orph = open.filter(a => !a.progetto_id || !get('progetti', a.progetto_id));
  const paused = progetti().filter(p => p.stato === 'in pausa');
  el.append(h('div',{class:'desk'},
    shelf('La giornata', [
      F({href:'#scrivania/oggi', title:'Oggi', color:'#111', items: timed.map(a => a.ora_oggi + ' ' + a.titolo).concat(todays.filter(a => !timed.includes(a)).map(a => a.titolo))}, todays),
      F({href:'#scrivania/settimana', title:'Prossimi 7 giorni', color:'#E9C85A', items: week.map(a => SHORT_DAY(effDue(a)) + (a.scadenza_ora ? ' ' + a.scadenza_ora : '') + ' · ' + a.titolo)}, week),
      F({href:'#scrivania/attesa', title:'In attesa di altri', color:'#E7DAEA', items: wait.map(a => (a.attesa_chi||'Qualcuno') + ' · ' + a.titolo)}, wait),
      F({href:'#scrivania/pratiche', title:'Pratiche edilizie', color:'#DCEDF2', items: pr.map(p => p.tipo + ' · ' + ((get('progetti',p.progetto_id)||{}).comune || p.comune || ''))}, pr,
        integr ? integr + (integr === 1 ? ' integrazione richiesta' : ' integrazioni richieste') : null)
    ]),
    shelf('Progetti in corso', ps.map((p, i) => {
      const its = open.filter(a => a.progetto_id === p.id).sort((a,b) => W[prioOf(a)] - W[prioOf(b)] || sortA(a,b));
      return F({href:'#scrivania/progetto/'+p.id, title:p.nome, color:FOLDER_COLORS[i % FOLDER_COLORS.length], items: its.map(a => a.titolo)},
        its.concat(pr.filter(x => x.progetto_id === p.id)));
    }), {fn:()=>sheetProgetto(), title:'Nuovo progetto'}),
    shelf('Studio', [
      F({href:'#scrivania/generali', title:'Generali', color:'#ffffff', items: orph.map(a => a.titolo)}, orph),
      paused.length ? folder({href:'#progetti', title:'In pausa', color:'#eeeae4', count:paused.length, items: paused.map(p => p.nome), foot:''}) : null,
      folder({href:'#scrivania/fatte', title:'Completate', color:'#f3f1ec', count: att().filter(a => a.fatta).length,
        items: att().filter(a => a.fatta).sort((a,b)=>cmpIt(b.fatta_il,a.fatta_il)).map(a => a.titolo), foot:''})
    ].filter(Boolean))));
}
function vGenerali(el){
  const its = att().filter(a => !isDone(a) && (!a.progetto_id || !get('progetti', a.progetto_id))).sort(sortA);
  section(el, 'Da fare', its.filter(a => !isWaiting(a)), {keep:true, emptyText:'Niente in sospeso.'});
  section(el, 'In attesa di altri', its.filter(isWaiting));
}
function deskFolderInfo(){
  if(route.view === 'progetto'){ const p = get('progetti', route.id); const i = progetti().filter(x=>x.stato==='attivo').indexOf(p);
    return {title: p ? p.nome : 'Progetto', color: FOLDER_COLORS[Math.max(0,i) % FOLDER_COLORS.length], sub:'Progetto'}; }
  return ({oggi:{title:'Oggi', color:'#111', sub:new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})},
    settimana:{title:'Prossimi 7 giorni', color:'#E9C85A', sub:'Scadenze'}, attesa:{title:'In attesa di altri', color:'#E7DAEA', sub:'Cose ferme'},
    pratiche:{title:'Pratiche edilizie', color:'#DCEDF2', sub:'Pratiche'}, generali:{title:'Studio e generali', color:'#ffffff', sub:'Senza progetto'},
    fatte:{title:'Completate', color:'#f3f1ec', sub:'Storico'}})[route.view] || {title:LABEL[route.view]||'', color:'#fff', sub:''};
}
let ovScroll = 0;
let showInfo = false;
function closeDesk(){ showInfo = false; location.hash = '#scrivania'; }
function deskOverlay(){
  const f = deskFolderInfo();
  const body = h('div',{class:'fo-body'});
  if(['oggi','settimana','attesa','progetto','generali'].includes(route.view)) body.append(quickAdd());
  VIEWFN[route.view](body);
  const panel = h('div',{class:'fo-wrap'+(openFrom?' anim':'')+(f.color==='#111'?' dark':''),style:`--f:${f.color}` + (openFrom ? `;--ox:${openFrom.x}px;--oy:${openFrom.y}px` : '')},
    tabSvg(),
    h('div',{class:'fo'},
      h('header',{class:'fo-h'},
        h('div',{style:'min-width:0'}, h('div',{class:'fo-t'}, f.title)),
        h('div',{class:'fo-a'},
          ['oggi','settimana','attesa','generali'].includes(route.view) ? h('button',{class:'btn sm pri',onclick:()=>sheetAttivita(null, route.view==='progetto' ? {progetto_id:route.id} : route.view==='oggi' ? {in_oggi:today()} : null)},'+ Attività') : null,
        route.view === 'pratiche' ? h('button',{class:'btn sm',onclick:()=>sheetPratica()},'+ Pratica') : null,
        route.view === 'progetto' ? h('button',{class:'btn sm'+(showInfo?' on':''),onclick:()=>{ showInfo = !showInfo; render(); }},'Dati del progetto') : null,
          h('button',{class:'x',onclick:closeDesk,'aria-label':'Chiudi'},'×'))),
      body));
  openFrom = null;
  return h('div',{class:'desk-ov',onclick:e=>{ if(e.target === e.currentTarget) closeDesk(); }}, panel);
}

/* ----- calendario: scadenze del mese e collegamento al calendario personale ----- */
let calMonth = null;
function vCalendario(el){
  const td = today(); if(!calMonth) calMonth = td.slice(0,7);
  const [Y, M] = calMonth.split('-').map(Number);
  const first = new Date(Y, M-1, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const shift = n => { const d = new Date(Y, M-1+n, 1); calMonth = d.getFullYear()+'-'+pad(d.getMonth()+1); render(); };
  const acts = att().filter(a => a.scadenza && !a.fatta && !a.ogni_giorno);
  const prs = list('pratiche').filter(p => p.scadenza && p.stato !== 'conclusa');
  el.append(h('div',{class:'cal-h'},
    h('button',{class:'cal-nav',onclick:()=>shift(-1),'aria-label':'Mese precedente'},'←'),
    h('div',{class:'cal-m'}, first.toLocaleDateString('it-IT',{month:'long',year:'numeric'})),
    h('button',{class:'cal-nav',onclick:()=>shift(1),'aria-label':'Mese successivo'},'→'),
    calMonth !== td.slice(0,7) ? h('button',{class:'link',onclick:()=>{ calMonth = td.slice(0,7); render(); }},'torna a oggi') : null,
    h('span',{class:'cal-hint'},'Clic su un giorno per fissare una scadenza')));
  const grid = h('div',{class:'cal'});
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(d => grid.append(h('div',{class:'cal-wd mono'}, d)));
  for(let i = 0; i < 42; i++){
    const d = new Date(start); d.setDate(start.getDate() + i); const k = ds(d);
    if(i >= 35 && d.getMonth() !== M-1) break;
    const its = acts.filter(a => a.scadenza === k).sort((a,b) => PRIO.indexOf(prioOf(b)) - PRIO.indexOf(prioOf(a)));
    const ps = prs.filter(p => p.scadenza === k);
    const chips = ps.map(p => h('button',{class:'cal-p',onclick:e=>{ e.stopPropagation(); sheetPratica(p); }}, (p.scadenza_ora ? p.scadenza_ora + ' ' : '') + p.tipo))
      .concat(its.map(a => h('button',{class:'cal-a p-'+prioOf(a),style:catStyle(CATMAP[a.categoria]?a.categoria:'stu'),onclick:e=>{ e.stopPropagation(); sheetAttivita(a); }}, (a.scadenza_ora ? a.scadenza_ora + ' ' : '') + a.titolo)));
    grid.append(h('div',{class:'cal-d'+(d.getMonth() !== M-1 ? ' out' : '')+(k === td ? ' today' : '')+(k < td ? ' past' : ''),
        onclick:()=>sheetAttivita(null,{scadenza:k})},
      h('div',{class:'cal-n'}, d.getDate()), h('div',{class:'cal-l'}, chips.slice(0,4), chips.length > 4 ? h('span',{class:'cal-more mono'},'+'+(chips.length-4)) : null)));
  }
  el.append(grid);
  el.append(h('section',{class:'grp'}, h('h2',null, h('span',{class:'t'},'Collega il tuo calendario')),
    h('div',{class:'panel'},
      h('p',null,'Scarica le scadenze di attività e pratiche in un file .ics e aprilo con Google Calendar, Calendario di Apple o Outlook: compariranno come eventi di un giorno, con il progetto nel titolo.'),
      h('div',{class:'btns',style:'margin-top:0'}, h('button',{class:'btn pri',onclick:scaricaIcs},'Scarica le scadenze (.ics)')),
      h('p',{class:'hint',style:'margin:12px 0 0'},'Il file è una fotografia di oggi: per avere le scadenze sempre aggiornate nel calendario serve un collegamento automatico, che si può attivare in seguito.'))));
}
function scaricaIcs(){
  const esc = s => String(s||'').replace(/\\/g,'\\\\').replace(/[,;]/g, m => '\\'+m).replace(/\n/g,'\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';
  const ev = (uid, d, title, desc, ora) => { const e = addDays(d, 1).replace(/-/g,''), D = d.replace(/-/g,'');
    const t = ora && /^\d\d:\d\d/.test(ora) ? ora.replace(':','') + '00' : null, t2 = t ? pad((+ora.slice(0,2) + 1) % 24) + ora.slice(3,5) + '00' : null;
    return ['BEGIN:VEVENT','UID:'+uid+'@gestionale-rba','DTSTAMP:'+stamp, t ? 'DTSTART:'+D+'T'+t : 'DTSTART;VALUE=DATE:'+D, t ? 'DTEND:'+(+t2.slice(0,2) < +t.slice(0,2) ? e : D)+'T'+t2 : 'DTEND;VALUE=DATE:'+e,'SUMMARY:'+esc(title), desc ? 'DESCRIPTION:'+esc(desc) : null,'END:VEVENT'].filter(Boolean).join('\r\n'); };
  const out = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RBA//Gestionale//IT','CALSCALE:GREGORIAN','X-WR-CALNAME:Scadenze RBA'];
  att().filter(a => a.scadenza && !a.fatta && !a.ogni_giorno).forEach(a => { const p = get('progetti', a.progetto_id);
    out.push(ev(a.id, a.scadenza, (p ? p.nome + ' · ' : '') + a.titolo, a.note, a.scadenza_ora)); });
  list('pratiche').filter(p => p.scadenza && p.stato !== 'conclusa').forEach(x => { const p = get('progetti', x.progetto_id);
    out.push(ev(x.id, x.scadenza, 'Pratica ' + x.tipo + (p ? ' · ' + p.nome : ''), [x.stato, x.protocollo ? 'prot. ' + x.protocollo : ''].filter(Boolean).join(' · '), x.scadenza_ora)); });
  out.push('END:VCALENDAR');
  const a = h('a',{href: URL.createObjectURL(new Blob([out.join('\r\n')], {type:'text/calendar'})), download:'scadenze-rba.ics'});
  document.body.append(a); a.click(); a.remove(); toast('File delle scadenze scaricato');
}

/* ----- menu contestuale (tasto destro, o dito tenuto premuto) ----- */
function closeCtx(){ const m = $('.ctx'); if(m) m.remove(); }
function ctxMenu(a, x, y){
  closeCtx(); if(!a) return;
  const pr = prioOf(a), td = today();
  const m = h('div',{class:'ctx',role:'menu'},
    h('div',{class:'ctx-t'}, a.titolo || '(senza titolo)'),
    h('div',{class:'ctx-l mono'},'Priorità'),
    h('div',{class:'seg ctx-seg'}, PRIO.map(p => h('button',{class:'p-'+p+(p===pr?' on':''),onclick:()=>{ closeCtx(); save('attivita',{...a, priorita:p}); toast('Priorità '+p); }}, cap(p)))),
    h('div',{class:'ctx-l mono'},'Tipo'),
    h('div',{class:'ctx-cats'}, CATS.map(c => h('button',{class:'chip'+(c.id===a.categoria?' on':''),style:catStyle(c.id),title:c.name,onclick:()=>{ closeCtx(); save('attivita',{...a, categoria:c.id}); }}, cap(c.name.split(' ')[0])))),
    h('div',{class:'ctx-sep'}),
    h('button',{class:'ctx-i',onclick:()=>{ closeCtx(); save('attivita',{...a, in_oggi: td, ora_oggi:null}); toast('Messa in programma oggi'); }},'Metti in programma oggi'),
    h('button',{class:'ctx-i',onclick:()=>{ closeCtx(); toggle(a); toast('Fatta'); }},'Segna come fatta'),
    h('button',{class:'ctx-i',onclick:()=>{ closeCtx(); sheetAttivita(a); }},'Modifica tutti i dettagli…'));
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
document.addEventListener('pointerdown', e => { if(!e.target.closest('.ctx')) closeCtx(); }, true);
addEventListener('scroll', closeCtx, true);
addEventListener('keydown', e => { if(e.key === 'Escape'){ if($('.acc-pop')) return closeAcc(); if($('.ctx')) return closeCtx(); if(navOpen) return setNav(false); if(ov.hidden && route.desk && route.view !== 'scrivania') closeDesk(); } });

/* ----- mappa: piano libero, progetti come nodi, attività come etichette sfumate ----- */
let mapDragging = false;
const hashN = s => { let x = 0; for(const c of String(s)) x = (x*31 + c.charCodeAt(0)) | 0; return Math.abs(x); };
let mapView = null;
let mapShow = (() => { try { const v = JSON.parse(lsGet('mapshow')); if(Array.isArray(v) && v.length) return new Set(v); } catch(e){} return new Set(PRIO); })();
function vMappa(el){
  const all = att().filter(a => !isDone(a) && !a.ogni_giorno);
  const items = all.filter(a => mapShow.has(prioOf(a)));
  const filt = h('div',{class:'map-filter'},
    ['alta','media','bassa'].map(p => h('button',{class:'mf p-'+p+(mapShow.has(p)?' on':''),'aria-pressed':String(mapShow.has(p)),
      onclick:()=>{ if(mapShow.has(p)){ if(mapShow.size > 1) mapShow.delete(p); } else mapShow.add(p); lsSet('mapshow', JSON.stringify([...mapShow])); render(); }},
      h('span',{class:'mf-box'}), h('span',{class:'mf-dot'}), cap(p), h('span',{class:'mf-n'}, all.filter(a => prioOf(a) === p).length))));
  const groups = progetti().filter(p => p.stato !== 'chiuso').map(p => ({p, its: items.filter(a => a.progetto_id === p.id)})).filter(g => g.its.length);
  const orph = items.filter(a => !a.progetto_id || !get('progetti', a.progetto_id));
  if(orph.length) groups.push({p:null, its:orph});
  const wrap = h('div',{class:'mapwrap'}, filt);
  el.append(wrap);
  if(!groups.length){ wrap.append(h('div',{class:'empty'},'Nessuna attività con questa priorità.')); return; }
  const W = Math.max(300, innerWidth - (innerWidth >= 900 ? 82 : 2)), Hv = Math.max(380, innerHeight - (innerWidth >= 900 ? 100 : 96));
  const small = W < 700, K = 1, ASP = Math.sqrt(Math.max(1, W / Hv));
  const SZ = {alta:{fs:19,mw:230,px:20,py:11}, media:{fs:14,mw:190,px:14,py:7}, bassa:{fs:12,mw:160,px:10,py:4}};
  const box = a => { const z = SZ[prioOf(a)], t = (a.titolo||'').length * z.fs * .54, inner = z.mw - 2*z.px;
    const lines = Math.max(1, Math.ceil(t / inner)); const meta = prioOf(a) !== 'bassa' && (a.scadenza || isWaiting(a));
    return {w: Math.min(z.mw, t + 2*z.px) + 16, h: lines * z.fs * 1.18 + 2*z.py + (meta ? 14 : 0) + 16}; };
  const REST = {alta:80*K, media:125*K, bassa:165*K};
  // 1. nodi: progetti su una spirale aurea attorno al centro, attività sui loro anelli
  const hubs = [], nodes = [];
  groups.forEach((g, i) => {
    const seed = hashN(g.p ? g.p.id : 'none'), r = 230 * K * Math.sqrt(i), a0 = i * 2.39996;
    const hb = {hub:true, g, x: small ? 0 : Math.cos(a0) * r * ASP, y: small ? i * 520 * K : Math.sin(a0) * r / ASP, rad: (REST.bassa + 40) * Math.min(1, .55 + g.its.length * .06)};
    hubs.push(hb);
    PRIO.slice().reverse().forEach((pr, ri) => {
      const arr = g.its.filter(a => prioOf(a) === pr).sort(sortA);
      arr.forEach((a, k) => { const ang = (seed % 360) * Math.PI / 180 + ri * .7 + k * 2*Math.PI / arr.length, bx = box(a);
        nodes.push({a, hb, pr, w: bx.w, h: bx.h, x: hb.x + Math.cos(ang) * REST[pr], y: hb.y + Math.sin(ang) * REST[pr] * .8}); });
    });
  });
  // le attività da fare entro una scadenza si agganciano alla scadenza, non al progetto
  nodes.forEach(n => { const par = n.a.per_scadenza && nodes.find(m => m.a.id === n.a.per_scadenza);
    if(par){ n.par = par; const k = nodes.filter(m => m.par === par).length, ang = k * 1.3;
      n.x = par.x + (par.x - par.hb.x) * .6 + Math.cos(ang) * 40; n.y = par.y + (par.y - par.hb.y) * .6 + Math.sin(ang) * 40; } });
  const anchor = n => n.par || n.hb, restOf = n => n.par ? (Math.max(n.par.w, n.par.h) * .5 + Math.max(n.w, n.h) * .5 + 18) : REST[n.pr];
  // 2. assestamento organico: molle verso il proprio progetto, repulsione tra tutti, gravità verso il centro
  const ext = n => Math.max(n.w, n.h) * .5;
  for(let it = 0, T = 1; it < 320; it++, T *= .992){
    hubs.forEach(hb => { hb.fx = -hb.x * (small ? .05 : .012 / ASP); hb.fy = small ? 0 : -hb.y * .012 * ASP * ASP; });
    nodes.forEach(n => { n.fx = 0; n.fy = 0; });
    nodes.forEach(n => { const A = anchor(n), dx = n.x - A.x, dy = n.y - A.y, d = Math.hypot(dx, dy) || 1, k = (d - restOf(n)) * (n.par ? .1 : .06);
      n.fx -= dx / d * k; n.fy -= dy / d * k; A.fx += dx / d * k * .25; A.fy += dy / d * k * .25; });
    for(let i = 0; i < hubs.length; i++) for(let j = i+1; j < hubs.length; j++){
      const A = hubs[i], B = hubs[j], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, m = A.rad + B.rad;
      if(d < m){ const f = (m - d) * .08; A.fx -= dx/d*f; A.fy -= dy/d*f; B.fx += dx/d*f; B.fy += dy/d*f; } }
    for(let i = 0; i < nodes.length; i++){ const A = nodes[i];
      for(let j = i+1; j < nodes.length; j++){ const B = nodes[j], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, m = ext(A) + ext(B) + 10;
        if(d < m){ const f = (m - d) * .15; A.fx -= dx/d*f; A.fy -= dy/d*f; B.fx += dx/d*f; B.fy += dy/d*f; } }
      hubs.forEach(hb => { const dx = A.x - hb.x, dy = A.y - hb.y, d = Math.hypot(dx, dy) || 1, m = ext(A) + 60;
        if(d < m){ const f = (m - d) * .2; A.fx += dx/d*f; A.fy += dy/d*f; } }); }
    hubs.forEach(hb => { hb.x += hb.fx * T; hb.y += hb.fy * T; });
    nodes.forEach(n => { n.x += n.fx * T; n.y += n.fy * T; });
  }
  // 2b. ogni progetto nel suo cerchio; i cerchi non si toccano (si sposta tutto il gruppo)
  const circ = hb => { const ns = nodes.filter(n => n.hb === hb);
    const cx = (hb.x + 60 + ns.reduce((t,n) => t + n.x, 0)) / (ns.length + 1), cy = (hb.y + 10 + ns.reduce((t,n) => t + n.y, 0)) / (ns.length + 1);
    const r = Math.max(100, Math.hypot(hb.x - cx, hb.y - cy) + 30, Math.hypot(hb.x + 170 - cx, hb.y + 30 - cy), ...ns.map(n => Math.hypot(n.x - cx, n.y - cy) + Math.hypot(n.w, n.h) / 2 - 6)) + 10;
    return {hb, cx, cy, r}; };
  const shiftG = (hb, dx, dy) => { hb.x += dx; hb.y += dy; nodes.forEach(n => { if(n.hb === hb){ n.x += dx; n.y += dy; } }); };
  for(let it = 0; it < 120; it++){ let moved = false; const cs = hubs.map(circ);
    for(let i = 0; i < cs.length; i++) for(let j = i+1; j < cs.length; j++){
      const A = cs[i], B = cs[j], dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy) || 1, m = A.r + B.r + 28;
      if(d < m){ const f = (m - d) / 2 + .5; shiftG(A.hb, -dx/d*f, -dy/d*f); shiftG(B.hb, dx/d*f, dy/d*f); moved = true; } }
    if(!moved) break; }
  // 3. nessuna sovrapposizione, etichette dei progetti comprese
  const rects = nodes.concat(hubs.map(hb => ({fixed:true, x:hb.x + 12 + Math.max(110, (hb.g.p ? hb.g.p.nome.length : 8) * 8.2 + 24) / 2, y:hb.y + 31, w:Math.max(110, (hb.g.p ? hb.g.p.nome.length : 8) * 8.2 + 24) + 12, h:60})), hubs.map(hb => ({fixed:true, x:hb.x, y:hb.y, w:22, h:22})));
  for(let it = 0; it < 200; it++){ let moved = false;
    for(let i = 0; i < rects.length; i++) for(let j = i+1; j < rects.length; j++){
      const A = rects[i], B = rects[j]; if(A.fixed && B.fixed) continue;
      const dx = B.x - A.x, dy = B.y - A.y, ox = (A.w + B.w)/2 - Math.abs(dx), oy = (A.h + B.h)/2 - Math.abs(dy);
      if(ox <= 0 || oy <= 0) continue; moved = true;
      const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1, fa = A.fixed ? 0 : B.fixed ? 1 : .5, fb = 1 - fa;
      if(ox < oy) { A.x -= sx*ox*fa; B.x += sx*ox*fb; } else { A.y -= sy*oy*fa; B.y += sy*oy*fb; } }
    if(!moved) break; }
  // 4. centrare nel foglio
  const circles = hubs.map(circ);
  const minX = Math.min(...rects.map(r => r.x - r.w/2), ...circles.map(c => c.cx - c.r)), maxX = Math.max(...rects.map(r => r.x + r.w/2), ...circles.map(c => c.cx + c.r));
  const minY = Math.min(...rects.map(r => r.y - r.h/2), ...circles.map(c => c.cy - c.r)), maxY = Math.max(...rects.map(r => r.y + r.h/2), ...circles.map(c => c.cy + c.r));
  const CW = maxX - minX + 80, CH = maxY - minY + 80, ox = 40 - minX, oy = 40 - minY, sc = 1, W2 = CW, H = CH;
  const X = x => x + ox, Y = y => y + oy;
  const cv = h('div',{class:'mapcv',style:`width:${CW}px;height:${CH}px`});
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','mapsvg'); svg.setAttribute('width', CW); svg.setAttribute('height', CH); svg.setAttribute('viewBox', `0 0 ${CW} ${CH}`);
  const actives = progetti().filter(x => x.stato === 'attivo');
  circles.forEach(c => { const p = c.hb.g.p, i = p ? actives.indexOf(p) : -1, col = i >= 0 ? FOLDER_COLORS[i % FOLDER_COLORS.length] : '#cfcac3';
    const R = c.r * sc;
    cv.append(h('div',{class:'ring','data-hub':p ? p.id : 'none',style:`left:${X(c.cx)}px;top:${Y(c.cy)}px;width:${2*R}px;height:${2*R}px;--g:${col}`})); });
  cv.append(svg);
  const curve = (x1,y1,x2,y2) => `M${x1},${y1} C${x1 + (x2-x1)*.15},${y1 + (y2-y1)*.7} ${x1 + (x2-x1)*.6},${y2} ${x2},${y2}`;
  nodes.forEach(n => {
    const key = n.hb.g.p ? n.hb.g.p.id : 'none';
    const pa = document.createElementNS('http://www.w3.org/2000/svg','path');
    const A = anchor(n); pa.setAttribute('d', curve(X(A.x), Y(A.y), X(n.x), Y(n.y))); pa.setAttribute('class','p-'+n.pr+(n.par?' sub':'')); pa.dataset.hub = key; pa.dataset.id = n.a.id; svg.append(pa);
    const pl = pill(n.a, X(n.x), Y(n.y)); pl.dataset.hub = key; cv.append(pl);
  });
  hubs.forEach(hb => { const key = hb.g.p ? hb.g.p.id : 'none', cl = hb.g.p && get('clienti', hb.g.p.cliente_id);
    cv.append(h('div',{class:'hub',style:`left:${X(hb.x)}px;top:${Y(hb.y)}px`,'data-hub':key},
      h('span',{class:'sq'}),
      h('span',{class:'hub-l'}, hb.g.p ? h('a',{href:'#scrivania/progetto/'+hb.g.p.id}, hb.g.p.nome) : h('span',null,'Generali'), cl ? h('em',null, cl.nome) : null))); });
  const focus = (hub, id) => { cv.classList.add('focus'); cv.querySelectorAll('.hl,.hl2').forEach(x=>x.classList.remove('hl','hl2'));
    cv.querySelectorAll(`[data-hub="${hub}"]`).forEach(x=>x.classList.add('hl')); if(id) cv.querySelectorAll(`[data-id="${id}"]`).forEach(x=>x.classList.add('hl2')); };
  const unfocus = () => { cv.classList.remove('focus'); cv.querySelectorAll('.hl,.hl2').forEach(x=>x.classList.remove('hl','hl2')); };
  cv.addEventListener('mouseover', e => { const t = e.target.closest('.mp,.hub'); if(t) focus(t.dataset.hub, t.dataset.id); });
  cv.addEventListener('mouseout', e => { const r = e.relatedTarget; if(!r || !r.closest || !r.closest('.mp,.hub')) unfocus(); });
  cv.addEventListener('contextmenu', e => { const t = e.target.closest('.mp'); if(!t) return; e.preventDefault(); ctxMenu(get('attivita', t.dataset.id), e.clientX, e.clientY); });
  let lp = null;
  cv.addEventListener('pointerdown', e => { const t = e.target.closest('.mp'); if(!t || e.pointerType === 'mouse') return;
    const id = t.dataset.id, x = e.clientX, y = e.clientY;
    lp = {x, y, t: setTimeout(() => { lp = null; focus(t.dataset.hub, id); ctxMenu(get('attivita', id), x, y); }, 480)}; });
  const lpCancel = e => { if(lp && (e.type !== 'pointermove' || Math.hypot(e.clientX-lp.x, e.clientY-lp.y) > 8)){ clearTimeout(lp.t); lp = null; } };
  ['pointerup','pointercancel','pointermove'].forEach(ev => cv.addEventListener(ev, lpCancel));
  // navigazione: trascina per spostare, rotellina (o due dita) per ingrandire
  const Wv = W, HvH = Hv;
  wrap.style.height = HvH + 'px';
  const key = [...mapShow].join() + '|' + groups.map(g => (g.p ? g.p.id : '-') + g.its.length).join();
  const fit = (minZ = .2) => { const z = Math.max(minZ, Math.min(1, (Wv - 40) / CW, small ? 9 : (HvH - 90) / CH));
    return {key, z, tx: (Wv - CW * z) / 2, ty: small || CH * z > HvH - 90 ? Math.min(70, (HvH - CH * z) / 2 + 20) : (HvH - CH * z) / 2 + 20}; };
  if(!mapView || mapView.key !== key) mapView = fit(small ? .2 : .68);
  const V = mapView, apply = () => { cv.style.transform = `translate(${V.tx}px,${V.ty}px) scale(${V.z})`; };
  const zoomAt = (px, py, f) => { const nz = Math.max(.2, Math.min(3, V.z * f)); V.tx = px - (px - V.tx) * nz / V.z; V.ty = py - (py - V.ty) * nz / V.z; V.z = nz; apply(); };
  apply();
  const local = e => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  wrap.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))); }, {passive:false});
  const pts = new Map(); let g = null;
  const start = () => { const ps = [...pts.values()];
    if(ps.length === 1) g = {pan:true, x:ps[0].x, y:ps[0].y, tx:V.tx, ty:V.ty, moved:false};
    else if(ps.length >= 2){ const [a, b] = ps; g = {pinch:true, d:Math.hypot(a.x-b.x, a.y-b.y) || 1, mx:(a.x+b.x)/2, my:(a.y+b.y)/2, z:V.z, tx:V.tx, ty:V.ty, moved:true}; } };
  wrap.addEventListener('pointerdown', e => {
    if(e.button !== 0 || e.target.closest('.map-filter,.map-ctrl')) return;
    const [x, y] = local(e); pts.set(e.pointerId, {x, y}); start();
  });
  const onMove = e => { if(!pts.has(e.pointerId) || !g) return; const [x, y] = local(e); pts.set(e.pointerId, {x, y});
    if(g.pan){ const dx = x - g.x, dy = y - g.y; if(!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true; wrap.classList.add('panning'); V.tx = g.tx + dx; V.ty = g.ty + dy; apply(); }
    else if(g.pinch){ const [a, b] = [...pts.values()]; const d = Math.hypot(a.x-b.x, a.y-b.y), mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
      const nz = Math.max(.2, Math.min(3, g.z * d / g.d)); V.tx = mx - (g.mx - g.tx) * nz / g.z; V.ty = my - (g.my - g.ty) * nz / g.z; V.z = nz; apply(); } };
  const onUp = e => { if(!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if(g && g.moved){ justDragged = true; setTimeout(() => justDragged = false, 50); }
    wrap.classList.remove('panning'); g = null; if(pts.size) start(); };
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  const off = () => { if(!document.body.contains(wrap)){ removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); removeEventListener('hashchange', off); } };
  addEventListener('hashchange', off);
  wrap.append(cv, h('div',{class:'map-ctrl'},
    h('button',{onclick:()=>zoomAt(Wv/2, HvH/2, 1.25),'aria-label':'Ingrandisci',title:'Ingrandisci'},'+'),
    h('button',{onclick:()=>zoomAt(Wv/2, HvH/2, .8),'aria-label':'Riduci',title:'Riduci'},'−'),
    h('button',{class:'fit',onclick:()=>{ Object.assign(V, fit()); apply(); },title:'Vedi tutta la mappa'},'Tutto')));
}

function pill(a, x, y){
  const cat = CATMAP[a.categoria] ? a.categoria : 'stu', pr = prioOf(a);
  const late = a.scadenza && diff(a.scadenza) < 0, wait = isWaiting(a);
  return h('div',{class:'mp p-'+pr+(late?' late':'')+(wait?' wait':''),'data-id':a.id,style:`left:${x}px;top:${y}px;${catStyle(cat)}`,title:CATMAP[cat].name},
    h('span',{class:'mp-t'}, a.titolo || '(senza titolo)'),
    pr !== 'bassa' && (a.scadenza || wait) ? h('span',{class:'mp-m'}, wait ? 'Attende ' + (a.attesa_chi||'altri') : dueTxt(a)) : null);
}

function vSett(el){
  const a = att().filter(x=>!x.ogni_giorno && !isDone(x) && effDue(x) && diff(effDue(x))<7);
  const p = (catFilter && catFilter!=='pa') ? [] : praticheAperte().filter(x=>x.scadenza && diff(x.scadenza)<7).map(asP);
  const dd = x => x.__pratica ? x.scadenza : effDue(x);
  const grp = x => { const q = !x.__pratica && parentOf(x); return q ? q : x; };
  const items = a.concat(p).sort((x,y) => cmpIt(dd(x), dd(y)) || sortA(grp(x), grp(y)) || (parentOf(x) ? 1 : 0) - (parentOf(y) ? 1 : 0) || sortA(x,y));
  if(!items.length) return empty(el,'Nessuna scadenza nei prossimi sette giorni.');
  section(el,'scadute',items.filter(x=>diff(dd(x))<0),{late:true});
  for(let i=0;i<7;i++){
    const d = addDays(today(),i);
    const lab = i===0?'oggi':i===1?'domani':parse(d).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'short'});
    section(el,lab,items.filter(x=>dd(x)===d));
  }
}
function vProgetti(el){
  const all = progetti();
  if(all.some(p=>p.stato==='chiuso')) el.append(h('div',{class:'toolbar'},
    h('button',{class:'link mono',onclick:()=>{showClosed=!showClosed;render();}}, showClosed?'nascondi i chiusi':'mostra i chiusi')));
  if(!all.length) return empty(el,'Ancora nessun progetto. Creane uno con il pulsante +.');
  let i = 0;
  STATI_PROGETTO.forEach(st => {
    if(st==='chiuso' && !showClosed) return;
    const ps = all.filter(p=>p.stato===st);
    if(!ps.length) return;
    el.append(h('section',{class:'grp'},
      h('h2',null,h('span',{class:'t'}, st==='attivo'?'in corso':st==='in pausa'?'in pausa':'chiusi'), h('span',{class:'n mono'},String(ps.length))),
      h('div',{class:'grid'}, ps.map(p => cardProgetto(p, ++i)))));
  });
  const orfane = att().filter(a=>!isDone(a) && (!a.progetto_id || !get('progetti',a.progetto_id))).sort(sortA);
  section(el,'attività senza progetto',orfane);
}
function cardProgetto(p, i){
  const cl = get('clienti',p.cliente_id);
  const aperte = list('attivita').filter(a=>a.progetto_id===p.id && !isDone(a));
  const prat = list('pratiche').filter(x=>x.progetto_id===p.id && x.stato!=='conclusa');
  const prox = aperte.concat(prat).map(x=>x.scadenza).filter(Boolean).sort()[0];
  const cats = [...new Set(aperte.map(a=>CATMAP[a.categoria]?a.categoria:'stu'))];
  return h('a',{class:'tile'+(p.stato!=='attivo'?' dim':''),href:'#scrivania/progetto/'+p.id},
    h('div',{class:'tile-top'}, h('div',{class:'nm'},p.nome), h('div',{class:'sub'}, [cl && cl.nome, p.comune].filter(Boolean).join(' · ') || ' ')),
    h('div',{class:'dots'}, cats.map(c => h('span',{class:'dot',style:catStyle(c),title:CATMAP[c].name}))),
    h('div',{class:'tile-foot mono'},
      h('span',null,h('b',null,String(aperte.length)),' attività'),
      h('span',null,h('b',null,String(prat.length)), prat.length===1?' pratica':' pratiche'),
      prox ? h('span',{class:'due'+(diff(prox)<0?' late-t':'')}, dueLabel(prox)) : null));
}
function vProgetto(el){
  const p = get('progetti', route.id);
  if(!p) return empty(el,'Progetto non trovato: forse è stato eliminato.');
  const cl = get('clienti',p.cliente_id);
  const kv = (k,v) => v ? h('div',{class:'kv'}, h('div',{class:'k'},k), h('div',{class:'v'},v)) : null;
  const prat = list('pratiche').filter(x=>x.progetto_id===p.id).sort(sortA);
  const a = list('attivita').filter(x=>x.progetto_id===p.id).filter(x=>!catFilter||(x.categoria||'stu')===catFilter);
  const dati = () => {
    el.append(h('div',{class:'phead'},
      h('div',{class:'kvs'},
        kv('cliente', cl ? h('a',{href:'#',onclick:e=>{e.preventDefault();sheetCliente(cl);}},cl.nome) : null),
        kv('comune', p.comune), kv('indirizzo', p.indirizzo),
        kv('telefono', cl && cl.telefono ? h('a',{href:'tel:'+cl.telefono.replace(/\s/g,'')},cl.telefono) : null),
        kv('stato', h('span',{class:'pill st-'+p.stato.replace(' ','-')},p.stato))),
      p.note ? h('div',{class:'note'},p.note) : null,
      h('div',{class:'btns'}, h('button',{class:'btn sm',onclick:()=>sheetProgetto(p)},'modifica'))));
    section(el,'pratiche',prat.filter(x=>x.stato!=='conclusa').map(asP),{keep:true,emptyText:'nessuna pratica aperta',
      acts:h('span',{class:'acts'},h('button',{onclick:()=>sheetPratica(null,{progetto_id:p.id, comune:p.comune})},'+ pratica'))});
    section(el,'pratiche concluse',prat.filter(x=>x.stato==='conclusa').map(asP));
  };
  if(route.desk){
    // la cartella: prima le scadenze, poi le cose senza data; i dati (e le pratiche) dietro il pulsante
    if(showInfo) dati();
    const sc = a.filter(x=>!isDone(x) && !x.ogni_giorno && x.scadenza)
      .concat(prat.filter(x=>x.stato!=='conclusa' && x.scadenza).map(asP)).sort(sortA);
    section(el,'scadenze',sc,{keep:true,emptyText:'Nessuna scadenza.',row:rowScad,late:sc.some(x=>diff(x.scadenza)<0),
      add:{title:'Nuova scadenza', fn:()=>sheetAttivita(null,{progetto_id:p.id, scadenza:addDays(today(),7)},'nuova scadenza')}});
    section(el,'da fare',a.filter(x=>!isDone(x)&&!isWaiting(x)&&!x.scadenza).sort((x,y)=>{const W={alta:0,media:1,bassa:2}; return W[prioOf(x)]-W[prioOf(y)] || sortA(x,y);}),{keep:true,emptyText:'Nessuna attività senza data.',
      add:{title:'Nuova attività', fn:()=>sheetAttivita(null,{progetto_id:p.id})}});
    section(el,'in attesa di altri',a.filter(x=>isWaiting(x)&&!x.scadenza).sort(sortA));
    section(el,'fatte',a.filter(x=>x.fatta).sort((x,y)=>cmpIt(y.fatta_il,x.fatta_il)).slice(0,30));
    return;
  }
  dati();
  section(el,'da fare',a.filter(x=>!isDone(x)&&!isWaiting(x)).sort((x,y)=>{const W={alta:0,media:1,bassa:2}; return W[prioOf(x)]-W[prioOf(y)] || sortA(x,y);}),{keep:true,emptyText:'nessuna attività aperta',
    acts:h('span',{class:'acts'},h('button',{onclick:()=>sheetAttivita(null,{progetto_id:p.id})},'+ attività'))});
  section(el,'in attesa di altri',a.filter(isWaiting).sort(sortA));
  section(el,'fatte',a.filter(x=>x.fatta).sort((x,y)=>cmpIt(y.fatta_il,x.fatta_il)).slice(0,30));
}
function rowScad(x){
  const isP = !!x.__pratica, o = isP ? x.p : x, d = parse(o.scadenza), n = diff(o.scadenza);
  const cat = !isP && CATMAP[o.categoria] ? o.categoria : 'stu';
  const fs = isP ? [] : figli(o), aperti = fs.filter(c => !c.fatta), fatti = fs.length - aperti.length;
  const row = h('div',{class:'scad'+(isP?' is-p':' p-'+prioOf(o))+(n<0?' late':n===0?' today':'')+(!isP&&isWaiting(o)?' wait':''),style:isP?null:catStyle(cat),
      onclick:()=>isP?sheetPratica(o):sheetAttivita(o)},
    isP ? h('span',{class:'scad-k'},'Pratica') : h('button',{class:'chk','aria-label':'segna fatta',onclick:e=>{ e.stopPropagation(); toggle(o); }}),
    h('div',{class:'scad-d'}, h('b',null,d.getDate()), h('span',null,d.toLocaleDateString('it-IT',{month:'short'}).replace('.',''))),
    h('div',{class:'scad-h'+(o.scadenza_ora?'':' none')}, o.scadenza_ora || '00:00'),
    h('div',{class:'scad-b'},
      h('div',{class:'tt'}, isP ? o.tipo : o.titolo),
      h('div',{class:'meta'}, n < 7 ? h('span',{class:n<0?'late':n===0?'today':null}, dueLabel(o.scadenza)) : null,
        fs.length ? h('span',{class:'prog'}, h('i',{style:`--p:${Math.round(fatti / fs.length * 100)}%`}), fatti + ' di ' + fs.length + ' fatte') : null,
        isP ? h('span',null,o.stato) : (isWaiting(o) ? h('span',null,'attende '+(o.attesa_chi||'altri')) : null))),
    isP ? null : h('button',{class:'scad-add',title:'Aggiungi una cosa da fare entro questa scadenza','aria-label':'Aggiungi una cosa da fare entro questa scadenza',
      onclick:e=>{ e.stopPropagation(); sheetAttivita(null,{progetto_id:o.progetto_id, per_scadenza:o.id, categoria:o.categoria}, 'da fare entro: ' + o.titolo); }},'+'));
  if(isP || !aperti.length) return row;
  const W = {alta:0, media:1, bassa:2};
  return h('div',{class:'scad-g'}, row,
    h('ul',{class:'scad-f'}, aperti.sort((p,q) => W[prioOf(p)] - W[prioOf(q)] || sortA(p,q)).map(c =>
      h('li',{class:'p-'+prioOf(c)+(isWaiting(c)?' wait':''),style:catStyle(CATMAP[c.categoria]?c.categoria:'stu'),onclick:()=>sheetAttivita(c)}, c.titolo))));
}
function vAttesa(el){
  const items = att().filter(isWaiting).sort(sortA);
  const dep = (catFilter && catFilter!=='pa') ? [] : list('pratiche').filter(p=>p.stato==='depositata').sort(sortA).map(asP);
  if(!items.length && !dep.length) return empty(el,'Non state aspettando nessuno.');
  const by = {}; items.forEach(a => { const k = (a.attesa_chi||'qualcuno').trim(); (by[k]=by[k]||[]).push(a); });
  Object.keys(by).sort(cmpIt).forEach(k => section(el,'da '+k, by[k]));
  section(el,'pratiche depositate, in attesa del Comune',dep);
}
function vPratiche(el){
  el.append(h('div',{class:'toolbar'},
    h('button',{class:'link mono',onclick:()=>{showConcluse=!showConcluse;render();}}, showConcluse?'nascondi le concluse':'mostra le concluse')));
  const all = list('pratiche');
  if(!all.length) return empty(el,'Nessuna pratica. Le pratiche si legano a un progetto.');
  STATI_PRATICA.forEach(st => {
    if(st==='conclusa' && !showConcluse) return;
    section(el, st, all.filter(p=>p.stato===st).sort(sortA).map(asP), {late: st==='integrazioni richieste'});
  });
}
function vClienti(el){
  const q = h('input',{class:'search',type:'search',placeholder:'cerca per nome, codice fiscale, telefono…',value:clientQuery,
    oninput:e=>{clientQuery=e.target.value; drawList();}});
  const box = h('div');
  el.append(h('div',{class:'toolbar'}, q), box);
  function drawList(){
    box.innerHTML='';
    const s = clientQuery.trim().toLowerCase();
    const cs = clienti().filter(c => !s || [c.nome,c.codice_fiscale,c.email,c.telefono,c.indirizzo].join(' ').toLowerCase().includes(s));
    if(!cs.length) return empty(box, s ? 'Nessun cliente trovato.' : 'Ancora nessun cliente.');
    box.append(h('div',{class:'list'}, cs.map(c => {
      const ps = list('progetti').filter(p=>p.cliente_id===c.id);
      return h('div',{class:'card',onclick:()=>sheetCliente(c)},
        h('span',{class:'who lg'}, c.nome.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()),
        h('div',{style:'min-width:0;flex:1'}, h('div',{class:'nm'},c.nome), h('div',{class:'sub mono'},[c.telefono,c.email,c.codice_fiscale].filter(Boolean).join(' · ')||' ')),
        h('div',{class:'cnt mono'}, ps.length ? h('span',null,h('b',null,ps.length), ps.length===1?' progetto':' progetti') : null));
    })));
    capAll(box);
  }
  drawList();
}
function vFatte(el){
  const items = att().filter(a=>!a.ogni_giorno && a.fatta).sort((a,b)=>cmpIt(b.fatta_il,a.fatta_il));
  if(!items.length) return empty(el,'Ancora niente di fatto.');
  section(el,'completate',items.slice(0,200));
}
function vStudio(el){
  const admin = me.ruolo === 'admin';
  el.append(h('section',{class:'grp'}, h('h2',null,h('span',{class:'t'},'persone che usano il gestionale'), h('span',{class:'n mono'},String(membri().length))),
    h('div',{class:'list'}, membri().map(m => h('div',{class:'card',onclick:admin?()=>sheetMembro(m):null,style:admin?null:'cursor:default'},
      h('span',{class:'who lg'},iniziali(m).toUpperCase()),
      h('div',{style:'min-width:0;flex:1'}, h('div',{class:'nm'},nomeMembro(m)), h('div',{class:'sub mono'},m.email)),
      h('div',{class:'cnt'}, h('span',{class:'pill'+(m.ruolo==='admin'?' dark':'')}, m.ruolo==='admin'?'amministratore':'membro'), m.attivo?'':' · disattivato'))))));
  if(!admin) el.append(h('p',{class:'hint'},'Solo un amministratore può aggiungere persone.'));
  el.append(h('section',{class:'grp'}, h('h2',null,h('span',{class:'t'},'importa dall’app “cose da fare”')),
    h('div',{class:'panel'},
      h('p',null,'Nell’app su Claude premi “copia backup”, poi incolla qui il testo. Progetti e attività vengono aggiunti a quelli già presenti e assegnati a te.'),
      h('button',{class:'btn',onclick:sheetImport},'incolla il backup'))));
}

/* ----- righe ----- */
function rowAtt(a, o={}){
  const done = isDone(a), wait = isWaiting(a), cat = CATMAP[a.categoria] ? a.categoria : 'stu';
  const meta = h('div',{class:'meta'});
  const p = get('progetti',a.progetto_id);
  if(p && route.view !== 'progetto') meta.append(h('a',{class:'prj',href:'#scrivania/progetto/'+p.id,onclick:e=>e.stopPropagation()},p.nome));
  if(a.ogni_giorno) meta.append(h('span',null,'ogni giorno'));
  else if(a.scadenza && !done){ const n = diff(a.scadenza); meta.append(h('span',{class:n<0?'late':n===0?'today':null},dueTxt(a))); }
  if(!a.ogni_giorno && !done && a.in_oggi && a.in_oggi<=today() && route.view!=='oggi') meta.append(h('span',null,'in programma oggi'));
  const par = parentOf(a);
  if(par && !done && !o.inScad){ const n = diff(par.scadenza || today());
    meta.append(h('span',{class:'entro'+(n<0?' late':n===0?' today':'')}, 'Entro: ' + par.titolo + (par.scadenza ? ' · ' + dueTxt(par) : ''))); }
  if(a.note) meta.append(h('span',null,'· nota'));
  if((a.allegati||[]).length) meta.append(h('span',{class:'att-n',title:'Immagini allegate'}, ICON_IMG(), a.allegati.length));
  const body = h('div',{class:'tb',onclick:()=>sheetAttivita(a)}, h('div',{class:'tt'},a.titolo||'(senza titolo)'), meta);
  if(wait) body.append(h('div',{class:'waitline'},
    h('span',null,'aspetti ',h('b',null,a.attesa_chi||'qualcuno'), a.attesa_cosa?' — '+a.attesa_cosa:''),
    h('button',{onclick:e=>{e.stopPropagation(); save('attivita',{...a,attesa_chi:'',attesa_cosa:''}); toast('sbloccata: ora tocca a voi');}},'sbloccata')));
  const who = get('membri',a.assegnata_a);
  const showWho = !!who;
  const row = h('div',{class:'task p-'+prioOf(a)+(done?' done':'')+(wait?' wait':'')+(o.compact?' compact':''),style:catStyle(cat),title:CATMAP[cat].name+' · priorità '+prioOf(a)},
    o.drag ? h('span',{class:'grip','aria-label':'trascina'}) : null,
    h('button',{class:'chk','aria-label':done?'segna da fare':'segna fatta',onclick:()=>toggle(a)}), body,
    showWho ? h('div',{class:'who',title:nomeMembro(who)},iniziali(who).toUpperCase()) : null);
  if(o.drag) draggable(row, a);
  return row;
}
function toggle(a){
  if(a.ogni_giorno) save('attivita',{...a, fatta_oggi: isDone(a) ? null : today()});
  else save('attivita',{...a, fatta: !a.fatta, fatta_il: !a.fatta ? new Date().toISOString() : null});
}
function rowPratica(p){
  const pr = get('progetti',p.progetto_id);
  const st = p.stato, hot = st === 'integrazioni richieste' || (p.scadenza && st !== 'conclusa' && diff(p.scadenza) < 0);
  const due = p.scadenza && st !== 'conclusa' ? parse(p.scadenza) : null;
  return h('div',{class:'prat'+(st==='conclusa'?' done':'')+(hot?' hot':''),onclick:()=>sheetPratica(p)},
    h('div',{class:'prat-tag mono'}, 'Pratica'),
    h('div',{class:'prat-b'},
      h('div',{class:'prat-t'}, p.tipo),
      h('div',{class:'prat-m'},
        pr && route.view!=='progetto' ? h('a',{class:'prj',href:'#scrivania/progetto/'+pr.id,onclick:e=>e.stopPropagation()},pr.nome) : null,
        h('span',{class:'mono'}, [p.comune, p.protocollo ? 'prot. '+p.protocollo : null, p.data_deposito ? 'depositata il '+fmtDate(p.data_deposito) : null].filter(Boolean).join(' · ')),
        h('span',{class:'prat-st mono'+(st==='integrazioni richieste'?' late':'')}, st))),
    due ? h('div',{class:'prat-d'}, h('div',{class:'prat-dn'}, pad(due.getDate())+'.'+pad(due.getMonth()+1)),
      h('div',{class:'prat-dl mono'+(diff(p.scadenza)<0?' late':'')}, dueTxt(p))) : null);
}

/* ---------------- immagini allegate alle attività ---------------- */
const BUCKET = 'allegati';
async function rimpicciolisci(file){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bmp = await createImageBitmap(file).catch(() => null); if(!bmp) return file;
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)); if(k === 1 && file.size < 1.5e6) return file;
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', .85));
}
async function caricaImmagini(taskId, files){
  const out = [];
  for(const f of files){
    if(!/^image\//.test(f.type)) continue;
    const blob = await rimpicciolisci(f), tipo = blob.type || f.type;
    const path = taskId + '/' + uuid() + (tipo === 'image/jpeg' ? '.jpg' : '.' + ((f.name || '').split('.').pop() || 'img').toLowerCase());
    const {error} = await sb.storage.from(BUCKET).upload(path, blob, {contentType: tipo});
    if(error){ toast('Immagine non caricata: ' + errMsg(error)); continue; }
    out.push({path, nome: f.name || 'immagine', tipo});
  }
  return out;
}
const urlCache = new Map();
async function urlsFor(paths){
  const need = paths.filter(p => !urlCache.has(p));
  if(need.length){ const {data} = await sb.storage.from(BUCKET).createSignedUrls(need, 3600); (data || []).forEach(x => { if(x.signedUrl) urlCache.set(x.path, x.signedUrl); }); }
  return paths.map(p => urlCache.get(p) || '');
}
function lightbox(urls, i){
  const img = h('img',{alt:''}), show = () => { img.src = urls[i]; };
  const close = () => { lb.remove(); removeEventListener('keydown', key, true); };
  const go = n => { i = (i + n + urls.length) % urls.length; show(); };
  const key = e => { if(e.key === 'Escape'){ e.stopPropagation(); close(); } else if(e.key === 'ArrowRight') go(1); else if(e.key === 'ArrowLeft') go(-1); };
  const lb = h('div',{class:'lbox',onclick:e=>{ if(e.target === lb) close(); }}, img,
    h('button',{class:'x lbox-x',onclick:close,'aria-label':'Chiudi'},'×'),
    urls.length > 1 ? h('button',{class:'lbox-n lbox-p',onclick:()=>go(-1),'aria-label':'Precedente'},'←') : null,
    urls.length > 1 ? h('button',{class:'lbox-n lbox-s',onclick:()=>go(1),'aria-label':'Successiva'},'→') : null);
  show(); document.body.append(lb); addEventListener('keydown', key, true);
}
let pasteTarget = null;
document.addEventListener('paste', e => {
  if(!pasteTarget || ov.hidden) return;
  const files = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => /^image\//.test(f.type));
  if(files.length){ e.preventDefault(); pasteTarget(files); }
});
function galleria(d, isNew, onChange){
  let imgs = Array.isArray(d.allegati) ? d.allegati.slice() : [];
  const gal = h('div',{class:'gal'});
  const fileIn = h('input',{type:'file',accept:'image/*',multiple:true,hidden:true,onchange:e=>{ add([...e.target.files]); e.target.value = ''; }});
  const persist = () => { onChange(imgs); if(!isNew){ const cur = get('attivita', d.id); if(cur) save('attivita', {...cur, allegati: imgs}); } };
  const add = async files => { if(!files.length) return; gal.classList.add('busy');
    const up = await caricaImmagini(d.id, files); imgs = imgs.concat(up); persist(); draw(); };
  const draw = async () => {
    const urls = await urlsFor(imgs.map(x => x.path));
    gal.innerHTML = ''; gal.classList.remove('busy');
    imgs.forEach((x, i) => gal.append(h('div',{class:'th'},
      h('img',{src:urls[i], alt:x.nome, title:x.nome, onclick:()=>lightbox(urls, i)}),
      h('button',{type:'button',class:'th-x',title:'Togli l’immagine','aria-label':'Togli',onclick:()=>{
        imgs.splice(i, 1); sb.storage.from(BUCKET).remove([x.path]); persist(); draw(); }},'×'))));
    gal.append(h('button',{type:'button',class:'th-add',onclick:()=>fileIn.click(),title:'Aggiungi immagini (puoi anche incollarle)'}, h('span',null,'+'), 'Immagine'));
  };
  pasteTarget = add; draw();
  return h('div',null, gal, fileIn);
}

/* ---------------- schede (moduli) ---------------- */
const ov = $('#ov'), sheet = $('#sheet');
function closeSheet(){ ov.hidden = true; sheet.innerHTML = ''; pasteTarget = null; }
ov.addEventListener('click', e => { if(e.target === ov) closeSheet(); });
addEventListener('keydown', e => { if(e.key === 'Escape' && !ov.hidden) closeSheet(); });
function openSheet(...kids){ sheet.innerHTML=''; sheet.append(h('button',{class:'x sheet-x',onclick:closeSheet,'aria-label':'Chiudi'},'×'), ...kids.flat().filter(Boolean)); capAll(sheet); ov.hidden=false; sheet.scrollTop=0; }
const fld = (label, ...inputs) => h('div',{class:'f'}, h('label',null,label), ...inputs);
const txt = (v, ph, type) => h('input',{type:type||'text', value:v||'', placeholder:ph||''});
function delBtn(onConfirm, warning){
  const conf = h('div',{class:'confirm'}); let armed = false;
  const b = h('button',{class:'btn del',onclick:()=>{ if(!armed){ armed=true; conf.textContent=(warning?warning+' ':'')+'Premi di nuovo “elimina” per confermare.'; return; } onConfirm(); }},'elimina');
  return [b, conf];
}
function selectOf(options, value, empty){
  return h('select',null, empty!=null ? h('option',{value:''},empty) : null,
    options.map(o => h('option',{value:o.value, selected:o.value===value}, o.label)));
}
let lastCat = lsGet('cat') || 'stu';

function sheetAttivita(a, preset, heading){
  const isNew = !a;
  const d = a ? {...a} : nuovaAttivita(Object.assign({in_oggi: route.view==='oggi'?today():null}, preset||{}));
  const title = txt(d.titolo,'che cosa c’è da fare');
  let cat = CATMAP[d.categoria] ? d.categoria : 'stu';
  const cats = h('div',{class:'cats'});
  const drawCats = () => { cats.innerHTML=''; CATS.forEach(c => cats.append(h('span',{class:'chip'+(c.id===cat?' on':''),style:catStyle(c.id),onclick:()=>{cat=c.id;drawCats();}},c.name))); };
  drawCats();
  const prog = selectOf(progetti().filter(p=>p.stato!=='chiuso'||p.id===d.progetto_id).map(p=>({value:p.id,label:p.nome})), d.progetto_id, '— nessun progetto —');
  const entroOpts = () => list('attivita').filter(x => x.id !== d.id && x.scadenza && !x.fatta && !x.per_scadenza && (x.progetto_id||'') === (prog.value||'')).sort(sortA)
    .map(x => ({value:x.id, label: x.titolo + ' — ' + fmtDate(x.scadenza) + (x.scadenza_ora ? ' ' + x.scadenza_ora : '')}));
  const entroBox = h('div');
  let entro = null;
  const drawEntro = () => { const cur = entro ? entro.value : d.per_scadenza; entroBox.innerHTML = '';
    entro = selectOf(entroOpts(), cur, '— nessuna: ha una data sua —'); entro.addEventListener('change', syncEntro); entroBox.append(entro); syncEntro(); };
  const syncEntro = () => { const on = !!(entro && entro.value); [due, dueT].forEach(i => { if(i){ i.disabled = on; if(on) i.value = ''; } }); };
  const chi = selectOf(membri().filter(m=>m.attivo||m.id===d.assegnata_a).map(m=>({value:m.id,label:nomeMembro(m)+(m.id===me.id?' (tu)':'')})), d.assegnata_a, '— chiunque —');
  const due = h('input',{type:'date',value:d.scadenza||''});
  const dueT = h('input',{type:'time',value:d.scadenza_ora||'','aria-label':'ora della scadenza'});
  drawEntro(); prog.addEventListener('change', drawEntro);
  const daily = h('input',{type:'checkbox',checked:!!d.ogni_giorno});
  const planned = h('input',{type:'checkbox',checked:!!(d.in_oggi && d.in_oggi<=today())});
  const ora = h('input',{type:'time',value:(d.in_oggi===today() && d.ora_oggi) || '',step:'1800'});
  let prio = prioOf(d);
  const prios = h('div',{class:'seg'});
  const drawPrio = () => { prios.innerHTML=''; PRIO.forEach(p => prios.append(h('button',{type:'button',class:'p-'+p+(p===prio?' on':''),onclick:()=>{prio=p;drawPrio();}},p))); };
  drawPrio();
  const wchi = h('input',{type:'text',value:d.attesa_chi||'',placeholder:'chi (Comune, cliente, impresa, collega…)',list:'dl-chi'});
  const wcosa = txt(d.attesa_cosa,'che cosa (parere, rilievo, preventivo…)');
  const dl = h('datalist',{id:'dl-chi'},[...new Set(list('attivita').map(x=>x.attesa_chi).filter(Boolean))].sort(cmpIt).map(w=>h('option',{value:w})));
  const note = h('textarea',{placeholder:'note'}); note.value = d.note||'';
  let allegati = Array.isArray(d.allegati) ? d.allegati : [];
  const gal = galleria(d, isNew, v => { allegati = v; });
  const doSave = () => {
    const v = title.value.trim(); if(!v){ title.focus(); return; }
    lastCat = cat; lsSet('cat',cat);
    const td = today();
    save('attivita',{...d, titolo:v, categoria:cat, progetto_id:prog.value||null, assegnata_a:chi.value||null,
      scadenza:due.value||null, scadenza_ora: due.value && dueT.value ? dueT.value.slice(0,5) : null, per_scadenza: entro && entro.value || null, ogni_giorno:daily.checked,
      in_oggi: (planned.checked || ora.value) ? (d.in_oggi && d.in_oggi<=td && !ora.value ? d.in_oggi : td) : null,
      ora_oggi: (planned.checked || ora.value) && ora.value ? ora.value.slice(0,5) : null, priorita: prio,
      attesa_chi:wchi.value.trim(), attesa_cosa:wcosa.value.trim(), note:note.value.trim(), allegati});
    closeSheet(); if(isNew) toast('aggiunta');
  };
  title.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); doSave(); } });
  openSheet(h('h3',null,heading || (isNew?'nuova attività':'attività')),
    h('div',{class:'f'},title),
    h('div',{class:'f'},h('span',{class:'lb'},'tipo di attività'),cats),
    h('div',{class:'f'},h('span',{class:'lb'},'priorità'),prios),
    h('div',{class:'row2'}, fld('progetto',prog), fld('chi la fa',chi)),
    fld('scadenza', h('div',{class:'due-row'}, due, dueT), h('div',{class:'qd'},
      h('button',{type:'button',onclick:()=>due.value=today()},'oggi'),
      h('button',{type:'button',onclick:()=>due.value=addDays(today(),1)},'domani'),
      h('button',{type:'button',onclick:()=>due.value=addDays(today(),7)},'tra una settimana'),
      h('button',{type:'button',onclick:()=>{ due.value=''; dueT.value=''; }},'nessuna'))),
    fld('oppure entro la scadenza…', entroBox),
    h('div',{class:'f'}, h('div',{class:'row-oggi'}, h('label',{class:'tog'},planned,'da fare oggi'), h('label',{class:'tog'},'alle ',ora)), h('label',{class:'tog'},daily,'ogni giorno (torna da fare ogni mattina)')),
    h('div',{class:'f waitbox'}, h('span',{class:'lb'},'prima bisogna aspettare che…'), wchi, dl, h('div',{style:'height:6px'}), wcosa),
    h('div',{class:'f'},note),
    h('div',{class:'f'}, h('span',{class:'lb'},'immagini'), gal),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'),
      isNew ? null : delBtn(()=>{ (d.allegati||[]).length && sb.storage.from(BUCKET).remove(d.allegati.map(x=>x.path)); remove('attivita',d.id); closeSheet(); toast('eliminata'); })));
  if(isNew) setTimeout(()=>title.focus(),50);
}

function sheetProgetto(p){
  const isNew = !p;
  const d = p ? {...p} : {id:uuid(), nome:'', cliente_id:null, comune:'', indirizzo:'', stato:'attivo', note:'', created_at:new Date().toISOString()};
  const nome = txt(d.nome,'es. Seveso, via San Matteo 4/F');
  const cli = selectOf(clienti().map(c=>({value:c.id,label:c.nome})).concat([{value:'__new',label:'+ nuovo cliente…'}]), d.cliente_id, '— nessun cliente —');
  const nuovoCli = h('input',{type:'text',placeholder:'nome del nuovo cliente',style:'display:none;margin-top:8px'});
  cli.addEventListener('change',()=>{ nuovoCli.style.display = cli.value==='__new'?'':'none'; if(cli.value==='__new') nuovoCli.focus(); });
  const comune = h('input',{type:'text',value:d.comune,placeholder:'comune',list:'dl-comuni'});
  const dlc = h('datalist',{id:'dl-comuni'},[...new Set(list('progetti').map(x=>x.comune).filter(Boolean))].sort(cmpIt).map(c=>h('option',{value:c})));
  const ind = txt(d.indirizzo,'via e civico');
  const stato = selectOf(STATI_PROGETTO.map(s=>({value:s,label:s})), d.stato);
  const note = h('textarea',{placeholder:'note (dati catastali, accordi, riferimenti…)'}); note.value = d.note||'';
  const doSave = async () => {
    const v = nome.value.trim(); if(!v){ nome.focus(); return; }
    let cid = cli.value || null;
    if(cid === '__new'){
      const nm = nuovoCli.value.trim();
      if(nm){ const c = await save('clienti',{id:uuid(), nome:nm, codice_fiscale:'', email:'', telefono:'', indirizzo:'', note:'', created_at:new Date().toISOString()}); cid = c ? c.id : null; }
      else cid = null;
    }
    const r = await save('progetti',{...d, nome:v, cliente_id:cid, comune:comune.value.trim(), indirizzo:ind.value.trim(), stato:stato.value, note:note.value.trim()});
    closeSheet(); if(isNew && r) location.hash = '#scrivania/progetto/'+r.id;
  };
  openSheet(h('h3',null,isNew?'nuovo progetto':'progetto'),
    fld('nome',nome), fld('cliente',cli,nuovoCli),
    h('div',{class:'row2'}, fld('comune',comune,dlc), fld('stato',stato)),
    fld('indirizzo',ind), fld('note',note),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'),
      isNew ? null : delBtn(async ()=>{
        list('attivita').filter(a=>a.progetto_id===d.id).forEach(a=>D.attivita.set(a.id,{...a,progetto_id:null}));
        list('pratiche').filter(x=>x.progetto_id===d.id).forEach(x=>D.pratiche.delete(x.id));
        await remove('progetti',d.id); closeSheet(); location.hash='#progetti';
      },'Le attività restano, senza progetto; le pratiche del progetto vengono eliminate.')));
  if(isNew) setTimeout(()=>nome.focus(),50);
}

function sheetPratica(p, preset){
  const isNew = !p;
  const ps = progetti().filter(x=>x.stato!=='chiuso' || (p && x.id===p.progetto_id));
  if(isNew && !ps.length){ toast('Prima crea un progetto: ogni pratica appartiene a un progetto.'); return; }
  const d = p ? {...p} : Object.assign({id:uuid(), progetto_id: ps[0].id, tipo:'CILA', comune:'', protocollo:'', data_deposito:null, scadenza:null,
    stato:'in preparazione', note:'', created_at:new Date().toISOString()}, preset||{});
  const prog = selectOf(ps.map(x=>({value:x.id,label:x.nome})), d.progetto_id);
  const tipo = h('input',{type:'text',value:d.tipo,list:'dl-tipi'});
  const dlt = h('datalist',{id:'dl-tipi'}, TIPI_PRATICA.map(t=>h('option',{value:t})));
  const comune = h('input',{type:'text',value:d.comune||(get('progetti',d.progetto_id)||{}).comune||'',placeholder:'comune'});
  prog.addEventListener('change',()=>{ if(!comune.value) comune.value = (get('progetti',prog.value)||{}).comune||''; });
  const prot = txt(d.protocollo,'numero di protocollo');
  const dep = h('input',{type:'date',value:d.data_deposito||''});
  const due = h('input',{type:'date',value:d.scadenza||''});
  const dueT = h('input',{type:'time',value:d.scadenza_ora||'','aria-label':'ora della scadenza'});
  const stato = selectOf(STATI_PRATICA.map(s=>({value:s,label:s})), d.stato);
  const note = h('textarea',{placeholder:'note (integrazioni richieste, riferimenti del tecnico comunale…)'}); note.value = d.note||'';
  const doSave = () => {
    const t = tipo.value.trim() || 'Altro';
    let st = stato.value;
    if(st==='in preparazione' && dep.value && !d.data_deposito) st = 'depositata';
    save('pratiche',{...d, progetto_id:prog.value, tipo:t, comune:comune.value.trim(), protocollo:prot.value.trim(),
      data_deposito:dep.value||null, scadenza:due.value||null, scadenza_ora: due.value && dueT.value ? dueT.value.slice(0,5) : null, stato:st, note:note.value.trim()});
    closeSheet(); if(isNew) toast('pratica aggiunta');
  };
  openSheet(h('h3',null,isNew?'nuova pratica':'pratica'),
    fld('progetto',prog),
    h('div',{class:'row2'}, fld('tipo',tipo,dlt), fld('stato',stato)),
    h('div',{class:'row2'}, fld('comune',comune), fld('protocollo',prot)),
    h('div',{class:'row2'}, fld('data di deposito',dep), fld('scadenza', h('div',{class:'due-row'}, due, dueT))),
    h('p',{style:'font-size:12px;color:var(--mute);margin:-4px 0 0'},'La scadenza è quella da tenere d’occhio: termine per le integrazioni, fine lavori, validità del titolo.'),
    fld('note',note),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'),
      isNew ? null : delBtn(()=>{ remove('pratiche',d.id); closeSheet(); })));
}

function sheetCliente(c){
  const isNew = !c;
  const d = c ? {...c} : {id:uuid(), nome:'', codice_fiscale:'', email:'', telefono:'', indirizzo:'', note:'', created_at:new Date().toISOString()};
  const nome = txt(d.nome,'nome e cognome o ragione sociale');
  const cf = txt(d.codice_fiscale,'codice fiscale o partita IVA');
  const em = txt(d.email,'email','email');
  const tel = txt(d.telefono,'telefono','tel');
  const ind = txt(d.indirizzo,'indirizzo di residenza o sede');
  const note = h('textarea',{placeholder:'note'}); note.value = d.note||'';
  const ps = list('progetti').filter(p=>p.cliente_id===d.id);
  const doSave = () => {
    const v = nome.value.trim(); if(!v){ nome.focus(); return; }
    save('clienti',{...d, nome:v, codice_fiscale:cf.value.trim(), email:em.value.trim(), telefono:tel.value.trim(), indirizzo:ind.value.trim(), note:note.value.trim()});
    closeSheet();
  };
  openSheet(h('h3',null,isNew?'nuovo cliente':'cliente'),
    fld('nome',nome), fld('codice fiscale / P.IVA',cf),
    h('div',{class:'row2'}, fld('email',em), fld('telefono',tel)),
    fld('indirizzo',ind), fld('note',note),
    ps.length ? h('div',{class:'f'},h('span',{class:'lb'},'progetti'),
      ps.map(p=>h('div',null,h('a',{href:'#scrivania/progetto/'+p.id,onclick:closeSheet,style:'font-family:var(--display);font-size:18px'},p.nome)))) : null,
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'),
      isNew ? null : delBtn(()=>{ remove('clienti',d.id); closeSheet(); }, ps.length?'I progetti restano, senza cliente.':'')));
  if(isNew) setTimeout(()=>nome.focus(),50);
}

function sheetMembro(m){
  const isNew = !m;
  const d = m ? {...m} : {id:uuid(), email:'', nome:'', ruolo:'membro', attivo:true, created_at:new Date().toISOString()};
  const em = txt(d.email,'email con cui entrerà','email');
  if(!isNew) em.disabled = true;
  const nome = txt(d.nome,'nome e cognome');
  const ruolo = selectOf([{value:'membro',label:'membro'},{value:'admin',label:'amministratore'}], d.ruolo);
  const attivo = h('input',{type:'checkbox',checked:!!d.attivo});
  const doSave = () => {
    const e = em.value.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(e)){ em.focus(); toast('Scrivi un indirizzo email valido.'); return; }
    if(d.id===me.id && (ruolo.value!=='admin' || !attivo.checked)){ toast('Non puoi togliere a te stesso il ruolo di amministratore.'); return; }
    save('membri',{...d, email:e, nome:nome.value.trim(), ruolo:ruolo.value, attivo:attivo.checked});
    closeSheet();
  };
  openSheet(h('h3',null,isNew?'aggiungi una persona':'persona'),
    fld('email',em), fld('nome',nome), fld('ruolo',ruolo),
    h('div',{class:'f'},h('label',{class:'tog'},attivo,'attivo (può entrare nel gestionale)')),
    isNew ? h('p',{style:'font-size:13px;color:#444'},'Dopo il salvataggio, mandale l’indirizzo del gestionale: entrerà con “primo accesso: crea la password” usando questa stessa email.') : null,
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva')));
}

function sheetImport(){
  const ta = h('textarea',{style:'min-height:200px;font-size:12px',placeholder:'incolla qui il testo copiato con “copia backup”'});
  const msg = h('div',{class:'confirm'});
  const go = async () => {
    let arr; try { arr = JSON.parse(ta.value); } catch(e){ msg.textContent = 'Il testo non è un backup valido.'; return; }
    if(!Array.isArray(arr)){ msg.textContent = 'Il testo non è un backup valido.'; return; }
    const pmap = {}, now = new Date().toISOString();
    const ps = arr.filter(x=>x && x.kind==='project').map(x => { const id = uuid(); pmap[x.id] = id;
      return {id, nome:String(x.name||'senza nome'), cliente_id:null, comune:'', indirizzo:'', stato:x.archived?'chiuso':'attivo', note:'',
        created_at: x.created ? new Date(x.created).toISOString() : now}; });
    const okD = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'') ? s : null;
    const as = arr.filter(x=>x && x.kind==='task').map(x => ({id:uuid(), titolo:String(x.title||'(senza titolo)'), progetto_id: pmap[x.projectId]||null,
      categoria: CATMAP[x.cat] ? x.cat : 'stu', scadenza: okD(x.due), ogni_giorno: !!x.daily, fatta: !!x.done,
      fatta_il: x.done && x.doneAt ? new Date(x.doneAt).toISOString() : null, fatta_oggi: okD(x.doneOn), in_oggi: okD(x.plannedFor),
      attesa_chi: String(x.waitWho||''), attesa_cosa: String(x.waitWhat||''), note: String(x.note||''), priorita:'media',
      assegnata_a: me.id, creata_da: me.id, created_at: x.created ? new Date(x.created).toISOString() : now}));
    if(!ps.length && !as.length){ msg.textContent = 'Nel testo non ci sono progetti né attività.'; return; }
    msg.textContent = 'Importazione in corso…';
    if(ps.length){ const r = await sb.from('progetti').insert(ps); if(r.error){ msg.textContent = 'Errore: '+errMsg(r.error); return; } }
    for(let i=0;i<as.length;i+=200){ const r = await sb.from('attivita').insert(as.slice(i,i+200)); if(r.error){ msg.textContent = 'Errore: '+errMsg(r.error); return; } }
    await loadAll(); closeSheet(); render();
    toast('Importati '+ps.length+' progetti e '+as.length+' attività');
  };
  openSheet(h('h3',null,'importa il backup'), h('div',{class:'f'},ta),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:go},'importa')), msg);
}

/* ---------------- accesso ---------------- */
function renderLogin(app, mode){
  mode = mode || 'entra';
  document.body.classList.remove('in');
  const fab = $('.fab'); if(fab) fab.remove();
  const em = txt(lsGet('email')||'','la tua email','email'); em.autocomplete='email';
  const pw = txt('','password','password'); pw.autocomplete = mode==='crea'?'new-password':'current-password';
  const msg = h('p',{class:'err'});
  const go = async e => {
    e.preventDefault(); msg.textContent='';
    const email = em.value.trim().toLowerCase(); lsSet('email',email);
    if(mode==='reset'){
      const {error} = await sb.auth.resetPasswordForEmail(email,{redirectTo: location.origin+location.pathname});
      msg.className=''; msg.textContent = error ? errMsg(error) : 'Se l’indirizzo è registrato, riceverai una email con il collegamento per scegliere una nuova password.'; return;
    }
    if(pw.value.length < 8){ msg.textContent='La password deve avere almeno 8 caratteri.'; return; }
    const r = mode==='crea' ? await sb.auth.signUp({email, password:pw.value}) : await sb.auth.signInWithPassword({email, password:pw.value});
    if(r.error){ msg.textContent = /invalid login/i.test(r.error.message) ? 'Email o password non corrette.' : errMsg(r.error); return; }
    if(mode==='crea' && !r.data.session){ msg.className=''; msg.textContent='Accesso creato: conferma dalla email che hai ricevuto, poi entra.'; }
  };
  app.innerHTML='';
  app.append(h('div',{class:'login'},
    h('h1',null,'gestionale'), h('div',{class:'day'}, CFG.nomeStudio||''),
    h('form',{onsubmit:go}, fld('email',em), mode!=='reset'?fld('password',pw):null,
      h('div',{class:'btns'}, h('button',{class:'btn pri',type:'submit'}, mode==='crea'?'crea il tuo accesso':mode==='reset'?'invia il collegamento':'entra'))),
    msg,
    h('div',{class:'qd',style:'margin-top:24px'},
      mode!=='entra'?h('button',{onclick:()=>renderLogin(app,'entra')},'ho già un accesso'):null,
      mode!=='crea'?h('button',{onclick:()=>renderLogin(app,'crea')},'primo accesso: crea la password'):null,
      mode!=='reset'?h('button',{onclick:()=>renderLogin(app,'reset')},'password dimenticata'):null)));
  capAll(app);
}
function renderNewPassword(){
  const app = $('#app'); app.innerHTML='';
  const pw = txt('','nuova password (almeno 8 caratteri)','password'); const msg = h('p',{class:'err'});
  app.append(h('div',{class:'login'}, h('h1',null,'nuova password'), h('div',{class:'day'},'scegli la password per entrare'),
    h('form',{onsubmit:async e=>{ e.preventDefault(); if(pw.value.length<8){msg.textContent='Almeno 8 caratteri.';return;}
      const {error} = await sb.auth.updateUser({password:pw.value}); if(error){msg.textContent=errMsg(error);return;}
      recovering=false; toast('password aggiornata'); start(); }}, fld('password',pw), h('div',{class:'btns'},h('button',{class:'btn pri',type:'submit'},'salva'))), msg));
}
function renderNonMembro(app){
  document.body.classList.remove('in');
  const fab = $('.fab'); if(fab) fab.remove();
  app.innerHTML='';
  app.append(h('div',{class:'login'}, h('h1',null,'gestionale'), h('div',{class:'day'},CFG.nomeStudio||''),
    h('p',null,'Sei entrato come ',h('b',null,sessionEmail),', ma questo indirizzo non è tra le persone dello studio.'),
    h('p',null,'Chiedi a un amministratore di aggiungerlo dalla sezione “studio”, poi ricarica la pagina.'),
    h('div',{class:'btns'}, h('button',{class:'btn',onclick:()=>location.reload()},'ricarica'), h('button',{class:'btn',onclick:logout},'esci'))));
  capAll(app);
}
async function logout(){ await sb.auth.signOut(); sessionEmail=''; me=null; TABLES.forEach(t=>D[t]=new Map()); if(liveCh){ sb.removeChannel(liveCh); liveCh=null; } render(); }

/* ---------------- avvio ---------------- */
let recovering = false, started = false;
async function start(){
  const {data} = await sb.auth.getSession();
  const s = data && data.session;
  sessionEmail = s && s.user && s.user.email ? s.user.email.toLowerCase() : '';
  if(!sessionEmail){ render(); return; }
  try { await loadAll(); }
  catch(e){ $('#app').innerHTML=''; $('#app').append(h('div',{class:'login'},h('h1',null,'gestionale'),h('p',{class:'err'},'Non riesco a leggere i dati: '+errMsg(e)),
    h('p',null,'Se il database è appena stato creato, controlla di aver eseguito schema.sql. Se il progetto Supabase era in pausa, riattivalo dal suo pannello.'),
    h('div',{class:'btns'},h('button',{class:'btn',onclick:()=>location.reload()},'riprova'),h('button',{class:'btn',onclick:logout},'esci')))); return; }
  me = findMe();
  if(me) goLive();
  render();
}

readHash();
if(!window.supabase || !CFG.supabaseUrl || /INSERISCI/.test(CFG.supabaseUrl + CFG.supabaseKey)){
  $('#app').innerHTML='';
  $('#app').append(h('div',{class:'login'},h('h1',null,'gestionale'),
    h('p',{class:'err'}, !window.supabase ? 'Non riesco a caricare la libreria di Supabase: controlla la connessione.' : 'Manca la configurazione: inserisci in config.js l’indirizzo e la chiave pubblica del progetto Supabase.')));
  return;
}
sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
sb.auth.onAuthStateChange((ev, session) => {
  if(ev === 'PASSWORD_RECOVERY'){ recovering = true; setTimeout(renderNewPassword, 0); return; }
  if(recovering) return;
  const em = session && session.user && session.user.email ? session.user.email.toLowerCase() : '';
  if(em !== sessionEmail || (ev === 'SIGNED_IN' && !started)){ started = true; setTimeout(start, 0); }
});
if(matchMedia('(hover: hover) and (pointer: fine)').matches){
  const cur = h('div',{class:'cur','aria-hidden':'true'}); document.body.append(cur); document.documentElement.classList.add('dot-cursor');
  let mx = 0, my = 0, tgt = null, big = false, raf = 0;
  const frame = () => { raf = 0; cur.style.transform = `translate3d(${mx}px,${my}px,0)`;
    const b = !!(tgt && tgt.closest && tgt.closest('a,button,.folder,.mp,.task .tb,.cal-d,.card,.tile,.prat'));
    if(b !== big){ big = b; cur.classList.toggle('big', b); } };
  addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; tgt = e.target; if(!cur.classList.contains('on')) cur.classList.add('on'); if(!raf) raf = requestAnimationFrame(frame); }, {passive:true});
  document.addEventListener('mouseleave', () => cur.classList.remove('on'));
}
let lastDay = today();
setInterval(() => { if(today() !== lastDay){ lastDay = today(); render(); } }, 60000);
document.addEventListener('visibilitychange', () => { if(!document.hidden && me){ loadAll().then(render).catch(()=>{}); } });
start();
})();
