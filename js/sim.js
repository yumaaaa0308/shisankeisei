// 積立シミュレーション計算(カテゴリごとに複利計算)
const Sim = (() => {
  // 元本+毎月積立+年1回ボーナス積立が、年利annualRatePercentでyearsFromNow年後にいくらになるか
  function futureValue(principal, monthlyContribution, annualBonus, annualRatePercent, yearsFromNow) {
    const rMonthly = (annualRatePercent || 0) / 100 / 12;
    const rAnnual = (annualRatePercent || 0) / 100;
    const months = Math.round(yearsFromNow * 12);

    let principalFv, monthlyFv;
    if (rMonthly === 0) {
      principalFv = principal;
      monthlyFv = monthlyContribution * months;
    } else {
      const growth = Math.pow(1 + rMonthly, months);
      principalFv = principal * growth;
      monthlyFv = monthlyContribution * ((growth - 1) / rMonthly);
    }

    let bonusFv;
    if (rAnnual === 0) {
      bonusFv = annualBonus * yearsFromNow;
    } else {
      bonusFv = annualBonus * ((Math.pow(1 + rAnnual, yearsFromNow) - 1) / rAnnual);
    }

    return principalFv + monthlyFv + bonusFv;
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  return { futureValue, currentYear };
})();
