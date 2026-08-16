import { useLocalSearchParams } from 'expo-router';
import { useLocale } from '@/lib/locale';
import { ComingSoon } from '@/components/coming-soon';

export default function MoreComingSoonScreen() {
  const [locale] = useLocale();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ComingSoon locale={locale} path={`/${slug}`} />;
}
