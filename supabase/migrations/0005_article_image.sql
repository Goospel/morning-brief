-- 기사 썸네일 URL. RSS 파싱으로 채우고, 비면 collect 잡이 원문 og:image 로 백필한다.
-- 인덱스 불필요(백필 대상은 그 실행에서 새로 들어온 id 목록으로 잡는다).
-- GRANT 불필요(0001 의 테이블 단위 GRANT 가 새 컬럼을 포함한다).
alter table articles add column image_url text;
