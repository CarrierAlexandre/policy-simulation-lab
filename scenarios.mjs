const freezeScenario=spec=>Object.freeze({
  ...spec,
  inflation:Object.freeze(spec.inflation),
  gap:Object.freeze(spec.gap),
  potentialShape:Object.freeze(spec.potentialShape),
});

const DISCLAIMER='This fictional scenario and its policy effects are illustrative. They do not reproduce a historical episode, an ECB forecast or an actual policy decision.';

export const DEFAULT_SCENARIO_ID='energy';
export const SCENARIOS=Object.freeze([
  freezeScenario({
    id:'energy',button:'Energy disruption',title:'Energy supply disruption',type:'Supply shock',tone:'supply',
    summary:'A disruption to energy supplies drives up prices. Businesses face higher production costs, and households can afford less. Inflation rises while economic activity weakens.',
    story:'An unexpected disruption to energy supply pushes up energy prices across Europe. Households face higher bills, while firms pay more to produce and transport goods. As some of these costs feed through to consumer prices, inflation rises. At the same time, households can afford less and firms scale back production, weakening economic activity. The disruption gradually fades, but its effects take time to unwind.',
    challenge:'The reference outlook holds the annualised policy rate at 3%. Choose your own path and navigate the trade-off: bring inflation towards its target, limit weakness in activity and avoid abrupt changes in interest rates.',
    disclaimer:DISCLAIMER,
    inflation:[4,4.8,5.2,4.8,4.2,3.6,3.1,2.7,2.4,2.2,2.1,2],
    gap:[-0.6,-1,-1.3,-1.4,-1.3,-1.1,-0.9,-0.7,-0.5,-0.3,-0.15,0],
    rate:3,inflationExtremum:'max',activityExtremum:'min',potentialShape:[0.4,0.8,1,1,0.8,0.6,0.4,0.2],
  }),
  freezeScenario({
    id:'credit',button:'Credit squeeze',title:'Credit squeeze',type:'Negative demand shock',tone:'negative-demand',
    summary:'A tightening of credit conditions leads households and firms to cut spending. Economic activity weakens and inflation falls below target.',
    story:'A sudden loss of confidence makes lenders more cautious. Loans become harder and more expensive to obtain, even though the policy rate in the reference outlook remains unchanged. Households postpone major purchases and firms cut investment. Spending falls below what the economy can sustainably produce, weakening activity and gradually pulling inflation below its target. Credit conditions slowly return to normal.',
    challenge:'The reference outlook holds the annualised policy rate at 3%. Choose your own path and explore the balance between bringing inflation towards its target, supporting economic activity and avoiding abrupt rate changes.',
    disclaimer:DISCLAIMER,
    inflation:[1.9,1.6,1.2,0.8,0.6,0.5,0.7,1,1.3,1.6,1.8,2],
    gap:[-0.8,-1.5,-2.2,-2.8,-3,-2.8,-2.4,-1.9,-1.3,-0.8,-0.4,-0.1],
    rate:3,inflationExtremum:'min',activityExtremum:'min',potentialShape:[],
  }),
  freezeScenario({
    id:'boom',button:'Spending boom',title:'Spending boom',type:'Positive demand shock',tone:'positive-demand',
    summary:'A broad-based increase in household and business spending pushes activity above its sustainable level. Inflation rises as demand outpaces supply.',
    story:'Households and firms become more confident about the future and increase their spending. Consumption and investment rise faster than the economy’s sustainable capacity can keep up. Firms expand production, but growing pressure on available resources pushes inflation above its target. The boom gradually loses momentum.',
    challenge:'The reference outlook holds the annualised policy rate at 3%. Choose your own path and explore the balance between bringing inflation towards its target, limiting overheating in economic activity and avoiding abrupt rate changes.',
    disclaimer:DISCLAIMER,
    inflation:[2.1,2.4,2.8,3.2,3.4,3.5,3.3,3,2.7,2.4,2.2,2],
    gap:[0.8,1.5,2.2,2.8,3,2.8,2.4,1.9,1.3,0.8,0.4,0.1],
    rate:3,inflationExtremum:'max',activityExtremum:'max',potentialShape:[],
  }),
]);

export function scenarioInfo(id=DEFAULT_SCENARIO_ID){
  const scenario=SCENARIOS.find(item=>item.id===id);
  if(!scenario)throw new Error('Select an available economic scenario.');
  return scenario;
}
