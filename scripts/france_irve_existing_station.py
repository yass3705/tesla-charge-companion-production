"""Check that an already-pinned national station contains approved EVSEs unchanged."""

from collections import Counter
import json


def _groups_for(row, approved):
    return Counter(
        (str(evse).upper(), group[0], group[1], group[2], float(group[3]),
         json.dumps(group[5], sort_keys=True, ensure_ascii=False))
        for group in row[8]
        for evse in group[6]
        if str(evse).upper() in approved
    )


def verify_existing_station(existing, candidate, approved, label):
    """Require exact station metadata and connector multiset for approved IDs.

    New national EVSEs remain in the existing row. Their eligibility is audited
    separately; this check never attaches an offer to them.
    """
    if existing[0] != candidate[0]:
        raise ValueError(f"{label} station identity differs: {existing[0]} / {candidate[0]}")
    for row, source_name in ((existing, "pinned"), (candidate, "national")):
        ids = {str(evse).upper() for group in row[8] for evse in group[6]}
        if row[6] != len(ids):
            raise ValueError(f"{label} station {row[0]} {source_name} EVSE count differs: "
                             f"declared={row[6]} unique={len(ids)}")
    for index in range(len(candidate)):
        if index not in (6, 8) and existing[index] != candidate[index]:
            raise ValueError(f"{label} station {existing[0]} field {index} differs: "
                             f"{existing[index]!r} / {candidate[index]!r}")
    expected = _groups_for(candidate, approved)
    actual = _groups_for(existing, approved)
    if actual != expected:
        missing = list((expected - actual).elements())
        extra = list((actual - expected).elements())
        raise ValueError(f"{label} station {existing[0]} approved EVSE connector mismatch: "
                         f"missing={missing[:12]} extra={extra[:12]}")
    present = {item[0] for item in actual}
    if present != approved:
        raise ValueError(f"{label} station {existing[0]} approved EVSE set mismatch: "
                         f"missing={sorted(approved - present)} extra={sorted(present - approved)}")
