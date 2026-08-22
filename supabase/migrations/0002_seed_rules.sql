-- 프로필 속성 -> topic 가중치 초기값.
-- 튜닝은 코드 배포 없이 이 테이블을 갱신해서 한다.
insert into profile_rules (attribute, value, topic, weight) values
  -- 직업 분야
  ('job_field', 'it',            'tech',       3),
  ('job_field', 'it',            'ai',         3),
  ('job_field', 'it',            'career',     1),
  ('job_field', 'finance',       'finance',    3),
  ('job_field', 'finance',       'economy',    3),
  ('job_field', 'finance',       'policy',     1),
  ('job_field', 'medical',       'health',     3),
  ('job_field', 'medical',       'policy',     1),
  ('job_field', 'edu',           'parenting',  3),
  ('job_field', 'edu',           'policy',     2),
  ('job_field', 'public',        'policy',     3),
  ('job_field', 'public',        'economy',    1),
  ('job_field', 'manufacturing', 'economy',    2),
  ('job_field', 'manufacturing', 'world',      2),
  ('job_field', 'service',       'living',     2),
  ('job_field', 'service',       'economy',    1),
  ('job_field', 'etc',           'living',     1),

  -- 연령대
  ('age_band',  '20s',           'career',     2),
  ('age_band',  '20s',           'culture',    2),
  ('age_band',  '30s',           'finance',    2),
  ('age_band',  '30s',           'realestate', 2),
  ('age_band',  '40s',           'realestate', 2),
  ('age_band',  '40s',           'health',     1),
  ('age_band',  '50s+',          'health',     3),
  ('age_band',  '50s+',          'policy',     1),

  -- 가구 형태
  ('household', 'single',        'living',     2),
  ('household', 'single',        'culture',    1),
  ('household', 'married',       'realestate', 2),
  ('household', 'married',       'finance',    1),
  ('household', 'with_kids',     'parenting',  3),
  ('household', 'with_kids',     'health',     1);
