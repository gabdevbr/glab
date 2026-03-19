import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Glab',
  description: 'Internal communication platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Glab',
  },
};

// Inline script to prevent FOUC — runs before first paint.
// Content is a static string constant, not user input — safe to inline.
const themeInitScript = `(function(){try{var t=localStorage.getItem('glab_theme');var valid=['dark-geo','light-geo','dark','classic-dark','light','dracula'];if(!t||valid.indexOf(t)===-1)t='dark-geo';document.documentElement.setAttribute('data-theme',t);if(t!=='light'&&t!=='light-geo')document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark')}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="dark-geo" className="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#1a2332" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
