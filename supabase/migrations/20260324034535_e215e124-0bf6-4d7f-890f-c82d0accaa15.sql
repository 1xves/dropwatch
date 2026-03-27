-- Create brands table
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  logo_letter TEXT NOT NULL,
  instagram_handle TEXT,
  bio TEXT,
  is_monitoring BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create brand_posts table for scraped Instagram posts
CREATE TABLE public.brand_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  post_url TEXT,
  image_url TEXT,
  caption TEXT,
  post_date TIMESTAMP WITH TIME ZONE,
  post_type TEXT DEFAULT 'post',
  extracted_product_name TEXT,
  extracted_price TEXT,
  extracted_release_date TIMESTAMP WITH TIME ZONE,
  raw_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_posts ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (no auth yet)
CREATE POLICY "Anyone can read brands" ON public.brands FOR SELECT USING (true);
CREATE POLICY "Anyone can insert brands" ON public.brands FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update brands" ON public.brands FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete brands" ON public.brands FOR DELETE USING (true);

CREATE POLICY "Anyone can read brand_posts" ON public.brand_posts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert brand_posts" ON public.brand_posts FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX idx_brand_posts_brand_id ON public.brand_posts(brand_id);
CREATE INDEX idx_brand_posts_release_date ON public.brand_posts(extracted_release_date);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();