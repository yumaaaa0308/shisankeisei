// 画面描画(HTML文字列を組み立てる)
const Views = (() => {
  function currentAssetsFromHistory(history) {
    if (!history.length) return 0;
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    return sorted[sorted.length - 1].amount;
  }

  function goalStatus(goal, data) {
    const nowYear = Sim.currentYear();
    const yearsFromNow = Math.max(0, goal.targetYear - nowYear);
    const currentAssets = currentAssetsFromHistory(data.history);
    const projected = Sim.futureValue(
      currentAssets,
      data.settings.monthlyContribution,
      data.settings.annualReturnRate,
      yearsFromNow
    );
    const diff = projected - goal.targetAmount;
    return { yearsFromNow, projected, diff, onTrack: diff >= 0 };
  }

  // ---------- ホーム ----------
  function renderHome(data) {
    const currentAssets = currentAssetsFromHistory(data.history);
    const hasHistory = data.history.length > 0;
    const maxYears = Math.max(
      data.settings.simulationYears,
      ...data.goals.map((g) => Math.max(0, g.targetYear - Sim.currentYear())),
      1
    );
    const series = Sim.projectionSeries(
      currentAssets,
      data.settings.monthlyContribution,
      data.settings.annualReturnRate,
      maxYears
    ).map((p) => ({ x: p.year, y: p.value }));

    const fvAtHorizon = series.length ? series[series.length - 1].y : 0;

    const onTrackCount = data.goals.filter((g) => goalStatus(g, data).onTrack).length;

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
      .sort((a, b) => a.targetYear - b.targetYear)
      .map((g) => {
        const st = goalStatus(g, data);
        const badge = st.onTrack
          ? `<span class="badge good">達成見込み +${Fmt.man(st.diff)}</span>`
          : `<span class="badge bad">不足 ${Fmt.man(st.diff)}</span>`;
        return `
          <div class="list-item">
            <div class="li-main">
              <div class="li-title">${escapeHtml(g.name)}</div>
              <div class="li-sub">${g.targetYear}年 (${st.yearsFromNow}年後)・目標 ${Fmt.man(g.targetAmount)}</div>
            </div>
            ${badge}
          </div>`;
      })
      .join("");

    return `
      ${setupNotice}
      <div class="card">
        <h2>現在の資産</h2>
        <div class="big-number">${Fmt.yen(currentAssets)}</div>
        <div class="sub-number">${Fmt.man(currentAssets)}</div>
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
          ${data.goals.length ? `
          <span class="legend-item"><span class="legend-dot" style="background:#22d3ee"></span>目標(達成見込み)</span>
          <span class="legend-item"><span class="legend-dot" style="background:#f87171"></span>目標(不足)</span>` : ""}
        </div>
      </div>

      ${data.goals.length ? `
      <div class="section-title">目標の達成状況</div>
      <div class="list">${goalRows}</div>` : ""}
    `;
  }

  function drawHomeChart(data) {
    const canvas = document.getElementById("home-chart");
    if (!canvas) return;
    const currentAssets = currentAssetsFromHistory(data.history);
    const maxYears = Math.max(
      data.settings.simulationYears,
      ...data.goals.map((g) => Math.max(0, g.targetYear - Sim.currentYear())),
      1
    );
    const series = Sim.projectionSeries(
      currentAssets,
      data.settings.monthlyContribution,
      data.settings.annualReturnRate,
      maxYears
    ).map((p) => ({ x: p.year, y: p.value }));

    const nowYear = Sim.currentYear();
    const sortedHist = [...data.history].sort((a, b) => a.date.localeCompare(b.date));
    const history = sortedHist.map((h) => {
      const yearFrac = (nowYear * 12 + new Date().getMonth() - yearMonthOf(h.date)) / -12;
      return { x: yearFrac, y: h.amount };
    });

    const goals = data.goals.map((g) => {
      const st = goalStatus(g, data);
      return { x: st.yearsFromNow, y: g.targetAmount, onTrack: st.onTrack };
    });

    MiniChart.draw(canvas, { series, history, goals });
  }

  function yearMonthOf(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.getFullYear() * 12 + d.getMonth();
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
      .sort((a, b) => a.targetYear - b.targetYear)
      .map((g) => {
        const st = goalStatus(g, data);
        const badge = st.onTrack
          ? `<span class="badge good">+${Fmt.man(st.diff)}</span>`
          : `<span class="badge bad">${Fmt.man(st.diff)}</span>`;
        return `
          <div class="list-item">
            <div class="li-main">
              <div class="li-title">${escapeHtml(g.name)}</div>
              <div class="li-sub">${g.targetYear}年・目標 ${Fmt.man(g.targetAmount)}${g.note ? " ・ " + escapeHtml(g.note) : ""}</div>
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

  function goalFormModal(goal) {
    const isEdit = !!goal;
    const g = goal || { name: "", targetAmount: 0, targetYear: Sim.currentYear() + 5, note: "" };
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal-sheet" onclick="event.stopPropagation()">
          <h2>${isEdit ? "目標を編集" : "目標を追加"}</h2>
          <form id="goal-form">
            <div class="field">
              <label>目標名</label>
              <input type="text" name="name" value="${escapeAttr(g.name)}" placeholder="例: マイホーム頭金" required>
            </div>
            <div class="field">
              <label>目標金額(万円)</label>
              <input type="number" name="targetAmountMan" inputmode="decimal" value="${g.targetAmount / 10000}" min="0" step="0.1" required>
            </div>
            <div class="field">
              <label>目標年(西暦)</label>
              <input type="number" name="targetYear" inputmode="numeric" value="${g.targetYear}" min="${Sim.currentYear()}" required>
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
    if (!data.history.length) {
      return `
        ${chart}
        <div class="empty-state">まだ記録がありません。現在の資産額を記録してみましょう。</div>
        <button class="btn btn-primary btn-block" data-action="add-history">＋ 資産を記録</button>
      `;
    }
    const items = [...data.history]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(
        (h) => `
          <div class="list-item">
            <div class="li-main">
              <div class="li-title">${Fmt.yen(h.amount)}</div>
              <div class="li-sub">${Fmt.dateJp(h.date)}</div>
            </div>
            <div class="li-actions">
              <button class="btn-icon" data-action="edit-history" data-id="${h.id}">✎</button>
              <button class="btn-icon" data-action="delete-history" data-id="${h.id}">🗑</button>
            </div>
          </div>`
      )
      .join("");
    return `
      ${chart}
      <div class="section-title">記録一覧</div>
      <div class="list">${items}</div>
      <div class="fab-row">
        <button class="btn btn-primary btn-block" data-action="add-history">＋ 資産を記録</button>
      </div>
    `;
  }

  function drawHistoryChart(data) {
    const canvas = document.getElementById("history-chart");
    if (!canvas) return;
    const nowYear = Sim.currentYear();
    const sorted = [...data.history].sort((a, b) => a.date.localeCompare(b.date));
    const history = sorted.map((h) => {
      const yearFrac = (yearMonthOf(h.date) - (nowYear * 12 + new Date().getMonth())) / 12;
      return { x: yearFrac, y: h.amount };
    });
    MiniChart.draw(canvas, { series: history.length ? history : [{ x: 0, y: 0 }], history: [], goals: [] });
  }

  function historyFormModal(entry) {
    const isEdit = !!entry;
    const h = entry || { date: Fmt.todayIso(), amount: 0 };
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal-sheet" onclick="event.stopPropagation()">
          <h2>${isEdit ? "記録を編集" : "資産を記録"}</h2>
          <form id="history-form">
            <div class="field">
              <label>日付</label>
              <input type="date" name="date" value="${h.date}" required>
            </div>
            <div class="field">
              <label>資産額(万円)</label>
              <input type="number" name="amountMan" inputmode="decimal" value="${h.amount / 10000}" min="0" step="0.1" required>
              <div class="hint">預金・投資などの合計を万円単位で入力</div>
            </div>
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

  // ---------- 設定 ----------
  function renderSettings(data) {
    const s = data.settings;
    return `
      <div class="card">
        <h2>積立シミュレーション設定</h2>
        <form id="settings-form">
          <div class="field">
            <label>毎月の積立額(円)</label>
            <input type="number" name="monthlyContribution" inputmode="numeric" value="${s.monthlyContribution}" min="0" step="1000" required>
          </div>
          <div class="field">
            <label>想定年利(%)</label>
            <input type="number" name="annualReturnRate" inputmode="decimal" value="${s.annualReturnRate}" min="-20" max="30" step="0.1" required>
            <div class="hint">例: 現金なら0%、投資信託の想定なら3〜5%程度</div>
          </div>
          <div class="field">
            <label>シミュレーション期間(年)</label>
            <input type="number" name="simulationYears" inputmode="numeric" value="${s.simulationYears}" min="1" max="60" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block">保存</button>
        </form>
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
    renderHome, drawHomeChart,
    renderGoals, goalFormModal,
    renderHistory, drawHistoryChart, historyFormModal,
    renderSettings,
    currentAssetsFromHistory, goalStatus
  };
})();
