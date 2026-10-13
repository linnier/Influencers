import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "itea达人库", description: "达人档案、合作项目与跟进记录管理" };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
