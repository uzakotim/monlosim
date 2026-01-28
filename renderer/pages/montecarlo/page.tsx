import React, { useCallback, useEffect, useState } from "react";
import Button from "../../components/Button";
import TableComponent from "../../components/TableComponent";
import { format, addMonths, parse } from "date-fns";
import { Plus } from 'lucide-react';

function Page() {
  
  const [data, setData] = useState(undefined);

  // Load persisted data
  useEffect(() => {
    async function loadData() {
      const stored = await window.ipc.getStore("data");
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
    if (data !== undefined) window.ipc.setStore("data", data);
  }, [data]);

  const handleAddRow = useCallback(() => {
    const lastEntry = data[data.length - 1];
    let nextDate;

    if (lastEntry) {
      const lastEntryDate = parse(lastEntry.monthYear, "MMMM yyyy", new Date());
      nextDate = addMonths(lastEntryDate, 1);
    } else {
      nextDate = new Date();
    }

    const newRow = {
      id: Date.now(),
      monthYear: format(nextDate, "MMMM yyyy"),
      income: 0,
      expenses: 0,
    };

    setData((prevData) => [...prevData, newRow]);
  }, [data]);

  const handleUpdateRow = useCallback((id, field, value) => {
    setData((prevData) =>
      prevData.map((row) =>
        row.id === id ? { ...row, [field]: value } : row
      )
    );
  }, []);

  const handleDeleteRow = useCallback((id) => {
    setData((prevData) => prevData.filter((row) => row.id !== id));
  }, []);

  if (data === undefined) {
    return <div>Loading…</div>;
  }
  return (
    
      <div className="flex flex-col h-[calc(95vh)] gap-5 justify-center p-4">
        {/* Scrollable content */}
        <div className="flex-1 overflow-auto">
          <TableComponent
            data={data}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
          />
        </div>
        <div className="h-[15vh] flex flex-col items-center gap-2">
          <button
            onClick={handleAddRow}
            className="inline-flex cursor-pointer items-center px-6 py-3 border border-transparent text-base font-medium rounded-2xl shadow-sm text-white bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-200"
          >
            <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Add New Month
          </button>
          <div className="flex flex-row gap-5">
            <Button
              onClick={() => {
                window.location.href = "/home";
              }}
            >
              Back to Home
            </Button>
            <Button
              onClick={() => {
                window.location.href = "/simulation/page";
              }}
            >
              Run Simulation
            </Button>
          </div>
           
        </div>
      </div>
  );
}

export default Page;