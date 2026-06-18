// ─────────────────────────────────────────────────────────────────────────────
// HANGERS CLOTHES SPA — DATABASE SEED
// Single source of truth for all pricing
// Source: exportProducts.csv (official rate chart)
// Total: 242 items across 8 catalogs
// ─────────────────────────────────────────────────────────────────────────────

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATALOG = [
  // ── DRY CLEAN — MEN ────────────────────────────────────────────────────────
  { name: 'Long Coat-Normal',                       category: 'DRY CLEAN — MEN',          basePrice: 300,  isActive: true },
  { name: 'Long Coat-Heavy',                        category: 'DRY CLEAN — MEN',          basePrice: 350,  isActive: true },
  { name: 'T-Shirt',                                category: 'DRY CLEAN — MEN',          basePrice: 100,  isActive: true },
  { name: 'Shirt-Normal',                           category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Shirt-Silk',                             category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Shirt-Woolen',                           category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Pants',                                  category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Suit -(3 Pcs - Blazer, Trouser & Shirt)',category: 'DRY CLEAN — MEN',          basePrice: 600,  isActive: true },
  { name: 'Suit -(2 Pcs - Blazer & Trouser)',       category: 'DRY CLEAN — MEN',          basePrice: 450,  isActive: true },
  { name: 'Suit -(1 Pcs - Blazer)',                 category: 'DRY CLEAN — MEN',          basePrice: 300,  isActive: true },
  { name: 'Kurta-Normal',                           category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Kurta-Heavy',                            category: 'DRY CLEAN — MEN',          basePrice: 200,  isActive: true },
  { name: 'Sherwani Set',                           category: 'DRY CLEAN — MEN',          basePrice: 350,  isActive: true },
  { name: 'Dhoti-Normal',                           category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Dhoti-Silk',                             category: 'DRY CLEAN — MEN',          basePrice: 200,  isActive: true },
  { name: 'Tie',                                    category: 'DRY CLEAN — MEN',          basePrice: 75,   isActive: true },
  { name: 'Safari-Pant',                            category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Safari-Coat',                            category: 'DRY CLEAN — MEN',          basePrice: 200,  isActive: true },
  { name: 'Achkan',                                 category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Jeans',                                  category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Blazer Vest',                            category: 'DRY CLEAN — MEN',          basePrice: 250,  isActive: true },
  { name: 'Jacket-Full Sleeves',                    category: 'DRY CLEAN — MEN',          basePrice: 200,  isActive: true },
  { name: 'Jacket-Half Sleeves',                    category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Jacket-with Hood',                       category: 'DRY CLEAN — MEN',          basePrice: 200,  isActive: true },
  { name: 'Sweat Shirt-Normal',                     category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Sweat Shirt-with Hood',                  category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Sweater-Half Sleeves-Plain',             category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Sweater-Half Sleeves-Heavy',             category: 'DRY CLEAN — MEN',          basePrice: 175,  isActive: true },
  { name: 'Sweater-Full Sleeves-Plain',             category: 'DRY CLEAN — MEN',          basePrice: 150,  isActive: true },
  { name: 'Sweater-Full Sleeves-Heavy',             category: 'DRY CLEAN — MEN',          basePrice: 200,  isActive: true },
  { name: 'Shorts',                                 category: 'DRY CLEAN — MEN',          basePrice: 80,   isActive: true },
  { name: 'Track Pant',                             category: 'DRY CLEAN — MEN',          basePrice: 100,  isActive: true },
  { name: 'Pyjama',                                 category: 'DRY CLEAN — MEN',          basePrice: 100,  isActive: true },
  { name: 'Capri',                                  category: 'DRY CLEAN — MEN',          basePrice: 100,  isActive: true },
  { name: 'Sweat Pants',                            category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Long Pullover',                          category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },
  { name: 'Under Wear',                             category: 'DRY CLEAN — MEN',          basePrice: 100,  isActive: true },
  { name: 'Vest',                                   category: 'DRY CLEAN — MEN',          basePrice: 125,  isActive: true },

  // ── DRY CLEAN — WOMEN ──────────────────────────────────────────────────────
  { name: 'Pajama',                                 category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Gown-Normal',                            category: 'DRY CLEAN — WOMEN',        basePrice: 300,  isActive: true },
  { name: 'Gown-Heavy',                             category: 'DRY CLEAN — WOMEN',        basePrice: 500,  isActive: true },
  { name: 'Gown-Very Heavy',                        category: 'DRY CLEAN — WOMEN',        basePrice: 800,  isActive: true },
  { name: 'Kurti/Kameez-Plain',                     category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Kurti/Kameez-Heavy',                     category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Salwar-Plain',                           category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Salwar-Heavy',                           category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Salwar-Very Heavy',                      category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Plazo-Plain',                            category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Plazo-Heavy',                            category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Plazo-Very Heavy',                       category: 'DRY CLEAN — WOMEN',        basePrice: 250,  isActive: true },
  { name: 'Dupatta-Normal',                         category: 'DRY CLEAN — WOMEN',        basePrice: 100,  isActive: true },
  { name: 'Dupatta-Heavy',                          category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Dupatta-Very Heavy',                     category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Saree-Plain',                            category: 'DRY CLEAN — WOMEN',        basePrice: 300,  isActive: true },
  { name: 'Saree-Heavy',                            category: 'DRY CLEAN — WOMEN',        basePrice: 400,  isActive: true },
  { name: 'Saree-Very Heavy',                       category: 'DRY CLEAN — WOMEN',        basePrice: 500,  isActive: true },
  { name: 'Petticoat',                              category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Blouse-Normal',                          category: 'DRY CLEAN — WOMEN',        basePrice: 100,  isActive: true },
  { name: 'Blouse-Heavy',                           category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Blouse-Very Heavy',                      category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Dress Long-Plain',                       category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Dress Long-Heavy',                       category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Dress-Plain',                            category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Dress-Heavy',                            category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Lehenga-Plain',                          category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Lehenga-Heavy',                          category: 'DRY CLEAN — WOMEN',        basePrice: 300,  isActive: true },
  { name: 'Lehenga-Very Heavy',                     category: 'DRY CLEAN — WOMEN',        basePrice: 400,  isActive: true },
  { name: 'Skirt Short-Plain',                      category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Skirt Short-Heavy',                      category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Skirt Short-Very Heavy',                 category: 'DRY CLEAN — WOMEN',        basePrice: 175,  isActive: true },
  { name: 'Skirt Long-Plain',                       category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Skirt Long-Heavy',                       category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Skirt Long-Very Heavy',                  category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Top-Plain',                              category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Top-Heavy',                              category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Top-Very Heavy',                         category: 'DRY CLEAN — WOMEN',        basePrice: 175,  isActive: true },
  { name: 'Top-Woolen',                             category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Shirt',                                  category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'T-Shirt',                                category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Pants',                                  category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Jeans',                                  category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Dangree',                                category: 'DRY CLEAN — WOMEN',        basePrice: 250,  isActive: true },
  { name: 'Jumper',                                 category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Leggings',                               category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Stole-Plain',                            category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Stole-Heavy',                            category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Stole-Very Heavy',                       category: 'DRY CLEAN — WOMEN',        basePrice: 175,  isActive: true },
  { name: 'Shawl-Plain',                            category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Shawl-Heavy',                            category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Shawl-Very Heavy',                       category: 'DRY CLEAN — WOMEN',        basePrice: 200,  isActive: true },
  { name: 'Scarf',                                  category: 'DRY CLEAN — WOMEN',        basePrice: 100,  isActive: true },
  { name: 'Long Pullover',                          category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Stockings',                              category: 'DRY CLEAN — WOMEN',        basePrice: 150,  isActive: true },
  { name: 'Track Pant',                             category: 'DRY CLEAN — WOMEN',        basePrice: 125,  isActive: true },
  { name: 'Brassieres',                             category: 'DRY CLEAN — WOMEN',        basePrice: 100,  isActive: true },

  // ── DRY CLEAN — KIDS ───────────────────────────────────────────────────────
  { name: 'Shirt-Normal',                           category: 'DRY CLEAN — KIDS',         basePrice: 125,  isActive: true },
  { name: 'Shirt-Woolen',                           category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Tshirt',                                 category: 'DRY CLEAN — KIDS',         basePrice: 125,  isActive: true },
  { name: 'Top-Plain',                              category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Top-Heavy',                              category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Pants',                                  category: 'DRY CLEAN — KIDS',         basePrice: 125,  isActive: true },
  { name: 'Jeans',                                  category: 'DRY CLEAN — KIDS',         basePrice: 125,  isActive: true },
  { name: 'Capri',                                  category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Shorts',                                 category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Jumper',                                 category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Dangree',                                category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Frock-Plain',                            category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Frock-Heavy',                            category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Frock-Very Heavy',                       category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Skirt-Plain',                            category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Skirt-Heavy',                            category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Skirt-Very Heavy',                       category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Dress-Plain',                            category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Dress-Heavy',                            category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Dress-Very Heavy',                       category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Sherwani',                               category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Kurta-Plain',                            category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Kurta-Heavy',                            category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Salwar-Plain',                           category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Salwar-Heavy',                           category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Dupatta-Plain',                          category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Dupatta-Heavy',                          category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Dupatta-Very Heavy',                     category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Blouse-Normal',                          category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Blouse-Heavy',                           category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Lehenga-Plain',                          category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Lehenga-Heavy',                          category: 'DRY CLEAN — KIDS',         basePrice: 200,  isActive: true },
  { name: 'Long Pullover',                          category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Sweater-Full Sleeves-Plain',             category: 'DRY CLEAN — KIDS',         basePrice: 100,  isActive: true },
  { name: 'Sweater-Full Sleeves-Heavy',             category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Swimming Costume',                       category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },
  { name: 'Baby Blanket',                           category: 'DRY CLEAN — KIDS',         basePrice: 150,  isActive: true },

  // ── DRY CLEAN — HOUSE HOLD ─────────────────────────────────────────────────
  { name: 'Curtain-Window',                         category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 700,  isActive: true },
  { name: 'Curtain-Window with Lining',             category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 800,  isActive: true },
  { name: 'Curtain-Door',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 500,  isActive: true },
  { name: 'Curtain-Door with Lining',               category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 600,  isActive: true },
  { name: 'Blind-Door',                             category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 350,  isActive: true },
  { name: 'Blind-Window',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 500,  isActive: true },
  { name: 'Blanket-Double-Normal',                  category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 400,  isActive: true },
  { name: 'Blanket-Double-2 Ply',                   category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 500,  isActive: true },
  { name: 'Blanket-Single-Normal',                  category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 300,  isActive: true },
  { name: 'Blanket-Single-2 Ply',                   category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 500,  isActive: true },
  { name: 'Quilt-Single',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 300,  isActive: true },
  { name: 'Quilt-Double',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 500,  isActive: true },
  { name: 'Quilt-Single Cover',                     category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 200,  isActive: true },
  { name: 'Quilt-Double Cover',                     category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 250,  isActive: true },
  { name: 'Duvet-Single',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 300,  isActive: true },
  { name: 'Duvet-Double',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 500,  isActive: true },
  { name: 'Bedspread-Single',                       category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 200,  isActive: true },
  { name: 'Bedspread-Double',                       category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 300,  isActive: true },
  { name: 'Sofa Cover-Small',                       category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 150,  isActive: true },
  { name: 'Sofa Cover-Medium',                      category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 200,  isActive: true },
  { name: 'Sofa Cover-Large',                       category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 250,  isActive: true },
  { name: 'Cushion Covers-Small',                   category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 75,   isActive: true },
  { name: 'Cushion Covers-Medium',                  category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 100,  isActive: true },
  { name: 'Cushion Covers-Large',                   category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 150,  isActive: true },
  { name: 'Pillow Covers',                          category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 100,  isActive: true },
  { name: 'Chair Covers',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 100,  isActive: true },
  { name: 'Hand Towels',                            category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 75,   isActive: true },
  { name: 'Bath Towels',                            category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 150,  isActive: true },
  { name: 'Bath Robe',                              category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 250,  isActive: true },
  { name: 'Table Napkin-Small',                     category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 75,   isActive: true },
  { name: 'Table Napkin-Large',                     category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 100,  isActive: true },
  { name: 'Foot Mat',                               category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 100,  isActive: true },
  { name: 'Table Runner',                           category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 150,  isActive: true },
  { name: 'Table Mat',                              category: 'DRY CLEAN — HOUSE HOLD',   basePrice: 100,  isActive: true },

  // ── DRY CLEAN — ACCESSORIES ────────────────────────────────────────────────
  { name: 'Handbag',                                category: 'DRY CLEAN — ACCESSORIES',  basePrice: 500,  isActive: true },
  { name: 'Socks',                                  category: 'DRY CLEAN — ACCESSORIES',  basePrice: 100,  isActive: true },
  { name: 'Cap',                                    category: 'DRY CLEAN — ACCESSORIES',  basePrice: 125,  isActive: true },
  { name: 'Hat',                                    category: 'DRY CLEAN — ACCESSORIES',  basePrice: 125,  isActive: true },
  { name: 'Muffler',                                category: 'DRY CLEAN — ACCESSORIES',  basePrice: 125,  isActive: true },
  { name: 'Rain Coat',                              category: 'DRY CLEAN — ACCESSORIES',  basePrice: 125,  isActive: true },
  { name: 'Tie',                                    category: 'DRY CLEAN — ACCESSORIES',  basePrice: 125,  isActive: true },
  { name: 'Handkerchief',                           category: 'DRY CLEAN — ACCESSORIES',  basePrice: 125,  isActive: true },
  { name: 'Gloves-Plain',                           category: 'DRY CLEAN — ACCESSORIES',  basePrice: 100,  isActive: true },
  { name: 'Gloves-Wool',                            category: 'DRY CLEAN — ACCESSORIES',  basePrice: 125,  isActive: true },
  { name: 'Gloves-Leather',                         category: 'DRY CLEAN — ACCESSORIES',  basePrice: 150,  isActive: true },
  { name: 'Soft Toy-Small',                         category: 'DRY CLEAN — ACCESSORIES',  basePrice: 200,  isActive: true },
  { name: 'Soft Toy-Medium',                        category: 'DRY CLEAN — ACCESSORIES',  basePrice: 300,  isActive: true },
  { name: 'Soft Toy-Large',                         category: 'DRY CLEAN — ACCESSORIES',  basePrice: 500,  isActive: true },

  // ── STEAM IRONING ──────────────────────────────────────────────────────────
  { name: 'Shirt',                                  category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'T-Shirt',                                category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Pant/Trouser/Jeans',                     category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Plazo',                                  category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Lehenga',                                category: 'STEAM IRONING',            basePrice: 150,  isActive: true },
  { name: 'Over Coat',                              category: 'STEAM IRONING',            basePrice: 200,  isActive: true },
  { name: 'Coat/Blazer',                            category: 'STEAM IRONING',            basePrice: 200,  isActive: true },
  { name: 'Long Dress',                             category: 'STEAM IRONING',            basePrice: 200,  isActive: true },
  { name: 'Pillow Cover',                           category: 'STEAM IRONING',            basePrice: 50,   isActive: true },
  { name: 'Bed Sheet-Double',                       category: 'STEAM IRONING',            basePrice: 150,  isActive: true },
  { name: 'Bed Sheet-Single',                       category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Dupatta-Plain',                          category: 'STEAM IRONING',            basePrice: 75,   isActive: true },
  { name: 'Dupatta-Designer',                       category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Saree-Silk',                             category: 'STEAM IRONING',            basePrice: 150,  isActive: true },
  { name: 'Saree-Heavy',                            category: 'STEAM IRONING',            basePrice: 200,  isActive: true },
  { name: 'Saree-Designer',                         category: 'STEAM IRONING',            basePrice: 250,  isActive: true },
  { name: 'Saree-Delicate',                         category: 'STEAM IRONING',            basePrice: 200,  isActive: true },
  { name: 'Kurti-Long',                             category: 'STEAM IRONING',            basePrice: 125,  isActive: true },
  { name: 'Kurti-Short',                            category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Kurta-Plain',                            category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Kurta-Silk/Designer',                    category: 'STEAM IRONING',            basePrice: 150,  isActive: true },
  { name: 'Blouse-Plain',                           category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Blouse-Fancy',                           category: 'STEAM IRONING',            basePrice: 125,  isActive: true },
  { name: 'Pyjama-Plain',                           category: 'STEAM IRONING',            basePrice: 100,  isActive: true },
  { name: 'Pyjama-Silk/Designer',                   category: 'STEAM IRONING',            basePrice: 150,  isActive: true },
  { name: 'Kids Frock-Plain',                       category: 'STEAM IRONING',            basePrice: 80,   isActive: true },
  { name: 'Kids Frock-Fancy',                       category: 'STEAM IRONING',            basePrice: 50,   isActive: true },
  { name: 'Kids Top/Tshirt/Shirt',                  category: 'STEAM IRONING',            basePrice: 75,   isActive: true },
  { name: 'Kids Jeans/Skirt',                       category: 'STEAM IRONING',            basePrice: 75,   isActive: true },

  // ── NORMAL IRONING ─────────────────────────────────────────────────────────
  { name: 'Normal Ironing',                         category: 'NORMAL IRONING',           basePrice: 15,   isActive: true },

  // ── DAILY IRON ─────────────────────────────────────────────────────────────
  { name: 'Shirt',                                  category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 1 },
  { name: 'T-Shirt',                                category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 2 },
  { name: 'Trouser / Pant',                         category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 3 },
  { name: 'Salwar / Kurta',                         category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 4 },
  { name: 'Saree',                                  category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 5 },
  { name: 'Long Dress',                             category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 6 },
  { name: 'Bedsheet (Single)',                      category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 7 },
  { name: 'Bedsheet (Double)',                      category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 8 },
  { name: 'General Ironing',                        category: 'DAILY_IRON',               basePrice: 0,    isActive: true, sortOrder: 9 },

  // ── ROLL PRESS ─────────────────────────────────────────────────────────────
  { name: 'Saree',                                  category: 'ROLL PRESS',               basePrice: 100,  isActive: true },

  // ── SHOE CLEANING ──────────────────────────────────────────────────────────
  { name: 'Sports Shoes',                           category: 'SHOE CLEANING',            basePrice: 500,  isActive: true },
  { name: 'Canvas Shoes',                           category: 'SHOE CLEANING',            basePrice: 500,  isActive: true },
  { name: 'Leather Shoes',                          category: 'SHOE CLEANING',            basePrice: 500,  isActive: true },
  { name: 'Suede Shoes',                            category: 'SHOE CLEANING',            basePrice: 500,  isActive: true },
  { name: 'Crocs/Sandals',                          category: 'SHOE CLEANING',            basePrice: 500,  isActive: true },
  { name: 'Slippers',                               category: 'SHOE CLEANING',            basePrice: 500,  isActive: true },

  // ── SOFA CLEANING ──────────────────────────────────────────────────────────
  { name: 'Sofa Cleaning 1 Seater',                 category: 'SOFA CLEANING',            basePrice: 300,  isActive: true },

  // ── LAUNDRY BY KG ──────────────────────────────────────────────────────────
  { name: 'Wash & Iron Per KG',                     category: 'LAUNDRY BY KG',            basePrice: 0,    isActive: true },
  { name: 'Wash & Fold Per KG',                     category: 'LAUNDRY BY KG',            basePrice: 0,    isActive: true },
  { name: 'Wash & Fold Per KG - Express',           category: 'LAUNDRY BY KG',            basePrice: 0,    isActive: true },
  { name: 'Wash & Iron Per KG - Express',           category: 'LAUNDRY BY KG',            basePrice: 0,    isActive: true },
];

async function main() {
  console.log('🌱 Seeding database...');

  // ── Admin user (skip if exists) ────────────────────────────────────────────
  const bcrypt = require('bcryptjs');
  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@hangers.in';
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  const existing = await prisma.staff.findUnique({ where: { email: defaultAdminEmail } });
  if (!existing) {
    if (!defaultAdminPassword) {
      throw new Error('DEFAULT_ADMIN_PASSWORD must be set before seeding a default admin user');
    }
    await prisma.staff.create({
      data: {
        name:     'Super Admin',
        email:    defaultAdminEmail,
        passwordHash: await bcrypt.hash(defaultAdminPassword, 10),
        role:     'SUPER_ADMIN',
        isActive: true,
        phone:    '7977417014'
      },
    });
    console.log('✅ Super Admin created');
  } else {
    console.log('⚠️  Super Admin already exists — skipping');
  }

  // ── Pricing catalog — bootstrap once, then CRM owns all further changes ───
  const existingServices = await prisma.service.count();
  if (existingServices === 0) {
    let created = 0;
    for (const item of CATALOG) {
      await prisma.service.create({ data: item });
      created++;
    }

    const totalCatalogs = new Set(CATALOG.map((item) => item.category)).size;
    console.log(`✅ Pricing catalog bootstrapped: ${created} items seeded across ${totalCatalogs} catalogs`);
  } else {
    console.log(`⚠️  Service catalog already exists (${existingServices} items) — skipping bootstrap so CRM remains the source of truth`);
  }
  console.log('🎉 Seed complete!');
  console.log('─────────────────────────────────────────');
  console.log('Next steps:');
  console.log(`1. Login to CRM with ${defaultAdminEmail}`);
  console.log('2. Change the seeded admin password immediately');
  console.log('3. Create your real staff accounts from the CRM');
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
