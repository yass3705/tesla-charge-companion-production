#!/usr/bin/env python3
"""Scoped OCPI 2.2.1 rule-precedence patch for compiled V9 production pricing."""
from pathlib import Path
import sys

p=Path(sys.argv[1])
s=p.read_text(encoding="utf-8")
needle="    const minute=minuteOfDay(startAt,timeZone),candidates=[];"
prepend="""    // CPO PCPR: OCPI 2.2.1 selects the first matching element per dimension.
    if(pricing?.ocpiFirstMatch===true){
      const minute=minuteOfDay(startAt,timeZone);
      for(const rule of rules){
        if(minute==null&&rule.scope!=='allDay')continue;
        if(!ruleDayMatches(rule,startAt,timeZone,pricing))continue;
        if(minute!=null&&!ruleContains(rule,minute))continue;
        const state=ruleThresholdStatus(rule,session,timeZone);
        if(state==='unknown')return{rule:null,unknown:true,reason:'missing_rule_context'};
        if(state==='match')return{rule,unknown:false};
      }
      return{rule:null,unknown:false};
    }
"""
if s.count(needle)!=1:
    raise SystemExit("OCPI rule match insertion point missing or ambiguous")
s=s.replace(needle,prepend+needle,1)
needle2="      const evaluated=evaluateRule(rule,session);if(evaluated.complete===false)return{...evaluated,componentKind:group.kind||null};total+=evaluated.totalEur;components.componentGroups.push({kind:group.kind||null,matched:true,costEur:evaluated.totalEur,components:evaluated.components,rule});"
replacement="""      // Fail closed on time-window crossings which cannot be segmented safely.
      const boundary=pricing?.ocpiFirstMatch===true?minutesUntilRuleBoundary(rule,session.startAt,timeZone):Infinity;
      const crossing=Number.isFinite(boundary)&&Number(session.durationMinutes||0)>boundary+1e-9;
      const evaluated=crossing?evaluateSegmentedRules(localPricing,session,timeZone):evaluateRule(rule,session);
      if(evaluated.complete===false)return{...evaluated,componentKind:group.kind||null};
      total+=evaluated.totalEur;
      components.componentGroups.push({kind:group.kind||null,matched:true,segmented:crossing,costEur:evaluated.totalEur,components:evaluated.components,rule});"""
if s.count(needle2)!=1:
    raise SystemExit("OCPI dimension segmentation insertion point missing or ambiguous")
s=s.replace(needle2,replacement,1)
p.write_text(s,encoding="utf-8")
print("Scoped OCPI dimension precedence and window segmentation installed")
