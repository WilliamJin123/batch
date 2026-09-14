import "../styles/tokens.css";
import "../styles/topbar.css";
import "../styles/shared.css";
import "../styles/card.css";
import "../styles/tree.css";
import "../styles/index.css";
import "../styles/keys.css";
import "../styles/mixins.css";
import { Archivo } from "next/font/google";
import { TopBar } from "../components/shared/TopBar";
import { KeyboardNav } from "../components/shared/KeyboardNav";

// one variable face carries the whole sheet: the width axis gives the condensed header cut
const sheet = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-sheet" });

export const metadata = { title: "Batch", description: "git for recipes" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sheet.variable}>
      <body><TopBar /><KeyboardNav /><div className="page">{children}</div></body>
    </html>
  );
}
