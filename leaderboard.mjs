const TAG_PATTERN=/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,19}$/;

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
    return [id,entries.filter(entry=>entry&&validTag(entry.tag)&&Number.isFinite(Number(entry.score))).map(entry=>({tag:cleanTag(entry.tag),score:Number(entry.score)}))];
  }));
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
