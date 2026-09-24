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
import {
  BarChart3,
  TrendingUp,
  Target,
  LineChart,
  ArrowLeft,
  Home,
  DollarSign,
  PiggyBank,
  TrendingDown,
  Sparkles,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

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

interface LinearTrendResult {
  slope: number;
  intercept: number;
  trendValues: number[];
  growthPercent: number;
}

/** Computes least-squares linear trendline y = slope * x + intercept across the whole data */
function computeLinearTrend(values: number[]): LinearTrendResult {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, trendValues: [], growthPercent: 0 };
  if (n === 1) return { slope: 0, intercept: values[0], trendValues: [values[0]], growthPercent: 0 };

  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    num += dx * (values[i] - yMean);
    den += dx * dx;
  }

  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;

  const trendValues = values.map((_, i) => slope * i + intercept);
  const trendStart = trendValues[0];
  const trendEnd = trendValues[n - 1];
  const growthPercent = trendStart !== 0 ? ((trendEnd - trendStart) / Math.abs(trendStart)) * 100 : 0;

  return { slope, intercept, trendValues, growthPercent };
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

// ─── Scale helper ─────────────────────────────────────────────────────────────

function getScale(maxVal: number) {
  if (maxVal > 1e9) return { S: 1e9, label: "B" };
  if (maxVal > 1e6) return { S: 1e6, label: "M" };
  if (maxVal > 1e3) return { S: 1e3, label: "K" };
  return { S: 1, label: "" };
}

function formatNum(val: number, decimals: number = 2): string {
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── Types & MPC Engine ──────────────────────────────────────────────────────

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

type TabType = "montecarlo" | "mpc-capital" | "mpc-spending" | "trends";

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

  // MPC cost weights
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

  // 2. Forecast 12 months
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

  // Income P10/P90 for bottom bar chart error overlay
  const p10Inc: number[] = [];
  const p90Inc: number[] = [];
  for (let i = 0; i < NUM_FORECAST; i++) {
    const vals = simInc.map((s) => s[i]).sort((a, b) => a - b);
    p10Inc.push(pctOfSorted(vals, 0.1));
    p90Inc.push(pctOfSorted(vals, 0.9));
  }

  // 5. MPC: closed-form greedy receding-horizon
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
    stdExpenses,
    uFuture,
    p10Inc,
    p90Inc,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

function Page() {
  const [rows, setRows] = useState<Row[] | undefined>(undefined);
  const [startingWealth, setStartingWealth] = useState(0);
  const [inflationRate, setInflationRate] = useState(0.83);
  const [activeTab, setActiveTab] = useState<TabType>("montecarlo");
  const [trendViewMode, setTrendViewMode] = useState<"combined" | "curves" | "cumulative">("combined");
  const [showLinearTrends, setShowLinearTrends] = useState(true);
  const [useCurrentCapitalForMC, setUseCurrentCapitalForMC] = useState(true);

  // MPC params
  const [loaded, setLoaded] = useState(false);
  const [xRef, setXRef] = useState<number>(0);
  const [xMin, setXMin] = useState<number>(0);
  const [uMin, setUMin] = useState<number>(0);
  const [uMax, setUMax] = useState<number>(0);

  useEffect(() => {
    async function load() {
      const stored = await (window as any).ipc.getStore("data");
      if (Array.isArray(stored)) setRows(stored);
      const params = await (window as any).ipc.getStore("mpcParams");
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
    (window as any).ipc.setStore("mpcParams", {
      xInit: startingWealth,
      xRef,
      xMin,
      uMin,
      uMax,
    });
  }, [loaded, startingWealth, xRef, xMin, uMin, uMax]);

  // ── Current Accumulated Capital (end of historical records) ───────────────
  const currentCapital = useMemo(() => {
    if (!rows || rows.length === 0) return startingWealth;
    const netHistorical = rows.reduce(
      (sum, r) => sum + (Number(r.income) - Number(r.expenses)),
      0
    );
    return startingWealth + netHistorical;
  }, [rows, startingWealth]);

  // ── Monte Carlo Histogram Computation ──────────────────────────────────────
  const { simulation, SCALE, baseCapitalUsed } = useMemo(() => {
    if (!rows || rows.length === 0) return { simulation: null, SCALE: 1, baseCapitalUsed: 0 };

    const baseCapital = useCurrentCapitalForMC ? currentCapital : startingWealth;

    const maxIncome = Math.max(...rows.map((r) => Number(r.income)));
    const maxExpense = Math.max(...rows.map((r) => Number(r.expenses)));
    const maxValue = Math.max(
      maxIncome,
      maxExpense,
      Math.abs(startingWealth),
      Math.abs(currentCapital),
      Math.abs(baseCapital)
    );
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
      let wealth = baseCapital / SCALE;
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
      baseCapitalUsed: baseCapital,
      simulation: {
        results,
        mean: avg(results),
        median: results[Math.floor(results.length / 2)],
        p10: results[Math.floor(results.length * 0.1)],
        p90: results[Math.floor(results.length * 0.9)],
      },
    };
  }, [rows, startingWealth, currentCapital, useCurrentCapitalForMC, inflationRate]);

  // ── MPC Computation ────────────────────────────────────────────────────────
  const mpcResult = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    try {
      return computeMPC(rows, { xInit: startingWealth, xRef, xMin, uMin, uMax });
    } catch (e) {
      console.error("MPC calculation error:", e);
      return null;
    }
  }, [rows, startingWealth, xRef, xMin, uMin, uMax]);

  // ── Historical Trends Computation ──────────────────────────────────────────
  const trendsData = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const labels = rows.map((r) => shortLabel(r.monthYear));
    const incomes = rows.map((r) => Number(r.income));
    const expenses = rows.map((r) => Number(r.expenses));
    const netFlows = rows.map((r) => Number(r.income) - Number(r.expenses));

    // Cumulative net cashflow starting from startingWealth
    const cumulative: number[] = [];
    let running = startingWealth;
    for (let i = 0; i < rows.length; i++) {
      running += netFlows[i];
      cumulative.push(running);
    }

    // Linear regression trends across the entire dataset
    const incTrend = computeLinearTrend(incomes);
    const expTrend = computeLinearTrend(expenses);
    const slopeDiff = incTrend.slope - expTrend.slope;
    const isIncomeGrowingFaster = slopeDiff > 0;

    const totalIncome = incomes.reduce((a, b) => a + b, 0);
    const totalExpenses = expenses.reduce((a, b) => a + b, 0);
    const totalNet = totalIncome - totalExpenses;
    const avgMonthlyIncome = totalIncome / rows.length;
    const avgMonthlyExpenses = totalExpenses / rows.length;
    const avgMonthlyNet = totalNet / rows.length;
    const savingsRate = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0;
    const surplusMonthsCount = netFlows.filter((n) => n >= 0).length;

    // Scale determination
    const maxVal = Math.max(
      ...incomes,
      ...expenses,
      ...netFlows.map(Math.abs),
      ...cumulative.map(Math.abs)
    );
    const { S, label: sL } = getScale(maxVal);

    return {
      labels,
      incomes,
      expenses,
      netFlows,
      cumulative,
      incTrend,
      expTrend,
      slopeDiff,
      isIncomeGrowingFaster,
      totalIncome,
      totalExpenses,
      totalNet,
      avgMonthlyIncome,
      avgMonthlyExpenses,
      avgMonthlyNet,
      savingsRate,
      surplusMonthsCount,
      S,
      sL,
    };
  }, [rows, startingWealth]);

  // Loading state
  if (!rows || !simulation) {
    return (
      <div className="flex flex-col items-center justify-center h-[75vh] gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">Preparing financial simulation data...</p>
      </div>
    );
  }

  // Empty data state
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[75vh] gap-4 p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-xs max-w-md mx-auto">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
          <Layers className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800">No Historical Records Found</h3>
        <p className="text-sm text-slate-500">
          Please add at least one month of income and expense data to generate Monte Carlo distributions, MPC forecasts, and financial trends.
        </p>
        <Button onClick={() => (window.location.href = "/montecarlo/page")}>
          <div className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Go to Data Input
          </div>
        </Button>
      </div>
    );
  }

  const scaleLabel =
    SCALE === 1_000_000_000
      ? "billions"
      : SCALE === 1_000_000
        ? "millions"
        : SCALE === 1_000
          ? "thousands"
          : "units";

  // ─── 1. HISTOGRAM (Monte Carlo) Chart Config ──────────────────────────────
  const bins = 50;
  const hMin = simulation.results[0];
  const hMax = simulation.results[simulation.results.length - 1];
  const step = (hMax - hMin) / bins;
  const counts = new Array(bins).fill(0);
  simulation.results.forEach((v) => {
    const i = Math.min(Math.floor((v - hMin) / step), bins - 1);
    counts[i]++;
  });

  const histChartData = {
    labels: counts.map((_, i) => (hMin + i * step).toFixed(2)),
    datasets: [
      {
        label: `Final Wealth Distribution (${useCurrentCapitalForMC ? "from Current Capital" : "from Initial x₀"})`,
        data: counts.map((c) => (c / simulation.results.length) * 100),
        backgroundColor: "rgba(37, 99, 235, 0.65)",
        hoverBackgroundColor: "rgba(29, 78, 216, 0.85)",
        borderColor: "rgb(37, 99, 235)",
        borderWidth: 1.5,
        borderRadius: 4,
      },
    ],
  };

  const histOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    scales: {
      x: {
        grid: { color: "rgba(226, 232, 240, 0.6)" },
        title: {
          display: true,
          text: `Final Wealth after 12 months (starting from ${useCurrentCapitalForMC ? "Current Capital" : "Initial x₀"}: ${formatNum(baseCapitalUsed / SCALE)} in ${scaleLabel} SUM)`,
          font: { size: 12, weight: "bold" as const },
          color: "#475569",
        },
        ticks: { font: { size: 10 }, color: "#64748b" },
      },
      y: {
        grid: { color: "rgba(226, 232, 240, 0.6)" },
        title: {
          display: true,
          text: "Probability (%)",
          font: { size: 12, weight: "bold" as const },
          color: "#475569",
        },
        ticks: {
          font: { size: 10 },
          color: "#64748b",
          callback: (value: number | string) => `${Number(value).toFixed(1)}%`,
        },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        labels: { font: { size: 11, weight: "bold" as const }, color: "#334155" },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.9)",
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          title: (items: any) => `12M Projected Wealth: ~${items[0].label} ${scaleLabel}`,
          label: (ctx: any) => `Probability Density: ${Number(ctx.parsed.y).toFixed(2)}%`,
        },
      },
    },
  };

  // ─── 2. CAPITAL TRAJECTORY (MPC) Chart Config ──────────────────────────────
  let capitalData: any = null;
  let capitalOptions: any = null;
  let capScaleLabel = "";
  let capScaleDivider = 1;

  if (mpcResult) {
    const { T, xPast, xFuture, p10Cap, p90Cap, pastLabels, futureLabels } = mpcResult;
    const allCapVals = [...xPast, ...xFuture, ...p10Cap, ...p90Cap];
    const capMax = Math.max(...allCapVals.map(Math.abs));
    const { S, label: sL } = getScale(capMax);
    capScaleLabel = sL;
    capScaleDivider = S;

    const allLabels = [...pastLabels, ...futureLabels];
    const nPast = pastLabels.length;

    const histCapData: (number | null)[] = [
      ...xPast.slice(1).map((v) => v / S),
      ...Array(12).fill(null),
    ];
    const foreCapData: (number | null)[] = [
      ...Array(nPast - 1).fill(null),
      ...xFuture.map((v) => v / S),
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

    capitalData = {
      labels: allLabels,
      datasets: [
        {
          label: "P10 Floor",
          data: p10CapData,
          borderColor: "rgba(245, 158, 11, 0.4)",
          backgroundColor: "transparent",
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
          tension: 0.25,
        },
        {
          label: "P10–P90 Band (80% Confidence)",
          data: p90CapData,
          borderColor: "rgba(245, 158, 11, 0.4)",
          backgroundColor: "rgba(245, 158, 11, 0.14)",
          borderWidth: 1,
          pointRadius: 0,
          fill: "-1",
          tension: 0.25,
        },
        ...(xRef !== 0
          ? [
            {
              label: `Target x_ref (${(xRef / S).toFixed(1)}${sL})`,
              data: xRefLine,
              borderColor: "rgba(16, 185, 129, 0.85)",
              backgroundColor: "transparent",
              borderWidth: 1.8,
              borderDash: [7, 4],
              pointRadius: 0,
              fill: false,
            },
          ]
          : []),
        ...(xMin !== 0
          ? [
            {
              label: `Min Reserve x_min (${(xMin / S).toFixed(1)}${sL})`,
              data: xMinLine,
              borderColor: "rgba(239, 68, 68, 0.85)",
              backgroundColor: "transparent",
              borderWidth: 1.8,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false,
            },
          ]
          : []),
        {
          label: "Historical Capital",
          data: histCapData,
          borderColor: "#2563eb",
          backgroundColor: "#2563eb",
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.2,
        },
        {
          label: "MPC Forecast Capital (mean)",
          data: foreCapData,
          borderColor: "#d97706",
          backgroundColor: "#d97706",
          borderWidth: 2.5,
          borderDash: [6, 3],
          pointRadius: 3.5,
          pointStyle: "rect",
          pointHoverRadius: 6,
          fill: false,
          tension: 0.2,
        },
      ],
    };

    capitalOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: {
          position: "top" as const,
          labels: { font: { size: 11, weight: "500" as const }, color: "#334155" },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${sL} SUM`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(226, 232, 240, 0.6)" },
          ticks: { maxRotation: 45, minRotation: 30, font: { size: 9 }, color: "#64748b" },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.6)" },
          title: {
            display: true,
            text: `Capital (${sL} SUM)`,
            font: { size: 12, weight: "bold" as const },
            color: "#475569",
          },
          ticks: {
            font: { size: 10 },
            color: "#64748b",
            callback: (v: any) => `${Number(v).toFixed(1)}${sL}`,
          },
        },
      },
    };
  }

  // ─── 3. SPENDING PLAN & INCOME (MPC) Chart Config ─────────────────────────
  let inExpData: any = null;
  let inExpOptions: any = null;
  let planScaleLabel = "";
  let planScaleDivider = 1;

  if (mpcResult) {
    const {
      pastLabels,
      futureLabels,
      pastIncomes,
      pastExpenses,
      futureIncMean,
      uFuture,
      p10Inc,
      p90Inc,
    } = mpcResult;

    const allLabels = [...pastLabels, ...futureLabels];
    const nPast = pastLabels.length;

    const { S: bS, label: bL } = getScale(
      Math.max(...pastIncomes, ...pastExpenses, ...futureIncMean, ...uFuture)
    );
    planScaleLabel = bL;
    planScaleDivider = bS;

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

    inExpData = {
      labels: allLabels,
      datasets: [
        {
          type: "bar" as const,
          label: "Historical Income",
          data: incHistData,
          backgroundColor: "rgba(16, 185, 129, 0.82)",
          borderColor: "#059669",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          type: "bar" as const,
          label: "Historical Expense",
          data: expHistData,
          backgroundColor: "rgba(239, 68, 68, 0.82)",
          borderColor: "#dc2626",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          type: "bar" as const,
          label: "Forecast Income (mean ×1.05)",
          data: incForeData,
          backgroundColor: "rgba(110, 231, 183, 0.8)",
          borderColor: "#10b981",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          type: "bar" as const,
          label: "MPC Expense Plan u*",
          data: uPlanData,
          backgroundColor: "rgba(252, 165, 165, 0.85)",
          borderColor: "#ef4444",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          type: "line" as const,
          label: "Income P10 (Downside)",
          data: incP10Data,
          borderColor: "rgba(5, 150, 105, 0.9)",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 4,
          pointStyle: "triangle",
          fill: false,
        },
        {
          type: "line" as const,
          label: "Income P90 (Upside)",
          data: incP90Data,
          borderColor: "rgba(4, 120, 87, 0.9)",
          backgroundColor: "transparent",
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 4,
          pointStyle: "triangle",
          fill: false,
        },
      ],
    };

    inExpOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: {
          position: "top" as const,
          labels: { font: { size: 11, weight: "500" as const }, color: "#334155" },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${bL} SUM`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(226, 232, 240, 0.6)" },
          ticks: { maxRotation: 45, minRotation: 30, font: { size: 9 }, color: "#64748b" },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.6)" },
          title: {
            display: true,
            text: `Amount (${bL} SUM / month)`,
            font: { size: 12, weight: "bold" as const },
            color: "#475569",
          },
          ticks: {
            font: { size: 10 },
            color: "#64748b",
            callback: (v: any) => `${Number(v).toFixed(1)}${bL}`,
          },
        },
      },
    };
  }

  // ─── 4. INCOME & EXPENSE TRENDS (4th Graph) Chart Config ──────────────────
  let trendsChartData: any = null;
  let trendsChartOptions: any = null;

  if (trendsData) {
    const {
      labels,
      incomes,
      expenses,
      netFlows,
      cumulative,
      incTrend,
      expTrend,
      S,
      sL,
    } = trendsData;

    if (trendViewMode === "cumulative") {
      trendsChartData = {
        labels,
        datasets: [
          {
            type: "line" as const,
            label: `Cumulative Wealth / Saved (${sL} SUM)`,
            data: cumulative.map((v) => v / S),
            borderColor: "#4f46e5",
            backgroundColor: "rgba(79, 70, 229, 0.12)",
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#4f46e5",
            fill: true,
            tension: 0.25,
          },
        ],
      };
    } else {
      const netColors = netFlows.map((n) =>
        n >= 0 ? "rgba(37, 99, 235, 0.75)" : "rgba(239, 68, 68, 0.75)"
      );
      const netBorderColors = netFlows.map((n) => (n >= 0 ? "#1d4ed8" : "#b91c1c"));

      trendsChartData = {
        labels,
        datasets: [
          ...(trendViewMode === "combined"
            ? [
              {
                type: "bar" as const,
                label: "Net Cashflow (Income - Expenses)",
                data: netFlows.map((v) => v / S),
                backgroundColor: netColors,
                borderColor: netBorderColors,
                borderWidth: 1.5,
                borderRadius: 4,
                order: 3,
              },
            ]
            : []),
          {
            type: "line" as const,
            label: `Monthly Income (${sL} SUM)`,
            data: incomes.map((v) => v / S),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.08)",
            borderWidth: 2.8,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#10b981",
            fill: true,
            tension: 0.3,
            order: 1,
          },
          {
            type: "line" as const,
            label: `Monthly Expenses (${sL} SUM)`,
            data: expenses.map((v) => v / S),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            borderWidth: 2.8,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#ef4444",
            fill: true,
            tension: 0.3,
            order: 2,
          },
          ...(showLinearTrends && rows.length >= 2
            ? [
              {
                type: "line" as const,
                label: `Income Trendline (${trendsData.incTrend.slope >= 0 ? "+" : ""}${formatNum(trendsData.incTrend.slope / S)} ${sL}/mo)`,
                data: trendsData.incTrend.trendValues.map((v) => v / S),
                borderColor: "#047857",
                backgroundColor: "transparent",
                borderWidth: 2.5,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 5,
                fill: false,
                tension: 0,
                order: 0,
              },
              {
                type: "line" as const,
                label: `Expense Trendline (${trendsData.expTrend.slope >= 0 ? "+" : ""}${formatNum(trendsData.expTrend.slope / S)} ${sL}/mo)`,
                data: trendsData.expTrend.trendValues.map((v) => v / S),
                borderColor: "#b91c1c",
                backgroundColor: "transparent",
                borderWidth: 2.5,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 5,
                fill: false,
                tension: 0,
                order: 0,
              },
            ]
            : []),
        ],
      };
    }

    trendsChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: {
          position: "top" as const,
          labels: { font: { size: 11, weight: "500" as const }, color: "#334155" },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${sL} SUM`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(226, 232, 240, 0.6)" },
          ticks: { maxRotation: 45, minRotation: 30, font: { size: 9 }, color: "#64748b" },
        },
        y: {
          grid: { color: "rgba(226, 232, 240, 0.6)" },
          title: {
            display: true,
            text: `Amount (${sL} SUM)`,
            font: { size: 12, weight: "bold" as const },
            color: "#475569",
          },
          ticks: {
            font: { size: 10 },
            color: "#64748b",
            callback: (v: any) => `${Number(v).toFixed(1)}${sL}`,
          },
        },
      },
    };
  }

  // ── Tab items definition ──────────────────────────────────────────────────
  const tabItems = [
    {
      id: "montecarlo" as TabType,
      label: "Wealth Distribution",
      badge: "Monte Carlo",
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      id: "mpc-capital" as TabType,
      label: "Capital Trajectory",
      badge: "MPC",
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: "mpc-spending" as TabType,
      label: "Spending Plan",
      badge: "MPC",
      icon: <Target className="w-4 h-4" />,
    },
    {
      id: "trends" as TabType,
      label: "Trends Over Time",
      badge: "History",
      icon: <LineChart className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full p-2 md:p-3 gap-3">
      {/* ── Top Header & Tab Navigation ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span>Financial Simulation &amp; Optimization</span>
          </h2>
          <p className="text-xs text-slate-500">
            Select a screen to view probability distributions, optimal control trajectories, or historical trends.
          </p>
        </div>

        {/* Tab switcher buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 overflow-x-auto">
          {tabItems.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200 font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <span className={isActive ? "text-blue-600" : "text-slate-400"}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold"
                      : "bg-slate-200/70 text-slate-500"
                  }`}
                >
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Contextual Controls Bar ───────────────────────────────────────── */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
          {/* Controls tailored to active tab */}
          <div className="flex flex-row items-end gap-3 flex-wrap">
            {/* Initial Capital (used by MC, MPC Capital, MPC Spending, Cumulative Trend) */}
            <div className="flex flex-col">
              <label
                htmlFor="startingWealth"
                className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1"
              >
                <span>Initial Capital x₀</span>
                <span className="text-slate-400 font-normal">({scaleLabel})</span>
              </label>
              <input
                id="startingWealth"
                type="number"
                value={SCALE > 1 ? startingWealth / SCALE : startingWealth}
                onChange={(e) => setStartingWealth(Number(e.target.value) * SCALE)}
                className="border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2 rounded-xl text-sm w-36 bg-slate-50/50"
              />
            </div>

            {/* Tab 1: Monte Carlo specific controls */}
            {activeTab === "montecarlo" && (
              <>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-700 mb-1">
                    Simulation Starting Base
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setUseCurrentCapitalForMC(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        useCurrentCapitalForMC
                          ? "bg-white text-blue-700 shadow-xs font-semibold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Current Capital ({formatNum(currentCapital / SCALE)} {scaleLabel})
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseCurrentCapitalForMC(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        !useCurrentCapitalForMC
                          ? "bg-white text-blue-700 shadow-xs font-semibold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Initial x₀ ({formatNum(startingWealth / SCALE)} {scaleLabel})
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label
                    htmlFor="inflationRate"
                    className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1"
                  >
                    <span>Monthly Inflation</span>
                    <span className="text-slate-400 font-normal">(%)</span>
                  </label>
                  <input
                    id="inflationRate"
                    type="number"
                    step="0.05"
                    value={inflationRate}
                    onChange={(e) => setInflationRate(Number(e.target.value))}
                    className="border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2 rounded-xl text-sm w-28 bg-slate-50/50"
                  />
                </div>
              </>
            )}

            {/* Tab 2: MPC Capital Trajectory controls */}
            {activeTab === "mpc-capital" && (
              <>
                <div className="flex flex-col">
                  <label
                    htmlFor="xRef"
                    className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1"
                  >
                    <span>Target Capital x_ref</span>
                    <span className="text-slate-400 font-normal">({scaleLabel})</span>
                  </label>
                  <input
                    id="xRef"
                    type="number"
                    value={SCALE > 1 ? xRef / SCALE : xRef}
                    onChange={(e) => setXRef(Number(e.target.value) * SCALE)}
                    className="border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2 rounded-xl text-sm w-36 bg-slate-50/50"
                  />
                </div>
                <div className="flex flex-col">
                  <label
                    htmlFor="xMin"
                    className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1"
                  >
                    <span>Min Reserve x_min</span>
                    <span className="text-slate-400 font-normal">({scaleLabel})</span>
                  </label>
                  <input
                    id="xMin"
                    type="number"
                    value={SCALE > 1 ? xMin / SCALE : xMin}
                    onChange={(e) => setXMin(Number(e.target.value) * SCALE)}
                    className="border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2 rounded-xl text-sm w-36 bg-slate-50/50"
                  />
                </div>
              </>
            )}

            {/* Tab 3: MPC Spending Plan controls */}
            {activeTab === "mpc-spending" && (
              <>
                <div className="flex flex-col">
                  <label
                    htmlFor="uMin"
                    className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1"
                  >
                    <span>Min Expense u_min</span>
                    <span className="text-slate-400 font-normal">({scaleLabel})</span>
                  </label>
                  <input
                    id="uMin"
                    type="number"
                    value={SCALE > 1 ? uMin / SCALE : uMin}
                    onChange={(e) => setUMin(Number(e.target.value) * SCALE)}
                    className="border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2 rounded-xl text-sm w-36 bg-slate-50/50"
                  />
                </div>
                <div className="flex flex-col">
                  <label
                    htmlFor="uMax"
                    className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1"
                  >
                    <span>Max Expense u_max</span>
                    <span className="text-slate-400 font-normal">(0 = ∞)</span>
                  </label>
                  <input
                    id="uMax"
                    type="number"
                    value={SCALE > 1 ? uMax / SCALE : uMax}
                    onChange={(e) => setUMax(Number(e.target.value) * SCALE)}
                    className="border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2 rounded-xl text-sm w-36 bg-slate-50/50"
                  />
                </div>
              </>
            )}

            {/* Tab 4: Historical Trends view toggles */}
            {activeTab === "trends" && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-700 mb-1">
                    Display View
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setTrendViewMode("combined")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        trendViewMode === "combined"
                          ? "bg-white text-blue-700 shadow-xs font-semibold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Curves + Net Bars
                    </button>
                    <button
                      onClick={() => setTrendViewMode("curves")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        trendViewMode === "curves"
                          ? "bg-white text-blue-700 shadow-xs font-semibold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Income vs Expense
                    </button>
                    <button
                      onClick={() => setTrendViewMode("cumulative")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        trendViewMode === "cumulative"
                          ? "bg-white text-indigo-700 shadow-xs font-semibold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Cumulative Net Wealth
                    </button>
                  </div>
                </div>

                {trendViewMode !== "cumulative" && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 mt-5 select-none bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition-colors">
                    <input
                      type="checkbox"
                      checked={showLinearTrends}
                      onChange={(e) => setShowLinearTrends(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Show Overall Trendlines</span>
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Quick Summary Badge for current screen */}
          <div className="text-xs text-slate-500 flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            {activeTab === "montecarlo" && (
              <span>100,000 iterations over 12 months with normal income/expense perturbations.</span>
            )}
            {activeTab === "mpc-capital" && (
              <span>Closed-form Receding Horizon Control trajectory balancing goal attainment &amp; safety.</span>
            )}
            {activeTab === "mpc-spending" && (
              <span>Calculated optimal monthly spending u* against P10/P90 log-normal income bounds.</span>
            )}
            {activeTab === "trends" && (
              <span>Historical income &amp; expense trends with linear slope fit to compare growth velocities.</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Key Performance Indicators (KPI) Strip ───────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {activeTab === "montecarlo" && (
          <>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Starting Capital Base
              </span>
              <p className="text-lg font-bold text-blue-600 mt-0.5">
                {formatNum(baseCapitalUsed / SCALE)}{" "}
                <span className="text-xs font-medium text-slate-500">{scaleLabel}</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">
                {useCurrentCapitalForMC ? "Current Capital (Today)" : "Initial Capital x₀"}
              </span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Mean Wealth (+12M)
              </span>
              <p className="text-lg font-bold text-slate-800 mt-0.5">
                {formatNum(simulation.mean)}{" "}
                <span className="text-xs font-medium text-slate-500">{scaleLabel}</span>
              </p>
              <span className="text-[11px] text-emerald-600 font-medium">
                Net Δ: {simulation.mean >= baseCapitalUsed / SCALE ? "+" : ""}
                {formatNum(simulation.mean - baseCapitalUsed / SCALE)} {scaleLabel}
              </span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Median (P50)
              </span>
              <p className="text-lg font-bold text-slate-800 mt-0.5">
                {formatNum(simulation.median)}{" "}
                <span className="text-xs font-medium text-slate-500">{scaleLabel}</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">50% Probability Point</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Downside Risk (P10)
              </span>
              <p className="text-lg font-bold text-amber-600 mt-0.5">
                {formatNum(simulation.p10)}{" "}
                <span className="text-xs font-medium text-slate-500">{scaleLabel}</span>
              </p>
              <span className="text-[11px] text-amber-600 font-medium">90% Runs Exceed This</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Upside Potential (P90)
              </span>
              <p className="text-lg font-bold text-emerald-600 mt-0.5">
                {formatNum(simulation.p90)}{" "}
                <span className="text-xs font-medium text-slate-500">{scaleLabel}</span>
              </p>
              <span className="text-[11px] text-emerald-600 font-medium">Top 10% Outcome</span>
            </div>
          </>
        )}

        {activeTab === "mpc-capital" && mpcResult && (
          <>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Current Capital
              </span>
              <p className="text-lg font-bold text-blue-600 mt-0.5">
                {formatNum(mpcResult.xCurrent / capScaleDivider)}{" "}
                <span className="text-xs font-medium text-slate-500">{capScaleLabel}</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">Historical Baseline</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                12M Forecast Capital
              </span>
              <p className="text-lg font-bold text-amber-600 mt-0.5">
                {formatNum(mpcResult.xFuture[12] / capScaleDivider)}{" "}
                <span className="text-xs font-medium text-slate-500">{capScaleLabel}</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">With MPC Plan</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Target Capital x_ref
              </span>
              <p className="text-lg font-bold text-emerald-600 mt-0.5">
                {xRef > 0 ? formatNum(xRef / capScaleDivider) : "—"}{" "}
                <span className="text-xs font-medium text-slate-500">{xRef > 0 ? capScaleLabel : ""}</span>
              </p>
              <span className="text-[11px] text-emerald-600 font-medium">Optimization Reference</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                P10 Conservative (12M)
              </span>
              <p className="text-lg font-bold text-slate-700 mt-0.5">
                {formatNum(mpcResult.p10Cap[12] / capScaleDivider)}{" "}
                <span className="text-xs font-medium text-slate-500">{capScaleLabel}</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">Downside 10th Percentile</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Reserve Safety Buffer
              </span>
              <p className="text-lg font-bold text-slate-700 mt-0.5">
                {xMin > 0
                  ? formatNum((mpcResult.xCurrent - xMin) / capScaleDivider)
                  : "Unconstrained"}{" "}
                <span className="text-xs font-medium text-slate-500">{xMin > 0 ? capScaleLabel : ""}</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">Margin Above x_min</span>
            </div>
          </>
        )}

        {activeTab === "mpc-spending" && mpcResult && (
          <>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Avg Planned Spend u*
              </span>
              <p className="text-lg font-bold text-red-600 mt-0.5">
                {formatNum(arrAvg(mpcResult.uFuture) / planScaleDivider)}{" "}
                <span className="text-xs font-medium text-slate-500">{planScaleLabel} / mo</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">MPC Optimal Budget</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Historical Avg Expenses
              </span>
              <p className="text-lg font-bold text-slate-700 mt-0.5">
                {formatNum(arrAvg(mpcResult.pastExpenses) / planScaleDivider)}{" "}
                <span className="text-xs font-medium text-slate-500">{planScaleLabel} / mo</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">Past Actual Spend</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Planned Spend Change
              </span>
              {(() => {
                const past = arrAvg(mpcResult.pastExpenses);
                const planned = arrAvg(mpcResult.uFuture);
                const diffPct = past > 0 ? ((planned - past) / past) * 100 : 0;
                return (
                  <>
                    <p
                      className={`text-lg font-bold mt-0.5 ${
                        diffPct <= 0 ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {diffPct >= 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`}
                    </p>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {diffPct <= 0 ? "Spending Reduced" : "Spending Expanded"}
                    </span>
                  </>
                );
              })()}
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Projected Avg Income
              </span>
              <p className="text-lg font-bold text-emerald-600 mt-0.5">
                {formatNum(arrAvg(mpcResult.futureIncMean) / planScaleDivider)}{" "}
                <span className="text-xs font-medium text-slate-500">{planScaleLabel} / mo</span>
              </p>
              <span className="text-[11px] text-emerald-600 font-medium">With +5% Growth</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Forecast Net Savings
              </span>
              {(() => {
                const net =
                  arrAvg(mpcResult.futureIncMean) - arrAvg(mpcResult.uFuture);
                return (
                  <>
                    <p
                      className={`text-lg font-bold mt-0.5 ${
                        net >= 0 ? "text-blue-600" : "text-red-600"
                      }`}
                    >
                      {formatNum(net / planScaleDivider)}{" "}
                      <span className="text-xs font-medium text-slate-500">{planScaleLabel}</span>
                    </p>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {net >= 0 ? "Monthly Surplus" : "Monthly Deficit"}
                    </span>
                  </>
                );
              })()}
            </div>
          </>
        )}

        {activeTab === "trends" && trendsData && (
          <>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Income Growth Trend
              </span>
              <p className="text-lg font-bold text-emerald-600 mt-0.5">
                {trendsData.incTrend.slope >= 0 ? "+" : ""}
                {formatNum(trendsData.incTrend.slope / trendsData.S)}{" "}
                <span className="text-xs font-medium text-slate-500">{trendsData.sL} SUM/mo</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">
                Overall fit: {trendsData.incTrend.growthPercent >= 0 ? "+" : ""}
                {trendsData.incTrend.growthPercent.toFixed(1)}% total
              </span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Expense Growth Trend
              </span>
              <p className="text-lg font-bold text-red-600 mt-0.5">
                {trendsData.expTrend.slope >= 0 ? "+" : ""}
                {formatNum(trendsData.expTrend.slope / trendsData.S)}{" "}
                <span className="text-xs font-medium text-slate-500">{trendsData.sL} SUM/mo</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">
                Overall fit: {trendsData.expTrend.growthPercent >= 0 ? "+" : ""}
                {trendsData.expTrend.growthPercent.toFixed(1)}% total
              </span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Growth Velocity Verdict
              </span>
              <p
                className={`text-lg font-bold mt-0.5 flex items-center gap-1 ${
                  trendsData.isIncomeGrowingFaster ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {trendsData.isIncomeGrowingFaster ? (
                  <>
                    <ArrowUpRight className="w-5 h-5 shrink-0" />
                    <span>Income Faster</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-5 h-5 shrink-0" />
                    <span>Expenses Faster</span>
                  </>
                )}
              </p>
              <span
                className={`text-[11px] font-semibold ${
                  trendsData.isIncomeGrowingFaster ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                Net: {trendsData.slopeDiff >= 0 ? "+" : ""}
                {formatNum(trendsData.slopeDiff / trendsData.S)} {trendsData.sL} SUM/mo
              </span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Net Cumulative Savings
              </span>
              <p
                className={`text-lg font-bold mt-0.5 ${
                  trendsData.totalNet >= 0 ? "text-blue-600" : "text-red-600"
                }`}
              >
                {formatNum(trendsData.totalNet / trendsData.S)}{" "}
                <span className="text-xs font-medium text-slate-500">{trendsData.sL} SUM</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium">
                Savings Margin: {trendsData.savingsRate.toFixed(1)}%
              </span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Cashflow Health
              </span>
              <p className="text-lg font-bold text-slate-800 mt-0.5">
                {trendsData.surplusMonthsCount} / {rows.length}{" "}
                <span className="text-xs font-medium text-slate-500">months</span>
              </p>
              <span className="text-[11px] text-emerald-600 font-medium">
                Positive Cashflow Months
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Active Chart Screen ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-[460px] bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 flex flex-col">
        {/* Header of the active screen */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg">
              {activeTab === "montecarlo" && <BarChart3 className="w-5 h-5" />}
              {activeTab === "mpc-capital" && <TrendingUp className="w-5 h-5" />}
              {activeTab === "mpc-spending" && <Target className="w-5 h-5" />}
              {activeTab === "trends" && <LineChart className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {activeTab === "montecarlo" && "Final Wealth Probability Distribution (12-Month Monte Carlo)"}
                {activeTab === "mpc-capital" && "Capital Trajectory: Historical Evolution + MPC Forecast with P10–P90 Band"}
                {activeTab === "mpc-spending" && "Income & Expenditure Profile + MPC Optimized Spending Plan (u*)"}
                {activeTab === "trends" && "Historical Financial Trends: Income, Expenditure & Linear Fit Trendlines"}
              </h3>
              <p className="text-xs text-slate-400">
                {activeTab === "montecarlo" && "Visualizes the dispersion of final outcomes and tail risks across 100k random stochastic trials."}
                {activeTab === "mpc-capital" && "Tracks capital progression with reference tracking (x_ref) and reserve boundary constraints (x_min)."}
                {activeTab === "mpc-spending" && "Balances consumption smoothing with probabilistic revenue expectations."}
                {activeTab === "trends" && "Compares income velocity vs expense growth slopes over the entire historical horizon."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === "montecarlo" && (
              <span className="text-xs px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 border bg-blue-50 text-blue-700 border-blue-200">
                <span>
                  Predicting +12 months from{" "}
                  <strong>
                    {useCurrentCapitalForMC ? "Current Capital" : "Initial x₀"}:{" "}
                    {formatNum(baseCapitalUsed / SCALE)} {scaleLabel} SUM
                  </strong>
                </span>
              </span>
            )}
            {activeTab === "trends" && trendsData && (
              <span
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 border ${
                  trendsData.isIncomeGrowingFaster
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {trendsData.isIncomeGrowingFaster ? (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Income growing faster (+{formatNum(trendsData.slopeDiff / trendsData.S)} {trendsData.sL}/mo pace)</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Expenses growing faster (-{formatNum(Math.abs(trendsData.slopeDiff) / trendsData.S)} {trendsData.sL}/mo pace)</span>
                  </>
                )}
              </span>
            )}
            <div className="text-xs text-slate-400 font-medium hidden sm:block">
              {rows.length} Historical Records
            </div>
          </div>
        </div>

        {/* Graph Canvas Container */}
        <div className="flex-1 w-full min-h-[380px] relative">
          {activeTab === "montecarlo" && (
            <Bar key="montecarlo-chart" data={histChartData} options={histOptions as any} />
          )}

          {activeTab === "mpc-capital" && (
            mpcResult && capitalData ? (
              <Line key="capital-chart" data={capitalData} options={capitalOptions as any} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                MPC could not be evaluated. Please verify historical data rows.
              </div>
            )
          )}

          {activeTab === "mpc-spending" && (
            mpcResult && inExpData ? (
              <Chart key="spending-chart" type="bar" data={inExpData} options={inExpOptions as any} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                MPC spending plan requires at least one month of historical data.
              </div>
            )
          )}

          {activeTab === "trends" && (
            trendsChartData ? (
              <Chart key="trends-chart" type="bar" data={trendsChartData} options={trendsChartOptions as any} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Insufficient trend data.
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Bottom Navigation Bar ─────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-center py-1">
        <div className="text-xs text-slate-400 font-medium">
          MonloSim Analytical Engine &bull; {rows.length} Active Data Points
        </div>
        <div className="flex flex-row gap-3">
          <Button onClick={() => (window.location.href = "/montecarlo/page")}>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <ArrowLeft className="w-4 h-4" />
              Back to Data
            </div>
          </Button>
          <Button onClick={() => (window.location.href = "/home")}>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Home className="w-4 h-4" />
              Back to Home
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Page;
