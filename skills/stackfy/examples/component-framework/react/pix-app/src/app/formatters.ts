const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'BRL',
});

const twoDigits = (value: number) => String(value).padStart(2, '0');

export const formatCurrency = (value: number) => currency.format(value);

export const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  const day = `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`;
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;

  return `${day} ${time}`;
};
