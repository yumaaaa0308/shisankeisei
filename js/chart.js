// 依存ライブラリなしの軽量Canvas折れ線グラフ
const MiniChart = (() => {
  const COLORS = {
    grid: "#2a3550",
    text: "#93a0c2",
    projection: "#5b8def",
    history: "#34d399",
    goalOnTrack: "#22d3ee",
    goalOff: "#f87171"
  };

  function manLabel(yen) {
    const v = yen / 10000;
    if (Math.abs(v) >= 10000) return Math.round(v / 1000) / 10 + "億"; // rough, rarely hit
    return Math.round(v) + "万";
  }

  // series: [{x:number, y:number}] sorted by x ascending (required)
  // history: [{x:number, y:number}] optional, actual recorded points
  // goals: [{x:number, y:number, label:string, onTrack:boolean}] optional
  function draw(canvas, { series, history = [], goals = [] }) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
    const cssHeight = canvas.height ? canvas.height / dpr : 220;
    const height = 220;
    canvas.width = cssWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);

    const padL = 44, padR = 12, padT = 16, padB = 24;
    const plotW = cssWidth - padL - padR;
    const plotH = height - padT - padB;

    const allX = series.map((p) => p.x).concat(history.map((p) => p.x)).concat(goals.map((p) => p.x));
    const allY = series.map((p) => p.y).concat(history.map((p) => p.y)).concat(goals.map((p) => p.y));
    if (allX.length === 0) return;
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX, xMin + 1);
    const yMin = 0;
    const yMax = Math.max(...allY, 1) * 1.1;

    const xToPx = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
    const yToPx = (y) => padT + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

    // グリッド(横4分割)
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px -apple-system, sans-serif";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = yMin + ((yMax - yMin) * i) / gridLines;
      const py = yToPx(y);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(cssWidth - padR, py);
      ctx.stroke();
      ctx.fillText(manLabel(y), 2, py + 3);
    }

    // X軸ラベル(開始・中間・終了)
    const xTicks = [xMin, Math.round((xMin + xMax) / 2), xMax];
    ctx.textAlign = "center";
    xTicks.forEach((xv) => {
      const label = xv === 0 ? "今" : (xv > 0 ? xv + "年後" : Math.abs(xv) + "年前");
      ctx.fillText(label, xToPx(xv), height - 6);
    });
    ctx.textAlign = "left";

    // 予測ライン
    if (series.length > 1) {
      ctx.strokeStyle = COLORS.projection;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      series.forEach((p, i) => {
        const px = xToPx(p.x), py = yToPx(p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // 塗りつぶし(グラデーション風)
      ctx.lineTo(xToPx(series[series.length - 1].x), yToPx(yMin));
      ctx.lineTo(xToPx(series[0].x), yToPx(yMin));
      ctx.closePath();
      ctx.fillStyle = "rgba(91, 141, 239, 0.08)";
      ctx.fill();
    }

    // 実績履歴ライン+ドット
    if (history.length > 0) {
      const sortedHist = [...history].sort((a, b) => a.x - b.x);
      if (sortedHist.length > 1) {
        ctx.strokeStyle = COLORS.history;
        ctx.lineWidth = 2;
        ctx.beginPath();
        sortedHist.forEach((p, i) => {
          const px = xToPx(p.x), py = yToPx(p.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      sortedHist.forEach((p) => {
        ctx.fillStyle = COLORS.history;
        ctx.beginPath();
        ctx.arc(xToPx(p.x), yToPx(p.y), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 目標マーカー
    goals.forEach((g) => {
      const px = xToPx(g.x), py = yToPx(g.y);
      ctx.strokeStyle = g.onTrack ? COLORS.goalOnTrack : COLORS.goalOff;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = g.onTrack ? COLORS.goalOnTrack : COLORS.goalOff;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 「今」の位置に縦線
    if (xMin < 0 && xMax > 0) {
      const px = xToPx(0);
      ctx.strokeStyle = COLORS.text;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // カテゴリ別の複数ラインを重ねて描画する(合計ラインは表示しない)
  // lines: [{ color, points: [{x,y}] }]
  function drawMultiLine(canvas, { lines }) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
    const height = 220;
    canvas.width = cssWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);

    const padL = 44, padR = 12, padT = 16, padB = 24;
    const plotW = cssWidth - padL - padR;
    const plotH = height - padT - padB;

    const allPoints = lines.flatMap((l) => l.points);
    if (allPoints.length === 0) return;
    const xMin = Math.min(...allPoints.map((p) => p.x));
    const xMax = Math.max(...allPoints.map((p) => p.x), xMin + 1);
    const yMin = 0;
    const yMax = Math.max(...allPoints.map((p) => p.y), 1) * 1.1;

    const xToPx = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
    const yToPx = (y) => padT + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px -apple-system, sans-serif";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = yMin + ((yMax - yMin) * i) / gridLines;
      const py = yToPx(y);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(cssWidth - padR, py);
      ctx.stroke();
      ctx.fillText(manLabel(y), 2, py + 3);
    }

    const xTicks = [xMin, Math.round((xMin + xMax) / 2), xMax];
    ctx.textAlign = "center";
    xTicks.forEach((xv) => {
      const label = xv === 0 ? "今" : (xv > 0 ? xv + "年後" : Math.abs(xv) + "年前");
      ctx.fillText(label, xToPx(xv), height - 6);
    });
    ctx.textAlign = "left";

    lines.forEach((line) => {
      if (line.points.length < 2) return;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      line.points.forEach((p, i) => {
        const px = xToPx(p.x), py = yToPx(p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
  }

  return { draw, drawMultiLine };
})();
