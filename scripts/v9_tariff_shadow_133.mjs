// Offline integration contract. No runtime imports or UI wiring in Phase 5.
import crypto from 'node:crypto';
export const PIN='2026-10-15-v9-tesla-mac-ingress-verified';
const cohort=({pin,country,cpo,channel})=>[pin,country,cpo,channel].join('\u001f');
const hash=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex').slice(0,16);
export function createTariffShadow({enabledCohorts=[],emit=()=>{}}={}){
  const enabled=new Set(enabledCohorts.map(cohort));
  let stopped=false;
  const counters={evaluations:0,errors:0,status:0,amount:0,currency:0,components:0,provenance:0};
  return{
    // Synchronous rollback prevents every subsequent shadow evaluation.
    rollback(){stopped=true;enabled.clear();},
    enabled(input){return !stopped&&input.pin===PIN&&enabled.has(cohort(input));},
    metrics(){return {...counters};},
    observe(input,currentResult,evaluateCandidate){
      if(!this.enabled(input))return currentResult;
      try{
        const candidate=evaluateCandidate();
        const delta={status:currentResult?.status!==candidate?.status,
          amount:currentResult?.total!==candidate?.total,
          currency:currentResult?.currency!==candidate?.currency,
          components:JSON.stringify(currentResult?.components||{})!==JSON.stringify(candidate?.components||{}),
          provenance:currentResult?.sourceId!==candidate?.sourceId};
        counters.evaluations++;
        for(const field of Object.keys(delta))if(delta[field])counters[field]++;
        emit({event:'tariff_shadow',pin:input.pin,country:input.country,
          cpoHash:hash(input.cpo),channelHash:hash(input.channel),
          pointHash:hash(input.evseId),connectorHash:hash(input.connectorId),offerHash:hash(input.offerId),
          currentStatus:currentResult?.status||null,candidateStatus:candidate?.status||null,
          difference:delta});
      }catch(error){
        counters.errors++;
        emit({event:'tariff_shadow_error',pin:input.pin,country:input.country,
          cpoHash:hash(input.cpo),channelHash:hash(input.channel),
          reason:hash(error?.name||'error')});
      }
      // The current engine remains the only source of every caller response.
      return currentResult;
    }
  };
}
