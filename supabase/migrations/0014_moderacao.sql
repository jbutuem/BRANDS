-- 0014 — veredito "moderacao" (resposta de limite para mensagens ofensivas)
set search_path = listening, public, extensions;
alter type guardian_verdict add value if not exists 'moderacao';
