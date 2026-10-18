import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useCapabilities() {
  return useQuery({
    queryKey: ['capabilities'],
    queryFn: api.capabilities,
    staleTime: 5 * 60_000,
  });
}
