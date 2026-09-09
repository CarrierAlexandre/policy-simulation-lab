export function impulseResponse(model, shockDate=0, horizon=12) {
  if(!Number.isInteger(shockDate)||shockDate<0||shockDate>=model.R[0].length)throw new Error('Select an available shock date.');
  if(!Number.isInteger(horizon)||horizon<1||horizon>model.R.length)throw new Error('Select an available chart horizon.');
  // Normalize each shock over its full available response, never the display window.
  const peak=Math.max(...model.R.map(row=>4*row[shockDate]));
  if(!Number.isFinite(peak)||peak<=1e-12)throw new Error('Cannot scale this shock: no positive interest-rate peak is available.');
  const column=key=>model[key].slice(0,horizon).map(row=>row[shockDate]/peak);
  return {rates:column('R').map(v=>4*v),inflation:column('P'),gap:column('X')};
}

export function transmissionTradeoff(model,shockDate=0) {
  if(model.R.length<12)throw new Error('Twelve response periods are required to calculate this trade-off.');
  const r=impulseResponse(model,shockDate,12);
  const sum=values=>values.reduce((a,b)=>a+b,0);
  const output=sum(r.gap),inflation=sum(r.inflation);
  const threshold=1e-10*Math.max(1,sum(r.inflation.map(Math.abs)));
  return {output,inflation,ratio:Math.abs(inflation)>threshold?output/inflation:null};
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const LINE_DASHES=['','7 4','2 3','9 3 2 3','12 4','5 2 1 2'];

export function transmissionChart(container,series,key,label) {
  if(!series.length){container.innerHTML='';return;}
  const W=Math.max(260,Math.round(container.getBoundingClientRect().width)||360),H=220,m={l:43,r:15,t:16,b:32};
  const values=[0,...series.flatMap(s=>s.response[key])],n=series[0].response[key].length;
  let lo=Math.min(...values),hi=Math.max(...values);
  const span=Math.max(hi-lo,.05);lo-=.12*span;hi+=.12*span;
  const step=10**Math.floor(Math.log10((hi-lo)/4));
  const raw=(hi-lo)/4/step,tickStep=(raw<=1?1:raw<=2?2:raw<=2.5?2.5:raw<=5?5:10)*step;
  lo=Math.floor(lo/tickStep)*tickStep;hi=Math.ceil(hi/tickStep)*tickStep;
  const x=t=>m.l+t*(W-m.l-m.r)/Math.max(1,n-1),y=v=>m.t+(hi-v)/(hi-lo)*(H-m.t-m.b);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>`;
  for(let v=lo;v<=hi+tickStep*.01;v+=tickStep){
    const text=Math.abs(v)<tickStep*.001?'0':Number(v.toPrecision(3)).toString();
    svg+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${text==='0'?'#adbcc6':'#e6edf1'}"/><text x="${m.l-8}" y="${y(v)+4}" text-anchor="end" class="chart-tick">${esc(text)}</text>`;
  }
  const every=Math.max(1,Math.ceil((n-1)/4));
  for(let t=0;t<n;t++)if(t===0||t===n-1||(t%every===0&&n-1-t>every*.5))svg+=`<text x="${x(t)}" y="${H-8}" text-anchor="middle" class="chart-tick">${t}</text>`;
  for(const s of series){
    const path=s.response[key].map((v,t)=>`${t?'L':'M'}${x(t).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    svg+=`<path d="${path}" fill="none" stroke="${esc(s.color)}" stroke-width="2.5" stroke-dasharray="${esc(s.dash)}"><title>${esc(s.label)}</title></path>`;
  }
  container.innerHTML=svg+'</svg>';
}
