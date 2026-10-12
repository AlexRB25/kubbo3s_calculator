import { useLocalSearchParams } from 'expo-router';

import { PrintForm } from '@/components/print-form';
import { Empty } from '@/components/ui';
import { useData } from '@/store/data';

export default function PrintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useData().jobs.find((item) => item.id === id);
  if (!job) return <Empty icon="print-outline" text="Esta impresión ya no existe." />;
  return <PrintForm job={job} />;
}
