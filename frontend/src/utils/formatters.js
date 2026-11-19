export function formatNPR(amount, isBlurred = false) {
  if (isBlurred) return 'रु ••••••';
  const num = Number(amount) || 0;
  return 'रु ' + num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}