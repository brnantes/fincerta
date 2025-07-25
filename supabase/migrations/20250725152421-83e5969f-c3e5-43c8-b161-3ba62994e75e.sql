-- Adicionar campos de crédito na tabela clients
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(10,2) DEFAULT 500.00,
ADD COLUMN IF NOT EXISTS available_credit DECIMAL(10,2) DEFAULT 500.00,
ADD COLUMN IF NOT EXISTS is_first_loan BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS total_borrowed DECIMAL(10,2) DEFAULT 0.00;

-- Modificar tabela debts para ser loans (empréstimos)
ALTER TABLE public.debts RENAME TO loans;

-- Adicionar campos específicos para empréstimos na tabela loans
ALTER TABLE public.loans 
ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5,2) DEFAULT 35.00,
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS weekly_payment DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_weeks INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS weeks_paid INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS next_payment_date DATE;

-- Renomear coluna amount para loan_amount se ainda não foi renomeada
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'amount') THEN
        ALTER TABLE public.loans RENAME COLUMN amount TO loan_amount;
    END IF;
END $$;

-- Remover campos antigos que não fazem sentido para empréstimos
ALTER TABLE public.loans 
DROP COLUMN IF EXISTS debt_date,
DROP COLUMN IF EXISTS payment_date;

-- Criar tabela para pagamentos das parcelas se não existir
CREATE TABLE IF NOT EXISTS public.loan_payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    payment_amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    week_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on loan_payments se a tabela foi criada
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_payments') THEN
        ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
        
        -- Create RLS policies for loan_payments
        CREATE POLICY "Users can view their own loan payments" 
        ON public.loan_payments 
        FOR SELECT 
        USING (auth.uid() = user_id);

        CREATE POLICY "Users can create their own loan payments" 
        ON public.loan_payments 
        FOR INSERT 
        WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their own loan payments" 
        ON public.loan_payments 
        FOR UPDATE 
        USING (auth.uid() = user_id);

        CREATE POLICY "Users can delete their own loan payments" 
        ON public.loan_payments 
        FOR DELETE 
        USING (auth.uid() = user_id);

        -- Create trigger for loan_payments timestamps
        CREATE TRIGGER update_loan_payments_updated_at
        BEFORE UPDATE ON public.loan_payments
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- Função para calcular o próximo pagamento
CREATE OR REPLACE FUNCTION public.calculate_next_payment_date(loan_date DATE, weeks_paid INTEGER)
RETURNS DATE
LANGUAGE sql
AS $$
  SELECT loan_date + INTERVAL '7 days' * (weeks_paid + 1);
$$;