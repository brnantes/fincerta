// Cliente Supabase para operações administrativas (bypass RLS)
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://hyyeavocabbrrxthsgxn.supabase.co";
// Esta é uma chave de serviço fictícia - em produção, usar variável de ambiente
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5eWVhdm9jYWJicnJ4dGhzZ3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNjg5MDIsImV4cCI6MjA2ODk0NDkwMn0.84HEPru9WgKbhkB8LEV3ncGpqwHvSZUG9olS1y8LY0Q";

// Cliente admin que bypassa RLS (apenas para desenvolvimento)
export const supabaseAdmin = createClient<Database>(
  SUPABASE_URL, 
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
