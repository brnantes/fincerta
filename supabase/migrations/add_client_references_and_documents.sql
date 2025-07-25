-- Adicionar coluna para comprovante de residência e selfie
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS residence_proof_url TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS selfie_url TEXT;

-- Criar tabela para contatos de referência
CREATE TABLE IF NOT EXISTS public.client_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user_id UUID NOT NULL
);

-- Adicionar políticas de segurança RLS para a nova tabela
ALTER TABLE public.client_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver apenas suas próprias referências de clientes"
  ON public.client_references
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir suas próprias referências de clientes"
  ON public.client_references
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias referências de clientes"
  ON public.client_references
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem excluir suas próprias referências de clientes"
  ON public.client_references
  FOR DELETE
  USING (auth.uid() = user_id);
