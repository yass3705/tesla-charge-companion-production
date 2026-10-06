#!/usr/bin/env python3
import json
import pathlib
import sys

def rule_from_element(element):
    components=element.get("priceComponents") or []
    if len(components)!=1 or components[0].get("type")!="ENERGY":
        return None
    restrictions=element.get("restrictions") or {}
    start=restrictions.get("startTime") or "00:00"
    end=restrictions.get("endTime") or "24:00"
    return {
        "scope":"allDay" if start=="00:00" and end=="24:00" else "timeWindow",
        "start":start,
        "end":end,
        "billing":"kwh",
        "currency":"EUR",
        "pricePerKwh":float(components[0].get("price") or 0),
        "chargePerMinute":0,
        "connectionFee":0,
        "idlePerMinute":0,
        "afterMinutesRate":0,
        "afterMinutesThreshold":0,
        "days":restrictions.get("dayOfWeek") or None,
        "ocpiDurationBands":[]
    }

def main():
    source=pathlib.Path(sys.argv[1])
    output=pathlib.Path(sys.argv[2])
    payload=json.loads(source.read_text(encoding="utf-8"))
    pan_by_public={}
    for row in payload.get("panMatches") or []:
        public_id=str(row.get("publicId") or "").strip()
        pan_id=str(row.get("panStationId") or "").strip()
        if public_id and pan_id:
            pan_by_public.setdefault(public_id,[]).append(pan_id)
    offers=[]
    skipped=0
    for entry in payload.get("stations") or []:
        station=entry.get("station") or {}
        public_id=str(station.get("id") or "").strip()
        pan_ids=pan_by_public.get(public_id,[])
        if not pan_ids or entry.get("status")!=200:
            continue
        for tariff in (entry.get("location") or {}).get("chargeTariffs") or []:
            elements=tariff.get("elements") or []
            rules=[rule_from_element(e) for e in elements]
            energy_rules=[r for r in rules if r]
            unsupported_types=sorted({str(component.get("type") or "").upper() for element in elements for component in (element.get("priceComponents") or []) if str(component.get("type") or "").upper()!="ENERGY"})
            if not energy_rules:
                skipped+=1
                continue
            for pan_id in pan_ids:
                offers.append({
                    "id":f"electra-direct-exact:{pan_id}:{tariff.get('chargeTariffId') or 'tariff'}",
                    "provider":"Electra",
                    "kind":"direct",
                    "offerKind":"direct",
                    "subscriptionId":None,
                    "countries":["FR"],
                    "currency":str(tariff.get("currency") or "EUR").upper(),
                    "stationIds":[pan_id,f"national:FR:{pan_id}",f"irve-station:{pan_id}"],
                    "pricing":{"type":"rules","rules":energy_rules},
                    "priority":135,
                    "metadata":{
                        "verified":True,
                        "identityMode":"exact_national_irve_station",
                        "source":"Electra exact France snapshot",
                        "publicLocationId":public_id,
                        "panStationId":pan_id,
                        "stationName":station.get("name"),
                        "incompletePricingReason":("unsupported_components:" + ",".join(unsupported_types)) if unsupported_types else None,
                        "excludedComponents":unsupported_types
                    }
                })
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({
        "schemaVersion":1,
        "dataset":"electra-exact-france-direct-offers",
        "generatedAt":payload.get("generatedAt"),
        "country":"FR",
        "offers":offers,\n        "directOffers":offers,
        "stats":{"offers":len(offers),"skippedUnsupportedTariffs":skipped,"offersWithUnsupportedComponents":sum(1 for offer in offers if offer.get("metadata",{}).get("incompletePricingReason"))}
    },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"offers":len(offers),"skippedUnsupportedTariffs":skipped}))

if __name__=="__main__":
    main()
