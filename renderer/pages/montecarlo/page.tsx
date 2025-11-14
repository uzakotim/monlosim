import React, { useCallback, useEffect, useState } from "react";
import Button from "../../components/Button";
import TableComponent from "../../components/TableComponent";
import { format, addMonths, parse } from "date-fns";

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
    <div className="flex flex-col gap-5 h-screen items-center justify-center text-slate-800">
      <TableComponent
        data={data}
        onAddRow={handleAddRow}
        onUpdateRow={handleUpdateRow}
        onDeleteRow={handleDeleteRow}
      />
      <Button
        onClick={() => {
          window.location.href = "/home";
        }}
      >
        Back to Home
      </Button>
    </div>
  );
}

export default Page;