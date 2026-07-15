import type {Metadata} from "next";
import "./globals.css";
import {Providers} from "./providers";
import {Navbar} from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Wix Fleet Manager",
  description: "Automation control for Wix website projects.",
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="flex min-h-screen">
            <aside className="fixed inset-y-0 left-0 z-20 w-[72px] border-r border-outline bg-canvas md:w-60"><Navbar/></aside>
            <div className="ml-[72px] w-[calc(100%-72px)] md:ml-60 md:w-[calc(100%-240px)]">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
