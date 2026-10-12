import { useLocalSearchParams } from 'expo-router';

import { PrintForm } from '@/components/print-form';

export default function NewPrintScreen() {
  const { producto } = useLocalSearchParams<{ producto?: string }>();
  return <PrintForm productId={producto} />;
}
