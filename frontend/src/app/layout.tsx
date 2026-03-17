import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Glab',
  description: 'Internal communication platform',
};

// Inline script to prevent FOUC — runs before first paint.
// Content is a static string constant, not user input — safe to inline.
const themeInitScript = `(function(){try{var t=localStorage.getItem('glab_theme');var valid=['dark','classic-dark','light','dracula'];if(!t||valid.indexOf(t)===-1)t='dark';document.documentElement.setAttribute('data-theme',t);if(t!=='light')document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark')}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="dark" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
