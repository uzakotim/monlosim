import { format, setMonth } from 'date-fns';

export const formatMonthYear = (date) => {
  if (!date) return '';
  return format(date, 'MMMM yyyy');
};

export const getMonthsArray = () => {
  const months = [];
  // Create a dummy date (e.g., January 1st of the current year) to easily format months.
  // The year itself doesn't matter for getting month names.
  const dummyDate = new Date(new Date().getFullYear(), 0, 1);
  for (let i = 0; i < 12; i++) {
    months.push(format(setMonth(dummyDate, i), 'MMM'));
  }
  return months;
};
