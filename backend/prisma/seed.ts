import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleProducts = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Masala Potato Chips (50g)',
    price_paise: 2000,
    physical_stock: 15,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Roasted Salted Almonds (100g)',
    price_paise: 5000,
    physical_stock: 10,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Dark Chocolate Bar (70% Cacao, 40g)',
    price_paise: 4500,
    physical_stock: 12,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Sparkling Lemon Cold Beverage (300ml)',
    price_paise: 3000,
    physical_stock: 8,
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Protein Energy Granola Bar (35g)',
    price_paise: 3500,
    physical_stock: 20,
  },
];

async function main() {
  console.log('[Prisma Seed] Seeding 5 sample snack products...');
  for (const product of sampleProducts) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        name: product.name,
        price_paise: product.price_paise,
        physical_stock: product.physical_stock,
      },
      create: product,
    });
  }
  console.log('[Prisma Seed] Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
