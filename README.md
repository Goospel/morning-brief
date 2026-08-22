# 나만의정보

나이·성별·가구 형태·직업 분야에 맞춰 **매일 아침 한 번** 정보 브리핑을 배달하는 [앱인토스](https://developers-apps-in-toss.toss.im/) 미니앱.

정보는 넘치는데 나에게 맞는 건 찾기 어렵다. 특히 해외 매체는 접근 자체가 번거롭다. 그래서 국내 뉴스와 해외 영문 매체를 같이 모아 **한글 요약 + 원문 링크** 카드로 만들어, 아침에 우유 배달하듯 푸시로 보낸다. 무한 스크롤이 아니라 다 보면 끝나는 묶음이다.

## 문서

| 문서 | 무엇이 있나 |
|---|---|
| [plan.md](plan.md) | 앞으로 할 일 — 구축 순서와 진행 상태 |
| [changeLog.md](changeLog.md) | 완료 기록 — 무엇을 왜 했나 (역순) |
| [claude-docs/troubleshooting.md](claude-docs/troubleshooting.md) | 함정 모음 — 증상/원인/해결/재발방지 |
| [설계 스펙](docs/superpowers/specs/2026-08-22-personal-briefing-design.md) | 아키텍처·데이터 모델·점수 규칙 |

## 구조 (예정)

```
Supabase Cron          앱인토스 WebView 미니앱
  03:00 수집             Vite + React + TS + TDS
  04:00 요약             온보딩 / 오늘의 브리핑 / 설정
  매시  배달·푸시         briefings 를 읽기만 한다
```

요약은 기사당 정확히 1회만 수행해 모든 사용자가 공유한다 — AI 비용이 사용자 수와 무관하고 수집 기사 수에만 비례한다.

## 개발 셋업

clone 후 1회:

```bash
git config core.hooksPath .githooks
```

pre-commit 훅이 troubleshooting 목차의 stale·형식 오류를 검사한다(목차는 자동 생성이므로 직접 편집하지 않는다).
