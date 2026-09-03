-- 0015 — fatos da marca: verdades de linha inteira que não estão nos catálogos (ex.: "nenhum produto tem álcool")
set search_path = listening, public, extensions;
alter table brand_settings add column if not exists brand_facts text[] not null default '{}';

update brand_settings s set brand_facts = array[
  'TODOS os produtos DaVinci Gourmet são SEM ÁLCOOL (0% alc.): xaropes Classic, Fruit Innovations e Sensations, caldas, bases, frappés, chocolates e preparados em pó. Isso inclui os sabores com nome de drink ou licor: Gin Tônica, Amaretto, Creme Irlandês, Blue Curaçao, Grenadine, Maple. São xaropes saborizantes; o álcool, quando a receita pede, vem da bebida-base escolhida pelo profissional.',
  'Produtos destinados ao uso profissional em cafeterias, bares, restaurantes e food service; vendidos por distribuidores, não em varejo direto ao consumidor.',
  'A linha Sensations tem mais intensidade de sabor e menos acidez que a Fruit Innovations; Pêssego Sensations e Chá Preto são zero açúcar.',
  'Bebida Energética contém cafeína e taurina: limite diário recomendado de 11 porções; não recomendar para gestantes, lactantes ou crianças.',
  'Base para Frappé Neutro é plant-based e zero lactose. Lemonade tem 70% de suco de limão e sem corantes.',
  'Lista de ingredientes, alérgenos e tabela nutricional estão no rótulo de cada embalagem.',
  'Embalagens recicláveis com parceria eureciclo: a cada produto vendido, duas embalagens são recicladas.'
] from brands b where b.id = s.brand_id and b.slug = 'dvg';

update brand_settings s set brand_facts = array[
  'Nenhum produto Junior contém álcool.',
  'Produtos para food service (hamburguerias, restaurantes, padarias, hotéis, delivery), vendidos por distribuidores, não em varejo direto ao consumidor.',
  'Formatos: frascos (350–400 g) para finalização e montagem; pouches de 1,1 kg para alto rendimento em cozinhas profissionais; sachês para delivery e porcionamento.',
  'Lista de ingredientes, alérgenos e tabela nutricional estão no rótulo de cada embalagem.',
  'Marca fundada em 1983, adquirida pela Kerry do Brasil em 2014.'
] from brands b where b.id = s.brand_id and b.slug = 'junior';
