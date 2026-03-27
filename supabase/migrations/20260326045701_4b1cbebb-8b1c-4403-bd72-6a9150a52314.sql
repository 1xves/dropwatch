
-- Fix Community Day event: March 21st 11am PST = 19:00 UTC
UPDATE public.brand_posts 
SET extracted_release_date = '2026-03-21 19:00:00+00'
WHERE id = '84a6f536-da21-482a-a06e-ea4175ed516c';

-- Fix Grounded Moss "available now" post to March 22nd 11am PST online drop
UPDATE public.brand_posts 
SET extracted_release_date = '2026-03-22 19:00:00+00',
    extracted_product_name = 'Grounded Moss 18oz Green Cast Indigo Raw Japanese Selvedge Denim'
WHERE id = '286dec1b-402f-4e7b-99d1-d57ad785dedf';

-- Fix tee collection post to March 22nd 11am PST online drop  
UPDATE public.brand_posts 
SET extracted_release_date = '2026-03-22 19:00:00+00',
    extracted_product_name = 'Hidden Rivet x Cotton Cowboy Vintage National Park Tee Collection-Get to Know Nature-On The Road-Go Climb the Mountain'
WHERE id = '66fe0a1b-7b26-4c88-a42e-4cde55266bd7';

-- The Grounded Moss 002 announcement post: in-store March 21st 11am PST
UPDATE public.brand_posts 
SET extracted_release_date = '2026-03-21 19:00:00+00',
    extracted_product_name = 'Grounded Moss Collection In-Store Release'
WHERE id = '491cfd32-f95d-421d-9337-27422b274a00';

-- The detailed Grounded Moss post: online March 22nd 11am PST
UPDATE public.brand_posts 
SET extracted_release_date = '2026-03-22 19:00:00+00'
WHERE id = '94124842-322d-4291-b88b-ce5b2db63551';
