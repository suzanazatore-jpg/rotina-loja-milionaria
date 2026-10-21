-- Campos de leitura adicionais. Mantém as políticas de acesso já existentes.
alter table public.traffic_daily_metrics
 add column if not exists messages bigint,
 add column if not exists purchases bigint,
 add column if not exists message_spend numeric;
-- messages: soma de results cujo indicador da campanha é
-- actions:onsite_conversion.messaging_conversation_started_7d.
-- NULL significa que a Meta não informou o valor, nunca zero presumido.
-- message_spend: apenas a verba das campanhas com esse indicador.
