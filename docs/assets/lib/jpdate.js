'use strict';
// Locale-aware Japanese date formatting: 2026年6月30日（火）. Pure; pass a Date in.
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function jpDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
}
