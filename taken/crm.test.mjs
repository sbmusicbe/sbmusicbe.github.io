import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const crm=readFileSync(new URL('./crm.js',import.meta.url),'utf8');
const usability=readFileSync(new URL('./usability.js',import.meta.url),'utf8');
const section=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
function runtime() {
  const ctx=vm.createContext({console,structuredClone,setTimeout,clearTimeout});
  vm.runInContext(`
    ${section('const VAULT =','const I =')}
    ${section('const esc =','const escRe =')}
    const pad=n=>String(n).padStart(2,'0');
    const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const parseYmd=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
    const addDays=(s,n)=>{const d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d);};
    const today=()=> '2026-10-13'; const now=()=>new Date('2026-10-13T12:00:00').getTime();
    const daysBetween=(a,b)=>Math.round((parseYmd(b)-parseYmd(a))/864e5);
    let sequence=0;const uid=()=> 'new-'+(++sequence);
    let data=null;
    ${section('const DEFAULT_FIELDS =','const proj =')}
    ${section('const proj =','/* Functies die')}
    ${section('const isWinStage =','function syncWins(')}
    ${section('function setStage(','function undoFor(')}
    ${section('const CALC_FORMATS =','function renderCalc(')}
    const projArchived=id=>!!data.projects.find(p=>p.id===id)?.finished;
    const commentsOf=id=>data.comments.filter(x=>x.taskId===id);
    const round2=n=>Math.round(n*100)/100,cap=s=>s[0].toUpperCase()+s.slice(1);
    const eur=n=>'€ '+n.toLocaleString('nl-BE',{minimumFractionDigits:2,maximumFractionDigits:2});
    const monthTitle=m=>m;
    const salesCols=()=>data.salesCols;
    const dueLabel=s=>s,stamp=n=>ymd(new Date(n));
    const fmtDateInp=s=>s?s.split('-').reverse().join('/'):'';
    const I={trash:'x'};
    const commentDrafts={},pendingImgs={},pendingHtml=()=>'',imgsHtml=()=>'';
    let undo=null;const commit=()=>{};const toast=(m,fn)=>{undo=fn;};
    ${crm}
    let view={type:'all'},searchQ='';const viewKey=()=>view.type==='project'?'p:'+view.id:view.type;
    ${section('function optOf(', '/* ---------------- Task list') }
    ${section('function viewTasks(', '// Opmerkingen staan')}
    ${section('function matchSearch(', '// Bij een actieve sortering')}
    ${section('function sortFn(', "// '', 'today'")}
    ${usability}
    data=newData();data.projects.push({id:'p',name:'Project P'},{id:'q',name:'Project Q'},{id:'finished',name:'Afgewerkt',finished:true});
    data.stages.push({id:'other',label:'Andere',done:false});
    const makeTask=(id,values={})=>({id,title:id,projectId:'p',stage:'other',done:false,custom:{},createdAt:parseYmd('2026-09-01').getTime(),...values});
  `,ctx);
  return code=>vm.runInContext(code,ctx);
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('next actions require a real date and supported type; clearing does not complete a deal',()=>{
  const r=runtime();r("data.tasks=[makeTask('a')]");
  assert.throws(()=>r("crmSetNextAction(data.tasks[0],{type:'call',date:'2026-02-30'})"),/geldige datum/);
  assert.throws(()=>r("crmSetNextAction(data.tasks[0],{type:'invalid',date:'2026-10-14'})"));
  r("crmSetNextAction(data.tasks[0],{type:'call',date:'2026-10-14',note:' bellen '})");
  assert.deepEqual(plain(r('data.tasks[0].nextAction')),{type:'call',date:'2026-10-14',note:'bellen'});
  r('crmSetNextAction(data.tasks[0],null)');assert.equal(r('data.tasks[0].done'),false);
});

test('today separates overdue actions, today actions, deadlines and unplanned quotes',()=>{
  const r=runtime();r(`data.tasks=[makeTask('overdue',{nextAction:{type:'call',date:'2026-10-12'}}),makeTask('today',{nextAction:{type:'email',date:today()},due:today()}),makeTask('future',{due:'2026-10-14',nextAction:{type:'quote',date:'2026-10-14'},stage:'mail'}),makeTask('quote',{stage:'mail'}),makeTask('done',{done:true,due:today()}),makeTask('archived',{projectId:'finished',due:today()})]`);
  const g=plain(r('crmDayGroups()'));
  assert.deepEqual(g.overdue.map(t=>t.id),['overdue']);assert.deepEqual(g.actions.map(t=>t.id),['today']);
  assert.deepEqual(g.deadlines.map(t=>t.id),['today']);assert.deepEqual(g.quotes.map(t=>t.id),['quote']);
  assert.deepEqual(g.unplanned.map(t=>t.id),['quote']);
});

test('callback and mail follow their deadline, ignoring a separate old action date',()=>{
  const r=runtime();r(`data.tasks=[makeTask('call',{stage:'callback',due:today(),nextAction:{type:'call',date:'2026-11-01'}}),makeTask('quote',{stage:'mail',due:'2026-10-12',nextAction:{type:'email',date:'2026-11-01'}})]`);
  assert.equal(r('crmEffectiveAction(data.tasks[0]).date'),r('today()'));
  assert.equal(r('crmEffectiveAction(data.tasks[1]).type'),'quote');
  assert.deepEqual(plain(r('crmDayGroups().actions.map(t=>t.id)')),['call']);
  assert.deepEqual(plain(r('crmDayGroups().overdue.map(t=>t.id)')),['quote']);
  assert.equal(r('crmDayGroups().deadlines.length'),0);
  r("data.tasks[0].due='2026-10-20'");assert.equal(r('crmDayGroups().actions.length'),0);
  r("data.tasks[0].due=null");assert.equal(r('crmEffectiveAction(data.tasks[0])'),null);
});

test('contact logging validates before mutating; saves outcome and subsequent action',()=>{
  const r=runtime();r("data.tasks=[makeTask('a')]");
  assert.throws(()=>r("crmAddContact(data.tasks[0],{type:'call',at:now(),outcome:'Ja'},{type:'call',date:'bad'})"));
  assert.equal(r('data.activities.length'),0);assert.equal(r('data.tasks[0].nextAction'),undefined);
  assert.throws(()=>r("crmAddContact(data.tasks[0],{type:'call',at:now(),text:'',outcome:''})"));
  r("crmAddContact(data.tasks[0],{type:'call',at:now(),outcome:'Interesse',text:'Offerte gevraagd'},{type:'quote',date:'2026-10-14'})");
  assert.equal(r('data.activities[0].outcome'),'Interesse');assert.equal(r('data.activities[0].nextAction.type'),'quote');
  assert.equal(r('data.tasks[0].nextAction.date'),'2026-10-14');
});

test('completed action gets a contact record; undo preserves a newer follow-up',()=>{
  const r=runtime();r("data.tasks=[makeTask('a',{nextAction:{type:'email',date:today(),note:'Offerte'}})];crmCompleteAction(data.tasks[0])");
  assert.equal(r('data.tasks[0].nextAction'),null);assert.equal(r('data.activities.length'),1);
  r("crmSetNextAction(data.tasks[0],{type:'call',date:'2026-10-15'});undo()");
  assert.equal(r('data.activities.length'),0);assert.equal(r('data.tasks[0].nextAction.date'),'2026-10-15');
  assert.ok(r('Object.keys(data.deleted).length'));
});

test('parallel contact histories merge as independent items and respect deletions',()=>{
  const r=runtime();r("let a=newData(),b=newData();a.activities=[{id:'a',taskId:'t',u:now(),at:now()}];b.activities=[{id:'b',taskId:'t',u:now(),at:now()}]");
  assert.equal(r('merge(a,b).activities.length'),2);
  r("b.deleted.a=now()");assert.deepEqual(plain(r('merge(a,b).activities.map(x=>x.id)')),['b']);
  r('delete b.activities');assert.equal(r('merge(a,b).activities.length'),0);
});

test('old backups normalize without losing deals or inventing contact history',()=>{
  const r=runtime();r("let old={tasks:[makeTask('old')],projects:[],fields:[]};normalize(old)");
  assert.equal(r('old.tasks.length'),1);assert.equal(r('old.activities.length'),0);
});

test('duplicate detection normalizes company, e-mail and Belgian phone numbers across projects',()=>{
  const r=runtime();r(`data.tasks=[makeTask('a',{title:'Café Martin',custom:{'f-email':'TEST@EXAMPLE.BE','f-telefoon':'0471 12 34 56'}}),makeTask('b',{title:'Cafe Martin',projectId:'q',custom:{'f-email':'test@example.be','f-telefoon':'+32 471 12 34 56'}}),makeTask('c',{title:'Other',custom:{'f-telefoon':'123'}})]`);
  const d=plain(r('crmDuplicates(data.tasks[0])'));assert.equal(d.length,1);assert.equal(d[0].task.id,'b');
  assert.deepEqual(d[0].reasons,['e-mailadres','telefoonnummer','bedrijfsnaam']);
  assert.equal(r('data.tasks.length'),3);
});

test('default placeholder titles are not treated as duplicate companies',()=>{
  const r=runtime();r("data.tasks=[makeTask('a',{title:'Nieuwe deal'}),makeTask('b',{title:'Nieuwe deal'})]");
  assert.equal(r('crmDuplicates(data.tasks[0]).length'),0);
});

test('sales report handles month/project filters, decimals, refunds and missing prices',()=>{
  const r=runtime();r(`data.salesPages=[{id:'oct',month:'2026-10'},{id:'sep',month:'2026-09'}];data.sales=[{id:'one',pageId:'oct',projectId:'p',values:{sc_amount:1234.56}},{id:'refund',pageId:'oct',projectId:'p',values:{sc_amount:-34.56}},{id:'unknown',pageId:'oct',values:{}},{id:'sep',pageId:'sep',projectId:'p',values:{sc_amount:999}}]`);
  assert.equal(r("crmSalesReport('2026-10','').revenue"),1200);
  assert.equal(r("crmSalesReport('2026-10','').average"),600);
  assert.equal(r("crmSalesReport('2026-10','').missing"),1);
  assert.equal(r("crmSalesReport('2026-10','p').count"),2);
  assert.equal(r("crmSalesReport('','p').revenue"),2199);
  assert.equal(r("crmSalesReport('2026-10','q').count"),0);
});

test('legacy linked sales can be attributed and a manual empty project is respected',()=>{
  const r=runtime();r(`data.tasks=[makeTask('deal')];data.salesPages=[{id:'oct',month:'2026-10'}];data.sales=[{id:'w_deal',pageId:'oct',values:{sc_amount:100}}]`);
  assert.equal(r("crmSalesReport('2026-10','p').count"),1);
  r("data.sales[0].projectId=''");assert.equal(r("crmSalesReport('2026-10','p').count"),0);
});

test('conversion and loss reasons use completion month rather than all open deals',()=>{
  const r=runtime();r(`data.tasks=[makeTask('won',{stage:'positive',done:true,doneAt:parseYmd('2026-10-10').getTime()}),makeTask('lost',{stage:'negative',done:true,doneAt:parseYmd('2026-10-11').getTime(),lostReason:'Prijs'}),makeTask('old',{stage:'negative',done:true,doneAt:parseYmd('2026-09-10').getTime()}),makeTask('open')]`);
  assert.equal(r("crmSalesReport('2026-10','').conversion"),50);
  assert.equal(r("crmSalesReport('2026-10','').reasons.get('Prijs')"),1);
  assert.equal(r("crmSalesReport('2026-10','').lost"),1);
});

test('switching a completed deal to another outcome updates its completion date',()=>{
  const r=runtime();r("data.tasks=[makeTask('deal',{stage:'negative',done:true,doneAt:parseYmd('2026-09-10').getTime()})];setStage(data.tasks[0],'positive')");
  assert.equal(r('data.tasks[0].doneAt'),r('now()'));
  assert.equal(r("crmSalesReport('2026-10','').won"),1);
});

test('discount scales minimum per format and never undercuts it',()=>{
  const r=runtime();const result=plain(r("calcNegotiation({target:'9700',current:'2505',pk:'26.5',minPrice:'250',discount:'20'})"));
  const eighth=result.rows.find(x=>x.format==='1/8');assert.equal(eighth.base,272);assert.equal(eighth.minimum,250);assert.equal(eighth.offer,250);assert.equal(eighth.limited,true);
  const full=result.rows[0];assert.equal(full.minimum,2000);assert.equal(full.offer,2000);
  assert.ok(result.rows.every(x=>x.offer>=x.minimum && x.room>=0));
});

test('invalid discount and minimum return errors; absent settings preserve base prices',()=>{
  const r=runtime();
  for(const settings of ["minPrice:'-1'","discount:'101'","discount:'abc'"])assert.ok(r(`calcNegotiation({target:'1000',current:'0',pk:'10',${settings}}).error`));
  assert.equal(r("calcNegotiation({target:'1000',current:'0',pk:'10'}).configured"),false);
  assert.equal(r("calcNegotiation({target:'1000',current:'0',pk:'10'}).rows[3].offer"),100);
  assert.equal(r("calcNegotiation({target:'',pk:''}).rows[0].offer"),null);
});

test('copy and print show the same prices without the removed duplicate block',()=>{
  const r=runtime();r("let p={name:'<Project>',calc:{target:'1000',current:'0',pk:'10',minPrice:'90',discount:'20'}}");
  assert.doesNotMatch(r('calcPrintHtml(p)'),/Minimumprijs en korting/);assert.match(r('calcPrintHtml(p)'),/&lt;Project&gt;/);
  assert.doesNotMatch(r('calcText(p.calc)'),/minimum toegepast|Minimum per|Korting/);assert.match(r('calcText(p.calc)'),/1\/8 - 100/);
});

test('dashboard CSV escapes spreadsheet formulas and quotes',()=>{
  const r=runtime();assert.equal(r("crmCsvCell('=HYPERLINK(\"bad\")')"),'"\'=HYPERLINK(""bad"")"');
  assert.equal(r("crmCsvCell('normaal;bedrijf')"),'"normaal;bedrijf"');
});

test('custom column labels map to deadline follow-up without relying on fixed ids',()=>{
  const r=runtime();r("data.stages.push({id:'customcall',label:'Terugbellen',done:false},{id:'custommail',label:'Antwoord op mail',done:false});data.tasks=[makeTask('a',{stage:'customcall',due:today()}),makeTask('b',{stage:'custommail',due:today()})]");
  assert.equal(r('crmEffectiveAction(data.tasks[0]).type'),'call');assert.equal(r('crmEffectiveAction(data.tasks[1]).type'),'quote');
  r("crmSetNextAction(data.tasks[1],{type:'call',date:'2026-10-16'})");assert.equal(r('data.tasks[1].due'),'2026-10-16');assert.equal(r('crmEffectiveAction(data.tasks[1]).type'),'quote');
});

test('completing linked follow-up clears deadline and undo restores deadline and time',()=>{
  const r=runtime();r("data.tasks=[makeTask('a',{stage:'callback',due:today(),time:'14:30'})];crmCompleteAction(data.tasks[0])");
  assert.equal(r('data.tasks[0].due'),null);assert.equal(r('data.tasks[0].time'),null);assert.equal(r('data.tasks[0].done'),false);
  r('undo()');assert.equal(r('data.tasks[0].due'),r('today()'));assert.equal(r('data.tasks[0].time'),'14:30');
  assert.equal(r("data.tasks[0].custom['f-eerste-contact']"),'');
});

test('first contact field appears in follow-up history without inventing a contact channel',()=>{
  const r=runtime();r("data.tasks=[makeTask('a',{custom:{'f-eerste-contact':'2026-09-10'}})]");
  assert.equal(r('crmFirstContact(data.tasks[0]).date'),'2026-09-10');
  const html=r('crmDetailHtml(data.tasks[0])');assert.match(html,/Eerste contactname/);assert.match(html,/10\/09\/2026/);
  assert.equal(r('data.activities.length'),0);
});

test('logging contacts fills the first-contact field and preserves an earlier known first contact',()=>{
  const r=runtime();r("data.tasks=[makeTask('a')];crmAddContact(data.tasks[0],{type:'call',at:now(),outcome:'Gesproken'})");
  assert.equal(r("data.tasks[0].custom['f-eerste-contact']"),r('today()'));
  r("crmAddContact(data.tasks[0],{type:'email',at:parseYmd('2026-09-10').getTime(),outcome:'Eerste mail'})");
  assert.equal(r("data.tasks[0].custom['f-eerste-contact']"),'2026-09-10');
  r("crmAddContact(data.tasks[0],{type:'call',at:now(),outcome:'Opnieuw gebeld'})");
  assert.equal(r("data.tasks[0].custom['f-eerste-contact']"),'2026-09-10');
});

test('Focus shows one deadline editor and a single main contact action',()=>{
  const r=runtime();r("data.tasks=[makeTask('a',{stage:'mail',due:today(),time:'09:00'})]");
  const html=r('crmFocusHtml(data.tasks[0])');
  assert.equal((html.match(/id="dDue"/g)||[]).length,1);
  assert.equal((html.match(/data-crm-contact=/g)||[]).length,1);
  assert.match(html,/Offerte opvolgen/);assert.doesNotMatch(html,/Deadline bewerken|gebruikt de deadline/);
});

test('Notes show legacy history once with a single simple composer',()=>{
  const r=runtime();r("data.tasks=[makeTask('a')];data.comments=[{id:'c',taskId:'a',at:now(),text:'Historische notitie'}]");
  const html=r('crmDetailHtml(data.tasks[0])');
  assert.equal((html.match(/Historische notitie/g)||[]).length,1);
  assert.match(html,/data-cid="c"/);
  assert.match(html,/Wat is er besproken/);assert.doesNotMatch(html,/<details|ccType|ccOutcome|ccDone/);
});


test('simple notes preserve deadlines and record first contact without overwriting earlier contact',()=>{
  const r=runtime();r("data.tasks=[makeTask('a',{stage:'callback',due:'2026-10-15',time:'09:00'})]");
  r("crmSaveNote(data.tasks[0],' Gesproken. ',[], '')");
  assert.equal(r('data.tasks[0].due'),'2026-10-15');assert.equal(r('data.tasks[0].time'),'09:00');
  assert.equal(r('data.comments[0].text'),'Gesproken.');assert.equal(r("data.tasks[0].custom['f-eerste-contact']"),'2026-10-13');
  r("data.tasks[0].custom['f-eerste-contact']='2026-09-01';crmSaveNote(data.tasks[0],'Opnieuw gebeld',[],'2026-10-20')");
  assert.equal(r('data.tasks[0].due'),'2026-10-20');assert.equal(r("data.tasks[0].custom['f-eerste-contact']"),'2026-09-01');
});
test('simple note validation is atomic and supports image-only notes',()=>{
  const r=runtime();r("data.tasks=[makeTask('a',{stage:'mail',due:today()})]");
  assert.throws(()=>r("crmSaveNote(data.tasks[0],'  ',[],'2026-10-20')"),/notitie/);
  assert.throws(()=>r("crmSaveNote(data.tasks[0],'Gesproken',[],'2026-02-30')"),/geldige datum/);
  assert.equal(r('data.comments.length'),0);assert.equal(r('data.tasks[0].due'),r('today()'));
  r("crmSaveNote(data.tasks[0],'',['data:image/jpeg;base64,YQ=='])");assert.equal(r('data.comments[0].imgs.length'),1);
});
test('task tabs combine overview and notes and keep data separate',()=>{
  const r=runtime();r("data.tasks=[makeTask('a')]");const html=r('crmTabsHtml(data.tasks[0])');
  assert.equal((html.match(/role="tab"/g)||[]).length,2);
  assert.match(html,/Overzicht & notities/);assert.doesNotMatch(html,/crmTab-notes/);
  assert.match(html,/data-crm-tab="overview"[^>]*aria-selected="true"/);
  r("crmDetailTabs.a='notes'");assert.match(r('crmTabsHtml(data.tasks[0])'),/data-crm-tab="overview"[^>]*aria-selected="true"/);
  r("crmDetailTabs.a='data'");assert.match(r('crmTabsHtml(data.tasks[0])'),/data-crm-tab="data"[^>]*aria-selected="true"/);
});

test('existing contact details and task notes remain visible in the new notes tab',()=>{
 const r=runtime();r("data.tasks=[makeTask('a',{notes:'Oude taaknotitie'})];data.activities=[{id:'old',taskId:'a',type:'call',at:now(),outcome:'Interesse',text:'Oud gesprek',nextAction:{type:'quote',date:'2026-10-20',note:'Offerte sturen'}}]");
 const html=r('crmDetailHtml(data.tasks[0])');for(const text of ['Oude taaknotitie','Interesse','Oud gesprek','Offerte sturen','20/10/2026'])assert.ok(html.includes(text));
});


test('daily attention excludes unplanned quotes and deduplicates action deadlines',()=>{
 const r=runtime();r("data.tasks=[makeTask('a',{stage:'callback',due:today()}),makeTask('b',{due:today(),nextAction:{type:'call',date:today()}}),makeTask('c',{stage:'mail'}),makeTask('future',{due:'2026-10-20'})]");
 assert.deepEqual(plain(r('crmAttentionTasks().map(t=>t.id)')),['a','b']);
 assert.match(r('crmTodayHtml()'),/Vandaag opvolgen/);
});
test('customer filters keep archived and completed records available in the right scope',()=>{
 const r=runtime();r("data.tasks=[makeTask('open'),makeTask('done',{done:true,stage:'positive'}),makeTask('archived',{projectId:'finished'})]");
 assert.deepEqual(plain(r('crmFilteredTasks().map(t=>t.id)')),['open']);
 r("crmListFilter().status='done'");assert.deepEqual(plain(r('crmFilteredTasks().map(t=>t.id)')),['done']);
 r("view={type:'project',id:'finished'}");assert.deepEqual(plain(r('crmFilteredTasks().map(t=>t.id)')),['archived']);
});
test('customer search finds legacy conversations and follow-up notes',()=>{
 const r=runtime();r("data.tasks=[makeTask('a')];data.activities=[{taskId:'a',outcome:'Budget ontbreekt',text:'Oud gesprek',nextAction:{note:'Vraag facturatie na'}}]");
 for(const word of ['budget','gesprek','facturatie']){r(`searchQ='${word}'`);assert.equal(r('crmFilteredTasks().length'),1);}
 r("searchQ='niet gevonden'");assert.equal(r('crmFilteredTasks().length'),0);
});
test('sale form parses Belgian amounts, preserves old fields and supports deliberate clearing',()=>{
 const r=runtime();const previous={sc_client:'Oude klant',sc_amount:200,legacy:'Bewaren'};
 const values=plain(r(`crmSaleValues({sc_client:'Nieuwe klant',sc_amount:'1.234,50',sc_date:'2026-10-13',sc_desc:''},${JSON.stringify(previous)})`));
 assert.equal(values.sc_amount,1234.5);assert.equal(values.legacy,'Bewaren');assert.equal(values.sc_client,'Nieuwe klant');assert.equal(values.sc_desc,undefined);assert.equal(previous.sc_amount,200);
});
test('sale validation rejects incomplete new sales and impossible dates without mutation',()=>{
 const r=runtime();r("const previousSale={sc_client:'Klant',sc_amount:200};");
 for(const raw of [{sc_client:'Klant',sc_amount:'abc'},{sc_client:'Klant',sc_amount:'100',sc_date:'2026-02-30'},{sc_amount:'100'},{sc_client:'Klant'}])assert.throws(()=>r(`crmSaleValues(${JSON.stringify(raw)},previousSale,true)`));
 assert.equal(r('previousSale.sc_amount'),200);
 assert.equal(r("crmSaleValues({sc_client:'Klant',sc_amount:'0'}, {},true).sc_amount"),0);
 assert.equal(r("crmSaleValues({sc_client:'Annulatie',sc_amount:'-100'}, {},true).sc_amount"),-100);
});

test('default customer search also finds completed clients without changing the normal open list',()=>{
 const r=runtime();r("data.tasks=[makeTask('open'),makeTask('closed',{title:'Oude klant',done:true,stage:'positive'})]");
 assert.equal(r('crmFilteredTasks().length'),1);r("searchQ='Oude klant'");assert.equal(r('crmFilteredTasks()[0].id'),'closed');
 r("searchQ=''");assert.equal(r('crmFilteredTasks()[0].id'),'open');
});
