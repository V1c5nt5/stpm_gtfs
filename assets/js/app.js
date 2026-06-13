/* v2.3.0 — lógica principal del GTFS Viewer
   Separado desde el HTML para facilitar mantenimiento en GitHub Pages. */

var SVC = {L:'Lunes a Viernes', S:'Sábado', D:'Domingo', F:'Festivo', LJ:'Lun a Jue', V:'Viernes'};
var DAY_NAMES = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
var DATA = freshData();
var GITHUB_OWNER = 'V1c5nt5';
var GITHUB_REPO = 'stpm_gtfs';
var GITHUB_BRANCH = 'main';
var GITHUB_DATA_API = 'https://api.github.com/repos/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/contents/data?ref='+GITHUB_BRANCH;
var GITHUB_GTFS_FILES = [];
var GITHUB_DECO_FILES = [];
var GITHUB_PARAM_FILES = [];
var MANUAL_GTFS_FILE = null, MANUAL_DECO_FILE = null;
function freshData(){
  return {
    agency:{}, routes:{}, trips:{}, frequencies:[], frequenciesByTrip:{}, stopTimes:{}, stops:{}, stopIndex:{}, stopTrips:{}, shapes:{},
    calendar:{}, calendarDates:[], feedInfo:null, levels:{}, pathways:[], pathwaysByStop:{}, serviceIds:[], tripsByRoute:{}, tripsByService:{}, tripsByStop:{}, decoRows:[], decoByRoute:{}, operators:[], sourceNames:{gtfs:'',deco:'',param:''}, sourceDates:{gtfs:null,deco:null,param:null}
  };
}
var freqChart = null, stopChart = null;
var leafMap = null, layerIda = null, layerReg = null, layerStops = null;
var stopLeafMap = null, stopMarker = null;
var OLD_GTFS = null;
var activeStop = null, selectedHour = 8;
var curMapDir = 0, curStopsDir = 0;
var _cachedArrivals = [];
var PARAMS = {
  file:null, zip:null, sheets:[], sharedStrings:null, cache:{}, activeSheet:null, rows:[], intervals:[], metric:'', sourceDate:null, loading:false
};


var dropzone = document.getElementById('dropzone');
var fileInput = document.getElementById('file-input');
dropzone.addEventListener('dragover', function(e){ e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', function(){ dropzone.classList.remove('drag'); });
dropzone.addEventListener('drop', function(e){ e.preventDefault(); dropzone.classList.remove('drag'); var f=e.dataTransfer.files[0]; if(!f) return; if(/deco/i.test(f.name||'')) MANUAL_DECO_FILE=f; else MANUAL_GTFS_FILE=f; updateManualLabel(); });
fileInput.addEventListener('change', function(e){ MANUAL_GTFS_FILE=e.target.files[0]||null; updateManualLabel(); });
var decoFileInput = document.getElementById('deco-file-input');
decoFileInput.addEventListener('change', function(e){ MANUAL_DECO_FILE=e.target.files[0]||null; updateManualLabel(); });
document.addEventListener('change', function(e){ if(e.target && e.target.id==='old-gtfs-input') handleOldGTFS(e.target.files[0]); });

async function initGitHubGTFSList(){
  var fallbackGtfs=[
    {name:'GTFS_20260425_v3.zip', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/GTFS_20260425_v3.zip'},
    {name:'GTFS_20260530.zip', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/GTFS_20260530.zip'}
  ];
  var fallbackDeco=[
    {name:'DECO_VIGENTES_20260529.zip', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/DECO_VIGENTES_20260529.zip'}
  ];
  var fallbackParams=[
    {name:'15-Consolidado-Parametros-2026-05-30.xlsx', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/15-Consolidado-Parametros-2026-05-30.xlsx'}
  ];
  try{
    var res=await fetch(GITHUB_DATA_API,{cache:'no-store'});
    if(!res.ok) throw new Error('GitHub API '+res.status);
    var files=await res.json();
    var dataFiles=files.filter(function(f){return f.type==='file' && /\.(zip|csv|xlsx)$/i.test(f.name);})
      .map(function(f){return {name:f.name, download_url:f.download_url || ('https://raw.githubusercontent.com/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/'+GITHUB_BRANCH+'/data/'+encodeURIComponent(f.name))};})
      .sort(function(a,b){return a.name.localeCompare(b.name,undefined,{numeric:true});});
    var zips=dataFiles.filter(function(f){return /\.(zip|csv)$/i.test(f.name);});
    GITHUB_GTFS_FILES=zips.filter(function(f){return /gtfs/i.test(f.name);});
    GITHUB_DECO_FILES=zips.filter(function(f){return /deco/i.test(f.name);});
    GITHUB_PARAM_FILES=dataFiles.filter(function(f){return /consolidado.*param/i.test(f.name) && /\.xlsx$/i.test(f.name);});
    if(!GITHUB_GTFS_FILES.length) GITHUB_GTFS_FILES=fallbackGtfs;
    if(!GITHUB_DECO_FILES.length) GITHUB_DECO_FILES=fallbackDeco;
    if(!GITHUB_PARAM_FILES.length) GITHUB_PARAM_FILES=fallbackParams;
  }catch(err){
    console.warn('No se pudo leer /data desde GitHub. Se usará lista base.',err);
    GITHUB_GTFS_FILES=fallbackGtfs;
    GITHUB_DECO_FILES=fallbackDeco;
    GITHUB_PARAM_FILES=fallbackParams;
  }
  fillGitHubSelects();
}
function fillOneSelect(id, files, placeholder, selectedIndex){
  var sel=document.getElementById(id); if(!sel) return;
  sel.innerHTML='';
  if(!files.length){ var empty=document.createElement('option'); empty.value=''; empty.textContent=placeholder; sel.appendChild(empty); return; }
  files.forEach(function(f,i){
    var o=document.createElement('option'); o.value=f.download_url; o.textContent=f.name; o.dataset.name=f.name; sel.appendChild(o);
    if(i===selectedIndex) o.selected=true;
  });
}
function fillGitHubSelects(){
  fillOneSelect('github-main-select',GITHUB_GTFS_FILES,'Sin GTFS disponibles',Math.max(0,GITHUB_GTFS_FILES.length-1));
  fillOneSelect('github-deco-select',GITHUB_DECO_FILES,'Sin DECO disponible',Math.max(0,GITHUB_DECO_FILES.length-1));
  fillOneSelect('compare-base-select',GITHUB_GTFS_FILES,'Sin GTFS disponibles',0);
  fillOneSelect('compare-target-select',GITHUB_GTFS_FILES,'Sin GTFS disponibles',Math.max(0,GITHUB_GTFS_FILES.length-1));
  fillOneSelect('param-start-select',GITHUB_PARAM_FILES,'Sin consolidado disponible',Math.max(0,GITHUB_PARAM_FILES.length-1));
  fillOneSelect('param-file-select',GITHUB_PARAM_FILES,'Sin consolidado disponible',Math.max(0,GITHUB_PARAM_FILES.length-1));
  syncParamSelects('start');
}
function syncParamSelects(source){
  var start=document.getElementById('param-start-select');
  var tab=document.getElementById('param-file-select');
  if(!start || !tab) return;
  if(source==='tab' && tab.value) start.value=tab.value;
  else if(start.value) tab.value=start.value;
}
async function fetchGTFSFileFromURL(url, name){
  var res=await fetch(url,{cache:'no-store'});
  if(!res.ok) throw new Error('No se pudo descargar '+name+' ('+res.status+')');
  var blob=await res.blob();
  try{ return new File([blob], name, {type:'application/zip'}); }
  catch(e){ blob.name=name; return blob; }
}
async function loadSelectedMainGTFS(){
  var sel=document.getElementById('github-main-select'), decoSel=document.getElementById('github-deco-select'), paramSel=document.getElementById('param-start-select');
  if(!sel || !sel.value){ alert('No hay GTFS seleccionado.'); return; }
  if(!decoSel || !decoSel.value){ alert('Debes seleccionar un DECO para cargar el sistema.'); return; }
  if(!paramSel || !paramSel.value){ alert('Debes seleccionar el consolidado de parámetros.'); return; }
  syncParamSelects('start');
  var name=sel.options[sel.selectedIndex].dataset.name || sel.options[sel.selectedIndex].textContent || 'gtfs.zip';
  var decoName=decoSel.options[decoSel.selectedIndex].dataset.name || decoSel.options[decoSel.selectedIndex].textContent || 'deco.zip';
  prog(3,'Descargando GTFS y DECO desde GitHub...');
  try{
    var file=await fetchGTFSFileFromURL(sel.value,name);
    var decoFile=await fetchGTFSFileFromURL(decoSel.value,decoName);
    await handleFile(file, decoFile);
  }
  catch(err){ console.error(err); prog(0,'No se pudo descargar el GTFS o DECO desde GitHub. Usa carga manual o revisa el repositorio.'); }
}
function updateManualLabel(){
  var el=document.getElementById('manual-files-label'); if(!el) return;
  var g=MANUAL_GTFS_FILE ? (MANUAL_GTFS_FILE.name||'GTFS seleccionado') : 'GTFS pendiente';
  var d=MANUAL_DECO_FILE ? (MANUAL_DECO_FILE.name||'DECO seleccionado') : 'DECO pendiente';
  el.textContent=g+' · '+d;
}
async function loadManualPair(){
  if(!MANUAL_GTFS_FILE || !MANUAL_DECO_FILE){ alert('Debes seleccionar GTFS y DECO antes de cargar.'); return; }
  await handleFile(MANUAL_GTFS_FILE, MANUAL_DECO_FILE);
}

document.addEventListener('DOMContentLoaded', initGitHubGTFSList);

function prog(pct, txt){
  document.getElementById('prog-bar').style.display = 'block';
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-label').textContent = txt;
}
function csvNum(v, fallback){
  if(v===undefined||v===null||v==='') return fallback===undefined?0:fallback;
  var n = Number(v); return isNaN(n) ? (fallback===undefined?0:fallback) : n;
}
function timeToSecs(t){
  if(!t) return 0;
  var p = String(t).split(':');
  return csvNum(p[0])*3600 + csvNum(p[1])*60 + csvNum(p[2]);
}
function secsToTime(s){
  if(s===null||s===undefined||isNaN(s)) return '—';
  var h = Math.floor(Math.abs(s)/3600) % 24;
  var m = Math.floor((Math.abs(s) % 3600)/60);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}
function cleanName(n){ return (n||'').replace(/^[A-Z0-9]+-/, '').trim(); }
function freqClass(m){ return m<=12?'fg-good':m<=20?'fg-mid':'fg-low'; }
function safeHexColor(value, fallback){
  value = String(value || '').replace('#','').trim();
  return /^[0-9a-fA-F]{6}$/.test(value) ? '#' + value : fallback;
}
function rColor(r){ return safeHexColor(r && r.route_color, '#AF2B1E'); }
function rText(r){ return safeHexColor(r && r.route_text_color, '#FFFFFF'); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function unique(arr){ return Array.from(new Set(arr.filter(function(x){return x!==undefined&&x!==null&&x!=='';}))); }

function extractDateFromName(name){
  var m=String(name||'').match(/(20\d{6})/); if(!m) return null;
  var y=Number(m[1].slice(0,4)), mo=Number(m[1].slice(4,6))-1, d=Number(m[1].slice(6,8));
  var dt=new Date(y,mo,d); return isNaN(dt.getTime())?null:dt;
}
function daysAgo(dt){
  if(!dt) return null;
  var now=new Date(), a=new Date(now.getFullYear(),now.getMonth(),now.getDate()), b=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate());
  return Math.floor((a-b)/86400000);
}
function ageText(label, dt){
  var d=daysAgo(dt); if(d===null) return label+': fecha no detectada';
  if(d===0) return label+': datos de hoy';
  if(d===1) return label+': datos de hace 1 día';
  return label+': datos de hace '+d+' días';
}
function normalizeOpKey(v){ return String(v||'').trim().toLowerCase().replace(/\s+/g,''); }
function operatorFromDeco(row){ return row ? String(row.CLI_DSC||row.OPERADOR||row.operador||'Operador no informado').trim() : 'Sin DECO'; }
function routeOperator(route){
  if(!route) return 'Sin DECO';
  var keys=[route.route_short_name, route.route_id].map(normalizeOpKey);
  for(var i=0;i<keys.length;i++){ if(DATA.decoByRoute[keys[i]]) return operatorFromDeco(DATA.decoByRoute[keys[i]][0]); }
  return 'Sin DECO';
}
function routeMatchesOperator(route, op){ return !op || op==='__all' || routeOperator(route)===op; }
function fillOperatorSelect(selId, keepValue){
  var sel=document.getElementById(selId); if(!sel) return;
  var old=keepValue || sel.value || '__all'; sel.innerHTML='';
  var all=document.createElement('option'); all.value='__all'; all.textContent='Todos los operadores'; sel.appendChild(all);
  DATA.operators.forEach(function(op){ var o=document.createElement('option'); o.value=op; o.textContent=op; sel.appendChild(o); });
  sel.value=DATA.operators.indexOf(old)!==-1 ? old : '__all';
}
function refreshDataAge(){
  var el=document.getElementById('data-age'); if(!el) return;
  el.textContent=ageText('GTFS',DATA.sourceDates.gtfs)+' · '+ageText('DECO',DATA.sourceDates.deco);
}
function sortServices(a,b){
  var order = {L:1,LJ:2,V:3,S:4,D:5,F:6};
  return (order[a]||99)-(order[b]||99) || String(a).localeCompare(String(b),undefined,{numeric:true});
}
function serviceLabel(sid){
  if(SVC[sid]) return SVC[sid];
  var c = DATA.calendar[sid];
  if(c){
    var flags = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(function(k){return String(c[k])==='1'||c[k]===1;});
    var active = flags.map(function(v,i){return v?DAY_NAMES[i]:null;}).filter(Boolean);
    if(active.length===5 && flags.slice(0,5).every(Boolean) && !flags[5] && !flags[6]) return 'Lunes a Viernes';
    if(active.length===7) return 'Todos los días';
    if(active.length) return active.join(', ');
  }
  return sid;
}
function tripDir(t){ return String(t.direction_id==null||t.direction_id===''?0:t.direction_id); }
function dirName(dir){ return String(dir)==='1'?'Regreso':'Ida'; }
function getTripStartOffset(tripId){
  var st = DATA.stopTimes[tripId]||[];
  if(!st.length) return 0;
  return timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
}
function getStopOffsetInTrip(tripId, stopTimeRow){
  return timeToSecs(stopTimeRow.departure_time||stopTimeRow.arrival_time||'0:00:00') - getTripStartOffset(tripId);
}


async function parseDECOFile(file){
  var txt='';
  if(/\.zip$/i.test(file.name||'')){
    var zip=await JSZip.loadAsync(file);
    var names=Object.keys(zip.files).filter(function(n){return /\.csv$/i.test(n);});
    if(!names.length) throw new Error('El ZIP DECO no contiene CSV.');
    txt=await zip.file(names[0]).async('string');
  } else {
    txt=await file.text();
  }
  var rows=Papa.parse(txt.trim(),{header:true,skipEmptyLines:true,dynamicTyping:false,delimiter:';'}).data;
  DATA.decoRows=rows.filter(function(r){return r && (r.CODIGO_USUARIO||r.CODIGO_MTT||r.SERVICIO_DECO||r.CODIGO_RUTA);});
  DATA.decoByRoute={};
  DATA.decoRows.forEach(function(r){
    [r.CODIGO_USUARIO,r.CODIGO_MTT,r.SERVICIO_DECO].forEach(function(k){
      var key=normalizeOpKey(k); if(!key) return;
      if(!DATA.decoByRoute[key]) DATA.decoByRoute[key]=[];
      DATA.decoByRoute[key].push(r);
    });
  });
  DATA.operators=unique(DATA.decoRows.map(operatorFromDeco)).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
}

function parseGTFSInWorker(file){
  return new Promise(function(resolve, reject){
    if(!window.Worker){
      reject(new Error('Este navegador no soporta Web Workers.'));
      return;
    }
    var worker = new Worker(new URL('assets/js/gtfs-worker.js', window.location.href));
    var done=false;
    worker.onmessage=function(e){
      var msg=e.data||{};
      if(msg.type==='progress') prog(msg.pct||0, msg.text||'Procesando...');
      if(msg.type==='done'){
        done=true;
        worker.terminate();
        resolve(msg.data);
      }
      if(msg.type==='error'){
        done=true;
        worker.terminate();
        reject(new Error(msg.message||'No se pudo leer el GTFS.'));
      }
    };
    worker.onerror=function(err){
      if(done) return;
      worker.terminate();
      reject(new Error(err.message||'Error en el procesador GTFS.'));
    };
    worker.postMessage({file:file});
  });
}

async function handleFile(file, decoFile){
  if(!file) return;
  if(!decoFile){ alert('Debes ingresar un archivo DECO junto al GTFS.'); return; }
  DATA = freshData();
  DATA.sourceNames.gtfs=file.name||'gtfs.zip';
  DATA.sourceNames.deco=decoFile.name||'deco';
  DATA.sourceDates.gtfs=extractDateFromName(DATA.sourceNames.gtfs);
  DATA.sourceDates.deco=extractDateFromName(DATA.sourceNames.deco);
  prog(5, 'Leyendo DECO...');
  try{
    await parseDECOFile(decoFile);
    prog(8, 'Procesando GTFS...');
    var parsed = await parseGTFSInWorker(file);
    Object.keys(parsed).forEach(function(k){ DATA[k]=parsed[k]; });
    prog(100, 'Listo');
    setTimeout(function(){
      document.getElementById('upload-section').style.display='none';
      document.getElementById('btn-reload').style.display='block';
      buildUI();
      document.getElementById('app').style.display='block';
      initMap();
      renderMap();
    }, 160);
  }catch(err){
    console.error(err);
    prog(0, err.message || 'No se pudo cargar el GTFS.');
    alert(err.message || 'No se pudo cargar el GTFS.');
  }
}

function buildUI(){
  var nR=Object.keys(DATA.routes).length;
  var nT=Object.keys(DATA.trips).length;
  var nS=Object.keys(DATA.stops).length;
  var avgF=DATA.frequencies.length?Math.round(DATA.frequencies.reduce(function(a,f){return a+f.headway_secs;},0)/DATA.frequencies.length/60):'—';
  var nA=Object.keys(DATA.agency).length;
  document.getElementById('stats-row').innerHTML=[
    ['Rutas',nR],['Viajes',nT.toLocaleString()],['Paradas',nS.toLocaleString()],['Operadores',DATA.operators.length],['Agencias',nA],['Niveles',Object.keys(DATA.levels).length],['Conexiones',DATA.pathways.length.toLocaleString()],['Frec. prom.',avgF==='—'?'—':avgF+' min']
  ].map(function(x){return '<div class="stat-card"><div class="lbl">'+x[0]+'</div><div class="val">'+x[1]+'</div></div>';}).join('');

  var selR=document.getElementById('sel-route');
  selR.innerHTML='';
  Object.values(DATA.routes)
    .filter(function(r){return (DATA.tripsByRoute[String(r.route_id)]||[]).length>0;})
    .sort(function(a,b){return String(a.route_short_name).localeCompare(String(b.route_short_name),undefined,{numeric:true});})
    .forEach(function(r){
      var o=document.createElement('option');
      o.value=r.route_id;
      o.textContent=(r.route_short_name||r.route_id)+' — '+(r.route_long_name||'');
      selR.appendChild(o);
    });

  fillOperatorSelect('sel-operator');
  fillOperatorSelect('sel-operator-stop');
  refreshDataAge();
  updateStopGlobalServices();
  selR.addEventListener('change', function(){ updateRouteServiceOptions(); renderAll(); });
  document.getElementById('sel-operator').addEventListener('change', function(){ updateRouteOptionsByOperator(); });
  document.getElementById('sel-operator-stop').addEventListener('change', function(){ if(activeStop) renderStop(activeStop); });
  document.getElementById('sel-service').addEventListener('change', renderAll);
  document.getElementById('sel-service-stop').addEventListener('change', function(){ if(activeStop) renderStop(activeStop); });
  setupStopSearch();
  updateRouteServiceOptions();
  renderAll();
}


function updateRouteOptionsByOperator(){
  var op=document.getElementById('sel-operator').value;
  var selR=document.getElementById('sel-route'), old=selR.value;
  selR.innerHTML='';
  var routes=Object.values(DATA.routes)
    .filter(function(r){return (DATA.tripsByRoute[String(r.route_id)]||[]).length>0 && routeMatchesOperator(r,op);})
    .sort(function(a,b){return String(a.route_short_name).localeCompare(String(b.route_short_name),undefined,{numeric:true});});
  routes.forEach(function(r){ var o=document.createElement('option'); o.value=r.route_id; o.textContent=(r.route_short_name||r.route_id)+' — '+(r.route_long_name||''); selR.appendChild(o); });
  if(routes.some(function(r){return String(r.route_id)===String(old);})) selR.value=old;
  updateRouteServiceOptions(); renderAll();
}
function routeServices(routeId){
  return unique((DATA.tripsByRoute[String(routeId)]||[]).map(function(t){return t.service_id;})).sort(sortServices);
}
function routeDirs(routeId, serviceId){
  return unique((DATA.tripsByRoute[String(routeId)]||[]).filter(function(t){return String(t.service_id)===String(serviceId);}).map(function(t){return tripDir(t);})).sort();
}
function fillServiceSelect(sel, services){
  var old=sel.value; sel.innerHTML='';
  services.forEach(function(s){ var o=document.createElement('option'); o.value=s; o.textContent=serviceLabel(s); sel.appendChild(o); });
  if(services.indexOf(old)!==-1) sel.value=old;
  else if(services.length) sel.value=services[0];
}
function updateRouteServiceOptions(){
  var routeId=document.getElementById('sel-route').value;
  fillServiceSelect(document.getElementById('sel-service'), routeServices(routeId));
  syncDirectionControls();
}
function updateStopGlobalServices(){
  fillServiceSelect(document.getElementById('sel-service-stop'), DATA.serviceIds);
}
function stopServices(stopId){
  return unique((DATA.stopTrips[stopId]||[]).map(function(e){var t=DATA.trips[e.trip_id]; return t?t.service_id:null;})).sort(sortServices);
}
function updateStopServiceOptions(stopId){
  var services=stopServices(stopId);
  if(services.length) fillServiceSelect(document.getElementById('sel-service-stop'), services);
}
function syncDirectionControls(){
  var routeId=document.getElementById('sel-route').value;
  var svcId=document.getElementById('sel-service').value;
  var dirs=routeDirs(routeId, svcId);
  if(dirs.indexOf(String(curMapDir))===-1 && curMapDir!==-1) curMapDir = dirs.indexOf('0')!==-1 ? 0 : Number(dirs[0]||0);
  if(dirs.length<2 && curMapDir===-1) curMapDir = Number(dirs[0]||0);
  if(dirs.indexOf(String(curStopsDir))===-1) curStopsDir = dirs.indexOf('0')!==-1 ? 0 : Number(dirs[0]||0);

  ['map-btn-0','map-btn-1','map-btn-both','stops-btn-0','stops-btn-1'].forEach(function(id){var el=document.getElementById(id); if(el) el.style.display='none';});
  if(dirs.indexOf('0')!==-1){ document.getElementById('map-btn-0').style.display='inline-block'; document.getElementById('stops-btn-0').style.display='inline-block'; }
  if(dirs.indexOf('1')!==-1){ document.getElementById('map-btn-1').style.display='inline-block'; document.getElementById('stops-btn-1').style.display='inline-block'; }
  if(dirs.length>1) document.getElementById('map-btn-both').style.display='inline-block';
  setMapDir(curMapDir, true);
  setStopsDir(curStopsDir, true);
}


function setParamStatus(txt){
  var el=document.getElementById('param-status');
  if(el) el.textContent=txt;
}
function ensureParamsLoaded(){
  if(PARAMS.sheets && PARAMS.sheets.length) return;
  var sel=document.getElementById('param-file-select');
  if(sel && sel.value && !PARAMS.loading) loadSelectedParams();
}
function xlsxColIndex(ref){
  var m=String(ref||'').match(/[A-Z]+/); if(!m) return 0;
  var s=m[0], n=0;
  for(var i=0;i<s.length;i++) n=n*26+(s.charCodeAt(i)-64);
  return n-1;
}
function xlsxText(xmlNode, tag){
  var a=xmlNode.getElementsByTagName(tag);
  return a && a[0] ? a[0].textContent : '';
}
function xlsxRelPath(base, target){
  target=String(target||'');
  if(target.charAt(0)==='/') return target.replace(/^\//,'');
  return base.replace(/[^\/]+$/,'')+target;
}
function parseSharedStringsXml(xml){
  if(!xml) return [];
  var doc=new DOMParser().parseFromString(xml,'application/xml');
  var si=doc.getElementsByTagName('si'), out=[];
  for(var i=0;i<si.length;i++){
    var texts=si[i].getElementsByTagName('t'), s='';
    for(var j=0;j<texts.length;j++) s+=texts[j].textContent || '';
    out.push(s);
  }
  return out;
}
function xlsxCellValue(cell, sharedStrings){
  var t=cell.getAttribute('t') || '';
  if(t==='inlineStr'){
    var inline=cell.getElementsByTagName('is')[0];
    return inline ? xlsxText(inline,'t') : '';
  }
  var v=cell.getElementsByTagName('v')[0];
  var raw=v ? v.textContent : '';
  if(t==='s') return sharedStrings[Number(raw)] || '';
  if(t==='b') return raw==='1' ? 'Sí' : 'No';
  return raw;
}
function excelTimeLabel(v){
  if(v===null || v===undefined || v==='') return '';
  var n=Number(v);
  if(!isNaN(n) && n>=0 && n<1){
    var total=Math.round(n*86400), h=Math.floor(total/3600)%24, m=Math.floor((total%3600)/60);
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }
  return String(v);
}
function paramNumber(v){
  if(v===null || v===undefined || v==='') return null;
  var n=Number(String(v).replace(',','.'));
  return isNaN(n) ? null : n;
}
function sheetMetricFromName(name){
  var m=String(name||'').match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)\(/);
  return m ? m[1].trim() : String(name||'');
}
function sheetPeriodFromName(name){
  var m=String(name||'').match(/\(([^)]+)\)/);
  return m ? m[1].trim() : '';
}
async function loadWorkbookMeta(fileObj){
  var res=await fetch(fileObj.download_url,{cache:'no-store'});
  if(!res.ok) throw new Error('No se pudo descargar el consolidado ('+res.status+').');
  var blob=await res.blob();
  var zip=await JSZip.loadAsync(blob);
  var wbXml=await zip.file('xl/workbook.xml').async('string');
  var relXml=await zip.file('xl/_rels/workbook.xml.rels').async('string');
  var wbDoc=new DOMParser().parseFromString(wbXml,'application/xml');
  var relDoc=new DOMParser().parseFromString(relXml,'application/xml');
  var rels={};
  Array.prototype.forEach.call(relDoc.getElementsByTagName('Relationship'),function(r){
    rels[r.getAttribute('Id')]=xlsxRelPath('xl/workbook.xml',r.getAttribute('Target'));
  });
  var sheets=[];
  Array.prototype.forEach.call(wbDoc.getElementsByTagName('sheet'),function(s){
    var rid=s.getAttribute('r:id') || s.getAttribute('id');
    var name=s.getAttribute('name') || '';
    if(name.toLowerCase()==='diccio') return;
    sheets.push({name:name, path:rels[rid], metric:sheetMetricFromName(name), period:sheetPeriodFromName(name)});
  });
  PARAMS.file=fileObj; PARAMS.zip=zip; PARAMS.sheets=sheets; PARAMS.cache={}; PARAMS.sharedStrings=null;
  PARAMS.sourceDate=extractDateFromName(fileObj.name);
  DATA.sourceNames.param=fileObj.name;
  DATA.sourceDates.param=PARAMS.sourceDate;
}
async function getSharedStrings(){
  if(PARAMS.sharedStrings) return PARAMS.sharedStrings;
  var f=PARAMS.zip.file('xl/sharedStrings.xml');
  PARAMS.sharedStrings=f ? parseSharedStringsXml(await f.async('string')) : [];
  return PARAMS.sharedStrings;
}
async function parseParameterSheet(sheetName){
  if(PARAMS.cache[sheetName]) return PARAMS.cache[sheetName];
  var sheet=PARAMS.sheets.find(function(s){return s.name===sheetName;});
  if(!sheet || !sheet.path) throw new Error('No se encontró la hoja seleccionada.');
  var xml=await PARAMS.zip.file(sheet.path).async('string');
  var doc=new DOMParser().parseFromString(xml,'application/xml');
  var shared=await getSharedStrings();
  var matrix=[];
  Array.prototype.forEach.call(doc.getElementsByTagName('row'),function(row){
    var rIndex=Number(row.getAttribute('r')||0)-1;
    if(!matrix[rIndex]) matrix[rIndex]=[];
    Array.prototype.forEach.call(row.getElementsByTagName('c'),function(c){
      matrix[rIndex][xlsxColIndex(c.getAttribute('r'))]=xlsxCellValue(c,shared);
    });
  });
  var metric=String((matrix[0] && (matrix[0][1] || matrix[0][0])) || sheet.metric || '').trim();
  var dayRow=matrix[1]||[], bandRow=matrix[2]||[], startRow=matrix[3]||[], endRow=matrix[4]||[];
  var intervals=[], lastDay='';
  for(var col=5; col<Math.max(dayRow.length,bandRow.length,startRow.length,endRow.length); col++){
    if(dayRow[col]) lastDay=String(dayRow[col]);
    intervals.push({
      col:col,
      day:lastDay || '',
      band:String(bandRow[col]||'').trim(),
      start:excelTimeLabel(startRow[col]),
      end:excelTimeLabel(endRow[col])
    });
  }
  var rows=[];
  for(var i=5;i<matrix.length;i++){
    var r=matrix[i]||[];
    if(!r[0] && !r[1] && !r[2]) continue;
    rows.push({
      unidad:String(r[0]||'').trim(),
      codigoTs:String(r[1]||'').trim(),
      codigoUsuario:String(r[2]||'').trim(),
      sentido:String(r[3]||'').trim(),
      tipo:String(r[4]||'').trim(),
      values:intervals.map(function(it){return r[it.col]===undefined?'':r[it.col];})
    });
  }
  var parsed={sheet:sheet, metric:metric, intervals:intervals, rows:rows};
  PARAMS.cache[sheetName]=parsed;
  return parsed;
}
function fillParamSheets(){
  var sel=document.getElementById('param-sheet-select'); if(!sel) return;
  sel.innerHTML='';
  PARAMS.sheets.forEach(function(s,i){
    var o=document.createElement('option');
    o.value=s.name; o.textContent=s.metric+' — '+s.period;
    sel.appendChild(o);
    if(i===0) o.selected=true;
  });
}
async function loadSelectedParams(){
  syncParamSelects('tab');
  var sel=document.getElementById('param-file-select');
  if(!sel || !sel.value){ alert('No hay consolidado seleccionado.'); return; }
  var fileObj={name:(sel.options[sel.selectedIndex].dataset.name || sel.options[sel.selectedIndex].textContent), download_url:sel.value};
  PARAMS.loading=true; setParamStatus('Descargando consolidado de parámetros...');
  try{
    await loadWorkbookMeta(fileObj);
    fillParamSheets();
    setParamStatus('Consolidado cargado. Selecciona indicador/período o usa filtros.');
    await renderSelectedParamSheet();
  }catch(err){
    console.error(err);
    setParamStatus('No se pudo cargar el consolidado: '+(err.message||err));
  }finally{
    PARAMS.loading=false;
  }
}
async function renderSelectedParamSheet(){
  if(!PARAMS.sheets.length) return;
  var sheetSel=document.getElementById('param-sheet-select');
  var sheetName=sheetSel && sheetSel.value ? sheetSel.value : PARAMS.sheets[0].name;
  setParamStatus('Leyendo hoja seleccionada...');
  var parsed=await parseParameterSheet(sheetName);
  PARAMS.activeSheet=sheetName; PARAMS.rows=parsed.rows; PARAMS.intervals=parsed.intervals; PARAMS.metric=parsed.metric;
  fillParamFilters(parsed);
  document.getElementById('param-panel').style.display='block';
  renderParamsTable();
  setParamStatus('Parámetros listos: '+parsed.rows.length+' filas en '+parsed.sheet.name+'.');
}
function fillParamSelect(id, values, allLabel){
  var sel=document.getElementById(id); if(!sel) return;
  var old=sel.value; sel.innerHTML='';
  var all=document.createElement('option'); all.value='__all'; all.textContent=allLabel; sel.appendChild(all);
  values.forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o); });
  sel.value=values.indexOf(old)!==-1 ? old : '__all';
}
function fillParamFilters(parsed){
  fillParamSelect('param-operator', unique(parsed.rows.map(function(r){return r.unidad;})).sort(), 'Todas');
  fillParamSelect('param-sentido', unique(parsed.rows.map(function(r){return r.sentido;})).sort(), 'Todos');
  fillParamSelect('param-tipo', unique(parsed.rows.map(function(r){return r.tipo;})).sort(), 'Todos');
}
function filteredParamRows(){
  var op=document.getElementById('param-operator').value;
  var sentido=document.getElementById('param-sentido').value;
  var tipo=document.getElementById('param-tipo').value;
  var q=normalizeOpKey(document.getElementById('param-route-search').value);
  return PARAMS.rows.filter(function(r){
    if(op!=='__all' && r.unidad!==op) return false;
    if(sentido!=='__all' && r.sentido!==sentido) return false;
    if(tipo!=='__all' && r.tipo!==tipo) return false;
    if(q){
      var hay=normalizeOpKey(r.codigoUsuario+' '+r.codigoTs);
      if(hay.indexOf(q)===-1) return false;
    }
    return true;
  });
}
function renderParamsTable(){
  var wrap=document.getElementById('param-table-wrap');
  var title=document.getElementById('param-table-title');
  var note=document.getElementById('param-sheet-note');
  var summary=document.getElementById('param-summary');
  if(!wrap || !PARAMS.rows.length) return;
  var rows=filteredParamRows();
  var intervals=PARAMS.intervals || [];
  var maxRows=180, shown=rows.slice(0,maxRows);
  var nums=[];
  rows.forEach(function(r){ r.values.forEach(function(v){ var n=paramNumber(v); if(n!==null) nums.push(n); }); });
  var avg=nums.length ? (nums.reduce(function(a,b){return a+b;},0)/nums.length) : null;
  if(title) title.textContent='Detalle — '+(PARAMS.metric || PARAMS.activeSheet || '');
  if(note) note.textContent='Se muestran hasta '+maxRows+' filas para evitar sobrecargar el navegador. Usa los filtros para acotar resultados.';
  if(summary){
    summary.innerHTML=
      '<div class="stat-card"><div class="lbl">Filas filtradas</div><div class="val">'+rows.length+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Intervalos</div><div class="val">'+intervals.length+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Promedio visible</div><div class="val">'+(avg===null?'—':avg.toFixed(2))+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Archivo</div><div class="val" style="font-size:13px">'+esc(DATA.sourceNames.param||'—')+'</div></div>';
  }
  if(!rows.length){ wrap.innerHTML='<div class="no-data">No hay filas con los filtros actuales.</div>'; return; }
  var head='<tr><th class="sticky-col">Código usuario</th><th>Código TS</th><th>UN</th><th>Sentido</th><th>Tipo</th>'+
    intervals.map(function(it){ return '<th>'+esc(it.day)+'<br><span class="param-cell-muted">'+esc(it.band)+' '+esc(it.start)+'-'+esc(it.end)+'</span></th>'; }).join('')+'</tr>';
  var body=shown.map(function(r){
    return '<tr><td class="sticky-col" style="font-weight:600">'+esc(r.codigoUsuario)+'</td><td>'+esc(r.codigoTs)+'</td><td>'+esc(r.unidad)+'</td><td>'+esc(r.sentido)+'</td><td>'+esc(r.tipo)+'</td>'+
      r.values.map(function(v){ return '<td>'+esc(v===''?'—':v)+'</td>'; }).join('')+'</tr>';
  }).join('');
  var more=rows.length>maxRows ? '<div class="param-status">Hay '+(rows.length-maxRows)+' filas adicionales no renderizadas.</div>' : '';
  wrap.innerHTML='<div class="tbl-wrap"><table class="param-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+more;
}
function syncParamRouteFromGTFS(){
  var sel=document.getElementById('sel-route'), inp=document.getElementById('param-route-search');
  if(!sel || !sel.value || !inp) return;
  var r=DATA.routes[sel.value];
  inp.value = r ? (r.route_short_name || r.route_id || '') : '';
  if(document.getElementById('tab-parametros').style.display==='none') switchTab('parametros');
  else renderParamsTable();
}
document.addEventListener('change',function(e){
  if(e.target && e.target.id==='param-sheet-select') renderSelectedParamSheet();
  if(e.target && /^(param-operator|param-sentido|param-tipo)$/.test(e.target.id)) renderParamsTable();
});
document.addEventListener('input',function(e){
  if(e.target && e.target.id==='param-route-search') renderParamsTable();
});


function switchTab(tab){
  var tabs=['ruta','paradero','parametros','comparar'];
  document.querySelectorAll('.tab-btn').forEach(function(b,i){b.classList.toggle('active',tabs[i]===tab);});
  document.getElementById('tab-ruta').style.display=tab==='ruta'?'block':'none';
  document.getElementById('tab-paradero').style.display=tab==='paradero'?'block':'none';
  document.getElementById('tab-parametros').style.display=tab==='parametros'?'block':'none';
  document.getElementById('tab-comparar').style.display=tab==='comparar'?'block':'none';
  if(tab==='ruta' && leafMap) setTimeout(function(){leafMap.invalidateSize();},50);
  if(tab==='paradero' && stopLeafMap) setTimeout(function(){stopLeafMap.invalidateSize(); renderStopMap(activeStop);},70);
  if(tab==='parametros') ensureParamsLoaded();
}

function initMap(){
  leafMap = L.map('map').setView([-33.45, -70.65], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OpenStreetMap contributors', maxZoom:18 }).addTo(leafMap);
}
function setMapDir(dir, skipRender){
  curMapDir = Number(dir);
  ['0','1','both'].forEach(function(d){ var el=document.getElementById('map-btn-'+d); if(el) el.classList.toggle('active', String(curMapDir)===(d==='both'?'-1':d)); });
  if(!skipRender) renderMap();
}
function renderMap(){
  if(!leafMap) return;
  if(layerIda){ leafMap.removeLayer(layerIda); layerIda=null; }
  if(layerReg){ leafMap.removeLayer(layerReg); layerReg=null; }
  if(layerStops){ leafMap.removeLayer(layerStops); layerStops=null; }
  var routeId=document.getElementById('sel-route').value, svcId=document.getElementById('sel-service').value;
  var bounds=[], stopGroup=L.layerGroup(), stopSet={};
  function drawDir(dir, color){
    var trips=getTrips(dir); if(!trips.length) return;
    var shapeTrip=trips.find(function(t){return t.shape_id && DATA.shapes[t.shape_id]&&DATA.shapes[t.shape_id].length;}) || trips[0];
    var pts=DATA.shapes[shapeTrip.shape_id];
    if(pts&&pts.length){
      var latlngs=pts.map(function(p){return [p.lat,p.lng];});
      var poly=L.polyline(latlngs,{color:color,weight:4,opacity:0.85}).addTo(leafMap);
      if(String(dir)==='0') layerIda=poly; else layerReg=poly;
      bounds=bounds.concat(latlngs);
    }
    var refTrip=trips.find(function(t){return DATA.stopTimes[t.trip_id]&&DATA.stopTimes[t.trip_id].length;});
    var stopSeq=refTrip?(DATA.stopTimes[refTrip.trip_id]||[]):[];
    stopSeq.forEach(function(st,i){
      if(stopSet[st.stop_id]) return; stopSet[st.stop_id]=true;
      var stop=DATA.stops[st.stop_id]; if(!stop||stop.stop_lat===null||stop.stop_lon===null) return;
      var isFirst=i===0, isLast=i===stopSeq.length-1;
      var dotColor=isFirst?'#16a34a':isLast?'#dc2626':'#1d4ed8'; var radius=isFirst||isLast?9:5;
      L.circleMarker([+stop.stop_lat,+stop.stop_lon],{radius:radius,fillColor:dotColor,color:'#fff',weight:2,opacity:1,fillOpacity:1})
        .bindPopup('<b>'+esc(cleanName(stop.stop_name||st.stop_id))+'</b><br><small>'+esc(st.stop_id)+'</small>').addTo(stopGroup);
    });
  }
  if(curMapDir===0||curMapDir===-1) drawDir(0,'#2563eb');
  if(curMapDir===1||curMapDir===-1) drawDir(1,'#dc2626');
  layerStops=stopGroup; stopGroup.addTo(leafMap);
  document.getElementById('map-stop-count').textContent=Object.keys(stopSet).length?Object.keys(stopSet).length+' paradas':'';
  if(bounds.length) leafMap.fitBounds(bounds,{padding:[20,20]});
}

function renderAll(){ syncDirectionControls(); renderFreqs(); renderMap(); renderStopsTable(); }
function getTrips(dir){
  var routeId=document.getElementById('sel-route').value, svcId=document.getElementById('sel-service').value;
  return (DATA.tripsByRoute[String(routeId)]||[]).filter(function(t){return String(t.service_id)===String(svcId) && (dir===-1||tripDir(t)===String(dir));});
}
function getFreqsForTrips(trips){
  var out=[];
  trips.forEach(function(t){
    var arr=DATA.frequenciesByTrip && DATA.frequenciesByTrip[t.trip_id] ? DATA.frequenciesByTrip[t.trip_id] : [];
    for(var i=0;i<arr.length;i++) out.push(arr[i]);
  });
  if(out.length) return out;
  var ids={}; trips.forEach(function(t){ids[t.trip_id]=true;});
  return DATA.frequencies.filter(function(f){return ids[f.trip_id];});
}
function scheduledHeadways(trips){
  var byHour={};
  trips.forEach(function(t){
    var st=DATA.stopTimes[t.trip_id]; if(!st||!st.length) return;
    var s=timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
    var h=Math.floor(s/3600); if(h<0||h>27) return;
    if(!byHour[h]) byHour[h]=[]; byHour[h].push(s);
  });
  var out=[];
  Object.keys(byHour).forEach(function(h){
    var arr=byHour[h].sort(function(a,b){return a-b;});
    if(arr.length===1) out.push({start_time:String(h).padStart(2,'0')+':00:00', end_time:String(Number(h)+1).padStart(2,'0')+':00:00', headway_secs:3600});
    else {
      var diffs=[]; for(var i=1;i<arr.length;i++) diffs.push(arr[i]-arr[i-1]);
      var avg=Math.round(diffs.reduce(function(a,b){return a+b;},0)/diffs.length);
      out.push({start_time:String(h).padStart(2,'0')+':00:00', end_time:String(Number(h)+1).padStart(2,'0')+':00:00', headway_secs:avg});
    }
  });
  return out;
}
function renderFreqs(){
  var tripsIda=getTrips(0), tripsReg=getTrips(1);
  var freqsIda=getFreqsForTrips(tripsIda), freqsReg=getFreqsForTrips(tripsReg);
  if(!freqsIda.length) freqsIda=scheduledHeadways(tripsIda);
  if(!freqsReg.length) freqsReg=scheduledHeadways(tripsReg);
  renderFreqTable(freqsIda, freqsReg);
  renderFreqChart(freqsIda, freqsReg);
}
function renderFreqTable(freqsIda, freqsReg){
  var w=document.getElementById('freq-table-wrap'), dirs=routeDirs(document.getElementById('sel-route').value, document.getElementById('sel-service').value);
  var all={};
  function absorb(arr,key){ arr.forEach(function(f){ var k=f.start_time+'|'+f.end_time; if(!all[k]) all[k]={start:String(f.start_time).slice(0,5),end:String(f.end_time).slice(0,5)}; all[k][key]=Math.round(f.headway_secs/60); }); }
  absorb(freqsIda,'ida'); absorb(freqsReg,'reg');
  var vals=Object.values(all).sort(function(a,b){return a.start.localeCompare(b.start);});
  if(!vals.length){ w.innerHTML='<div class="no-data">Sin frecuencias ni salidas programadas para este filtro</div>'; return; }
  var headers='<th>Desde</th><th>Hasta</th>'+(dirs.indexOf('0')!==-1?'<th>Ida</th>':'')+(dirs.indexOf('1')!==-1?'<th>Regreso</th>':'');
  var rows=vals.map(function(r){
    var cells='<td>'+esc(r.start)+'</td><td>'+esc(r.end)+'</td>';
    if(dirs.indexOf('0')!==-1) cells+='<td>'+(r.ida?'<span class="freq-pill '+freqClass(r.ida)+'">'+r.ida+' min</span>':'<span style="color:#ccc">—</span>')+'</td>';
    if(dirs.indexOf('1')!==-1) cells+='<td>'+(r.reg?'<span class="freq-pill '+freqClass(r.reg)+'">'+r.reg+' min</span>':'<span style="color:#ccc">—</span>')+'</td>';
    return '<tr>'+cells+'</tr>';
  }).join('');
  w.innerHTML='<div class="tbl-wrap"><table><thead><tr>'+headers+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderFreqChart(freqsIda, freqsReg){
  var labels=[], valIda=[], valReg=[], dirs=routeDirs(document.getElementById('sel-route').value, document.getElementById('sel-service').value);
  for(var h=0;h<24;h++){
    labels.push(h+'h');
    function avg(freqs){ var m=freqs.filter(function(f){var sh=parseInt(String(f.start_time).split(':')[0]),eh=parseInt(String(f.end_time).split(':')[0]);return sh<=h&&eh>h;}); return m.length?Math.round(m.reduce(function(a,f){return a+f.headway_secs;},0)/m.length/60):null; }
    valIda.push(avg(freqsIda)); valReg.push(avg(freqsReg));
  }
  var datasets=[];
  if(dirs.indexOf('0')!==-1) datasets.push({label:'Ida',data:valIda,backgroundColor:'rgba(37,99,235,0.7)',borderRadius:3});
  if(dirs.indexOf('1')!==-1) datasets.push({label:'Regreso',data:valReg,backgroundColor:'rgba(220,38,38,0.65)',borderRadius:3});
  var ctx=document.getElementById('freq-chart').getContext('2d'); if(freqChart) freqChart.destroy();
  freqChart=new Chart(ctx,{type:'bar',data:{labels:labels,datasets:datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:12},boxWidth:14}}},scales:{y:{beginAtZero:true,title:{display:true,text:'min',font:{size:11}},grid:{color:'rgba(0,0,0,0.05)'}},x:{grid:{display:false},ticks:{font:{size:10},maxRotation:0}}}}});
}
function setStopsDir(dir, skipRender){
  curStopsDir=Number(dir);
  var b0=document.getElementById('stops-btn-0'), b1=document.getElementById('stops-btn-1');
  if(b0) b0.classList.toggle('active',curStopsDir===0); if(b1) b1.classList.toggle('active',curStopsDir===1);
  if(!skipRender) renderStopsTable();
}
function renderStopsTable(){
  var w=document.getElementById('stops-table-wrap'), trips=getTrips(curStopsDir);
  if(!trips.length){w.innerHTML='<div class="no-data">Sin viajes para este filtro</div>';return;}
  var refTrip=trips.find(function(t){return DATA.stopTimes[t.trip_id]&&DATA.stopTimes[t.trip_id].length;});
  var stopSeq=refTrip?DATA.stopTimes[refTrip.trip_id]:[]; if(!stopSeq.length){w.innerHTML='<div class="no-data">Sin datos de paradas</div>';return;}
  var freqs=getFreqsForTrips([refTrip]);
  var startSec=freqs.length?timeToSecs(freqs[0].start_time):getTripStartOffset(refTrip.trip_id);
  var lastFreq=freqs[freqs.length-1]; var endSec=lastFreq?timeToSecs(lastFreq.end_time):startSec;
  var baseStart=getTripStartOffset(refTrip.trip_id);
  var rows=stopSeq.slice(0,60).map(function(st){
    var stop=DATA.stops[st.stop_id]||{}, name=cleanName(stop.stop_name||st.stop_id);
    var offset=timeToSecs(st.departure_time||st.arrival_time||'0:00:00')-baseStart;
    return '<tr><td style="color:#999;font-size:12px">'+st.stop_sequence+'</td><td>'+esc(name)+'</td><td style="font-weight:500">'+secsToTime(startSec+offset)+'</td><td style="font-weight:500">'+secsToTime(endSec+offset)+'</td></tr>';
  }).join('');
  var more=stopSeq.length>60?'<tr><td colspan="4" style="text-align:center;color:#999;font-size:13px;padding:10px">... y '+(stopSeq.length-60)+' paradas más</td></tr>':'';
  w.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Parada</th><th>Primera salida</th><th>Última salida</th></tr></thead><tbody>'+rows+more+'</tbody></table></div>';
}


function initStopMap(){
  if(stopLeafMap) return;
  stopLeafMap = L.map('stop-map').setView([-33.45, -70.65], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OpenStreetMap contributors', maxZoom:19 }).addTo(stopLeafMap);
}
function renderStopMap(stopId){
  if(!stopId) return;
  var stop=DATA.stops[stopId];
  if(!stop || stop.stop_lat===null || stop.stop_lon===null){
    var el=document.getElementById('stop-map'); if(el) el.innerHTML='<div class="no-data">Este paradero no tiene coordenadas en stops.txt</div>';
    return;
  }
  initStopMap();
  var lat=+stop.stop_lat, lon=+stop.stop_lon, name=cleanName(stop.stop_name||stopId);
  if(stopMarker) stopLeafMap.removeLayer(stopMarker);
  stopMarker = L.marker([lat,lon]).addTo(stopLeafMap).bindPopup('<b>'+esc(name)+'</b><br><small>'+esc(stopId)+'</small><br><small>'+lat.toFixed(6)+', '+lon.toFixed(6)+'</small>');
  stopLeafMap.setView([lat,lon], 17);
  setTimeout(function(){ stopLeafMap.invalidateSize(); }, 80);
}

function setupStopSearch(){
  var inp=document.getElementById('stop-search'), sug=document.getElementById('suggestions');
  inp.addEventListener('input',function(){
    var q=inp.value.trim().toLowerCase(); if(q.length<2){sug.style.display='none';return;}
    var results=Object.values(DATA.stopIndex).filter(function(s){return s.key.indexOf(q)!==-1;}).slice(0,14);
    if(!results.length){sug.style.display='none';return;}
    sug.innerHTML=results.map(function(s){ return '<div class="sug-item" onclick="selectStop(\''+esc(String(s.s.stop_id)).replace(/&#39;/g,"\\'")+'\')">'+esc(s.name)+'<small>'+esc(s.s.stop_id)+'</small></div>'; }).join('');
    sug.style.display='block';
  });
  document.addEventListener('click',function(e){if(!e.target.closest('.search-wrap'))sug.style.display='none';});
}
function selectStop(stopId){
  document.getElementById('suggestions').style.display='none';
  var stop=DATA.stops[stopId]; if(!stop)return;
  document.getElementById('stop-search').value=cleanName(stop.stop_name||stopId);
  activeStop=stopId; updateStopServiceOptions(stopId); renderStop(stopId);
  document.getElementById('stop-detail').style.display='block'; document.getElementById('stop-hint').style.display='none';
}
function computeArrivals(stopId, svcId){
  var entries=(DATA.stopTrips[stopId]||[]).filter(function(e){ var trip=DATA.trips[e.trip_id];return trip&&trip.service_id===svcId; });
  var arrivals=[];
  var MAX_ARRIVALS=25000;
  entries.forEach(function(e){
    if(arrivals.length>=MAX_ARRIVALS) return;
    var trip=DATA.trips[e.trip_id]; if(!trip)return;
    var route=DATA.routes[trip.route_id], freqs=(DATA.frequenciesByTrip && DATA.frequenciesByTrip[e.trip_id]) || DATA.frequencies.filter(function(f){return f.trip_id===e.trip_id;});
    if(freqs.length){
      freqs.forEach(function(f){
        if(arrivals.length>=MAX_ARRIVALS) return;
        var startS=timeToSecs(f.start_time), endS=timeToSecs(f.end_time), hw=f.headway_secs; if(hw<=0)return;
        for(var t=startS+e.offset;t<endS+e.offset && arrivals.length<MAX_ARRIVALS;t+=hw){
          var h=Math.floor(t/3600);
          if(h>=0&&h<=27) arrivals.push({timeSecs:t,timeStr:secsToTime(t),hour:h%24,headsign:trip.trip_headsign||trip.trip_short_name||'—',route:route,routeShort:route?route.route_short_name:'?',dir:tripDir(trip)});
        }
      });
    } else {
      var row=e.stopTime;
      var t=timeToSecs(row.departure_time||row.arrival_time||'0:00:00'), h=Math.floor(t/3600);
      if(h>=0&&h<=27) arrivals.push({timeSecs:t,timeStr:secsToTime(t),hour:h%24,headsign:trip.trip_headsign||trip.trip_short_name||'—',route:route,routeShort:route?route.route_short_name:'?',dir:tripDir(trip)});
    }
  });
  arrivals.sort(function(a,b){return a.timeSecs-b.timeSecs;});
  return arrivals;
}
function renderStop(stopId){
  var stop=DATA.stops[stopId]||{}, svcId=document.getElementById('sel-service-stop').value, name=cleanName(stop.stop_name||stopId);
  var level = stop.level_id && DATA.levels[stop.level_id] ? DATA.levels[stop.level_id].level_name : '';
  var pathCount = (DATA.pathwaysByStop[stopId]||[]).length;
  var meta = esc(stopId)+(stop.stop_lat!==null?' &nbsp;&middot;&nbsp; '+(+stop.stop_lat).toFixed(5)+', '+(+stop.stop_lon).toFixed(5):'')+(level?' &nbsp;&middot;&nbsp; '+esc(level):'')+(pathCount?' &nbsp;&middot;&nbsp; '+pathCount+' conexiones internas':'');
  document.getElementById('stop-header-info').innerHTML='<div class="stop-pin">&#128205;</div><div><div class="stop-name-big">'+esc(name)+'</div><div class="stop-id-small">'+meta+'</div></div>';
  renderStopMap(stopId);
  var opFilter=document.getElementById('sel-operator-stop').value;
  var entries=(DATA.stopTrips[stopId]||[]).filter(function(e){var t=DATA.trips[e.trip_id]; var r=t?DATA.routes[t.route_id]:null; return t&&t.service_id===svcId&&routeMatchesOperator(r,opFilter);});
  if(!entries.length){ document.getElementById('routes-at-stop-wrap').innerHTML='<div class="no-data">Sin recorridos para este tipo de día</div>'; document.getElementById('arrivals-wrap').innerHTML='<div class="no-data">Sin datos</div>'; renderStopChart([]); return; }
  var routeMap={};
  entries.forEach(function(e){ var trip=DATA.trips[e.trip_id]; if(!trip)return; var rid=trip.route_id; if(!routeMap[rid]) routeMap[rid]={route:DATA.routes[rid],headsigns:{},dirs:{},count:0}; routeMap[rid].count++; if(trip.trip_headsign) routeMap[rid].headsigns[trip.trip_headsign]=true; routeMap[rid].dirs[dirName(tripDir(trip))]=true; });
  var routesSorted=Object.values(routeMap).sort(function(a,b){ return String(a.route?a.route.route_short_name:'').localeCompare(String(b.route?b.route.route_short_name:''),undefined,{numeric:true}); });
  var tableRows=routesSorted.map(function(rm){ var r=rm.route,bg=rColor(r),tc=rText(r),hs=Object.keys(rm.headsigns).join(' / ')||'—',dirs=Object.keys(rm.dirs).join(' / '),op=routeOperator(r); return '<tr><td><span class="route-badge" style="background:'+bg+';color:'+tc+'">'+esc(r?r.route_short_name:'?')+'</span></td><td>'+esc(op)+'</td><td>'+esc(dirs)+'</td><td>'+esc(hs)+'</td><td>'+rm.count+'</td></tr>'; }).join('');
  document.getElementById('routes-at-stop-wrap').innerHTML='<div class="tbl-wrap"><table><thead><tr><th>Ruta</th><th>Operador</th><th>Sentido</th><th>Destino</th><th>Viajes/día</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>';
  _cachedArrivals=computeArrivals(stopId,svcId).filter(function(a){return routeMatchesOperator(a.route,opFilter);}); renderStopChart(_cachedArrivals); renderArrivals(_cachedArrivals);
}
function renderStopChart(arrivals){
  var labels=[],values=[]; for(var h=0;h<24;h++){ labels.push(h+'h'); values.push(arrivals.filter(function(a){return a.hour===h;}).length); }
  var ctx=document.getElementById('stop-chart').getContext('2d'); if(stopChart) stopChart.destroy();
  stopChart=new Chart(ctx,{type:'bar',data:{labels:labels,datasets:[{label:'Buses',data:values,backgroundColor:'rgba(85,153,221,0.8)',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,title:{display:true,text:'buses',font:{size:11}},ticks:{stepSize:1},grid:{color:'rgba(0,0,0,0.05)'}},x:{grid:{display:false},ticks:{font:{size:10},maxRotation:0}}}}});
}
function renderArrivals(arrivals){
  var filtered=arrivals.filter(function(a){return a.hour===selectedHour%24;});
  document.getElementById('arrivals-title').textContent='Llegadas a las '+(selectedHour%24)+':xx — '+filtered.length+' buses';
  var w=document.getElementById('arrivals-wrap'); if(!filtered.length){w.innerHTML='<div class="no-data">Sin buses en este horario</div>';return;}
  var show=filtered.slice(0,150);
  var rows=show.map(function(a){ var bg=rColor(a.route),tc=rText(a.route); return '<tr><td style="font-weight:600">'+a.timeStr+'</td><td><span class="route-badge" style="background:'+bg+';color:'+tc+'">'+esc(a.routeShort)+'</span></td><td>'+esc(routeOperator(a.route))+'</td><td>'+esc(dirName(a.dir))+'</td><td>'+esc(a.headsign)+'</td></tr>'; }).join('');
  var more=filtered.length>150?'<tr><td colspan="5" style="text-align:center;color:#999;font-size:13px;padding:10px">... y '+(filtered.length-150)+' más</td></tr>':'';
  w.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>Hora</th><th>Ruta</th><th>Operador</th><th>Sentido</th><th>Destino</th></tr></thead><tbody>'+rows+more+'</tbody></table></div>';
}
function onHourSlide(v){ selectedHour=parseInt(v); document.getElementById('hour-val').textContent=(selectedHour%24)+':00'; renderArrivals(_cachedArrivals); }




async function parseGTFSForCompare(file){
  var zip = await JSZip.loadAsync(file);
  async function readTxt(name){ var f=zip.file(name); return f?await f.async('string'):''; }
  function parse(txt){ return txt ? Papa.parse(txt.trim(),{header:true,skipEmptyLines:true,dynamicTyping:false}).data : []; }
  var out={routes:{},routesByShort:{},trips:{},tripsByRoute:{},stops:{},stopTimes:{},frequencies:[],calendar:{},serviceIds:[]};
  parse(await readTxt('calendar.txt')).forEach(function(c){ if(c.service_id) out.calendar[String(c.service_id)]=c; });
  parse(await readTxt('routes.txt')).forEach(function(r){
    var rid=String(r.route_id||''); if(!rid) return; r.route_id=rid; out.routes[rid]=r;
    var key=normalizeRouteCode(r.route_short_name||rid); if(key && !out.routesByShort[key]) out.routesByShort[key]=r;
  });
  parse(await readTxt('trips.txt')).forEach(function(t){
    var tid=String(t.trip_id||''); if(!tid) return;
    t.trip_id=tid; t.route_id=String(t.route_id||''); t.service_id=String(t.service_id||''); t.direction_id=String(t.direction_id==null||t.direction_id===''?0:t.direction_id);
    out.trips[tid]=t;
    if(!out.tripsByRoute[t.route_id]) out.tripsByRoute[t.route_id]=[];
    out.tripsByRoute[t.route_id].push(t);
  });
  parse(await readTxt('stops.txt')).forEach(function(st){
    var sid=String(st.stop_id||''); if(!sid) return;
    st.stop_id=sid; st.stop_lat=csvNum(st.stop_lat,null); st.stop_lon=csvNum(st.stop_lon,null); out.stops[sid]=st;
  });
  parse(await readTxt('stop_times.txt')).forEach(function(row){
    var tid=String(row.trip_id||''); if(!tid) return;
    row.trip_id=tid; row.stop_id=String(row.stop_id||''); row.stop_sequence=csvNum(row.stop_sequence);
    if(!out.stopTimes[tid]) out.stopTimes[tid]=[];
    out.stopTimes[tid].push(row);
  });
  Object.keys(out.stopTimes).forEach(function(tid){ out.stopTimes[tid].sort(function(a,b){return a.stop_sequence-b.stop_sequence;}); });
  out.frequencies=parse(await readTxt('frequencies.txt')).map(function(f){
    f.trip_id=String(f.trip_id||''); f.headway_secs=csvNum(f.headway_secs); f.start_time=String(f.start_time||''); f.end_time=String(f.end_time||''); return f;
  });
  out.serviceIds=unique(Object.values(out.trips).map(function(t){return t.service_id;})).sort(sortServices);
  return out;
}
function currentGTFSForCompare(){
  var out={routes:DATA.routes,routesByShort:{},trips:DATA.trips,tripsByRoute:DATA.tripsByRoute,stops:DATA.stops,stopTimes:DATA.stopTimes,frequencies:DATA.frequencies,calendar:DATA.calendar,serviceIds:DATA.serviceIds};
  Object.values(DATA.routes).forEach(function(r){ var key=normalizeRouteCode(r.route_short_name||r.route_id); if(key && !out.routesByShort[key]) out.routesByShort[key]=r; });
  return out;
}
function normalizeRouteCode(v){ return String(v||'').trim().toLowerCase(); }
function displayRouteCode(route, key){ return route ? String(route.route_short_name||route.route_id||key) : String(key||'—'); }
function routeLong(route){ return route ? String(route.route_long_name||'') : ''; }
function serviceLabelForFeed(feed, sid){
  if(SVC[sid]) return SVC[sid];
  var c = feed.calendar ? feed.calendar[sid] : null;
  if(c){
    var flags = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(function(k){return String(c[k])==='1'||c[k]===1;});
    var active = flags.map(function(v,i){return v?DAY_NAMES[i]:null;}).filter(Boolean);
    if(active.length===5 && flags.slice(0,5).every(Boolean) && !flags[5] && !flags[6]) return 'Lunes a Viernes';
    if(active.length===7) return 'Todos los días';
    if(active.length) return active.join(', ');
  }
  return sid || '—';
}
function stopNameForFeed(feed, stopId){ var st=feed.stops[stopId]||{}; return cleanName(st.stop_name||stopId); }
function routeTrips(feed, route){ return route ? (feed.tripsByRoute[String(route.route_id)]||[]) : []; }
function routeTripsCount(feed, route){ return routeTrips(feed,route).length; }
function routeServicesForFeed(feed, route){ return unique(routeTrips(feed,route).map(function(t){return t.service_id;})).sort(sortServices); }
function routeDirsForFeed(feed, route){ return unique(routeTrips(feed,route).map(function(t){return tripDir(t);})).sort(); }
function routeStopSeqsByDir(feed, route){
  var out={};
  routeTrips(feed,route).forEach(function(t){
    var d=tripDir(t);
    if(out[d]) return;
    var st=feed.stopTimes[t.trip_id]||[];
    if(st.length) out[d]=st.map(function(x){return x.stop_id;});
  });
  return out;
}
function routeStopSignature(feed, route){
  var byDir=routeStopSeqsByDir(feed,route);
  return Object.keys(byDir).sort().map(function(k){return k+':'+byDir[k].join('>');}).join('|');
}
function avgHeadwayForRoute(feed, route){
  if(!route) return null;
  var trips=routeTrips(feed,route), ids={}; trips.forEach(function(t){ids[t.trip_id]=true;});
  var freqs=(feed.frequencies||[]).filter(function(f){return ids[f.trip_id]&&f.headway_secs>0;});
  if(freqs.length) return Math.round(freqs.reduce(function(a,f){return a+f.headway_secs;},0)/freqs.length/60);
  var starts=[]; trips.forEach(function(t){ var st=feed.stopTimes[t.trip_id]; if(st&&st.length) starts.push(timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00')); });
  starts.sort(function(a,b){return a-b;}); if(starts.length<2) return null;
  var diffs=[]; for(var i=1;i<starts.length;i++){ if(starts[i]-starts[i-1]>0) diffs.push(starts[i]-starts[i-1]); }
  return diffs.length?Math.round(diffs.reduce(function(a,b){return a+b;},0)/diffs.length/60):null;
}
function stopDeltaDetails(oldFeed, newFeed, oldR, newR){
  var oldSeqs=routeStopSeqsByDir(oldFeed,oldR), newSeqs=routeStopSeqsByDir(newFeed,newR), details=[];
  var dirs=unique(Object.keys(oldSeqs).concat(Object.keys(newSeqs))).sort();
  dirs.forEach(function(d){
    var oldSeq=oldSeqs[d]||[], newSeq=newSeqs[d]||[];
    if(oldSeq.join('>')===newSeq.join('>')) return;
    var oldSet={}, newSet={}; oldSeq.forEach(function(x){oldSet[x]=true;}); newSeq.forEach(function(x){newSet[x]=true;});
    var added=newSeq.filter(function(x){return !oldSet[x];}).length;
    var removed=oldSeq.filter(function(x){return !newSet[x];}).length;
    var oldFirst=oldSeq.length?stopNameForFeed(oldFeed,oldSeq[0]):'—';
    var newFirst=newSeq.length?stopNameForFeed(newFeed,newSeq[0]):'—';
    var oldLast=oldSeq.length?stopNameForFeed(oldFeed,oldSeq[oldSeq.length-1]):'—';
    var newLast=newSeq.length?stopNameForFeed(newFeed,newSeq[newSeq.length-1]):'—';
    var txt=dirName(d)+': '+oldSeq.length+' → '+newSeq.length+' paraderos';
    if(added||removed) txt+=' ('+added+' nuevos, '+removed+' eliminados)';
    if(oldFirst!==newFirst || oldLast!==newLast) txt+='; inicio '+oldFirst+' → '+newFirst+'; término '+oldLast+' → '+newLast;
    details.push(txt);
  });
  return details;
}
function routeChangeDetails(oldFeed, newFeed, oldR, newR){
  var details=[];
  if(routeLong(oldR)!==routeLong(newR)) details.push('Nombre largo: '+(routeLong(oldR)||'—')+' → '+(routeLong(newR)||'—'));
  if(String(oldR.route_color||'')!==String(newR.route_color||'')) details.push('Color: '+(oldR.route_color||'—')+' → '+(newR.route_color||'—'));
  var oldTrips=routeTripsCount(oldFeed,oldR), newTrips=routeTripsCount(newFeed,newR);
  if(oldTrips!==newTrips) details.push('Viajes diarios/base: '+oldTrips+' → '+newTrips+' ('+(newTrips-oldTrips>0?'+':'')+(newTrips-oldTrips)+')');
  var oldSvc=routeServicesForFeed(oldFeed,oldR), newSvc=routeServicesForFeed(newFeed,newR);
  if(oldSvc.join('|')!==newSvc.join('|')) details.push('Tipos de día: '+oldSvc.map(function(s){return serviceLabelForFeed(oldFeed,s);}).join(', ')+' → '+newSvc.map(function(s){return serviceLabelForFeed(newFeed,s);}).join(', '));
  var oldDirs=routeDirsForFeed(oldFeed,oldR).map(dirName), newDirs=routeDirsForFeed(newFeed,newR).map(dirName);
  if(oldDirs.join('|')!==newDirs.join('|')) details.push('Sentidos: '+oldDirs.join(', ')+' → '+newDirs.join(', '));
  details=details.concat(stopDeltaDetails(oldFeed,newFeed,oldR,newR));
  var oldHw=avgHeadwayForRoute(oldFeed,oldR), newHw=avgHeadwayForRoute(newFeed,newR);
  if(oldHw!==null && newHw!==null && Math.abs(newHw-oldHw)>=1) details.push('Frecuencia promedio general: '+oldHw+' → '+newHw+' min');
  return details;
}
function frequencyProfile(feed){
  var byTrip={};
  Object.values(feed.trips).forEach(function(t){ byTrip[t.trip_id]=t; });
  var grouped={};
  (feed.frequencies||[]).forEach(function(f){
    var t=byTrip[f.trip_id]; if(!t || !f.headway_secs) return;
    var r=feed.routes[t.route_id]; if(!r) return;
    var rKey=normalizeRouteCode(r.route_short_name||r.route_id);
    var key=[rKey,t.service_id,tripDir(t),String(f.start_time||''),String(f.end_time||'')].join('|');
    if(!grouped[key]) grouped[key]={routeKey:rKey,route:r,serviceId:t.service_id,dir:tripDir(t),start:f.start_time,end:f.end_time,total:0,count:0};
    grouped[key].total+=f.headway_secs; grouped[key].count++;
  });
  var out={};
  Object.keys(grouped).forEach(function(k){ var g=grouped[k]; g.headwayMin=Math.round((g.total/g.count)/60); out[k]=g; });
  return out;
}
function compareFrequencyWindows(oldFeed,newFeed){
  var oldP=frequencyProfile(oldFeed), newP=frequencyProfile(newFeed), changes=[];
  Object.keys(newP).forEach(function(k){
    if(!oldP[k]) return;
    var oldH=oldP[k].headwayMin, newH=newP[k].headwayMin;
    if(oldH!==newH) changes.push({key:k, routeKey:newP[k].routeKey, route:newP[k].route, serviceId:newP[k].serviceId, day:serviceLabelForFeed(newFeed,newP[k].serviceId), dir:newP[k].dir, start:newP[k].start, end:newP[k].end, oldHw:oldH, newHw:newH, delta:newH-oldH});
  });
  changes.sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta);});
  return changes;
}
function compareFeeds(oldFeed, newFeed){
  var oldKeys=Object.keys(oldFeed.routesByShort), newKeys=Object.keys(newFeed.routesByShort);
  var oldSet={},newSet={}; oldKeys.forEach(function(k){oldSet[k]=true;}); newKeys.forEach(function(k){newSet[k]=true;});
  var created=newKeys.filter(function(k){return !oldSet[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var deleted=oldKeys.filter(function(k){return !newSet[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var common=newKeys.filter(function(k){return oldSet[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var modified=[];
  common.forEach(function(k){
    var oldR=oldFeed.routesByShort[k], newR=newFeed.routesByShort[k];
    var details=routeChangeDetails(oldFeed,newFeed,oldR,newR);
    if(details.length){
      modified.push({key:k, oldRoute:oldR, route:newR, details:details, oldTrips:routeTripsCount(oldFeed,oldR), newTrips:routeTripsCount(newFeed,newR), oldHw:avgHeadwayForRoute(oldFeed,oldR), newHw:avgHeadwayForRoute(newFeed,newR)});
    }
  });
  var oldStops={}, newStops={}; Object.keys(oldFeed.stops).forEach(function(k){oldStops[k]=true;}); Object.keys(newFeed.stops).forEach(function(k){newStops[k]=true;});
  var stopsCreated=Object.keys(newStops).filter(function(k){return !oldStops[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var stopsDeleted=Object.keys(oldStops).filter(function(k){return !newStops[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  return {created:created,deleted:deleted,modified:modified,freqChanges:compareFrequencyWindows(oldFeed,newFeed),stopsCreated:stopsCreated,stopsDeleted:stopsDeleted};
}
function tableFromRows(headers, rows){
  if(!rows.length) return '<div class="no-data">Sin cambios detectados</div>';
  return '<div class="tbl-wrap"><table><thead><tr>'+headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}
function renderCompare(cmp, oldFeed, newFeed){
  document.getElementById('compare-results').style.display='block';
  document.getElementById('compare-hint').style.display='none';
  document.getElementById('compare-summary').innerHTML=[
    ['Rutas creadas',cmp.created.length],['Rutas eliminadas',cmp.deleted.length],['Rutas modificadas',cmp.modified.length],['Paraderos nuevos',cmp.stopsCreated.length],['Paraderos eliminados',cmp.stopsDeleted.length],['Cambios frecuencia',cmp.freqChanges.length]
  ].map(function(x){return '<div class="stat-card"><div class="lbl">'+x[0]+'</div><div class="val">'+x[1]+'</div></div>';}).join('');
  document.getElementById('routes-created-wrap').innerHTML=tableFromRows(['Ruta','Nombre','Viajes','Tipos de día','Frecuencia prom.'], cmp.created.map(function(k){
    var r=newFeed.routesByShort[k], hw=avgHeadwayForRoute(newFeed,r);
    return '<tr><td><b>'+esc(displayRouteCode(r,k))+'</b></td><td>'+esc(routeLong(r))+'</td><td>'+routeTripsCount(newFeed,r)+'</td><td>'+routeServicesForFeed(newFeed,r).map(function(s){return serviceLabelForFeed(newFeed,s);}).join(', ')+'</td><td>'+(hw?hw+' min':'—')+'</td></tr>';
  }));
  document.getElementById('routes-deleted-wrap').innerHTML=tableFromRows(['Ruta','Nombre','Viajes','Tipos de día','Frecuencia prom.'], cmp.deleted.map(function(k){
    var r=oldFeed.routesByShort[k], hw=avgHeadwayForRoute(oldFeed,r);
    return '<tr><td><b>'+esc(displayRouteCode(r,k))+'</b></td><td>'+esc(routeLong(r))+'</td><td>'+routeTripsCount(oldFeed,r)+'</td><td>'+routeServicesForFeed(oldFeed,r).map(function(s){return serviceLabelForFeed(oldFeed,s);}).join(', ')+'</td><td>'+(hw?hw+' min':'—')+'</td></tr>';
  }));
  document.getElementById('routes-modified-wrap').innerHTML=tableFromRows(['Ruta','Viajes','Frec. prom.','Detalle del cambio'], cmp.modified.slice(0,100).map(function(m){
    var hwOld=m.oldHw==null?'—':m.oldHw+' min', hwNew=m.newHw==null?'—':m.newHw+' min';
    return '<tr><td><b>'+esc(displayRouteCode(m.route,m.key))+'</b><br><small>'+esc(routeLong(m.route)||'—')+'</small></td><td>'+m.oldTrips+' → '+m.newTrips+'</td><td>'+hwOld+' → '+hwNew+'</td><td>'+esc(m.details.join(' | '))+'</td></tr>';
  }));
  document.getElementById('freq-changes-wrap').innerHTML=tableFromRows(['Ruta','Día','Sentido','Horario','Antes','Ahora','Cambio'], cmp.freqChanges.slice(0,120).map(function(f){
    var cls=f.delta<0?'delta-up':'delta-down', label=f.delta<0?'mejora ':'empeora ';
    return '<tr><td><b>'+esc(displayRouteCode(f.route,f.routeKey))+'</b></td><td>'+esc(f.day)+'</td><td>'+esc(dirName(f.dir))+'</td><td>'+esc(String(f.start).slice(0,5))+'–'+esc(String(f.end).slice(0,5))+'</td><td>'+f.oldHw+' min</td><td>'+f.newHw+' min</td><td class="'+cls+'">'+label+(f.delta>0?'+':'')+f.delta+' min</td></tr>';
  }));
  function stopRows(ids, feed){ return ids.slice(0,150).map(function(id){ var st=feed.stops[id]||{}; return '<tr><td><b>'+esc(id)+'</b></td><td>'+esc(cleanName(st.stop_name||''))+'</td><td>'+(st.stop_lat!==null?(+st.stop_lat).toFixed(5)+', '+(+st.stop_lon).toFixed(5):'—')+'</td></tr>'; }); }
  document.getElementById('stops-created-wrap').innerHTML=tableFromRows(['Código','Nombre','Coordenadas'], stopRows(cmp.stopsCreated,newFeed));
  document.getElementById('stops-deleted-wrap').innerHTML=tableFromRows(['Código','Nombre','Coordenadas'], stopRows(cmp.stopsDeleted,oldFeed));
}
async function compareSelectedGTFS(){
  var baseSel=document.getElementById('compare-base-select'), targetSel=document.getElementById('compare-target-select');
  if(!baseSel || !targetSel || !baseSel.value || !targetSel.value){ alert('Selecciona dos GTFS.'); return; }
  var baseName=baseSel.options[baseSel.selectedIndex].dataset.name || baseSel.options[baseSel.selectedIndex].textContent;
  var targetName=targetSel.options[targetSel.selectedIndex].dataset.name || targetSel.options[targetSel.selectedIndex].textContent;
  if(baseSel.value===targetSel.value){ alert('Selecciona dos GTFS distintos para comparar.'); return; }
  document.getElementById('compare-hint').style.display='block';
  document.getElementById('compare-hint').textContent='Descargando y procesando '+baseName+' contra '+targetName+'...';
  document.getElementById('compare-results').style.display='none';
  try{
    var baseFile=await fetchGTFSFileFromURL(baseSel.value,baseName);
    var targetFile=await fetchGTFSFileFromURL(targetSel.value,targetName);
    var oldFeed=await parseGTFSForCompare(baseFile);
    var newFeed=await parseGTFSForCompare(targetFile);
    var cmp=compareFeeds(oldFeed,newFeed);
    document.getElementById('compare-hint').textContent='Comparación lista: '+baseName+' → '+targetName+'.';
    renderCompare(cmp, oldFeed, newFeed);
  }catch(err){
    console.error(err);
    document.getElementById('compare-hint').textContent='No se pudo comparar. Revisa que los ZIP existan en /data y que GitHub Pages pueda descargarlos.';
  }
}
async function handleOldGTFS(file){
  if(!file) return;
  document.getElementById('old-gtfs-label').textContent='Procesando '+(file.name||'archivo')+'...';
  try{
    OLD_GTFS = await parseGTFSForCompare(file);
    var newFeed=currentGTFSForCompare();
    var cmp=compareFeeds(OLD_GTFS,newFeed);
    document.getElementById('old-gtfs-label').textContent='Archivo manual comparado contra GTFS cargado: '+(file.name||'archivo');
    renderCompare(cmp, OLD_GTFS, newFeed);
  }catch(err){
    console.error(err);
    document.getElementById('old-gtfs-label').textContent='No se pudo leer el GTFS manual. Revisa que sea un .zip GTFS válido.';
  }
}


/* v2.3.0 — parámetros manuales y control PO/GTFS */

var PO = {
  loaded:false,
  fileName:'',
  units:{},
  routesByCode:{},
  params:[],
  hours:[],
  stopsByRouteDir:{},
  stops:[],
  errors:[],
  comparison:null
};

function cleanCode(v){
  var s=String(v==null?'':v).trim();
  if(/^\d+(\.0+)?$/.test(s)) s=String(parseInt(s,10));
  return s.replace(/\s+/g,'');
}
function normalizeRouteCode(v){
  return cleanCode(v).toLowerCase();
}
function normalizeUnit(v){
  var s=String(v||'').toUpperCase();
  var m=s.match(/U\s*0?(\d{1,2})/);
  if(m) return 'U'+String(Number(m[1]));
  if(/^\d+$/.test(s)) return 'U'+String(Number(s));
  return s.trim();
}
function normalizeTextLite(v){
  return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function normalizePoDay(v){
  var s=normalizeTextLite(v);
  if(!s) return '';
  if(s.indexOf('laboral')!==-1 || s==='l' || s.indexOf('lunes')!==-1) return 'L';
  if(s.indexOf('sab')!==-1 || s==='s') return 'S';
  if(s.indexOf('dom')!==-1 || s==='d') return 'D';
  if(s.indexOf('fest')!==-1 || s==='f') return 'F';
  if(s.indexOf('viernes')!==-1 || s==='v') return 'V';
  return String(v||'').trim();
}
function normalizePoDir(v){
  var s=normalizeTextLite(v);
  if(!s) return '';
  if(s==='0' || s.indexOf('ida')!==-1 || s==='i') return '0';
  if(s==='1' || s.indexOf('ret')!==-1 || s.indexOf('reg')!==-1 || s==='r') return '1';
  return String(v||'').trim();
}
function dayLabelShort(s){
  return SVC[s] || ({L:'Laboral',S:'Sábado',D:'Domingo',F:'Festivo',V:'Viernes',LJ:'Lun a Jue'}[s]) || s || '—';
}
function excelTimeToSecs(v){
  if(v===null || v===undefined || v==='') return null;
  var n=Number(String(v).replace(',','.'));
  if(!isNaN(n) && n>=0 && n<2) return Math.round((n%1)*86400) + Math.floor(n)*86400;
  var s=String(v).trim();
  if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return timeToSecs(s.length===5?s+':00':s);
  return null;
}
function secsToClockFull(s){
  if(s===null || s===undefined || isNaN(s)) return '—';
  var h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
function setPoStatus(txt, cls){
  var el=document.getElementById('po-status');
  if(!el) return;
  el.className=cls||'';
  el.textContent=txt;
}

/* Reemplaza la carga de XLSX para soportar también archivo manual */
async function loadWorkbookMeta(fileObj){
  var blob;
  if(fileObj.file){
    blob=fileObj.file;
  }else{
    var res=await fetch(fileObj.download_url,{cache:'no-store'});
    if(!res.ok) throw new Error('No se pudo descargar el consolidado ('+res.status+').');
    blob=await res.blob();
  }
  var zip=await JSZip.loadAsync(blob);
  var wbXml=await zip.file('xl/workbook.xml').async('string');
  var relXml=await zip.file('xl/_rels/workbook.xml.rels').async('string');
  var wbDoc=new DOMParser().parseFromString(wbXml,'application/xml');
  var relDoc=new DOMParser().parseFromString(relXml,'application/xml');
  var rels={};
  Array.prototype.forEach.call(relDoc.getElementsByTagName('Relationship'),function(r){
    rels[r.getAttribute('Id')]=xlsxRelPath('xl/workbook.xml',r.getAttribute('Target'));
  });
  var sheets=[];
  Array.prototype.forEach.call(wbDoc.getElementsByTagName('sheet'),function(s){
    var rid=s.getAttribute('r:id') || s.getAttribute('id');
    var name=s.getAttribute('name') || '';
    if(name.toLowerCase()==='diccio' || name.toLowerCase()==='diccionario') return;
    sheets.push({name:name, path:rels[rid], metric:sheetMetricFromName(name), period:sheetPeriodFromName(name)});
  });
  PARAMS.file=fileObj; PARAMS.zip=zip; PARAMS.sheets=sheets; PARAMS.cache={}; PARAMS.sharedStrings=null;
  PARAMS.sourceDate=extractDateFromName(fileObj.name);
  DATA.sourceNames.param=fileObj.name;
  DATA.sourceDates.param=PARAMS.sourceDate;
}
async function loadManualParamFile(file){
  if(!file) return;
  PARAMS.loading=true;
  setParamStatus('Leyendo consolidado manual: '+(file.name||'archivo')+'...');
  try{
    await loadWorkbookMeta({name:file.name||'parametros.xlsx', file:file});
    fillParamSheets();
    await renderSelectedParamSheet();
    setParamStatus('Consolidado manual cargado: '+(file.name||'archivo')+'.');
  }catch(err){
    console.error(err);
    setParamStatus('No se pudo leer el XLSX manual: '+(err.message||err));
  }finally{
    PARAMS.loading=false;
  }
}

document.addEventListener('change',function(e){
  if(e.target && e.target.id==='param-manual-input') loadManualParamFile(e.target.files[0]);
  if(e.target && e.target.id==='po-file-input') loadPOZip(e.target.files[0]);
  if(e.target && /^(po-company-filter|po-day-filter|po-dir-filter)$/.test(e.target.id)) renderPoComparison();
});
document.addEventListener('input',function(e){
  if(e.target && e.target.id==='po-route-search') renderPoComparison();
});

async function xlsxOpenFromBuffer(buffer){
  var xzip=await JSZip.loadAsync(buffer);
  var wb=xzip.file('xl/workbook.xml');
  var rel=xzip.file('xl/_rels/workbook.xml.rels');
  if(!wb || !rel) throw new Error('XLSX inválido');
  var wbXml=await wb.async('string');
  var relXml=await rel.async('string');
  var wbDoc=new DOMParser().parseFromString(wbXml,'application/xml');
  var relDoc=new DOMParser().parseFromString(relXml,'application/xml');
  var rels={};
  Array.prototype.forEach.call(relDoc.getElementsByTagName('Relationship'),function(r){
    rels[r.getAttribute('Id')]=xlsxRelPath('xl/workbook.xml',r.getAttribute('Target'));
  });
  var sheets=[];
  Array.prototype.forEach.call(wbDoc.getElementsByTagName('sheet'),function(s){
    var rid=s.getAttribute('r:id') || s.getAttribute('id');
    sheets.push({name:s.getAttribute('name')||'', path:rels[rid]});
  });
  var sharedFile=xzip.file('xl/sharedStrings.xml');
  var shared=sharedFile ? parseSharedStringsXml(await sharedFile.async('string')) : [];
  return {zip:xzip, sheets:sheets, shared:shared};
}
async function xlsxReadSheetMatrix(workbook, matcher){
  var sheet=null;
  if(typeof matcher==='function') sheet=workbook.sheets.find(matcher);
  else if(matcher) sheet=workbook.sheets.find(function(s){return normalizeTextLite(s.name).indexOf(normalizeTextLite(matcher))!==-1;});
  if(!sheet) sheet=workbook.sheets[0];
  if(!sheet || !sheet.path) return [];
  var file=workbook.zip.file(sheet.path);
  if(!file) return [];
  var xml=await file.async('string');
  var doc=new DOMParser().parseFromString(xml,'application/xml');
  var matrix=[];
  Array.prototype.forEach.call(doc.getElementsByTagName('row'),function(row){
    var rIndex=Number(row.getAttribute('r')||0)-1;
    if(!matrix[rIndex]) matrix[rIndex]=[];
    Array.prototype.forEach.call(row.getElementsByTagName('c'),function(c){
      matrix[rIndex][xlsxColIndex(c.getAttribute('r'))]=xlsxCellValue(c,workbook.shared);
    });
  });
  return matrix;
}
function findHeaderRow(matrix, requiredWords){
  var req=requiredWords.map(normalizeTextLite);
  for(var i=0;i<matrix.length;i++){
    var row=(matrix[i]||[]).map(normalizeTextLite);
    var hits=req.filter(function(w){return row.some(function(c){return c.indexOf(w)!==-1;});}).length;
    if(hits>=Math.min(req.length,3)) return i;
  }
  return -1;
}
function findCol(headers, candidates){
  var hs=(headers||[]).map(normalizeTextLite);
  for(var i=0;i<candidates.length;i++){
    var c=normalizeTextLite(candidates[i]);
    for(var j=0;j<hs.length;j++){
      if(hs[j] && hs[j].indexOf(c)!==-1) return j;
    }
  }
  return -1;
}
function addPoRoute(routeCode, codigoTs, unit, operator, source){
  var key=normalizeRouteCode(routeCode);
  if(!key) return null;
  if(!PO.routesByCode[key]){
    PO.routesByCode[key]={key:key, routeCode:cleanCode(routeCode), codigoTs:cleanCode(codigoTs), unit:normalizeUnit(unit), operator:operator||normalizeUnit(unit), sources:[], params:0, hours:0, stopDirs:0};
  }
  var r=PO.routesByCode[key];
  if(codigoTs && !r.codigoTs) r.codigoTs=cleanCode(codigoTs);
  if(unit && !r.unit) r.unit=normalizeUnit(unit);
  if(operator && !r.operator) r.operator=operator;
  if(source && r.sources.indexOf(source)===-1) r.sources.push(source);
  PO.units[r.unit || r.operator || 'Sin unidad']=true;
  return r;
}
function poMetaFromPath(path){
  var parts=String(path||'').split('/');
  var folder=parts.length>1 ? parts[parts.length-2] : '';
  var m=folder.match(/(U\s*0?\d{1,2})\s*-\s*(.+)$/i);
  var unit=m ? normalizeUnit(m[1]) : '';
  var op=m ? (unit+' - '+m[2].replace(/\s+$/,'').trim()) : (unit || folder || 'PO');
  return {unit:unit, operator:op};
}
function parsePoAnexo1(matrix, meta, source){
  var h=findHeaderRow(matrix,['CODIGO TS','CODIGO Usuario','Sentido','TIPO DIA']);
  if(h<0) return;
  var headers=matrix[h]||[];
  var cUn=findCol(headers,['UNIDAD DE SERVICIOS','UNIDAD DE SERVICIO']);
  var cTs=findCol(headers,['CODIGO TS']);
  var cUser=findCol(headers,['CODIGO Usuario','CODIGO USUARIO']);
  var cDir=findCol(headers,['Sentido']);
  var cDay=findCol(headers,['TIPO DIA']);
  var cIni=findCol(headers,['HORA INICIO']);
  var cFin=findCol(headers,['HORA TERMINO','HORA TÉRMINO']);
  for(var i=h+1;i<matrix.length;i++){
    var r=matrix[i]||[];
    var code=cleanCode(r[cUser]), ts=cleanCode(r[cTs]);
    if(!code && !ts) continue;
    var route=addPoRoute(code||ts, ts, r[cUn]||meta.unit, meta.operator, source);
    if(route) route.hours++;
    PO.hours.push({routeKey:normalizeRouteCode(code||ts), routeCode:code||ts, codigoTs:ts, unit:normalizeUnit(r[cUn]||meta.unit), operator:meta.operator, day:normalizePoDay(r[cDay]), dir:normalizePoDir(r[cDir]), start:excelTimeToSecs(r[cIni]), end:excelTimeToSecs(r[cFin]), source:source});
  }
}
function parsePoAnexo3(matrix, meta, source){
  var h=findHeaderRow(matrix,['CODIGO TS','CODIGO USUARIO','SENTIDO','TIPO DIA','N° SALIDAS']);
  if(h<0) return;
  var headers=matrix[h]||[];
  var cUn=findCol(headers,['UNIDAD DE SERVICIO']);
  var cTs=findCol(headers,['CODIGO TS']);
  var cUser=findCol(headers,['CODIGO USUARIO']);
  var cDir=findCol(headers,['SENTIDO']);
  var cDay=findCol(headers,['TIPO DIA']);
  var cMh=findCol(headers,['MH']);
  var cVel=findCol(headers,['VELOCIDAD']);
  var cDist=findCol(headers,['DISTANCIA BASE','DISTANCIA TOTAL']);
  var cSal=findCol(headers,['N° SALIDAS','Nº SALIDAS','SALIDAS']);
  var cCap=findCol(headers,['CAPACIDAD']);
  for(var i=h+1;i<matrix.length;i++){
    var r=matrix[i]||[];
    var code=cleanCode(r[cUser]), ts=cleanCode(r[cTs]);
    if(!code && !ts) continue;
    var nSal=paramNumber(r[cSal]);
    if(nSal===null) nSal=0;
    var route=addPoRoute(code||ts, ts, r[cUn]||meta.unit, meta.operator, source);
    if(route) route.params++;
    PO.params.push({
      routeKey:normalizeRouteCode(code||ts),
      routeCode:code||ts,
      codigoTs:ts,
      unit:normalizeUnit(r[cUn]||meta.unit),
      operator:meta.operator,
      day:normalizePoDay(r[cDay]),
      dir:normalizePoDir(r[cDir]),
      start:excelTimeToSecs(r[cMh]),
      departures:nSal,
      velocity:paramNumber(r[cVel]),
      distance:paramNumber(r[cDist]),
      capacity:paramNumber(r[cCap]),
      source:source
    });
  }
}
function parsePoRegistroParadas(matrix, meta, source){
  var h=findHeaderRow(matrix,['Orden','Código TS','Código Usuario','Sentido Servicio','Código  paradero Usuario']);
  if(h<0) return;
  var headers=matrix[h]||[];
  var cOrd=findCol(headers,['Orden']);
  var cTs=findCol(headers,['Código TS','Codigo TS']);
  var cUser=findCol(headers,['Código Usuario','Codigo Usuario']);
  var cDir=findCol(headers,['Sentido Servicio','Sentido']);
  var cUn=findCol(headers,['UN','Unidad']);
  var cStop=findCol(headers,['Código  paradero Usuario','Código paradero Usuario','paradero Usuario']);
  var cName=findCol(headers,['Nombre Paradero']);
  for(var i=h+1;i<matrix.length;i++){
    var r=matrix[i]||[];
    var code=cleanCode(r[cUser]), ts=cleanCode(r[cTs]), stop=cleanCode(r[cStop]);
    if((!code && !ts) || !stop) continue;
    var dir=normalizePoDir(r[cDir]);
    var route=addPoRoute(code||ts, ts, r[cUn]||meta.unit, meta.operator, source);
    var key=normalizeRouteCode(code||ts)+'|'+dir;
    if(!PO.stopsByRouteDir[key]) PO.stopsByRouteDir[key]=[];
    var row={routeKey:normalizeRouteCode(code||ts), routeCode:code||ts, codigoTs:ts, unit:normalizeUnit(r[cUn]||meta.unit), operator:meta.operator, dir:dir, order:csvNum(r[cOrd],9999), stopId:stop, stopName:String(r[cName]||''), source:source};
    PO.stopsByRouteDir[key].push(row);
    PO.stops.push(row);
    if(route) route.stopDirs=route.stopDirs || 0;
  }
}
function finalizePoStops(){
  Object.keys(PO.stopsByRouteDir).forEach(function(k){
    PO.stopsByRouteDir[k].sort(function(a,b){return a.order-b.order;});
  });
  Object.values(PO.routesByCode).forEach(function(r){
    r.stopDirs=Object.keys(PO.stopsByRouteDir).filter(function(k){return k.indexOf(r.key+'|')===0;}).length;
  });
}
async function loadPOZip(file){
  if(!file) return;
  PO={loaded:false,fileName:file.name||'PO.zip',units:{},routesByCode:{},params:[],hours:[],stopsByRouteDir:{},stops:[],errors:[],comparison:null};
  document.getElementById('po-panel').style.display='none';
  setPoStatus('Leyendo ZIP PO vigente...', '');
  try{
    var zip=await JSZip.loadAsync(file);
    var names=Object.keys(zip.files).filter(function(n){
      return /\.xlsx$/i.test(n) && !/(^|\/)~\$/.test(n) && /(Anexo 1|Anexo 3|Registro de paradas|Subregistro de paradas)/i.test(n);
    });
    if(!names.length) throw new Error('El ZIP no contiene Anexo 1, Anexo 3 ni Registro de paradas en XLSX.');
    var total=names.length;
    for(var i=0;i<names.length;i++){
      var name=names[i], meta=poMetaFromPath(name);
      setPoStatus('Procesando PO '+(i+1)+'/'+total+': '+name.split('/').pop(), '');
      try{
        var buffer=await zip.file(name).async('arraybuffer');
        var workbook=await xlsxOpenFromBuffer(buffer);
        if(/Anexo 1/i.test(name)){
          parsePoAnexo1(await xlsxReadSheetMatrix(workbook,'Horarios'), meta, name);
        }else if(/Anexo 3/i.test(name)){
          parsePoAnexo3(await xlsxReadSheetMatrix(workbook,'Parámetros'), meta, name);
        }else if(/Registro de paradas|Subregistro de paradas/i.test(name)){
          parsePoRegistroParadas(await xlsxReadSheetMatrix(workbook,'Paradas'), meta, name);
        }
      }catch(inner){
        console.warn('No se pudo leer PO', name, inner);
        PO.errors.push(name+': '+(inner.message||inner));
      }
      if(i%3===0) await new Promise(function(resolve){setTimeout(resolve,0);});
    }
    finalizePoStops();
    PO.loaded=true;
    fillPoFilters();
    document.getElementById('po-panel').style.display='block';
    renderPoComparison();
    setPoStatus('PO cargado: '+Object.keys(PO.routesByCode).length+' recorridos, '+PO.params.length.toLocaleString()+' filas de parámetros y '+PO.stops.length.toLocaleString()+' paradas.', 'status-ok');
  }catch(err){
    console.error(err);
    setPoStatus('No se pudo cargar el PO: '+(err.message||err), 'status-bad');
  }
}
function fillPoFilters(){
  fillParamSelect('po-company-filter', Object.keys(PO.units).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});}), 'Todas');
  fillParamSelect('po-day-filter', unique(PO.params.map(function(p){return p.day;})).sort(sortServices), 'Todos');
  fillParamSelect('po-dir-filter', unique(PO.params.map(function(p){return p.dir;})).sort(), 'Todos');
}
function routeByKeyFromGTFS(){
  var out={};
  Object.values(DATA.routes).forEach(function(r){
    var key=normalizeRouteCode(r.route_short_name||r.route_id);
    if(key && !out[key]) out[key]=r;
  });
  return out;
}
function gtfsUnitForRoute(route){
  var op=routeOperator(route);
  var u=normalizeUnit(op);
  return u || 'Sin DECO';
}
function gtfsDeparturesInWindow(route, day, dir, startSec, endSec){
  if(!route || startSec===null || endSec===null) return null;
  var trips=(DATA.tripsByRoute[String(route.route_id)]||[]).filter(function(t){
    return String(t.service_id)===String(day) && String(tripDir(t))===String(dir);
  });
  if(!trips.length) return null;
  var tripIds={}; trips.forEach(function(t){tripIds[t.trip_id]=true;});
  var count=0, usedFreq=false;
  DATA.frequencies.forEach(function(f){
    if(!tripIds[f.trip_id] || !f.headway_secs) return;
    var fs=timeToSecs(f.start_time), fe=timeToSecs(f.end_time);
    var a=Math.max(fs,startSec), b=Math.min(fe,endSec);
    if(b<=a) return;
    usedFreq=true;
    var t=fs;
    if(t<a) t=fs + Math.ceil((a-fs)/f.headway_secs)*f.headway_secs;
    while(t<b){ count++; t+=f.headway_secs; }
  });
  if(usedFreq) return count;
  trips.forEach(function(t){
    var st=DATA.stopTimes[t.trip_id]||[];
    if(!st.length) return;
    var sec=timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
    if(sec>=startSec && sec<endSec) count++;
  });
  return count;
}
function gtfsRouteStopSeq(route, dir){
  if(!route) return [];
  var trips=(DATA.tripsByRoute[String(route.route_id)]||[]).filter(function(t){return String(tripDir(t))===String(dir);});
  if(!trips.length) return [];
  trips.sort(function(a,b){
    var al=(DATA.stopTimes[a.trip_id]||[]).length, bl=(DATA.stopTimes[b.trip_id]||[]).length;
    return bl-al;
  });
  return (DATA.stopTimes[trips[0].trip_id]||[]).map(function(s){return cleanCode(s.stop_id);});
}
function poFilterPass(item){
  var company=document.getElementById('po-company-filter') ? document.getElementById('po-company-filter').value : '__all';
  var day=document.getElementById('po-day-filter') ? document.getElementById('po-day-filter').value : '__all';
  var dir=document.getElementById('po-dir-filter') ? document.getElementById('po-dir-filter').value : '__all';
  var q=normalizeRouteCode(document.getElementById('po-route-search') ? document.getElementById('po-route-search').value : '');
  var unit=item.unit || '';
  if(company!=='__all' && unit!==company) return false;
  if(day!=='__all' && item.day && item.day!==day) return false;
  if(dir!=='__all' && item.dir && item.dir!==dir) return false;
  if(q && normalizeRouteCode(item.routeCode || item.key || '').indexOf(q)===-1) return false;
  return true;
}
function runPoComparison(){
  if(!PO.loaded){ alert('Primero carga el ZIP PO vigente.'); return; }
  renderPoComparison();
}
function buildPoComparison(){
  var gtfsByKey=routeByKeyFromGTFS();
  var allKeys=unique(Object.keys(PO.routesByCode).concat(Object.keys(gtfsByKey))).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var routes=[], companies={};
  allKeys.forEach(function(k){
    var po=PO.routesByCode[k], gtfs=gtfsByKey[k];
    var poUnit=po ? po.unit : '';
    var gtfsUnit=gtfs ? gtfsUnitForRoute(gtfs) : '';
    var routeCode=po ? po.routeCode : (gtfs ? (gtfs.route_short_name||gtfs.route_id) : k);
    var item={key:k, routeCode:routeCode, unit:poUnit||gtfsUnit, poUnit:poUnit, gtfsUnit:gtfsUnit, poOperator:po?(po.operator||poUnit):'', gtfsOperator:gtfs?routeOperator(gtfs):'', po:!!po, gtfs:!!gtfs, poParams:po?po.params:0, poStopDirs:po?po.stopDirs:0, gtfsTrips:gtfs?(DATA.tripsByRoute[String(gtfs.route_id)]||[]).length:0, status:''};
    if(item.po && item.gtfs && (!poUnit || !gtfsUnit || poUnit===gtfsUnit)) item.status='OK';
    else if(item.po && item.gtfs) item.status='Empresa distinta';
    else if(item.po && !item.gtfs) item.status='Falta en GTFS';
    else if(!item.po && item.gtfs) item.status='Sólo GTFS';
    if(poFilterPass(item)) routes.push(item);
    var keyUnit=item.unit || 'Sin unidad';
    if(!companies[keyUnit]) companies[keyUnit]={unit:keyUnit, label:(item.poOperator||item.gtfsOperator||keyUnit), poRoutes:0, gtfsRoutes:0, matched:0, missingGtfs:0, onlyGtfs:0, params:0};
    if(item.po) companies[keyUnit].poRoutes++;
    if(item.gtfs) companies[keyUnit].gtfsRoutes++;
    if(item.po && item.gtfs) companies[keyUnit].matched++;
    if(item.po && !item.gtfs) companies[keyUnit].missingGtfs++;
    if(!item.po && item.gtfs) companies[keyUnit].onlyGtfs++;
    companies[keyUnit].params+=item.poParams||0;
  });

  var paramGroups={};
  PO.params.filter(poFilterPass).forEach(function(p){
    if(!p.routeKey || !p.day || !p.dir || p.start===null) return;
    var key=[p.routeKey,p.day,p.dir,p.start].join('|');
    if(!paramGroups[key]) paramGroups[key]={routeKey:p.routeKey, routeCode:p.routeCode, unit:p.unit, day:p.day, dir:p.dir, start:p.start, po:0, gtfs:null};
    paramGroups[key].po+=Number(p.departures)||0;
  });
  var paramRows=Object.values(paramGroups).map(function(g){
    var route=gtfsByKey[g.routeKey];
    var gtfs=gtfsDeparturesInWindow(route,g.day,g.dir,g.start,g.start+1800);
    g.gtfs=gtfs;
    g.diff=gtfs===null ? null : gtfs-g.po;
    return g;
  }).sort(function(a,b){
    var aa=a.diff===null?999:Math.abs(a.diff), bb=b.diff===null?999:Math.abs(b.diff);
    return bb-aa || String(a.routeCode).localeCompare(String(b.routeCode),undefined,{numeric:true});
  });

  var stopRows=[];
  Object.keys(PO.stopsByRouteDir).forEach(function(key){
    var parts=key.split('|'), routeKey=parts[0], dir=parts[1];
    var sample=PO.stopsByRouteDir[key][0]||{routeCode:routeKey,unit:''};
    if(!poFilterPass({routeCode:sample.routeCode, unit:sample.unit, dir:dir})) return;
    var route=gtfsByKey[routeKey], gtfsSeq=gtfsRouteStopSeq(route,dir), poSeq=PO.stopsByRouteDir[key].map(function(s){return cleanCode(s.stopId);});
    var gtfsSet={}, poSet={}; gtfsSeq.forEach(function(s){gtfsSet[s]=true;}); poSeq.forEach(function(s){poSet[s]=true;});
    var missing=poSeq.filter(function(s){return !gtfsSet[s];}).length;
    var extra=gtfsSeq.filter(function(s){return !poSet[s];}).length;
    var same=poSeq.length===gtfsSeq.length && poSeq.join('>')===gtfsSeq.join('>');
    stopRows.push({routeKey:routeKey, routeCode:sample.routeCode, unit:sample.unit, dir:dir, poCount:poSeq.length, gtfsCount:gtfsSeq.length, missing:missing, extra:extra, same:same, route:route});
  });
  stopRows.sort(function(a,b){return (b.missing+b.extra)-(a.missing+a.extra) || String(a.routeCode).localeCompare(String(b.routeCode),undefined,{numeric:true});});
  return {routes:routes, companies:Object.values(companies), params:paramRows, stops:stopRows};
}
function renderPoComparison(){
  if(!PO.loaded) return;
  var cmp=buildPoComparison();
  PO.comparison=cmp;
  var summary=document.getElementById('po-summary');
  var matched=cmp.routes.filter(function(r){return r.po&&r.gtfs;}).length;
  var missing=cmp.routes.filter(function(r){return r.po&&!r.gtfs;}).length;
  var onlyGtfs=cmp.routes.filter(function(r){return !r.po&&r.gtfs;}).length;
  var paramDiff=cmp.params.filter(function(p){return p.diff!==0;}).length;
  if(summary){
    summary.innerHTML=
      '<div class="stat-card"><div class="lbl">Recorridos filtrados</div><div class="val">'+cmp.routes.length+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Coinciden PO/GTFS</div><div class="val">'+matched+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Faltan en GTFS</div><div class="val">'+missing+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Sólo GTFS</div><div class="val">'+onlyGtfs+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Ventanas con diferencia</div><div class="val">'+paramDiff+'</div></div>'+
      '<div class="stat-card"><div class="lbl">Errores lectura PO</div><div class="val">'+PO.errors.length+'</div></div>';
  }
  renderPoCompanyTable(cmp.companies);
  renderPoRouteTable(cmp.routes);
  renderPoParamsTable(cmp.params);
  renderPoStopsTable(cmp.stops);
}
function statusClass(status){
  if(status==='OK' || status==='Coincide') return 'status-ok';
  if(status==='Falta en GTFS' || status==='Sólo GTFS') return 'status-bad';
  return 'status-warn';
}
function renderPoCompanyTable(companies){
  var rows=companies.sort(function(a,b){return a.unit.localeCompare(b.unit,undefined,{numeric:true});}).map(function(c){
    var status=c.missingGtfs||c.onlyGtfs ? 'Revisar' : 'OK';
    return '<tr><td><b>'+esc(c.label||c.unit)+'</b><br><small>'+esc(c.unit)+'</small></td><td>'+c.poRoutes+'</td><td>'+c.gtfsRoutes+'</td><td>'+c.matched+'</td><td>'+c.missingGtfs+'</td><td>'+c.onlyGtfs+'</td><td class="'+statusClass(status)+'">'+status+'</td></tr>';
  });
  document.getElementById('po-company-wrap').innerHTML=tableFromRows(['Empresa','Rutas PO','Rutas GTFS','Coinciden','Faltan GTFS','Sólo GTFS','Estado'], rows);
}
function renderPoRouteTable(routes){
  var rows=routes.slice(0,220).map(function(r){
    var cls=statusClass(r.status);
    return '<tr><td><b>'+esc(r.routeCode)+'</b></td><td>'+esc(r.poOperator||r.poUnit||'—')+'</td><td>'+esc(r.gtfsOperator||r.gtfsUnit||'—')+'</td><td>'+esc(r.po?'Sí':'No')+'</td><td>'+esc(r.gtfs?'Sí':'No')+'</td><td>'+r.poParams+'</td><td>'+r.gtfsTrips+'</td><td class="'+cls+'">'+esc(r.status)+'</td></tr>';
  });
  var more=routes.length>220?'<div class="param-status">Hay '+(routes.length-220)+' recorridos adicionales no renderizados.</div>':'';
  document.getElementById('po-routes-wrap').innerHTML=tableFromRows(['Ruta','Empresa PO','Empresa GTFS/DECO','En PO','En GTFS','Filas param.','Viajes GTFS','Estado'], rows)+more;
}
function renderPoParamsTable(params){
  var shown=params.slice(0,220);
  var rows=shown.map(function(p){
    var status=p.gtfs===null?'Sin GTFS':(p.diff===0?'Coincide':(p.diff>0?'Exceso GTFS':'Déficit GTFS'));
    var cls=status==='Coincide'?'status-ok':(status==='Sin GTFS'?'status-bad':'status-warn');
    return '<tr><td><b>'+esc(p.routeCode)+'</b></td><td>'+esc((PO.routesByCode[p.routeKey]&&PO.routesByCode[p.routeKey].operator)||p.unit||'—')+'</td><td>'+esc(dayLabelShort(p.day))+'</td><td>'+esc(dirName(p.dir))+'</td><td>'+secsToClockFull(p.start)+'–'+secsToClockFull(p.start+1800)+'</td><td>'+p.po+'</td><td>'+(p.gtfs===null?'—':p.gtfs)+'</td><td>'+(p.diff===null?'—':(p.diff>0?'+':'')+p.diff)+'</td><td class="'+cls+'">'+status+'</td></tr>';
  });
  var more=params.length>220?'<div class="param-status">Hay '+(params.length-220)+' ventanas adicionales no renderizadas.</div>':'';
  document.getElementById('po-params-wrap').innerHTML=tableFromRows(['Ruta','Empresa','Día','Sentido','Media hora','PO','GTFS','Dif.','Estado'], rows)+more;
}
function renderPoStopsTable(stops){
  var rows=stops.slice(0,180).map(function(s){
    var status=s.same?'Coincide':(s.route?'Diferente':'Sin GTFS');
    var cls=s.same?'status-ok':(s.route?'status-warn':'status-bad');
    return '<tr><td><b>'+esc(s.routeCode)+'</b></td><td>'+esc((PO.routesByCode[s.routeKey]&&PO.routesByCode[s.routeKey].operator)||s.unit||'—')+'</td><td>'+esc(dirName(s.dir))+'</td><td>'+s.poCount+'</td><td>'+(s.gtfsCount||'—')+'</td><td>'+s.missing+'</td><td>'+s.extra+'</td><td class="'+cls+'">'+status+'</td></tr>';
  });
  var more=stops.length>180?'<div class="param-status">Hay '+(stops.length-180)+' recorridos/sentidos adicionales no renderizados.</div>':'';
  document.getElementById('po-stops-wrap').innerHTML=tableFromRows(['Ruta','Empresa','Sentido','Paradas PO','Paradas GTFS','Faltan','Sobrantes','Estado'], rows)+more;
}

/* Reemplaza switchTab para incluir Control PO/GTFS */
function switchTab(tab){
  var tabs=['ruta','paradero','parametros','control','comparar'];
  document.querySelectorAll('.tab-btn').forEach(function(b,i){b.classList.toggle('active',tabs[i]===tab);});
  document.getElementById('tab-ruta').style.display=tab==='ruta'?'block':'none';
  document.getElementById('tab-paradero').style.display=tab==='paradero'?'block':'none';
  document.getElementById('tab-parametros').style.display=tab==='parametros'?'block':'none';
  var control=document.getElementById('tab-control');
  if(control) control.style.display=tab==='control'?'block':'none';
  document.getElementById('tab-comparar').style.display=tab==='comparar'?'block':'none';
  if(tab==='ruta' && leafMap) setTimeout(function(){leafMap.invalidateSize();},50);
  if(tab==='paradero' && stopLeafMap) setTimeout(function(){stopLeafMap.invalidateSize(); renderStopMap(activeStop);},70);
  if(tab==='parametros') ensureParamsLoaded();
  if(tab==='control' && PO.loaded) renderPoComparison();
}



/* v2.3.0 — carga inicial sin exigir consolidado de parámetros */
async function loadSelectedMainGTFS(){
  var sel=document.getElementById('github-main-select'), decoSel=document.getElementById('github-deco-select'), paramSel=document.getElementById('param-start-select');
  if(!sel || !sel.value){ alert('No hay GTFS seleccionado.'); return; }
  if(!decoSel || !decoSel.value){ alert('Debes seleccionar un DECO para cargar el sistema.'); return; }
  if(paramSel && paramSel.value) syncParamSelects('start');
  var name=sel.options[sel.selectedIndex].dataset.name || sel.options[sel.selectedIndex].textContent || 'gtfs.zip';
  var decoName=decoSel.options[decoSel.selectedIndex].dataset.name || decoSel.options[decoSel.selectedIndex].textContent || 'deco.zip';
  prog(3,'Descargando GTFS y DECO desde GitHub...');
  try{
    var file=await fetchGTFSFileFromURL(sel.value,name);
    var decoFile=await fetchGTFSFileFromURL(decoSel.value,decoName);
    await handleFile(file, decoFile);
  }
  catch(err){ console.error(err); prog(0,'No se pudo descargar el GTFS o DECO desde GitHub. Usa carga manual o revisa el repositorio.'); }
}

/* v2.3.0 — lectura de parámetros con manejo de errores */
async function renderSelectedParamSheet(){
  if(!PARAMS.sheets.length) return;
  var sheetSel=document.getElementById('param-sheet-select');
  var sheetName=sheetSel && sheetSel.value ? sheetSel.value : PARAMS.sheets[0].name;
  setParamStatus('Leyendo hoja seleccionada...');
  try{
    var parsed=await parseParameterSheet(sheetName);
    PARAMS.activeSheet=sheetName; PARAMS.rows=parsed.rows; PARAMS.intervals=parsed.intervals; PARAMS.metric=parsed.metric;
    fillParamFilters(parsed);
    document.getElementById('param-panel').style.display='block';
    renderParamsTable();
    setParamStatus('Parámetros listos: '+parsed.rows.length+' filas en '+parsed.sheet.name+'.');
  }catch(err){
    console.error(err);
    setParamStatus('No se pudo leer la hoja de parámetros: '+(err.message||err));
  }
}
