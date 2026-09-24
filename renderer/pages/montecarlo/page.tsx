import React, { useCallback, useEffect, useState } from "react";
import Button from "../../components/Button";
import TableComponent from "../../components/TableComponent";
import { format, addMonths, parse } from "date-fns";
import { Plus, BarChart3, Home, FileJson, Calendar } from "lucide-react";

interface RowData {
  id: number;
  monthYear: string;
  income: number;
  expenses: number;
}

function Page() {
  const [data, setData] = useState<RowData[] | undefined>(undefined);
  const [currentFile, setCurrentFile] = useState<string>("store.json");

  // Load persisted data and current active file
  useEffect(() => {
    async function loadData() {
      try {
        const file = await (window as any).ipc.getCurrentFile();
        if (file) setCurrentFile(file);
      } catch (e) {
        console.error("Failed to get current file:", e);
      }

      const stored = await (window as any).ipc.getStore("data");
      if (stored && Array.isArray(stored)) {
        setData(stored);
      } else {
        const today = new Date();
        setData([
          {
            id: Date.now(),
            monthYear: format(today, "MMMM yyyy"),
            income: 0,
            expenses: 0,
          },
        ]);
      }
    }
    loadData();
  }, []);

  // Persist on every change
  useEffect(() => {
    if (data !== undefined) (window as any).ipc.setStore("data", data);
  }, [data]);

  const handleAddRow = useCallback(() => {
    if (!data) return;
    const lastEntry = data[data.length - 1];
    let nextDate: Date;

    if (lastEntry) {
      try {
        const lastEntryDate = parse(lastEntry.monthYear, "MMMM yyyy", new Date());
        nextDate = addMonths(lastEntryDate, 1);
      } catch {
        nextDate = new Date();
      }
    } else {
      nextDate = new Date();
    }

    const newRow: RowData = {
      id: Date.now(),
      monthYear: format(nextDate, "MMMM yyyy"),
      income: 0,
      expenses: 0,
    };

    setData((prevData) => (prevData ? [...prevData, newRow] : [newRow]));
  }, [data]);

  const handleUpdateRow = useCallback((id: number, field: string, value: any) => {
    setData((prevData) =>
      prevData
        ? prevData.map((row) =>
          row.id === id ? { ...row, [field]: value } : row
        )
        : prevData
    );
  }, []);

  const handleDeleteRow = useCallback((id: number) => {
    setData((prevData) =>
      prevData ? prevData.filter((row) => row.id !== id) : prevData
    );
  }, []);

  if (data === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-[75vh] gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">Loading dashboard records...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-full min-h-0 p-2 md:p-3 gap-3 overflow-hidden">
      {/* ── Top Header Card ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-700 rounded-xl hidden sm:flex">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span>Financial Data Dashboard</span>
            </h2>
            <p className="text-xs text-slate-500">
              Input monthly revenue and operational expenditure to fuel Monte Carlo simulations and MPC forecasts.
            </p>
          </div>
        </div>

        {/* Right side info and Add Month action */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs font-medium text-slate-600">
            <FileJson className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-slate-400">File:</span>
            <span className="font-semibold text-slate-800">{currentFile}</span>
          </div>

          <div className="px-2.5 py-1.5 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs font-semibold text-slate-600">
            {data.length} {data.length === 1 ? "month" : "months"}
          </div>

          <button
            onClick={handleAddRow}
            className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 shadow-xs transition-all duration-150 active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Month</span>
          </button>
        </div>
      </div>

      {/* ── Table & KPI Overview ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TableComponent
          data={data}
          onUpdateRow={handleUpdateRow}
          onDeleteRow={handleDeleteRow}
        />
      </div>

      {/* ── Bottom Navigation Bar ─────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-center py-1">
        <div className="text-xs text-slate-400 font-medium hidden sm:block">
          MonloSim Analytical Engine &bull; Auto-synced to storage
        </div>
        <div className="flex flex-row gap-3 ml-auto sm:ml-0">
          <Button onClick={() => (window.location.href = "/home")}>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Home className="w-4 h-4" />
              Back to Home
            </div>
          </Button>

          <Button
            variant="primary"
            onClick={() => (window.location.href = "/simulation/page")}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <BarChart3 className="w-4 h-4" />
              Run Simulation
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Page;