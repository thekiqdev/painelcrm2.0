import { useCallback, useEffect, useState } from 'react';
import { getMeProfile, type MeProfileResponse } from '@/services/profile';

export function useProfile() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeProfileResponse | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getMeProfile();
    if (res.error) {
      setError(res.error);
      setData(null);
    } else if (res.data) {
      setData(res.data);
    } else {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { loading, error, data, reload };
}
