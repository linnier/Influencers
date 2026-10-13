import type { CSSProperties } from "react";
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3a4 4 0 0 1 0 8 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  briefcase: "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M3 6h18v14H3z M3 11a24 24 0 0 0 18 0 M12 10v4",
  message: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l1.5-4A8.5 8.5 0 1 1 21 11.5 M8 10h8 M8 14h5",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  download: "M12 3v12 M7 10l5 5 5-5 M5 16v5h14v-5",
  close: "M6 6l12 12 M6 18L18 6",
  edit: "M16 3l5 5-12 12-6 1 1-6z M14 5l5 5",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  check: "M5 12l4 4L19 6",
  trend: "M3 17l6-6 4 4 8-10 M15 5h6v6",
  money: "M5 4l7 8 7-8 M5 12h14 M5 16h14 M12 12v9",
  spark: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
} as const;
export default function Icon({name, size=20, style}: {name: keyof typeof paths; size?: number; style?: CSSProperties}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]}/></svg>;
}
