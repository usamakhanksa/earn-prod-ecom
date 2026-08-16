import { cookies } from 'next/headers';
import type { Locale } from '@omnisell/i18n';
import { AdminSidebar } from '@/components/sidebar/sidebar';
import { AdminAuthGuard } from '@/components/admin-auth-guard';

function resolveLocale(cookieValue: string | undefined): Locale {
  return cookieValue === 'ar' ? 'ar' : 'en';
}

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get('omnisell-locale')?.value);

  return (
    <AdminAuthGuard locale={locale}>
      <div className="flex h-dvh overflow-hidden">
        <AdminSidebar locale={locale} />
        <main id="main-content" className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </AdminAuthGuard>
  );
}
