import React from 'react';
import { Trash } from 'lucide-react';
import MonthYearPicker from './MonthYearPicker';


export default function TableRow({ row, onUpdate, onDelete }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    // Ensure value is a number, default to 0 if empty or invalid
    const numericValue = value === '' ? '' : parseFloat(value);
    onUpdate(row.id, name, numericValue);
  };

  return (
    <tr className="hover:bg-slate-50 transition-colors duration-150">
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 md:px-6">
        <MonthYearPicker
          value={row.monthYear}
          onChange={(updated) => onUpdate(row.id, "monthYear", updated)}
        />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 md:px-6">
        <input
          type="number"
          name="income"
          value={row.income === 0 ? '' : row.income}
          onChange={handleChange}
          placeholder="0.00"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-2 bg-white text-slate-800"
        />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 md:px-6">
        <input
          type="number"
          name="expenses"
          value={row.expenses === 0 ? '' : row.expenses}
          onChange={handleChange}
          placeholder="0.00"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-2 bg-white text-slate-800"
        />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium md:px-6">
        <button
          onClick={() => onDelete(row.id)}
          className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200"
          aria-label={`Delete row for ${row.monthYear}`}
        >
          <Trash className="h-5 w-5" />
        </button>
      </td>
    </tr>
  );
}
