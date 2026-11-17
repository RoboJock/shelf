import type { Metadata } from "next";
import { Suspense } from "react";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import { AppShell } from "../components/AppShell";
import "./globals.css";

const display = Newsreader({ subsets: ["latin"], variable: "--font-display" });
const body = Source_Sans_3({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Armarium",
  description: "Search Open Library and keep a shelf of books.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("shelf-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <Suspense>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
