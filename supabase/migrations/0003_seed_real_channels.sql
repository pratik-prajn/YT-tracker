-- Replace placeholder seed rows with the public channels tracked by this dashboard.
delete from channels where handle like '@REPLACE_ME%';

insert into channels (name, handle, kind)
select source.name, source.handle, source.kind
from (values
  ('AI for Techies', '@AIForTechies', 'own'),
  ('Decoded',        '@Decode_with_be10X', 'own'),
  ('Be10x Labs',     '@Be10x_Labs', 'own')
) as source(name, handle, kind)
where not exists (select 1 from channels c where c.handle = source.handle);