'use strict';
/* Eenvoudige dagelijkse bediening; bestaande gegevens en workflows blijven behouden. */
const CRM_EXTRA_VIEWS=[['agenda','Kalender'],['btw','BTW']];
function crmHomeView() {
  const project=sortedProjects().find(p=>p.id!=='inbox' && !p.finished);
  if(project)return {type:'project',id:project.id};
  if(data.tasks.some(t=>t.projectId==='inbox' || !data.projects.some(p=>p.id===t.projectId)))return {type:'inbox'};
  const archived=sortedProjects().find(p=>p.id!=='inbox');
  if(archived)return {type:'project',id:archived.id};
  return {type:'all'};
}
function crmNeedsProject() {return view.type==='all' && !sortedProjects().some(p=>p.id!=='inbox' && !p.finished) && !data.tasks.length;}
const crmListFilters = {};
const crmListFilter = () => crmListFilters[viewKey()] ||= {status:'open',sort:data.settings.sort || 'due'};
function crmBoardStages() {
  const status=crmListFilter().status;
  return stages().filter(s=>status==='all' || searchQ.trim() && status==='open' || status==='open' && !s.done || status==='done' && s.done || s.id===status);
}
function crmFilteredTasks() {
  const f=crmListFilter();
  return viewTasks(true).filter(t=>matchSearch(t,searchQ) && (f.status==='all' || searchQ.trim() && f.status==='open' || f.status==='open' && !t.done || f.status==='done' && t.done || t.stage===f.status));
}
function crmCustomerListHtml() {
  const tasks=crmFilteredTasks().sort(sortFn(crmListFilter().sort));
  if(crmNeedsProject())return '<div class="crm-simple-empty"><h3>Begin met een project</h3><p>Gebruik Project toevoegen om je klanten samen te brengen.</p></div>';
  if(!tasks.length)return `<div class="crm-simple-empty"><h3>${searchQ?'Geen klant gevonden':'Geen klanten in deze lijst'}</h3><p>${searchQ?'Probeer een andere naam, telefoonnummer of notitie.':'Voeg een klant toe of kies Gewonnen, Verloren of Alle taken naast de zoekbalk.'}</p></div>`;
  return `<p class="crm-list-caption">${tasks.length} ${searchQ?'zoekresultaten':tasks.length===1?'klant':'klanten'}${searchQ && crmListFilter().status==='open'?' · ook afgeronde klanten':''}</p><div class="crm-customer-list">${tasks.map(t=>{
    const a=t.done?null:crmEffectiveAction(t),date=a?.date || (!t.done?t.due:null),s=stageById(t.stage);
    const nameField=fieldsFor(t.projectId).find(f=>/^(naam|contactpersoon)$/i.test(f.name)),contact=nameField?t.custom[nameField.id]:'';
    return `<button type="button" class="crm-customer-row ${selectedId===t.id?'selected':''}" data-crm-open="${esc(t.id)}"><span class="crm-customer-name"><b>${esc(t.title || 'Zonder naam')}</b><small>${esc(proj(t.projectId).name)}${contact?' · '+esc(contact):''}</small></span><span class="crm-customer-status">${esc(s?.label || 'Nog geen status')}</span><span class="crm-customer-due ${date && date<today()?'crm-late':''}">${date?`${esc(dueLabel(date))}${t.time && date===t.due?' · '+esc(t.time):''}`:t.done?'Afgerond':'Nog geen opvolgdatum'}</span><span class="crm-row-arrow" aria-hidden="true">›</span></button>`;
  }).join('')}</div>`;
}
// Een expliciete statuskeuze toont ook eerder verborgen afgewerkte kolommen.
function crmColumnHidden(id) {
  const status=crmListFilter().status;
  if(status===id)return false;
  return !((status==='done' || status==='all' || searchQ.trim()) && stageById(id)?.done);
}
function crmToolbarHtml() {
  const f=crmListFilter(), layout=data.settings.taskLayout || 'list';
  return `<label class="crm-search-label"><span class="sr-only">Zoek een klant</span><input class="search" id="tbSearch" type="search" placeholder="Zoek op naam, telefoon of notitie…" value="${esc(searchQ)}" autocomplete="off"></label>
    <label class="crm-status-filter"><span class="sr-only">Toon taken</span><select id="crmListStatus" aria-label="Toon taken"><option value="open" ${f.status==='open'?'selected':''}>Nog op te volgen</option><option value="done" ${f.status==='done'?'selected':''}>Afgewerkt (gewonnen & verloren)</option>${stages().map(s=>`<option value="${esc(s.id)}" ${f.status===s.id?'selected':''}>${esc(s.label)}</option>`).join('')}<option value="all" ${f.status==='all'?'selected':''}>Alle taken</option></select></label>
    <details class="crm-list-options"><summary>Weergave</summary><div class="crm-layout-switch" role="group" aria-label="Weergave"><button type="button" data-crm-layout="list" aria-pressed="${layout==='list'}">Lijst</button><button type="button" data-crm-layout="board" aria-pressed="${layout==='board'}">Kolommen</button></div>
    <div><label>Volgorde<select id="crmListSort">${[['due','Eerstvolgende datum'],['title','Naam A–Z'],['newest','Nieuwste eerst'],['manual','Eigen volgorde']].map(([v,l])=>`<option value="${v}" ${f.sort===v?'selected':''}>${l}</option>`).join('')}</select></label></div></details>`;
}
function crmOpenNewCustomer() {
  const project=view.type==='project'?view.id:'inbox';
  showDialog(`<h3>Klant toevoegen</h3><p class="muted">Begin met de naam. Je kunt de rest later aanvullen.</p>
    <form id="crmCustomerForm"><label class="fl">Naam van de klant of taak<input id="crmCustomerName" type="text" placeholder="Bijvoorbeeld: HIGH VOLTAGE" required autofocus></label>
    <label class="fl">Project<select id="crmCustomerProject">${sortedProjects().filter(p=>!p.finished || p.id===project).map(p=>`<option value="${esc(p.id)}" ${p.id===project?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
    <details class="crm-form-extra"><summary>Contactgegevens en opvolging (optioneel)</summary>
      <label class="fl">Contactpersoon<input id="crmCustomerPerson" type="text"></label><label class="fl">Telefoonnummer<input id="crmCustomerPhone" type="tel"></label><label class="fl">E-mailadres<input id="crmCustomerEmail" type="email"></label>
      <label class="fl">Status<select id="crmCustomerStage">${stages().filter(s=>!s.done).map(s=>`<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select></label><label class="fl">Opvolgdatum<input id="crmCustomerDate" type="date"></label>
    </details><p class="err" id="crmCustomerError" role="alert"></p><div class="dlg-actions"><button type="button" class="btn" id="crmCustomerCancel">Annuleren</button><span class="grow"></span><button type="submit" class="btn primary">Klant toevoegen</button></div></form>`,d=>{
    $('#crmCustomerCancel',d).onclick=()=>d.close();
    $('#crmCustomerForm',d).onsubmit=e=>{
      e.preventDefault();const name=$('#crmCustomerName',d).value.trim();if(!name){$('#crmCustomerError',d).textContent='Vul de naam van de klant in.';return;}
      const projectId=$('#crmCustomerProject',d).value,stage=$('#crmCustomerStage',d).value,date=$('#crmCustomerDate',d).value;
      const custom={};for(const [rx,id,label] of [[/^(naam|contactpersoon)$/i,'crmCustomerPerson','Contactpersoon'],[/telefoon|gsm|mobiel/i,'crmCustomerPhone','Telefoonnummer'],[/e.?mail/i,'crmCustomerEmail','E-mailadres']]){const value=$('#'+id,d).value.trim();if(!value)continue;let field=fieldsFor(projectId).find(f=>f.type==='text' && rx.test(f.name));if(!field){field=touch({id:uid(),name:label,type:'text',order:data.fields.length,all:false,projectIds:[projectId],showInList:false});data.fields.push(field);}custom[field.id]=value;}
      d.close();const task=createTask({title:name,projectId,stage,due:date || null,noDefaultDue:true,custom,silent:true});
      if(date && !crmDeadlineActionType(task))crmSetNextAction(task,{type:'other',date,note:''});
      save();if(view.type!=='project' || view.id!==projectId)setView({type:'project',id:projectId});else renderAll();openTask(task.id);toast(crmDuplicates(task).length?'Klant toegevoegd. Mogelijke dubbele klant: zie Gegevens.':'Klant toegevoegd.');
    };
  });
}
let crmSalesLayout='table';
const crmMoreOpen={};
function renderProjectNotes() {
  const el=$('#projectNotes'),p=view.type==='project' && view.id!=='inbox'?data.projects.find(p=>p.id===view.id):null;
  el.hidden=!p;
  if(!p){el.innerHTML='';delete el.dataset.pid;return;}
  if(el.dataset.pid===p.id && el.contains(document.activeElement))return;
  el.dataset.pid=p.id;
  el.innerHTML=`<details class="crm-project-notes" data-crm-disclosure="project-notes:${esc(p.id)}" ${crmMoreOpen['project-notes:'+p.id]?'open':''}><summary>Projectnotities${String(p.notes || '').trim()?'<span class="crm-project-notes-dot" aria-label="Bevat notities"></span>':''}</summary><label class="sr-only" for="projectNotesText">Notities voor ${esc(p.name)}</label><textarea id="projectNotesText" rows="3" placeholder="Afspraken of aandachtspunten voor dit project…">${esc(p.notes || '')}</textarea><p class="muted small">Wordt automatisch bewaard.</p></details>`;
  if(crmMoreOpen['project-notes:'+p.id])autosize($('#projectNotesText'));
}
function crmSalesListHtml(pg,rows,cols) {
  const c=winCols(),dateCol=c.date;
  const ordered=[...rows].sort((a,b)=>String(dateCol?b.values[dateCol.id] || '':'').localeCompare(String(dateCol?a.values[dateCol.id] || '':'')) || (b.order || 0)-(a.order || 0));
  return `<div class="crm-sales-list">${ordered.map(r=>{
    const client=c.client?r.values[c.client.id]:'',amount=c.amount?parseNl(r.values[c.amount.id]):null,date=dateCol?r.values[dateCol.id]:'';
    const other=cols.filter(col=>col.id!==c.client?.id && col.id!==c.amount?.id && col.id!==dateCol?.id).filter(col=>!isEmpty(r.values[col.id]));
    const project=r.projectId!==undefined?r.projectId:taskById(r.dealId || '')?.projectId;
    return `<article class="crm-sale-card"><div><h3>${esc(client || 'Verkoop zonder klantnaam')}</h3><p>${date?esc(fmtDateInp(date)):'Datum ontbreekt'}${project?' · '+esc(proj(project).name):''}</p>${other.length?`<details class="crm-sale-extra"><summary>Omschrijving en details</summary><dl>${other.map(col=>`<div><dt>${esc(col.name)}</dt><dd>${esc(col.type==='money'?eur(parseNl(r.values[col.id])):r.values[col.id])}</dd></div>`).join('')}</dl></details>`:''}</div><div class="crm-sale-card-actions"><b>${amount===null?'Bedrag ontbreekt':esc(eur(amount))}</b><button type="button" class="btn" data-crm-sale-edit="${esc(r.id)}">Bewerken</button></div></article>`;
  }).join('') || '<div class="crm-simple-empty"><h3>Nog geen verkopen deze maand</h3><p>Klik op Verkoop toevoegen om je eerste verkoop in te vullen.</p></div>'}</div>`;
}
function crmSaleInput(col,r,pg) {
  const value=r?.values[col.id] ?? (col.type==='date' && pg.month===today().slice(0,7)?today():'');
  const a=`data-crm-sale-col="${esc(col.id)}"`;
  if(col.type==='format')return `<select ${a}><option value="">Nog niet gekozen</option>${[...new Set([...FORMATS,...(value && !FORMATS.includes(value)?[String(value)]:[])])].map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
  return `<input ${a} type="${col.type==='date'?'date':'text'}" ${['money','number'].includes(col.type)?'inputmode="decimal"':''} value="${esc(['money','number'].includes(col.type) && value!==''?calcNum(value):value)}" ${col.type==='money'?'placeholder="0,00"':''}>`;
}
function crmSaleValues(raw, previous = {}, isNew = false) {
  const values={...previous}, cols=salesCols(), core=winCols();
  for(const col of cols) {
    const text=String(raw[col.id] ?? '').trim();
    if(!text){delete values[col.id];continue;}
    const value=['money','number'].includes(col.type)?parseNl(text):text;
    if(value===null)throw new Error(`Vul een geldig getal in bij ${col.name}.`);
    if(col.type==='date' && (!/^\d{4}-\d\d-\d\d$/.test(value) || ymd(parseYmd(value))!==value))throw new Error(`Kies een geldige datum bij ${col.name}.`);
    values[col.id]=value;
  }
  if(isNew && core.client && !values[core.client.id])throw new Error('Vul de klantnaam in.');
  if(isNew && core.amount && values[core.amount.id]===undefined)throw new Error('Vul het verkoopbedrag in.');
  return values;
}
function crmOpenSaleEditor(row) {
  const pg=salesPageById(row?.pageId || view.id);if(!pg)return;
  const currentProject=row?.projectId !== undefined?row.projectId:taskById(row?.dealId || (row?.id.startsWith('w_')?row.id.slice(2):''))?.projectId || '';
  const cols=salesCols(),c=winCols(),core=cols.filter(col=>[c.client?.id,c.amount?.id,c.date?.id].includes(col.id)),extra=cols.filter(col=>!core.includes(col));
  const field=col=>`<label class="fl">${esc(col.name)}${col.type==='money'?' (€)':''}${crmSaleInput(col,row,pg)}</label>`;
  showDialog(`<h3>${row?'Verkoop bewerken':'Verkoop toevoegen'}</h3><p class="muted">${esc(pg.title)}</p><form id="crmSaleForm">${core.map(field).join('')}<label class="fl">Project<select id="crmSaleProject"><option value="">Zonder project</option>${sortedProjects().map(p=>`<option value="${esc(p.id)}" ${p.id===currentProject?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>${extra.length?`<details class="crm-form-extra" ${row && extra.some(col=>!isEmpty(row.values[col.id]))?'open':''}><summary>Formaat en extra gegevens</summary>${extra.map(field).join('')}</details>`:''}<p class="err" id="crmSaleError" role="alert"></p><div class="dlg-actions">${row?'<button type="button" class="btn danger" id="crmSaleDelete">Verwijderen</button>':''}<span class="grow"></span><button type="button" class="btn" id="crmSaleCancel">Annuleren</button><button type="submit" class="btn primary">Verkoop bewaren</button></div></form>`,d=>{
    $('#crmSaleCancel',d).onclick=()=>d.close();
    $('#crmSaleDelete',d)?.addEventListener('click',async()=>{if(!await askConfirm('Verkoop verwijderen?','Deze verkoop verdwijnt uit het maandoverzicht.',{ok:'Verwijderen',danger:true}))return;const copy=structuredClone(row);data.sales=data.sales.filter(r=>r.id!==row.id);tombstone(row.id);d.close();commit();toast('Verkoop verwijderd',()=>{delete data.deleted[copy.id];data.sales.push(touch(copy));commit();});});
    $('#crmSaleForm',d).onsubmit=e=>{
      e.preventDefault();const raw=Object.fromEntries($$('[data-crm-sale-col]',d).map(input=>[input.dataset.crmSaleCol,input.value]));
      let values;try{values=crmSaleValues(raw,row?.values || {},!row || !!row.dealId);if(row?.dealId && values[c.amount?.id]<0)throw new Error('Het afgesproken bedrag mag niet negatief zijn.');}catch(error){$('#crmSaleError',d).textContent=error.message;return;}
      const saved=row || {id:uid(),pageId:pg.id,order:now()},project=$('#crmSaleProject',d).value,projectChanged=project!==currentProject;saved.values=values;saved.projectId=project;crmUpdateLinkedSale(saved,cols.map(c=>c.id),projectChanged);touch(saved);if(!row)data.sales.push(saved);d.close();commit();toast(saved.dealId?'Verkoop en gekoppelde taak bewaard.':'Verkoop bewaard.');
    };
  });
}
function crmSalesToolsHtml(pg) {
  const missing=data.tasks.filter(t=>isWinStage(t.stage) && !crmHasWinPrice(t));
  return `${missing.length?`<details class="crm-warning"><summary>${missing.length} gewonnen ${missing.length===1?'deal mist':'deals missen'} een bedrag</summary>${missing.map(t=>`<button type="button" class="link" data-crm-open="${esc(t.id)}">${esc(t.title)}</button>`).join(' · ')}</details>`:''}<div class="crm-sales-tools"><label>Maand<select id="crmSalesMonth">${sortedSalesPages().map(p=>`<option value="${esc(p.id)}" ${p.id===pg.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label><details class="crm-sales-options" data-crm-disclosure="sales-options" ${crmMoreOpen['sales-options']?'open':''}><summary>Maand en weergave aanpassen</summary><button type="button" class="btn" data-crm-new-month>+ Nieuwe maand</button><div class="crm-layout-switch" role="group" aria-label="Verkoopweergave"><button type="button" data-crm-sales-layout="list" aria-pressed="${crmSalesLayout==='list'}">Overzicht</button><button type="button" data-crm-sales-layout="table" aria-pressed="${crmSalesLayout==='table'}">Tabel bewerken</button></div></details></div>`;
}
function crmPrimaryAction() {
  if(view.type==='sales')crmOpenSaleEditor();
  else if(view.type==='agenda')openEventDialog(null,agendaSel || today());
  else if(crmNeedsProject())openProjectDialog(null);
  else crmOpenNewCustomer();
}
function bindUsability() {
  $('#primaryAdd').onclick=crmPrimaryAction;
  $('#projectNotes').addEventListener('input',e=>{
    if(e.target.id!=='projectNotesText')return;
    const p=data.projects.find(p=>p.id===$('#projectNotes').dataset.pid);if(!p)return;
    p.notes=e.target.value;touch(p);autosize(e.target);save(true);
    const summary=$('.crm-project-notes>summary');if(summary){let dot=$('.crm-project-notes-dot',summary);if(p.notes.trim() && !dot)summary.insertAdjacentHTML('beforeend','<span class="crm-project-notes-dot" aria-label="Bevat notities"></span>');else if(!p.notes.trim())dot?.remove();}
  });
  $('#toolbar').addEventListener('change',e=>{
    if(!['crmListStatus','crmListSort'].includes(e.target.id))return;
    crmListFilter()[e.target.id==='crmListStatus'?'status':'sort']=e.target.value;if(e.target.id==='crmListSort'){data.settings.sort=e.target.value;save();}renderMain();
  });
  document.addEventListener('click',e=>{
    if(!data || $('#app').hidden)return;
    const layout=e.target.closest('[data-crm-layout]');if(layout){data.settings.taskLayout=layout.dataset.crmLayout;save();renderToolbar();renderMain();return;}
    const sl=e.target.closest('[data-crm-sales-layout]');if(sl){crmSalesLayout=sl.dataset.crmSalesLayout;renderSales(true);return;}
    const edit=e.target.closest('[data-crm-sale-edit]');if(edit){crmOpenSaleEditor(data.sales.find(r=>r.id===edit.dataset.crmSaleEdit));return;}
    if(e.target.closest('[data-crm-new-month]'))openSalesPageDialog(null);
    if(e.target.closest('[data-crm-all-customers]'))setView({type:'all'});
  });
  $('#salesPage').addEventListener('change',e=>{if(e.target.id==='crmSalesMonth')setView({type:'sales',id:e.target.value});});
  for(const id of ['#salesPage','#pageView','#projCalc','#projectNotes'])$(id).addEventListener('toggle',e=>{if(e.target.dataset.crmDisclosure && e.target.isConnected){crmMoreOpen[e.target.dataset.crmDisclosure]=e.target.open;if(id==='#projectNotes' && e.target.open)autosize($('#projectNotesText'));}},true);
}
