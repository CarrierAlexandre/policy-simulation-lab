const TAG_PATTERN=/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,19}$/;
export const SCENARIO_IDS=['energy','credit','boom'];
export const SCENARIO_LABELS={energy:'Energy supply disruption',credit:'Credit squeeze',boom:'Spending boom'};
const EVENT_PATTERN=/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
export const displayScore=value=>Number(Number(value).toFixed(2));
const validScore=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)<=100;

export function cleanTag(value){
  return String(value??'').trim().replace(/\s+/g,' ');
}

export function validTag(value){
  return TAG_PATTERN.test(cleanTag(value));
}

export function normalizeLeaderboards(raw,scenarioIds){
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  return Object.fromEntries(scenarioIds.map(id=>{
    const entries=Array.isArray(source[id])?source[id]:[];
    return [id,entries.filter(entry=>entry&&validTag(entry.tag)&&validScore(entry.score)).map(entry=>({tag:cleanTag(entry.tag),score:displayScore(entry.score)}))];
  }));
}

// The published file is also the event switch. Legacy files remain readable,
// but cannot invite submissions until the controller configures an event.
export function readLeaderboardDocument(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid leaderboard file.');
  for(const id of SCENARIO_IDS){
    if(!Array.isArray(raw[id]))throw new Error(`Missing ${id} leaderboard.`);
    const tags=new Set();
    for(const entry of raw[id]){
      if(!entry||!validTag(entry.tag)||!validScore(entry.score))throw new Error(`Invalid entry in ${id}.`);
      const key=cleanTag(entry.tag).toLowerCase();
      if(tags.has(key))throw new Error(`Duplicate gametag in ${id}: ${entry.tag}.`);
      tags.add(key);
    }
  }
  let meta={eventId:'',submissionsOpen:false,updatedAt:null};
  if(raw._meta!==undefined){
    const m=raw._meta;
    if(!m||typeof m.eventId!=='string'||!EVENT_PATTERN.test(m.eventId)||typeof m.submissionsOpen!=='boolean'||(m.updatedAt!==null&&(typeof m.updatedAt!=='string'||!Number.isFinite(Date.parse(m.updatedAt)))))throw new Error('Invalid event settings.');
    meta={eventId:m.eventId,submissionsOpen:m.submissionsOpen,updatedAt:m.updatedAt};
  }
  return {boards:normalizeLeaderboards(raw,SCENARIO_IDS),meta};
}

export function leaderboardView(boards,scenarioId,attempt,eventId){
  const entries=[...(boards[scenarioId]??[])];
  let status='none';
  if(attempt&&attempt.scenarioId===scenarioId&&Number.isFinite(attempt.score)){
    if(attempt.eventId!==eventId)status='different-event';
    else{
      const existing=entries.findIndex(row=>row.tag.toLowerCase()===attempt.tag.toLowerCase());
      if(existing>=0){
        status=entries[existing].score===displayScore(attempt.score)?'published':'already-recorded';
        entries[existing]={...entries[existing],current:true,provisional:false};
      }else{
        status='provisional';
        entries.push({tag:attempt.tag,score:displayScore(attempt.score),current:true,provisional:true});
      }
    }
  }
  return {entries:rankEntries(entries),status};
}

// Excel copies rectangular selections as tab-separated text. Accept the visible
// percentage number, including comma decimals and Unicode minus signs.
export function createLeaderboardDocument(text,{eventId,submissionsOpen},updatedAt=new Date().toISOString()){
  const id=String(eventId??'').trim();
  if(!EVENT_PATTERN.test(id))throw new Error('Use an event code of 1–40 letters, numbers, hyphens or underscores.');
  const raw={_meta:{eventId:id,submissionsOpen,updatedAt},energy:[],credit:[],boom:[]};
  const aliases={energy:'energy','energy disruption':'energy','energy supply disruption':'energy',credit:'credit','credit squeeze':'credit',boom:'boom','spending boom':'boom'};
  const rows=String(text).replace(/^\uFEFF/,'').split(/\r?\n/);
  for(let n=0;n<rows.length;n++){
    if(!rows[n].trim())continue;
    const cells=rows[n].split('\t').map(s=>s.trim());
    if(cells.length!==3)throw new Error(`Row ${n+1}: copy exactly three Excel columns: Gametag, Scenario, Score.`);
    if(cells[0].toLowerCase()==='gametag'&&cells[1].toLowerCase()==='scenario'&&/^score(?:\s*\(%\))?$/i.test(cells[2]))continue;
    const [tag,scenario,value]=cells;
    if(!validTag(tag))throw new Error(`Row ${n+1}: use a 2–20 character gametag, never a name or email address.`);
    const scenarioId=aliases[scenario.toLowerCase()];
    if(!scenarioId)throw new Error(`Row ${n+1}: scenario must be energy, credit or boom.`);
    const numeric=value.replace(/\u2212/g,'-').replace(/\s/g,'').replace(/%$/,'').replace(',','.');
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(numeric)||!validScore(numeric))throw new Error(`Row ${n+1}: enter the displayed score, such as 12.34 or -5.60; it cannot exceed 100.`);
    raw[scenarioId].push({tag:cleanTag(tag),score:displayScore(numeric)});
  }
  readLeaderboardDocument(raw);
  return raw;
}

export function rankEntries(entries){
  const sorted=entries.map((entry,index)=>({...entry,_index:index})).sort((a,b)=>b.score-a.score||a.tag.localeCompare(b.tag)||a._index-b._index);
  let previousScore=null,previousRank=0;
  return sorted.map((entry,index)=>{
    const rank=previousScore!==null&&Math.abs(entry.score-previousScore)<1e-10?previousRank:index+1;
    previousScore=entry.score;previousRank=rank;
    const {_index,...ranked}=entry;
    return {...ranked,rank};
  });
}
