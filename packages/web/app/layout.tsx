import "../styles/tokens.css";
import "../styles/topbar.css";
import "../styles/shared.css";
import "../styles/card.css";
import "../styles/tree.css";
import "../styles/index.css";
import "../styles/keys.css";
import "../styles/mixins.css";
import { Baloo_2, Nunito } from "next/font/google";
import { TopBar } from "../components/shared/TopBar";
import { KeyboardNav } from "../components/shared/KeyboardNav";

// two faces: Baloo 2 for titles and header rows (round, chubby), Nunito for everything else (tabular figures)
const display = Baloo_2({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display" });
const body = Nunito({ subsets: ["latin"], variable: "--font-body" });

export const metadata = { title: "Batch", description: "git for recipes" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body><TopBar /><KeyboardNav /><div className="page">{children}</div></body>
    </html>
  );
}
