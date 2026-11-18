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
const VIEWS = [['oggi','oggi'],['settimana','prossimi 7 giorni'],['progetti','progetti'],['attesa','in attesa'],
  ['pratiche','pratiche'],['clienti','clienti'],['fatte','fatte'],['studio','studio']];

/* ---------------- utilità ---------------- */
const pad = n => String(n).padStart(2,'0');
const ds = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today = () => ds(new Date());
const parse = s => { const [a,b,c] = String(s).slice(0,10).split('-').map(Number); return new Date(a,b-1,c); };
const addDays = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return ds(d); };
const diff = s => Math.round((parse(s) - parse(today())) / 864e5);
const fmtDate = s => parse(s).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
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
const catStyle = id => `--c:var(--c-${id});--ci:var(--c-${id}-ink)`;
let toastT;
function toast(msg){ let t = $('.toast'); if(!t){ t = h('div',{class:'toast'}); document.body.append(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(()=>t.remove(), 2600); }
const errMsg = e => (e && (e.message || e.error_description)) || 'errore sconosciuto';

/* ---------------- dati ---------------- */
const D = {}; TABLES.forEach(t => D[t] = new Map());
let sb = null, me = null, sessionEmail = '', syncState = '';
let scope = lsGet('scope') || 'mie';
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
const inToday = a => {
  if(a.ogni_giorno) return true;
  if(a.fatta) return false;
  const td = today();
  return (a.in_oggi && a.in_oggi <= td) || (a.scadenza && a.scadenza <= td);
};
const mine = a => scope === 'studio' || !a.assegnata_a || (me && a.assegnata_a === me.id);
const sortA = (a,b) => { const ka = (a.scadenza||'9999')+(a.created_at||''), kb = (b.scadenza||'9999')+(b.created_at||''); return ka<kb?-1:ka>kb?1:0; };
const att = () => list('attivita').filter(mine).filter(a => !catFilter || (a.categoria||'stu') === catFilter);
const praticheAperte = () => list('pratiche').filter(p => p.stato !== 'conclusa');

/* ---------------- routing ---------------- */
let route = {view:'oggi', id:null};
function readHash(){
  const hh = decodeURIComponent(location.hash.slice(1));
  const [v, id] = hh.split('/');
  if(v === 'progetto' && id) route = {view:'progetto', id};
  else route = {view: VIEWS.some(x=>x[0]===v) ? v : 'oggi', id:null};
}
addEventListener('hashchange', () => { readHash(); render(); scrollTo(0,0); });

/* ---------------- render ---------------- */
const LABEL = Object.fromEntries(VIEWS);
const NAV_GROUPS = [['agenda',['oggi','settimana','attesa']],['archivio',['progetti','pratiche','clienti']],['studio',['fatte','studio']]];
const TABS = ['oggi','settimana','progetti','pratiche'];
const ICONS = {
  oggi:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  settimana:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  attesa:'<path d="M7 3h10M7 21h10M8 3v3.5l4 5 4-5V3M8 21v-3.5l4-5 4 5V21"/>',
  progetti:'<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  pratiche:'<path d="M14 3H7.5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7.5z"/><path d="M14 3v4.5h4.5M9 13h6M9 16.5h6"/>',
  clienti:'<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.6-3.6 3.7-5.5 7.5-5.5s6.9 1.9 7.5 5.5"/>',
  fatte:'<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.6 2.6 4.9-5.4"/>',
  studio:'<circle cx="9" cy="8.5" r="3.2"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3 20c.5-3.2 2.9-5 6-5s5.5 1.8 6 5M15.6 14.3c2.6.1 4.6 1.6 5.2 4.2"/>',
  altro:'<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>'
};
function icon(n){ const s = h('span',{class:'ico','aria-hidden':'true'}); s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+ICONS[n]+'</svg>'; return s; }
let counts = {}, lateCount = 0;
function newLabel(){
  return ({clienti:'nuovo cliente', pratiche:'nuova pratica', progetti:'nuovo progetto'})[route.view]
    || (route.view==='studio' && me.ruolo==='admin' ? 'aggiungi persona' : 'nuova attività');
}
const syncText = () => syncState==='live' ? 'sincronizzato' : syncState==='off' ? 'aggiornamenti non attivi: ricarica' : 'collegamento…';
function scopeToggle(){
  return h('div',{class:'scope',title:'mostra solo le tue attività o quelle di tutto lo studio'},
    h('button',{class:scope==='mie'?'on':null,onclick:()=>{scope='mie';lsSet('scope',scope);render();}},'le mie'),
    h('button',{class:scope==='studio'?'on':null,onclick:()=>{scope='studio';lsSet('scope',scope);render();}},'tutto lo studio'));
}
function meBox(){
  return h('div',{class:'me'}, h('span',{class:'who'},iniziali(me).toUpperCase()),
    h('div',{style:'min-width:0'}, h('div',{class:'me-n'},nomeMembro(me)),
      h('div',{class:'me-r'}, me.ruolo==='admin'?'amministratore':'membro', ' · ', h('span',{class:syncState==='off'?'err':null},syncText()))));
}
function render(){
  const app = $('#app');
  if(!sb) return;
  if(!sessionEmail) return renderLogin(app);
  if(!me) return renderNonMembro(app);
  app.innerHTML = '';
  document.body.classList.add('in');
  const taskViews = ['oggi','settimana','attesa','fatte'];
  const open = att().filter(a => !isDone(a));
  lateCount = open.filter(a => !a.ogni_giorno && a.scadenza && diff(a.scadenza) < 0).length;
  counts = {
    oggi: att().filter(a => inToday(a) && !isDone(a)).length,
    settimana: open.filter(a => !a.ogni_giorno && a.scadenza && diff(a.scadenza) < 7).length + praticheAperte().filter(p=>p.scadenza && diff(p.scadenza)<7).length,
    progetti: progetti().filter(p => p.stato === 'attivo').length,
    attesa: open.filter(isWaiting).length,
    pratiche: praticheAperte().length,
    clienti: 0, fatte: 0, studio: 0
  };
  const active = route.view==='progetto' ? 'progetti' : route.view;
  const badge = id => counts[id] ? h('span',{class:'badge'+(id==='oggi'&&lateCount?' late':'')},counts[id]) : null;
  const side = h('aside',{class:'side'},
    h('a',{class:'brand',href:'#oggi'}, h('div',{class:'brand-t'},'gestionale'), h('div',{class:'brand-s'},CFG.nomeStudio||'')),
    scopeToggle(),
    h('nav',{class:'snav'}, NAV_GROUPS.map(([g,ids]) => h('div',{class:'ng'}, h('div',{class:'ng-t'},g),
      ids.map(id => h('a',{class:'nl'+(active===id?' on':''),href:'#'+id}, icon(id), h('span',{class:'nl-t'},LABEL[id]), badge(id)))))),
    h('div',{class:'side-foot'}, meBox(), h('button',{class:'link',onclick:logout},'esci')));
  let title = LABEL[route.view] || '', eyebrow = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  if(route.view==='progetto'){ const p = get('progetti',route.id); title = p ? p.nome : 'progetto'; eyebrow = h('a',{href:'#progetti'},'← progetti'); }
  const content = h('div',{class:'content'},
    h('header',{class:'top'+(route.view==='progetto'?' long':'')},
      h('div',{class:'top-t'}, h('div',{class:'eyebrow'},eyebrow), h('h1',null,title)),
      h('div',{class:'top-a'}, h('div',{class:'only-m'},scopeToggle()),
        h('button',{class:'btn pri only-d',onclick:fabAction},'+ '+newLabel()))));
  if(route.view === 'oggi') content.append(oggiStats());
  if(taskViews.includes(route.view)){
    if(route.view !== 'fatte') content.append(quickAdd());
    const lg = h('div',{class:'legend'+(catFilter?' filtered':'')});
    CATS.forEach(c => lg.append(h('button',{class:'chip'+(catFilter===c.id?' on':''),style:catStyle(c.id),
      onclick:()=>{catFilter = catFilter===c.id?null:c.id; render();}}, c.name)));
    lg.append(h('span',{class:'chip hatch',title:'le attività che aspettano qualcun altro hanno il fondo tratteggiato'},'in attesa di altri'));
    content.append(lg);
  }
  const main = h('main'); content.append(main);
  ({oggi:vOggi, settimana:vSett, progetti:vProgetti, progetto:vProgetto, attesa:vAttesa,
    pratiche:vPratiche, clienti:vClienti, fatte:vFatte, studio:vStudio})[route.view](main);
  const more = !TABS.includes(active);
  const tabbar = h('nav',{class:'tabbar'},
    TABS.map(id => h('a',{class:'tab'+(active===id?' on':''),href:'#'+id}, icon(id), h('span',null,id==='settimana'?'7 giorni':LABEL[id]),
      counts[id] ? h('span',{class:'tb-b'+(id==='oggi'&&lateCount?' late':'')},counts[id]) : null)),
    h('button',{class:'tab'+(more?' on':''),onclick:sheetAltro}, icon('altro'), h('span',null, more ? LABEL[active] : 'altro'),
      counts.attesa ? h('span',{class:'tb-b'},counts.attesa) : null));
  app.append(h('div',{class:'shell'}, side, content), tabbar);
  if(!$('.fab')) document.body.append(h('button',{class:'fab','aria-label':'nuovo',onclick:fabAction},'+'));
}
function sheetAltro(){
  openSheet(h('h3',null,'altro'),
    h('div',{class:'list'}, ['attesa','clienti','fatte','studio'].map(id => h('a',{class:'nl',href:'#'+id,onclick:closeSheet},
      icon(id), h('span',{class:'nl-t'},LABEL[id]), counts[id] ? h('span',{class:'badge'},counts[id]) : null))),
    h('div',{class:'f'}, meBox()),
    h('div',{class:'btns'}, h('button',{class:'btn',onclick:()=>{closeSheet(); logout();}},'esci'), h('button',{class:'btn',onclick:closeSheet},'chiudi')));
}
function fabAction(){
  if(route.view === 'clienti') return sheetCliente();
  if(route.view === 'pratiche') return sheetPratica();
  if(route.view === 'progetti') return sheetProgetto();
  if(route.view === 'studio') return me.ruolo==='admin' ? sheetMembro() : sheetAttivita();
  sheetAttivita(null, route.view==='progetto' ? {progetto_id: route.id} : null);
}
function quickAdd(){
  const inp = h('input',{type:'text',placeholder:'aggiungi un’attività e premi invio',enterkeyhint:'done'});
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
    fatta:false, fatta_il:null, fatta_oggi:null, in_oggi:null, attesa_chi:'', attesa_cosa:'', note:'',
    assegnata_a: me.id, creata_da: me.id, created_at: new Date().toISOString()}, p||{});
}

function section(el, title, items, opts={}){
  if(!items.length && !opts.keep) return;
  const box = h('section',{class:'grp'+(opts.late?' late':'')});
  box.append(h('h2',null, h('span',{class:'t'},title), items.length ? h('span',{class:'n'},items.length) : null, opts.acts||null));
  const lst = h('div',{class:'list'});
  if(!items.length && opts.emptyText) lst.append(h('div',{class:'empty sm'},opts.emptyText));
  items.forEach(x => lst.append(x.__pratica ? rowPratica(x.p) : (opts.row||rowAtt)(x)));
  box.append(lst); el.append(box);
}
const empty = (el, t) => el.append(h('div',{class:'empty'}, t));
const asP = p => ({__pratica:true, p, scadenza:p.scadenza, created_at:p.created_at});
function oggiStats(){
  const rest = att().filter(a=>inToday(a) && !a.ogni_giorno && !isDone(a) && !isWaiting(a));
  const prat = catFilter && catFilter!=='pa' ? [] : praticheAperte().filter(p=>p.scadenza && diff(p.scadenza)<=0);
  return h('div',{class:'stats'},
    stat('scadute', rest.filter(a=>a.scadenza && diff(a.scadenza)<0).length + prat.filter(x=>diff(x.scadenza)<0).length, {late:true}),
    stat('da fare oggi', rest.filter(a=>!(a.scadenza && diff(a.scadenza)<0)).length + att().filter(a=>a.ogni_giorno && !isDone(a)).length + prat.filter(x=>diff(x.scadenza)===0).length),
    stat('in attesa di altri', counts.attesa||0, {href:'#attesa'}),
    stat('pratiche aperte', counts.pratiche||0, {href:'#pratiche'}));
}
function stat(lab, n, opts={}){
  return h(opts.href?'a':'div',{class:'stat'+(opts.late&&n?' late':''),href:opts.href||null}, h('div',{class:'stat-n'},n), h('div',{class:'stat-l'},lab));
}

/* ----- viste ----- */
function vOggi(el){
  const all = att().filter(inToday);
  const daily = all.filter(a=>a.ogni_giorno).sort(sortA);
  const rest = all.filter(a=>!a.ogni_giorno);
  const late = rest.filter(a=>a.scadenza && diff(a.scadenza)<0 && !isWaiting(a)).sort(sortA);
  const now = rest.filter(a=>!(a.scadenza && diff(a.scadenza)<0) && !isWaiting(a)).sort(sortA);
  const wait = rest.filter(isWaiting).sort(sortA);
  const prat = catFilter && catFilter!=='pa' ? [] : praticheAperte().filter(p=>p.scadenza && diff(p.scadenza)<=0).sort(sortA).map(asP);
  const doneToday = att().filter(a=>!a.ogni_giorno && a.fatta && a.fatta_il && ds(new Date(a.fatta_il))===today());
  if(!all.length && !prat.length && !doneToday.length) return empty(el,'Niente in programma per oggi. Dalle altre liste puoi mettere in programma le attività di oggi.');
  section(el,'scadute',late,{late:true});
  section(el,'pratiche in scadenza',prat,{late:prat.some(x=>diff(x.scadenza)<0)});
  section(el,'da fare oggi',now);
  section(el,'ogni giorno',daily);
  section(el,'in scadenza, ma in attesa di altri',wait);
  section(el,'fatte oggi',doneToday);
}
function vSett(el){
  const a = att().filter(x=>!x.ogni_giorno && !isDone(x) && x.scadenza && diff(x.scadenza)<7);
  const p = (catFilter && catFilter!=='pa') ? [] : praticheAperte().filter(x=>x.scadenza && diff(x.scadenza)<7).map(asP);
  const items = a.concat(p).sort(sortA);
  if(!items.length) return empty(el,'Nessuna scadenza nei prossimi sette giorni.');
  section(el,'scadute',items.filter(x=>diff(x.scadenza)<0),{late:true});
  for(let i=0;i<7;i++){
    const d = addDays(today(),i);
    const lab = i===0?'oggi':i===1?'domani':parse(d).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'short'});
    section(el,lab,items.filter(x=>x.scadenza===d));
  }
}
function vProgetti(el){
  const all = progetti();
  if(all.some(p=>p.stato==='chiuso')) el.append(h('div',{class:'toolbar'},
    h('button',{class:'link',onclick:()=>{showClosed=!showClosed;render();}}, showClosed?'nascondi i chiusi':'mostra i chiusi')));
  if(!all.length) return empty(el,'Ancora nessun progetto. Creane uno con il pulsante +.');
  STATI_PROGETTO.forEach(st => {
    if(st==='chiuso' && !showClosed) return;
    const ps = all.filter(p=>p.stato===st);
    if(!ps.length) return;
    el.append(h('section',{class:'grp'},
      h('h2',null,h('span',{class:'t'}, st==='attivo'?'in corso':st==='in pausa'?'in pausa':'chiusi'), h('span',{class:'n'},ps.length)),
      h('div',{class:'grid'}, ps.map(cardProgetto))));
  });
  const orfane = att().filter(a=>!isDone(a) && (!a.progetto_id || !get('progetti',a.progetto_id))).sort(sortA);
  section(el,'attività senza progetto',orfane);
}
function cardProgetto(p){
  const cl = get('clienti',p.cliente_id);
  const aperte = list('attivita').filter(a=>a.progetto_id===p.id && !isDone(a));
  const prat = list('pratiche').filter(x=>x.progetto_id===p.id && x.stato!=='conclusa');
  const prox = aperte.concat(prat).map(x=>x.scadenza).filter(Boolean).sort()[0];
  const cats = [...new Set(aperte.map(a=>CATMAP[a.categoria]?a.categoria:'stu'))];
  return h('a',{class:'tile'+(p.stato!=='attivo'?' dim':''),href:'#progetto/'+p.id},
    h('div',{class:'tile-top'}, h('div',{class:'nm'},p.nome),
      h('div',{class:'sub'}, [cl&&cl.nome, p.comune].filter(Boolean).join(' · ') || ' ')),
    h('div',{class:'dots'}, cats.map(c => h('span',{class:'dot',style:catStyle(c),title:CATMAP[c].name}))),
    h('div',{class:'tile-foot'},
      h('span',null,h('b',null,aperte.length),' attività'), h('span',null,h('b',null,prat.length), prat.length===1?' pratica':' pratiche'),
      prox ? h('span',{class:'due'+(diff(prox)<0?' late-t':'')}, dueLabel(prox)) : null));
}
function vProgetto(el){
  const p = get('progetti', route.id);
  if(!p) return empty(el,'Progetto non trovato: forse è stato eliminato.');
  const cl = get('clienti',p.cliente_id);
  const kv = (k,v) => v ? h('div',{class:'kv'}, h('div',{class:'k'},k), h('div',{class:'v'},v)) : null;
  el.append(h('div',{class:'phead'},
    h('div',{class:'kvs'},
      kv('cliente', cl ? h('a',{href:'#',onclick:e=>{e.preventDefault();sheetCliente(cl);}},cl.nome) : null),
      kv('comune', p.comune), kv('indirizzo', p.indirizzo),
      kv('telefono', cl && cl.telefono ? h('a',{href:'tel:'+cl.telefono.replace(/\s/g,'')},cl.telefono) : null),
      kv('stato', h('span',{class:'pill st-'+p.stato.replace(' ','-')},p.stato))),
    p.note ? h('div',{class:'note'},p.note) : null,
    h('div',{class:'btns'}, h('button',{class:'btn sm',onclick:()=>sheetProgetto(p)},'modifica progetto'))));
  const prat = list('pratiche').filter(x=>x.progetto_id===p.id).sort(sortA);
  section(el,'pratiche',prat.filter(x=>x.stato!=='conclusa').map(asP),{keep:true,emptyText:'nessuna pratica aperta',
    acts:h('span',{class:'acts'},h('button',{onclick:()=>sheetPratica(null,{progetto_id:p.id, comune:p.comune})},'+ pratica'))});
  section(el,'pratiche concluse',prat.filter(x=>x.stato==='conclusa').map(asP));
  const a = list('attivita').filter(x=>x.progetto_id===p.id).filter(x=>!catFilter||(x.categoria||'stu')===catFilter);
  section(el,'da fare',a.filter(x=>!isDone(x)&&!isWaiting(x)).sort(sortA),{keep:true,emptyText:'nessuna attività aperta',
    acts:h('span',{class:'acts'},h('button',{onclick:()=>sheetAttivita(null,{progetto_id:p.id})},'+ attività'))});
  section(el,'in attesa di altri',a.filter(isWaiting).sort(sortA));
  section(el,'fatte',a.filter(x=>x.fatta).sort((x,y)=>cmpIt(y.fatta_il,x.fatta_il)).slice(0,30));
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
    h('button',{class:'link',onclick:()=>{showConcluse=!showConcluse;render();}}, showConcluse?'nascondi le concluse':'mostra le concluse')));
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
        h('div',{style:'min-width:0;flex:1'}, h('div',{class:'nm'},c.nome), h('div',{class:'sub'},[c.telefono,c.email,c.codice_fiscale].filter(Boolean).join(' · ')||' ')),
        h('div',{class:'cnt'}, ps.length ? h('span',null,h('b',null,ps.length), ps.length===1?' progetto':' progetti') : null));
    })));
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
  el.append(h('section',{class:'grp'}, h('h2',null,h('span',{class:'t'},'persone dello studio'), h('span',{class:'n'},membri().length)),
    h('div',{class:'list'}, membri().map(m => h('div',{class:'card',onclick:admin?()=>sheetMembro(m):null,style:admin?null:'cursor:default'},
      h('span',{class:'who lg'},iniziali(m).toUpperCase()),
      h('div',{style:'min-width:0;flex:1'}, h('div',{class:'nm'},nomeMembro(m)), h('div',{class:'sub'},m.email)),
      h('div',{class:'cnt'}, h('span',{class:'pill'+(m.ruolo==='admin'?' dark':'')}, m.ruolo==='admin'?'amministratore':'membro'), m.attivo?'':' · disattivato'))))));
  if(!admin) el.append(h('p',{class:'hint'},'Solo un amministratore può aggiungere persone.'));
  el.append(h('section',{class:'grp'}, h('h2',null,h('span',{class:'t'},'importa dall’app “cose da fare”')),
    h('div',{class:'panel'},
      h('p',null,'Nell’app su Claude premi “copia backup”, poi incolla qui il testo. Progetti e attività vengono aggiunti a quelli già presenti e assegnati a te.'),
      h('button',{class:'btn',onclick:sheetImport},'incolla il backup'))));
}

/* ----- righe ----- */
function rowAtt(a){
  const done = isDone(a), wait = isWaiting(a), cat = CATMAP[a.categoria] ? a.categoria : 'stu';
  const meta = h('div',{class:'meta'});
  const p = get('progetti',a.progetto_id);
  if(p && route.view !== 'progetto') meta.append(h('a',{class:'prj',href:'#progetto/'+p.id,onclick:e=>e.stopPropagation()},p.nome));
  meta.append(h('span',{class:'cat'},CATMAP[cat].name));
  if(a.ogni_giorno) meta.append(h('span',null,'ogni giorno'));
  else if(a.scadenza && !done){ const n = diff(a.scadenza); meta.append(h('span',{class:n<0?'late':n===0?'today':null},dueLabel(a.scadenza))); }
  if(!a.ogni_giorno && !done && a.in_oggi && a.in_oggi<=today() && route.view!=='oggi') meta.append(h('span',null,'in programma oggi'));
  if(a.note) meta.append(h('span',null,'· nota'));
  const body = h('div',{class:'tb',onclick:()=>sheetAttivita(a)}, h('div',{class:'tt'},a.titolo||'(senza titolo)'), meta);
  if(wait) body.append(h('div',{class:'waitline'},
    h('span',null,'aspetti ',h('b',null,a.attesa_chi||'qualcuno'), a.attesa_cosa?' — '+a.attesa_cosa:''),
    h('button',{onclick:e=>{e.stopPropagation(); save('attivita',{...a,attesa_chi:'',attesa_cosa:''}); toast('sbloccata: ora tocca a voi');}},'sbloccata')));
  const who = get('membri',a.assegnata_a);
  const showWho = who && (scope==='studio' || who.id!==me.id);
  return h('div',{class:'task'+(done?' done':'')+(wait?' wait':''),style:catStyle(cat)},
    h('button',{class:'chk','aria-label':done?'segna da fare':'segna fatta',onclick:()=>toggle(a)}), body,
    showWho ? h('div',{class:'who',title:nomeMembro(who)},iniziali(who).toUpperCase()) : null);
}
function toggle(a){
  if(a.ogni_giorno) save('attivita',{...a, fatta_oggi: isDone(a) ? null : today()});
  else save('attivita',{...a, fatta: !a.fatta, fatta_il: !a.fatta ? new Date().toISOString() : null});
}
function rowPratica(p){
  const pr = get('progetti',p.progetto_id);
  const meta = h('div',{class:'meta'});
  if(pr && route.view!=='progetto') meta.append(h('a',{class:'prj',href:'#progetto/'+pr.id,onclick:e=>e.stopPropagation()},pr.nome));
  if(p.comune) meta.append(h('span',null,p.comune));
  meta.append(h('span',{class:p.stato==='integrazioni richieste'?'late':'cat'},p.stato));
  if(p.data_deposito) meta.append(h('span',null,'depositata il '+fmtDate(p.data_deposito)));
  if(p.scadenza && p.stato!=='conclusa'){ const n=diff(p.scadenza); meta.append(h('span',{class:n<0?'late':n===0?'today':null},dueLabel(p.scadenza))); }
  return h('div',{class:'task'+(p.stato==='conclusa'?' done':''),style:catStyle('pa')},
    h('div',{class:'doc','aria-hidden':'true'}),
    h('div',{class:'tb',onclick:()=>sheetPratica(p)}, h('div',{class:'tt'}, p.tipo + (p.protocollo?' — prot. '+p.protocollo:'')), meta));
}

/* ---------------- schede (moduli) ---------------- */
const ov = $('#ov'), sheet = $('#sheet');
function closeSheet(){ ov.hidden = true; sheet.innerHTML = ''; }
ov.addEventListener('click', e => { if(e.target === ov) closeSheet(); });
addEventListener('keydown', e => { if(e.key === 'Escape' && !ov.hidden) closeSheet(); });
function openSheet(...kids){ sheet.innerHTML=''; sheet.append(...kids.flat().filter(Boolean)); ov.hidden=false; sheet.scrollTop=0; }
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

function sheetAttivita(a, preset){
  const isNew = !a;
  const d = a ? {...a} : nuovaAttivita(Object.assign({in_oggi: route.view==='oggi'?today():null}, preset||{}));
  const title = txt(d.titolo,'che cosa c’è da fare');
  let cat = CATMAP[d.categoria] ? d.categoria : 'stu';
  const cats = h('div',{class:'cats'});
  const drawCats = () => { cats.innerHTML=''; CATS.forEach(c => cats.append(h('span',{class:'chip'+(c.id===cat?' on':''),style:catStyle(c.id),onclick:()=>{cat=c.id;drawCats();}},c.name))); };
  drawCats();
  const prog = selectOf(progetti().filter(p=>p.stato!=='chiuso'||p.id===d.progetto_id).map(p=>({value:p.id,label:p.nome})), d.progetto_id, '— nessun progetto —');
  const chi = selectOf(membri().filter(m=>m.attivo||m.id===d.assegnata_a).map(m=>({value:m.id,label:nomeMembro(m)+(m.id===me.id?' (tu)':'')})), d.assegnata_a, '— chiunque —');
  const due = h('input',{type:'date',value:d.scadenza||''});
  const daily = h('input',{type:'checkbox',checked:!!d.ogni_giorno});
  const planned = h('input',{type:'checkbox',checked:!!(d.in_oggi && d.in_oggi<=today())});
  const wchi = h('input',{type:'text',value:d.attesa_chi||'',placeholder:'chi (Comune, cliente, impresa, collega…)',list:'dl-chi'});
  const wcosa = txt(d.attesa_cosa,'che cosa (parere, rilievo, preventivo…)');
  const dl = h('datalist',{id:'dl-chi'},[...new Set(list('attivita').map(x=>x.attesa_chi).filter(Boolean))].sort(cmpIt).map(w=>h('option',{value:w})));
  const note = h('textarea',{placeholder:'note'}); note.value = d.note||'';
  const doSave = () => {
    const v = title.value.trim(); if(!v){ title.focus(); return; }
    lastCat = cat; lsSet('cat',cat);
    const td = today();
    save('attivita',{...d, titolo:v, categoria:cat, progetto_id:prog.value||null, assegnata_a:chi.value||null,
      scadenza:due.value||null, ogni_giorno:daily.checked,
      in_oggi: planned.checked ? (d.in_oggi && d.in_oggi<=td ? d.in_oggi : td) : null,
      attesa_chi:wchi.value.trim(), attesa_cosa:wcosa.value.trim(), note:note.value.trim()});
    closeSheet(); if(isNew) toast('aggiunta');
  };
  title.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); doSave(); } });
  openSheet(h('h3',null,isNew?'nuova attività':'attività'),
    h('div',{class:'f'},title),
    h('div',{class:'f'},h('span',{class:'lb'},'tipo di attività'),cats),
    h('div',{class:'row2'}, fld('progetto',prog), fld('chi la fa',chi)),
    fld('scadenza', due, h('div',{class:'qd'},
      h('button',{type:'button',onclick:()=>due.value=today()},'oggi'),
      h('button',{type:'button',onclick:()=>due.value=addDays(today(),1)},'domani'),
      h('button',{type:'button',onclick:()=>due.value=addDays(today(),7)},'tra una settimana'),
      h('button',{type:'button',onclick:()=>due.value=''},'nessuna'))),
    h('div',{class:'f'}, h('label',{class:'tog'},planned,'da fare oggi'), h('label',{class:'tog'},daily,'ogni giorno (torna da fare ogni mattina)')),
    h('div',{class:'f waitbox'}, h('span',{class:'lb'},'prima bisogna aspettare che…'), wchi, dl, h('div',{style:'height:6px'}), wcosa),
    h('div',{class:'f'},note),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'), h('button',{class:'btn',onclick:closeSheet},'annulla'),
      isNew ? null : delBtn(()=>{ remove('attivita',d.id); closeSheet(); toast('eliminata'); })));
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
    closeSheet(); if(isNew && r) location.hash = '#progetto/'+r.id;
  };
  openSheet(h('h3',null,isNew?'nuovo progetto':'progetto'),
    fld('nome',nome), fld('cliente',cli,nuovoCli),
    h('div',{class:'row2'}, fld('comune',comune,dlc), fld('stato',stato)),
    fld('indirizzo',ind), fld('note',note),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'), h('button',{class:'btn',onclick:closeSheet},'annulla'),
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
  const stato = selectOf(STATI_PRATICA.map(s=>({value:s,label:s})), d.stato);
  const note = h('textarea',{placeholder:'note (integrazioni richieste, riferimenti del tecnico comunale…)'}); note.value = d.note||'';
  const doSave = () => {
    const t = tipo.value.trim() || 'Altro';
    let st = stato.value;
    if(st==='in preparazione' && dep.value && !d.data_deposito) st = 'depositata';
    save('pratiche',{...d, progetto_id:prog.value, tipo:t, comune:comune.value.trim(), protocollo:prot.value.trim(),
      data_deposito:dep.value||null, scadenza:due.value||null, stato:st, note:note.value.trim()});
    closeSheet(); if(isNew) toast('pratica aggiunta');
  };
  openSheet(h('h3',null,isNew?'nuova pratica':'pratica'),
    fld('progetto',prog),
    h('div',{class:'row2'}, fld('tipo',tipo,dlt), fld('stato',stato)),
    h('div',{class:'row2'}, fld('comune',comune), fld('protocollo',prot)),
    h('div',{class:'row2'}, fld('data di deposito',dep), fld('scadenza',due)),
    h('p',{style:'font-size:12px;color:var(--mute);margin:-4px 0 0'},'La scadenza è quella da tenere d’occhio: termine per le integrazioni, fine lavori, validità del titolo.'),
    fld('note',note),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'), h('button',{class:'btn',onclick:closeSheet},'annulla'),
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
      ps.map(p=>h('div',null,h('a',{href:'#progetto/'+p.id,onclick:closeSheet,style:'font-family:var(--serif);font-size:18px'},p.nome)))) : null,
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'), h('button',{class:'btn',onclick:closeSheet},'annulla'),
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
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:doSave},'salva'), h('button',{class:'btn',onclick:closeSheet},'annulla')));
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
      attesa_chi: String(x.waitWho||''), attesa_cosa: String(x.waitWhat||''), note: String(x.note||''),
      assegnata_a: me.id, creata_da: me.id, created_at: x.created ? new Date(x.created).toISOString() : now}));
    if(!ps.length && !as.length){ msg.textContent = 'Nel testo non ci sono progetti né attività.'; return; }
    msg.textContent = 'Importazione in corso…';
    if(ps.length){ const r = await sb.from('progetti').insert(ps); if(r.error){ msg.textContent = 'Errore: '+errMsg(r.error); return; } }
    for(let i=0;i<as.length;i+=200){ const r = await sb.from('attivita').insert(as.slice(i,i+200)); if(r.error){ msg.textContent = 'Errore: '+errMsg(r.error); return; } }
    await loadAll(); closeSheet(); render();
    toast('Importati '+ps.length+' progetti e '+as.length+' attività');
  };
  openSheet(h('h3',null,'importa il backup'), h('div',{class:'f'},ta),
    h('div',{class:'btns'}, h('button',{class:'btn pri',onclick:go},'importa'), h('button',{class:'btn',onclick:closeSheet},'annulla')), msg);
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
let lastDay = today();
setInterval(() => { if(today() !== lastDay){ lastDay = today(); render(); } }, 60000);
document.addEventListener('visibilitychange', () => { if(!document.hidden && me){ loadAll().then(render).catch(()=>{}); } });
start();
})();
