-- 002_seed.sql: 5 Sample Snack Products with integer paise pricing

INSERT INTO products (id, name, price_paise, physical_stock)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Masala Potato Chips (50g)', 2000, 15),
  ('22222222-2222-2222-2222-222222222222', 'Roasted Salted Almonds (100g)', 5000, 10),
  ('33333333-3333-3333-3333-333333333333', 'Dark Chocolate Bar (70% Cacao, 40g)', 4500, 12),
  ('44444444-4444-4444-4444-444444444444', 'Sparkling Lemon Cold Beverage (300ml)', 3000, 8),
  ('55555555-5555-5555-5555-555555555555', 'Protein Energy Granola Bar (35g)', 3500, 20)
ON CONFLICT (id) DO UPDATE 
SET 
  name = EXCLUDED.name,
  price_paise = EXCLUDED.price_paise,
  physical_stock = EXCLUDED.physical_stock;
