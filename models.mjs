// Add model entries here, with compatible response matrices in data/.
// R: quarterly rates; P: year-on-year inflation; X: output gap; D: rate changes.
export const MODELS = Object.freeze([
  Object.freeze({
    id:'sw2007', label:'Smets–Wouters (AER 2007)', shortLabel:'Smets–Wouters',
    paper:'https://www.aeaweb.org/articles?id=10.1257/aer.97.3.586',
    data:'./data/model.json', color:'#007d73',
    description:'Smets–Wouters (2007), using the supplied COPPs Figure 9a response matrices.',
  }),
]);
export const DEFAULT_MODEL_ID = MODELS[0].id;
export const modelInfo = id => {
  const entry=MODELS.find(m=>m.id===id);
  if(!entry)throw new Error('Select an available model.');
  return entry;
};
const cache=new Map();
export async function loadModel(id) {
  if(cache.has(id))return cache.get(id);
  const entry=modelInfo(id);
  const loading=(async()=>{
    const response=await fetch(new URL(entry.data,import.meta.url));
    if(!response.ok)throw new Error(`Could not load ${entry.label}. Check your connection and try again.`);
    const data=await response.json();
    for(const key of ['R','P','X','D'])if(!Array.isArray(data[key])||data[key].length!==40||data[key].some(row=>!Array.isArray(row)||row.length!==40||row.some(v=>!Number.isFinite(v))))throw new Error(`The response matrices for ${entry.label} are incomplete.`);
    return data;
  })();
  cache.set(id,loading);
  try{return await loading;}catch(error){cache.delete(id);throw error;}
}
