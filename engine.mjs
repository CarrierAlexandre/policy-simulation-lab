import {DEFAULT_SCENARIO_ID,scenarioInfo} from './scenarios.mjs';

export const DEFAULT_SETTINGS = Object.freeze({horizon:12, commitmentMode:'full', shockCount:2, inflationWeight:1, gapWeight:0.25, rateWeight:1, inflationTarget:2, initialRate:3, elb:-0.5, potentialTrend:0.3, potentialDip:0.5});
export const policyPeriods = s => s.commitmentMode==='limited'?s.shockCount:s.horizon;
export const RATE_STEP = 0.25;
export const onRateGrid = value => Number.isFinite(value) && Math.abs(value / RATE_STEP - Math.round(value / RATE_STEP)) < 1e-9;
export function snapRate(value, elb = DEFAULT_SETTINGS.elb) {
  if (!Number.isFinite(value)) throw new Error('Enter a finite interest rate.');
  return Math.max(Math.ceil(elb / RATE_STEP), Math.round(value / RATE_STEP)) * RATE_STEP;
}
export function smoothRates(rates, startQuarter, terminalRate, elb = DEFAULT_SETTINGS.elb) {
  if (!Number.isInteger(startQuarter) || startQuarter < 1 || startQuarter > rates.length) throw new Error('Choose a starting quarter within the rate path.');
  if (!onRateGrid(terminalRate) || terminalRate < elb) throw new Error('Choose a terminal rate in steps of 0.25%, at or above −0.50%.');
  const start = startQuarter - 1, last = rates.length - 1;
  return rates.map((rate,t) => t < start ? rate : t === last ? terminalRate : snapRate(rates[start] + (terminalRate - rates[start]) * (t - start) / (last - start), elb));
}

export function reference(horizon,scenarioId=DEFAULT_SCENARIO_ID) {
  const scenario=scenarioInfo(scenarioId);
  return {inflation:Array.from({length:horizon},(_,t)=>scenario.inflation[t]??2), gap:Array.from({length:horizon},(_,t)=>scenario.gap[t]??0), rates:Array(horizon).fill(scenario.rate)};
}

export function activity(gap, s = DEFAULT_SETTINGS, scenarioId=DEFAULT_SCENARIO_ID) {
  // Percent log levels, consistent with a first-order model. Pre-Q1 gaps are zero;
  // potential output grows at the same trend during the four historical quarters.
  // Policy alters the gap only: potential is common to reference and player.
  const scenario=scenarioInfo(scenarioId);
  const potentialAt = t => s.potentialTrend * (t + 1) - (t < 0 ? 0 : s.potentialDip * (scenario.potentialShape[t] ?? 0));
  const outputAt = t => potentialAt(t) + (t < 0 ? 0 : gap[t]);
  return {
    potential:gap.map((_,t)=>potentialAt(t)),
    output:gap.map((_,t)=>outputAt(t)),
    growth:gap.map((_,t)=>outputAt(t)-outputAt(t-4)),
  };
}

export function scoreContributions(loss, baselineLoss) {
  return Object.fromEntries(['inflation','gap','smoothing'].map(k=>[k, baselineLoss.total > 1e-12 ? 100 * (baselineLoss[k] - loss[k]) / baselineLoss.total : null]));
}

export function validateSettings(s) {
  if (!Number.isInteger(s.horizon)||s.horizon<1||s.horizon>40) throw new Error('Choose a whole-number horizon between 1 and 40 quarters.');
  if(!['full','limited'].includes(s.commitmentMode))throw new Error('Choose full commitment or meeting-to-meeting mode.');
  if(!Number.isInteger(s.shockCount)||s.shockCount<1||s.shockCount>40||(s.commitmentMode==='limited'&&s.shockCount>s.horizon))throw new Error('Choose between 1 and H consecutive policy shocks, beginning at time 0.');
  for (const k of ['inflationWeight','gapWeight','rateWeight']) if (!Number.isFinite(s[k])||s[k]<0) throw new Error('Loss weights must be finite, non-negative numbers.');
  if (s.inflationWeight+s.gapWeight+s.rateWeight<=0) throw new Error('At least one loss weight must be positive.');
  for (const k of ['inflationTarget','initialRate','elb']) if (!Number.isFinite(s[k])) throw new Error('Targets and interest rates must be finite numbers.');
  if (!onRateGrid(s.initialRate) || s.initialRate < s.elb) throw new Error('The rate before Q1 must be a multiple of 0.25%, at or above the lower bound.');
  if (!Number.isFinite(s.potentialTrend) || !Number.isFinite(s.potentialDip) || s.potentialDip < 0) throw new Error('Enter a finite potential growth rate and a non-negative potential-output loss.');
}

export function solveLinear(matrix, rhs) {
  const n=rhs.length;
  const a=matrix.map((r,i)=>[...r,rhs[i]]);
  const scale=Math.max(...matrix.flat().map(Math.abs));
  if (!Number.isFinite(scale)||scale===0) throw new Error('The model cannot implement this path at the chosen horizon.');
  for(let k=0;k<n;k++) {
    let pivot=k;
    for(let i=k+1;i<n;i++) if(Math.abs(a[i][k])>Math.abs(a[pivot][k])) pivot=i;
    if(Math.abs(a[pivot][k])<scale*1e-12) throw new Error('The model cannot reliably implement this path at the chosen horizon.');
    [a[k],a[pivot]]=[a[pivot],a[k]];
    for(let i=k+1;i<n;i++) {
      const factor=a[i][k]/a[k][k]; a[i][k]=0;
      for(let j=k+1;j<=n;j++) a[i][j]-=factor*a[k][j];
    }
  }
  const x=Array(n).fill(0);
  for(let i=n-1;i>=0;i--) {let sum=a[i][n];for(let j=i+1;j<n;j++)sum-=a[i][j]*x[j];x[i]=sum/a[i][i];}
  if(!x.every(Number.isFinite)) throw new Error('This rate path is too large to evaluate. Please use smaller values.');
  return x;
}

export function components(inflation,gap,rates,s) {
  const c={inflation:0,gap:0,smoothing:0};
  for(let t=0;t<s.horizon;t++) {
    c.inflation+=s.inflationWeight*(inflation[t]-s.inflationTarget)**2;
    c.gap+=s.gapWeight*gap[t]**2;
    c.smoothing+=s.rateWeight*(rates[t]-(t===0?s.initialRate:rates[t-1]))**2;
  }
  c.total=c.inflation+c.gap+c.smoothing;
  if(!Number.isFinite(c.total)) throw new Error('These inputs are too large to evaluate. Please use smaller values.');
  return c;
}

export function implementRatePath(model,rates,s=DEFAULT_SETTINGS,scenarioId=DEFAULT_SCENARIO_ID) {
  validateSettings(s);
  const H=s.horizon,K=policyPeriods(s);
  if(rates.length!==K||!rates.every(Number.isFinite)) throw new Error('Enter a valid interest rate for every quarter you can choose.');
  if(rates.some(v=>v<s.elb-1e-10)) throw new Error(`Rates must be at least ${s.elb.toFixed(2)}%.`);
  if(!rates.every(onRateGrid)) throw new Error('Interest rates must be multiples of 0.25%.');
  const base=reference(H,scenarioId);
  // Only the first K rates are imposed with shocks at dates 0..K-1.
  // Full commitment has K=H and reproduces the original H-by-H solve.
  const R=model.R.slice(0,K).map(row=>row.slice(0,K));
  const shocks=solveLinear(R,rates.map((v,t)=>(v-base.rates[t])/4));
  const implemented=base.rates.map((v,t)=>t<K?rates[t]:v+4*shocks.reduce((sum,e,j)=>sum+model.R[t][j]*e,0));
  if(!implemented.every(Number.isFinite))throw new Error('This rate path is too large to evaluate. Please use smaller values.');
  return {rates:implemented,shocks};
}

export function simulate(model,rates,s=DEFAULT_SETTINGS,scenarioId=DEFAULT_SCENARIO_ID) {
  const {rates:implemented,shocks}=implementRatePath(model,rates,s,scenarioId);
  const H=s.horizon,base=reference(H,scenarioId);
  const violation=implemented.findIndex(v=>v<s.elb-1e-10);
  if(violation!==-1)throw new Error(`The model-implied rate in Q${violation+1} is below ${s.elb.toFixed(2)}%. Adjust your chosen rates before scoring this path.`);
  const response=M=>M.slice(0,H).map(row=>shocks.reduce((sum,e,j)=>sum+row[j]*e,0));
  const dpi=response(model.P), dx=response(model.X);
  const inflation=base.inflation.map((v,t)=>v+dpi[t]);
  const gap=base.gap.map((v,t)=>v+dx[t]);
  const loss=components(inflation,gap,implemented,s);
  const baselineLoss=components(base.inflation,base.gap,base.rates,s);
  const raw=baselineLoss.total>1e-12?100*(1-loss.total/baselineLoss.total):null;
  const score=raw===null?null:(Math.abs(raw)<1e-9?0:raw);
  return {rates:implemented,inflation,gap,loss,baselineLoss,score,shocks};
}
