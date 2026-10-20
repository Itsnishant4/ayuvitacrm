export const exportToCSV = (data, filename) => {
  if (!data || !data.length) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(fieldName => {
      const value = row[fieldName] ?? '';
      // Escape quotes and wrap in quotes
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
