import React from 'react';
import TableRow from './Tablerow';
import { Plus } from 'lucide-react';

export default function TableComponent({ data, onAddRow, onUpdateRow, onDeleteRow }) {
    // Calculate average and standard deviation
    const AverageIncome = data.reduce((sum, row) => sum + Number(row.income || 0), 0) / data.length;
    const AverageExpenses = data.reduce((sum, row) => sum + Number(row.expenses || 0), 0) / data.length;
    const StdIncome = Math.sqrt(data.reduce((sum, row) => sum + Math.pow(Number(row.income || 0) - AverageIncome, 2), 0) / data.length);
    const StdExpenses = Math.sqrt(data.reduce((sum, row) => sum + Math.pow(Number(row.expenses || 0) - AverageExpenses, 2), 0) / data.length);

  return (
    <div className="overflow-x-auto">
      <h2 className="text-2xl font-semibold mb-6 text-slate-700">Monthly Financial Overview</h2>
      <table className="min-w-full divide-y divide-gray-200 bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider md:px-6">
              Month & Year
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider md:px-6">
              Income
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider md:px-6">
              Expenses
            </th>
            <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-slate-600 uppercase tracking-wider md:px-6">
              Actions
            </th>
          </tr>
        </thead>
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
        <tfoot>
          <tr className="bg-slate-50 border-t border-gray-200">
            <td className="px-4 py-3 text-right text-base font-semibold text-slate-700 md:px-6">Standard Deviations :</td>
            <td className="px-4 py-3 text-left text-base font-semibold text-blue-700 md:px-6">{StdIncome.toFixed(2)}</td>
            <td className="px-4 py-3 text-left text-base font-semibold text-blue-700 md:px-6">{StdExpenses.toFixed(2)}</td>
            <td className="px-4 py-3 text-center md:px-6"></td>
          </tr>
          <tr className="bg-slate-100 border-t border-gray-200">
            <td className="px-4 py-3 text-right text-lg font-bold text-slate-800 md:px-6">Average :</td>
            <td className={`px-4 py-3 text-left text-lg font-bold text-green-600 md:px-6`}>{AverageIncome.toFixed(2)}</td>
            <td className={`px-4 py-3 text-left text-lg font-bold text-red-600 md:px-6`}>{AverageExpenses.toFixed(2)}</td>
            <td className="px-4 py-3 text-center md:px-6"></td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-8 flex justify-center">
        <button
          onClick={onAddRow}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-2xl shadow-sm text-white bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
          Add New Month
        </button>
      </div>
    </div>
  );
}
