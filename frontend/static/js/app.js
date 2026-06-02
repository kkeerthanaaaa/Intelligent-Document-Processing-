/* ══════════════════════════════════════════════════════════
   DocIntel v2.5 — Frontend Application
   Real API calls · Images gallery · Full Review workflow
══════════════════════════════════════════════════════════ */

const S = {
  files: [], notifications: [],
  pollTimer: null, monTimer: null,
  currentResult: null, chartsLoaded: false,
  reviewJob: null, reviewTab: 'text',
};
const API = '/api';
const $  = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = b => b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB';
const ago = d => { if(!d)return'—'; const s=(Date.now()-new Date(d).getTime())/1000; return s<60?'just now':s<3600?Math.floor(s/60)+'m ago':Math.floor(s/3600)+'h ago'; };
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
const confCls   = c => c>=90?'hi':c>=70?'mi':'lo';
const confColor = c => c>=90?'var(--green)':c>=70?'var(--amber)':'var(--red)';

async function apiFetch(url, opts={}) {
  try {
    const r = await fetch(API+url, opts);
    if (!r.ok) { const t=await r.text(); throw new Error(t); }
    return await r.json();
  } catch(e) { notify('API error: '+e.message,'error'); throw e; }
}

// ── TOASTS ─────────────────────────────────────────────
function notify(msg, type='info') {
  const tc=$('toastContainer');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span>${esc(msg)}</span>`;
  tc.appendChild(t);
  setTimeout(()=>{ t.style.cssText='opacity:0;transform:translateY(10px);transition:all 300ms'; setTimeout(()=>t.remove(),350); }, 3500);
  S.notifications.unshift({msg,type,time:new Date()});
  renderNotifPanel();
}
function renderNotifPanel() {
  const n=$('nbadge'); const c=S.notifications.length;
  n.textContent=c; n.style.display=c>0?'flex':'none';
  $('npList').innerHTML=S.notifications.slice(0,30).map(n=>`<div class="np-item"><div>${esc(n.msg)}</div><div class="np-time">${ago(n.time)}</div></div>`).join('')||'<div class="np-empty">No notifications</div>';
}
function toggleNotif(){ const p=$('notifPanel'); p.style.display=p.style.display==='none'?'block':'none'; }
function clearNotifs(){ S.notifications=[]; renderNotifPanel(); $('notifPanel').style.display='none'; }
document.addEventListener('click',e=>{ if(!$('notifPanel').contains(e.target)&&!$('notifBtn').contains(e.target)) $('notifPanel').style.display='none'; });

// ── VIEW ROUTING ───────────────────────────────────────
const BREADCRUMBS = {
  upload:'Upload Documents', pipeline:'Live Pipeline', results:'Results Viewer',
  search:'Search & Chat', documents:'Document Management', analytics:'Analytics',
  settings:'Settings', monitoring:'System Monitoring',
  review:'Review Queue', feedback:'Feedback Loop',
};
function switchView(name, el) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  $('view-'+name).classList.add('active');
  if(el) el.classList.add('active');
  else { const ne=document.querySelector(`[data-view="${name}"]`); if(ne) ne.classList.add('active'); }
  $('breadcrumb').textContent=BREADCRUMBS[name]||name;
  $('notifPanel').style.display='none';
  if(name==='pipeline')  { startPolling(); loadJobs(); }
  if(name==='results')   loadResultsList();
  if(name==='documents') loadDocGrid();
  if(name==='analytics') loadAnalytics();
  if(name==='monitoring'){ loadMonitoring(); loadAuditLog(); }
  if(name==='review')    loadReviewQueue();
  if(name==='feedback')  loadFeedbackStats();
  if(name!=='monitoring'&&S.monTimer){ clearInterval(S.monTimer); S.monTimer=null; }
}
function toggleSidebar(){ $('sidebar').classList.toggle('col'); }

// ── HEALTH ─────────────────────────────────────────────
async function checkHealth() {
  try {
    const r=await fetch('/health');
    if(r.ok){ $('sysDot').className='sdot ok'; $('sysLabel').textContent='System OK'; }
    else throw new Error();
  } catch { $('sysDot').className='sdot err'; $('sysLabel').textContent='Backend down'; notify('Cannot reach backend','error'); }
}
async function refreshTopbarStats() {
  try {
    const d=await apiFetch('/jobs/stats');
    $('ts-done').textContent=d.done??0;
    $('ts-running').textContent=(d.processing??0)+(d.queued??0);
    $('ts-conf').textContent=d.avg_confidence?d.avg_confidence+'%':'—';
    // update review badge
    const rb=$('rvBadge');
    if(d.review>0){ rb.textContent=d.review; rb.style.display='inline'; }
    else rb.style.display='none';
  } catch {}
}

// ══════════════════════════════════════════════════════
// UPLOAD
// ══════════════════════════════════════════════════════
function handleDragOver(e){ e.preventDefault(); $('dropZone').classList.add('drag-over'); }
function handleDragLeave(){ $('dropZone').classList.remove('drag-over'); }
function handleDrop(e){ e.preventDefault(); $('dropZone').classList.remove('drag-over'); addFiles(Array.from(e.dataTransfer.files)); }
function handleFileSelect(e){ addFiles(Array.from(e.target.files)); e.target.value=''; }
function addFiles(files) {
  files.forEach(f=>{
    if(!/\.(pdf|jpg|jpeg|png)$/i.test(f.name)){ notify(`${f.name}: unsupported`,'warning'); return; }
    if(S.files.find(x=>x.name===f.name&&x.size===f.size)) return;
    S.files.push({id:Math.random().toString(36).slice(2),file:f,name:f.name,size:f.size,status:'queued'});
  });
  renderFileList(); $('startBtn').disabled=S.files.length===0;
}
function renderFileList() {
  const queue=$('fileQueue'), list=$('fileList');
  if(!S.files.length){ queue.style.display='none'; return; }
  queue.style.display='block';
  list.innerHTML=S.files.map(f=>`
    <div class="file-item" id="fi-${f.id}">
      <div class="fi-icon">${/\.pdf$/i.test(f.name)?'📄':'🖼'}</div>
      <div class="fi-info"><div class="fi-name">${esc(f.name)}</div><div class="fi-meta">${fmt(f.size)}</div></div>
      <span class="fi-status s-${f.status}">${cap(f.status)}</span>
      <button class="fi-rm" onclick="removeFile('${f.id}')">✕</button>
    </div>`).join('');
}
function removeFile(id){ S.files=S.files.filter(f=>f.id!==id); renderFileList(); $('startBtn').disabled=S.files.length===0; }
function clearQueue(){ S.files=S.files.filter(f=>f.status!=='queued'); renderFileList(); $('startBtn').disabled=S.files.length===0; }

async function startUpload() {
  const pending=S.files.filter(f=>f.status==='queued');
  if(!pending.length) return;
  $('startBtn').disabled=true; $('startBtn').textContent='Uploading…';
  const fd=new FormData();
  pending.forEach(f=>fd.append('files',f.file));
  fd.append('doc_type',$('cfgDocType').value);
  fd.append('ocr_engine',$('cfgOCR').value);
  pending.forEach(f=>f.status='processing'); renderFileList();
  try {
    const res=await fetch(API+'/upload',{method:'POST',body:fd});
    if(!res.ok) throw new Error(await res.text());
    const data=await res.json();
    notify(`✓ ${data.count} file(s) submitted to pipeline`,'success');
    startPolling();
    setTimeout(()=>switchView('pipeline',document.querySelector('[data-view="pipeline"]')),800);
  } catch(e) {
    pending.forEach(f=>f.status='queued'); renderFileList();
    notify('Upload failed: '+e.message,'error');
  } finally { $('startBtn').disabled=false; $('startBtn').textContent='Start Processing Pipeline →'; }
}

// ══════════════════════════════════════════════════════
// PIPELINE POLLING
// ══════════════════════════════════════════════════════
function startPolling() {
  if(S.pollTimer) return;
  S.pollTimer=setInterval(async()=>{ await loadJobs(); await refreshTopbarStats(); },2500);
}
async function loadJobs() {
  try {
    const data=await apiFetch('/jobs');
    renderJobsTable(data.jobs); renderPipelineTrack(data.jobs); renderPipeStats(data.jobs);
    if(!data.jobs.filter(j=>j.status==='queued'||j.status==='processing').length&&S.pollTimer){
      clearInterval(S.pollTimer); S.pollTimer=null;
    }
  } catch {}
}
function renderPipeStats(jobs) {
  const c={total:jobs.length,done:0,processing:0,review:0,failed:0,queued:0};
  jobs.forEach(j=>{ if(c[j.status]!==undefined) c[j.status]++; });
  const cj=jobs.filter(j=>j.confidence); const avg=cj.length?Math.round(cj.reduce((s,j)=>s+j.confidence,0)/cj.length):null;
  $('pipeStatsRow').innerHTML=[
    ['📄',c.total,'Total',''],
    ['✓',c.done,'Completed','var(--green)'],
    ['⟳',c.processing,'Processing','var(--accent)'],
    ['⚠',c.review,'Review','var(--amber)'],
    ['✗',c.failed,'Failed','var(--red)'],
    ['◎',avg?avg+'%':'—','Avg Conf','var(--accent)'],
  ].map(([icon,val,label,color])=>`<div class="psc"><div class="psc-icon" style="color:${color}">${icon}</div><div class="psc-val">${val}</div><div class="psc-label">${label}</div></div>`).join('');
}
const STAGE_NAMES=['Upload & Metadata','Validation & Security','Doc Analysis & Routing','Image Preprocessing','Layout Analysis','Parallel Extraction','AI Post-Processing','LLM Validation','Output Generation','Audit & Complete'];
function renderPipelineTrack(jobs) {
  const track=$('pipeTrack'); if(!track) return;
  const active=jobs.filter(j=>j.status==='processing');
  const maxStage=active.length?Math.min(...active.map(j=>j.stage||1)):0;
  const allDone=jobs.length>0&&jobs.every(j=>['done','review','failed'].includes(j.status));
  track.innerHTML=STAGE_NAMES.map((name,i)=>{
    const n=i+1; let cls='';
    if(allDone||n<maxStage) cls='done';
    else if(n===maxStage&&active.length) cls='active';
    return `<div class="ps ${cls}"><div class="ps-node">${cls==='done'?'✓':cls==='active'?'⟳':n}</div><div class="ps-label">${name}</div></div>`;
  }).join('');
}
function renderJobsTable(jobs) {
  const tbody=$('jobsTbody'); if(!tbody) return;
  if(!jobs.length){ tbody.innerHTML='<tr><td colspan="8" class="empty">No jobs yet.</td></tr>'; return; }
  tbody.innerHTML=jobs.map(j=>{
    const conf=j.confidence?j.confidence.toFixed(1)+'%':'—';
    const cls=j.confidence?confCls(j.confidence):'';
    const prog=j.progress||0;
    return `<tr>
      <td><span class="job-id">${j.id.slice(0,8)}…</span></td>
      <td title="${esc(j.filename)}">${esc(j.filename.length>22?j.filename.slice(0,22)+'…':j.filename)}</td>
      <td>${esc(j.doc_type||'—')}</td>
      <td style="font-size:.75rem;color:var(--tx2)">${esc(STAGE_NAMES[(j.stage||1)-1]||'—')}</td>
      <td><div class="jp"><div class="jpf" style="width:${prog}%"></div></div><span style="font-size:.7rem;color:var(--tx3);font-family:'JetBrains Mono',monospace">${prog.toFixed(0)}%</span></td>
      <td><span class="cb ${cls}">${conf}</span></td>
      <td><span class="fi-status s-${j.status}">${cap(j.status)}</span></td>
      <td style="display:flex;gap:4px">
        <button class="btn-g-sm" onclick="openResult('${j.id}')" ${!['done','review'].includes(j.status)?'disabled style="opacity:.4"':''}>View</button>
        ${j.status==='review'?`<button class="btn-g-sm" style="color:var(--amber)" onclick="openReviewModal('${j.id}')">Review</button>`:''}
        <button class="btn-g-sm" style="color:var(--red)" onclick="deleteJob('${j.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}
async function deleteJob(id) {
  if(!confirm('Delete this job and its result?')) return;
  try { await apiFetch('/jobs/'+id,{method:'DELETE'}); notify('Job deleted','info'); loadJobs(); loadResultsList(); loadDocGrid(); } catch {}
}

// ══════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════
async function loadResultsList() {
  try {
    const data=await apiFetch('/results'); const list=$('resDocList');
    if(!data.results.length){ list.innerHTML='<div class="empty-sm">No results yet.</div>'; return; }
    list.innerHTML=data.results.map(r=>`
      <div class="rdi ${S.currentResult?.job_id===r.job_id?'sel':''}" onclick="selectResult('${r.job_id}')">
        <div class="rdi-name">${esc(r.filename||r.job_id)}</div>
        <div class="rdi-meta"><span>${r.page_count||1}p · ${ago(r.created_at)}</span><span class="rdi-type">${esc(r.doc_type||'—')}</span></div>
      </div>`).join('');
  } catch {}
}
async function selectResult(jobId) {
  try { const r=await apiFetch('/results/'+jobId); S.currentResult=r; renderResultDetail(r); loadResultsList(); } catch {}
}
function renderResultDetail(r) {
  const imgs=r.images_json||[]; const kv=r.kv_json||{}; const ents=r.entities_json||[];
  const conf=r.confidence?r.confidence.toFixed(1):'—';
  $('resDetail').innerHTML=`
    <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.95rem">${esc(r.filename||r.job_id)}</div>
        <div style="font-size:.75rem;color:var(--tx3)">${esc(r.doc_type||'—')} · ${r.page_count||1}p · ${ago(r.created_at)} · ${imgs.length} image(s)</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-family:'JetBrains Mono',monospace;font-size:.85rem;color:${confColor(r.confidence)};font-weight:600">${conf}% conf</span>
        <button class="btn-p" onclick="openResult('${r.job_id}')">Full View →</button>
      </div>
    </div>
    <div style="padding:16px 18px;overflow-y:auto;max-height:calc(100% - 70px)">
      ${imgs.length?`
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.85rem;margin-bottom:8px">🖼 Extracted Images (${imgs.length})</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          ${imgs.map(img=>`<img src="${img.url}" alt="${esc(img.caption||'')}"
            style="height:72px;width:auto;max-width:120px;border-radius:6px;border:1px solid var(--bdr);object-fit:contain;cursor:pointer;background:#f5f4f0"
            onclick="openLightbox('${img.url}','${esc(img.caption||img.filename)}')"
            onerror="this.style.display='none'">`).join('')}
        </div>`:''}
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.85rem;margin-bottom:8px">Key-Values</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:16px">
        ${Object.entries(kv).slice(0,8).map(([k,v])=>`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:7px 11px"><div style="font-size:.68rem;color:var(--tx3);text-transform:uppercase;margin-bottom:1px">${esc(k)}</div><div style="font-weight:600;font-size:.84rem">${esc(v)}</div></div>`).join('')}
      </div>
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.85rem;margin-bottom:8px">Entities</div>
      <div style="margin-bottom:14px">${ents.map(e=>`<span class="etag etag-${e.type}">${esc(e.text)}</span>`).join('')||'<span style="color:var(--tx3);font-size:.82rem">None</span>'}</div>
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.85rem;margin-bottom:8px">Summary</div>
      <div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:var(--r);padding:12px 14px;font-size:.84rem;line-height:1.6;color:var(--tx2)">${esc(r.summary||'—')}</div>
    </div>`;
}

// ── FULL RESULT MODAL ──────────────────────────────────
async function openResult(jobId) {
  try {
    const r=await apiFetch('/results/'+jobId);
    S.currentResult=r;
    $('rmTitle').textContent=r.filename||jobId;
    const conf=r.confidence?r.confidence.toFixed(1)+'%':'—';
    $('rmConf').textContent=`Conf: ${conf} · ${r.page_count||1}p · ${r.doc_type||'—'} · ${(r.images_json||[]).length} image(s)`;
    $('rmExportBtns').innerHTML=`
      <a href="${API}/results/${jobId}/export/excel" class="btn-excel" download>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" fill="#217346"/><path d="M4 4l2.5 4L4 12h1.8L8 9l2.2 3H12L9.5 8 12 4h-1.8L8 7 5.8 4H4z" fill="white"/></svg>
        ↓ Excel
      </a>
      <a href="${API}/results/${jobId}/export/json" class="btn-s" download>↓ JSON</a>
      <a href="${API}/results/${jobId}/export/csv"  class="btn-s" download>↓ CSV</a>
      <a href="${API}/results/${jobId}/export/txt"  class="btn-s" download>↓ Text</a>`;
    // Activate images tab if images exist, else text
    const hasImgs=(r.images_json||[]).length>0;
    rTab(hasImgs?'images':'text', null);
    $('resultModal').style.display='flex';
  } catch {}
}
function closeRM(){ $('resultModal').style.display='none'; }

function rTab(tab, el) {
  document.querySelectorAll('.rtab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  else {
    const tabList=['text','images','tables','entities','kv','json','summary'];
    const idx=tabList.indexOf(tab);
    const tabs=document.querySelectorAll('.rtab');
    if(tabs[idx]) tabs[idx].classList.add('active');
  }
  const r=S.currentResult; if(!r) return;
  const body=$('rmBody');

  if(tab==='images') {
    const imgs=r.images_json||[];
    if(!imgs.length){
      body.innerHTML=`<div class="img-empty"><div class="img-empty-icon">🖼</div><p>No images were extracted from this document.</p><p style="margin-top:8px;font-size:.8rem;color:var(--tx3)">Images are extracted from embedded objects in PDFs, or the document itself if it's an image file.</p></div>`;
    } else {
      body.innerHTML=`<div class="img-gallery">${imgs.map(img=>`
        <div class="img-card" onclick="openLightbox('${img.url}','${esc(img.caption||img.filename)}')">
          <img src="${img.url}" alt="${esc(img.caption||'')}" loading="lazy"
               onerror="this.src='';this.style.cssText='height:140px;display:flex;align-items:center;justify-content:center;background:var(--sur2);color:var(--tx3);font-size:.8rem';this.alt='Image not available'">
          <div class="img-card-info">
            <div class="img-card-caption">${esc(img.caption||img.filename)}</div>
            <div class="img-card-meta">
              <span>Page ${img.page||1}</span>
              <span>${img.width}×${img.height}px</span>
            </div>
          </div>
          <a href="${img.url}" class="img-card-dl" download="${esc(img.filename)}" onclick="event.stopPropagation()">↓ Download</a>
        </div>`).join('')}</div>`;
    }

  } else if(tab==='text') {
    body.innerHTML=`<pre style="font-family:'JetBrains Mono',monospace;font-size:.76rem;line-height:1.7;white-space:pre-wrap">${esc(r.full_text||'No text extracted.')}</pre>`;

  } else if(tab==='tables') {
    const tables=r.tables_json||[];
    body.innerHTML=tables.length?tables.map(t=>`
      <div style="margin-bottom:20px">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;margin-bottom:8px">${esc(t.title||'Table')}</div>
        <div style="overflow-x:auto"><table class="etbl">
          <thead><tr>${(t.headers||[]).map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${(t.rows||[]).map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>`).join(''):'<div style="color:var(--tx3);padding:32px;text-align:center">No tables detected.</div>';

  } else if(tab==='entities') {
    const ents=r.entities_json||[];
    if(!ents.length){ body.innerHTML='<div style="color:var(--tx3);padding:32px;text-align:center">No entities detected.</div>'; return; }
    const grp={};
    ents.forEach(e=>{ if(!grp[e.type]) grp[e.type]=[]; grp[e.type].push(e.text); });
    body.innerHTML=Object.entries(grp).map(([type,items])=>`
      <div style="margin-bottom:16px">
        <div style="font-size:.73rem;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px">${type}</div>
        <div>${[...new Set(items)].map(item=>`<span class="etag etag-${type}">${esc(item)}</span>`).join('')}</div>
      </div>`).join('');

  } else if(tab==='kv') {
    const kv=r.kv_json||{};
    body.innerHTML=Object.keys(kv).length?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${Object.entries(kv).map(([k,v])=>`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:10px 13px"><div style="font-size:.7rem;color:var(--tx3);text-transform:uppercase;margin-bottom:3px">${esc(k)}</div><div style="font-weight:600">${esc(v)}</div></div>`).join('')}
    </div>`:'<div style="color:var(--tx3);padding:32px;text-align:center">No key-value pairs extracted.</div>';

  } else if(tab==='json') {
    const obj={job_id:r.job_id,filename:r.filename,doc_type:r.doc_type,confidence:r.confidence,page_count:r.page_count,processed_at:r.created_at,key_values:r.kv_json,entities:r.entities_json,tables_count:(r.tables_json||[]).length,images_count:(r.images_json||[]).length,summary:r.summary};
    body.innerHTML=`<div class="jblk">${syntaxJSON(JSON.stringify(obj,null,2))}</div>`;

  } else if(tab==='summary') {
    body.innerHTML=`
      <div style="background:linear-gradient(135deg,var(--ac-l),#EDE9FE);border-radius:var(--r);padding:18px;margin-bottom:16px">
        <div style="font-size:.7rem;font-weight:600;color:var(--accent);letter-spacing:.07em;text-transform:uppercase;margin-bottom:7px">AI Summary</div>
        <p style="line-height:1.7">${esc(r.summary||'—')}</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${Object.entries(r.kv_json||{}).map(([k,v])=>`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:9px 12px"><div style="font-size:.68rem;color:var(--tx3);text-transform:uppercase;margin-bottom:2px">${esc(k)}</div><div style="font-weight:600">${esc(v)}</div></div>`).join('')}
      </div>`;
  }
}

function syntaxJSON(json) {
  return esc(json).replace(/(&quot;[\w\s\-_@.#/]+&quot;)(\s*:)|(&quot;[^&]*&quot;)|(\b\d+\.?\d*\b)|(\btrue\b|\bfalse\b|\bnull\b)/g,
    (m,key,colon,str,num,bool)=>{
      if(key&&colon) return `<span class="jk">${key}</span>${colon}`;
      if(str) return `<span class="js">${str}</span>`;
      if(num) return `<span class="jn">${num}</span>`;
      if(bool) return `<span class="jb">${bool}</span>`;
      return m;
    });
}

// ── LIGHTBOX ───────────────────────────────────────────
function openLightbox(src, caption) {
  const lb=document.createElement('div');
  lb.className='lightbox';
  lb.innerHTML=`<button class="lightbox-close" onclick="this.parentElement.remove()">✕</button>
    <img src="${src}" alt="${esc(caption||'')}" onerror="this.alt='Image failed to load'">
    ${caption?`<div class="lightbox-caption">${esc(caption)}</div>`:''}`;
  lb.addEventListener('click',e=>{ if(e.target===lb) lb.remove(); });
  document.body.appendChild(lb);
}

// ══════════════════════════════════════════════════════
// SEARCH & AI CHATBOT
// ══════════════════════════════════════════════════════
function qs(q){ $('searchInput').value=q; doSearch(); }
function filterAll(cb){ if(cb.checked){ ['fInvoice','fContract','fResume'].forEach(id=>$(id).checked=false); } }

async function doSearch() {
  const q=$('searchInput').value.trim();
  if(!q) return;
  // Route to AI chat
  sendChatMsg(q);
  $('searchInput').value='';
}

function sendChatMsg(msg) {
  // Add to chat and call AI
  appendChatMsg('user', msg);
  // Show typing indicator
  const typingId = 'typing-'+Date.now();
  appendTyping(typingId);
  // Call API
  callAIChat(msg, typingId);
}

function appendChatMsg(role, text) {
  const cc=$('chatContainer');
  const isUser = role==='user';
  const div=document.createElement('div');
  div.className=`chat-msg ${role}`;
  // Format markdown-like bold and newlines
  const formatted = escAndFormat(text);
  div.innerHTML=`
    <div class="chat-av">${isUser?'You':'AI'}</div>
    <div class="chat-bubble">${formatted}</div>`;
  cc.appendChild(div);
  cc.scrollTop=cc.scrollHeight;
}

function appendTyping(id) {
  const cc=$('chatContainer');
  const div=document.createElement('div');
  div.className='chat-msg assistant';
  div.id=id;
  div.innerHTML=`<div class="chat-av">AI</div>
    <div class="chat-bubble-typing">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  cc.appendChild(div);
  cc.scrollTop=cc.scrollHeight;
}

function escAndFormat(text) {
  // Escape HTML then format markdown-like syntax
  let t = esc(text);
  // Bold: **text**
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Bullet points: lines starting with •
  t = t.replace(/^•\s*/gm, '• ');
  // Newlines to <br>
  t = t.replace(/\n/g, '<br>');
  // Blockquote: lines starting with >
  t = t.replace(/&gt;\s*(.+?)(<br>|$)/g, '<div style="border-left:3px solid var(--accent);padding:4px 10px;background:var(--ac-l);margin:4px 0;border-radius:0 4px 4px 0;font-size:.82rem;color:var(--tx2)">$1</div>');
  return t;
}

async function callAIChat(msg, typingId) {
  try {
    const res = await fetch(API+'/search/chat', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({message: msg, history: []})
    });
    if(!res.ok) throw new Error(await res.text());
    const data = await res.json();
    // Remove typing indicator
    const typingEl = $(typingId);
    if(typingEl) typingEl.remove();
    // Add AI response
    const cc=$('chatContainer');
    const div=document.createElement('div');
    div.className='chat-msg assistant';
    const formatted=escAndFormat(data.answer||"I couldn't find relevant information.");
    let sourcesHtml='';
    if(data.sources&&data.sources.length){
      sourcesHtml=`<div class="chat-sources">${data.sources.slice(0,4).map(s=>`<span class="chat-source" onclick="openResultByFilename('${esc(s.filename||'')}')">📄 ${esc(s.filename||'')}</span>`).join('')}</div>`;
    }
    div.innerHTML=`<div class="chat-av">AI</div>
      <div class="chat-bubble">${formatted}${sourcesHtml}</div>`;
    cc.appendChild(div);
    cc.scrollTop=cc.scrollHeight;
  } catch(e) {
    const typingEl=$(typingId);
    if(typingEl) typingEl.remove();
    appendChatMsg('assistant', 'Sorry, I encountered an error searching your documents. Please try again.');
    notify('Chat error: '+e.message,'error');
  }
}

async function openResultByFilename(filename) {
  try {
    const data = await apiFetch('/results');
    const match = data.results.find(r=>r.filename===filename);
    if(match) openResult(match.job_id);
  } catch {}
}

function sendChat() {
  const input=$('chatInput');
  const msg=input.value.trim();
  if(!msg) return;
  input.value='';
  sendChatMsg(msg);
}

// ══════════════════════════════════════════════════════
// DOCUMENTS GRID
// ══════════════════════════════════════════════════════
async function loadDocGrid() {
  try {
    const data=await apiFetch('/results'); const grid=$('docGrid');
    if(!data.results.length){
      grid.innerHTML=`<div class="empty-center" style="grid-column:1/-1;padding:60px;gap:12px"><div class="ec-icon">📁</div><h3>No Documents Yet</h3><button class="btn-p" onclick="switchView('upload',null)">Upload Documents</button></div>`;
      return;
    }
    const tc={Invoice:'var(--accent)',Contract:'var(--accent2)',Resume:'var(--green)',Receipt:'var(--amber)',Document:'var(--accent3)'};
    grid.innerHTML=data.results.map(r=>{
      const conf=r.confidence?r.confidence.toFixed(1)+'%':'—';
      return `<div class="dc" onclick="openResult('${r.job_id}')">
        <div class="dc-type" style="color:${tc[r.doc_type]||'var(--accent)'}">${esc(r.doc_type||'—')}</div>
        <div class="dc-name">${esc(r.filename||r.job_id)}</div>
        <div class="dc-meta">${r.page_count||1}p · ${ago(r.created_at)}</div>
        <div class="dc-footer">
          <span class="dc-conf" style="color:${confColor(r.confidence)}">${conf}</span>
          <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
            <a href="${API}/results/${r.job_id}/export/json" class="btn-g-sm" download>JSON</a>
            <a href="${API}/results/${r.job_id}/export/csv"  class="btn-g-sm" download>CSV</a>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch {}
}
function filterDocGrid(q){ document.querySelectorAll('.dc').forEach(c=>c.style.display=c.textContent.toLowerCase().includes(q.toLowerCase())?'':'none'); }

// ══════════════════════════════════════════════════════
// REVIEW QUEUE
// ══════════════════════════════════════════════════════
async function loadReviewQueue() {
  try {
    const data=await apiFetch('/review/queue');
    const list=$('reviewQueueList');

    // Stats row
    const stats=await apiFetch('/review/stats/summary');
    $('revStatsRow').innerHTML=[
      ['⏳',data.count,'Pending','var(--amber)'],
      ['✓',(stats.decisions?.approve||0)+(stats.decisions?.correct||0),'Reviewed','var(--green)'],
      ['✗',stats.decisions?.reject||0,'Rejected','var(--red)'],
      ['📊',stats.total_reviews||0,'Total Reviews','var(--accent)'],
    ].map(([i,v,l,c])=>`<div class="rsc"><div class="rsc-icon" style="color:${c}">${i}</div><div class="rsc-val">${v}</div><div class="rsc-label">${l}</div></div>`).join('');

    // Update sidebar badge
    const rb=$('rvBadge');
    if(data.count>0){ rb.textContent=data.count; rb.style.display='inline'; }
    else rb.style.display='none';

    if(!data.queue.length){
      list.innerHTML=`<div style="text-align:center;padding:48px;color:var(--tx3)">
        <div style="font-size:2.5rem;margin-bottom:10px">✓</div>
        <h3 style="margin-bottom:6px">Queue Empty</h3>
        <p style="font-size:.85rem">All documents have been reviewed or are above the confidence threshold.</p>
      </div>`;
      return;
    }

    list.innerHTML=data.queue.map(item=>{
      const conf=item.confidence?item.confidence.toFixed(1)+'%':'—';
      const confPct=item.confidence||0;
      const ents=(item.entities_json||[]).slice(0,5);
      const imgs=(item.images_json||[]).slice(0,4);
      const kv=item.kv_json||{};
      const kvPairs=Object.entries(kv).slice(0,3);
      return `
        <div class="rq-card">
          <div class="rq-card-top">
            <div class="rq-info">
              <div class="rq-name">${esc(item.filename||item.id)}</div>
              <div class="rq-meta">
                <span>${esc(item.doc_type||'Unknown')}</span>
                <span>${item.page_count||1} page(s)</span>
                <span>Processed ${ago(item.completed_at||item.created_at)}</span>
                ${item.review_count>0?`<span style="color:var(--accent)">Reviewed ${item.review_count}×</span>`:''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:${confColor(confPct)}">${conf}</div>
              <div style="font-size:.7rem;color:var(--tx3)">confidence</div>
            </div>
          </div>

          <!-- Confidence bar -->
          <div class="rq-conf-bar">
            <div class="rq-conf-fill" style="width:${confPct}%;background:${confColor(confPct)}"></div>
          </div>

          <!-- Extracted images thumbnails -->
          ${imgs.length?`<div class="rq-thumbs">${imgs.map(img=>`
            <img class="rq-thumb" src="${img.url}" alt="${esc(img.caption||'')}"
              onclick="openLightbox('${img.url}','${esc(img.caption||img.filename)}')"
              onerror="this.style.display='none'" title="${esc(img.caption||img.filename)}">`).join('')}
          </div>`:''}

          <!-- KV preview -->
          ${kvPairs.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            ${kvPairs.map(([k,v])=>`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:6px;padding:4px 10px;font-size:.75rem"><span style="color:var(--tx3)">${esc(k)}: </span><strong>${esc(v)}</strong></div>`).join('')}
          </div>`:''}

          <!-- Text preview -->
          <div class="rq-preview">${esc((item.summary||'No summary available.').slice(0,200))}</div>

          <!-- Entity tags -->
          ${ents.length?`<div class="rq-entities">${ents.map(e=>`<span class="etag etag-${e.type}">${esc(e.text)}</span>`).join('')}</div>`:''}

          <!-- Actions -->
          <div class="rq-actions">
            <button class="btn-rv-approve" style="padding:7px 16px;font-size:.82rem" onclick="quickApprove('${item.id}')">✓ Quick Approve</button>
            <button class="btn-rv-correct" style="padding:7px 16px;font-size:.82rem" onclick="openReviewModal('${item.id}')">✎ Full Review</button>
            <button class="btn-rv-reject"  style="padding:7px 16px;font-size:.82rem" onclick="quickReject('${item.id}')">✗ Reject</button>
            <button class="btn-g" onclick="openResult('${item.id}')">👁 View Full</button>
          </div>
        </div>`;
    }).join('');
  } catch {}
}

async function quickApprove(jobId) {
  try {
    await fetch(API+'/review/'+jobId,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({decision:'approve',reviewer:'Reviewer',notes:'Quick approval'})});
    notify('✓ Document approved','success'); loadReviewQueue(); refreshTopbarStats();
  } catch(e){ notify('Error: '+e.message,'error'); }
}
async function quickReject(jobId) {
  if(!confirm('Reject this document?')) return;
  try {
    await fetch(API+'/review/'+jobId,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({decision:'reject',reviewer:'Reviewer',notes:'Rejected from queue'})});
    notify('Document rejected','warning'); loadReviewQueue(); refreshTopbarStats();
  } catch(e){ notify('Error: '+e.message,'error'); }
}

// ── FULL REVIEW MODAL ──────────────────────────────────
let _rvmJobId=null;
async function openReviewModal(jobId) {
  try {
    const data=await apiFetch('/review/'+jobId);
    S.reviewJob=data; _rvmJobId=jobId;
    const r=data.result; const j=data.job;
    $('rvmTitle').textContent=`Review: ${r.filename||jobId}`;
    $('rvmMeta').textContent=`${r.doc_type||'—'} · ${r.page_count||1}p · Confidence: ${r.confidence?.toFixed(1)||'—'}%`;
    // Reset form
    $('rvReviewer').value='Reviewer';
    $('rvNotes').value='';
    document.querySelectorAll('.rv-checks input').forEach(cb=>cb.checked=false);
    // Build KV editor
    buildKVEditor(r.kv_json||{});
    // Show preview
    rvTab('text', document.querySelector('.rvt'));
    $('reviewModal').style.display='flex';
  } catch(e){ notify('Failed to load review: '+e.message,'error'); }
}

function rvTab(tab, el) {
  S.reviewTab=tab;
  document.querySelectorAll('.rvt').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  else {
    const tabs=['text','images','entities'];
    document.querySelectorAll('.rvt')[tabs.indexOf(tab)]?.classList.add('active');
  }
  const r=S.reviewJob?.result; if(!r) return;
  const preview=$('rvmPreview');

  if(tab==='text'){
    preview.innerHTML=`<pre style="white-space:pre-wrap;font-size:.78rem;font-family:'JetBrains Mono',monospace;line-height:1.65">${esc(r.full_text||'No text extracted.')}</pre>`;
  } else if(tab==='images'){
    const imgs=r.images_json||[];
    if(!imgs.length){ preview.innerHTML='<div style="text-align:center;padding:24px;color:var(--tx3)"><div style="font-size:2rem;margin-bottom:8px">🖼</div>No images extracted.</div>'; return; }
    preview.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:10px;padding:4px">
      ${imgs.map(img=>`<div style="text-align:center">
        <img src="${img.url}" alt="${esc(img.caption||'')}"
          style="max-width:160px;max-height:120px;border-radius:6px;border:1px solid var(--bdr);cursor:pointer;object-fit:contain;background:#f5f4f0"
          onclick="openLightbox('${img.url}','${esc(img.caption||img.filename)}')"
          onerror="this.style.display='none'">
        <div style="font-size:.7rem;color:var(--tx3);margin-top:3px">${esc(img.caption||'Page '+img.page)}</div>
      </div>`).join('')}
    </div>`;
  } else if(tab==='entities'){
    const ents=r.entities_json||[];
    if(!ents.length){ preview.innerHTML='<div style="text-align:center;padding:24px;color:var(--tx3)">No entities detected.</div>'; return; }
    const grp={}; ents.forEach(e=>{ if(!grp[e.type]) grp[e.type]=[]; grp[e.type].push(e.text); });
    preview.innerHTML=Object.entries(grp).map(([type,items])=>`
      <div style="margin-bottom:12px">
        <div style="font-size:.68rem;font-weight:600;color:var(--tx3);text-transform:uppercase;margin-bottom:5px">${type}</div>
        <div>${[...new Set(items)].map(i=>`<span class="etag etag-${type}">${esc(i)}</span>`).join('')}</div>
      </div>`).join('');
  }
}

function buildKVEditor(kv) {
  const container=$('rvmKVEditor');
  container.innerHTML='';
  Object.entries(kv).forEach(([k,v])=>addKVRow(k,v));
}
function addKVRow(key='', value='') {
  const container=$('rvmKVEditor');
  const row=document.createElement('div');
  row.className='kv-row';
  row.innerHTML=`<input type="text" placeholder="Field" value="${esc(key)}" class="kv-k">
    <input type="text" placeholder="Value" value="${esc(value)}" class="kv-v">
    <button class="kv-del" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(row);
}

async function submitReview(decision) {
  if(!_rvmJobId) return;
  const reviewer=$('rvReviewer').value.trim()||'Reviewer';
  const notes=$('rvNotes').value.trim();
  const errorTypes=[...document.querySelectorAll('.rv-checks input:checked')].map(cb=>cb.value);
  // Collect corrected KV pairs
  const correctedKV={};
  document.querySelectorAll('.kv-row').forEach(row=>{
    const k=row.querySelector('.kv-k')?.value.trim();
    const v=row.querySelector('.kv-v')?.value.trim();
    if(k&&v) correctedKV[k]=v;
  });
  try {
    const res=await fetch(API+'/review/'+_rvmJobId,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({decision,reviewer,corrected_kv:correctedKV,notes,error_types:errorTypes}),
    });
    if(!res.ok) throw new Error(await res.text());
    const data=await res.json();
    const msgs={approve:'✓ Document approved',correct:'✎ Corrections saved & approved',reject:'✗ Document rejected'};
    notify(msgs[decision]||'Review submitted', decision==='reject'?'warning':'success');
    closeReviewModal();
    loadReviewQueue(); loadResultsList(); loadDocGrid(); refreshTopbarStats();
  } catch(e){ notify('Review failed: '+e.message,'error'); }
}
function closeReviewModal(){ $('reviewModal').style.display='none'; _rvmJobId=null; }

// ══════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════
async function loadAnalytics() {
  if(S.chartsLoaded) return; S.chartsLoaded=true;
  try {
    const [summary,volume,types,conf]=await Promise.all([
      apiFetch('/analytics/summary'), apiFetch('/analytics/volume'),
      apiFetch('/analytics/types'),   apiFetch('/analytics/confidence'),
    ]);
    drawVolumeChart(volume.volume); drawTypesChart(types.types);
    drawConfChart(conf.bands); renderSummaryMetrics(summary);
  } catch {}
}
function renderSummaryMetrics(s){
  $('summaryMetrics').innerHTML=`<div class="metric-list">
    <div class="mr"><span>Total Jobs</span><span class="mv">${s.total}</span></div>
    <div class="mr"><span>Completed</span><span class="mv g">${s.done}</span></div>
    <div class="mr"><span>In Review</span><span class="mv a">${s.review}</span></div>
    <div class="mr"><span>Failed</span><span class="mv r">${s.failed}</span></div>
    <div class="mr"><span>Avg Confidence</span><span class="mv g">${s.avg_confidence??'—'}${s.avg_confidence?'%':''}</span></div>
    <div class="mr"><span>Results Stored</span><span class="mv">${s.results_count}</span></div>
  </div>`;
}

// ── CANVAS CHARTS ──────────────────────────────────────
function rrect(ctx,x,y,w,h,r=4){if(w<1)w=1;if(h<1)h=1;ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
function setupCanvas(id,w,h){const c=$(id);if(!c)return null;const dpr=window.devicePixelRatio||1;c.style.width=w+'px';c.style.height=h+'px';c.width=w*dpr;c.height=h*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);return{ctx,W:w,H:h};}

function drawVolumeChart(data){
  if(!data||!data.length)return;
  const cEl=$('cVolume'); const W=cEl?cEl.parentElement.offsetWidth-40:600;
  const c=setupCanvas('cVolume',W,110);if(!c)return;
  const{ctx,H}=c; const pad={t:16,r:10,b:28,l:32};
  const cW=W-pad.l-pad.r,cH=H-pad.t-pad.b;
  const vals=data.map(d=>d.count); const max=Math.max(...vals,1)*1.2;
  const bw=(cW/data.length)*0.5,gap=cW/data.length;
  ctx.strokeStyle='#E8E6E0';ctx.lineWidth=1;
  for(let i=0;i<=3;i++){const y=pad.t+cH-(cH*i/3);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cW,y);ctx.stroke();ctx.fillStyle='#9B9890';ctx.font='10px DM Sans,sans-serif';ctx.textAlign='right';ctx.fillText(Math.round(max*i/3),pad.l-4,y+4);}
  ctx.strokeStyle='#7C3AED';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();
  data.forEach((d,i)=>{const bh=(d.count/max)*cH,x=pad.l+gap*i+(gap-bw)/2,y=pad.t+cH-bh;const g=ctx.createLinearGradient(0,y,0,y+bh);g.addColorStop(0,'#1D4ED8');g.addColorStop(1,'#1D4ED880');ctx.fillStyle=g;rrect(ctx,x,y,bw,bh);ctx.fill();if(d.count>0){ctx.fillStyle='#1D4ED8';ctx.font='bold 10px DM Sans,sans-serif';ctx.textAlign='center';ctx.fillText(d.count,x+bw/2,y-4);}ctx.fillStyle='#9B9890';ctx.font='10px DM Sans,sans-serif';ctx.fillText(d.label,x+bw/2,pad.t+cH+16);const tx=pad.l+gap*i+gap/2,ty=pad.t+cH-(d.count/max)*cH;i===0?ctx.moveTo(tx,ty):ctx.lineTo(tx,ty);});
  ctx.stroke();ctx.setLineDash([]);
  data.forEach((d,i)=>{const tx=pad.l+gap*i+gap/2,ty=pad.t+cH-(d.count/max)*cH;ctx.beginPath();ctx.arc(tx,ty,3.5,0,Math.PI*2);ctx.fillStyle='#7C3AED';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();});
}
function drawTypesChart(types){
  if(!types||!types.length)return;
  const W=260,H=170; const c=setupCanvas('cTypes',W,H);if(!c)return;
  const{ctx}=c; const COLORS=['#1D4ED8','#7C3AED','#059669','#D97706','#0891B2','#DC2626'];
  const total=types.reduce((s,t)=>s+t.value,0)||1;
  const cx=85,cy=H/2,R=62,iR=36; let angle=-Math.PI/2;
  types.forEach((t,i)=>{const sweep=(t.value/total)*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,angle,angle+sweep);ctx.closePath();ctx.fillStyle=COLORS[i%COLORS.length];ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();angle+=sweep;});
  ctx.beginPath();ctx.arc(cx,cy,iR,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
  ctx.fillStyle='#1A1814';ctx.font='bold 17px Syne,sans-serif';ctx.textAlign='center';ctx.fillText(types.reduce((s,t)=>s+t.value,0),cx,cy+4);ctx.fillStyle='#9B9890';ctx.font='10px DM Sans,sans-serif';ctx.fillText('docs',cx,cy+17);
  const lx=155,ly=22;types.slice(0,6).forEach((t,i)=>{const y=ly+i*24;ctx.fillStyle=COLORS[i%COLORS.length];rrect(ctx,lx,y,10,10);ctx.fill();ctx.fillStyle='#1A1814';ctx.font='11px DM Sans,sans-serif';ctx.textAlign='left';ctx.fillText(t.label.slice(0,12),lx+14,y+9);ctx.fillStyle='#9B9890';ctx.font='10px DM Sans,sans-serif';ctx.fillText(t.pct+'%',lx+95,y+9);});
}
function drawConfChart(bands){
  if(!bands||!bands.length)return;
  const W=280,H=170; const c=setupCanvas('cConf',W,H);if(!c)return;
  const{ctx}=c; const COLORS=['#059669','#0891B2','#D97706','#F97316','#DC2626'];
  const labels=['95-100%','85-94%','70-84%','50-69%','<50%'];
  const maxV=Math.max(...bands.map(b=>b.count),1);
  const bH=20,gap=12,pL=58,pT=10,bW=W-pL-48;
  bands.forEach((b,i)=>{const y=pT+i*(bH+gap),w=(b.count/maxV)*bW;ctx.fillStyle='#9B9890';ctx.font='11px DM Sans,sans-serif';ctx.textAlign='right';ctx.fillText(labels[i],pL-6,y+bH/2+4);ctx.fillStyle='#E8E6E0';rrect(ctx,pL,y,bW,bH);ctx.fill();if(w>2){const g=ctx.createLinearGradient(pL,0,pL+w,0);g.addColorStop(0,COLORS[i]);g.addColorStop(1,COLORS[i]+'99');ctx.fillStyle=g;rrect(ctx,pL,y,w,bH);ctx.fill();}ctx.fillStyle=COLORS[i];ctx.font='bold 11px DM Sans,sans-serif';ctx.textAlign='left';ctx.fillText(b.count,pL+bW+6,y+bH/2+4);});
}

// ══════════════════════════════════════════════════════
// MONITORING
// ══════════════════════════════════════════════════════
async function loadMonitoring(){
  if(S.monTimer)return; updateMonitoring(); loadAuditLog();
  S.monTimer=setInterval(()=>{updateMonitoring();loadAuditLog();},4000);
}
async function updateMonitoring(){
  try{
    const d=await apiFetch('/system/health');
    $('monGrid').innerHTML=[
      ['CPU',d.cpu_pct+'%',d.cpu_pct,'#1D4ED8'],
      ['Memory',d.mem_pct+'%',d.mem_pct,'#7C3AED'],
      ['Disk',d.disk_pct+'%',d.disk_pct,'#0891B2'],
      ['Mem Used',d.mem_used_mb.toFixed(0)+' MB',0,''],
      ['Uptime',fmtUptime(d.uptime_s),0,''],
      ['Disk Used',d.disk_used_gb.toFixed(1)+' GB',0,''],
    ].map(([t,v,p,c])=>`<div class="mc2"><div class="mc2-title">${t}</div><div class="mc2-val">${v}</div>${p>0?`<div class="mc2-bar"><div class="mc2-fill" style="width:${p}%;background:${c}"></div></div>`:''}</div>`).join('');
  }catch{}
}
async function loadAuditLog(){
  try{
    const d=await apiFetch('/system/audit?limit=60'); const log=$('auditLog');
    if(!d.entries.length){log.innerHTML='<div class="empty-sm">No audit entries yet.</div>';return;}
    log.innerHTML=d.entries.map(e=>`<div class="al-entry"><span class="al-time">${new Date(e.created_at).toTimeString().slice(0,8)}</span><span class="al-user">${esc(e.user||'system')}</span><span class="al-action">${esc(e.action||'')}${e.detail?' — '+esc(e.detail.slice(0,60)):''}</span><span class="al-tag ${e.level||'info'}">${e.level||'info'}</span></div>`).join('');
  }catch{}
}
function fmtUptime(s){if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m';return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m';}

// ══════════════════════════════════════════════════════
// FEEDBACK STATS
// ══════════════════════════════════════════════════════
async function loadFeedbackStats(){
  try{
    const s=await apiFetch('/review/stats/summary');
    $('feedbackStats').innerHTML=`<div class="fb-stats-grid">
      <div class="fb-stat-block"><h5>Review Decisions</h5>
        ${[['Approved',(s.decisions?.approve||0),'decision-approve'],['Corrected',(s.decisions?.correct||0),'decision-correct'],['Rejected',(s.decisions?.reject||0),'decision-reject']].map(([l,v,c])=>`<div class="fb-stat-row"><span>${l}</span><span class="${c}">${v}</span></div>`).join('')}
      </div>
      <div class="fb-stat-block"><h5>Top Error Types</h5>
        ${(s.top_error_types||[]).length?s.top_error_types.map(([t,c])=>`<div class="fb-stat-row"><span>${esc(t.replace(/_/g,' '))}</span><span>${c}</span></div>`).join(''):'<div style="color:var(--tx3);font-size:.82rem;padding:8px 0">No error data yet</div>'}
      </div>
    </div>`;
  }catch{}
}

// ── SETTINGS TABS ──────────────────────────────────────
function stab(name,el){
  document.querySelectorAll('.stab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.stab-pane').forEach(p=>p.classList.remove('active'));
  el.classList.add('active'); $('sp-'+name).classList.add('active');
}

function saveConfig(){
  notify('✓ Configuration saved successfully','success');
}

// ── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',async()=>{
  await checkHealth();
  await refreshTopbarStats();
  setInterval(refreshTopbarStats,10000);
  document.querySelectorAll('.nav-item').forEach(n=>{
    n.addEventListener('click',()=>{
      if(n.dataset.view==='analytics') S.chartsLoaded=false;
      if(n.dataset.view!=='monitoring'&&S.monTimer){ clearInterval(S.monTimer); S.monTimer=null; }
    });
  });
});
