# CONES Kanban 작업 기록

## 목표

Supabase 프로젝트 ismhrkrkbvlbsxmwhvzb의 DB를 실제 GitHub Projects Board처럼 표시한다. 기존 joo 브랜치의 문서나 데이터는 사용하지 않고 main에서 새로 시작했다.

## 확인한 원본

- Project: CONES
- Repository: seune-h0203/cones
- GitHub Project: 3
- Status: Todo, In Progress, Done
- Tasks: 19개
- Users: 4명
- Task assignee 관계: 26개
- Milestone: CONES — FINAL SUBMISSION

보드와 상세 조회에 projects, statuses, tasks, users, milestones, task_assignees, issue_details, issue_comments, issue_timeline_events, project_status_history, timeline_collection_requests를 사용한다. Issue state(open/closed)와 Project status는 서로 다른 값이므로 카드에 모두 표시한다.

## 기존 구현 범위

- GitHub Projects와 유사한 어두운 상단 바, 프로젝트 헤더, Board/Table/Roadmap 탭
- Todo / In Progress / Done 3개 컬럼
- Issue 제목, 번호, open/closed 상태, milestone, 담당자 아바타
- 검색 단축키 /, 제목/번호 정렬, 담당자 필터, issue state 필터
- 카드 상세 모달과 원본 GitHub Issue 링크
- 카드 제목을 눌렀을 때 내부에서 열리는 GitHub Issue 스타일 상세 화면
- 카드 drag and drop
- live Supabase 조회와 snapshot fallback
- 드래그 이동 후 API PATCH. Codex 업무는 공개 보드 정책으로 저장하고, GitHub task는 로그인된 이메일 allowlist 편집자만 `status_id`를 수정하도록 Auth/RLS 연결을 추가했다.

## 데이터 연결

`config.js`는 CONES 프로젝트 `ismhrkrkbvlbsxmwhvzb` URL과 publishable key를 사용한다. publishable key는 브라우저에 노출 가능한 키이며 service_role/secret key는 프런트엔드나 저장소에 두지 않는다. 2026-10-15 기준 프로젝트가 `ACTIVE_HEALTHY`로 복구된 것을 확인했다.

실제 DB에서 프로젝트 1개, 상태 3개, task 19개, 사용자 4명, 담당자 관계 26개, milestone 1개를 확인했다. 상세 테이블에는 issue_details 19개, issue_comments 15개, issue_timeline_events 194개, project_status_history 40개, timeline_collection_requests 19개가 있다. 브라우저에서 API 조회가 실패하면 data.json 스냅샷을 사용한다.

DB의 기존 public 테이블은 RLS가 켜져 있고 anon/authenticated에는 읽기 정책이 있다. GitHub task 상태 업데이트는 Supabase Auth JWT와 `task_status_editors` 이메일 allowlist를 거치며, 권한은 `status_id` 컬럼에만 준다.

## 보안 메모

`codex_work_items`는 공개 팀 보드 정책으로 anon/authenticated 읽기·쓰기 권한을 받았다. `tasks` 변경은 신규 migration의 이메일 allowlist와 status_id 컬럼 권한으로 제한한다. allowlist에는 관리자가 등록한 이메일만 넣어야 한다.

비공개 팀 운영이 필요하면 사용자 인증·팀 멤버십 기준을 정하고 `codex_work_items` 정책을 제한해야 한다.

## asps-5 백엔드 및 Codex 업무

- `assignment.md`에 과제 범위와 완료 기준을 기록했다.
- `server.mjs`가 같은 출처의 웹/API 서버로 보드 조회와 상태 수정을 제공한다.
- `cli.mjs`가 보드 조회, Codex 업무 등록, 상태 변경을 제공한다.
- `codex_work_items` 마이그레이션과 `.agents/skills/codex-kanban/SKILL.md`를 추가했다.
- 기존 UI에 Codex 업무 카드를 포함한다. API는 실제 CONES 보드 테이블과 Codex 업무 테이블을 조회한다.
- `codex_work_items` migration을 CONES DB에 적용했다.
- `npm run cli -- list`와 `GET /api/board`로 기존 GitHub task 19개를 읽었다.
- CLI로 `codex:1` 업무를 생성하고 `In Progress` → `Done`으로 변경했다. API GET 및 SQL 조회에서 최종 상태 `Done`을 확인했다.
- 웹에서 Supabase Auth 매직 링크 로그인을 구현했고, 기존 task 상태 PATCH에 사용자 JWT를 전달한다. CLI는 `SUPABASE_ACCESS_TOKEN`으로 같은 인증 경로를 사용한다.
- 새 migration은 만들었지만 현재 연결된 Supabase MCP 계정에는 `ismhrkrkbvlbsxmwhvzb` 프로젝트 접근 권한이 없어 원격 적용과 이메일 allowlist 등록은 남아 있다.

## 체크리스트

- [x] 새 Supabase 프로젝트 ref로 원본 스키마 조회
- [x] 실제 데이터 19개 task 확인
- [x] main에서 정적 Board 구현
- [x] live REST / snapshot fallback 구현
- [x] 검색, 필터, 정렬, 모달, drag and drop
- [ ] Auth/RLS 기반 운영 보안 모델
- [x] 공유 DB 복구 후 연결 및 실제 스키마 확인
- [x] codex_work_items 원격 마이그레이션 및 CLI/API 공유 등록
- [x] 웹/CLI Auth JWT 전달, 이메일 allowlist RLS 및 status_id 전용 쓰기 migration 작성
- [ ] CONES DB에 신규 migration 적용, redirect URL 설정, 허용 편집자 이메일 등록
- [ ] Table/Roadmap 실제 뷰
