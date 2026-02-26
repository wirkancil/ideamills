-- RPC Functions for semantic search

-- Semantic match function for Ideas deduplication
create or replace function match_ideas (
  query_vector vector(1536),
  product_id text,
  match_threshold float,
  search_scope text default 'product', -- 'product'|'category'|'global'
  category text default null,
  top_k int default 5
) returns table (
  id uuid,
  product_identifier text,
  idea_theme text,
  score float
) language sql as $$
  select i.id, i.product_identifier, i.idea_theme,
         1 - (i.idea_vector <=> query_vector) as score
  from Ideas i
  where
    (
      (search_scope = 'product' and i.product_identifier = product_id)
      or (search_scope = 'category' and i.category_tag = category)
      or (search_scope = 'global')
    )
    and (1 - (i.idea_vector <=> query_vector)) >= match_threshold
  order by i.idea_vector <=> query_vector asc
  limit top_k;
$$;

-- Function to get generation with variations (paginated)
create or replace function get_generation_with_variations(
  gen_id uuid,
  page_num int default 1,
  page_size int default 20
) returns jsonb language plpgsql as $$
declare
  result jsonb;
  total_count int;
begin
  -- Get generation info
  select jsonb_build_object(
    'id', g.id,
    'status', g.status,
    'progress', g.progress,
    'engine', g.engine,
    'productIdentifier', g.product_identifier,
    'error', g.error,
    'createdAt', g.created_at
  ) into result
  from Generations g
  where g.id = gen_id;

  -- Get total count
  select count(*) into total_count
  from Scripts s
  where s.generation_id = gen_id;

  -- Add counts
  result = result || jsonb_build_object('totalVariations', total_count);

  -- Get paginated variations with scenes
  result = result || jsonb_build_object(
    'variations',
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', 'var_' || lpad(s.idx::text, 3, '0'),
          'theme', s.theme,
          'scenes', (
            select jsonb_agg(
              jsonb_build_object(
                'struktur', sc.struktur,
                'naskah_vo', sc.naskah_vo,
                'visual_idea', sc.visual_idea,
                'text_to_image', sc.text_to_image,
                'image_to_video', sc.image_to_video
              ) order by sc."order"
            )
            from Scenes sc
            where sc.script_id = s.id
          )
        )
      )
      from (
        select * from Scripts
        where generation_id = gen_id
        order by idx
        limit page_size
        offset (page_num - 1) * page_size
      ) s
    )
  );

  return result;
end;
$$;

