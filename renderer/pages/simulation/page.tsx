import React, { useEffect, useMemo, useState } from "react";
import Button from "../../components/Button";
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Title,
} from "chart.js";
import { Bar, Chart, Line } from "react-chartjs-2";
import { addMonths, format, parse } from "date-fns";

ChartJS.register(
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Title
);

// ─── Utility Math ────────────────────────────────────────────────────────────

/** Box–Muller normal sample */
function randNormal(mean: number, std: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** LogNormal sample with given mean & std (moment-matched) */
function randLogNormal(mean: number, std: number): number {
  if (mean <= 0) return 0;
  const cv = std / mean;
  const sigmaLog = Math.sqrt(Math.log(1 + cv * cv));
  const muLog = Math.log(mean) - 0.5 * sigmaLog * sigmaLog;
  return Math.exp(randNormal(muLog, sigmaLog));
}

function arrAvg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function arrStd(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = arrAvg(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function shortLabel(monthYear: string): string {
  return monthYear
    .replace("January", "Jan")
    .replace("February", "Feb")
    .replace("March", "Mar")
    .replace("April", "Apr")
    .replace("June", "Jun")
    .replace("July", "Jul")
    .replace("August", "Aug")
    .replace("September", "Sep")
    .replace("October", "Oct")
    .replace("November", "Nov")
    .replace("December", "Dec");
}

function pctOfSorted(sorted: number[], p: number): number {
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

// ─── MPC Engine ──────────────────────────────────────────────────────────────

interface MpcParams {
  xInit: number;
  xRef: number;
  xMin: number;
  uMin: number;
  uMax: number; // 0 = unconstrained
}

interface Row {
  id: number;
  monthYear: string;
  income: number;
  expenses: number;
}

function computeMPC(rows: Row[], params: MpcParams) {
  const { xInit, xRef, xMin, uMin, uMax } = params;
  const T = rows.length;
  if (T === 0) return null;

  const pastIncomes = rows.map((r) => Number(r.income));
  const pastExpenses = rows.map((r) => Number(r.expenses));
  const pastLabels = rows.map((r) => shortLabel(r.monthYear));

  const monthlyYield = 0.0;
  const NUM_FORECAST = 12;
  const NUM_SIM = 5000;

  // MPC cost weights (same as Python)
  const q = 0.5,
    wU = 0.4,
    r = 0.1,
    penaltyW = 200.0;

  // 1. Historical capital trajectory
  const xPast = new Array(T + 1).fill(0) as number[];
  xPast[0] = xInit;
  for (let k = 0; k < T; k++) {
    xPast[k + 1] = xPast[k] * (1 + monthlyYield) + pastIncomes[k] - pastExpenses[k];
  }
  const xCurrent = xPast[T];

  // 2. Forecast 12 months — for each future month, average historical rows
  //    with the same calendar month name, then apply 5 %/6 % growth.
  const lastDate = parse(rows[T - 1].monthYear, "MMMM yyyy", new Date());
  const futureLabels: string[] = [];
  const futureIncMean: number[] = [];
  const futureExpBase: number[] = [];
  const globalAvgInc = arrAvg(pastIncomes);
  const globalAvgExp = arrAvg(pastExpenses);

  for (let i = 0; i < NUM_FORECAST; i++) {
    const fDate = addMonths(lastDate, i + 1);
    futureLabels.push(shortLabel(format(fDate, "MMMM yyyy")));
    const mName = format(fDate, "MMMM");
    const same = rows.filter((rw) => rw.monthYear.startsWith(mName));
    const baseInc = same.length > 0 ? arrAvg(same.map((rw) => Number(rw.income))) : globalAvgInc;
    const baseExp = same.length > 0 ? arrAvg(same.map((rw) => Number(rw.expenses))) : globalAvgExp;
    futureIncMean.push(baseInc * 1.05);
    futureExpBase.push(baseExp * 1.06);
  }

  // 3. Coefficient of variation → std per forecast month
  const cvInc = arrAvg(pastIncomes) > 0 ? arrStd(pastIncomes) / arrAvg(pastIncomes) : 0.25;
  const cvExp = arrAvg(pastExpenses) > 0 ? arrStd(pastExpenses) / arrAvg(pastExpenses) : 0.25;
  const stdIncomes = futureIncMean.map((m) => m * cvInc);
  const stdExpenses = futureExpBase.map((m) => m * cvExp);

  // 4. Monte Carlo (LogNormal) for incomes & expenses
  const simInc: number[][] = [];
  for (let s = 0; s < NUM_SIM; s++) {
    simInc.push(futureIncMean.map((m, i) => randLogNormal(m, stdIncomes[i])));
  }

  // Income P10/P90 for the bottom bar chart error overlay
  const p10Inc: number[] = [];
  const p90Inc: number[] = [];
  for (let i = 0; i < NUM_FORECAST; i++) {
    const vals = simInc.map((s) => s[i]).sort((a, b) => a - b);
    p10Inc.push(pctOfSorted(vals, 0.1));
    p90Inc.push(pctOfSorted(vals, 0.9));
  }

  // 5. MPC: closed-form greedy receding-horizon (one step ahead, analytically optimal)
  //    cost: q*(x_next - x_ref)^2 + wU*(u - u_base)^2 + r*(u - u_prev)^2
  //          + penaltyW*max(0, x_min - x_next)^2
  //    x_next = x_k + income_k - u   (monthly_yield=0 for simplicity)
  //    ∂J/∂u = 0  →  two-case closed form
  const uFuture: number[] = [];
  const xFuture: number[] = [xCurrent];
  const effectiveUMax = uMax > 0 ? uMax : 1e15;

  for (let k = 0; k < NUM_FORECAST; k++) {
    const inc = futureIncMean[k];
    const uBase = futureExpBase[k];
    const uPrev = k > 0 ? uFuture[k - 1] : pastExpenses[T - 1] ?? 0;
    const A = xFuture[k] + inc;

    // Case 1 — no penalty term
    const u1 = (q * (A - xRef) + wU * uBase + r * uPrev) / (q + wU + r);
    let u: number;
    if (A - u1 >= xMin) {
      u = u1;
    } else {
      // Case 2 — penalty active (x_next would fall below x_min)
      u = (q * (A - xRef) + wU * uBase + r * uPrev + penaltyW * (A - xMin)) /
        (q + wU + r + penaltyW);
    }

    u = Math.max(uMin, Math.min(effectiveUMax, u));
    uFuture.push(u);
    xFuture.push(xFuture[k] * (1 + monthlyYield) + inc - u);
  }

  // 6. Capital Monte Carlo with the MPC plan applied
  //    Accumulate percentile data column-by-column to save memory
  const simCapCols: number[][] = Array.from({ length: NUM_FORECAST + 1 }, () => []);
  for (let s = 0; s < NUM_SIM; s++) {
    let xs = xCurrent;
    simCapCols[0].push(xs);
    for (let k = 0; k < NUM_FORECAST; k++) {
      xs = xs * (1 + monthlyYield) + simInc[s][k] - uFuture[k];
      simCapCols[k + 1].push(xs);
    }
  }

  const p10Cap: number[] = [];
  const p90Cap: number[] = [];
  for (let i = 0; i <= NUM_FORECAST; i++) {
    const sorted = simCapCols[i].sort((a, b) => a - b);
    p10Cap.push(pctOfSorted(sorted, 0.1));
    p90Cap.push(pctOfSorted(sorted, 0.9));
  }

  return {
    T,
    xPast,
    xFuture,
    p10Cap,
    p90Cap,
    xCurrent,
    pastLabels,
    futureLabels,
    pastIncomes,
    pastExpenses,
    futureIncMean,
    futureExpBase,
    stdIncomes,
    uFuture,
    p10Inc,
    p90Inc,
  };
}

// ─── Scale helper ─────────────────────────────────────────────────────────────

function getScale(maxVal: number) {
  if (maxVal > 1e9) return { S: 1e9, label: "B" };
  if (maxVal > 1e6) return { S: 1e6, label: "M" };
  if (maxVal > 1e3) return { S: 1e3, label: "K" };
  return { S: 1, label: "" };
}

// ─── Component ───────────────────────────────────────────────────────────────

function Page() {
  const [rows, setRows] = useState<Row[] | undefined>(undefined);
  const [startingWealth, setStartingWealth] = useState(0);
  const [inflationRate, setInflationRate] = useState(0.83);
  const [showProgression, setShowProgression] = useState(false);

  // MPC params
  const [loaded, setLoaded] = useState(false);
  const [xRef, setXRef] = useState<number>(0);
  const [xMin, setXMin] = useState<number>(0);
  const [uMin, setUMin] = useState<number>(0);
  const [uMax, setUMax] = useState<number>(0);

  useEffect(() => {
    async function load() {
      const stored = await window.ipc.getStore("data");
      if (Array.isArray(stored)) setRows(stored);
      const params = await window.ipc.getStore("mpcParams");
      if (params) {
        if (typeof params.xInit === "number") setStartingWealth(params.xInit);
        if (typeof params.xRef === "number") setXRef(params.xRef);
        if (typeof params.xMin === "number") setXMin(params.xMin);
        if (typeof params.uMin === "number") setUMin(params.uMin);
        if (typeof params.uMax === "number") setUMax(params.uMax);
      }
      setLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.ipc.setStore("mpcParams", {
      xInit: startingWealth,
      xRef,
      xMin,
      uMin,
      uMax,
    });

  }, [loaded, startingWealth, xRef, xMin, uMin, uMax]);
  // ── Monte Carlo histogram (existing) ──────────────────────────────────────
  const { simulation, SCALE } = useMemo(() => {
    if (!rows || rows.length === 0) return { simulation: null, SCALE: 1 };

    const maxIncome = Math.max(...rows.map((r) => Number(r.income)));
    const maxExpense = Math.max(...rows.map((r) => Number(r.expenses)));
    const maxValue = Math.max(maxIncome, maxExpense);
    let SCALE = 1;
    if (maxValue > 1_000_000_000) SCALE = 1_000_000_000;
    else if (maxValue > 1_000_000) SCALE = 1_000_000;
    else if (maxValue > 1_000) SCALE = 1_000;

    const incomes = rows.map((r) => Number(r.income) / SCALE);
    const expenses = rows.map((r) => Number(r.expenses) / SCALE);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr: number[]) => {
      const m = avg(arr);
      return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
    };

    const results: number[] = [];
    for (let i = 0; i < 100000; i++) {
      let wealth = startingWealth / SCALE;
      for (let m = 0; m < 12; m++) {
        const income = Math.max(randNormal(avg(incomes), std(incomes)), 0);
        const expense = Math.max(
          randNormal(avg(expenses), std(expenses)) * (1 + inflationRate / 100),
          0
        );
        wealth += income - expense;
      }
      results.push(wealth);
    }
    results.sort((a, b) => a - b);

    return {
      SCALE,
      simulation: {
        results,
        mean: avg(results),
        median: results[Math.floor(results.length / 2)],
        p10: results[Math.floor(results.length * 0.1)],
        p90: results[Math.floor(results.length * 0.9)],
      },
    };
  }, [rows, startingWealth, inflationRate]);

  // ── MPC computation ───────────────────────────────────────────────────────
  const mpcResult = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    try {
      return computeMPC(rows, { xInit: startingWealth, xRef, xMin, uMin, uMax });
    } catch (e) {
      console.error("MPC error:", e);
      return null;
    }
  }, [rows, startingWealth, xRef, xMin, uMin, uMax]);

  if (!simulation) return <div className="p-4">Loading…</div>;

  // ── Histogram chart data ──────────────────────────────────────────────────
  const bins = 50;
  const hMin = simulation.results[0];
  const hMax = simulation.results[simulation.results.length - 1];
  const step = (hMax - hMin) / bins;
  const counts = new Array(bins).fill(0);
  simulation.results.forEach((v) => {
    const i = Math.min(Math.floor((v - hMin) / step), bins - 1);
    counts[i]++;
  });
  const scaleLabel =
    SCALE === 1_000_000_000
      ? "billions"
      : SCALE === 1_000_000
        ? "millions"
        : SCALE === 1_000
          ? "thousands"
          : "units";

  const histChartData = {
    labels: counts.map((_, i) => (hMin + i * step).toFixed(2)),
    datasets: [
      {
        label: "Final Wealth Distribution",
        data: counts.map((c) => (c / simulation.results.length) * 1000),
        backgroundColor: "rgba(35, 87, 171, 0.6)",
        borderColor: "rgb(59, 130, 246)",
        borderWidth: 1,
      },
    ],
  };
  const histOptions = {
    scales: {
      x: { title: { display: true, text: `Final Wealth after 12 months (in ${scaleLabel})` } },
      y: {
        title: { display: true, text: "Probability (%)" },
        ticks: {
          callback: (value: number | string) => `${value}%`,
        },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number } }) =>
            `${ctx.parsed.y.toFixed(2)}%`,
        },
      },
    },
  };

  // ── Build MPC charts ──────────────────────────────────────────────────────
  let capitalChartEl: React.ReactNode = null;
  let inExpChartEl: React.ReactNode = null;

  if (mpcResult) {
    const {
      T,
      xPast,
      xFuture,
      p10Cap,
      p90Cap,
      pastLabels,
      futureLabels,
      pastIncomes,
      pastExpenses,
      futureIncMean,
      uFuture,
      p10Inc,
      p90Inc,
    } = mpcResult;

    // Determine display scale from capital values
    const allCapVals = [...xPast, ...xFuture, ...p10Cap, ...p90Cap];
    const capMax = Math.max(...allCapVals.map(Math.abs));
    const { S, label: sL } = getScale(capMax);

    const allLabels = [...pastLabels, ...futureLabels]; // T + 12 labels
    const nPast = pastLabels.length; // = T

    // ── Capital line chart ─────────────────────────────────────────────────
    // Historical: xPast[1..T] at positions 0..T-1 (end-of-month capitals)
    // Forecast:   xFuture[0..12] at positions T-1..T+11 (overlap at T-1 for continuity)
    // Band:       p10Cap/p90Cap same positions as forecast

    const histCapData: (number | null)[] = [
      ...xPast.slice(1).map((v) => v / S),           // indices 0..T-1
      ...Array(12).fill(null),
    ];

    // Forecast starts at index nPast-1 so lines connect
    const foreCapData: (number | null)[] = [
      ...Array(nPast - 1).fill(null),
      ...xFuture.map((v) => v / S),                  // xFuture[0..12] → indices T-1..T+11
    ];

    const p10CapData: (number | null)[] = [
      ...Array(nPast - 1).fill(null),
      ...p10Cap.map((v) => v / S),
    ];
    const p90CapData: (number | null)[] = [
      ...Array(nPast - 1).fill(null),
      ...p90Cap.map((v) => v / S),
    ];

    const xRefLine = allLabels.map(() => xRef / S);
    const xMinLine = allLabels.map(() => xMin / S);

    const capitalData = {
      labels: allLabels,
      datasets: [
        // ── Band (rendered first / underneath) ──────────────────────────
        {
          label: "P10 Capital",
          data: p10CapData,
          borderColor: "rgba(255,127,14,0.35)",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          tension: 0.25,
        },
        {
          label: "P10–P90 Band",
          data: p90CapData,
          borderColor: "rgba(255,127,14,0.35)",
          backgroundColor: "rgba(255,127,14,0.15)",
          borderWidth: 1,
          pointRadius: 0,
          fill: "-1" as any,
          tension: 0.25,
        },
        // ── Reference lines ─────────────────────────────────────────────
        ...(xRef !== 0
          ? [
            {
              label: `Target (${(xRef / S).toFixed(1)}${sL})`,
              data: xRefLine,
              borderColor: "rgba(44,160,44,0.75)",
              backgroundColor: "transparent",
              borderWidth: 1.5,
              borderDash: [7, 4],
              pointRadius: 0,
              fill: false,
            },
          ]
          : []),
        ...(xMin !== 0
          ? [
            {
              label: `Min Reserve (${(xMin / S).toFixed(1)}${sL})`,
              data: xMinLine,
              borderColor: "rgba(214,39,40,0.65)",
              backgroundColor: "transparent",
              borderWidth: 1.5,
              borderDash: [3, 3],
              pointRadius: 0,
              fill: false,
            },
          ]
          : []),
        // ── Main lines ──────────────────────────────────────────────────
        {
          label: "Historical Capital",
          data: histCapData,
          borderColor: "#1f77b4",
          backgroundColor: "#1f77b4",
          borderWidth: 2.5,
          pointRadius: 3,
          fill: false,
          tension: 0.2,
        },
        {
          label: "MPC Forecast Capital (mean)",
          data: foreCapData,
          borderColor: "#ff7f0e",
          backgroundColor: "#ff7f0e",
          borderWidth: 2.5,
          borderDash: [6, 3],
          pointRadius: 3,
          pointStyle: "rect" as any,
          fill: false,
          tension: 0.2,
        },
      ],
    };

    const capitalOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { position: "top" as const, labels: { font: { size: 10 } } },
        title: {
          display: true,
          text: "Capital Trajectory: History + MPC Forecast (P10–P90 Probabilistic Band)",
          font: { size: 12, weight: "bold" as const },
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)} ${sL} SUM`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 60, minRotation: 45, font: { size: 8 } },
        },
        y: {
          title: { display: true, text: `Capital (${sL} SUM)` },
          ticks: { callback: (v: any) => `${Number(v).toFixed(1)}${sL}` },
        },
      },
    };

    capitalChartEl = (
      <div style={{ height: "100%", width: "100%" }}>
        <Line data={capitalData} options={capitalOptions as any} />
      </div>
    );

    // ── Income / Expense mixed bar+line chart ──────────────────────────────
    const { S: bS, label: bL } = getScale(
      Math.max(
        ...pastIncomes,
        ...pastExpenses,
        ...futureIncMean,
        ...uFuture
      )
    );

    const incHistData: (number | null)[] = [
      ...pastIncomes.map((v) => v / bS),
      ...Array(12).fill(null),
    ];
    const expHistData: (number | null)[] = [
      ...pastExpenses.map((v) => v / bS),
      ...Array(12).fill(null),
    ];
    const incForeData: (number | null)[] = [
      ...Array(nPast).fill(null),
      ...futureIncMean.map((v) => v / bS),
    ];
    const uPlanData: (number | null)[] = [
      ...Array(nPast).fill(null),
      ...uFuture.map((v) => v / bS),
    ];
    const incP10Data: (number | null)[] = [
      ...Array(nPast).fill(null),
      ...p10Inc.map((v) => v / bS),
    ];
    const incP90Data: (number | null)[] = [
      ...Array(nPast).fill(null),
      ...p90Inc.map((v) => v / bS),
    ];

    const inExpData = {
      labels: allLabels,
      datasets: [
        {
          type: "bar" as const,
          label: "Historical Income",
          data: incHistData,
          backgroundColor: "rgba(44,160,44,0.82)",
          borderColor: "#2ca02c",
          borderWidth: 1,
        },
        {
          type: "bar" as const,
          label: "Historical Expense",
          data: expHistData,
          backgroundColor: "rgba(214,39,40,0.82)",
          borderColor: "#d62728",
          borderWidth: 1,
        },
        {
          type: "bar" as const,
          label: "Forecast Income (mean ×1.05)",
          data: incForeData,
          backgroundColor: "rgba(152,223,138,0.9)",
          borderColor: "#2ca02c",
          borderWidth: 1,
        },
        {
          type: "bar" as const,
          label: "MPC Expense Plan u*",
          data: uPlanData,
          backgroundColor: "rgba(255,152,150,0.9)",
          borderColor: "#d62728",
          borderWidth: 1,
        },
        {
          type: "line" as const,
          label: "Forecast Income P10",
          data: incP10Data,
          borderColor: "rgba(0,128,0,0.75)",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 4,
          pointStyle: "triangle" as any,
          fill: false,
        },
        {
          type: "line" as const,
          label: "Forecast Income P90",
          data: incP90Data,
          borderColor: "rgba(0,100,0,0.75)",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 4,
          pointStyle: "triangle" as any,
          fill: false,
        },
      ],
    };

    const inExpOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { position: "top" as const, labels: { font: { size: 10 } } },
        title: {
          display: true,
          text: "Income & Expense History + MPC Planned Spending (u*) with P10/P90 Forecast Range",
          font: { size: 12, weight: "bold" as const },
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)} ${bL} SUM`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 60, minRotation: 45, font: { size: 8 } },
        },
        y: {
          title: { display: true, text: `Amount (${bL} SUM / month)` },
          ticks: { callback: (v: any) => `${Number(v).toFixed(1)}${bL}` },
        },
      },
    };

    inExpChartEl = (
      <div style={{ height: "100%", width: "100%" }}>
        <Chart type="bar" data={inExpData as any} options={inExpOptions as any} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(92vh)] p-6 gap-3">
      {/* ── Controls row ─────────────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-start gap-4 flex-wrap">
        <div className="flex flex-row items-end gap-3 flex-wrap">
          {/* Always-visible: starting wealth */}
          <div className="flex flex-col">
            <label htmlFor="startingWealth" className="text-xs font-medium text-gray-600 mb-1">
              Initial Capital x₀ ({scaleLabel})
            </label>
            <input
              id="startingWealth"
              type="number"
              value={SCALE > 1 ? startingWealth / SCALE : startingWealth}
              onChange={(e) => setStartingWealth(Number(e.target.value) * SCALE)}
              className="border border-gray-300 p-2 rounded-xl text-sm w-36"
            />
          </div>

          {/* Histogram-only param */}
          {!showProgression && (
            <div className="flex flex-col">
              <label htmlFor="inflationRate" className="text-xs font-medium text-gray-600 mb-1">
                Inflation (monthly %)
              </label>
              <input
                id="inflationRate"
                type="number"
                value={inflationRate}
                onChange={(e) => setInflationRate(Number(e.target.value))}
                className="border border-gray-300 p-2 rounded-xl text-sm w-32"
              />
            </div>
          )}

          {/* MPC-only params */}
          {showProgression && (
            <>
              <div className="flex flex-col">
                <label htmlFor="xRef" className="text-xs font-medium text-gray-600 mb-1">
                  Target Capital x_ref ({scaleLabel})
                </label>
                <input
                  id="xRef"
                  type="number"
                  value={SCALE > 1 ? xRef / SCALE : xRef}
                  onChange={(e) => setXRef(Number(e.target.value) * SCALE)}
                  className="border border-gray-300 p-2 rounded-xl text-sm w-36"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="xMin" className="text-xs font-medium text-gray-600 mb-1">
                  Min Reserve x_min ({scaleLabel})
                </label>
                <input
                  id="xMin"
                  type="number"
                  value={SCALE > 1 ? xMin / SCALE : xMin}
                  onChange={(e) => setXMin(Number(e.target.value) * SCALE)}
                  className="border border-gray-300 p-2 rounded-xl text-sm w-36"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="uMin" className="text-xs font-medium text-gray-600 mb-1">
                  Min Expense u_min ({scaleLabel})
                </label>
                <input
                  id="uMin"
                  type="number"
                  value={SCALE > 1 ? uMin / SCALE : uMin}
                  onChange={(e) => setUMin(Number(e.target.value) * SCALE)}
                  className="border border-gray-300 p-2 rounded-xl text-sm w-36"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="uMax" className="text-xs font-medium text-gray-600 mb-1">
                  Max Expense u_max ({scaleLabel}, 0=∞)
                </label>
                <input
                  id="uMax"
                  type="number"
                  value={SCALE > 1 ? uMax / SCALE : uMax}
                  onChange={(e) => setUMax(Number(e.target.value) * SCALE)}
                  className="border border-gray-300 p-2 rounded-xl text-sm w-36"
                />
              </div>
            </>
          )}

          {/* Stats strip */}
          <div className="text-xs text-gray-500 flex flex-col justify-end pb-2 ml-2">
            <div>Mean: {simulation.mean.toFixed(2)}</div>
            <div>Median: {simulation.median.toFixed(2)}</div>
            <div>
              P10–P90: {simulation.p10.toFixed(2)} – {simulation.p90.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-medium text-gray-600">
            Wealth progression &amp; MPC control
          </span>
          <Button onClick={() => setShowProgression(!showProgression)}>
            {showProgression ? "Hide MPC" : "Show MPC"}
          </Button>
        </div>
      </div>

      {/* ── Chart area ───────────────────────────────────────────────────── */}
      {showProgression ? (
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 min-h-0">
          {mpcResult ? (
            <>
              <div style={{ height: "380px", minHeight: "280px" }}>{capitalChartEl}</div>
              <div style={{ height: "380px", minHeight: "280px" }}>{inExpChartEl}</div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Not enough data to run MPC. Please add at least 1 month of income / expense data.
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Bar data={histChartData} options={histOptions} />
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <div className="flex flex-row justify-center gap-4">
        <Button onClick={() => (window.location.href = "/home")}>Back to Home</Button>
        <Button onClick={() => (window.location.href = "/montecarlo/page")}>Back to Data</Button>
      </div>
    </div>
  );
}

export default Page;
