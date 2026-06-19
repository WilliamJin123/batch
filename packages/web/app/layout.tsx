import "../styles/tokens.css";
import "../styles/topbar.css";
import "../styles/shared.css";
import "../styles/card.css";
import "../styles/tree.css";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { TopBar } from "../components/shared/TopBar";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-serif" });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = { title: "Batch", description: "git for recipes" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${mono.variable}`}>
      <body><TopBar /><div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 30px 60px" }}>{children}</div></body>
    </html>
  );
}
