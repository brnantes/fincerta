import { useState, useEffect, createContext, useContext } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Verificar se já existe uma sessão
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        
        if (existingSession && mounted) {
          setSession(existingSession);
          setUser(existingSession.user);
          setLoading(false);
          console.log('Sessão existente encontrada:', existingSession.user.id);
          return;
        }

        // Se não há sessão, tentar login automático para desenvolvimento
        console.log('Tentando login automático para desenvolvimento...');
        
        // Tentar login com senha conhecida
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: 'admin1@sistema.com',
            password: 'admin123'
          });
          
          if (!error && data.session && mounted) {
            setSession(data.session);
            setUser(data.session.user);
            setLoading(false);
            console.log('Login automático realizado com sucesso:', data.session.user.id);
            return;
          } else {
            console.log('Erro no login automático:', error?.message);
          }
        } catch (err) {
          console.log('Erro na tentativa de login:', err);
        }
        
        // Se o login falhou, tentar criar o usuário
        console.log('Tentando criar usuário admin...');
        try {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: 'admin1@sistema.com',
            password: 'admin123'
          });
          
          if (!signUpError && signUpData.session && mounted) {
            setSession(signUpData.session);
            setUser(signUpData.session.user);
            setLoading(false);
            console.log('Usuário criado e logado com sucesso:', signUpData.session.user.id);
            return;
          } else {
            console.log('Erro ao criar usuário:', signUpError?.message);
          }
        } catch (err) {
          console.log('Erro na criação do usuário:', err);
        }
        
        if (mounted) {
          console.log('Todas as tentativas de autenticação falharam');
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro na inicialização da autenticação:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          console.log('Auth state changed:', event, session?.user?.id);
        }
      }
    );

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};