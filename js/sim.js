// 積立シミュレーション計算(カテゴリを月次で同時に複利計算し、目標の支出も反映する)
const Sim = (() => {
  const BONUS_MONTH_INDEX0 = 5; // ボーナス月(6月, 0始まり: 1月=0...6月=5)

  // 複数カテゴリを月次で同時にシミュレーションする。ボーナスは毎年6月に加算される。
  // categories: [{ key, principal, monthly, bonus, ratePercent }]
  // withdrawals: [{ month(経過月数), amount(円), sources: [categoryKey,...] }]
  //   その月の終わりに、sourcesの合算プールから残高比で按分して差し引く(目標の支出)。
  //   プラス残高のカテゴリがなければ均等に按分する。
  // startMonth0: 「今」の月(0始まり)。省略時は実行時点の月を使う
  // 戻り値: { [key]: values[] } values[m] = m ヶ月後の残高(values[0]は元本)
  function simulateJoint(categories, totalMonths, withdrawals, startMonth0) {
    const base = startMonth0 == null ? new Date().getMonth() : startMonth0;
    const balances = {};
    const values = {};
    categories.forEach((c) => {
      balances[c.key] = c.principal;
      values[c.key] = new Array(totalMonths + 1);
      values[c.key][0] = c.principal;
    });

    const byMonth = new Map();
    (withdrawals || []).forEach((w) => {
      if (w.month > totalMonths || !w.sources.length) return;
      if (!byMonth.has(w.month)) byMonth.set(w.month, []);
      byMonth.get(w.month).push(w);
    });

    for (let m = 1; m <= totalMonths; m++) {
      categories.forEach((c) => {
        const r = (c.ratePercent || 0) / 100 / 12;
        let b = balances[c.key] * (1 + r) + c.monthly;
        if ((base + m) % 12 === BONUS_MONTH_INDEX0) b += c.bonus;
        balances[c.key] = b;
      });

      (byMonth.get(m) || []).forEach((w) => {
        const positives = w.sources.map((k) => Math.max(balances[k], 0));
        const posTotal = positives.reduce((s, v) => s + v, 0);
        w.sources.forEach((k, i) => {
          const share = posTotal > 0 ? positives[i] / posTotal : 1 / w.sources.length;
          balances[k] -= w.amount * share;
        });
      });

      categories.forEach((c) => {
        values[c.key][m] = balances[c.key];
      });
    }
    return values;
  }

  function currentYear() {
    return new Date().getFullYear();
  }

  return { simulateJoint, currentYear };
})();
