// 依存ライブラリなしの軽量Canvas折れ線グラフ(タップ/ドラッグで値を確認できる)
const MiniChart = (() => {
  const COLORS = {
    grid: "#2a3550",
    text: "#93a0c2",
    textStrong: "#eef2ff",
    projection: "#5b8def",
    history: "#34d399",
    goalOnTrack: "#22d3ee",
    goalOff: "#f87171",
    tooltipBg: "rgba(20, 27, 45, 0.96)",
    tooltipBorder: "#2a3550"
  };

  function manLabel(yen) {
    const v = yen / 10000;
    if (Math.abs(v) >= 10000) return Math.round(v / 1000) / 10 + "億"; // rough, rarely hit
    return Math.round(v) + "万";
  }

  function manLabelPrecise(yen) {
    const v = Math.round((yen / 10000) * 10) / 10;
    return v.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + "万円";
  }

  function yearLabel(y) {
    if (y === 0) return "今";
    return y > 0 ? y + "年後" : Math.abs(y) + "年前";
  }

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
    const height = 220;
    canvas.width = cssWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cssWidth, height };
  }

  // 値の範囲(range)から、1,2,5×10^nの「切りのいい数字」になる目盛り幅を決める
  function niceStep(range, targetTicks) {
    if (!(range > 0)) return 1;
    const roughStep = range / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    let niceNormalized;
    if (normalized <= 1) niceNormalized = 1;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 5) niceNormalized = 5;
    else niceNormalized = 10;
    return niceNormalized * magnitude;
  }

  // マイナス残高(目標支出で使い切った場合など)も表示できるよう、0を必ず範囲に含めつつ
  // 実際のデータの最小値・最大値に応じてyMin/yMaxを決める
  function computeScale(cssWidth, height, allX, allY) {
    const padL = 44, padR = 12, padT = 16, padB = 24;
    const plotW = cssWidth - padL - padR;
    const plotH = height - padT - padB;
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX, xMin + 1);

    const dataMin = Math.min(0, ...allY);
    const dataMax = Math.max(0, ...allY, 1);
    const step = niceStep(dataMax - dataMin, 5);
    const yMin = Math.floor(dataMin / step) * step;
    const yMax = Math.ceil(dataMax / step) * step;

    const xToPx = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
    const yToPx = (y) => padT + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;
    return { padL, padR, padT, padB, plotW, plotH, xMin, xMax, yMin, yMax, yStep: step, xToPx, yToPx };
  }

  function drawGridAndAxes(ctx, cssWidth, height, scale) {
    const { padL, padR, padT, plotW, plotH, xMin, xMax, yMin, yMax, yStep, xToPx, yToPx } = scale;
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px -apple-system, sans-serif";
    ctx.lineWidth = 1;
    const tickCount = Math.round((yMax - yMin) / yStep);
    for (let i = 0; i <= tickCount; i++) {
      const y = yMin + yStep * i;
      const py = yToPx(y);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(cssWidth - padR, py);
      ctx.stroke();
      ctx.fillText(manLabel(y), 2, py + 3);
    }

    const xTicks = [xMin, (xMin + xMax) / 2, xMax];
    ctx.textAlign = "center";
    xTicks.forEach((xv) => {
      ctx.fillText(yearLabel(Math.round(xv)), xToPx(xv), height - 6);
    });
    ctx.textAlign = "left";

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

    if (yMin < 0) {
      const py = yToPx(0);
      ctx.strokeStyle = COLORS.text;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(cssWidth - padR, py);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawCrosshair(ctx, scale, x) {
    const px = scale.xToPx(x);
    ctx.strokeStyle = COLORS.textStrong;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px, scale.padT);
    ctx.lineTo(px, scale.padT + scale.plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // goals: [{x,y,onTrack}] 目標マーカー(縦の破線+丸)を描画する
  function drawGoalMarkers(ctx, scale, goals) {
    goals.forEach((g) => {
      const px = scale.xToPx(g.x), py = scale.yToPx(g.y);
      const color = g.onTrack ? COLORS.goalOnTrack : COLORS.goalOff;
      ctx.strokeStyle = color;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, scale.padT);
      ctx.lineTo(px, scale.padT + scale.plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // markers: [{x,y,color,label}] 目標の時点で実際の予測額がいくらになるかを、常時見える点+ラベルで示す
  function drawValueMarkers(ctx, cssWidth, scale, markers) {
    markers.forEach((m) => {
      const px = scale.xToPx(m.x), py = scale.yToPx(m.y);

      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0b1120";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.font = "10px -apple-system, sans-serif";
      const textW = ctx.measureText(m.label).width;
      let tx = px - textW / 2;
      tx = Math.max(2, Math.min(cssWidth - textW - 2, tx));
      const ty = Math.max(scale.padT + 10, py - 8);

      ctx.fillStyle = "rgba(11, 17, 32, 0.85)";
      ctx.fillRect(tx - 3, ty - 10, textW + 6, 13);
      ctx.fillStyle = m.color;
      ctx.fillText(m.label, tx, ty);
    });
  }

  // points: [{x,y}] ラインの各データ点(1年ごと)に小さな丸印を打つ
  function drawLinePoints(ctx, scale, points, color) {
    ctx.fillStyle = color;
    points.forEach((p) => {
      const px = scale.xToPx(p.x), py = scale.yToPx(p.y);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // dots: [{x,y,color}] 選択位置に点を打つ(データ実座標)
  function drawDots(ctx, scale, dots) {
    dots.forEach((d) => {
      const px = scale.xToPx(d.x), py = scale.yToPx(d.y);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0b1120";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // lines: [{color, text}]
  function drawTooltip(ctx, cssWidth, scale, x, lines) {
    if (!lines.length) return;
    const px = scale.xToPx(x);
    const padding = 8;
    const lineHeight = 16;
    ctx.font = "11px -apple-system, sans-serif";
    const widths = lines.map((l) => ctx.measureText(l.text).width + (l.color ? 14 : 0));
    const boxW = Math.max(...widths) + padding * 2;
    const boxH = lines.length * lineHeight + padding * 2 - 2;
    let boxX = px + 10;
    if (boxX + boxW > cssWidth - 4) boxX = px - boxW - 10;
    if (boxX < 2) boxX = 2;
    const boxY = scale.padT + 4;

    ctx.fillStyle = COLORS.tooltipBg;
    ctx.strokeStyle = COLORS.tooltipBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    lines.forEach((l, i) => {
      const ty = boxY + padding + i * lineHeight + 8;
      let tx = boxX + padding;
      if (l.color) {
        ctx.fillStyle = l.color;
        ctx.beginPath();
        ctx.arc(tx + 3, ty - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        tx += 12;
      }
      ctx.fillStyle = COLORS.textStrong;
      ctx.fillText(l.text, tx, ty);
    });
  }

  // canvas上でのポインタ位置から、最も近い整数年を返す
  function yearFromEvent(evt, canvas, scale) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.clientX;
    const xCss = ((clientX - rect.left) / rect.width) * (canvas.width / (window.devicePixelRatio || 1));
    const dataX = scale.xMin + ((xCss - scale.padL) / scale.plotW) * (scale.xMax - scale.xMin);
    const clamped = Math.max(scale.xMin, Math.min(scale.xMax, dataX));
    return Math.round(clamped);
  }

  // repaint(year|null) を呼ぶポインタイベントを1つのcanvasに1回だけ登録する
  function attachInteraction(canvas, scale, repaint) {
    let dragging = false;
    const handleMove = (evt) => {
      const year = yearFromEvent(evt, canvas, scale);
      repaint(year);
      if (evt.cancelable) evt.preventDefault();
    };
    canvas.addEventListener("pointerdown", (evt) => {
      dragging = true;
      canvas.setPointerCapture(evt.pointerId);
      handleMove(evt);
    });
    canvas.addEventListener("pointermove", (evt) => {
      if (!dragging) return;
      handleMove(evt);
    });
    canvas.addEventListener("pointerup", () => { dragging = false; });
    canvas.addEventListener("pointercancel", () => { dragging = false; });
  }

  function nearestPoint(points, year) {
    if (!points.length) return null;
    let best = points[0];
    let bestDist = Math.abs(points[0].x - year);
    for (const p of points) {
      const d = Math.abs(p.x - year);
      if (d < bestDist) { best = p; bestDist = d; }
    }
    return best;
  }

  // series: [{x:number, y:number}] sorted by x ascending (required)
  // history: [{x:number, y:number}] optional, actual recorded points
  // goals: [{x:number, y:number, label:string, onTrack:boolean}] optional
  // projectionMarkers: [{x,y,color,label}] 目標時点の実際の予測額を常時表示する点
  function draw(canvas, { series, history = [], goals = [], projectionMarkers = [] }) {
    const { ctx, cssWidth, height } = setupCanvas(canvas);
    const allX = series.map((p) => p.x).concat(history.map((p) => p.x)).concat(goals.map((p) => p.x));
    const allY = series.map((p) => p.y).concat(history.map((p) => p.y)).concat(goals.map((p) => p.y));
    if (allX.length === 0) return;
    const scale = computeScale(cssWidth, height, allX, allY);

    function paint(selectedYear) {
      ctx.clearRect(0, 0, cssWidth, height);
      drawGridAndAxes(ctx, cssWidth, height, scale);

      if (series.length > 1) {
        ctx.strokeStyle = COLORS.projection;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        series.forEach((p, i) => {
          const px = scale.xToPx(p.x), py = scale.yToPx(p.y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.lineTo(scale.xToPx(series[series.length - 1].x), scale.yToPx(scale.yMin));
        ctx.lineTo(scale.xToPx(series[0].x), scale.yToPx(scale.yMin));
        ctx.closePath();
        ctx.fillStyle = "rgba(91, 141, 239, 0.08)";
        ctx.fill();
        drawLinePoints(ctx, scale, series, COLORS.projection);
      }

      if (history.length > 0) {
        const sortedHist = [...history].sort((a, b) => a.x - b.x);
        if (sortedHist.length > 1) {
          ctx.strokeStyle = COLORS.history;
          ctx.lineWidth = 2;
          ctx.beginPath();
          sortedHist.forEach((p, i) => {
            const px = scale.xToPx(p.x), py = scale.yToPx(p.y);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
        sortedHist.forEach((p) => {
          ctx.fillStyle = COLORS.history;
          ctx.beginPath();
          ctx.arc(scale.xToPx(p.x), scale.yToPx(p.y), 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      drawGoalMarkers(ctx, scale, goals);
      drawValueMarkers(ctx, cssWidth, scale, projectionMarkers);

      if (selectedYear !== null) {
        const seriesPoint = nearestPoint(series, selectedYear);
        const histPoint = nearestPoint(history, selectedYear);
        const useHist = histPoint && (!seriesPoint || Math.abs(histPoint.x - selectedYear) < Math.abs(seriesPoint.x - selectedYear));
        const picked = useHist ? histPoint : seriesPoint;
        if (picked) {
          drawCrosshair(ctx, scale, picked.x);
          drawDots(ctx, scale, [{ x: picked.x, y: picked.y, color: useHist ? COLORS.history : COLORS.projection }]);
          drawTooltip(ctx, cssWidth, scale, picked.x, [
            { text: yearLabel(picked.x) },
            { color: useHist ? COLORS.history : COLORS.projection, text: (useHist ? "実績 " : "予測 ") + manLabelPrecise(picked.y) }
          ]);
        }
      }
    }

    paint(null);
    attachInteraction(canvas, scale, paint);
  }

  // カテゴリ別の複数ラインを重ねて描画する(合計ラインは表示しない)
  // lines: [{ color, label, points: [{x,y}] }]
  // goals: [{x,y,onTrack}] 資金源がカテゴリ指定の目標マーカー
  // projectionMarkers: [{x,y,color,label}] 目標時点の実際の予測額を常時表示する点
  function drawMultiLine(canvas, { lines, goals = [], projectionMarkers = [] }) {
    const { ctx, cssWidth, height } = setupCanvas(canvas);
    const allPoints = lines.flatMap((l) => l.points).concat(goals);
    if (allPoints.length === 0) return;
    const scale = computeScale(cssWidth, height, allPoints.map((p) => p.x), allPoints.map((p) => p.y));

    function paint(selectedYear) {
      ctx.clearRect(0, 0, cssWidth, height);
      drawGridAndAxes(ctx, cssWidth, height, scale);

      lines.forEach((line) => {
        if (line.points.length < 2) return;
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        line.points.forEach((p, i) => {
          const px = scale.xToPx(p.x), py = scale.yToPx(p.y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        drawLinePoints(ctx, scale, line.points, line.color);
      });

      drawGoalMarkers(ctx, scale, goals);
      drawValueMarkers(ctx, cssWidth, scale, projectionMarkers);

      if (selectedYear !== null) {
        const picks = lines
          .map((line) => ({ line, point: nearestPoint(line.points, selectedYear) }))
          .filter((p) => p.point);
        if (picks.length) {
          const x = picks[0].point.x;
          drawCrosshair(ctx, scale, x);
          drawDots(ctx, scale, picks.map((p) => ({ x: p.point.x, y: p.point.y, color: p.line.color })));
          drawTooltip(ctx, cssWidth, scale, x, [
            { text: yearLabel(x) },
            ...picks.map((p) => ({ color: p.line.color, text: `${p.line.label} ${manLabelPrecise(p.point.y)}` }))
          ]);
        }
      }
    }

    paint(null);
    attachInteraction(canvas, scale, paint);
  }

  return { draw, drawMultiLine };
})();
