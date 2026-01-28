import React, { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/Button";
import { Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip);

function monteCarlo({ startingWealth, incomeAvg, incomeStd, expenseAvg, expenseStd, inflationRate, months, runs }) {
  const results = new Array(runs);
  for (let i = 0; i < runs; i++) {
    let wealth = startingWealth;
    for (let m = 0; m < months; m++) {
      const income = Math.max(randNormal(incomeAvg, incomeStd), 0);
      const expense = Math.max(randNormal(expenseAvg, expenseStd) * (1 + inflationRate / 100), 0);
      wealth += income - expense;
    }
    results[i] = wealth;
  }

  return results;
}

// Box–Muller transform
function randNormal(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function Page() {
  const [rows, setRows] = useState(undefined);
  const [startingWealth, setStartingWealth] = useState(0);
  const [inflationRate, setInflationRate] = useState(0.83);

  useEffect(() => {
    async function load() {
      const stored = await window.ipc.getStore("data");
      if (Array.isArray(stored)) setRows(stored);
    }
    load();
  }, []);

  const simulation = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const SCALE = 1_000_000;
 
    const incomes = rows.map(r => Number(r.income) / SCALE);
    const expenses = rows.map(r => Number(r.expenses) / SCALE);

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = arr => {
      const m = avg(arr);
      return Math.sqrt(
        arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1)
      );
    };


    const results = monteCarlo({
    startingWealth: startingWealth,
    incomeAvg: avg(incomes),
    incomeStd: std(incomes),
    expenseAvg: avg(expenses),
    expenseStd: std(expenses),
    inflationRate: inflationRate,
    months: 12,     
    runs: 100000,
    });

    results.sort((a, b) => a - b);

    return {
      results,
      mean: avg(results),
      median: results[Math.floor(results.length / 2)],
      p10: results[Math.floor(results.length * 0.1)],
      p90: results[Math.floor(results.length * 0.9)],
    };
  }, [rows, startingWealth, inflationRate]);

  if (!simulation) return <div className="p-4">Loading…</div>;

  // Histogram bins
  const bins = 50;
  const min = simulation.results[0];
  const max = simulation.results[simulation.results.length - 1];
  const step = (max - min) / bins;

  const counts = new Array(bins).fill(0);
  simulation.results.forEach(v => {
    const i = Math.min(Math.floor((v - min) / step), bins - 1);
    counts[i]++;
  });

  const chartData = {
labels: counts.map((_, i) =>
  (min + i * step).toFixed(2)
),
    datasets: [
      {
        label: "Final Wealth Distribution ",
        data: counts.map(c => c / simulation.results.length),
         backgroundColor: "rgba(35, 87, 171, 0.6)", // blue with transparency
      borderColor: "rgb(59, 130, 246)",
      borderWidth: 1,
      },
    ],
  };
  const options = {
  scales: {
    x: {
      title: {
        display: true,
        text: "Final Wealth (Millions) after 12 months",
      },
    },
    y: {
      title: {
        display: true,
        text: "Probability Density",
      },
    },
  },
};

  return (
    <div className="flex flex-col justify-center h-[calc(90vh)] p-10 gap-3">
      <div className="flex flex-row items-start gap-4">
       
        <div className="flex flex-col justify-center">
          <label htmlFor="startingWealth" className="text-md font-light">Starting Wealth (Millions)</label>
        <input
            id="startingWealth"
            type="number"
            value={startingWealth}
            onChange={e => setStartingWealth(Number(e.target.value))}
            className="border p-2 rounded-xl"
            placeholder="Starting Wealth (Millions)"
            aria-label="Starting Wealth in Millions"
          />
        </div>
        <div className="flex flex-col justify-center">
          <label htmlFor="inflationRate" className="text-md font-light">Inflation Rate</label>
        <input
            id="inflationRate"
            type="number"
            value={inflationRate}
            onChange={e => setInflationRate(Number(e.target.value))}
            className="border p-2 rounded-xl"
            placeholder="Inflation Rate"
            aria-label="Inflation Rate"
          />
        </div>
        <div className="text-sm text-center">
        <div>Mean: {simulation.mean.toFixed(2)}</div>
<div>Median: {simulation.median.toFixed(2)}</div>
<div>10–90% range: {simulation.p10.toFixed(2)} – {simulation.p90.toFixed(2)}</div>
      </div>
      </div>

      <Bar data={chartData} className="text-red-500" options={options} />
      <div className="flex flex-row justify-center gap-4">
       <Button onClick={() => (window.location.href = "/home")}>Back to Home</Button>
        <Button onClick={() => (window.location.href = "/montecarlo/page")}>Back to Data</Button>
      </div>
    </div>
  );
}

export default Page;
