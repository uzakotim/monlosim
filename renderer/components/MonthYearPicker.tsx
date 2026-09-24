import React, { useState, useEffect } from "react";

// Helper: parse "MMMM yyyy" → { month, year }
function parseMonthYear(str: string | undefined | null) {
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
function formatMonthYear({ month, year }: { month: number; year: number }) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

interface MonthYearPickerProps {
  value: string;
  onChange: (formatted: string) => void;
}

export default function MonthYearPicker({ value, onChange }: MonthYearPickerProps) {
  const parsed = typeof value === "string" ? parseMonthYear(value) : value;

  const now = new Date();
  const defaultMonth = parsed?.month ?? now.getMonth() + 1;
  const defaultYear = parsed?.year ?? now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  useEffect(() => {
    if (parsed) {
      setMonth(parsed.month);
      setYear(parsed.year);
    }
  }, [value]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Month"
        className="w-full rounded-xl border border-slate-200/90 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 text-xs md:text-sm p-2 bg-slate-50/50 hover:bg-white focus:bg-white text-slate-800 transition-all font-medium cursor-pointer"
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
        className="w-24 rounded-xl border border-slate-200/90 shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 text-xs md:text-sm p-2 bg-slate-50/50 hover:bg-white focus:bg-white text-slate-800 transition-all font-medium"
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
