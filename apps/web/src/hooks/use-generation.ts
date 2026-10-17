import type { GenerationDto, GenerationStatus } from '@minstrel/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Spec §5.5: the Studio page reads the generation every 3 s until it ends. Each read can start a
// sync on the API, so the poll also moves the song forward.
export const POLL_MS = 3000;

export const isFinished = (status: GenerationStatus) => status === 'complete' || status === 'failed';

export const generationQueryKey = (id: string) => ['generation', id] as const;

export function useGeneration(id: string, initial?: GenerationDto) {
  return useQuery({
    queryKey: generationQueryKey(id),
    queryFn: () => apiFetch<GenerationDto>(`/api/generations/${id}`),
    initialData: initial,
    // The submit reply is fresh, so the first read waits for the first interval.
    staleTime: POLL_MS,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isFinished(status) ? false : POLL_MS;
    },
  });
}
