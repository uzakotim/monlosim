import React, { useState, useEffect } from "react";

// Helper: parse "MMMM yyyy" → { month, year }
function parseMonthYear(str) {
  if (!str) return null;
  try {
    const date = new Date(str);
    return {
      month: date.getMonth() + 1,
      year: date.getFullYear(),
    };
  } catch {
    return null;
  }
}

// Helper: format { month, year } → "MMMM yyyy"
function formatMonthYear({ month, year }) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function MonthYearPicker({ value, onChange }) {
  const parsed = typeof value === "string" ? parseMonthYear(value) : value;

  const now = new Date();
  const defaultMonth = parsed?.month ?? now.getMonth() + 1;
  const defaultYear = parsed?.year ?? now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Month"
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-2 bg-white text-slate-800"
        value={month}
        onChange={(e) => {
            const m = Number(e.target.value);
            setMonth(m);
            onChange?.(formatMonthYear({ month: m, year }));
        }}
      >
        {months.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>

      <input
        aria-label="Year"
        type="number"
        min={1900}
        max={3000}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-2 bg-white text-slate-800"
        value={year}
        onChange={(e) => {
            const y = Number(e.target.value);
            setYear(y);
            onChange?.(formatMonthYear({ month, year: y }));
        }}
      />
    </div>
  );
}

// Usage inside TableRow:
// <MonthYearPicker
//   value={row.monthYear} // e.g. "January 2024"
//   onChange={(formatted) => onUpdate(row.id, "monthYear", formatted)}
// />
