'use strict';
/* CRM-workflow. Alles blijft in de bestaande versleutelde kluis; geen AI of externe dienst. */
const CRM_ACTIONS = [['call', 'Bellen'], ['email', 'Mailen'], ['quote', 'Offerte opvolgen'], ['meeting', 'Afspraak'], ['other', 'Anders']];
const CRM_LOSS_REASONS = ['Prijs', 'Geen interesse', 'Verkeerde timing', 'Concurrent gekozen', 'Niet bereikbaar', 'Anders'];
let crmReport = {month:null, projectId:''};
const crmActionLabel = type => CRM_ACTIONS.find(x => x[0] === type)?.[1] || 'Opvolgen';
const crmOpenTasks = () => data.tasks.filter(t => !t.done && !projArchived(t.projectId));
const crmLostStage = id => { const s = data.stages.find(x => x.id === id); return !!s?.done && !s.positive; };
function crmDeadlineActionType(t) {
  const s = data.stages.find(x => x.id === t.stage);
  if (!s || s.done) return null;
  if (s.id === 'callback' || /terugbellen/i.test(s.label)) return 'call';
  if (s.id === 'mail' || /antwoord\s+op\s+mail|offerte/i.test(s.label)) return 'quote';
  return null;
}
function crmEffectiveAction(t) {
  const type = crmDeadlineActionType(t);
  if (type) return t.due ? {type, date:t.due, note:t.nextAction?.type === type ? t.nextAction.note || '' : ''} : null;
  return t.nextAction || null;
}
function crmFirstContact(t) {
  const field = fieldsFor(t.projectId).find(f => f.type === 'date' && (f.id === 'f-eerste-contact' || /eerste.*contact/i.test(f.name)));
  const date = field && t.custom?.[field.id];
  const valid = typeof date === 'string' && /^\d{4}-\d\d-\d\d$/.test(date) && ymd(parseYmd(date)) === date;
  return {field, date:valid ? date : null};
}
function crmRecordFirstContact(t, at) {
  const first = crmFirstContact(t), date = ymd(new Date(at));
  if (first.field && (!first.date || date < first.date)) t.custom[first.field.id] = date;
}
function crmDayGroups(date = today()) {
  const open = crmOpenTasks();
  const sort = list => list.sort((a, b) => (crmEffectiveAction(a)?.date || a.due || '').localeCompare(crmEffectiveAction(b)?.date || b.due || '') || a.title.localeCompare(b.title));
  return {
    overdue:sort(open.filter(t => crmEffectiveAction(t)?.date && crmEffectiveAction(t).date < date)),
    actions:sort(open.filter(t => crmEffectiveAction(t)?.date === date)),
    deadlines:sort(open.filter(t => !crmDeadlineActionType(t) && t.due && t.due <= date)),
    quotes:sort(open.filter(t => crmDeadlineActionType(t) === 'quote' && !crmEffectiveAction(t))),
    unplanned:sort(open.filter(t => !crmEffectiveAction(t))),
  };
}
function crmSetNextAction(t, action) {
  if (action && (!CRM_ACTIONS.some(x => x[0] === action.type) || !/^\d{4}-\d\d-\d\d$/.test(action.date || '') || ymd(parseYmd(action.date)) !== action.date)) throw new Error('Kies een actie en een geldige datum.');
  const linkedType = crmDeadlineActionType(t);
  if (linkedType) { t.due = action?.date || null; if (!t.due) t.time = null; }
  t.nextAction = action ? {type:linkedType || action.type, date:action.date, note:String(action.note || '').trim()} : null;
  touch(t);
}
function crmAddContact(t, contact, nextAction) {
  if (!CRM_ACTIONS.some(x => x[0] === contact.type) || !Number.isFinite(contact.at) || contact.at > now() + 60000) throw new Error('Kies een geldig contactmoment, niet in de toekomst.');
  if (!String(contact.outcome || '').trim() && !String(contact.text || '').trim()) throw new Error('Vul een uitkomst of notitie in.');
  // Valideer de vervolgstap vóór er iets aan de kluis verandert.
  if (nextAction !== undefined) crmSetNextAction(t, nextAction);
  const next = crmEffectiveAction(t);
  const item = touch({id:uid(), taskId:t.id, type:contact.type, at:contact.at, outcome:String(contact.outcome || '').trim(), text:String(contact.text || '').trim(), nextAction:next ? {...next} : null});
  data.activities.push(item);
  crmRecordFirstContact(t, contact.at);
  touch(t);
  return item;
}
function crmCompleteAction(t) {
  const current = crmEffectiveAction(t); if (!current) return;
  const before = {...current}, beforeTime = t.time, firstBefore = crmFirstContact(t);
  const item = crmAddContact(t, {type:before.type, at:now(), outcome:'Opvolgactie uitgevoerd', text:before.note}, null);
  commit();
  toast('Actie uitgevoerd en in contacthistoriek bewaard', () => {
    data.activities = data.activities.filter(x => x.id !== item.id); tombstone(item.id);
    const contactDate = ymd(new Date(item.at));
    if (firstBefore.field && t.custom[firstBefore.field.id] === contactDate && !data.activities.some(x => x.taskId === t.id && ymd(new Date(x.at)) <= contactDate)) t.custom[firstBefore.field.id] = firstBefore.date || '';
    // Een intussen geplande nieuwe actie nooit overschrijven.
    if (!crmEffectiveAction(t)) { crmSetNextAction(t, before); if (crmDeadlineActionType(t)) t.time = beforeTime; }
    commit();
  });
}
function crmOpenActionDialog(t) {
  if (crmDeadlineActionType(t)) {
    openTask(t.id);
    const editor = $('#crmDeadlineEdit'); if (editor) editor.open = true;
    const input = $('#dDue'); input?.focus(); if (input) openDatePop(input);
    return;
  }
  const a = t.nextAction || {type:'call', date:today(), note:''};
  showDialog(`<h3>Volgende actie</h3><p class="muted small">${esc(t.title)}</p>
    <label class="fl">Actie<select id="caType">${CRM_ACTIONS.map(([v,l]) => `<option value="${v}" ${v === a.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="fl">Datum<input id="caDate" type="date" value="${esc(a.date)}" required></label>
    <label class="fl">Notitie<textarea id="caNote" rows="2">${esc(a.note)}</textarea></label><p class="err" id="caErr"></p>
    <div class="dlg-actions">${t.nextAction ? '<button type="button" class="btn danger" id="caRemove">Actie wissen</button>' : ''}<span class="grow"></span><button type="button" class="btn" id="caCancel">Annuleren</button><button type="button" class="btn primary" id="caSave">Opslaan</button></div>`, d => {
    $('#caCancel',d).onclick = () => d.close();
    $('#caRemove',d)?.addEventListener('click', () => {crmSetNextAction(t,null);d.close();commit();});
    $('#caSave',d).onclick = () => {
      try {crmSetNextAction(t,{type:$('#caType',d).value,date:$('#caDate',d).value,note:$('#caNote',d).value});d.close();commit();}
      catch(e) {$('#caErr',d).textContent=e.message;}
    };
  });
}
function crmOpenContactDialog(t) {
  const a = crmEffectiveAction(t), linkedType = crmDeadlineActionType(t);
  showDialog(`<h3>Contactmoment vastleggen</h3><p class="muted small">${esc(t.title)}</p>
    <div class="crm-form-grid"><label class="fl">Soort<select id="ccType">${CRM_ACTIONS.map(([v,l]) => `<option value="${v}" ${v === a?.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="fl">Datum<input id="ccDate" type="date" value="${today()}" max="${today()}" required></label></div>
    <label class="fl">Uitkomst<input id="ccOutcome" placeholder="bv. Interesse, offerte sturen" maxlength="300"></label>
    <label class="fl">Notities<textarea id="ccText" rows="3"></textarea></label>
    <label class="chk"><input id="ccDone" type="checkbox" ${a ? 'checked' : ''}> Huidige opvolgactie afronden</label>
    <details class="crm-next"><summary>${linkedType ? 'Nieuwe deadline plannen' : 'Een volgende actie plannen'}</summary><div class="crm-form-grid"><label class="fl">Actie<select id="ccNextType" ${linkedType ? 'disabled' : ''}>${CRM_ACTIONS.filter(([v]) => !linkedType || v === linkedType).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="fl">${linkedType ? 'Deadline' : 'Datum'}<input id="ccNextDate" type="date"></label></div><label class="fl">Notitie<input id="ccNextNote"></label></details>
    <p class="err" id="ccErr"></p><div class="dlg-actions"><span class="grow"></span><button type="button" class="btn" id="ccCancel">Annuleren</button><button type="button" class="btn primary" id="ccSave">Bewaren</button></div>`, d => {
    $('#ccCancel',d).onclick = () => d.close();
    $('#ccSave',d).onclick = () => {
      try {
        const date=$('#ccDate',d).value;
        if (!/^\d{4}-\d\d-\d\d$/.test(date) || ymd(parseYmd(date))!==date || date>today()) throw new Error('Vul een geldige contactdatum in, niet in de toekomst.');
        const nextDate=$('#ccNextDate',d).value;
        const next=nextDate ? {type:$('#ccNextType',d).value,date:nextDate,note:$('#ccNextNote',d).value} : $('#ccDone',d).checked ? null : undefined;
        crmAddContact(t,{type:$('#ccType',d).value,at:date === today() ? now() : parseYmd(date).getTime(),outcome:$('#ccOutcome',d).value,text:$('#ccText',d).value},next);
        d.close();commit();toast('Contactmoment bewaard');
      } catch(e) {$('#ccErr',d).textContent=e.message;}
    };
  });
}
function crmOpenLossDialog(t) {
  showDialog(`<h3>Waarom is deze deal verloren?</h3><p class="muted small">${esc(t.title)}</p>
    <label class="fl">Reden<select id="clReason"><option value="">Nog niet opgegeven</option>${CRM_LOSS_REASONS.map(r=>`<option value="${r}" ${t.lostReason===r?'selected':''}>${r}</option>`).join('')}</select></label>
    <label class="fl">Toelichting<textarea id="clNote" rows="3">${esc(t.lostNote || '')}</textarea></label>
    <div class="dlg-actions"><span class="grow"></span><button type="button" class="btn" id="clCancel">Later</button><button type="button" class="btn primary" id="clSave">Bewaren</button></div>`, d=>{
    $('#clCancel',d).onclick=()=>d.close();
    $('#clSave',d).onclick=()=>{t.lostReason=$('#clReason',d).value;t.lostNote=$('#clNote',d).value.trim();touch(t);d.close();commit();};
  });
}
const crmNameKey = v => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function crmPhoneKey(v) {
  let n=String(v || '').replace(/\D/g,'');
  if(n.startsWith('00')) n=n.slice(2);
  if(n.startsWith('0')) n='32'+n.slice(1);
  return n.length>=7 ? n : '';
}
function crmIdentity(t) {
  const keys={name:new Set(),email:new Set(),phone:new Set()};
  const name=crmNameKey(t.title);if(name && name!=='nieuwe deal')keys.name.add(name);
  for(const f of fieldsFor(t.projectId)) {
    const v=t.custom?.[f.id];if(v==null || v==='')continue;
    if(/e.?mail/i.test(f.name)){const e=String(v).trim().toLowerCase();if(e.includes('@'))keys.email.add(e);}
    else if(/telefoon|phone|gsm|mobiel/i.test(f.name)){const n=crmPhoneKey(v);if(n)keys.phone.add(n);}
    else if(/bedrijf|klantnaam/i.test(f.name)){const n=crmNameKey(v);if(n)keys.name.add(n);}
  }
  return keys;
}
function crmDuplicates(t) {
  const identity=crmIdentity(t),out=[];
  for(const other of data.tasks) {
    if(other.id===t.id)continue;
    const candidate=crmIdentity(other),reasons=[];
    for(const [key,label] of [['email','e-mailadres'],['phone','telefoonnummer'],['name','bedrijfsnaam']])if([...identity[key]].some(v=>candidate[key].has(v)))reasons.push(label);
    if(reasons.length)out.push({task:other,reasons});
  }
  return out;
}
function crmDuplicateHtml(t) {
  const dup=crmDuplicates(t);
  return dup.length ? `<details class="crm-warning crm-focus-duplicates"><summary>Mogelijk dubbele deal <span>(${dup.length})</span></summary><p>Dezelfde klant in meerdere projecten kan terecht zijn. Er wordt niets automatisch samengevoegd.</p>${dup.slice(0,5).map(({task,reasons})=>`<button type="button" class="link" data-crm-open="${esc(task.id)}">${esc(task.title)} · ${esc(proj(task.projectId)?.name || 'Inbox')} <span>(${esc(reasons.join(', '))})</span></button>`).join('')}${dup.length>5?`<p>En nog ${dup.length-5} overeenkomsten.</p>`:''}</details>` : '';
}
const crmFocusOpen = {history:{}, deadline:{}};
function crmDeadlineFieldsHtml(t) {
  return `<div class="props crm-focus-date-fields"><label class="prop"><span>Datum</span><input type="text" id="dDue" class="date-inp" value="${esc(fmtDateInp(t.due))}" placeholder="dd/mm/jjjj" autocomplete="off" role="combobox" aria-label="Deadline" aria-haspopup="dialog" aria-expanded="false"></label><label class="prop"><span>Uur</span><span class="inline"><input type="text" id="dTime" class="time-inp" value="${esc(t.time || '')}" placeholder="--:--" inputmode="numeric" autocomplete="off" maxlength="5" role="combobox" aria-label="Uur" aria-autocomplete="list" aria-expanded="false" aria-controls="timePop">${t.time ? `<button type="button" class="icon-btn" data-act="cleartime" aria-label="Uur wissen">${I.close}</button>` : ''}</span></label></div>`;
}
function crmFocusHtml(t) {
  const action = t.done ? null : crmEffectiveAction(t), linked = crmDeadlineActionType(t);
  const title = t.done ? isWinStage(t.stage) ? 'Deal gewonnen' : 'Deal afgerond' : action ? crmActionLabel(action.type) : linked ? crmActionLabel(linked) : 'Plan je volgende actie';
  const when = action ? esc(dueLabel(action.date)) + (linked && t.time ? ' · ' + esc(t.time) : '') : 'Datum kiezen';
  return `<section class="crm-focus-next"><span class="crm-focus-label">${t.done ? 'Afgerond' : 'Volgende stap'}</span><h3>${esc(title)}</h3>
    ${!t.done ? linked ? `<details id="crmDeadlineEdit" class="crm-focus-date" ${crmFocusOpen.deadline[t.id] ? 'open' : ''}><summary><span class="${action?.date < today() ? 'crm-late' : ''}">${when}</span><span class="crm-focus-change">Wijzigen</span></summary>${crmDeadlineFieldsHtml(t)}<button type="button" class="link" data-crm-date-done="${esc(t.id)}">Gereed</button></details>` : `<button type="button" class="crm-focus-date-button" data-crm-action="${esc(t.id)}">${when}<span>Wijzigen</span></button>` : ''}
    <button type="button" class="btn primary crm-focus-primary" data-crm-contact="${esc(t.id)}">Contact vastleggen</button>
  </section>`;
}
function crmContactSummaryHtml(t) {
  const fs = fieldsFor(t.projectId), get = rx => { const f=fs.find(f=>f.type==='text' && rx.test(f.name));return f?String(t.custom?.[f.id] || '').trim():''; };
  const name=get(/^(naam|contactpersoon)$/i), phone=get(/telefoon|gsm|mobiel/i), email=get(/e.?mail/i);
  const tel=phone.replace(/[^+0-9]/g,'');
  if(!name && !tel && !email)return '';
  return `<section class="crm-focus-person"><div><span class="crm-focus-label">Contactpersoon</span>${name?`<b>${esc(name)}</b>`:phone?`<b>${esc(phone)}</b>`:''}</div><div>${tel?`<a href="tel:${esc(tel)}">Bellen</a>`:''}${/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?`<a href="mailto:${esc(encodeURIComponent(email))}">Mailen</a>`:''}</div></section>`;
}
function crmDetailHtml(t) {
  const first=crmFirstContact(t), history=data.activities.filter(x=>x.taskId===t.id).map(x=>({...x,source:'contact'}));
  if(first.date && !history.some(x=>ymd(new Date(x.at))===first.date))history.push({id:'first_'+t.id,at:parseYmd(first.date).getTime(),source:'first'});
  for(const c of commentsOf(t.id))history.push({...c,source:'comment'});
  history.sort((a,b)=>b.at-a.at);
  const latest=history.find(x=>x.source!=='first');
  const draft=commentDrafts[t.id] || '', pending=(pendingImgs[t.id] || []).length;
  return `<details class="crm-focus-disclosure" id="crmHistory" ${crmFocusOpen.history[t.id] || draft || pending ? 'open' : ''}><summary>Contacthistoriek <span>${history.length} ${history.length===1?'moment':'momenten'}</span></summary>
    <ol class="crm-history">${history.map(x=>`<li ${x.source==='comment'?`data-cid="${esc(x.id)}"`:''}><div class="crm-history-head"><b>${x.source==='first'?'Eerste contactname':x.source==='comment'?'Opmerking':esc(crmActionLabel(x.type))}</b><time>${esc(x.source==='first'?fmtDateInp(first.date):stamp(x.at))}</time>${x.source==='contact'?`<button type="button" class="icon-btn" data-crm-delcontact="${esc(x.id)}" aria-label="Contactmoment verwijderen">${I.trash}</button>`:x.source==='comment'?`<button type="button" class="icon-btn" data-act="delcomment" aria-label="Opmerking verwijderen">${I.trash}</button>`:''}</div>${x.source==='contact' && ymd(new Date(x.at))===first.date?'<small>Eerste contactname</small>':''}${x.outcome?`<strong>${esc(x.outcome)}</strong>`:''}${x.text?`<p>${esc(x.text)}</p>`:''}${x.source==='comment'?imgsHtml(x.imgs,'zoom'):''}${x.nextAction?`<small>Vervolg: ${esc(crmActionLabel(x.nextAction.type))} · ${esc(dueLabel(x.nextAction.date))}</small>`:''}</li>`).join('') || '<li class="muted small">Nog geen contactmomenten vastgelegd.</li>'}</ol>
    <details class="crm-focus-note" ${draft || pending ? 'open' : ''}><summary>Opmerking of bijlage toevoegen</summary><div class="c-new"><div class="c-box"><textarea id="dComment" rows="2" placeholder="Schrijf een opmerking of plak een afbeelding…" aria-label="Nieuwe opmerking">${esc(draft)}</textarea><div class="c-pending" id="dPending">${pendingHtml(t.id)}</div><div class="c-tools"><button type="button" class="icon-btn" data-act="attach" aria-label="Afbeelding toevoegen">${I.image}</button><input type="file" id="dFile" accept="image/*" multiple hidden></div></div><button type="button" class="btn" data-act="addcomment">Plaatsen</button></div></details>
  </details>${latest?`<p class="crm-focus-latest">Laatste contact: ${esc(stamp(latest.at))} · ${latest.source==='comment'?'opmerking':esc(crmActionLabel(latest.type).toLowerCase())}</p>`:''}`;
}
function crmTaskRows(list, mode='action') {
  return list.length ? `<div class="crm-task-list">${list.map(t=>{const a=crmEffectiveAction(t);return `<article class="crm-task-row"><button type="button" class="crm-task-open" data-crm-open="${esc(t.id)}"><b>${esc(t.title)}</b><span>${esc(proj(t.projectId)?.name || 'Inbox')} · ${esc(stageById(t.stage)?.label || '')}</span><small>${mode==='deadline'?`Deadline ${esc(dueLabel(t.due))}`:a?`${esc(crmActionLabel(a.type))} · ${esc(dueLabel(a.date))}`:crmDeadlineActionType(t)?'Nog geen deadline':'Nog geen volgende actie'}${a?.note?` · ${esc(a.note)}`:''}</small></button><div class="crm-row-actions"><button type="button" class="btn" data-crm-action="${esc(t.id)}">${crmDeadlineActionType(t)?'Deadline':'Plannen'}</button>${a?`<button type="button" class="btn" data-crm-complete="${esc(t.id)}">Uitgevoerd</button>`:''}</div></article>`;}).join('')}</div>` : '<p class="muted small crm-empty">Niets in deze lijst.</p>';
}
function crmTodayHtml() {
  const g=crmDayGroups(),unique=new Set([...g.overdue,...g.actions,...g.deadlines,...g.quotes].map(t=>t.id));
  const block=(title,list,mode)=>`<section class="crm-card"><h3>${title} <span class="crm-count">${list.length}</span></h3>${crmTaskRows(list,mode)}</section>`;
  return `<div class="crm-page"><p class="crm-lead">${unique.size} ${unique.size===1?'deal vraagt':'deals vragen'} aandacht. Terugbellen en offerte opvolgen volgen automatisch de deadline van hun kolom.</p>
    <div class="crm-work-grid">${block('Te laat',g.overdue)}${block('Vandaag opvolgen',g.actions)}${g.deadlines.length?block('Overige deadlines',g.deadlines,'deadline'):''}${g.quotes.length?block('Offertes zonder deadline',g.quotes):''}</div>
    <details class="crm-card"><summary>Nog te plannen <span class="crm-count">${g.unplanned.length}</span></summary>${crmTaskRows(g.unplanned)}</details></div>`;
}
function crmSalesReport(month, projectId) {
  const amount=winCols().amount, dateCol=winCols().date;
  const pages=new Map(data.salesPages.map(p=>[p.id,p]));
  const allTasks=new Map(data.tasks.map(t=>[t.id,t]));
  const values=[];let unassigned=0;
  for(const r of data.sales) {
    const pg=pages.get(r.pageId);if(!pg || (month && pg.month!==month))continue;
    const linked=allTasks.get(r.dealId || (r.id.startsWith('w_')?r.id.slice(2):''));
    const pid=r.projectId !== undefined ? r.projectId : linked?.projectId || '';
    if(projectId && pid!==projectId)continue;
    if(!pid)unassigned++;
    const value=amount?parseNl(r.values[amount.id]):null;
    values.push({row:r,projectId:pid,value,date:dateCol?r.values[dateCol.id]:'',month:pg.month});
  }
  const priced=values.filter(x=>x.value!==null), revenue=priced.reduce((sum,x)=>sum+x.value,0);
  // Conversie: deals die in deze periode afgerond werden; open deals tellen niet in de noemer.
  const completed=data.tasks.filter(t=>t.done && (!projectId || t.projectId===projectId) && (!month || (t.doneAt && ymd(new Date(t.doneAt)).slice(0,7)===month)));
  const won=completed.filter(t=>isWinStage(t.stage)),lost=completed.filter(t=>crmLostStage(t.stage));
  const reasons=new Map();for(const t of lost){const reason=t.lostReason || 'Niet opgegeven';reasons.set(reason,(reasons.get(reason)||0)+1);}
  const byProject=new Map();for(const x of values){const key=x.projectId || '';if(!byProject.has(key))byProject.set(key,{count:0,revenue:0});const item=byProject.get(key);item.count++;item.revenue+=x.value || 0;}
  const byMonth=new Map();for(const x of values)byMonth.set(x.month,(byMonth.get(x.month)||0)+(x.value || 0));
  return {amount,values,revenue,count:values.length,average:priced.length?revenue/priced.length:null,missing:values.length-priced.length,unassigned,won:won.length,lost:lost.length,conversion:completed.length?won.length/completed.length*100:null,reasons,byProject,byMonth};
}
function crmDashboardHtml() {
  if(crmReport.month===null)crmReport.month=today().slice(0,7);
  if(crmReport.projectId && !data.projects.some(p=>p.id===crmReport.projectId))crmReport.projectId='';
  const r=crmSalesReport(crmReport.month,crmReport.projectId),metric=(label,value,note)=>`<article class="crm-metric"><span>${label}</span><b>${value}</b><small>${note}</small></article>`;
  const table=(headers,rows)=>`<div class="crm-table-wrap"><table class="crm-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(cells=>`<tr>${cells.map(x=>`<td>${x}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="muted">Nog geen gegevens voor deze selectie.</td></tr>`}</tbody></table></div>`;
  return `<div class="crm-page"><div class="crm-page-tools"><label>Maand <input type="month" id="crmReportMonth" value="${esc(crmReport.month)}"></label><button type="button" class="btn" id="crmReportAll">Alle maanden</button><label>Project <select id="crmReportProject"><option value="">Alle projecten</option>${sortedProjects().map(p=>`<option value="${esc(p.id)}" ${p.id===crmReport.projectId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><button type="button" class="btn" id="crmReportCsv">Export CSV</button></div>
    <p class="crm-lead">${crmReport.month?esc(monthTitle(crmReport.month)):'Alle maanden'} · omzet uit verkoopregels, bedragveld: ${esc(r.amount?.name || 'geen bedragveld')}. De maandpagina bepaalt de verkoopmaand.</p>
    <div class="crm-metrics">${metric('Omzet',eur(r.revenue),`${r.count} verkoopregels`)}${metric('Gemiddelde verkoopprijs',r.average===null?'—':eur(r.average),'Per verkoopregel met bedrag')}${metric('Conversie',r.conversion===null?'—':`${calcNum(round2(r.conversion))} %`,`${r.won} gewonnen · ${r.lost} verloren`)}${metric('Open pijplijn',String(crmOpenTasks().filter(t=>!crmReport.projectId || t.projectId===crmReport.projectId).length),'Actuele open deals, alle datums')}</div>
    ${r.missing?`<p class="crm-warning">${r.missing} verkoopregel(s) zonder geldig bedrag; niet meegerekend in het gemiddelde.</p>`:''}${r.unassigned?`<p class="muted small">${r.unassigned} verkoopregel(s) zonder project. Koppel deze in de verkooptabel om ze in een projectfilter te zien.</p>`:''}
    <div class="crm-work-grid"><section class="crm-card"><h3>Resultaten per project</h3>${table(['Project','Verkopen','Omzet'],[...r.byProject].sort((a,b)=>b[1].revenue-a[1].revenue).map(([id,v])=>[esc(id?proj(id)?.name || 'Verwijderd project':'Zonder project'),v.count,eur(v.revenue)]))}</section><section class="crm-card"><h3>Waarom deals verloren gaan</h3>${table(['Reden','Deals'],[...r.reasons].sort((a,b)=>b[1]-a[1]).map(([label,n])=>[esc(label),n]))}</section></div>
    <section class="crm-card"><h3>Omzet per maand</h3>${table(['Maand','Omzet'],[...r.byMonth].sort((a,b)=>b[0].localeCompare(a[0])).map(([m,n])=>[esc(monthTitle(m)),eur(n)]))}</section>
    <p class="muted small">Conversie = gewonnen / afgeronde deals, op basis van de afrondingsdatum. Bestaande deals zonder afrondingsdatum tellen alleen bij “Alle maanden”.</p></div>`;
}
function crmCsvCell(value) {let s=String(value ?? '');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function crmExportReport() {
  const r=crmSalesReport(crmReport.month,crmReport.projectId);
  const rows=[['Maand','Project','Verkopen','Omzet'],...[...r.byProject].map(([id,v])=>[crmReport.month || 'Alle maanden',id?proj(id)?.name || 'Verwijderd project':'Zonder project',v.count,round2(v.revenue)])];
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(crmCsvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));a.download='klose-dashboard-'+(crmReport.month || 'alle-maanden')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000);
}
function crmOpenSalesProjectDialog(r) {
  const current = r.projectId !== undefined ? r.projectId : taskById(r.dealId || (r.id.startsWith('w_') ? r.id.slice(2) : ''))?.projectId || '';
  showDialog(`<h3>Project van deze verkoop</h3><label class="fl">Project<select id="crmSalesProject"><option value="">Zonder project</option>${sortedProjects().map(p=>`<option value="${esc(p.id)}" ${p.id===current?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><div class="dlg-actions"><span class="grow"></span><button type="button" class="btn" id="crmSalesCancel">Annuleren</button><button type="button" class="btn primary" id="crmSalesSave">Bewaren</button></div>`,d=>{
    $('#crmSalesCancel',d).onclick=()=>d.close();
    $('#crmSalesSave',d).onclick=()=>{r.projectId=$('#crmSalesProject',d).value;delete r.dealId;touch(r);d.close();save();renderSales(true);};
  });
}
function bindCrm() {
  document.addEventListener('click',async e=>{
    if(!data || $('#app').hidden)return;
    const done=e.target.closest('[data-crm-date-done]');
    if(done){crmFocusOpen.deadline[done.dataset.crmDateDone]=false;const editor=$('#crmDeadlineEdit');if(editor)editor.open=false;closeDatePop();closeTimePop();renderDetail(true);return;}
    const b=e.target.closest('[data-crm-open],[data-crm-action],[data-crm-complete],[data-crm-contact],[data-crm-loss],[data-crm-delcontact],[data-crm-first-contact],[data-crm-sales-project]');
    if(b){
      const d=b.dataset,t=taskById(d.crmOpen || d.crmAction || d.crmComplete || d.crmContact || d.crmLoss || d.crmFirstContact);
      if(d.crmOpen && t)openTask(t.id);
      else if(d.crmAction && t)crmOpenActionDialog(t);
      else if(d.crmComplete && t)crmCompleteAction(t);
      else if(d.crmContact && t)crmOpenContactDialog(t);
      else if(d.crmLoss && t)crmOpenLossDialog(t);
      else if(d.crmFirstContact && t){const first=crmFirstContact(t);if(first.field){const more=$('#dMore');if(more)more.open=true;const input=$(`[data-field="${CSS.escape(first.field.id)}"]`,$('#detail'));input?.focus();if(input)openDatePop(input);}else toast('Voeg een datumveld Eerste contactname toe bij Extra gegevens.');}
      else if(d.crmSalesProject){const r=data.sales.find(x=>x.id===d.crmSalesProject);if(r)crmOpenSalesProjectDialog(r);}
      else if(d.crmDelcontact){const item=data.activities.find(x=>x.id===d.crmDelcontact);if(item && await askConfirm('Contactmoment verwijderen?','Alleen dit contactmoment wordt verwijderd.')){data.activities=data.activities.filter(x=>x.id!==item.id);tombstone(item.id);commit();}}
      return;
    }
    if(e.target.closest('#crmReportAll')){crmReport.month='';renderPage(true);}
    if(e.target.closest('#crmReportCsv'))crmExportReport();
  });
  $('#pageView').addEventListener('change',e=>{
    if(e.target.id==='crmReportMonth'){crmReport.month=e.target.value;renderPage(true);}
    else if(e.target.id==='crmReportProject'){crmReport.projectId=e.target.value;renderPage(true);}
  });
  let dupTimer;
  $('#detail').addEventListener('input',e=>{
    if(e.target.id!=='dTitle' && !e.target.dataset.field)return;
    clearTimeout(dupTimer);dupTimer=setTimeout(()=>{const t=taskById(selectedId),el=$('#crmDuplicates');if(t && el)el.innerHTML=crmDuplicateHtml(t);},250);
  });
}
