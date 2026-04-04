// Format currency values
export function formatCurrency(value: number, currencyCode: string = 'INR'): string {
  // Determine locale based on currency
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return formatter.format(value);
}

// Format percentage values
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Format date values
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}



