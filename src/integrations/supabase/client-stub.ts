// Stub para Supabase - usado quando não queremos carregar a biblioteca completa
// Isso evita erros de "global is not defined" durante o build

export const supabase = {
  auth: {
    getSession: async () => {
      // Stub silencioso - não logar avisos
      return { data: { session: null }, error: null };
    },
    getUser: async () => {
      // Stub silencioso - não logar avisos
      return { data: { user: null }, error: null };
    },
  },
  from: (table: string) => {
    // Stub silencioso - não logar avisos
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

