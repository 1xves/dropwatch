CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE POLICY "Anyone can delete brand_posts" ON public.brand_posts FOR DELETE USING (true);