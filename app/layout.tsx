import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Basecase",
  description: "Breaks a student's confusion down layer by layer until it isolates the base case of misunderstanding.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* runs before paint: applies saved/system theme without a flash.
            lives in body (not head) to avoid hydration clashes with
            browser-injected head scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
