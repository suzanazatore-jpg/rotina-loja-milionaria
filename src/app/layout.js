import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import AdminAlunasPlanInjector from "./components/AdminAlunasPlanInjector";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Rotina da Loja Milionária 👑",
  description: "Sua área exclusiva de conteúdo para transformar sua loja de moda em uma máquina de vendas.",
  applicationName: "Rotina da Loja Milionária",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "App Rotina",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "light dark",
};

export default function RootLayout({ children }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {supabaseUrl && <link rel="preconnect" href={supabaseUrl} crossOrigin="anonymous" />}
        {supabaseUrl && <link rel="dns-prefetch" href={supabaseUrl} />}
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <AdminAlunasPlanInjector />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
