// 画面描画(HTML文字列を組み立てる)
const Views = (() => {
  function combinedBreakdown(entry, partnerEnabled) {
    const b = Categories.emptyBreakdown();
    if (!entry) return b;
    Categories.LIST.forEach((c) => {
      b[c.key] = (entry.self[c.key] || 0) + (partnerEnabled ? entry.partner[c.key] || 0 : 0);
    });
    return b;
  }

  function breakdownBars(breakdown) {
    const total = Categories.total(breakdown);
    if (total <= 0) return "";
    const rows = Categories.LIST.filter((c) => (breakdown[c.key] || 0) > 0)
      .map((c) => {
        const v = breakdown[c.key] || 0;
        const pct = Math.round((v / total) * 100);
        return `
          <div class="breakdown-row">
            <div class="breakdown-label">
              <span class="legend-dot" style="background:${c.color}"></span>${c.label}
            </div>
            <div class="breakdown-bar-track">
              <div class="breakdown-bar-fill" style="width:${pct}%;background:${c.color}"></div>
            </div>
            <div class="breakdown-value">${Fmt.man(v)}<span class="breakdown-pct">(${pct}%)</span></div>
          </div>`;
      })
      .join("");
    return `<div class="breakdown-list">${rows}</div>`;
  }

  // ---------- ホーム ----------
  function renderHome(data, categoryChartMode, hiddenCategories) {
    const chartMode = data.settings.partnerEnabled ? (categoryChartMode || "combined") : "combined";
    const hidden = hiddenCategories || new Set();
    const currentAssets = Model.currentAssets(data);
    const hasHistory = data.history.length > 0;
    const maxYears = Math.max(
      data.settings.simulationYears,
      ...data.goals.map((g) => Math.ceil(Model.monthsUntil(g.targetDate) / 12)),
      1
    );
    const series = Model.projectionSeries(data, maxYears).map((p) => ({ x: p.year, y: p.value }));
    const fvAtHorizon = series.length ? series[series.length - 1].y : 0;
    const onTrackCount = data.goals.filter((g) => Model.goalStatus(g, data).onTrack).length;
    const hasTotalGoals = data.goals.some((g) => !g.fundingSource || g.fundingSource === "total");
    const hasCategoryGoals = data.goals.some((g) => g.fundingSource && g.fundingSource !== "total");

    let setupNotice = "";
    if (!hasHistory) {
      setupNotice = `
        <div class="card">
          <h2>はじめに</h2>
          <p style="margin:0 0 12px;color:var(--text-dim);font-size:14px;">
            まずは「資産推移」タブで現在の資産額を記録してください。シミュレーションの起点になります。
          </p>
          <button class="btn btn-primary" data-action="goto" data-view="history">資産を記録する</button>
        </div>`;
    }

    const goalRows = data.goals
      .slice()
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
      .map((g) => {
        const st = Model.goalStatus(g, data);
        const badge = st.onTrack
          ? `<span class="badge good">達成見込み +${Fmt.man(st.diff)}</span>`
          : `<span class="badge bad">不足 ${Fmt.man(st.diff)}</span>`;
        return `
          <div class="list-item">
            <div class="li-main">
              <div class="li-title">${escapeHtml(g.name)}</div>
              <div class="li-sub">${Fmt.yearMonthJp(g.targetDate)} (${Fmt.countdownLabel(st.monthsFromNow)})・目標 ${Fmt.man(g.targetAmount)}・${fundingSourceLabel(g.fundingSource)}</div>
            </div>
            ${badge}
          </div>`;
      })
      .join("");

    const latest = Model.latestHistoryEntry(data.history);
    const breakdownHtml = latest ? breakdownBars(combinedBreakdown(latest, data.settings.partnerEnabled)) : "";

    let peopleSplitHtml = "";
    if (latest && data.settings.partnerEnabled) {
      const selfTotal = Categories.total(latest.self);
      const partnerTotal = Categories.total(latest.partner);
      peopleSplitHtml = `
        <div class="stat-grid" style="margin-top:14px;">
          <div class="stat">
            <div class="label">${escapeHtml(data.people.self.name)}</div>
            <div class="value">${Fmt.man(selfTotal)}</div>
          </div>
          <div class="stat">
            <div class="label">${escapeHtml(data.people.partner.name)}</div>
            <div class="value">${Fmt.man(partnerTotal)}</div>
          </div>
        </div>`;
    }

    return `
      ${setupNotice}
      <div class="card">
        <h2>現在の資産</h2>
        <div class="big-number">${Fmt.yen(currentAssets)}</div>
        <div class="sub-number">${Fmt.man(currentAssets)}</div>
        ${breakdownHtml}
        ${peopleSplitHtml}
      </div>

      <div class="stat-grid">
        <div class="stat">
          <div class="label">${maxYears}年後の予測資産</div>
          <div class="value">${Fmt.man(fvAtHorizon)}</div>
        </div>
        <div class="stat">
          <div class="label">目標達成見込み</div>
          <div class="value">${onTrackCount} / ${data.goals.length}</div>
        </div>
      </div>

      <div class="card">
        <h2>資産の推移予測</h2>
        <canvas class="chart" id="home-chart"></canvas>
        <div class="legend">
          <span class="legend-item"><span class="legend-dot" style="background:#5b8def"></span>シミュレーション</span>
          <span class="legend-item"><span class="legend-dot" style="background:#34d399"></span>実績</span>
          ${hasTotalGoals ? `
          <span class="legend-item"><span class="legend-dot" style="background:#22d3ee"></span>目標(達成見込み)</span>
          <span class="legend-item"><span class="legend-dot" style="background:#f87171"></span>目標(不足)</span>` : ""}
        </div>
      </div>

      <div class="card">
        <div class="chart-header">
          <h2>カテゴリ別の推移予測</h2>
          ${data.settings.partnerEnabled ? `
          <div class="segmented">
            <button type="button" class="seg-btn ${chartMode === "combined" ? "active" : ""}" data-action="set-category-mode" data-mode="combined">合計</button>
            <button type="button" class="seg-btn ${chartMode === "self" ? "active" : ""}" data-action="set-category-mode" data-mode="self">${escapeHtml(data.people.self.name)}</button>
            <button type="button" class="seg-btn ${chartMode === "partner" ? "active" : ""}" data-action="set-category-mode" data-mode="partner">${escapeHtml(data.people.partner.name)}</button>
          </div>` : ""}
        </div>
        <canvas class="chart" id="category-chart"></canvas>
        <div class="legend">
          ${Categories.LIST.map((c) => `
          <button type="button" class="legend-item legend-toggle ${hidden.has(c.key) ? "legend-off" : ""}" data-action="toggle-category-line" data-category="${c.key}">
            <span class="legend-dot" style="background:${c.color}"></span>${c.label}
          </button>`).join("")}
          ${hasCategoryGoals && chartMode === "combined" ? `
          <span class="legend-item"><span class="legend-dot" style="background:#22d3ee"></span>目標(達成見込み)</span>
          <span class="legend-item"><span class="legend-dot" style="background:#f87171"></span>目標(不足)</span>` : ""}
        </div>
      </div>

      ${data.goals.length ? `
      <div class="section-title">目標の達成状況</div>
      <div class="list">${goalRows}</div>` : ""}
    `;
  }

  function drawCategoryChart(data, categoryChartMode, hiddenCategories) {
    const canvas = document.getElementById("category-chart");
    if (!canvas) return;
    const chartMode = data.settings.partnerEnabled ? (categoryChartMode || "combined") : "combined";
    const hidden = hiddenCategories || new Set();
    const maxYears = Math.max(
      data.settings.simulationYears,
      ...data.goals.map((g) => Math.ceil(Model.monthsUntil(g.targetDate) / 12)),
      1
    );
    const byKey = Model.categorySeriesByKey(data, maxYears, chartMode);
    const lines = Categories.LIST.filter((c) => !hidden.has(c.key)).map((c) => ({
      color: c.color,
      label: c.label,
      points: byKey[c.key].map((p) => ({ x: p.year, y: p.value }))
    }));
    const goals = chartMode === "combined"
      ? data.goals
          .filter((g) => g.fundingSource && g.fundingSource !== "total")
          .map((g) => {
            const st = Model.goalStatus(g, data);
            return { x: st.yearsFromNow, y: g.targetAmount, onTrack: st.onTrack };
          })
      : [];
    MiniChart.drawMultiLine(canvas, { lines, goals });
  }

  function drawHomeChart(data) {
    const canvas = document.getElementById("home-chart");
    if (!canvas) return;
    const maxYears = Math.max(
      data.settings.simulationYears,
      ...data.goals.map((g) => Math.ceil(Model.monthsUntil(g.targetDate) / 12)),
      1
    );
    const series = Model.projectionSeries(data, maxYears).map((p) => ({ x: p.year, y: p.value }));

    const nowYear = Sim.currentYear();
    const sortedHist = [...data.history].sort((a, b) => a.date.localeCompare(b.date));
    const history = sortedHist.map((h) => {
      const yearFrac = (nowYear * 12 + new Date().getMonth() - yearMonthOf(h.date)) / -12;
      return { x: yearFrac, y: Categories.total(combinedBreakdown(h, data.settings.partnerEnabled)) };
    });

    const goals = data.goals
      .filter((g) => !g.fundingSource || g.fundingSource === "total")
      .map((g) => {
        const st = Model.goalStatus(g, data);
        return { x: st.yearsFromNow, y: g.targetAmount, onTrack: st.onTrack };
      });

    MiniChart.draw(canvas, { series, history, goals });
  }

  function yearMonthOf(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.getFullYear() * 12 + d.getMonth();
  }

  function fundingSourceLabel(key) {
    if (!key || key === "total") return "全体(合計)";
    const c = Categories.find(key);
    return c ? c.label : "全体(合計)";
  }

  // ---------- 目標 ----------
  function renderGoals(data) {
    if (!data.goals.length) {
      return `
        <div class="empty-state">まだ目標がありません。<br>車・住宅・教育資金など、将来の支出目標を登録しましょう。</div>
        <button class="btn btn-primary btn-block" data-action="add-goal">＋ 目標を追加</button>
      `;
    }
    const items = data.goals
      .slice()
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
      .map((g) => {
        const st = Model.goalStatus(g, data);
        const badge = st.onTrack
          ? `<span class="badge good">+${Fmt.man(st.diff)}</span>`
          : `<span class="badge bad">${Fmt.man(st.diff)}</span>`;
        return `
          <div class="list-item">
            <div class="li-main">
              <div class="li-title">${escapeHtml(g.name)}</div>
              <div class="li-sub">${Fmt.yearMonthJp(g.targetDate)}・目標 ${Fmt.man(g.targetAmount)}・資金源: ${fundingSourceLabel(g.fundingSource)}${g.note ? " ・ " + escapeHtml(g.note) : ""}</div>
              <div class="li-sub">予測: ${Fmt.man(st.projected)} ${badge}</div>
            </div>
            <div class="li-actions">
              <button class="btn-icon" data-action="edit-goal" data-id="${g.id}">✎</button>
              <button class="btn-icon" data-action="delete-goal" data-id="${g.id}">🗑</button>
            </div>
          </div>`;
      })
      .join("");
    return `
      <div class="list">${items}</div>
      <div class="fab-row">
        <button class="btn btn-primary btn-block" data-action="add-goal">＋ 目標を追加</button>
      </div>
    `;
  }

  function defaultTargetDate() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function goalFormModal(goal) {
    const isEdit = !!goal;
    const g = goal || { name: "", targetAmount: 0, targetDate: defaultTargetDate(), note: "", fundingSource: "total" };
    const fundingOptions = [{ key: "total", label: "全体(すべての資産合計)" }, ...Categories.LIST]
      .map((c) => `<option value="${c.key}" ${g.fundingSource === c.key ? "selected" : ""}>${c.label}</option>`)
      .join("");
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal-sheet" data-action="noop">
          <h2>${isEdit ? "目標を編集" : "目標を追加"}</h2>
          <form id="goal-form">
            <div class="field">
              <label>目標名</label>
              <input type="text" name="name" value="${escapeAttr(g.name)}" placeholder="例: マイホーム頭金" required>
            </div>
            <div class="field">
              <label>目標金額(万円)</label>
              <input type="text" inputmode="decimal" class="comma-input" name="targetAmountMan" value="${Fmt.manInputValue(g.targetAmount)}" required>
            </div>
            <div class="field">
              <label>目標の年月</label>
              <input type="month" name="targetDate" value="${g.targetDate}" min="${Fmt.currentYearMonth()}" required>
            </div>
            <div class="field">
              <label>資金源</label>
              <select name="fundingSource">${fundingOptions}</select>
              <div class="hint">この目標をどの資産で用意するか。例: 車は現金、老後資金はDCなど</div>
            </div>
            <div class="field">
              <label>メモ(任意)</label>
              <input type="text" name="note" value="${escapeAttr(g.note || "")}" placeholder="例: 車の買い替え">
            </div>
            <input type="hidden" name="recordId" value="${g.id || ""}">
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-action="close-modal" style="flex:1">キャンセル</button>
              <button type="submit" class="btn btn-primary" style="flex:1">保存</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // ---------- 資産推移 ----------
  function renderHistory(data) {
    const chart = `
      <div class="card">
        <h2>実績の推移</h2>
        <canvas class="chart" id="history-chart"></canvas>
      </div>`;
    const mfImportBtn = `
      <button class="btn btn-secondary btn-block" data-action="import-mf-csv" style="margin-top:10px;">マネーフォワードCSVを取り込む</button>
      <div class="hint" style="text-align:center;margin-top:6px;">現金・持株会(株式)・NISA(投資信託)・DC(年金)を取り込みます。</div>
      <input type="file" id="import-mf-file-input" accept=".csv,text/csv" class="hidden">
    `;
    if (!data.history.length) {
      return `
        ${chart}
        <div class="empty-state">まだ記録がありません。現在の資産額を記録してみましょう。</div>
        <button class="btn btn-primary btn-block" data-action="add-history">＋ 資産を記録</button>
        ${mfImportBtn}
      `;
    }
    const partnerEnabled = data.settings.partnerEnabled;
    const items = [...data.history]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((h) => {
        const combined = combinedBreakdown(h, partnerEnabled);
        const total = Categories.total(combined);
        const breakdownText = Categories.LIST.filter((c) => (combined[c.key] || 0) > 0)
          .map((c) => `${c.label} ${Fmt.man(combined[c.key])}`)
          .join("・");
        const peopleText = partnerEnabled
          ? `${escapeHtml(data.people.self.name)} ${Fmt.man(Categories.total(h.self))}・${escapeHtml(data.people.partner.name)} ${Fmt.man(Categories.total(h.partner))}`
          : "";
        return `
          <div class="list-item">
            <div class="li-main">
              <div class="li-title">${Fmt.yen(total)}</div>
              <div class="li-sub">${Fmt.dateJp(h.date)}</div>
              ${breakdownText ? `<div class="li-sub">${breakdownText}</div>` : ""}
              ${peopleText ? `<div class="li-sub">${peopleText}</div>` : ""}
            </div>
            <div class="li-actions">
              <button class="btn-icon" data-action="edit-history" data-id="${h.id}">✎</button>
              <button class="btn-icon" data-action="delete-history" data-id="${h.id}">🗑</button>
            </div>
          </div>`;
      })
      .join("");
    return `
      ${chart}
      <div class="section-title">記録一覧</div>
      <div class="list">${items}</div>
      <div class="fab-row">
        <button class="btn btn-primary btn-block" data-action="add-history">＋ 資産を記録</button>
      </div>
      ${mfImportBtn}
    `;
  }

  function drawHistoryChart(data) {
    const canvas = document.getElementById("history-chart");
    if (!canvas) return;
    const nowYear = Sim.currentYear();
    const sorted = [...data.history].sort((a, b) => a.date.localeCompare(b.date));
    const history = sorted.map((h) => {
      const yearFrac = (yearMonthOf(h.date) - (nowYear * 12 + new Date().getMonth())) / 12;
      return { x: yearFrac, y: Categories.total(combinedBreakdown(h, data.settings.partnerEnabled)) };
    });
    MiniChart.draw(canvas, { series: [], history: history.length ? history : [{ x: 0, y: 0 }], goals: [] });
  }

  function personCategoryFields(prefix, breakdown) {
    return Categories.LIST.map(
      (c) => `
            <div class="field">
              <label>${c.label}(万円)</label>
              <input type="text" inputmode="decimal" class="comma-input" name="${prefix}_${c.key}" value="${Fmt.manInputValue(breakdown[c.key] || 0)}">
            </div>`
    ).join("");
  }

  function historyFormModal(entry, data) {
    const isEdit = !!entry;
    const h = entry || { date: Fmt.todayIso(), self: Categories.emptyBreakdown(), partner: Categories.emptyBreakdown() };
    const partnerEnabled = data.settings.partnerEnabled;
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal-sheet" data-action="noop">
          <h2>${isEdit ? "記録を編集" : "資産を記録"}</h2>
          <form id="history-form">
            <div class="field">
              <label>日付</label>
              <input type="date" name="date" value="${h.date}" required>
            </div>
            <div class="section-title" style="margin-top:0;">${escapeHtml(data.people.self.name)}</div>
            ${personCategoryFields("self", h.self)}
            ${partnerEnabled ? `
            <div class="section-title">${escapeHtml(data.people.partner.name)}</div>
            ${personCategoryFields("partner", h.partner)}` : ""}
            <div class="hint" style="margin:-6px 0 14px;">カテゴリごとの残高を万円単位で入力(未入力は0円)</div>
            <input type="hidden" name="recordId" value="${h.id || ""}">
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-action="close-modal" style="flex:1">キャンセル</button>
              <button type="submit" class="btn btn-primary" style="flex:1">保存</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // ---------- 収支(確定支出・収入カレンダー) ----------
  const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  function recurrenceLabel(item) {
    return item.recurrence === "once"
      ? Fmt.dateJp(item.date)
      : `毎月${item.day}日`;
  }

  function cashflowItemSortKey(item) {
    return item.recurrence === "monthly"
      ? `0-${String(item.day).padStart(2, "0")}`
      : `1-${item.date}`;
  }

  function renderCashflow(data, year, month, selectedDay) {
    const items = data.cashflow.items;
    const totals = Cashflow.monthTotals(items, year, month);
    const byDay = Cashflow.itemsByDay(items, year, month);
    const dim = Cashflow.daysInMonth(year, month);
    const firstDow = new Date(year, month - 1, 1).getDay();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const todayDate = today.getDate();

    let cells = "";
    for (let i = 0; i < firstDow; i++) {
      cells += `<div class="cal-cell cal-empty"></div>`;
    }
    for (let d = 1; d <= dim; d++) {
      const dayItems = byDay[d];
      const dayIncome = dayItems.filter((it) => it.type === "income").reduce((s, it) => s + it.amount, 0);
      const dayExpense = dayItems.filter((it) => it.type === "expense").reduce((s, it) => s + it.amount, 0);
      const isToday = isCurrentMonth && d === todayDate;
      const isSelected = d === selectedDay;
      cells += `
        <button type="button" class="cal-cell ${isToday ? "cal-today" : ""} ${isSelected ? "cal-selected" : ""}" data-action="select-cashflow-day" data-day="${d}">
          <span class="cal-day-num">${d}</span>
          ${dayIncome > 0 ? `<span class="cal-amt cal-income">+${Fmt.compactYen(dayIncome)}</span>` : ""}
          ${dayExpense > 0 ? `<span class="cal-amt cal-expense">-${Fmt.compactYen(dayExpense)}</span>` : ""}
        </button>`;
    }

    let dayPanel = "";
    if (selectedDay) {
      const dayItems = byDay[selectedDay] || [];
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      dayPanel = `
        <div class="card">
          <h2>${month}月${selectedDay}日の予定</h2>
          ${dayItems.length ? `
          <div class="list">
            ${dayItems.map((it) => `
              <div class="list-item">
                <div class="li-main">
                  <div class="li-title">${escapeHtml(it.name)}</div>
                  <div class="li-sub">${recurrenceLabel(it)}</div>
                </div>
                <div class="li-actions" style="align-items:center;">
                  <span class="badge ${it.type === "income" ? "good" : "bad"}">${it.type === "income" ? "+" : "-"}${Fmt.yen(it.amount)}</span>
                  <button class="btn-icon" data-action="edit-cashflow-item" data-id="${it.id}">✎</button>
                </div>
              </div>`).join("")}
          </div>` : `<div class="empty-state">この日の予定はありません</div>`}
          <button class="btn btn-secondary btn-block" style="margin-top:12px;" data-action="add-cashflow-item" data-prefill-date="${dateStr}">＋ この日に追加</button>
        </div>`;
    }

    const itemRows = [...items]
      .sort((a, b) => cashflowItemSortKey(a).localeCompare(cashflowItemSortKey(b)))
      .map((it) => `
        <div class="list-item">
          <div class="li-main">
            <div class="li-title">${escapeHtml(it.name)}</div>
            <div class="li-sub">${recurrenceLabel(it)}・${it.type === "income" ? "収入" : "支出"}</div>
          </div>
          <span class="badge ${it.type === "income" ? "good" : "bad"}">${it.type === "income" ? "+" : "-"}${Fmt.yen(it.amount)}</span>
          <div class="li-actions">
            <button class="btn-icon" data-action="edit-cashflow-item" data-id="${it.id}">✎</button>
            <button class="btn-icon" data-action="delete-cashflow-item" data-id="${it.id}">🗑</button>
          </div>
        </div>`)
      .join("");

    return `
      <div class="card">
        <div class="month-nav">
          <button type="button" class="btn-icon" data-action="cashflow-prev-month">‹</button>
          <div class="month-nav-label">${year}年${month}月</div>
          <button type="button" class="btn-icon" data-action="cashflow-next-month">›</button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat">
          <div class="label">収入</div>
          <div class="value" style="color:var(--good)">+${Fmt.yen(totals.income)}</div>
        </div>
        <div class="stat">
          <div class="label">確定支出</div>
          <div class="value" style="color:var(--bad)">-${Fmt.yen(totals.expense)}</div>
        </div>
      </div>

      <div class="card">
        <h2>差引</h2>
        <div class="big-number" style="color:${totals.net >= 0 ? "var(--good)" : "var(--bad)"}">${Fmt.yen(totals.net)}</div>
      </div>

      <div class="card">
        <div class="calendar-grid">
          ${DOW_LABELS.map((l) => `<div class="cal-dow">${l}</div>`).join("")}
          ${cells}
        </div>
      </div>

      ${dayPanel}

      <div class="section-title">登録済みの項目</div>
      ${items.length ? `<div class="list">${itemRows}</div>` : `<div class="empty-state">まだ項目がありません。家賃やサブスク、給与日などを登録しましょう。</div>`}
      <div class="fab-row">
        <button class="btn btn-primary btn-block" data-action="add-cashflow-item">＋ 項目を追加</button>
      </div>
    `;
  }

  function cashflowItemFormModal(item, prefillDate) {
    const isEdit = !!item;
    const it = item || {
      type: "expense",
      name: "",
      amount: 0,
      recurrence: prefillDate ? "once" : "monthly",
      day: new Date().getDate(),
      date: prefillDate || Fmt.todayIso()
    };
    const isMonthly = it.recurrence === "monthly";
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal-sheet" data-action="noop">
          <h2>${isEdit ? "項目を編集" : "項目を追加"}</h2>
          <form id="cashflow-form">
            <div class="field">
              <label>種類</label>
              <select name="type">
                <option value="expense" ${it.type === "expense" ? "selected" : ""}>支出</option>
                <option value="income" ${it.type === "income" ? "selected" : ""}>収入</option>
              </select>
            </div>
            <div class="field">
              <label>名前</label>
              <input type="text" name="name" value="${escapeAttr(it.name)}" placeholder="例: 家賃・サブスク・給与" required>
            </div>
            <div class="field">
              <label>金額(円)</label>
              <input type="text" inputmode="decimal" class="comma-input-yen" name="amount" value="${Fmt.yenInputValue(it.amount)}" required>
            </div>
            <div class="field">
              <label>繰り返し</label>
              <select name="recurrence" id="cf-recurrence">
                <option value="monthly" ${isMonthly ? "selected" : ""}>毎月</option>
                <option value="once" ${!isMonthly ? "selected" : ""}>単発</option>
              </select>
            </div>
            <div class="field" id="cf-day-field" style="${isMonthly ? "" : "display:none;"}">
              <label>毎月の日(1〜31。月末はその月の末日になります)</label>
              <input type="number" name="day" min="1" max="31" value="${it.day}">
            </div>
            <div class="field" id="cf-date-field" style="${isMonthly ? "display:none;" : ""}">
              <label>日付</label>
              <input type="date" name="date" value="${it.date}">
            </div>
            <input type="hidden" name="recordId" value="${it.id || ""}">
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-action="close-modal" style="flex:1">キャンセル</button>
              <button type="submit" class="btn btn-primary" style="flex:1">保存</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // ---------- 設定 ----------
  function contributionRows(prefix, contributions) {
    return Categories.LIST.map(
      (c) => `
        <div class="contrib-row">
          <div class="contrib-label">
            <span class="legend-dot" style="background:${c.color}"></span>${c.label}
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>毎月(万円)</label>
            <input type="text" inputmode="decimal" class="comma-input" name="${prefix}_${c.key}_monthly" value="${Fmt.manInputValue(contributions[c.key].monthly || 0)}">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>ボーナス/年(万円)</label>
            <input type="text" inputmode="decimal" class="comma-input" name="${prefix}_${c.key}_bonus" value="${Fmt.manInputValue(contributions[c.key].bonus || 0)}">
          </div>
        </div>`
    ).join("");
  }

  function renderSettings(data) {
    const s = data.settings;
    const rateRows = Categories.LIST.map(
      (c) => `
        <div class="field rate-field">
          <label><span class="legend-dot" style="background:${c.color}"></span>${c.label}</label>
          <div class="rate-input-wrap">
            <input type="number" name="rate_${c.key}" inputmode="decimal" value="${s.categoryRates[c.key]}" min="-20" max="30" step="0.1" required>
            <span>%</span>
          </div>
        </div>`
    ).join("");

    return `
      <form id="settings-form">
        <div class="card">
          <details>
            <summary>カテゴリ別 想定年利</summary>
            <div class="details-body">
              ${rateRows}
              <div class="hint">例: 現金は0%、NISA/DCは3〜5%程度</div>
            </div>
          </details>
        </div>

        <div class="card">
          <details>
            <summary>${escapeHtml(data.people.self.name)}の積立設定</summary>
            <div class="details-body">
              <div class="field">
                <label>名前</label>
                <input type="text" name="self_name" value="${escapeAttr(data.people.self.name)}" maxlength="10">
              </div>
              ${contributionRows("self", data.people.self.contributions)}
            </div>
          </details>
        </div>

        <div class="card">
          <h2>パートナー</h2>
          <label class="toggle-row">
            <input type="checkbox" name="partnerEnabled" id="partner-toggle" data-action="toggle-partner-fields" ${s.partnerEnabled ? "checked" : ""}>
            <span>パートナーの資産も一緒に管理する</span>
          </label>
          <div id="partner-fields" class="${s.partnerEnabled ? "" : "hidden"}" style="margin-top:14px;">
            <div class="field">
              <label>名前</label>
              <input type="text" name="partner_name" value="${escapeAttr(data.people.partner.name)}" maxlength="10">
            </div>
            ${contributionRows("partner", data.people.partner.contributions)}
          </div>
        </div>

        <div class="card">
          <h2>シミュレーション期間</h2>
          <div class="field">
            <label>期間(年)</label>
            <input type="number" name="simulationYears" inputmode="numeric" value="${s.simulationYears}" min="1" max="60" required>
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-block">保存</button>
      </form>

      <div class="card">
        <h2>データのバックアップ</h2>
        <p style="margin:0 0 12px;color:var(--text-dim);font-size:13px;">
          データはこの端末内のみに保存されています。機種変更やアプリの再インストールに備えて、
          ファイルに書き出しておくことをおすすめします。書き出したファイルは「ファイル」アプリや
          iCloud Driveに保存できます。
        </p>
        <div class="fab-row">
          <button class="btn btn-secondary" data-action="export-data" style="flex:1">エクスポート</button>
          <button class="btn btn-secondary" data-action="import-data" style="flex:1">インポート</button>
        </div>
        <input type="file" id="import-file-input" accept="application/json,.json" class="hidden">
      </div>

      <div class="card">
        <h2>データ管理</h2>
        <p style="margin:0 0 12px;color:var(--text-dim);font-size:13px;">
          データはこの端末内のみに保存されています。他の端末とは共有されません。
        </p>
        <button class="btn btn-danger btn-block" data-action="reset-data">すべてのデータを削除</button>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  return {
    renderHome, drawHomeChart, drawCategoryChart,
    renderGoals, goalFormModal,
    renderHistory, drawHistoryChart, historyFormModal,
    renderCashflow, cashflowItemFormModal,
    renderSettings
  };
})();
