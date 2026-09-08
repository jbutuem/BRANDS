-- 0020 — feedback "reprovada" (distinto de "nao_gostei") para o Reprovar da Fila fechar o atendimento sem afetar o 👎 do Responder
set search_path = listening, public, extensions;
alter type feedback_kind add value if not exists 'reprovada';
