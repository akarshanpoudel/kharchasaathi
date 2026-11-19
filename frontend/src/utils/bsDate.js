import NepaliDate from 'nepali-date-converter';

export function getBSDateParts(adDateInput = new Date()) {
  const dateObj = adDateInput instanceof Date ? adDateInput : new Date(adDateInput);
  const nepDate = new NepaliDate(dateObj);
  return {
    bs_year: nepDate.getYear(),
    bs_month: nepDate.getMonth() + 1, // 1-indexed (Baisakh = 1 ... Chaitra = 12)
    bs_day: nepDate.getDate(),
    formatted: nepDate.format('MMMM DD, YYYY'),
  };
}