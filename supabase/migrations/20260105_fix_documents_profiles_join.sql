-- Add foreign key relationship between documents and profiles to enable auto-joins in PostgREST
ALTER TABLE public.documents
ADD CONSTRAINT documents_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id)
ON DELETE CASCADE;
