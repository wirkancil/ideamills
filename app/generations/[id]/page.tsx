'use client';

import { use } from 'react';
import { GenerationView } from '@/app/components/GenerationView';

export default function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <GenerationView generationId={id} />;
}
