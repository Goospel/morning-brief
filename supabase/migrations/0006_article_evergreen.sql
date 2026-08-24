-- 시의성이 없어 오래 살아도 되는 글. 요약 잡이 기사 단위로 판정한다.
-- NULL 허용에 기본값 없음 — 기존 행은 false 가 아니라 「판정된 적 없음」이다.
-- 코드가 `?? false` 로 읽어 기존 동작을 그대로 유지한다.
-- 인덱스 불필요(30일치 9천 건 규모라 순차 스캔이 인덱스 유지비보다 싸다).
-- GRANT 불필요(0001 의 테이블 단위 GRANT 가 새 컬럼을 포함한다).
alter table articles add column evergreen boolean;
