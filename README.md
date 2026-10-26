# CONES Kanban

Supabase에 있는 CONES GitHub Project와 팀 Codex 업무를 한 보드에서 보여줍니다.

## 실행

Node.js 18 이상에서 실행합니다.

    npm run dev

브라우저에서 http://127.0.0.1:4173 을 엽니다. 서버는 기존 `config.js`의 publishable key를 사용하며, 다른 환경은 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `PORT`로 설정할 수 있습니다.

## CLI

보드와 Codex 업무를 조회합니다.

    npm run cli -- list

Codex 업무를 추가하거나 상태를 바꿉니다.

    npm run cli -- add "Codex 작업 제목" --status "In Progress" --description "작업 요약"
    npm run cli -- move codex:1 "Done"
    npm run cli -- move task:1 "Done"

CLI는 같은 출처의 백엔드 API를 호출합니다. `KANBAN_API_URL`로 API 주소를 바꿀 수 있습니다. GitHub task 상태 변경에는 `SUPABASE_ACCESS_TOKEN`에 편집 권한이 있는 Supabase Auth access token을 설정해야 합니다. `list` 출력의 `task:<id>` 값을 사용합니다.

## 웹에서 팀 업무 공유

보드 각 상태 컬럼의 `Add item`을 눌러 제목, 설명, 상태를 입력하면 `codex_work_items`에 저장되고 모든 팀원이 같은 보드에서 볼 수 있습니다. 카드는 `CONES #<id>`로 표시되며 드래그로 상태를 바꿀 수 있습니다. 공유 웹 항목은 누구나 삭제할 수 있습니다.

웹에서 로그인한 뒤 브라우저 개발자 콘솔에서 `JSON.parse(sessionStorage.getItem("cones-board-auth")).access_token`으로 현재 access token을 확인할 수 있습니다. 터미널에서 `export SUPABASE_ACCESS_TOKEN='토큰'`으로 설정하세요. 토큰은 만료되는 bearer 자격 증명이므로 공유하거나 저장소에 넣지 마세요.

## API

- `GET /api/board`: GitHub Project 데이터와 Codex 업무 조회
- `POST /api/work-items`: `{ "title": "...", "description": "...", "status_name": "Todo" }`
- `PATCH /api/work-items/:id`: `{ "status_name": "Done" }`
- `DELETE /api/work-items/:id`: 공유 웹 항목 삭제 (공개)
- `PATCH /api/tasks/:id/status`: `{ "status_id": 2 }` (편집자 allowlist에 등록된 Supabase Auth 사용자의 JWT 필요)

CLI에서 Codex 업무 ID는 `codex:<id>`로, 기존 GitHub task ID는 `task:<id>`로 표시합니다. 웹 로그인 계정은 Supabase Auth에 먼저 등록해야 합니다. Auth URL 설정의 허용 redirect 목록에 보드 주소(예: `http://127.0.0.1:4173/**`)도 추가합니다.

`supabase/migrations/20261019031218_allow_authenticated_github_task_status_updates.sql`을 적용한 뒤 DB 관리자가 허용할 이메일을 `public.task_status_editors`에 추가해야 합니다. 예: `insert into public.task_status_editors (email) values ('member@example.com');`. 로그인 사용자는 등록된 이메일과 일치해야 하고, `tasks.status_id`만 수정할 수 있습니다. 공유 업무 삭제에는 `supabase/migrations/20261026133616_allow_editor_delete_codex_work_items.sql`을 적용합니다.

`supabase/migrations/20261015051134_codex_work_items.sql`은 CONES DB에 적용했습니다. Codex 업무는 기존 `tasks`와 분리해 저장하고 기존 상태 컬럼에 표시합니다. 공개 팀 보드 정책에 따라 Codex 업무 테이블은 `anon` 읽기·쓰기를 허용합니다.

`data.json`은 Supabase 연결이 실패할 때 보드 화면에 쓰는 읽기 전용 스냅샷입니다. 스냅샷 모드에서는 상태 변경과 Codex 업무 등록이 저장되지 않습니다.
