# 과제: Codex와 공유하는 CONES Kanban 백엔드

## 목표

`asps-3`의 CONES 칸반 보드를 기반으로 팀원이 같은 작업 상태를 보고 갱신할 수 있는 백엔드와 CLI를 만든다. Codex가 수행한 작업도 실제 공유 보드에 기록한다.

## 요구사항

- 기존 `asps-3` 파일 전체를 가져온다.
- 기존 Supabase `projects`, `statuses`, `tasks` 데이터는 유지한다. GitHub Issue와 Codex 업무를 구분한다.
- `codex_work_items` 테이블을 추가하고 제목, 설명, 보드 상태, 생성·갱신 시각을 저장한다.
- 백엔드는 보드 조회, 업무 등록, 상태 변경 API를 제공한다.
- CLI는 보드 조회, Codex 업무 등록, 상태 변경을 지원한다.
- 웹 보드에서 Codex 업무를 기존 상태 컬럼에 표시하고 드래그한 상태를 저장한다.
- Codex 프로젝트 스킬을 추가해 완료된 작업을 공유 보드에 등록하는 절차를 안내한다.

## 확인 기준

- `npm run dev`가 로컬 웹 보드와 API를 함께 실행한다.
- `npm run cli -- list`가 보드 업무를 출력한다.
- `npm run cli -- add "작업 제목" --status "Todo" --description "작업 요약"`가 Codex 업무를 저장한다.
- 상태 변경이 API를 거쳐 Supabase에 반영되고 웹 보드에 보인다.
- 서비스 키를 프런트엔드나 저장소에 추가하지 않는다.

## 구현 메모

기존 `tasks` 행은 GitHub Issue를 나타내므로 임의의 Issue 번호를 만들어 넣지 않는다. Codex 업무는 별도 테이블로 저장하고, 기존 `statuses`의 상태 이름과 연결한다. 현재 보드는 공개 GitHub Project에 대응하므로 Codex 업무도 공개 팀 보드 정책을 따른다.

## 진행 현황

- [x] `asps-3` 소스 파일을 가져오고 기존 CONES 보드 스냅샷을 유지했다.
- [x] 로컬 보드/API 서버, Codex 업무 API, CLI를 구현했다.
- [x] 웹 보드에 Codex 업무 카드와 상태 저장을 연결했다.
- [x] `codex_work_items` 마이그레이션과 Codex 작업 등록 스킬을 추가했다.
- [x] CONES DB(`ismhrkrkbvlbsxmwhvzb`) 연결과 마이그레이션 적용을 확인했다.
- [x] CLI/API로 기존 이슈 19개를 조회하고 Codex 업무 `codex:1`을 공유 보드에 등록했다.
- [x] Codex 업무 상태를 CLI로 변경하고 API/DB에서 `Done` 저장을 확인했다.
- [x] 웹 로그인, JWT 전달, CLI token 전달, 이메일 allowlist와 status_id 전용 RLS migration을 구현했다.
- [ ] 신규 migration을 CONES DB에 적용하고 Auth redirect URL 및 편집자 이메일을 설정한다.

기존 GitHub Issue 테이블의 RLS/권한은 유지했다. Codex 업무 테이블은 공개 팀 보드 정책으로 anon 읽기·쓰기를 허용하므로 비공개 내용을 등록하지 않는다.
