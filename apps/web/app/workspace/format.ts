const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
] as const;

export function formatInrPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toString();
  const fraction = (abs % 100).toString().padStart(2, "0");
  let grouped = rupees.slice(-3);
  let rest = rupees.slice(0, -3);
  while (rest.length > 0) {
    grouped = `${rest.slice(-2)},${grouped}`;
    rest = rest.slice(0, -2);
  }
  return `${sign}${grouped}.${fraction}`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (year === undefined || month === undefined || day === undefined) {
    return iso;
  }
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return `${day} ${monthName} ${year}`;
}

export function formatTimestamp(iso: string): string {
  const time = iso.length > 10 ? ` ${iso.slice(11, 16)}` : "";
  return `${formatDate(iso)}${time}`;
}

export function shortHash(value: string): string {
  return value.slice(0, 8);
}

export function materialityPercent(
  amountPaise: number,
  materialityPaise: number
): string {
  if (materialityPaise <= 0) {
    return "n/a";
  }
  const pct = (amountPaise / materialityPaise) * 100;
  return `${pct.toFixed(1)}%`;
}
