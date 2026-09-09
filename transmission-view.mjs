import {MODELS,loadModel} from './models.mjs';
import {impulseResponse,transmissionTradeoff,transmissionChart,LINE_DASHES} from './transmission.mjs';

export function setupTransmission(initialModelId) {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>Number(v).toLocaleString('en-GB',{maximumFractionDigits:3});
  function interpretation(t) {
    if(t.ratio===null)return 'The average inflation response is too close to zero to give a meaningful comparison.';
    const inflationDirection=t.inflation<0?'lower':'higher';
    if(Math.abs(t.ratio)<1e-9)return `A 1 percentage-point ${inflationDirection} average inflation rate is associated with approximately no change in the average output gap.`;
    const activityDirection=t.output<0?'lower':'higher';
    return `A 1 percentage-point ${inflationDirection} average inflation rate is associated with a ${fmt(Math.abs(t.ratio))} percentage-point ${activityDirection} average output gap.`;
  }
  let activeId=initialModelId,version=0,series=[];
  $('transmission-models').innerHTML=MODELS.map(m=>`<label><input type="checkbox" value="${esc(m.id)}" ${m.id===initialModelId?'checked':''}>${esc(m.label)}</label>`).join('');
  function redraw(){
    for(const [key,name] of [['rates','Annualised interest rate'],['inflation','Year-on-year inflation'],['gap','Output gap']])transmissionChart($(`transmission-${key}`),series,key,`${name}: responses to separate monetary policy shocks, by quarters since announcement.`);
  }
  async function render(){
    const current=++version;
    const ids=[...$('transmission-models').querySelectorAll('input:checked')].map(i=>i.value);
    const dates=[0,4];
    const H=Number($('transmission-horizon').value);
    series=[];redraw();$('transmission-legend').innerHTML='';$('transmission-tradeoffs').innerHTML='';
    $('transmission-error').hidden=true;
    $('transmission-note').textContent='';
    if(!ids.length||!dates.length){$('transmission-status').textContent='Select at least one model and one shock date.';return;}
    $('transmission-status').textContent='Loading responses…';
    const loaded=await Promise.allSettled(ids.map(id=>loadModel(id)));
    if(current!==version)return;
    const failed=[];
    loaded.forEach((r,i)=>{
      const info=MODELS.find(m=>m.id===ids[i]);
      if(r.status==='rejected'){failed.push(`${info.label}: ${r.reason.message}`);return;}
      for(const j of dates){
        try {
          series.push({label:`${info.shortLabel} · ${j===0?'policy shock today':'policy shock four quarters ahead'}`,color:info.color,dash:LINE_DASHES[dates.indexOf(j)%LINE_DASHES.length],response:impulseResponse(r.value,j,H),tradeoff:transmissionTradeoff(r.value,j)});
        } catch(error) { failed.push(`${info.label} · shock at t=${j}: ${error.message}`); }
      }
    });
    if(failed.length){$('transmission-error').textContent=failed.join(' ');$('transmission-error').hidden=false;}
    $('transmission-status').textContent=series.length?`${series.length} response${series.length===1?'':'s'} · periods 0–${H-1}`:'No responses available.';
    $('transmission-note').textContent=dates.some(j=>j>=H)?'Some shocks occur beyond the displayed horizon. Their effects before the shock can still appear because the policy change is announced at time 0. Extend the chart horizon to see later outcomes.':'';
    $('transmission-legend').innerHTML=series.map(s=>`<span><svg aria-hidden="true" width="30" height="12"><line x1="0" x2="30" y1="6" y2="6" stroke="${esc(s.color)}" stroke-width="2.5" stroke-dasharray="${esc(s.dash)}"/></svg>${esc(s.label)}</span>`).join('');
    $('transmission-tradeoffs').innerHTML=series.map(s=>`<div><dt>${esc(s.label)}</dt><dd><strong>${s.tradeoff.ratio===null?'Undefined':esc(fmt(s.tradeoff.ratio))}</strong><p>${esc(interpretation(s.tradeoff))}</p></dd></div>`).join('');
    redraw();
  }
  for(const id of ['transmission-models','transmission-horizon'])$(id).addEventListener('change',render);
  $('close-transmission').addEventListener('click',()=>$('transmission-dialog').close());
  return {
    open(id=activeId){
      if(id!==activeId){activeId=id;$('transmission-models').querySelectorAll('input').forEach(i=>{i.checked=i.value===id;});}
      $('transmission-dialog').showModal();render();
    },
    redraw(){if($('transmission-dialog').open)redraw();},
  };
}
