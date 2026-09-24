import React from "react";
import { Trash2 } from "lucide-react";
import MonthYearPicker from "./MonthYearPicker";

interface RowData {
  id: number;
  monthYear: string;
  income: number | string;
  expenses: number | string;
}

interface TableRowProps {
  row: RowData;
  onUpdate: (id: number, field: string, value: any) => void;
  onDelete: (id: number) => void;
}

export default function TableRow({ row, onUpdate, onDelete }: TableRowProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericValue = value === "" ? "" : parseFloat(value);
    onUpdate(row.id, name, numericValue);
  };

  return (
    <tr className="hover:bg-slate-50/80 transition-colors duration-150 group">
      <td className="w-[34%] px-3 md:px-5 py-2.5 whitespace-nowrap text-sm text-slate-700">
        <MonthYearPicker
          value={row.monthYear}
          onChange={(updated) => onUpdate(row.id, "monthYear", updated)}
        />
      </td>
      <td className="w-[25%] px-3 md:px-5 py-2.5 whitespace-nowrap text-sm">
        <div className="relative">
          <input
            type="number"
            name="income"
            value={row.income === 0 ? "" : row.income}
            onChange={handleChange}
            placeholder="0.00"
            className="w-full rounded-xl border border-slate-200/90 shadow-2xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 text-xs md:text-sm p-2 bg-slate-50/50 hover:bg-white focus:bg-white text-slate-800 font-semibold tabular-nums tracking-tight transition-all"
          />
        </div>
      </td>
      <td className="w-[25%] px-3 md:px-5 py-2.5 whitespace-nowrap text-sm">
        <div className="relative">
          <input
            type="number"
            name="expenses"
            value={row.expenses === 0 ? "" : row.expenses}
            onChange={handleChange}
            placeholder="0.00"
            className="w-full rounded-xl border border-slate-200/90 shadow-2xs focus:border-red-500 focus:ring-2 focus:ring-red-500/15 text-xs md:text-sm p-2 bg-slate-50/50 hover:bg-white focus:bg-white text-slate-800 font-semibold tabular-nums tracking-tight transition-all"
          />
        </div>
      </td>
      <td className="w-[16%] px-3 md:px-5 py-2.5 whitespace-nowrap text-center text-sm font-medium">
        <button
          onClick={() => onDelete(row.id)}
          className="text-slate-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all duration-150 cursor-pointer inline-flex items-center justify-center"
          aria-label={`Delete row for ${row.monthYear}`}
          title="Delete row"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
