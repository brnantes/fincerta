-- Create storage buckets for client photos and documents
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('client-photos', 'client-photos', true),
  ('client-documents', 'client-documents', true);

-- Create profiles table for user authentication
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  email TEXT,
  photo_url TEXT,
  document_photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create debts table
CREATE TABLE public.debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  debt_date DATE NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  payment_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Clients policies
CREATE POLICY "Users can view their own clients" ON public.clients
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own clients" ON public.clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own clients" ON public.clients
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own clients" ON public.clients
  FOR DELETE USING (auth.uid() = user_id);

-- Debts policies
CREATE POLICY "Users can view their own debts" ON public.debts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own debts" ON public.debts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own debts" ON public.debts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own debts" ON public.debts
  FOR DELETE USING (auth.uid() = user_id);

-- Storage policies for client photos
CREATE POLICY "Users can upload client photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'client-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view client photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'client-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update client photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'client-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete client photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'client-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for client documents
CREATE POLICY "Users can upload client documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'client-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view client documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'client-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update client documents" ON storage.objects
  FOR UPDATE USING (bucket_id = 'client-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete client documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'client-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (new.id, new.raw_user_meta_data ->> 'name');
  RETURN new;
END;
$$;

-- Trigger to create profile automatically
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();