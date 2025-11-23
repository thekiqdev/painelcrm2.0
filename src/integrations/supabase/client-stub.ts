// Stub para Supabase - usado quando não queremos carregar a biblioteca completa
// Isso evita erros de "global is not defined" durante o build

export const supabase = {
  auth: {
    getSession: async () => {
      console.warn('Supabase stub: getSession called but Supabase is not available');
      return { data: { session: null }, error: null };
    },
    getUser: async () => {
      console.warn('Supabase stub: getUser called but Supabase is not available');
      return { data: { user: null }, error: null };
    },
  },
  from: (table: string) => {
    console.warn(`Supabase stub: from(${table}) called but Supabase is not available`);
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    };
  },
};

