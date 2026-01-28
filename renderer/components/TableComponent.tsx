import React from 'react';
import TableRow from './Tablerow';

const format = (num) => {
  return num
    .toFixed(2)                 // 1234567.89 → "1234567.89"
    .replace(/\B(?=(\d{3})+(?!\d))/g, " "); // add spaces
};

export default function TableComponent({ data, onUpdateRow, onDeleteRow }) {
    // Calculate average and standard deviation
    const AverageIncome = data.reduce((sum, row) => sum + Number(row.income || 0), 0) / data.length;
    const AverageExpenses = data.reduce((sum, row) => sum + Number(row.expenses || 0), 0) / data.length;
    const StdIncome = Math.sqrt(data.reduce((sum, row) => sum + Math.pow(Number(row.income || 0) - AverageIncome, 2), 0) / data.length);
    const StdExpenses = Math.sqrt(data.reduce((sum, row) => sum + Math.pow(Number(row.expenses || 0) - AverageExpenses, 2), 0) / data.length);

  return (
    <div className="h-[72vh] flex flex-col p-5">
  <h2 className="text-2xl font-semibold mb-4 text-slate-700">
    Monthly Financial Overview
  </h2>

  {/* Outer table container: full height */}
  <div className="flex flex-col flex-1 border border-gray-200 rounded-xl shadow-sm bg-white overflow-hidden">

    {/* Header */}
    <table className="min-w-full table-fixed">
      <thead className="bg-slate-50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Month & Year</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Income</th>
          <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Expenses</th>
          <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
    </table>

    {/* Scrollable rows fill remaining space */}
    <div className="flex-1 overflow-y-auto">
      <table className="min-w-full table-fixed">
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => (
            <TableRow
              key={row.id}
              row={row}
              onUpdate={onUpdateRow}
              onDelete={onDeleteRow}
            />
          ))}
        </tbody>
      </table>
    </div>

    {/* Footer at bottom */}
    <table className="min-w-full table-fixed">
      <tfoot>
        <tr className="bg-slate-50 border-t border-gray-200">
          <td className="px-4 py-3 text-right text-base font-semibold text-slate-700">Standard Deviations :</td>
          <td className="px-4 py-3 text-left text-base font-semibold text-blue-700">{format(StdIncome)}</td>
          <td className="px-4 py-3 text-left text-base font-semibold text-blue-700">{format(StdExpenses)}</td>
          <td></td>
        </tr>

        <tr className=" bg-slate-100 border-t border-gray-200">
          <td className="px-4 py-3 text-right text-lg font-bold text-slate-800">Average :</td>
          <td className="px-4 py-3 text-left text-lg font-bold text-green-600"> {format(AverageIncome)}</td>
          <td className="px-4 py-3 text-left text-lg font-bold text-red-600"> {format(AverageExpenses)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

  </div>
</div>
  );
}
