// 資産のカテゴリ定義
const Categories = (() => {
  const LIST = [
    { key: "nisa", label: "NISA", color: "#5b8def" },
    { key: "dc", label: "DC", color: "#a78bfa" },
    { key: "cash", label: "現金", color: "#34d399" },
    { key: "stock", label: "持株会", color: "#fbbf24" }
  ];
  function emptyBreakdown() {
    const b = {};
    LIST.forEach((c) => (b[c.key] = 0));
    return b;
  }
  function total(breakdown) {
    if (!breakdown) return 0;
    return LIST.reduce((sum, c) => sum + (breakdown[c.key] || 0), 0);
  }
  function emptyContributions() {
    const c = {};
    LIST.forEach((cat) => (c[cat.key] = { monthly: 0, bonus: 0 }));
    return c;
  }
  return { LIST, emptyBreakdown, total, emptyContributions };
})();

// データ保存(localStorageのみ・サーバー送信なし)
const Storage = (() => {
  const KEY = "assetPlanApp:v1";

  function defaultData() {
    return {
      settings: {
        simulationYears: 30,
        categoryRates: { nisa: 5, dc: 5, cash: 0, stock: 3 }, // 年利(%)、カテゴリ共通
        partnerEnabled: false
      },
      people: {
        self: { name: "自分", contributions: Categories.emptyContributions() },
        partner: { name: "パートナー", contributions: Categories.emptyContributions() }
      },
      // history entry: { id, date: 'YYYY-MM-DD', self: {nisa,dc,cash,stock}(円), partner: {同上} }
      history: [],
      goals: [] // { id, name, targetAmount(円), targetYear(西暦), note }
    };
  }

  function normalizeHistoryEntry(entry) {
    if (entry && entry.self) {
      return {
        id: entry.id,
        date: entry.date,
        self: { ...Categories.emptyBreakdown(), ...entry.self },
        partner: { ...Categories.emptyBreakdown(), ...(entry.partner || {}) }
      };
    }
    if (entry && entry.breakdown) {
      // 旧形式(自分のみ・カテゴリ内訳あり)からの移行
      return {
        id: entry.id,
        date: entry.date,
        self: { ...Categories.emptyBreakdown(), ...entry.breakdown },
        partner: Categories.emptyBreakdown()
      };
    }
    // さらに古い形式(amountのみ)からの移行: 内訳不明のため現金として扱う
    const self = Categories.emptyBreakdown();
    self.cash = (entry && entry.amount) || 0;
    return { id: entry.id, date: entry.date, self, partner: Categories.emptyBreakdown() };
  }

  function mergeContributions(base, override) {
    const merged = {};
    Categories.LIST.forEach((c) => {
      const b = base[c.key] || { monthly: 0, bonus: 0 };
      const o = (override && override[c.key]) || {};
      merged[c.key] = { monthly: o.monthly ?? b.monthly, bonus: o.bonus ?? b.bonus };
    });
    return merged;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      const base = defaultData();
      const settings = {
        ...base.settings,
        ...(parsed.settings || {}),
        categoryRates: { ...base.settings.categoryRates, ...((parsed.settings || {}).categoryRates || {}) }
      };
      const parsedPeople = parsed.people || {};
      const people = {
        self: {
          name: (parsedPeople.self && parsedPeople.self.name) || base.people.self.name,
          contributions: mergeContributions(
            base.people.self.contributions,
            parsedPeople.self && parsedPeople.self.contributions
          )
        },
        partner: {
          name: (parsedPeople.partner && parsedPeople.partner.name) || base.people.partner.name,
          contributions: mergeContributions(
            base.people.partner.contributions,
            parsedPeople.partner && parsedPeople.partner.contributions
          )
        }
      };
      return {
        settings,
        people,
        history: Array.isArray(parsed.history) ? parsed.history.map(normalizeHistoryEntry) : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : []
      };
    } catch (e) {
      console.error("Failed to load data, resetting.", e);
      return defaultData();
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return { load, save, uid, defaultData };
})();

const Fmt = (() => {
  function yen(n) {
    const v = Math.round(n || 0);
    return "¥" + v.toLocaleString("ja-JP");
  }
  function man(n) {
    // 万円表示(小数第1位まで)
    const v = (n || 0) / 10000;
    const rounded = Math.round(v * 10) / 10;
    return rounded.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
  }
  function dateJp(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
  function todayIso() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return { yen, man, dateJp, todayIso };
})();
