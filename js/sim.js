// 積立シミュレーション計算(月次複利)
const Sim = (() => {
  // yearsFromNow年後の資産額を返す(小数年もOK)
  function futureValue(currentAssets, monthlyContribution, annualRatePercent, yearsFromNow) {
    const months = Math.round(yearsFromNow * 12);
    const r = (annualRatePercent || 0) / 100 / 12;
    let fv = currentAssets;
    if (r === 0) {
      fv = currentAssets + monthlyContribution * months;
    } else {
      fv = currentAssets * Math.pow(1 + r, months) +
        monthlyContribution * ((Math.pow(1 + r, months) - 1) / r);
    }
    return fv;
  }

  // 0年目からmaxYears年目まで、年単位でシリーズを作る
  function projectionSeries(currentAssets, monthlyContribution, annualRatePercent, maxYears) {
    const points = [];
    for (let y = 0; y <= maxYears; y++) {
      points.push({ year: y, value: futureValue(currentAssets, monthlyContribution, annualRatePercent, y) });
    }
    return points;
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  return { futureValue, projectionSeries, currentYear };
})();
