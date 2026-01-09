-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    company_name TEXT NOT NULL,
    rut TEXT NOT NULL,
    address TEXT NOT NULL,
    company_email TEXT NOT NULL,
    phone TEXT NOT NULL,
    company_size TEXT,
    workers_count INTEGER,
    waste_types TEXT[],
    certifications TEXT[],
    is_ley_rep BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now()
 );

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);
