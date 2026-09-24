import React from "react";
import TableRow from "./Tablerow";
import { ArrowUpRight, ArrowDownRight, Layers } from "lucide-react";

interface RowData {
  id: number;
  monthYear: string;
  income: number | string;
  expenses: number | string;
}

interface TableComponentProps {
  data: RowData[];
  onUpdateRow: (id: number, field: string, value: any) => void;
  onDeleteRow: (id: number) => void;
}

const formatNumber = (num: number): string => {
  if (isNaN(num)) return "0.00";
  return num
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

export default function TableComponent({
  data,
  onUpdateRow,
  onDeleteRow,
}: TableComponentProps) {
  const count = data.length;

  const totalIncome = data.reduce((sum, row) => sum + Number(row.income || 0), 0);
  const totalExpenses = data.reduce((sum, row) => sum + Number(row.expenses || 0), 0);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  const averageIncome = count > 0 ? totalIncome / count : 0;
  const averageExpenses = count > 0 ? totalExpenses / count : 0;

  const stdIncome =
    count > 1
      ? Math.sqrt(
          data.reduce(
            (sum, row) => sum + Math.pow(Number(row.income || 0) - averageIncome, 2),
            0
          ) / count
        )
      : 0;

  const stdExpenses =
    count > 1
      ? Math.sqrt(
          data.reduce(
            (sum, row) => sum + Math.pow(Number(row.expenses || 0) - averageExpenses, 2),
            0
          ) / count
        )
      : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden">
      {/* ── Dashboard KPI Summary Cards Strip ───────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Income
          </span>
          <p className="text-lg font-bold text-emerald-600 mt-0.5 truncate tabular-nums">
            {formatNumber(totalIncome)} <span className="text-xs font-medium text-slate-500">SUM</span>
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Across {count} months
          </span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Expenses
          </span>
          <p className="text-lg font-bold text-red-600 mt-0.5 truncate tabular-nums">
            {formatNumber(totalExpenses)} <span className="text-xs font-medium text-slate-500">SUM</span>
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Across {count} months
          </span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Net Cashflow
          </span>
          <p
            className={`text-lg font-bold mt-0.5 truncate flex items-center gap-1 tabular-nums ${
              netSavings >= 0 ? "text-blue-600" : "text-red-600"
            }`}
          >
            {netSavings >= 0 ? (
              <ArrowUpRight className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <ArrowDownRight className="w-4 h-4 shrink-0 text-red-600" />
            )}
            <span>{formatNumber(netSavings)}</span>
            <span className="text-xs font-medium text-slate-500">SUM</span>
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Margin: {savingsRate.toFixed(1)}%
          </span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Average Income
          </span>
          <p className="text-lg font-bold text-slate-800 mt-0.5 truncate tabular-nums">
            {formatNumber(averageIncome)} <span className="text-xs font-medium text-slate-500">SUM</span>
          </p>
          <span className="text-[11px] text-blue-600 font-medium">
            Std Dev: ±{formatNumber(stdIncome)}
          </span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Average Expenses
          </span>
          <p className="text-lg font-bold text-slate-800 mt-0.5 truncate tabular-nums">
            {formatNumber(averageExpenses)} <span className="text-xs font-medium text-slate-500">SUM</span>
          </p>
          <span className="text-[11px] text-blue-600 font-medium">
            Std Dev: ±{formatNumber(stdExpenses)}
          </span>
        </div>
      </div>

      {/* ── Table Card Container (Scrollable & Fits Screen) ─────────────── */}
      <div className="flex flex-col flex-1 min-h-0 border border-slate-200/90 rounded-2xl shadow-xs bg-white overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <table className="min-w-full table-fixed border-collapse">
            {/* Sticky Table Header */}
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200/90 shadow-2xs">
              <tr>
                <th className="w-[34%] px-3 md:px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-50">
                  Month &amp; Year
                </th>
                <th className="w-[25%] px-3 md:px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-50">
                  Income (SUM)
                </th>
                <th className="w-[25%] px-3 md:px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-50">
                  Expenses (SUM)
                </th>
                <th className="w-[16%] px-3 md:px-5 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-50">
                  Actions
                </th>
              </tr>
            </thead>

            {/* Scrollable Table Body */}
            {count > 0 ? (
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.map((row) => (
                  <TableRow
                    key={row.id}
                    row={row}
                    onUpdate={onUpdateRow}
                    onDelete={onDeleteRow}
                  />
                ))}
              </tbody>
            ) : null}

            {/* Sticky Table Summary Footer */}
            {count > 0 && (
              <tfoot className="sticky bottom-0 z-10 border-t border-slate-200/90 shadow-xs">
                <tr className="bg-slate-50/95 border-b border-slate-200/60 text-xs backdrop-blur-xs">
                  <td className="w-[34%] px-3 md:px-5 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wider">
                    Std Deviation:
                  </td>
                  <td className="w-[25%] px-3 md:px-5 py-2.5 text-left font-semibold text-blue-700 tabular-nums">
                    ± {formatNumber(stdIncome)}
                  </td>
                  <td className="w-[25%] px-3 md:px-5 py-2.5 text-left font-semibold text-blue-700 tabular-nums">
                    ± {formatNumber(stdExpenses)}
                  </td>
                  <td className="w-[16%]"></td>
                </tr>

                <tr className="bg-slate-100/95 text-sm backdrop-blur-xs">
                  <td className="w-[34%] px-3 md:px-5 py-2.5 text-right font-bold text-slate-700">
                    Average / Month:
                  </td>
                  <td className="w-[25%] px-3 md:px-5 py-2.5 text-left font-bold text-emerald-600 tabular-nums">
                    {formatNumber(averageIncome)}
                  </td>
                  <td className="w-[25%] px-3 md:px-5 py-2.5 text-left font-bold text-red-600 tabular-nums">
                    {formatNumber(averageExpenses)}
                  </td>
                  <td className="w-[16%]"></td>
                </tr>
              </tfoot>
            )}
          </table>

          {count === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
              <Layers className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-medium">No records yet. Click &quot;Add New Month&quot; to begin.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
