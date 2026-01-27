function mergeAndApplyQuota({
  domainResults,
  commonResults,
  topKFinal = 6,
  commonRatio = 0.33,
  commonHardCap = 2,
}) {
  const maxCommon = Math.min(commonHardCap, Math.ceil(topKFinal * commonRatio));
  const maxDomain = topKFinal - maxCommon;

  const picked = [];
  let usedCommon = 0;
  let usedDomain = 0;

  // merge by score, but enforce quotas
  const merged = [...domainResults.map(r => ({...r, group: "domain"})),
                  ...commonResults.map(r => ({...r, group: "common"}))]
    .sort((a, b) => b.score - a.score);

  for (const r of merged) {
    if (picked.length >= topKFinal) break;

    if (r.group === "common") {
      if (usedCommon >= maxCommon) continue;
      usedCommon++;
      picked.push(r);
    } else {
      if (usedDomain >= maxDomain) continue;
      usedDomain++;
      picked.push(r);
    }
  }

  return {
    finalResults: picked,
    quota: { topKFinal, maxCommon, maxDomain, usedCommon, usedDomain },
  };
}

module.exports = { mergeAndApplyQuota };
