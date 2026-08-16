import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans_Arabic,
  Inter,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import type { Locale } from '@omnisell/i18n';
import { dirForLocale } from '@omnisell/i18n';
import { SessionProvider } from '@/lib/session-context';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OmniSell — Creator Commerce & Points',
  description: 'Multi-tenant creator commerce with a consumer points and wallet economy.',
};

function resolveLocale(cookieValue: string | undefined): Locale {
  return cookieValue === 'ar' ? 'ar' : 'en';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get('omnisell-locale')?.value);
  const dir = dirForLocale(locale);

  return (
    <html lang={locale} dir={dir} data-theme="light" suppressHydrationWarning>
      <body className={`${inter.variable} ${display.variable} ${mono.variable} ${arabic.variable} antialiased`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}