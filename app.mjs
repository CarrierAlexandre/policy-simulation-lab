import {DEFAULT_SETTINGS,reference,validateSettings,components,simulate,activity,scoreContributions,onRateGrid,snapRate,smoothRates,policyPeriods,implementRatePath} from './engine.mjs';
import {MODELS,DEFAULT_MODEL_ID,modelInfo,loadModel} from './models.mjs';
import {setupTransmission} from './transmission-view.mjs';
import {SCENARIOS,DEFAULT_SCENARIO_ID,scenarioInfo} from './scenarios.mjs';
import {cleanTag,validTag,normalizeLeaderboards,readLeaderboardDocument,leaderboardView,displayScore} from './leaderboard.mjs';

const $=id=>document.getElementById(id);
let settings={...DEFAULT_SETTINGS};
let activeScenarioId=DEFAULT_SCENARIO_ID;
let rates=reference(settings.horizon,activeScenarioId).rates;
let model=null, result=null, dirty=false, drag=null;
let activityView='gap',activeModelId=DEFAULT_MODEL_ID,pendingModelId=DEFAULT_MODEL_ID;
let modelLoadVersion=0;
let gameMode='practice';
let evaluation={tag:'',scenarioId:null,submitted:false};
let currentAttempt=null,leaderboardScenarioId=activeScenarioId;
let publishedLeaderboards=normalizeLeaderboards({},SCENARIOS.map(s=>s.id));
let leaderboardMeta={eventId:'',submissionsOpen:false,updatedAt:null};
let leaderboardLoaded=false,leaderboardError=false,leaderboardRequest=null;
const transmissionView=setupTransmission(activeModelId);
const num=(v,d=2)=>Number(v).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
const rateText=v=>Math.abs(v*100-Math.round(v*100))<1e-9?v.toFixed(2):String(v);
const signed=(v,d=1)=>(v>0?'+':v<0?'−':'')+num(Math.abs(v),d);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('scenario-options').innerHTML=SCENARIOS.map(s=>`<button type="button" data-scenario="${esc(s.id)}" data-tone="${esc(s.tone)}" aria-pressed="${s.id===activeScenarioId}" aria-label="${esc(`${s.button}, ${s.type}`)}">${esc(s.button)}</button>`).join('');
$('scenario-options').addEventListener('click',event=>{
  const option=event.target.closest('[data-scenario]');
  if(gameMode==='evaluation'||!option||option.dataset.scenario===activeScenarioId)return;
  scenarioInfo(option.dataset.scenario);
  activeScenarioId=option.dataset.scenario;
  renderContext();reset();
});

function chart(container,base,player,{target=null,interactive=false,label='',editableCount=base.length}) {
  const W=Math.max(260,Math.round(container.getBoundingClientRect().width)||560),H=interactive?Math.min(245,Math.max(210,W*.47)):Math.min(220,Math.max(185,W*.4)),m={l:38,r:17,t:16,b:33};
  const values=[...base,...(player??[]),...(target===null?[]:[target])];
  const finite=values.filter(Number.isFinite);
  let lo=Math.min(...finite),hi=Math.max(...finite);
  const span=Math.max(hi-lo,interactive?1.5:1);
  lo-=span*.18;hi+=span*.18;
  if(hi-lo<span){const center=(hi+lo)/2;lo=center-span/2;hi=center+span/2;}
  const step=Math.pow(10,Math.floor(Math.log10((hi-lo)/4)));
  const raw=(hi-lo)/4/step;
  const tickStep=(raw<=1?1:raw<=2?2:raw<=2.5?2.5:raw<=5?5:10)*step;
  lo=Math.floor(lo/tickStep)*tickStep;hi=Math.ceil(hi/tickStep)*tickStep;
  const n=base.length,x=t=>n===1?(m.l+W-m.r)/2:m.l+t*(W-m.l-m.r)/(n-1),y=v=>m.t+(hi-v)/(hi-lo)*(H-m.t-m.b);
  const path=(a,offset=0)=>a.map((v,t)=>`${t?'L':'M'}${x(t+offset).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const ticks=[];for(let v=lo;v<=hi+tickStep*.01;v+=tickStep)ticks.push(v);
  const ygrid=ticks.map(v=>`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e6edf1"/><text x="${m.l-11}" y="${y(v)+4}" text-anchor="end" class="chart-tick">${esc(num(Math.abs(v)<1e-9?0:v,tickStep<1?1:0))}</text>`).join('');
  const every=n<=12?Math.max(1,Math.round((n-1)/5)):Math.ceil((n-1)/5);
  const xticks=Array.from({length:n},(_,t)=>t).filter(t=>t===0||t===n-1||t%every===0).filter((t,i,a)=>!(i===a.length-2&&a[i+1]-t<every*.6));
  const description=base.map((v,t)=>`Q${t+1}: reference ${num(v)} percent${player?`, ${interactive&&t>=editableCount?'model-implied rate':'your policy'} ${num(player[t])} percent`:''}`).join('; ');
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label+' '+description)}" ${interactive?'data-interactive="true"':''}><title>${esc(label)}</title>${ygrid}`;
  if(target!==null)svg+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(target)}" y2="${y(target)}" stroke="#b38a40" stroke-dasharray="3 4" stroke-width="1.2"/>`;
  svg+=`<path d="${path(base)}" fill="none" stroke="#91a0aa" stroke-width="2.3" stroke-dasharray="5 5" stroke-linecap="round"/>`;
  if(player){
    if(interactive&&editableCount<n){
      svg+=`<path d="${path(player.slice(editableCount-1),editableCount-1)}" fill="none" stroke="#5875b2" stroke-width="2.5" stroke-dasharray="3 4" stroke-linecap="round"/>`;
      svg+=player.slice(editableCount).map((v,j)=>`<circle cx="${x(j+editableCount)}" cy="${y(v)}" r="2.5" fill="#5875b2"><title>Q${j+editableCount+1}: model-implied ${num(v)}%</title></circle>`).join('');
    }
    svg+=`<path d="${path(interactive?player.slice(0,editableCount):player)}" fill="none" stroke="#007d73" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if(n===1)svg+=`<circle cx="${x(0)}" cy="${y(base[0])}" r="3" fill="#91a0aa"/>`;
  if(interactive&&player) svg+=player.slice(0,editableCount).map((v,t)=>`<circle class="drag-point" data-quarter="${t}" cx="${x(t)}" cy="${y(v)}" r="6" fill="#fff" stroke="#007d73" stroke-width="2.4" tabindex="0" role="button" aria-label="Quarter ${t+1}: ${num(v)} percent. Use up and down arrow keys to adjust."><title>Q${t+1}: ${num(v)}%</title></circle>`).join('');
  if(!interactive&&player)svg+=player.map((v,t)=>`<circle cx="${x(t)}" cy="${y(v)}" r="2.7" fill="#007d73"><title>Q${t+1}: ${num(v)}%</title></circle>`).join('');
  svg+=xticks.map(t=>`<text x="${x(t)}" y="${H-8}" text-anchor="middle" class="chart-tick">Q${t+1}</text>`).join('');
  container.innerHTML=svg+'</svg>';
  if(interactive)container._geometry={W,H,m,lo,hi};
}

function evaluatedAndSubmitted(){return gameMode==='evaluation'&&evaluation.submitted;}

function renderMode(){
  const evaluating=gameMode==='evaluation',submitted=evaluatedAndSubmitted();
  $('practice-mode').setAttribute('aria-pressed',String(!evaluating));
  $('evaluation-mode').setAttribute('aria-pressed',String(evaluating));
  $('scenario-options').querySelectorAll('button').forEach(button=>button.disabled=evaluating);
  $('model-options').querySelectorAll('button').forEach(button=>button.disabled=evaluating);
  $('open-settings').disabled=evaluating;
  $('open-transmission').disabled=evaluating;
  $('rate-inputs').querySelectorAll('input').forEach(input=>input.disabled=submitted);
  for(const id of ['shift-down','shift-up','open-smooth'])$(id).disabled=submitted;
  $('reset').disabled=submitted;
  $('reset').textContent=evaluating?'Reset path':'Reset';
  const simulateText=$('simulate').querySelector('span');
  simulateText.textContent=evaluating?(submitted?'Evaluation complete':'Calculate final score'):'Simulate policy';
  $('simulate').disabled=!model||submitted;
  const custom=activeModelId!==DEFAULT_MODEL_ID||Object.keys(DEFAULT_SETTINGS).some(k=>(k!=='shockCount'||settings.commitmentMode==='limited')&&settings[k]!==DEFAULT_SETTINGS[k]);
  $('round-mode').hidden=!(evaluating||custom);
  $('round-mode').textContent=evaluating?'Evaluation':'Custom practice';
  $('round-mode').classList.toggle('evaluation',evaluating);
  $('evaluation-meta').hidden=!evaluating;
  if(evaluating)$('evaluation-meta').textContent=`${evaluation.tag} · ${scenarioInfo(evaluation.scenarioId).title}${evaluation.eventId?` · ${evaluation.eventId}`:''}`;
}

function entryInstructions(attempt=null){
  if(attempt?.eventId&&attempt.eventId!==leaderboardMeta.eventId)return 'This result belongs to an earlier event. It is not ranked against the current event.';
  if(!leaderboardLoaded)return 'Event information is unavailable. Your result stays on this device.';
  if(leaderboardError)return 'The event status could not be refreshed. Keep your screenshot and check Refresh rankings before sending your entry.';
  if(!leaderboardMeta.eventId)return 'No competition is open. You can still evaluate your policy and explore the published rankings.';
  if(!leaderboardMeta.submissionsOpen)return 'Event submissions are closed. The published rankings remain available; no screenshot needs to be sent.';
  if(attempt&&!attempt.eventId)return 'This round started outside the event. Return to practice and start a new evaluated round to enter.';
  return 'To enter the event, send Alexandre Carrier a screenshot on Teams showing your gametag, scenario, event code and score. Rankings are updated periodically. Use the same gametag throughout the event; only your first entry per scenario counts.';
}

function renderIntroPlay(){
  const competitionOpen=leaderboardLoaded&&!leaderboardError&&leaderboardMeta.eventId&&leaderboardMeta.submissionsOpen;
  $('intro-play-heading').textContent=competitionOpen?'Practise or compete.':'Practice and evaluation.';
  let description='Use Practice to experiment, or Evaluation to see your final score. ';
  if(competitionOpen)description='Use Practice to experiment, or Evaluation for a competition attempt. Your score appears provisionally on this device until you reload. To join the published leaderboard, send Alexandre Carrier a Teams screenshot showing your scenario, improvement score and gametag. Only your first entry per scenario counts.';
  else if(leaderboardError)description+='Competition information could not be refreshed. Check the leaderboard for the latest event status.';
  else if(!leaderboardLoaded)description+='Checking competition availability…';
  else if(!leaderboardMeta.eventId)description+='No competition is currently open.';
  else description+='Competition submissions are closed; the published rankings remain available.';
  $('intro-play-description').textContent=description;
}

function renderLeaderboard(){
  renderIntroPlay();
  const active=scenarioInfo(leaderboardScenarioId);
  $('leaderboard-tabs').innerHTML=SCENARIOS.map(s=>`<button type="button" role="tab" data-leaderboard-scenario="${esc(s.id)}" aria-selected="${s.id===leaderboardScenarioId}" aria-controls="leaderboard-panel">${esc(s.button)}</button>`).join('');
  const {entries:ranked,status:comparisonStatus}=leaderboardView(publishedLeaderboards,leaderboardScenarioId,currentAttempt,leaderboardMeta.eventId);
  $('leaderboard-comparison').textContent=comparisonStatus==='provisional'?'Provisional comparison: your result alongside the published entries.':'Published rankings';
  $('leaderboard-rows').innerHTML=ranked.map(entry=>`<tr class="${entry.current?'current-row':''}"><td>${entry.rank}</td><th scope="row">${esc(entry.tag)}${entry.current?`<span>${entry.provisional?'provisional':'your published entry'}</span>`:''}</th><td>${esc(signed(entry.score,2))}%</td></tr>`).join('');
  $('leaderboard-empty').hidden=ranked.length>0;
  $('leaderboard-panel').setAttribute('aria-label',`${active.button} leaderboard`);
  $('current-attempt').hidden=!currentAttempt;
  if(currentAttempt){
    const ownScenario=scenarioInfo(currentAttempt.scenarioId);
    const ownScore=Number.isFinite(currentAttempt.score)?`${signed(currentAttempt.score,2)}%`:'Undefined';
    const {status}=leaderboardView(publishedLeaderboards,currentAttempt.scenarioId,currentAttempt,leaderboardMeta.eventId);
    const receiptStatus=status==='published'?'Entry included in the published leaderboard':status==='already-recorded'?'This gametag already has a published entry for this scenario':status==='different-event'?'Result from an earlier event':!Number.isFinite(currentAttempt.score)?'No competition score: percentage improvement is undefined':!currentAttempt.eventId?'Personal evaluated result':'Provisional result · not yet entered';
    $('current-attempt').innerHTML=`<div class="receipt-heading">Policy Simulation Lab · evaluated result</div><div class="receipt-details"><div><span>Gametag</span><strong>${esc(currentAttempt.tag)}</strong><span>Scenario</span><strong class="receipt-scenario">${esc(ownScenario.title)}</strong><small>${currentAttempt.eventId?'Event: '+esc(currentAttempt.eventId):'Outside an event'}</small></div><div class="receipt-score"><b>${esc(ownScore)}</b><span>Improvement over reference</span></div></div><div class="receipt-status">${esc(receiptStatus)}</div>`;
  }
  $('entry-instructions').hidden=!currentAttempt;
  $('entry-instructions').textContent=entryInstructions(currentAttempt);
  $('evaluation-entry-instructions').textContent=entryInstructions();
  $('leaderboard-event').textContent=leaderboardMeta.eventId?`${leaderboardMeta.eventId} · ${leaderboardMeta.submissionsOpen?'Submissions open':'Submissions closed'}`:'Published rankings';
  $('leaderboard-updated').textContent=leaderboardMeta.updatedAt?'Last published update: '+new Date(leaderboardMeta.updatedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):leaderboardLoaded?'No publication time supplied yet.':'Loading published rankings…';
  $('leaderboard-error').hidden=!leaderboardError;
  $('leaderboard-error').textContent=leaderboardLoaded?'Could not refresh. The last loaded rankings are shown; try Refresh rankings.':'Published rankings are unavailable. Your result is shown on this device; try Refresh rankings.';
  $('refresh-leaderboard').disabled=!!leaderboardRequest;
}

function openLeaderboard(scenarioId=activeScenarioId){
  leaderboardScenarioId=scenarioId;
  renderLeaderboard();
  $('leaderboard-dialog').showModal();
  void loadLeaderboards();
}

async function loadLeaderboards(){
  if(leaderboardRequest)return leaderboardRequest;
  leaderboardRequest=(async()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(`./data/leaderboard.json?v=${Date.now()}`,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('Leaderboard unavailable');
      const document=readLeaderboardDocument(await response.json());
      publishedLeaderboards=document.boards;leaderboardMeta=document.meta;
      leaderboardLoaded=true;leaderboardError=false;
    }catch{leaderboardError=true;}
    finally{clearTimeout(timeout);}
  })();
  renderLeaderboard();
  try{await leaderboardRequest;}
  finally{leaderboardRequest=null;renderLeaderboard();}
}

function renderRateChart(){
  const base=reference(settings.horizon,activeScenarioId),K=policyPeriods(settings),limited=K<settings.horizon;
  let displayed=[...rates,...base.rates.slice(K)];
  $('continuation-error').hidden=true;
  if(model&&limited){
    try{displayed=implementRatePath(model,rates,settings,activeScenarioId).rates;}
    catch(error){$('continuation-error').textContent=error.message;$('continuation-error').hidden=false;}
    const violation=displayed.findIndex(v=>v<settings.elb-1e-10);
    if(violation!==-1){$('continuation-error').textContent=`The implied rate in Q${violation+1} falls below ${num(settings.elb)}%. Adjust your chosen rates before scoring this path.`;$('continuation-error').hidden=false;}
  }
  $('continuation-key').hidden=!limited;$('continuation-details').hidden=!limited;
  $('implied-rates').innerHTML=limited?displayed.slice(K).map((v,j)=>`<div><dt>Q${j+K+1}</dt><dd>${esc(num(v))}%</dd></div>`).join(''):'';
  chart($('rate-chart'),base.rates,displayed,{interactive:!evaluatedAndSubmitted(),editableCount:K,label:'Annualised interest rates: chosen rates and any model-implied continuation, compared with the 3 percent reference path.'});
}
function renderInputs(){
  $('rate-inputs').innerHTML=rates.map((r,t)=>`<div class="quarter-field"><label for="quarter-${t}">Q${t+1}</label><input id="quarter-${t}" data-quarter="${t}" type="number" inputmode="decimal" step="0.25" min="${settings.elb}" value="${esc(rateText(r))}" ${evaluatedAndSubmitted()?'disabled':''} required aria-label="Quarter ${t+1} annualised interest rate in percent, in steps of 0.25"></div>`).join('');
}
function renderOutcomes(){
  const base=reference(settings.horizon,activeScenarioId),scenario=scenarioInfo(activeScenarioId);
  chart($('inflation-chart'),base.inflation,result?.inflation,{target:settings.inflationTarget,label:'Year-on-year inflation: reference outlook and simulated policy outcome.'});
  const growth=activityView==='growth';
  const baseActivity=activity(base.gap,settings,activeScenarioId),playerActivity=result?activity(result.gap,settings,activeScenarioId):null;
  const activityValues=growth?baseActivity.growth:base.gap;
  const highest=scenario.activityExtremum==='max',extreme=highest?Math.max(...activityValues):Math.min(...activityValues);
  $('fact-activity-label').textContent=`${highest?'Highest':'Lowest'} ${growth?'GDP growth':'output gap'}`;
  $('fact-gap').innerHTML=`${signed(extreme,1)}<span>%</span>`;
  $('view-growth').setAttribute('aria-pressed',String(growth));
  $('view-gap').setAttribute('aria-pressed',String(!growth));
  $('activity-unit').textContent=growth?'Year-on-year %':'% of potential output';
  $('activity-unit').title=growth?'Calculated as 100 × the four-quarter change in log GDP (the log-growth convention).':'';
  $('activity-help').textContent=growth?'Growth shows how fast the economy expands or contracts. Your score uses the output gap; switch views to see it.':'The output gap measures how far activity is above or below what the economy can sustainably produce in this exercise. It enters your score.';
  chart($('gap-chart'),growth?baseActivity.growth:base.gap,result?(growth?playerActivity.growth:result.gap):null,{target:growth?null:0,label:growth?'Approximate year-on-year GDP growth: reference outlook and simulated policy outcome.':'Output gap as a percentage of potential output: reference outlook and simulated policy outcome.'});
}
function renderStatus(){
  const el=$('results-status');el.className='result-status';
  if(gameMode==='evaluation'&&!result){el.textContent='Evaluation ready';}
  else if(gameMode==='evaluation'&&result){el.textContent='Evaluation complete';el.classList.add('ready');}
  else if(dirty&&result){el.textContent='Update simulation';el.classList.add('stale');}
  else if(result){el.textContent='Policy simulated';el.classList.add('ready');}
  else el.textContent='Reference outlook';
  $('player-legend').textContent=dirty&&result?'Last simulation':'Your policy';
  $('score-stale').hidden=gameMode==='evaluation'||!(dirty&&result);
}
function describeResult(){
  if(!result)return;
  if(result.score===null)return 'The reference loss is zero, so a percentage improvement cannot be defined. Compare the loss contributions below.';
  if(Math.abs(result.score)<.000001)return 'Your policy matches the reference loss. Try changing the timing or size of your rate moves.';
  const {loss:a,baselineLoss:b}=result;
  const delta={inflation:a.inflation-b.inflation,gap:a.gap-b.gap,smoothing:a.smoothing-b.smoothing};
  const labels={inflation:'inflation deviations',gap:'output-gap deviations',smoothing:'rate-change costs'};
  // Choose an interpretation only from measured loss contributions, never from an assumed shock narrative.
  const gains=Object.entries(delta).filter(([,v])=>v<-.00001).sort((a,b)=>a[1]-b[1]);
  const costs=Object.entries(delta).filter(([,v])=>v>.00001).sort((a,b)=>b[1]-a[1]);
  if(gains.length&&costs.length)return `Your policy reduced ${labels[gains[0][0]]}, but increased ${labels[costs[0][0]]}. ${result.score>0?'The gains outweigh the costs over this horizon.':'The costs outweigh the gains over this horizon.'}`;
  if(gains.length)return `Your policy reduced ${labels[gains[0][0]]} without increasing the other loss contributions over this horizon.`;
  return 'Your policy increased the total loss over this horizon. Compare the contributions to see where the costs arose.';
}
function renderScore(){
  const base=reference(settings.horizon,activeScenarioId);
  const baseline=result?.baselineLoss??components(base.inflation,base.gap,base.rates,settings);
  const names=[['inflation','Inflation'],['gap','Output gap'],['smoothing','Rate changes']];
  const contributions=result?scoreContributions(result.loss,baseline):null;
  $('loss-rows').innerHTML=names.map(([k,label])=>`<tr><th scope="row">${label}</th><td>${esc(num(baseline[k]))}</td><td>${result?esc(num(result.loss[k])):'—'}</td><td class="contribution ${contributions?.[k]<0?'cost':''}">${contributions?.[k]===null||!contributions?'—':esc(signed(contributions[k],2))}</td></tr>`).join('');
  $('baseline-total').textContent=num(baseline.total);$('player-total').textContent=result?num(result.loss.total):'—';
  $('score-contribution-total').textContent=result?.score==null?'—':signed(result.score,2);
  $('baseline-improvement').textContent=baseline.total>1e-12?'0.00%':'—';
  $('player-improvement').textContent=result?.score==null?'—':signed(result.score,2)+'%';
  $('score-number').hidden=!result;
  if(result){
    $('score-number').className='score-number'+(result.score===null||result.score===0?' neutral':result.score<0?' negative':'');
    $('score-number').innerHTML=result.score===null?'—':`${esc(signed(gameMode==='evaluation'?displayScore(result.score):result.score,gameMode==='evaluation'?2:1))}<small>%</small>`;
    $('score-title').textContent=result.score===null?'Compare the total loss':'Improvement over reference';
    $('score-summary').textContent=describeResult();
  }else{
    $('score-title').textContent='Can you improve the outlook?';
    $('score-summary').textContent=gameMode==='evaluation'?'Set your path carefully. Your score will appear when you submit this official attempt.':'Choose a rate path and simulate. Your score measures how much you reduce the total loss compared with the reference outlook.';
  }
  renderMode();
  renderStatus();
}
function renderContext(){
  const base=reference(settings.horizon,activeScenarioId),K=policyPeriods(settings),scenario=scenarioInfo(activeScenarioId);
  const info=modelInfo(activeModelId);
  $('model-options').innerHTML=MODELS.map(m=>`<button type="button" data-model="${esc(m.id)}" aria-pressed="${m.id===activeModelId}" title="Select through the controller settings">${esc(m.label)}</button>`).join('');
  $('method-model-paper').href=info.paper;
  $('method-model-description').textContent=`Model: ${info.description}`;
  $('intro-target').textContent=`${settings.inflationTarget}%`;
  $('method-inflation-target').textContent=`${settings.inflationTarget}%`;
  $('scenario-options').querySelectorAll('[data-scenario]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scenario===activeScenarioId)));
  $('scenario-type').textContent=scenario.type;
  $('scenario-title').innerHTML=`${esc(scenario.title)}<span class="accent-period">.</span>`;
  $('scenario-summary').textContent=scenario.summary;
  $('scenario-story').textContent=scenario.story;
  $('scenario-challenge').textContent=scenario.challenge;
  $('scenario-disclaimer').textContent=scenario.disclaimer;
  document.title=`Policy Simulation Lab · ${scenario.title}`;
  const inflationHigh=scenario.inflationExtremum==='max',inflationExtreme=inflationHigh?Math.max(...base.inflation):Math.min(...base.inflation);
  $('fact-inflation-label').textContent=`${inflationHigh?'Peak':'Lowest'} inflation`;
  $('fact-inflation').innerHTML=`${num(inflationExtreme,1)}<span>%</span>`;
  $('fact-rate').innerHTML=`${num(scenario.rate,1)}<span>%</span>`;
  $('horizon-label').textContent=`${settings.horizon} quarter${settings.horizon===1?'':'s'}`;
  $('objective-label').textContent=`Inflation target ${settings.inflationTarget}% · Output-gap target 0%`;
  $('elb-note').textContent=`Minimum rate ${signed(settings.elb,2)}%`;
  $('initial-note').textContent=`Rate before Q1 ${num(settings.initialRate)}%`;
  $('policy-horizon-note').textContent=K<settings.horizon?`You choose the first ${K} quarterly rate${K===1?'':'s'}. The model determines the rest of the path. All ${settings.horizon} quarters count towards your score.`:`You choose rates for all ${settings.horizon} quarters in the evaluation window.`;
  $('formula-text').textContent=`Loss = Σ [${settings.inflationWeight} × (inflation − ${settings.inflationTarget})² + ${settings.gapWeight} × output gap² + ${settings.rateWeight} × rate change²]. Rates are annualised; the equivalent weight on quarterly-rate changes is ${16*settings.rateWeight}. There is no discounting.`;
  $('horizon-explanation').textContent=`The current exercise evaluates H = ${settings.horizon} quarters and uses K = ${K} consecutive shocks from time 0. Only the first K rate levels are imposed. Outcomes and rate changes are evaluated over all H quarters; periods after H are not scored. No additional shocks or terminal-rate constraints are imposed after K.`;
  $('activity-assumptions').textContent=scenario.potentialShape.length?`For this fictional supply scenario, potential output grows by ${num(settings.potentialTrend)}% per quarter along its underlying trend. The energy disruption temporarily lowers its level by up to ${num(settings.potentialDip)}%, with the loss fading by Q9. These are editable teaching assumptions, separate from the COPPs monetary-policy responses.`:`For this fictional demand scenario, potential output grows by ${num(settings.potentialTrend)}% per quarter and otherwise remains on its underlying trend. The scenario changes actual activity through the output gap. This teaching assumption is separate from the COPPs monetary-policy responses.`;
  renderMode();
}
function clearError(){ $('input-error').hidden=true; }
function changed(){if(evaluatedAndSubmitted())return;dirty=true;clearError();renderRateChart();renderStatus();}
function reset(){if(evaluatedAndSubmitted())return;rates=reference(settings.horizon,activeScenarioId).rates.slice(0,policyPeriods(settings));result=null;dirty=false;clearError();renderInputs();renderRateChart();renderOutcomes();renderScore();}
function updateQuarter(t,value,syncInput=true){
  if(evaluatedAndSubmitted())return;
  rates[t]=snapRate(value,settings.elb);
  if(syncInput){const input=$(`quarter-${t}`);if(input)input.value=rateText(rates[t]);}
  changed();
}

$('rate-inputs').addEventListener('input',event=>{
  const input=event.target;if(!input.matches('input[data-quarter]'))return;
  const v=input.valueAsNumber;if(input.validity.valid&&onRateGrid(v))updateQuarter(Number(input.dataset.quarter),v,false);
  else {dirty=true;renderStatus();}
});
$('rate-inputs').addEventListener('change',event=>{const input=event.target;if(!input.matches('input[data-quarter]'))return;if(input.validity.valid&&onRateGrid(input.valueAsNumber))input.value=rateText(input.valueAsNumber);else{$('input-error').textContent='Use rates in steps of 0.25%, at or above −0.50%.';$('input-error').hidden=false;}});
$('rate-inputs').addEventListener('keydown',event=>{
  const input=event.target;if(!input.matches('input[data-quarter]'))return;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();const v=Number.isFinite(input.valueAsNumber)?input.valueAsNumber:3;updateQuarter(Number(input.dataset.quarter),Math.max(settings.elb,v+(event.key==='ArrowUp'?.25:-.25)));}
});
for(const [id,shift] of [['shift-down',-.25],['shift-up',.25]])$(id).addEventListener('click',()=>{rates=rates.map(v=>snapRate(v+shift,settings.elb));renderInputs();changed();});
$('open-smooth').addEventListener('click',()=>{
  const K=policyPeriods(settings);$('smooth-start').max=K;
  const current=$('smooth-start').valueAsNumber;
  $('smooth-start').value=Number.isInteger(current)&&current>=1&&current<=K?current:Math.min(5,K);
  $('smooth-horizon-note').textContent=`Last quarter you can choose: Q${K}. If you start there, only that quarter is set to the terminal rate.${K<settings.horizon?' The later continuation is determined by the model.':''}`;
  $('smooth-error').hidden=true;$('smooth-dialog').showModal();
});
$('close-smooth').addEventListener('click',()=>$('smooth-dialog').close());
$('smooth-reference').addEventListener('click',()=>{$('smooth-terminal').value=reference(settings.horizon,activeScenarioId).rates[policyPeriods(settings)-1];});
$('smooth-form').addEventListener('submit',event=>{
  event.preventDefault();
  try { rates=smoothRates(rates,$('smooth-start').valueAsNumber,$('smooth-terminal').valueAsNumber,settings.elb);renderInputs();changed();$('smooth-dialog').close(); }
  catch(error){$('smooth-error').textContent=error.message;$('smooth-error').hidden=false;}
});
for(const view of ['growth','gap'])$(`view-${view}`).addEventListener('click',()=>{activityView=view;renderOutcomes();});
$('reset').addEventListener('click',reset);
$('simulate').addEventListener('click',()=>{
  try{
    if(evaluatedAndSubmitted())return;
    const inputs=[...$('rate-inputs').querySelectorAll('input')];
    const invalid=inputs.find(i=>!i.validity.valid);if(invalid){invalid.reportValidity();invalid.focus();throw new Error('Enter a rate in steps of 0.25%, at or above −0.50%, for every quarter.');}
    const chosen=inputs.map(i=>i.valueAsNumber);
    result=simulate(model,chosen,settings,activeScenarioId);rates=chosen;dirty=false;clearError();renderRateChart();renderOutcomes();renderScore();
    if(gameMode==='evaluation'){
      evaluation.submitted=true;
      currentAttempt={tag:evaluation.tag,scenarioId:evaluation.scenarioId,eventId:evaluation.eventId,score:result.score===null?null:displayScore(result.score)};
      renderRateChart();renderInputs();renderMode();
      openLeaderboard(evaluation.scenarioId);
      return;
    }
    // On a phone, put the outcomes immediately below the selected path into view.
    if(window.matchMedia('(max-width: 800px)').matches)$('outcomes-title').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }catch(error){$('input-error').textContent=error.message;$('input-error').hidden=false;}
});

$('rate-chart').addEventListener('pointerdown',event=>{
  if(evaluatedAndSubmitted())return;
  const point=event.target.closest('[data-quarter]');if(!point)return;
  event.preventDefault();const svg=point.closest('svg');const rect=svg.getBoundingClientRect();
  // The SVG is sized to the same aspect ratio as its viewBox.
  drag={t:Number(point.dataset.quarter),rect,geo:{...$('rate-chart')._geometry},id:event.pointerId};
});
window.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;event.preventDefault();
  const {geo:g,rect}=drag;const y=(event.clientY-rect.top)*g.H/rect.height;
  const rate=g.hi-(y-g.m.t)/(g.H-g.m.t-g.m.b)*(g.hi-g.lo);
  updateQuarter(drag.t,rate);
},{passive:false});
window.addEventListener('pointerup',()=>{drag=null;});window.addEventListener('pointercancel',()=>{drag=null;});
$('rate-chart').addEventListener('keydown',event=>{
  if(evaluatedAndSubmitted())return;
  const point=event.target.closest('[data-quarter]');if(!point)return;
  const t=Number(point.dataset.quarter);
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();updateQuarter(t,Math.max(settings.elb,rates[t]+(event.key==='ArrowUp'?.25:-.25)));$('rate-chart').querySelector(`[data-quarter="${t}"]`).focus();}
  else if(event.key==='Enter'||event.key===' '){event.preventDefault();$(`quarter-${t}`).focus();}
});

function refreshCommitmentControls(){
  const limited=$('settings-commitment').value==='limited',H=$('settings-horizon').valueAsNumber;
  const count=$('settings-shock-count');
  $('shock-count-field').hidden=!limited;count.disabled=!limited;
  count.max=Number.isInteger(H)&&H>=1?H:40;
  if(Number.isInteger(H)&&H>=1&&count.valueAsNumber>H)count.value=H;
  if(!limited&&(!Number.isInteger(count.valueAsNumber)||count.valueAsNumber<1))count.value=Math.min(DEFAULT_SETTINGS.shockCount,Number(count.max));
  const K=limited?count.valueAsNumber:H;
  $('commitment-settings-help').textContent=limited?`The player sets the first ${Number.isFinite(K)?K:'K'} rates, using consecutive shocks from time 0. The model supplies later rates; all ${Number.isFinite(H)?H:'H'} quarters remain in the counterfactual and loss. This is a short commitment window in one scenario, without repeated re-optimisation.`:`One shock and one chosen rate for each of the ${Number.isFinite(H)?H:'H'} evaluation quarters (K = H).`;
}
for(const id of ['settings-commitment','settings-horizon','settings-shock-count'])$(id).addEventListener('input',refreshCommitmentControls);
function populateSettings(s,id=activeModelId){for(const key of Object.keys(DEFAULT_SETTINGS)){const input=$('settings-form').elements.namedItem(key);if(input)input.value=s[key];}$('settings-model').value=id;$('settings-error').hidden=true;refreshCommitmentControls();}
function openController(id=activeModelId){if(gameMode==='evaluation')return;pendingModelId=id;$('controller-dialog').showModal();}
$('settings-model').innerHTML=MODELS.map(m=>`<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('');
$('open-settings').addEventListener('click',()=>openController());
$('model-options').addEventListener('click',event=>{const option=event.target.closest('[data-model]');if(option)openController(option.dataset.model);});
$('open-transmission').addEventListener('click',()=>transmissionView.open(activeModelId));
$('controller-back').addEventListener('click',()=>$('controller-dialog').close());
$('controller-continue').addEventListener('click',()=>{$('controller-dialog').close();populateSettings(settings,pendingModelId);$('settings-dialog').showModal();});
$('close-settings').addEventListener('click',()=>$('settings-dialog').close());
$('default-settings').addEventListener('click',()=>populateSettings(DEFAULT_SETTINGS,DEFAULT_MODEL_ID));
$('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.currentTarget.querySelector('button[type="submit"]');
  if(button.disabled)return;
  try{
    const next={...DEFAULT_SETTINGS};for(const key of Object.keys(next)){const input=event.currentTarget.elements.namedItem(key);if(input)next[key]=typeof DEFAULT_SETTINGS[key]==='string'?input.value:input.valueAsNumber;}
    validateSettings(next);const nextModelId=$('settings-model').value;modelInfo(nextModelId);button.disabled=true;
    const loadVersion=++modelLoadVersion;
    const nextModel=await loadModel(nextModelId);
    if(loadVersion!==modelLoadVersion)return;
    settings=next;model=nextModel;activeModelId=nextModelId;renderContext();reset();renderMode();$('load-error').hidden=true;$('settings-dialog').close();
  }catch(error){$('settings-error').textContent=error.message;$('settings-error').hidden=false;}
  finally{button.disabled=false;}
});

let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!drag){renderRateChart();renderOutcomes();transmissionView.redraw();}},120);});

function switchToPractice(){
  gameMode='practice';
  evaluation={tag:'',scenarioId:null,submitted:false};
  renderContext();reset();
}

$('practice-mode').addEventListener('click',()=>{if(gameMode==='evaluation')switchToPractice();});
$('evaluation-mode').addEventListener('click',()=>{
  if(gameMode==='evaluation')return;
  $('evaluation-scenario').textContent=scenarioInfo(activeScenarioId).title;
  $('gametag').value='';$('evaluation-error').hidden=true;
  $('evaluation-entry-instructions').textContent=entryInstructions();
  void loadLeaderboards();
  $('evaluation-dialog').showModal();
  $('gametag').focus();
});
$('close-evaluation').addEventListener('click',()=>$('evaluation-dialog').close());
$('cancel-evaluation').addEventListener('click',()=>$('evaluation-dialog').close());
$('evaluation-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const tag=cleanTag($('gametag').value),button=event.currentTarget.querySelector('button[type="submit"]');
  if(!validTag(tag)){
    $('evaluation-error').textContent='Use 2–20 characters: letters, numbers, spaces, full stops, hyphens or underscores. Do not enter an email address.';
    $('evaluation-error').hidden=false;$('gametag').focus();return;
  }
  button.disabled=true;$('evaluation-error').hidden=true;
  try{
    await loadLeaderboards();
    const loadVersion=++modelLoadVersion;
    const officialModel=activeModelId===DEFAULT_MODEL_ID&&model?model:await loadModel(DEFAULT_MODEL_ID);
    if(loadVersion!==modelLoadVersion)return;
    settings={...DEFAULT_SETTINGS};model=officialModel;activeModelId=DEFAULT_MODEL_ID;
    gameMode='evaluation';evaluation={tag,scenarioId:activeScenarioId,eventId:leaderboardLoaded&&leaderboardMeta.submissionsOpen?leaderboardMeta.eventId:'',submitted:false};
    $('evaluation-dialog').close();renderContext();reset();
  }catch{
    $('evaluation-error').textContent='The official model could not be loaded. Check your connection and try again.';
    $('evaluation-error').hidden=false;
  }finally{button.disabled=false;}
});

for(const id of ['open-leaderboard','open-leaderboard-top'])$(id).addEventListener('click',()=>openLeaderboard(activeScenarioId));
$('refresh-leaderboard').addEventListener('click',()=>void loadLeaderboards());
setInterval(()=>{if(document.visibilityState==='visible')void loadLeaderboards();},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void loadLeaderboards();});
$('close-leaderboard').addEventListener('click',()=>$('leaderboard-dialog').close());
$('leaderboard-close-action').addEventListener('click',()=>$('leaderboard-dialog').close());
$('leaderboard-tabs').addEventListener('click',event=>{
  const tab=event.target.closest('[data-leaderboard-scenario]');if(!tab)return;
  leaderboardScenarioId=tab.dataset.leaderboardScenario;renderLeaderboard();
});

function closeIntro(){ $('intro-dialog').close();$('policy-title').focus(); }
$('open-intro').addEventListener('click',()=>$('intro-dialog').showModal());
$('close-intro').addEventListener('click',closeIntro);
$('start-game').addEventListener('click',closeIntro);
renderContext();renderInputs();renderRateChart();renderOutcomes();renderScore();
loadLeaderboards();
$('intro-dialog').showModal();
const initialLoadVersion=++modelLoadVersion;
try{
  const initialModel=await loadModel(activeModelId);
  if(initialLoadVersion===modelLoadVersion){model=initialModel;renderMode();}
}catch(error){if(initialLoadVersion===modelLoadVersion){$('load-error').textContent='The model could not load. Check your connection and reload this page.';$('load-error').hidden=false;}}
